#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training code for personalized FL-based EV battery SOH prediction.

Expected input directory created by preprocess_ev_soh_fast_final.py:
  processed_ev_soh/
    client_01.npz ... client_20.npz
    preprocess_summary.csv
    global_scaler.json
    preprocess_config.json

Main proposed model:
  Partial personalized FL + FiLM + Heteroscedastic Uncertainty + first-version trend loss.

Core design:
  - Shared server-side module: intra-cycle session encoder only. Default encoder is fast CNN; GRU is optional.
  - Local client-side modules: FiLM adapter, inter-cycle temporal encoder, HU prediction head.
  - Server aggregates only the shared intra-cycle encoder.
  - Target: horizon=3, i.e. current prediction point + next two charging sessions.

Baselines included:
  - centralized: one HU model trained with all client data pooled.
  - local: each client trains its own FiLM-HU model; no federation.
  - fedavg: conventional FL with a fully shared HU model.
  - proposed: partial personalized FL with shared intra-cycle encoder only.

Run example:
  python train_ev_soh_pfl.py --data_dir ./processed_ev_soh --out_dir ./training_results \
      --methods centralized,local,fedavg,proposed --global_rounds 20 --local_epochs 2

Quick smoke test:
  python train_ev_soh_pfl.py --data_dir ./processed_ev_soh --out_dir ./smoke_results \
      --methods proposed --max_clients 2 --global_rounds 1 --local_epochs 1 --batch_size 16

v2_3 metadata both-mode smoke test:
  python train_ev_soh_pfl_v2_3_meta_both.py \
      --data_dir ./processed_ev_soh_v2_3_min5_purge_meta \
      --out_dir ./smoke_meta_both --methods proposed --use_session_meta \
      --meta_mode both --session_encoder gru --hidden_dim 32 --batch_size 16 \
      --global_rounds 1 --local_epochs 1 --torch_threads 2
