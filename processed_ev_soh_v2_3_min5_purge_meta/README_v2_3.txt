EV SOH preprocessing v2_3_min5_purge_meta
- 기존 processed_ev_soh/는 수정하지 않습니다.
- 기본 min_delta_soc=5.0 입니다.
- 기본 split은 purged_time_split이며 purge_gap=lookback+horizon-1 입니다.
- SOH smoothing은 causal/trailing median만 사용합니다. window=10/20/50은 추후 ablation 후보입니다.
- session_meta/session_meta_scaled는 세션 내부 관측값으로만 계산됩니다.
- session_meta scaler는 train sessions만 사용해 fit합니다.
