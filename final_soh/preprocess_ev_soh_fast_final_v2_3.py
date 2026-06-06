#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fast preprocessing for BatICM on-road EV charging CSVs.
For personalized FL-based SOH prediction.

Key points:
- One CSV (#1.csv ... #20.csv) = one vehicle/client.
- SOH label is based on current integration / delta SOC, not BMS available_capacity.
- BMS available_capacity is diagnostic only, because it can show reset/recalibration jumps.
- Sudden artifacts are handled by session filtering + causal Hampel filtering.
- No centered smoothing, no full-series top-3% C_ref, no cycle-index feature.
- Default: lookback=20, horizon=3.
  X_i = sessions[i : i+20]
  y_i = SOH[i+20 : i+23]
  This is “current prediction point + next 2 sessions” after the input window.

Run:
  python preprocess_ev_soh_fast_final.py --raw_dir ./data --out_dir ./processed_ev_soh

Outputs:
  processed_ev_soh/preprocess_summary.csv
  processed_ev_soh/preprocess_config.json
  processed_ev_soh/global_scaler.json
  processed_ev_soh/client_01.npz ...
  processed_ev_soh/client_01_sessions.csv ...
"""

from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd


@dataclass
class PreprocessConfig:
    raw_dir: str = "./data"
    out_dir: str = "./processed_ev_soh_v2_3_min5_purge_meta"
    file_pattern: str = "#*.csv"
    seq_len: int = 128
    lookback: int = 20
    horizon: int = 3
    session_gap_seconds: float = 10.0
    min_session_len: int = 100
    min_delta_soc: float = 5.0
    max_soc_jump: float = 2.0
    max_soc_drop: float = -0.1
    max_current_nan_ratio: float = 0.10
    capacity_min_ah: float = 50.0
    capacity_max_ah: float = 200.0
    ref_train_sessions: int = 50
    soh_smooth_window: int = 50
    outlier_window: int = 25
    outlier_abs_ah: float = 10.0
    outlier_rel: float = 0.12
    train_frac: float = 0.70
    val_frac: float = 0.10
    soh_clip_min: float = 0.0
    soh_clip_max: float = 120.0
    compressed: bool = False
    purged_split: bool = True
    append_meta_to_sequence: bool = False
    overwrite: bool = False


FEATURE_NAMES = [
    "soc",
    "pack_voltage",
    "charge_current",
    "max_cell_voltage",
    "min_cell_voltage",
    "mean_temperature",
    "cell_voltage_gap",
    "temperature_gap",
]

PREPROCESSING_VERSION = "v2_3_min5_purge_meta"
DEFAULT_V1_OUT_DIR = Path("processed_ev_soh")

SESSION_META_FEATURE_NAMES = [
    "delta_soc",
    "charge_throughput_ah",
    "duration_min",
    "n_samples",
    "mean_current",
    "max_current",
    "mean_pack_voltage",
    "mean_temperature",
    "max_temperature",
    "mean_cell_voltage_gap",
    "max_cell_voltage_gap",
    "mean_temperature_gap",
    "max_temperature_gap",
]

REQUIRED_COLUMNS = [
    "record_time",
    "soc",
    "pack_voltage",
    "charge_current",
    "max_cell_voltage",
    "min_cell_voltage",
    "max_temperature",
    "min_temperature",
]


def natural_vehicle_key(path: Path) -> Tuple[int, str]:
    m = re.search(r"#?(\d+)", path.stem)
    return (int(m.group(1)), path.stem) if m else (10**9, path.stem)


def canonicalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for c in list(df.columns):
        if str(c).startswith("Unnamed") or str(c).lower() in {"number", "index"}:
            df = df.drop(columns=[c])

    rename = {}
    for c in df.columns:
        clean = str(c).strip().replace("℃", "C")
        low = clean.lower()
        if low == "record_time":
            rename[c] = "record_time"
        elif low == "soc":
            rename[c] = "soc"
        elif "pack_voltage" in low:
            rename[c] = "pack_voltage"
        elif "charge_current" in low:
            rename[c] = "charge_current"
        elif "max_cell_voltage" in low:
            rename[c] = "max_cell_voltage"
        elif "min_cell_voltage" in low:
            rename[c] = "min_cell_voltage"
        elif "max_temperature" in low:
            rename[c] = "max_temperature"
        elif "min_temperature" in low:
            rename[c] = "min_temperature"
        elif "available_energy" in low:
            rename[c] = "available_energy"
        elif "available_capacity" in low:
            rename[c] = "available_capacity"
        else:
            rename[c] = clean
    df = df.rename(columns=rename)

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}. Found columns: {list(df.columns)}")

    df["record_time"] = pd.to_datetime(
        df["record_time"].astype(str), format="%Y%m%d%H%M%S", errors="coerce"
    )
    df = df.dropna(subset=["record_time"]).sort_values("record_time").reset_index(drop=True)

    for c in df.columns:
        if c != "record_time":
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def fill_nan_1d(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float64)
    if not np.isnan(x).any():
        return x
    idx = np.arange(len(x))
    good = np.isfinite(x)
    if good.sum() == 0:
        return np.zeros_like(x, dtype=np.float64)
    if good.sum() == 1:
        return np.full_like(x, x[good][0], dtype=np.float64)
    return np.interp(idx, idx[good], x[good])


def interp_col(x: np.ndarray, new_grid: np.ndarray) -> np.ndarray:
    x = fill_nan_1d(x)
    old_grid = np.linspace(0.0, 1.0, len(x), dtype=np.float64)
    return np.interp(new_grid, old_grid, x).astype(np.float32)


def build_session_feature_matrix(arrs: Dict[str, np.ndarray], sl: slice, seq_len: int) -> np.ndarray:
    new_grid = np.linspace(0.0, 1.0, seq_len, dtype=np.float64)
    soc = arrs["soc"][sl]
    pack_v = arrs["pack_voltage"][sl]
    cur = arrs["charge_current"][sl]
    max_cv = arrs["max_cell_voltage"][sl]
    min_cv = arrs["min_cell_voltage"][sl]
    max_t = arrs["max_temperature"][sl]
    min_t = arrs["min_temperature"][sl]
    mean_t = (max_t + min_t) / 2.0
    cell_gap = max_cv - min_cv
    temp_gap = max_t - min_t
    cols = [soc, pack_v, cur, max_cv, min_cv, mean_t, cell_gap, temp_gap]
    out = np.empty((seq_len, len(cols)), dtype=np.float32)
    for j, col in enumerate(cols):
        out[:, j] = interp_col(col, new_grid)
    return out


def build_session_metadata(arrs: Dict[str, np.ndarray], start: int, end: int,
                           delta_soc: float, q_ah: float) -> np.ndarray:
    """세션 내부에서 관측된 값만 사용해 세션 단위 메타데이터를 만든다."""
    soc = arrs["soc"][start:end]
    current = fill_nan_1d(arrs["charge_current"][start:end])
    pack_v = fill_nan_1d(arrs["pack_voltage"][start:end])
    max_t = fill_nan_1d(arrs["max_temperature"][start:end])
    min_t = fill_nan_1d(arrs["min_temperature"][start:end])
    max_cv = fill_nan_1d(arrs["max_cell_voltage"][start:end])
    min_cv = fill_nan_1d(arrs["min_cell_voltage"][start:end])
    mean_t = (max_t + min_t) / 2.0
    cell_gap = max_cv - min_cv
    temp_gap = max_t - min_t
    duration_min = float((arrs["time_ns"][end - 1] - arrs["time_ns"][start]) / 1e9 / 60.0)
    values = [
        float(delta_soc),
        float(q_ah),
        duration_min,
        float(end - start),
        float(np.nanmean(current)),
        float(np.nanmax(current)),
        float(np.nanmean(pack_v)),
        float(np.nanmean(mean_t)),
        float(np.nanmax(max_t)),
        float(np.nanmean(cell_gap)),
        float(np.nanmax(cell_gap)),
        float(np.nanmean(temp_gap)),
        float(np.nanmax(temp_gap)),
    ]
    return np.asarray(values, dtype=np.float32)


def capacity_from_slice(arrs: Dict[str, np.ndarray], start: int, end: int) -> Tuple[float, float, float]:
    soc = arrs["soc"][start:end]
    current = fill_nan_1d(arrs["charge_current"][start:end])
    t_sec = (arrs["time_ns"][start:end] - arrs["time_ns"][start]) / 1e9
    delta_soc = float(soc[-1] - soc[0])
    if delta_soc <= 0:
        return np.nan, np.nan, delta_soc
    integral = np.trapezoid(current, t_sec) if hasattr(np, "trapezoid") else np.trapz(current, t_sec)
    q_ah = -float(integral) / 3600.0
    if q_ah <= 0:
        q_ah = abs(float(integral) / 3600.0)
    capacity_ah = q_ah / (delta_soc / 100.0)
    return float(capacity_ah), float(q_ah), float(delta_soc)


def causal_spike_replace(values: np.ndarray, window: int, abs_ah: float, rel: float) -> Tuple[np.ndarray, np.ndarray]:
    """Replace only large isolated capacity jumps using past values only.

    This is intentionally less aggressive than a pure MAD/Hampel filter because
    real EV charging data can have gradual apparent-capacity variation. A point is
    replaced only when it is far from the trailing median in both absolute and
    relative terms.
    """
    values = np.asarray(values, dtype=np.float64)
    cleaned = values.copy()
    flags = np.zeros(len(values), dtype=bool)
    for i in range(len(values)):
        start = max(0, i - window)
        hist = cleaned[start:i]
        hist = hist[np.isfinite(hist)]
        if len(hist) < 8 or not np.isfinite(values[i]):
            continue
        med = float(np.median(hist))
        threshold = max(abs_ah, abs(med) * rel)
        if abs(values[i] - med) > threshold:
            cleaned[i] = med
            flags[i] = True
    return cleaned, flags


def trailing_median(values: np.ndarray, window: int) -> np.ndarray:
    return (
        pd.Series(values, dtype="float64")
        .rolling(window=window, min_periods=1, center=False)
        .median()
        .to_numpy(dtype=np.float64)
    )


def make_windows(n_sessions: int, lookback: int, horizon: int, train_frac: float, val_frac: float):
    input_starts, target_starts, splits = [], [], []
    if n_sessions < lookback + horizon:
        return np.array([], dtype=np.int64), np.array([], dtype=np.int64), np.array([], dtype=np.int64)
    train_end = int(math.floor(train_frac * n_sessions))
    val_end = int(math.floor((train_frac + val_frac) * n_sessions))
    for input_start in range(0, n_sessions - lookback - horizon + 1):
        target_start = input_start + lookback
        target_end = target_start + horizon - 1
        if target_end < train_end:
            split = 0
        elif target_start >= train_end and target_end < val_end:
            split = 1
        elif target_start >= val_end:
            split = 2
        else:
            continue
        input_starts.append(input_start)
        target_starts.append(target_start)
        splits.append(split)
    return np.asarray(input_starts, dtype=np.int64), np.asarray(target_starts, dtype=np.int64), np.asarray(splits, dtype=np.int64)


def make_windows_purged(n_sessions: int, lookback: int, horizon: int, train_frac: float, val_frac: float):
    """경계 주변 window를 제거해 split 간 input session 공유를 막는다."""
    input_starts, target_starts, splits = [], [], []
    if n_sessions < lookback + horizon:
        return np.array([], dtype=np.int64), np.array([], dtype=np.int64), np.array([], dtype=np.int64)
    train_end = int(math.floor(train_frac * n_sessions))
    val_end = int(math.floor((train_frac + val_frac) * n_sessions))
    purge_gap = lookback + horizon - 1
    val_input_start_min = train_end + purge_gap
    test_input_start_min = val_end + purge_gap
    for input_start in range(0, n_sessions - lookback - horizon + 1):
        target_start = input_start + lookback
        target_end = target_start + horizon - 1
        if target_end < train_end:
            split = 0
        elif input_start >= val_input_start_min and target_end < val_end:
            split = 1
        elif input_start >= test_input_start_min:
            split = 2
        else:
            continue
        input_starts.append(input_start)
        target_starts.append(target_start)
        splits.append(split)
    return np.asarray(input_starts, dtype=np.int64), np.asarray(target_starts, dtype=np.int64), np.asarray(splits, dtype=np.int64)


def assert_purged_split(input_starts: np.ndarray, target_starts: np.ndarray, splits: np.ndarray,
                        lookback: int, horizon: int) -> None:
    """split 간 target/input session 공유가 없는지 검사한다."""
    input_sets, target_sets = {}, {}
    for code in [0, 1, 2]:
        in_sessions, tgt_sessions = set(), set()
        for s, t in zip(input_starts[splits == code], target_starts[splits == code]):
            in_sessions.update(range(int(s), int(s) + lookback))
            tgt_sessions.update(range(int(t), int(t) + horizon))
        input_sets[code] = in_sessions
        target_sets[code] = tgt_sessions
    for a, b in [(0, 1), (1, 2), (0, 2)]:
        if input_sets[a] & input_sets[b]:
            raise AssertionError(f"Purged split failed: input sessions overlap between split {a} and {b}")
        if target_sets[a] & target_sets[b]:
            raise AssertionError(f"Purged split failed: target sessions overlap between split {a} and {b}")


def process_one_client(csv_path: Path, cfg: PreprocessConfig) -> Dict[str, object]:
    vehicle_num, _ = natural_vehicle_key(csv_path)
    client_id = str(vehicle_num)

    raw_df = pd.read_csv(csv_path)
    raw_rows = len(raw_df)
    df = canonicalize_columns(raw_df)

    arrs = {c: df[c].to_numpy(dtype=np.float64) for c in df.columns if c != "record_time"}
    arrs["time_ns"] = df["record_time"].astype("int64").to_numpy(dtype=np.float64)

    dt_sec = np.diff(arrs["time_ns"]) / 1e9
    starts = np.r_[0, np.where(dt_sec > cfg.session_gap_seconds)[0] + 1]
    ends = np.r_[starts[1:], len(df)]
    n_raw_sessions = len(starts)

    session_features: List[np.ndarray] = []
    session_meta: List[np.ndarray] = []
    rows: List[Dict[str, object]] = []
    reject_counts = {
        "too_short": 0,
        "soc_invalid": 0,
        "delta_soc_small_or_nonpositive": 0,
        "soc_jump": 0,
        "current_nan_excess": 0,
        "capacity_invalid": 0,
    }

    for sid, (s, e) in enumerate(zip(starts, ends)):
        n = int(e - s)
        if n < cfg.min_session_len:
            reject_counts["too_short"] += 1
            continue

        soc = arrs["soc"][s:e]
        if np.nanmin(soc) < 0 or np.nanmax(soc) > 100:
            reject_counts["soc_invalid"] += 1
            continue
        delta_soc = float(soc[-1] - soc[0])
        if delta_soc < cfg.min_delta_soc:
            reject_counts["delta_soc_small_or_nonpositive"] += 1
            continue

        dsoc = np.diff(soc)
        if np.any(dsoc > cfg.max_soc_jump) or np.any(dsoc < cfg.max_soc_drop):
            reject_counts["soc_jump"] += 1
            continue

        current = arrs["charge_current"][s:e]
        if float(np.isnan(current).mean()) > cfg.max_current_nan_ratio:
            reject_counts["current_nan_excess"] += 1
            continue

        capacity_ah, q_ah, delta_soc = capacity_from_slice(arrs, int(s), int(e))
        if (not np.isfinite(capacity_ah)) or capacity_ah < cfg.capacity_min_ah or capacity_ah > cfg.capacity_max_ah:
            reject_counts["capacity_invalid"] += 1
            continue

        try:
            feat = build_session_feature_matrix(arrs, slice(int(s), int(e)), cfg.seq_len)
            meta = build_session_metadata(arrs, int(s), int(e), float(delta_soc), float(q_ah))
        except Exception:
            reject_counts["capacity_invalid"] += 1
            continue

        # Diagnostic BMS values only; never used as label/input.
        max_soc_local_idx = int(np.nanargmax(soc))
        abs_idx = int(s + max_soc_local_idx)
        bms_cap = np.nan
        bms_energy = np.nan
        bms_full_capacity_proxy = np.nan
        if "available_capacity" in arrs:
            bms_cap = float(arrs["available_capacity"][abs_idx])
            if np.isfinite(bms_cap) and soc[-1] > 1e-6:
                bms_full_capacity_proxy = bms_cap / (soc[-1] / 100.0)
        if "available_energy" in arrs:
            bms_energy = float(arrs["available_energy"][abs_idx])

        t_start = pd.Timestamp(df["record_time"].iloc[int(s)]).isoformat()
        t_end = pd.Timestamp(df["record_time"].iloc[int(e - 1)]).isoformat()
        mean_temp = float(np.nanmean((arrs["max_temperature"][s:e] + arrs["min_temperature"][s:e]) / 2.0))

        session_features.append(feat)
        session_meta.append(meta)
        rows.append({
            "session_id_raw": int(sid),
            "time_start": t_start,
            "time_end": t_end,
            "n_samples": n,
            "soc_start": float(soc[0]),
            "soc_end": float(soc[-1]),
            "delta_soc": float(delta_soc),
            "charge_throughput_ah": float(q_ah),
            "capacity_ah_raw": float(capacity_ah),
            "duration_min": float(meta[2]),
            "bms_available_capacity_at_max_soc": bms_cap,
            "bms_available_energy_at_max_soc": bms_energy,
            "bms_full_capacity_proxy_diag": bms_full_capacity_proxy,
            "mean_current": float(np.nanmean(current)),
            "max_current": float(np.nanmax(fill_nan_1d(current))),
            "mean_temperature": mean_temp,
            "max_temperature": float(np.nanmax(arrs["max_temperature"][s:e])),
        })

    if not session_features:
        raise RuntimeError(f"client {client_id}: no valid sessions after filtering")

    features_raw = np.stack(session_features).astype(np.float32)
    session_meta_arr = np.stack(session_meta).astype(np.float32)
    session_df = pd.DataFrame(rows)
    capacity_raw = session_df["capacity_ah_raw"].to_numpy(dtype=np.float64)

    capacity_clean, capacity_outlier_flags = causal_spike_replace(
        capacity_raw, cfg.outlier_window, cfg.outlier_abs_ah, cfg.outlier_rel
    )
    capacity_smooth = trailing_median(capacity_clean, cfg.soh_smooth_window)

    n_sessions = len(capacity_clean)
    train_end_session = int(math.floor(cfg.train_frac * n_sessions))
    ref_end = min(train_end_session, cfg.ref_train_sessions)
    if ref_end < 5:
        raise RuntimeError(f"client {client_id}: too few valid sessions for C_ref")
    c_ref = float(np.nanmedian(capacity_clean[:ref_end]))
    if not np.isfinite(c_ref) or c_ref <= 0:
        raise RuntimeError(f"client {client_id}: invalid C_ref")

    soh_raw = capacity_raw / c_ref * 100.0
    soh_clean = capacity_clean / c_ref * 100.0
    soh_smooth = trailing_median(soh_clean, cfg.soh_smooth_window)
    soh_smooth = np.clip(soh_smooth, cfg.soh_clip_min, cfg.soh_clip_max)

    # Diagnostic BMS jump flags. Jumps here are NOT used to remove labels by default.
    bms_proxy = session_df["bms_full_capacity_proxy_diag"].to_numpy(dtype=np.float64)
    bms_jump_flag = np.zeros(n_sessions, dtype=bool)
    if np.isfinite(bms_proxy).sum() > 2:
        diff = np.diff(bms_proxy)
        bms_jump_flag[1:] = np.isfinite(diff) & (np.abs(diff) > 10.0)

    if cfg.purged_split:
        input_starts, target_starts, splits = make_windows_purged(
            n_sessions, cfg.lookback, cfg.horizon, cfg.train_frac, cfg.val_frac
        )
        assert_purged_split(input_starts, target_starts, splits, cfg.lookback, cfg.horizon)
    else:
        input_starts, target_starts, splits = make_windows(
            n_sessions, cfg.lookback, cfg.horizon, cfg.train_frac, cfg.val_frac
        )

    session_df["capacity_ah_raw"] = capacity_raw
    session_df["capacity_ah_clean"] = capacity_clean
    session_df["capacity_ah_smooth"] = capacity_smooth
    session_df["capacity_outlier_flag"] = capacity_outlier_flags.astype(int)
    session_df["bms_jump_flag_diag"] = bms_jump_flag.astype(int)
    session_df["soh_raw_percent"] = soh_raw
    session_df["soh_clean_percent"] = soh_clean
    session_df["soh_smooth_percent"] = soh_smooth

    return {
        "client_id": client_id,
        "csv_path": str(csv_path),
        "raw_rows": raw_rows,
        "n_raw_sessions": n_raw_sessions,
        "features_raw": features_raw,
        "session_meta": session_meta_arr,
        "session_df": session_df,
        "capacity_raw": capacity_raw.astype(np.float32),
        "capacity_clean": capacity_clean.astype(np.float32),
        "capacity_smooth": capacity_smooth.astype(np.float32),
        "soh_raw": soh_raw.astype(np.float32),
        "soh_clean": soh_clean.astype(np.float32),
        "soh_smooth": soh_smooth.astype(np.float32),
        "input_starts": input_starts,
        "target_starts": target_starts,
        "splits": splits,
        "c_ref": c_ref,
        "reject_counts": reject_counts,
    }


def compute_global_scaler(client_results: List[Dict[str, object]], cfg: PreprocessConfig) -> Tuple[np.ndarray, np.ndarray]:
    n_features = len(FEATURE_NAMES)
    total_sum = np.zeros(n_features, dtype=np.float64)
    total_sumsq = np.zeros(n_features, dtype=np.float64)
    total_count = 0
    for res in client_results:
        feat = res["features_raw"]
        train_end = int(math.floor(cfg.train_frac * feat.shape[0]))
        train_feat = feat[:train_end].astype(np.float64)
        total_sum += train_feat.sum(axis=(0, 1))
        total_sumsq += np.square(train_feat).sum(axis=(0, 1))
        total_count += train_feat.shape[0] * train_feat.shape[1]
    mean = total_sum / max(total_count, 1)
    var = total_sumsq / max(total_count, 1) - mean**2
    std = np.sqrt(np.maximum(var, 1e-12))
    std[std < 1e-6] = 1.0
    return mean.astype(np.float32), std.astype(np.float32)


def compute_global_meta_scaler(client_results: List[Dict[str, object]], cfg: PreprocessConfig) -> Tuple[np.ndarray, np.ndarray]:
    n_features = len(SESSION_META_FEATURE_NAMES)
    total_sum = np.zeros(n_features, dtype=np.float64)
    total_sumsq = np.zeros(n_features, dtype=np.float64)
    total_count = 0
    for res in client_results:
        meta = res["session_meta"].astype(np.float64)
        train_end = int(math.floor(cfg.train_frac * meta.shape[0]))
        train_meta = meta[:train_end]
        total_sum += train_meta.sum(axis=0)
        total_sumsq += np.square(train_meta).sum(axis=0)
        total_count += train_meta.shape[0]
    mean = total_sum / max(total_count, 1)
    var = total_sumsq / max(total_count, 1) - mean**2
    std = np.sqrt(np.maximum(var, 1e-12))
    std[std < 1e-6] = 1.0
    return mean.astype(np.float32), std.astype(np.float32)


def save_client_result(res: Dict[str, object], mean: np.ndarray, std: np.ndarray,
                       meta_mean: np.ndarray, meta_std: np.ndarray,
                       cfg: PreprocessConfig, out_dir: Path) -> Dict[str, object]:
    client_id = str(res["client_id"])
    features = ((res["features_raw"] - mean.reshape(1, 1, -1)) / std.reshape(1, 1, -1)).astype(np.float32)
    session_meta = res["session_meta"].astype(np.float32)
    session_meta_scaled = ((session_meta - meta_mean.reshape(1, -1)) / meta_std.reshape(1, -1)).astype(np.float32)
    soh = res["soh_smooth"].astype(np.float32)
    input_starts = res["input_starts"].astype(np.int64)
    target_starts = res["target_starts"].astype(np.int64)
    splits = res["splits"].astype(np.int64)
    purge_gap = int(cfg.lookback + cfg.horizon - 1) if cfg.purged_split else 0
    original_feature_dim = int(features.shape[-1])
    meta_dim = int(session_meta_scaled.shape[-1])
    feature_names = np.asarray(FEATURE_NAMES)
    feature_names_v2 = np.asarray(FEATURE_NAMES + SESSION_META_FEATURE_NAMES)
    sessions_to_save = features
    if cfg.append_meta_to_sequence:
        repeated_meta = np.repeat(session_meta_scaled[:, None, :], cfg.seq_len, axis=1)
        sessions_to_save = np.concatenate([features, repeated_meta], axis=-1).astype(np.float32)
        feature_names = feature_names_v2

    if session_meta.shape[0] != features.shape[0]:
        raise AssertionError(f"client {client_id}: session_meta rows do not match sessions")

    client_file = out_dir / f"client_{int(client_id):02d}.npz"
    save_fn = np.savez_compressed if cfg.compressed else np.savez
    save_fn(
        client_file,
        sessions=sessions_to_save,
        soh=soh,
        soh_raw=res["soh_raw"].astype(np.float32),
        soh_clean=res["soh_clean"].astype(np.float32),
        soh_smooth=res["soh_smooth"].astype(np.float32),
        capacity_raw=res["capacity_raw"].astype(np.float32),
        capacity_clean=res["capacity_clean"].astype(np.float32),
        capacity_smooth=res["capacity_smooth"].astype(np.float32),
        capacity_ah=res["capacity_clean"].astype(np.float32),
        input_starts=input_starts,
        target_starts=target_starts,
        splits=splits,
        feature_names=feature_names,
        session_meta=session_meta,
        session_meta_scaled=session_meta_scaled,
        session_meta_feature_names=np.asarray(SESSION_META_FEATURE_NAMES),
        session_meta_mean=meta_mean,
        session_meta_std=meta_std,
        scaler_mean=mean,
        scaler_std=std,
        client_id=np.asarray(client_id),
        lookback=np.asarray(cfg.lookback, dtype=np.int64),
        horizon=np.asarray(cfg.horizon, dtype=np.int64),
        split_strategy=np.asarray("purged_time_split" if cfg.purged_split else "time_split"),
        purge_gap=np.asarray(purge_gap, dtype=np.int64),
        min_delta_soc=np.asarray(cfg.min_delta_soc, dtype=np.float32),
        preprocessing_version=np.asarray(PREPROCESSING_VERSION),
        train_ratio=np.asarray(cfg.train_frac, dtype=np.float32),
        val_ratio=np.asarray(cfg.val_frac, dtype=np.float32),
        test_ratio=np.asarray(1.0 - cfg.train_frac - cfg.val_frac, dtype=np.float32),
        appended_metadata=np.asarray(bool(cfg.append_meta_to_sequence)),
        original_feature_dim=np.asarray(original_feature_dim, dtype=np.int64),
        meta_dim=np.asarray(meta_dim, dtype=np.int64),
        feature_names_v2=feature_names_v2,
    )

    session_csv = out_dir / f"client_{int(client_id):02d}_sessions.csv"
    res["session_df"].to_csv(session_csv, index=False)

    summary = {
        "client_id": client_id,
        "raw_rows": int(res["raw_rows"]),
        "raw_sessions_gap_based": int(res["n_raw_sessions"]),
        "valid_sessions": int(features.shape[0]),
        "windows_total": int(len(splits)),
        "windows_train": int((splits == 0).sum()),
        "windows_val": int((splits == 1).sum()),
        "windows_test": int((splits == 2).sum()),
        "c_ref_ah": float(res["c_ref"]),
        "removed_by_min_delta_soc": int(res["reject_counts"]["delta_soc_small_or_nonpositive"]),
        "removed_by_other_filters": int(sum(v for k, v in res["reject_counts"].items() if k != "delta_soc_small_or_nonpositive")),
        "purge_gap": purge_gap,
        "metadata_feature_names": "|".join(SESSION_META_FEATURE_NAMES),
        "capacity_min_ah": float(np.nanmin(res["capacity_clean"])),
        "capacity_mean_ah": float(np.nanmean(res["capacity_clean"])),
        "capacity_std_ah": float(np.nanstd(res["capacity_clean"])),
        "capacity_median_ah": float(np.nanmedian(res["capacity_clean"])),
        "capacity_max_ah": float(np.nanmax(res["capacity_clean"])),
        "soh_min_percent": float(np.nanmin(soh)),
        "soh_mean_percent": float(np.nanmean(soh)),
        "soh_std_percent": float(np.nanstd(soh)),
        "soh_median_percent": float(np.nanmedian(soh)),
        "soh_max_percent": float(np.nanmax(soh)),
        "capacity_outlier_count": int(res["session_df"]["capacity_outlier_flag"].sum()),
        "bms_jump_count_diag": int(res["session_df"]["bms_jump_flag_diag"].sum()),
        **{f"reject_{k}": int(v) for k, v in res["reject_counts"].items()},
        "npz_path": str(client_file),
        "session_csv_path": str(session_csv),
    }
    return summary


def prepare_output_dir(out_dir: Path, overwrite: bool) -> Path:
    """기존 v1 산출물과 새 v2_3 산출물을 안전하게 분리한다."""
    resolved = out_dir.resolve()
    v1_resolved = DEFAULT_V1_OUT_DIR.resolve()
    if resolved == v1_resolved:
        raise ValueError("Safety stop: v2_3 output directory must not be processed_ev_soh/")
    if out_dir.exists():
        if any(out_dir.iterdir()):
            if overwrite:
                raise ValueError("Safety stop: --overwrite is not allowed for a non-empty directory in this safe script.")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            out_dir = out_dir.with_name(f"{out_dir.name}_{timestamp}")
            print(f"[WARN] output directory exists; using timestamped directory: {out_dir}")
            out_dir.mkdir(parents=True, exist_ok=False)
        return out_dir
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def validate_saved_npz(out_dir: Path) -> None:
    files = sorted(out_dir.glob("client_*.npz"))
    if not files:
        raise AssertionError("No saved client_*.npz files found")
    dims = set()
    for p in files:
        data = np.load(p, allow_pickle=False)
        sessions = data["sessions"]
        meta = data["session_meta"]
        meta_scaled = data["session_meta_scaled"]
        dims.add((sessions.shape[1], sessions.shape[2], int(np.asarray(data["lookback"]).item()), int(np.asarray(data["horizon"]).item())))
        if meta.shape[0] != sessions.shape[0] or meta_scaled.shape[0] != sessions.shape[0]:
            raise AssertionError(f"{p.name}: metadata rows do not match sessions")
        split_strategy = str(np.asarray(data["split_strategy"]).item())
        if split_strategy == "purged_time_split":
            assert_purged_split(
                data["input_starts"].astype(np.int64),
                data["target_starts"].astype(np.int64),
                data["splits"].astype(np.int64),
                int(np.asarray(data["lookback"]).item()),
                int(np.asarray(data["horizon"]).item()),
            )
    if len(dims) != 1:
        raise AssertionError(f"Inconsistent saved dimensions: {dims}")


class ProcessedEVSOHDataset:
    """Minimal numpy dataset wrapper. Use torch.FloatTensor(x), torch.FloatTensor(y) in PyTorch."""
    SPLIT_MAP = {"train": 0, "val": 1, "test": 2, "all": -1}

    def __init__(self, npz_path: str | Path, split: str = "train"):
        data = np.load(npz_path, allow_pickle=False)
        self.sessions = data["sessions"].astype(np.float32)
        self.soh = data["soh"].astype(np.float32)
        self.input_starts_all = data["input_starts"].astype(np.int64)
        self.target_starts_all = data["target_starts"].astype(np.int64)
        self.splits_all = data["splits"].astype(np.int64)
        self.lookback = int(data["lookback"])
        self.horizon = int(data["horizon"])
        if split not in self.SPLIT_MAP:
            raise ValueError(f"split must be one of {list(self.SPLIT_MAP)}")
        code = self.SPLIT_MAP[split]
        mask = np.ones_like(self.splits_all, dtype=bool) if code == -1 else (self.splits_all == code)
        self.input_starts = self.input_starts_all[mask]
        self.target_starts = self.target_starts_all[mask]

    def __len__(self) -> int:
        return len(self.input_starts)

    def __getitem__(self, idx: int):
        s = int(self.input_starts[idx])
        t = int(self.target_starts[idx])
        x = self.sessions[s:s + self.lookback]
        y = self.soh[t:t + self.horizon]
        return x.astype(np.float32), y.astype(np.float32)


def main() -> None:
    parser = argparse.ArgumentParser(description="Preprocess BatICM EV charging data for SOH prediction, v2_3.")
    parser.add_argument("--raw_dir", type=str, default="./data")
    parser.add_argument("--output_dir", "--out_dir", dest="out_dir", type=str, default="./processed_ev_soh_v2_3_min5_purge_meta")
    parser.add_argument("--file_pattern", type=str, default="#*.csv")
    parser.add_argument("--seq_len", type=int, default=128)
    parser.add_argument("--lookback", type=int, default=20)
    parser.add_argument("--horizon", type=int, default=3)
    parser.add_argument("--session_gap_seconds", type=float, default=10.0)
    parser.add_argument("--min_session_len", type=int, default=100)
    parser.add_argument("--min_delta_soc", type=float, default=5.0)
    parser.add_argument("--capacity_min_ah", type=float, default=50.0)
    parser.add_argument("--capacity_max_ah", type=float, default=200.0)
    parser.add_argument("--outlier_window", type=int, default=25)
    parser.add_argument("--outlier_abs_ah", type=float, default=10.0)
    parser.add_argument("--outlier_rel", type=float, default=0.12)
    parser.add_argument("--soh_smooth_window", type=int, default=50,
                        help="Causal trailing smoothing window. Use 10/20/50 later for ablation.")
    parser.add_argument("--train_frac", type=float, default=0.70)
    parser.add_argument("--val_frac", type=float, default=0.10)
    parser.add_argument("--purged_split", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--append_meta_to_sequence", action="store_true", default=False)
    parser.add_argument("--overwrite", action="store_true", default=False)
    parser.add_argument("--compressed", action="store_true")
    args = parser.parse_args()
    cfg = PreprocessConfig(**vars(args))

    raw_dir = Path(cfg.raw_dir)
    out_dir = prepare_output_dir(Path(cfg.out_dir), cfg.overwrite)

    if DEFAULT_V1_OUT_DIR.exists():
        print(f"[INFO] Safety check: existing {DEFAULT_V1_OUT_DIR}/ will not be modified.")

    csv_files = sorted(raw_dir.glob(cfg.file_pattern), key=natural_vehicle_key)
    csv_files = [p for p in csv_files if re.fullmatch(r"#?\d+", p.stem)]
    if not csv_files:
        raise FileNotFoundError(f"No vehicle CSV files matching {cfg.file_pattern} in {raw_dir.resolve()}")

    print(f"[INFO] Found {len(csv_files)} vehicle CSV files in {raw_dir}")
    print(f"[INFO] lookback={cfg.lookback}, horizon={cfg.horizon}, seq_len={cfg.seq_len}")
    print(f"[INFO] min_delta_soc={cfg.min_delta_soc}, purged_split={cfg.purged_split}, append_meta_to_sequence={cfg.append_meta_to_sequence}")

    client_results: List[Dict[str, object]] = []
    for p in csv_files:
        vehicle_num, _ = natural_vehicle_key(p)
        print(f"[PROCESS] client #{vehicle_num}: {p.name}", flush=True)
        try:
            res = process_one_client(p, cfg)
            client_results.append(res)
            print(
                f"  valid_sessions={len(res['capacity_clean'])}, "
                f"windows={len(res['splits'])}, "
                f"SOH={np.nanmin(res['soh_smooth']):.2f}~{np.nanmax(res['soh_smooth']):.2f}%"
            )
        except Exception as e:
            print(f"  [SKIP/ERROR] {p.name}: {e}")

    if not client_results:
        raise RuntimeError("No clients were successfully processed.")

    mean, std = compute_global_scaler(client_results, cfg)
    meta_mean, meta_std = compute_global_meta_scaler(client_results, cfg)
    with open(out_dir / "global_scaler.json", "w", encoding="utf-8") as f:
        json.dump({
            "feature_names": FEATURE_NAMES,
            "mean": mean.tolist(),
            "std": std.tolist(),
            "note": "Computed from train sessions only across processed clients."
        }, f, ensure_ascii=False, indent=2)
    with open(out_dir / "session_meta_scaler.json", "w", encoding="utf-8") as f:
        json.dump({
            "session_meta_feature_names": SESSION_META_FEATURE_NAMES,
            "mean": meta_mean.tolist(),
            "std": meta_std.tolist(),
            "note": "Computed from train sessions only across processed clients."
        }, f, ensure_ascii=False, indent=2)

    summaries = [save_client_result(res, mean, std, meta_mean, meta_std, cfg, out_dir) for res in client_results]
    summary_df = pd.DataFrame(summaries).sort_values("client_id", key=lambda s: s.astype(int))
    summary_df.to_csv(out_dir / "preprocessing_v2_3_summary.csv", index=False)
    with open(out_dir / "preprocessing_v2_3_summary.json", "w", encoding="utf-8") as f:
        json.dump({
            "preprocessing_version": PREPROCESSING_VERSION,
            "config": asdict(cfg),
            "split_strategy": "purged_time_split" if cfg.purged_split else "time_split",
            "purge_gap": int(cfg.lookback + cfg.horizon - 1) if cfg.purged_split else 0,
            "metadata_feature_names": SESSION_META_FEATURE_NAMES,
            "clients": summaries,
        }, f, ensure_ascii=False, indent=2)
    with open(out_dir / "preprocess_config.json", "w", encoding="utf-8") as f:
        json.dump(asdict(cfg), f, ensure_ascii=False, indent=2)
    with open(out_dir / "README_v2_3.txt", "w", encoding="utf-8") as f:
        f.write(
            "EV SOH preprocessing v2_3_min5_purge_meta\n"
            "- 기존 processed_ev_soh/는 수정하지 않습니다.\n"
            "- 기본 min_delta_soc=5.0 입니다.\n"
            "- 기본 split은 purged_time_split이며 purge_gap=lookback+horizon-1 입니다.\n"
            "- SOH smoothing은 causal/trailing median만 사용합니다. window=10/20/50은 추후 ablation 후보입니다.\n"
            "- session_meta/session_meta_scaled는 세션 내부 관측값으로만 계산됩니다.\n"
            "- session_meta scaler는 train sessions만 사용해 fit합니다.\n"
        )
    validate_saved_npz(out_dir)

    print("\n[DONE] preprocessing finished")
    print(f"[DONE] processed clients: {len(summary_df)}")
    print(f"[DONE] output directory: {out_dir.resolve()}")
    print(summary_df[[
        "client_id", "valid_sessions", "windows_total", "windows_train", "windows_val", "windows_test",
        "soh_min_percent", "soh_max_percent", "capacity_outlier_count", "bms_jump_count_diag"
    ]].to_string(index=False))
    print("\n[SUGGESTED]")
    print("python preprocess_ev_soh_fast_final_v2_3.py \\")
    print("  --output_dir processed_ev_soh_v2_3_min5_purge_meta \\")
    print("  --min_delta_soc 5.0 \\")
    print("  --purged_split \\")
    print("  --soh_smooth_window 50")
    print("\n[OPTIONAL SEQ META]")
    print("python preprocess_ev_soh_fast_final_v2_3.py \\")
    print("  --output_dir processed_ev_soh_v2_3_min5_purge_meta_seqmeta \\")
    print("  --min_delta_soc 5.0 \\")
    print("  --purged_split \\")
    print("  --soh_smooth_window 50 \\")
    print("  --append_meta_to_sequence")


if __name__ == "__main__":
    main()