"""

from __future__ import annotations

import argparse
import copy
import gc
import json
import math
import os
import random
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import ConcatDataset, DataLoader, Dataset


# -----------------------------
# Reproducibility and utilities
# -----------------------------


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = False  # faster; set True if exact determinism is required


def build_method_seeds(base_seed: int, mode: str) -> Dict[str, int]:
    if mode == "same":
        return {m: int(base_seed) for m in ["centralized", "local", "fedavg", "proposed"]}
    if mode == "offset":
        return {
            "centralized": int(base_seed) + 101,
            "local": int(base_seed) + 202,
            "fedavg": int(base_seed) + 303,
            "proposed": int(base_seed) + 404,
        }
    raise ValueError(f"Unknown method_seed_mode={mode}")


def reset_method_seed(method: str, method_seeds: Dict[str, int]) -> int:
    seed = int(method_seeds[method])
    set_seed(seed)
    print(f"[INFO] reset seed for {method}: {seed}")
    return seed


def seed_worker(worker_id: int) -> None:
    worker_seed = torch.initial_seed() % 2**32
    np.random.seed(worker_seed)
    random.seed(worker_seed)


def make_torch_generator(seed: Optional[int]) -> Optional[torch.Generator]:
    if seed is None:
        return None
    gen = torch.Generator()
    gen.manual_seed(int(seed))
    return gen


def release_memory() -> None:
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def client_sort_key(path: Path) -> Tuple[int, str]:
    m = re.search(r"client_(\d+)", path.stem)
    return (int(m.group(1)), path.stem) if m else (10**9, path.stem)


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def rmse_np(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def mae_np(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(np.abs(y_true - y_pred)))


# -----------------------------
# Dataset
# -----------------------------


class ClientSOHDataset(Dataset):
    """Window dataset backed by one client_XX.npz.

    The preprocessing stores session-level tensors and target starts rather than pre-expanded X/Y
    arrays. This dataset materializes each window on demand.
    """

    SPLIT_TO_CODE = {"train": 0, "val": 1, "test": 2, "all": -1}

    def __init__(self, npz_path: str | Path, split: str, target_scale: float = 100.0, use_session_meta: bool = False):
        super().__init__()
        self.npz_path = Path(npz_path)
        if split not in self.SPLIT_TO_CODE:
            raise ValueError(f"split must be one of {list(self.SPLIT_TO_CODE)}")
        self.split = split
        self.target_scale = float(target_scale)
        self.use_session_meta = bool(use_session_meta)

        data = np.load(self.npz_path, allow_pickle=False)
        required = ["sessions", "soh", "input_starts", "target_starts", "splits", "lookback", "horizon"]
        missing = [k for k in required if k not in data.files]
        if missing:
            raise KeyError(f"{self.npz_path} is missing keys {missing}. Found keys: {data.files}")

        self.sessions = data["sessions"].astype(np.float32)  # [N_session, seq_len, features]
        self.soh = data["soh"].astype(np.float32)            # [N_session], percent scale
        self.session_meta_scaled = None
        if self.use_session_meta:
            if "session_meta_scaled" not in data.files:
                raise KeyError(f"{self.npz_path} has no session_meta_scaled. Disable --use_session_meta or run v2_3 preprocessing.")
            self.session_meta_scaled = data["session_meta_scaled"].astype(np.float32)
        input_starts = data["input_starts"].astype(np.int64)
        target_starts = data["target_starts"].astype(np.int64)
        splits = data["splits"].astype(np.int64)
        self.lookback = int(np.asarray(data["lookback"]).item())
        self.horizon = int(np.asarray(data["horizon"]).item())
        self.client_id = str(np.asarray(data["client_id"]).item()) if "client_id" in data.files else self.npz_path.stem

        code = self.SPLIT_TO_CODE[split]
        if code == -1:
            mask = np.ones_like(splits, dtype=bool)
        else:
            mask = splits == code
        self.input_starts = input_starts[mask]
        self.target_starts = target_starts[mask]
        self.splits = splits[mask]

    @property
    def input_dim(self) -> int:
        return int(self.sessions.shape[-1])

    @property
    def seq_len(self) -> int:
        return int(self.sessions.shape[1])

    @property
    def meta_input_dim(self) -> int:
        if self.session_meta_scaled is None:
            return 0
        return int(self.session_meta_scaled.shape[1] * 2)

    def __len__(self) -> int:
        return int(len(self.input_starts))

    def __getitem__(self, idx: int):
        s = int(self.input_starts[idx])
        t = int(self.target_starts[idx])
        x = self.sessions[s:s + self.lookback]  # [lookback, seq_len, input_dim]
        y = self.soh[t:t + self.horizon] / self.target_scale
        if not self.use_session_meta:
            return torch.from_numpy(x.astype(np.float32)), torch.from_numpy(y.astype(np.float32))
        meta_window = self.session_meta_scaled[s:s + self.lookback]
        # target horizon metadata는 사용하지 않고 input lookback metadata만 요약한다.
        meta_context = np.concatenate(
            [meta_window.mean(axis=0), meta_window.std(axis=0)],
            axis=0,
        ).astype(np.float32)
        return torch.from_numpy(x.astype(np.float32)), torch.from_numpy(y.astype(np.float32)), torch.from_numpy(meta_context)


@dataclass
class ClientData:
    client_id: str
    npz_path: Path
    train: ClientSOHDataset
    val: ClientSOHDataset
    test: ClientSOHDataset
    train_loader: DataLoader
    val_loader: DataLoader
    test_loader: DataLoader


def load_clients(data_dir: Path, batch_size: int, target_scale: float, num_workers: int,
                 max_clients: int = 0, loader_seed: Optional[int] = None,
                 use_session_meta: bool = False) -> List[ClientData]:
    files = sorted(data_dir.glob("client_*.npz"), key=client_sort_key)
    if max_clients and max_clients > 0:
        files = files[:max_clients]
    if not files:
        raise FileNotFoundError(f"No client_*.npz files found in {data_dir.resolve()}")

    clients: List[ClientData] = []
    for idx, p in enumerate(files):
        train_ds = ClientSOHDataset(p, "train", target_scale, use_session_meta)
        val_ds = ClientSOHDataset(p, "val", target_scale, use_session_meta)
        test_ds = ClientSOHDataset(p, "test", target_scale, use_session_meta)
        if len(train_ds) == 0 or len(test_ds) == 0:
            print(f"[SKIP] {p.name}: train={len(train_ds)}, val={len(val_ds)}, test={len(test_ds)}")
            continue
        cid = f"{int(train_ds.client_id):02d}" if str(train_ds.client_id).isdigit() else str(train_ds.client_id)
        train_generator = make_torch_generator(None if loader_seed is None else int(loader_seed) + idx)
        train_loader = DataLoader(
            train_ds,
            batch_size=batch_size,
            shuffle=True,
            drop_last=False,
            num_workers=num_workers,
            generator=train_generator,
            worker_init_fn=seed_worker if num_workers > 0 else None,
        )
        val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, drop_last=False, num_workers=num_workers)
        test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False, drop_last=False, num_workers=num_workers)
        clients.append(ClientData(cid, p, train_ds, val_ds, test_ds, train_loader, val_loader, test_loader))

    if not clients:
        raise RuntimeError("No usable clients after loading datasets.")
    return clients


def validate_client_metadata(clients: Sequence[ClientData]) -> Tuple[int, int, int, int]:
    """Ensure every client tensor can be trained by one shared model shape."""
    if not clients:
        raise ValueError("clients is empty")

    ref = clients[0].train
    input_dim = ref.input_dim
    seq_len = ref.seq_len
    lookback = ref.lookback
    horizon = ref.horizon
    mismatches = []

    for c in clients:
        for split_name, ds in [("train", c.train), ("val", c.val), ("test", c.test)]:
            meta = (ds.input_dim, ds.seq_len, ds.lookback, ds.horizon)
            expected = (input_dim, seq_len, lookback, horizon)
            if meta != expected:
                mismatches.append(
                    f"client {c.client_id} {split_name}: "
                    f"input_dim={meta[0]}, seq_len={meta[1]}, lookback={meta[2]}, horizon={meta[3]} "
                    f"(expected input_dim={expected[0]}, seq_len={expected[1]}, "
                    f"lookback={expected[2]}, horizon={expected[3]})"
                )

            max_input_end = int(ds.input_starts.max() + ds.lookback) if len(ds) else 0
            max_target_end = int(ds.target_starts.max() + ds.horizon) if len(ds) else 0
            if max_input_end > len(ds.sessions) or max_target_end > len(ds.soh):
                mismatches.append(
                    f"client {c.client_id} {split_name}: window index exceeds data length "
                    f"(input_end={max_input_end}/{len(ds.sessions)}, "
                    f"target_end={max_target_end}/{len(ds.soh)})"
                )

    if mismatches:
        details = "\n  - ".join(mismatches)
        raise ValueError(f"Client metadata validation failed:\n  - {details}")

    return input_dim, seq_len, lookback, horizon


def get_meta_input_dim(clients: Sequence[ClientData]) -> int:
    if not clients:
        return 0
    dim = clients[0].train.meta_input_dim
    for c in clients:
        for ds in [c.train, c.val, c.test]:
            if ds.meta_input_dim != dim:
                raise ValueError(f"client {c.client_id}: inconsistent meta_input_dim")
    return dim


# -----------------------------
# Models
# -----------------------------


class IntraCycleGRUEncoder(nn.Module):
    """Shared encoder for one charging session.

    Input:  x [B, L, S, F]
      B=batch, L=lookback sessions, S=within-session sequence length, F=features.
    Output: session embeddings [B, L, H]
    """

    def __init__(self, input_dim: int, hidden_dim: int, dropout: float = 0.1):
        super().__init__()
        self.gru = nn.GRU(input_dim, hidden_dim, batch_first=True)
        self.proj = nn.Sequential(
            nn.LayerNorm(hidden_dim),
            nn.Linear(hidden_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if x.dim() != 4:
            raise ValueError(f"Expected x shape [B,L,S,F], got {tuple(x.shape)}")
        b, l, s, f = x.shape
        x_flat = x.reshape(b * l, s, f)
        _, h = self.gru(x_flat)
        emb = h[-1]
        emb = self.proj(emb)
        return emb.reshape(b, l, -1)


class IntraCycleCNNEncoder(nn.Module):
    """Fast shared encoder for one charging session.

    CNN is the default because it is far faster than GRU on CPU for the preprocessed
    tensor shape [batch, lookback, seq_len, features]. GRU remains available through
    --session_encoder gru.
    """

    def __init__(self, input_dim: int, hidden_dim: int, dropout: float = 0.1):
        super().__init__()
        mid = max(hidden_dim // 2, 16)
        self.net = nn.Sequential(
            nn.Conv1d(input_dim, mid, kernel_size=5, padding=2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Conv1d(mid, hidden_dim, kernel_size=5, padding=2),
            nn.GELU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.proj = nn.Sequential(
            nn.LayerNorm(hidden_dim),
            nn.Linear(hidden_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if x.dim() != 4:
            raise ValueError(f"Expected x shape [B,L,S,F], got {tuple(x.shape)}")
        b, l, s, f = x.shape
        x_flat = x.reshape(b * l, s, f).transpose(1, 2)  # [B*L, F, S]
        emb = self.net(x_flat).squeeze(-1)
        emb = self.proj(emb)
        return emb.reshape(b, l, -1)


def build_intra_encoder(kind: str, input_dim: int, hidden_dim: int, dropout: float) -> nn.Module:
    kind = kind.lower()
    if kind == "cnn":
        return IntraCycleCNNEncoder(input_dim, hidden_dim, dropout)
    if kind == "gru":
        return IntraCycleGRUEncoder(input_dim, hidden_dim, dropout)
    raise ValueError(f"Unknown session_encoder={kind}. Use 'cnn' or 'gru'.")


class InterCycleGRUEncoder(nn.Module):
    """Temporal encoder across recent charging sessions."""

    def __init__(self, hidden_dim: int, dropout: float = 0.1):
        super().__init__()
        self.gru = nn.GRU(hidden_dim, hidden_dim, batch_first=True)
        self.norm = nn.LayerNorm(hidden_dim)
        self.dropout = nn.Dropout(dropout)

    def forward(self, session_emb: torch.Tensor) -> torch.Tensor:
        out, _ = self.gru(session_emb)
        z = out[:, -1, :]
        return self.dropout(self.norm(z))


class FiLMAdapter(nn.Module):
    """Client-local feature-wise linear modulation of session embeddings."""

    def __init__(self, hidden_dim: int, meta_embedding_dim: int = 0,
                 gamma_scale: float = 0.1, beta_scale: float = 0.1):
        super().__init__()
        self.gamma_scale = float(gamma_scale)
        self.beta_scale = float(beta_scale)
        self.gamma_raw = nn.Parameter(torch.zeros(hidden_dim))
        self.beta_raw = nn.Parameter(torch.zeros(hidden_dim))
        self.meta_net = None
        if meta_embedding_dim > 0:
            self.meta_net = nn.Sequential(
                nn.Linear(meta_embedding_dim, hidden_dim),
                nn.GELU(),
                nn.Linear(hidden_dim, 2 * hidden_dim),
            )
            # 메타 FiLM이 학습 초기에 표현을 망가뜨리지 않도록 마지막 layer를 0으로 시작한다.
            nn.init.zeros_(self.meta_net[-1].weight)
            nn.init.zeros_(self.meta_net[-1].bias)

    def forward(self, emb: torch.Tensor, meta: Optional[torch.Tensor] = None) -> torch.Tensor:
        # gamma는 1, beta는 0에 가깝게 시작한다.
        gamma = 1.0 + self.gamma_scale * torch.tanh(self.gamma_raw)
        beta = self.beta_scale * torch.tanh(self.beta_raw)
        beta = beta.view(1, 1, -1)
        gamma = gamma.view(1, 1, -1)
        if self.meta_net is not None and meta is not None:
            meta_gamma, meta_beta = self.meta_net(meta).chunk(2, dim=-1)
            gamma = gamma * (1.0 + self.gamma_scale * torch.tanh(meta_gamma).unsqueeze(1))
            beta = beta + self.beta_scale * torch.tanh(meta_beta).unsqueeze(1)
        return emb * gamma + beta


class MetadataEncoder(nn.Module):
    """lookback metadata 요약값을 작은 MLP로 인코딩한다."""

    def __init__(self, meta_input_dim: int, meta_embedding_dim: int, dropout: float = 0.1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(meta_input_dim, meta_embedding_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(meta_embedding_dim, meta_embedding_dim),
            nn.GELU(),
        )

    def forward(self, meta: torch.Tensor) -> torch.Tensor:
        return self.net(meta)


class HeteroscedasticHead(nn.Module):
    """Predicts mean and log variance for each prediction horizon."""

    def __init__(self, hidden_dim: int, horizon: int, dropout: float = 0.1, input_dim: Optional[int] = None):
        super().__init__()
        self.horizon = int(horizon)
        in_dim = int(input_dim) if input_dim is not None else hidden_dim
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim // 2 if hidden_dim >= 32 else hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim // 2 if hidden_dim >= 32 else hidden_dim, 2 * horizon),
        )

    def forward(self, z: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        out = self.net(z)
        mu, logvar = out[:, :self.horizon], out[:, self.horizon:]
        logvar = torch.clamp(logvar, min=-6.0, max=3.0)
        return mu, logvar


class GlobalHUModel(nn.Module):
    """Global model used for centralized and conventional FedAvg baselines.

    It uses the same HU loss as the proposed model, but has no local FiLM/personalization.
    """

    def __init__(self, input_dim: int, hidden_dim: int, horizon: int, dropout: float = 0.1,
                 session_encoder: str = "cnn", meta_input_dim: int = 0, meta_mode: str = "concat_head",
                 meta_embedding_dim: Optional[int] = None):
        super().__init__()
        meta_embedding_dim = int(meta_embedding_dim) if meta_embedding_dim is not None else hidden_dim
        self.intra_encoder = build_intra_encoder(session_encoder, input_dim, hidden_dim, dropout)
        self.inter_encoder = InterCycleGRUEncoder(hidden_dim, dropout)
        self.meta_encoder = MetadataEncoder(meta_input_dim, meta_embedding_dim, dropout) if meta_input_dim > 0 and meta_mode == "concat_head" else None
        head_input_dim = hidden_dim + meta_embedding_dim if self.meta_encoder is not None else hidden_dim
        self.head = HeteroscedasticHead(hidden_dim, horizon, dropout, input_dim=head_input_dim)

    def forward(self, x: torch.Tensor, meta: Optional[torch.Tensor] = None) -> Tuple[torch.Tensor, torch.Tensor]:
        emb = self.intra_encoder(x)
        z = self.inter_encoder(emb)
        if self.meta_encoder is not None and meta is not None:
            z = torch.cat([z, self.meta_encoder(meta)], dim=-1)
        return self.head(z)


class ProposedPartialFiLMHUModel(nn.Module):
    """Proposed model: shared intra-cycle encoder + local FiLM/inter-cycle/HU head."""

    def __init__(self, input_dim: int, hidden_dim: int, horizon: int, dropout: float = 0.1,
                 session_encoder: str = "cnn", meta_input_dim: int = 0, meta_mode: str = "film",
                 meta_embedding_dim: Optional[int] = None,
                 film_gamma_scale: float = 0.1, film_beta_scale: float = 0.1):
        super().__init__()
        meta_embedding_dim = int(meta_embedding_dim) if meta_embedding_dim is not None else hidden_dim
        self.intra_encoder = build_intra_encoder(session_encoder, input_dim, hidden_dim, dropout)  # shared by server
        self.meta_mode = meta_mode
        uses_meta = meta_input_dim > 0 and meta_mode in {"concat_head", "film", "both"}
        uses_film_meta = uses_meta and meta_mode in {"film", "both"}
        uses_head_meta = uses_meta and meta_mode in {"concat_head", "both"}
        self.apply_film = not (uses_meta and meta_mode == "concat_head")
        self.meta_encoder = MetadataEncoder(meta_input_dim, meta_embedding_dim, dropout) if uses_meta else None
        film_meta_dim = meta_embedding_dim if uses_film_meta else 0
        self.film = FiLMAdapter(hidden_dim, film_meta_dim, film_gamma_scale, film_beta_scale)                        # local
        self.inter_encoder = InterCycleGRUEncoder(hidden_dim, dropout)            # local
        head_input_dim = hidden_dim + meta_embedding_dim if uses_head_meta else hidden_dim
        self.head = HeteroscedasticHead(hidden_dim, horizon, dropout, input_dim=head_input_dim)             # local

    def forward(self, x: torch.Tensor, meta: Optional[torch.Tensor] = None) -> Tuple[torch.Tensor, torch.Tensor]:
        emb = self.intra_encoder(x)
        meta_emb = self.meta_encoder(meta) if self.meta_encoder is not None and meta is not None else None
        if self.apply_film:
            emb = self.film(emb, meta_emb if self.meta_mode in {"film", "both"} else None)
        z = self.inter_encoder(emb)
        if meta_emb is not None and self.meta_mode in {"concat_head", "both"}:
            z = torch.cat([z, meta_emb], dim=-1)
        return self.head(z)


# -----------------------------
# Loss functions
# -----------------------------


def heteroscedastic_nll(mu: torch.Tensor, logvar: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    """Gaussian NLL up to an additive constant, averaged over batch and horizon."""
    return torch.mean(0.5 * torch.exp(-logvar) * (target - mu) ** 2 + 0.5 * logvar)


def first_version_trend_loss(mu: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    """Simple first-version trend consistency loss.

    It does NOT force monotonic decrease. It only encourages the predicted horizon-wise
    slope to be close to the target slope and penalizes opposite directions softly.
    """
    if mu.shape[1] < 2:
        return torch.zeros((), dtype=mu.dtype, device=mu.device)
    pred_diff = mu[:, 1:] - mu[:, :-1]
    target_diff = target[:, 1:] - target[:, :-1]
    slope_loss = F.smooth_l1_loss(pred_diff, target_diff)
    direction_penalty = torch.relu(-pred_diff * target_diff).mean()
    return slope_loss + direction_penalty


def total_hu_loss(mu: torch.Tensor, logvar: torch.Tensor, target: torch.Tensor,
                  trend_weight: float, mse_weight: float = 0.0) -> torch.Tensor:
    loss = heteroscedastic_nll(mu, logvar, target)
    if mse_weight > 0:
        loss = loss + float(mse_weight) * F.mse_loss(mu, target)
    if trend_weight > 0:
        loss = loss + float(trend_weight) * first_version_trend_loss(mu, target)
    return loss


# -----------------------------
# Train / evaluation helpers
# -----------------------------


@dataclass
class EvalResult:
    method: str
    client_id: str
    mae_h1: float
    mae_h2: float
    mae_h3: float
    rmse_h1: float
    rmse_h2: float
    rmse_h3: float
    avg_mae: float
    avg_rmse: float
    n_samples: int


def move_batch_to_device(batch, device: torch.device):
    if len(batch) == 2:
        x, y = batch
        meta = None
    else:
        x, y, meta = batch
        meta = meta.to(device, non_blocking=True)
    x = x.to(device, non_blocking=True)
    y = y.to(device, non_blocking=True)
    return x, y, meta


def train_one_epoch_hu(model: nn.Module, loader: DataLoader, optimizer: torch.optim.Optimizer,
                       device: torch.device, trend_weight: float, grad_clip: float,
                       mse_weight: float = 0.0) -> float:
    model.train()
    total_loss = 0.0
    total_n = 0
    for batch in loader:
        x, y, meta = move_batch_to_device(batch, device)
        optimizer.zero_grad(set_to_none=True)
        mu, logvar = model(x, meta)
        loss = total_hu_loss(mu, logvar, y, trend_weight, mse_weight)
        loss.backward()
        if grad_clip and grad_clip > 0:
            nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
        optimizer.step()
        n = x.size(0)
        total_loss += float(loss.detach().cpu()) * n
        total_n += n
    return total_loss / max(total_n, 1)


@torch.no_grad()
def eval_loss_hu(model: nn.Module, loader: DataLoader, device: torch.device,
                 trend_weight: float, mse_weight: float = 0.0) -> float:
    model.eval()
    total_loss = 0.0
    total_n = 0
    for batch in loader:
        x, y, meta = move_batch_to_device(batch, device)
        mu, logvar = model(x, meta)
        loss = total_hu_loss(mu, logvar, y, trend_weight, mse_weight)
        n = x.size(0)
        total_loss += float(loss.detach().cpu()) * n
        total_n += n
    return total_loss / max(total_n, 1)


@torch.no_grad()
def eval_metrics_hu(model: nn.Module, loader: DataLoader, device: torch.device,
                    trend_weight: float, mse_weight: float, target_scale: float) -> Dict[str, float]:
    model.eval()
    total_loss = 0.0
    total_n = 0
    pred_list, target_list = [], []
    for batch in loader:
        x, y, meta = move_batch_to_device(batch, device)
        mu, logvar = model(x, meta)
        loss = total_hu_loss(mu, logvar, y, trend_weight, mse_weight)
        n = x.size(0)
        total_loss += float(loss.detach().cpu()) * n
        total_n += n
        pred_list.append(mu.detach().cpu().numpy() * target_scale)
        target_list.append(y.detach().cpu().numpy() * target_scale)

    if total_n == 0:
        return {"val_loss": float("nan"), "val_rmse": float("nan"), "val_mae": float("nan"), "n_samples": 0}

    preds = np.concatenate(pred_list, axis=0)
    targets = np.concatenate(target_list, axis=0)
    horizon = targets.shape[1]
    rmses = [rmse_np(targets[:, h], preds[:, h]) for h in range(horizon)]
    maes = [mae_np(targets[:, h], preds[:, h]) for h in range(horizon)]
    return {
        "val_loss": total_loss / max(total_n, 1),
        "val_rmse": float(np.mean(rmses)),
        "val_mae": float(np.mean(maes)),
        "n_samples": int(total_n),
    }


def metric_is_better(value: float, best_value: float) -> bool:
    return np.isfinite(value) and value < best_value


def checkpoint_score(metrics: Dict[str, float], metric_name: str) -> float:
    if metric_name == "val_rmse":
        return float(metrics["val_rmse"])
    if metric_name == "val_loss":
        return float(metrics["val_loss"])
    raise ValueError(f"Unknown metric_name={metric_name}")


@torch.no_grad()
def predict_hu(model: nn.Module, loader: DataLoader, device: torch.device, target_scale: float) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    model.eval()
    pred_list, target_list, std_list = [], [], []
    for batch in loader:
        x, y, meta = move_batch_to_device(batch, device)
        mu, logvar = model(x, meta)
        pred_list.append(mu.detach().cpu().numpy() * target_scale)
        std_list.append(np.exp(0.5 * logvar.detach().cpu().numpy()) * target_scale)
        target_list.append(y.detach().cpu().numpy() * target_scale)
    preds = np.concatenate(pred_list, axis=0)
    targets = np.concatenate(target_list, axis=0)
    stds = np.concatenate(std_list, axis=0)
    return preds, targets, stds


def evaluate_clients(method: str, model_or_models, clients: Sequence[ClientData], device: torch.device,
                     target_scale: float, out_dir: Path, plot_predictions: bool,
                     plot_all_clients: bool, max_plot_clients: int) -> Tuple[pd.DataFrame, Dict[str, Tuple[np.ndarray, np.ndarray, np.ndarray]]]:
    rows: List[Dict[str, object]] = []
    pred_cache: Dict[str, Tuple[np.ndarray, np.ndarray, np.ndarray]] = {}
    plot_dir = out_dir / "plots" / "predictions"
    ensure_dir(plot_dir)

    for idx, client in enumerate(clients):
        if isinstance(model_or_models, dict):
            model = model_or_models[client.client_id]
        elif isinstance(model_or_models, list):
            model = model_or_models[idx]
        else:
            model = model_or_models
        model.to(device)
        preds, targets, stds = predict_hu(model, client.test_loader, device, target_scale)
        pred_cache[client.client_id] = (preds, targets, stds)

        horizon = targets.shape[1]
        maes = [mae_np(targets[:, h], preds[:, h]) for h in range(horizon)]
        rmses = [rmse_np(targets[:, h], preds[:, h]) for h in range(horizon)]
        row = {
            "method": method,
            "client_id": client.client_id,
            "n_samples": int(len(targets)),
            "avg_mae": float(np.mean(maes)),
            "avg_rmse": float(np.mean(rmses)),
        }
        for h in range(horizon):
            row[f"mae_h{h+1}"] = maes[h]
            row[f"rmse_h{h+1}"] = rmses[h]
        rows.append(row)

        should_plot = plot_predictions and (plot_all_clients or idx < max_plot_clients or method == "proposed")
        if should_plot:
            save_prediction_plot(
                preds, targets, stds,
                plot_dir / f"{method}_client_{client.client_id}_prediction.png",
                title=f"{method} | client {client.client_id}"
            )

    return pd.DataFrame(rows), pred_cache


# -----------------------------
# Aggregation
# -----------------------------


def weighted_average_state_dict(state_dicts: Sequence[Dict[str, torch.Tensor]], weights: Sequence[float]) -> Dict[str, torch.Tensor]:
    if not state_dicts:
        raise ValueError("state_dicts is empty")
    weights_arr = np.asarray(weights, dtype=np.float64)
    weights_arr = weights_arr / max(weights_arr.sum(), 1e-12)
    out: Dict[str, torch.Tensor] = {}
    keys = list(state_dicts[0].keys())
    for k in keys:
        first = state_dicts[0][k]
        if not torch.is_floating_point(first):
            out[k] = first.clone()
            continue
        avg = torch.zeros_like(first, dtype=torch.float32)
        for sd, w in zip(state_dicts, weights_arr):
            avg += sd[k].detach().cpu().float() * float(w)
        out[k] = avg.to(dtype=first.dtype)
    return out


def build_proposed_optimizer(model: ProposedPartialFiLMHUModel, args, shared_lr: float, local_lr: float) -> torch.optim.Optimizer:
    param_groups = [
        {"params": model.intra_encoder.parameters(), "lr": shared_lr},
        {"params": model.film.parameters(), "lr": local_lr},
        {"params": model.inter_encoder.parameters(), "lr": local_lr},
        {"params": model.head.parameters(), "lr": local_lr},
    ]
    if getattr(model, "meta_encoder", None) is not None:
        param_groups.append({"params": model.meta_encoder.parameters(), "lr": local_lr})
    return torch.optim.AdamW(
        param_groups,
        weight_decay=args.weight_decay,
    )


# -----------------------------
# Training methods
# -----------------------------


def train_centralized(clients: Sequence[ClientData], input_dim: int, horizon: int, meta_input_dim: int, args, device: torch.device,
                      out_dir: Path) -> Tuple[nn.Module, pd.DataFrame]:
    print("\n[TRAIN] centralized baseline")
    train_ds = ConcatDataset([c.train for c in clients])
    val_ds = ConcatDataset([c.val for c in clients if len(c.val) > 0])
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, drop_last=False, num_workers=args.num_workers)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, drop_last=False, num_workers=args.num_workers)

    model = GlobalHUModel(input_dim, args.hidden_dim, horizon, args.dropout, args.session_encoder,
                          meta_input_dim=meta_input_dim, meta_mode="concat_head",
                          meta_embedding_dim=args.meta_embedding_dim).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)

    history = []
    best_state = copy.deepcopy(model.state_dict())
    best_val = float("inf")
    patience = 0
    for epoch in range(1, args.central_epochs + 1):
        tr = train_one_epoch_hu(model, train_loader, optimizer, device, args.trend_weight, args.grad_clip, args.mse_weight)
        va = eval_loss_hu(model, val_loader, device, args.trend_weight, args.mse_weight)
        history.append({"method": "centralized", "epoch": epoch, "round": 0, "train_loss": tr, "val_loss": va})
        print(f"  epoch {epoch:03d} | train={tr:.6f} | val={va:.6f}")
        if va < best_val:
            best_val = va
            best_state = copy.deepcopy(model.state_dict())
            patience = 0
        else:
            patience += 1
            if patience >= args.patience:
                break
    model.load_state_dict(best_state)
    torch.save(model.state_dict(), out_dir / "centralized_model.pt")
    return model, pd.DataFrame(history)


def train_local_only(clients: Sequence[ClientData], input_dim: int, horizon: int, meta_input_dim: int, args, device: torch.device,
                     out_dir: Path) -> Tuple[Dict[str, nn.Module], pd.DataFrame]:
    print("\n[TRAIN] local-only baseline")
    models: Dict[str, nn.Module] = {}
    history = []
    model_dir = out_dir / "local_models"
    ensure_dir(model_dir)

    for c in clients:
        print(f"  client {c.client_id}")
        model = ProposedPartialFiLMHUModel(input_dim, args.hidden_dim, horizon, args.dropout, args.session_encoder,
                                           meta_input_dim=meta_input_dim, meta_mode="concat_head",
                                           meta_embedding_dim=args.meta_embedding_dim,
                                           film_gamma_scale=args.film_gamma_scale,
                                           film_beta_scale=args.film_beta_scale).to(device)
        optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
        best_state = copy.deepcopy(model.state_dict())
        best_val = float("inf")
        patience = 0
        for epoch in range(1, args.local_only_epochs + 1):
            tr = train_one_epoch_hu(model, c.train_loader, optimizer, device, args.trend_weight, args.grad_clip, args.mse_weight)
            va = eval_loss_hu(model, c.val_loader, device, args.trend_weight, args.mse_weight) if len(c.val) > 0 else tr
            history.append({"method": "local", "client_id": c.client_id, "epoch": epoch, "round": 0, "train_loss": tr, "val_loss": va})
            if va < best_val:
                best_val = va
                best_state = copy.deepcopy(model.state_dict())
                patience = 0
            else:
                patience += 1
                if patience >= args.patience:
                    break
        model.load_state_dict(best_state)
        models[c.client_id] = model.cpu()
        torch.save(model.state_dict(), model_dir / f"local_client_{c.client_id}.pt")
        print(f"    best_val={best_val:.6f}")
    return models, pd.DataFrame(history)


def train_fedavg(clients: Sequence[ClientData], input_dim: int, horizon: int, meta_input_dim: int, args, device: torch.device,
                 out_dir: Path) -> Tuple[nn.Module, pd.DataFrame]:
    print("\n[TRAIN] conventional FedAvg baseline")
    global_model = GlobalHUModel(input_dim, args.hidden_dim, horizon, args.dropout, args.session_encoder,
                                 meta_input_dim=meta_input_dim, meta_mode="concat_head",
                                 meta_embedding_dim=args.meta_embedding_dim).to(device)
    history = []
    weights = [max(len(c.train), 1) for c in clients]
    best_round = 0
    best_score = float("inf")
    best_state = copy.deepcopy(global_model.state_dict())

    for rnd in range(1, args.global_rounds + 1):
        local_states = []
        train_losses = []
        print(f"  round {rnd:03d}/{args.global_rounds}")
        for c in clients:
            local_model = copy.deepcopy(global_model).to(device)
            optimizer = torch.optim.AdamW(local_model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
            local_train_loss = 0.0
            for _ in range(args.local_epochs):
                local_train_loss = train_one_epoch_hu(local_model, c.train_loader, optimizer, device, args.trend_weight, args.grad_clip, args.mse_weight)
            train_losses.append(local_train_loss)
            local_states.append(copy.deepcopy(local_model.cpu().state_dict()))
            del local_model
        avg_state = weighted_average_state_dict(local_states, weights)
        global_model.load_state_dict(avg_state)
        tr = float(np.average(train_losses, weights=weights))

        val_rows = []
        val_weights = []
        global_model.to(device)
        for c in clients:
            metrics = eval_metrics_hu(global_model, c.val_loader, device, args.trend_weight, args.mse_weight, args.target_scale)
            val_rows.append((c.client_id, metrics))
            val_weights.append(max(metrics["n_samples"], 1))
        va_loss = float(np.average([m["val_loss"] for _, m in val_rows], weights=val_weights))
        va_rmse = float(np.average([m["val_rmse"] for _, m in val_rows], weights=val_weights))
        va_mae = float(np.average([m["val_mae"] for _, m in val_rows], weights=val_weights))
        round_metrics = {"val_loss": va_loss, "val_rmse": va_rmse, "val_mae": va_mae}
        score = checkpoint_score(round_metrics, args.fedavg_best_metric)
        is_best_round = False
        if args.fedavg_use_best_round and metric_is_better(score, best_score):
            best_score = score
            best_round = rnd
            best_state = copy.deepcopy(global_model.cpu().state_dict())
            is_best_round = True
        else:
            global_model.cpu()

        history.append({
            "method": "fedavg",
            "phase": "post_agg_val",
            "round": rnd,
            "epoch": rnd,
            "client_id": "",
            "train_loss": tr,
            "val_loss": va_loss,
            "val_rmse": va_rmse,
            "val_mae": va_mae,
            "is_best_round": is_best_round,
            "best_round": best_round,
            "personal_ft_best_epoch": np.nan,
        })
        for cid, metrics in val_rows:
            history.append({
                "method": "fedavg",
                "phase": "post_agg_val",
                "round": rnd,
                "epoch": rnd,
                "client_id": cid,
                "train_loss": np.nan,
                "val_loss": metrics["val_loss"],
                "val_rmse": metrics["val_rmse"],
                "val_mae": metrics["val_mae"],
                "is_best_round": is_best_round,
                "best_round": best_round,
                "personal_ft_best_epoch": np.nan,
            })
        print(f"    weighted_train={tr:.6f} | post_agg_val_loss={va_loss:.6f} | post_agg_val_rmse={va_rmse:.4f} | best_round={best_round}")

    if args.fedavg_use_best_round:
        print(f"  using best FedAvg round {best_round} by {args.fedavg_best_metric}={best_score:.6f}")
        global_model.load_state_dict(best_state)
    torch.save(global_model.cpu().state_dict(), out_dir / "fedavg_global_model.pt")
    return global_model, pd.DataFrame(history)


def train_proposed_partial(clients: Sequence[ClientData], input_dim: int, horizon: int, meta_input_dim: int, args, device: torch.device,
                           out_dir: Path) -> Tuple[Dict[str, nn.Module], pd.DataFrame]:
    print("\n[TRAIN] proposed partial pFL: shared intra-cycle encoder + local FiLM/inter/HU")
    models: Dict[str, ProposedPartialFiLMHUModel] = {
        c.client_id: ProposedPartialFiLMHUModel(input_dim, args.hidden_dim, horizon, args.dropout, args.session_encoder,
                                                meta_input_dim=meta_input_dim, meta_mode=args.meta_mode,
                                                meta_embedding_dim=args.meta_embedding_dim,
                                                film_gamma_scale=args.film_gamma_scale,
                                                film_beta_scale=args.film_beta_scale) for c in clients
    }
    server_encoder = copy.deepcopy(next(iter(models.values())).intra_encoder.state_dict())
    weights = [max(len(c.train), 1) for c in clients]
    history = []
    shared_lr = args.shared_lr if args.shared_lr is not None else args.lr
    local_lr = args.local_lr if args.local_lr is not None else args.lr
    best_round = 0
    best_score = float("inf")
    best_server_encoder = copy.deepcopy(server_encoder)
    best_model_states = {cid: copy.deepcopy(m.state_dict()) for cid, m in models.items()}
    rounds_without_improvement = 0
    completed_round = 0

    model_dir = out_dir / "proposed_models"
    ensure_dir(model_dir)

    for rnd in range(1, args.global_rounds + 1):
        completed_round = rnd
        shared_states = []
        train_losses = []
        print(f"  round {rnd:03d}/{args.global_rounds}")
        for c in clients:
            model = models[c.client_id]
            model.intra_encoder.load_state_dict(server_encoder)
            model.to(device)
            optimizer = build_proposed_optimizer(model, args, shared_lr, local_lr)
            local_train_loss = 0.0
            for _ in range(args.local_epochs):
                local_train_loss = train_one_epoch_hu(model, c.train_loader, optimizer, device, args.trend_weight, args.grad_clip, args.mse_weight)
            train_losses.append(local_train_loss)
            shared_states.append(copy.deepcopy(model.intra_encoder.cpu().state_dict()))
            models[c.client_id] = model.cpu()
        server_encoder = weighted_average_state_dict(shared_states, weights)
        tr = float(np.average(train_losses, weights=weights))
        history.append({
            "method": "proposed",
            "phase": "fl_round",
            "round": rnd,
            "epoch": rnd,
            "client_id": "",
            "train_loss": tr,
            "val_loss": np.nan,
            "val_rmse": np.nan,
            "val_mae": np.nan,
            "is_best_round": False,
            "best_round": best_round,
            "personal_ft_best_epoch": np.nan,
        })
        post_val_rows = []
        val_weights = []
        for c in clients:
            model = models[c.client_id]
            model.intra_encoder.load_state_dict(server_encoder)
            model.to(device)
            metrics = eval_metrics_hu(model, c.val_loader, device, args.trend_weight, args.mse_weight, args.target_scale)
            post_val_rows.append((c.client_id, metrics))
            val_weights.append(max(metrics["n_samples"], 1))
            models[c.client_id] = model.cpu()

        va_loss = float(np.average([m["val_loss"] for _, m in post_val_rows], weights=val_weights))
        va_rmse = float(np.average([m["val_rmse"] for _, m in post_val_rows], weights=val_weights))
        va_mae = float(np.average([m["val_mae"] for _, m in post_val_rows], weights=val_weights))
        round_metrics = {"val_loss": va_loss, "val_rmse": va_rmse, "val_mae": va_mae}
        score = checkpoint_score(round_metrics, args.proposed_best_metric)
        is_best_round = False
        if args.proposed_use_best_round and metric_is_better(score, best_score):
            best_score = score
            best_round = rnd
            best_server_encoder = copy.deepcopy(server_encoder)
            best_model_states = {cid: copy.deepcopy(m.state_dict()) for cid, m in models.items()}
            rounds_without_improvement = 0
            is_best_round = True
        elif args.proposed_use_best_round:
            rounds_without_improvement += 1

        history.append({
            "method": "proposed",
            "phase": "post_agg_val",
            "round": rnd,
            "epoch": rnd,
            "client_id": "",
            "train_loss": tr,
            "val_loss": va_loss,
            "val_rmse": va_rmse,
            "val_mae": va_mae,
            "is_best_round": is_best_round,
            "best_round": best_round,
            "personal_ft_best_epoch": np.nan,
        })
        for cid, metrics in post_val_rows:
            history.append({
                "method": "proposed",
                "phase": "post_agg_val",
                "round": rnd,
                "epoch": rnd,
                "client_id": cid,
                "train_loss": np.nan,
                "val_loss": metrics["val_loss"],
                "val_rmse": metrics["val_rmse"],
                "val_mae": metrics["val_mae"],
                "is_best_round": is_best_round,
                "best_round": best_round,
                "personal_ft_best_epoch": np.nan,
            })
        print(f"    weighted_train={tr:.6f} | post_agg_val_loss={va_loss:.6f} | post_agg_val_rmse={va_rmse:.4f} | best_round={best_round}")

        if args.proposed_round_patience > 0 and rounds_without_improvement >= args.proposed_round_patience:
            print(f"    early stop: no {args.proposed_best_metric} improvement for {args.proposed_round_patience} rounds")
            break

    # Load final shared encoder into every local personalized model and save.
    if args.proposed_use_best_round:
        print(f"  using best proposed round {best_round} by {args.proposed_best_metric}={best_score:.6f}")
        server_encoder = best_server_encoder
        for cid, state in best_model_states.items():
            models[cid].load_state_dict(state)

    final_models: Dict[str, nn.Module] = {}
    for c in clients:
        m = models[c.client_id]
        m.intra_encoder.load_state_dict(server_encoder)
        if args.personal_ft_epochs > 0:
            print(f"  final personalization client {c.client_id}")
            m.to(device)
            ft_best_epoch = 0
            ft_best_score = float("inf")
            ft_best_state = copy.deepcopy(m.state_dict())
            if args.personal_ft_freeze_intra:
                for p in m.intra_encoder.parameters():
                    p.requires_grad = False
                ft_params = list(m.film.parameters()) + list(m.inter_encoder.parameters()) + list(m.head.parameters())
                if getattr(m, "meta_encoder", None) is not None:
                    ft_params += list(m.meta_encoder.parameters())
            else:
                for p in m.parameters():
                    p.requires_grad = True
                ft_params = list(m.parameters())
            optimizer = torch.optim.AdamW(ft_params, lr=args.personal_ft_lr, weight_decay=args.weight_decay)
            ft_train_loss = 0.0
            for ft_epoch in range(1, args.personal_ft_epochs + 1):
                ft_train_loss = train_one_epoch_hu(m, c.train_loader, optimizer, device, args.trend_weight, args.grad_clip, args.mse_weight)
                ft_metrics = eval_metrics_hu(m, c.val_loader, device, args.trend_weight, args.mse_weight, args.target_scale)
                ft_score = checkpoint_score(ft_metrics, args.personal_ft_best_metric)
                is_best_ft = metric_is_better(ft_score, ft_best_score)
                if is_best_ft:
                    ft_best_score = ft_score
                    ft_best_epoch = ft_epoch
                    ft_best_state = copy.deepcopy(m.state_dict())
                history.append({
                    "method": "proposed",
                    "phase": "personal_ft",
                    "client_id": c.client_id,
                    "round": best_round if args.proposed_use_best_round else completed_round,
                    "epoch": ft_epoch,
                    "train_loss": ft_train_loss,
                    "val_loss": ft_metrics["val_loss"],
                    "val_rmse": ft_metrics["val_rmse"],
                    "val_mae": ft_metrics["val_mae"],
                    "is_best_round": False,
                    "best_round": best_round,
                    "personal_ft_best_epoch": ft_best_epoch,
                })
            if args.personal_ft_use_best and ft_best_epoch > 0:
                m.load_state_dict(ft_best_state)
            for p in m.parameters():
                p.requires_grad = True
        final_models[c.client_id] = m.cpu()
        torch.save(m.state_dict(), model_dir / f"proposed_client_{c.client_id}.pt")
    torch.save(server_encoder, out_dir / "proposed_shared_intra_encoder.pt")
    return final_models, pd.DataFrame(history)


# -----------------------------
# Plotting
# -----------------------------


def save_prediction_plot(preds: np.ndarray, targets: np.ndarray, stds: Optional[np.ndarray], save_path: Path, title: str) -> None:
    horizon = targets.shape[1]
    fig, axes = plt.subplots(horizon, 1, figsize=(14, 3.5 * horizon), squeeze=False)
    axes = axes[:, 0]
    x = np.arange(len(targets))
    for h in range(horizon):
        ax = axes[h]
        ax.plot(x, targets[:, h], label="Actual", linewidth=1.5)
        ax.plot(x, preds[:, h], label="Predicted", linewidth=1.2, linestyle="--")
        if stds is not None:
            lo = preds[:, h] - 2.0 * stds[:, h]
            hi = preds[:, h] + 2.0 * stds[:, h]
            ax.fill_between(x, lo, hi, alpha=0.15, label="±2σ" if h == 0 else None)
        ax.set_ylabel(f"H{h+1} SOH (%)")
        ax.set_title(f"{title} | H{h+1} RMSE={rmse_np(targets[:, h], preds[:, h]):.3f}, MAE={mae_np(targets[:, h], preds[:, h]):.3f}")
        ax.grid(True, linestyle=":", alpha=0.5)
        ax.legend(loc="best")
    axes[-1].set_xlabel("Test window index")
    fig.tight_layout()
    ensure_dir(save_path.parent)
    fig.savefig(save_path, dpi=250, bbox_inches="tight")
    plt.close(fig)


def plot_training_history(history_df: pd.DataFrame, save_path: Path) -> None:
    if history_df.empty:
        return
    plot_df = history_df.copy()
    if "phase" in plot_df.columns:
        plot_df = plot_df[plot_df["phase"].isna() | plot_df["phase"].isin(["", "fl_round", "post_agg_val"])]
    if "client_id" in plot_df.columns:
        client_id = plot_df["client_id"].fillna("")
        aggregate_mask = client_id.eq("")
        # Local-only has one row per client by design; proposed post-aggregation rows also
        # include an aggregate row, so prefer that aggregate row for the global curve.
        plot_df = plot_df[aggregate_mask | plot_df["method"].eq("local")]
    if plot_df.empty:
        return
    fig, ax = plt.subplots(figsize=(12, 6))
    for method in sorted(plot_df["method"].dropna().unique()):
        sub = plot_df[plot_df["method"] == method].copy()
        # For local-only, average over clients per epoch.
        sub = sub.groupby("epoch", as_index=False)[["train_loss", "val_loss"]].mean()
        ax.plot(sub["epoch"], sub["train_loss"], label=f"{method} train", linestyle="-")
        ax.plot(sub["epoch"], sub["val_loss"], label=f"{method} val", linestyle="--")
    ax.set_xlabel("Epoch / FL round")
    ax.set_ylabel("Training objective")
    ax.set_title("Training curves")
    ax.grid(True, linestyle=":", alpha=0.5)
    ax.legend(loc="best")
    fig.tight_layout()
    ensure_dir(save_path.parent)
    fig.savefig(save_path, dpi=250, bbox_inches="tight")
    plt.close(fig)


def plot_method_summary(metrics_df: pd.DataFrame, save_path: Path) -> None:
    if metrics_df.empty:
        return
    summary = metrics_df.groupby("method", as_index=False).agg(
        macro_mae=("avg_mae", "mean"),
        macro_rmse=("avg_rmse", "mean"),
    )
    fig, ax = plt.subplots(figsize=(10, 6))
    x = np.arange(len(summary))
    width = 0.35
    ax.bar(x - width / 2, summary["macro_mae"], width, label="MAE")
    ax.bar(x + width / 2, summary["macro_rmse"], width, label="RMSE")
    ax.set_xticks(x)
    ax.set_xticklabels(summary["method"], rotation=20, ha="right")
    ax.set_ylabel("SOH error (%)")
    ax.set_title("Macro-average test error by method")
    ax.grid(True, axis="y", linestyle=":", alpha=0.5)
    ax.legend()
    fig.tight_layout()
    ensure_dir(save_path.parent)
    fig.savefig(save_path, dpi=250, bbox_inches="tight")
    plt.close(fig)


def plot_client_rmse(metrics_df: pd.DataFrame, save_path: Path) -> None:
    if metrics_df.empty:
        return
    pivot = metrics_df.pivot(index="client_id", columns="method", values="avg_rmse").sort_index(key=lambda s: s.astype(int))
    fig, ax = plt.subplots(figsize=(14, 6))
    pivot.plot(kind="bar", ax=ax)
    ax.set_xlabel("Client / vehicle")
    ax.set_ylabel("Average RMSE across horizons (%)")
    ax.set_title("Vehicle-wise test RMSE")
    ax.grid(True, axis="y", linestyle=":", alpha=0.5)
    fig.tight_layout()
    ensure_dir(save_path.parent)
    fig.savefig(save_path, dpi=250, bbox_inches="tight")
    plt.close(fig)


def plot_horizon_errors(metrics_df: pd.DataFrame, save_path: Path) -> None:
    if metrics_df.empty:
        return
    records = []
    for method, sub in metrics_df.groupby("method"):
        for h in [1, 2, 3]:
            col = f"rmse_h{h}"
            if col in sub.columns:
                records.append({"method": method, "horizon": f"H{h}", "rmse": sub[col].mean()})
    df = pd.DataFrame(records)
    if df.empty:
        return
    methods = list(df["method"].unique())
    horizons = ["H1", "H2", "H3"]
    x = np.arange(len(methods))
    width = 0.25
    fig, ax = plt.subplots(figsize=(11, 6))
    for i, h in enumerate(horizons):
        vals = [df[(df["method"] == m) & (df["horizon"] == h)]["rmse"].mean() for m in methods]
        ax.bar(x + (i - 1) * width, vals, width, label=h)
    ax.set_xticks(x)
    ax.set_xticklabels(methods, rotation=20, ha="right")
    ax.set_ylabel("RMSE (%)")
    ax.set_title("Horizon-wise macro RMSE")
    ax.grid(True, axis="y", linestyle=":", alpha=0.5)
    ax.legend()
    fig.tight_layout()
    ensure_dir(save_path.parent)
    fig.savefig(save_path, dpi=250, bbox_inches="tight")
    plt.close(fig)


def merge_results(run_dirs: Sequence[str | Path], out_dir: str | Path) -> None:
    """Merge result CSVs from separately executed method runs.

    This is a lightweight utility for notebooks or a small wrapper script; the training
    CLI does not call it automatically.
    """
    out_path = Path(out_dir)
    ensure_dir(out_path)
    frames_by_name: Dict[str, List[pd.DataFrame]] = {
        "test_metrics_by_client.csv": [],
        "test_metrics_summary.csv": [],
        "training_history.csv": [],
    }

    for run_dir in run_dirs:
        run_path = Path(run_dir)
        for name in frames_by_name:
            csv_path = run_path / name
            if not csv_path.exists():
                continue
            df = pd.read_csv(csv_path)
            df.insert(0, "source_run", run_path.name)
            frames_by_name[name].append(df)

    for name, frames in frames_by_name.items():
        if frames:
            pd.concat(frames, ignore_index=True).to_csv(out_path / name, index=False)


# -----------------------------
# Main
# -----------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train centralized/local/FedAvg/proposed Partial FiLM-HU pFL models for EV SOH prediction.")
    p.add_argument("--data_dir", type=str, default="./processed_ev_soh_v2_3_min5_purge_meta")
    p.add_argument("--out_dir", type=str, default="./training_results_v2_3")
    p.add_argument("--methods", type=str, default="centralized,local,fedavg,proposed",
                   help="Comma-separated subset of centralized,local,fedavg,proposed")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--isolate_methods", action=argparse.BooleanOptionalAction, default=True,
                   help="Reload clients/DataLoaders and reset RNG before each method.")
    p.add_argument("--method_seed_mode", type=str, default="same", choices=["same", "offset"],
                   help="same: every method starts from --seed; offset: method-specific seed offsets.")
    p.add_argument("--device", type=str, default="auto", choices=["auto", "cpu", "cuda"])
    p.add_argument("--use_session_meta", action="store_true", default=False,
                   help="Load session_meta_scaled and use lookback-only metadata.")
    p.add_argument("--meta_mode", type=str, default="film", choices=["concat_head", "film", "both"],
                   help="Metadata integration mode for proposed. Baselines use concat_head when metadata is enabled.")
    p.add_argument("--meta_embedding_dim", type=int, default=0,
                   help="Metadata embedding dimension. 0 means --hidden_dim.")
    p.add_argument("--film_gamma_scale", type=float, default=0.1,
                   help="Scale for identity-safe FiLM gamma.")
    p.add_argument("--film_beta_scale", type=float, default=0.1,
                   help="Scale for identity-safe FiLM beta.")
    p.add_argument("--max_clients", type=int, default=0, help="0 means all clients. Useful for smoke tests.")
    p.add_argument("--num_workers", type=int, default=0)
    p.add_argument("--batch_size", type=int, default=64)
    p.add_argument("--hidden_dim", type=int, default=64)
    p.add_argument("--session_encoder", type=str, default="cnn", choices=["cnn", "gru"], help="cnn is faster and default; gru is closer to team prototype.")
    p.add_argument("--torch_threads", type=int, default=0, help="0 keeps PyTorch default; set 2-4 for CPU stability.")
    p.add_argument("--dropout", type=float, default=0.10)
    p.add_argument("--target_scale", type=float, default=100.0, help="SOH percent is divided by this during training.")
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--shared_lr", type=float, default=None, help="Proposed-only LR for shared intra-cycle encoder. Defaults to --lr.")
    p.add_argument("--local_lr", type=float, default=None, help="Proposed-only LR for FiLM/inter-cycle/head. Defaults to --lr.")
    p.add_argument("--weight_decay", type=float, default=1e-4)
    p.add_argument("--grad_clip", type=float, default=5.0)
    p.add_argument("--trend_weight", type=float, default=0.03, help="First-version trend loss weight. Set 0 to disable.")
    p.add_argument("--mse_weight", type=float, default=0.0, help="Optional MSE auxiliary loss weight.")
    p.add_argument("--fedavg_use_best_round", dest="fedavg_use_best_round", action="store_true", default=True,
                   help="Use the best FedAvg FL round checkpoint for final evaluation.")
    p.add_argument("--no_fedavg_use_best_round", dest="fedavg_use_best_round", action="store_false",
                   help="Disable best FedAvg FL round checkpoint selection.")
    p.add_argument("--fedavg_best_metric", type=str, default="val_rmse", choices=["val_rmse", "val_loss"],
                   help="Metric used to select the best FedAvg FL round.")
    p.add_argument("--personal_ft_epochs", type=int, default=0, help="Proposed-only final personalization epochs after loading final shared encoder.")
    p.add_argument("--personal_ft_lr", type=float, default=1e-3, help="LR for proposed final personalization.")
    p.add_argument("--personal_ft_freeze_intra", action=argparse.BooleanOptionalAction, default=True,
                   help="Freeze proposed intra-cycle encoder during final personalization.")
    p.add_argument("--proposed_use_best_round", dest="proposed_use_best_round", action="store_true", default=True,
                   help="Use the best proposed FL round checkpoint for final evaluation.")
    p.add_argument("--no_proposed_use_best_round", dest="proposed_use_best_round", action="store_false",
                   help="Disable best proposed FL round checkpoint selection.")
    p.add_argument("--proposed_best_metric", type=str, default="val_rmse", choices=["val_rmse", "val_loss"],
                   help="Metric used to select the best proposed FL round.")
    p.add_argument("--proposed_round_patience", type=int, default=0,
                   help="Proposed round early stopping patience. 0 disables early stopping.")
    p.add_argument("--personal_ft_use_best", dest="personal_ft_use_best", action="store_true", default=True,
                   help="Use each client's best final-personalization checkpoint.")
    p.add_argument("--no_personal_ft_use_best", dest="personal_ft_use_best", action="store_false",
                   help="Disable best final-personalization checkpoint selection.")
    p.add_argument("--personal_ft_best_metric", type=str, default="val_rmse", choices=["val_rmse", "val_loss"],
                   help="Metric used to select each client's best final-personalization checkpoint.")
    p.add_argument("--central_epochs", type=int, default=25)
    p.add_argument("--local_only_epochs", type=int, default=15)
    p.add_argument("--global_rounds", type=int, default=20)
    p.add_argument("--local_epochs", type=int, default=2)
    p.add_argument("--patience", type=int, default=5)
    p.add_argument("--plot_predictions", action="store_true", default=True)
    p.add_argument("--no_plot_predictions", dest="plot_predictions", action="store_false")
    p.add_argument("--plot_all_clients", action="store_true", default=False,
                   help="If false, proposed plots all clients and other methods plot max_plot_clients only.")
    p.add_argument("--max_plot_clients", type=int, default=3)
    return p.parse_args()


def main() -> None:
    args = parse_args()
    if args.shared_lr is None:
        args.shared_lr = args.lr
    if args.local_lr is None:
        args.local_lr = args.lr
    if args.meta_embedding_dim <= 0:
        args.meta_embedding_dim = args.hidden_dim
    if args.torch_threads and args.torch_threads > 0:
        torch.set_num_threads(args.torch_threads)
    set_seed(args.seed)
    data_dir = Path(args.data_dir)
    out_dir = Path(args.out_dir)
    ensure_dir(out_dir)
    ensure_dir(out_dir / "plots")

    if args.device == "auto":
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    else:
        device = torch.device(args.device)
    print(f"[INFO] device={device}")

    methods = [m.strip().lower() for m in args.methods.split(",") if m.strip()]
    valid_methods = {"centralized", "local", "fedavg", "proposed"}
    unknown = [m for m in methods if m not in valid_methods]
    if unknown:
        raise ValueError(f"Unknown methods: {unknown}. Valid methods: {sorted(valid_methods)}")
    if args.use_session_meta and args.meta_mode in {"film", "both"} and any(m in methods for m in ["centralized", "local", "fedavg"]):
        print("[INFO] centralized/local/fedavg use session metadata through concat_head for fair access; meta_mode applies to proposed.")

    method_seeds = build_method_seeds(args.seed, args.method_seed_mode)
    metadata_clients = load_clients(
        data_dir, args.batch_size, args.target_scale, args.num_workers, args.max_clients,
        loader_seed=args.seed, use_session_meta=args.use_session_meta
    )
    input_dim, seq_len, lookback, horizon = validate_client_metadata(metadata_clients)
    meta_input_dim = get_meta_input_dim(metadata_clients)
    print(f"[INFO] loaded clients={len(metadata_clients)}, input_dim={input_dim}, seq_len={seq_len}, lookback={lookback}, horizon={horizon}")
    print(f"[INFO] use_session_meta={args.use_session_meta}, meta_input_dim={meta_input_dim}, meta_mode={args.meta_mode}")
    print(f"[INFO] meta_embedding_dim={args.meta_embedding_dim}, film_gamma_scale={args.film_gamma_scale}, film_beta_scale={args.film_beta_scale}")
    print(f"[INFO] film_identity_init=True, proposed_uses_both_meta={args.use_session_meta and args.meta_mode == 'both'}")
    print(f"[INFO] method seeds={method_seeds}")
    print(f"[INFO] isolate_methods={args.isolate_methods}, method_seed_mode={args.method_seed_mode}")
    print("[INFO] train/val/test windows per client:")
    for c in metadata_clients:
        print(f"  client {c.client_id}: train={len(c.train)}, val={len(c.val)}, test={len(c.test)}")

    shared_clients = None if args.isolate_methods else metadata_clients
    if args.isolate_methods:
        del metadata_clients
        release_memory()

    with open(out_dir / "training_config.json", "w", encoding="utf-8") as f:
        json.dump({
            **vars(args),
            "input_dim": input_dim,
            "horizon": horizon,
            "lookback": lookback,
            "seq_len": seq_len,
            "meta_input_dim": meta_input_dim,
            "film_identity_init": True,
            "proposed_uses_both_meta": bool(args.use_session_meta and args.meta_mode == "both"),
            "method_seeds": method_seeds,
        }, f, indent=2, ensure_ascii=False)

    all_histories = []
    all_metrics = []

    def prepare_method_clients(method: str) -> List[ClientData]:
        method_seed = reset_method_seed(method, method_seeds)
        if args.isolate_methods:
            clients_for_method = load_clients(
                data_dir,
                args.batch_size,
                args.target_scale,
                args.num_workers,
                args.max_clients,
                loader_seed=method_seed,
                use_session_meta=args.use_session_meta,
            )
            validate_client_metadata(clients_for_method)
            return clients_for_method
        if shared_clients is None:
            raise RuntimeError("shared_clients is not initialized")
        return shared_clients

    if "centralized" in methods:
        clients = prepare_method_clients("centralized")
        model, hist = train_centralized(clients, input_dim, horizon, meta_input_dim, args, device, out_dir)
        all_histories.append(hist)
        met, _ = evaluate_clients("centralized", model, clients, device, args.target_scale, out_dir,
                                  args.plot_predictions, args.plot_all_clients, args.max_plot_clients)
        all_metrics.append(met)
        del model
        if args.isolate_methods:
            del clients
        release_memory()

    if "local" in methods:
        clients = prepare_method_clients("local")
        models, hist = train_local_only(clients, input_dim, horizon, meta_input_dim, args, device, out_dir)
        all_histories.append(hist)
        met, _ = evaluate_clients("local", models, clients, device, args.target_scale, out_dir,
                                  args.plot_predictions, args.plot_all_clients, args.max_plot_clients)
        all_metrics.append(met)
        del models
        if args.isolate_methods:
            del clients
        release_memory()

    if "fedavg" in methods:
        clients = prepare_method_clients("fedavg")
        model, hist = train_fedavg(clients, input_dim, horizon, meta_input_dim, args, device, out_dir)
        all_histories.append(hist)
        met, _ = evaluate_clients("fedavg", model, clients, device, args.target_scale, out_dir,
                                  args.plot_predictions, args.plot_all_clients, args.max_plot_clients)
        all_metrics.append(met)
        del model
        if args.isolate_methods:
            del clients
        release_memory()

    if "proposed" in methods:
        clients = prepare_method_clients("proposed")
        models, hist = train_proposed_partial(clients, input_dim, horizon, meta_input_dim, args, device, out_dir)
        all_histories.append(hist)
        met, _ = evaluate_clients("proposed", models, clients, device, args.target_scale, out_dir,
                                  args.plot_predictions, True if not args.plot_all_clients else True, args.max_plot_clients)
        all_metrics.append(met)
        del models
        if args.isolate_methods:
            del clients
        release_memory()

    history_df = pd.concat(all_histories, ignore_index=True) if all_histories else pd.DataFrame()
    metrics_df = pd.concat(all_metrics, ignore_index=True) if all_metrics else pd.DataFrame()
    history_df.to_csv(out_dir / "training_history.csv", index=False)
    metrics_df.to_csv(out_dir / "test_metrics_by_client.csv", index=False)

    if not metrics_df.empty:
        method_summary = metrics_df.groupby("method", as_index=False).agg(
            macro_mae=("avg_mae", "mean"),
            macro_rmse=("avg_rmse", "mean"),
            micro_samples=("n_samples", "sum"),
        )
        # Micro metrics are computed from client-wise weighted averages for compact reporting.
        weighted_rows = []
        for method, sub in metrics_df.groupby("method"):
            w = sub["n_samples"].to_numpy(dtype=np.float64)
            weighted_rows.append({
                "method": method,
                "weighted_avg_mae": float(np.average(sub["avg_mae"], weights=w)),
                "weighted_avg_rmse": float(np.average(sub["avg_rmse"], weights=w)),
            })
        method_summary = method_summary.merge(pd.DataFrame(weighted_rows), on="method", how="left")
        method_summary.to_csv(out_dir / "test_metrics_summary.csv", index=False)
        print("\n[RESULT] method summary")
        print(method_summary.to_string(index=False))

    plot_training_history(history_df, out_dir / "plots" / "training_curves.png")
    plot_method_summary(metrics_df, out_dir / "plots" / "method_macro_error.png")
    plot_client_rmse(metrics_df, out_dir / "plots" / "client_rmse_by_method.png")
    plot_horizon_errors(metrics_df, out_dir / "plots" / "horizon_rmse_by_method.png")

    print("\n[DONE] training finished")
    print(f"[DONE] outputs saved to: {out_dir.resolve()}")
    print("[DONE] key files:")
    print(f"  - {out_dir / 'test_metrics_summary.csv'}")
    print(f"  - {out_dir / 'test_metrics_by_client.csv'}")
    print(f"  - {out_dir / 'training_history.csv'}")
    print(f"  - {out_dir / 'plots' / 'training_curves.png'}")
    print(f"  - {out_dir / 'plots' / 'method_macro_error.png'}")
    print(f"  - {out_dir / 'plots' / 'client_rmse_by_method.png'}")
    print(f"  - {out_dir / 'plots' / 'horizon_rmse_by_method.png'}")


if __name__ == "__main__":
    main()
