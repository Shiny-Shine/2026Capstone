from collections import deque
import time
import json
import logging
from typing import Tuple, Optional, Dict, List
import numpy as np

class EnhancedThermalDetector:
    def __init__(
        self,
        gamma1: float = 1.5,
        gamma2: float = 0.3,
        delta_t: float = 1.0,
        window_size: int = 5,
        enable_logging: bool = True,
        log_file: Optional[str] = None,
        warmup_period: int = 30
    ):
        self.γ1 = gamma1
        self.γ2 = gamma2
        self.Δt = delta_t
        self.warmup_period = warmup_period
        
        self.TEMP_WARNING = 55.0
        self.TEMP_CRITICAL = 65.0
        self.TEMP_EMERGENCY = 80.0
        
        self.temp_window = deque(maxlen=max(window_size, 5))
        
        self.total_checks = 0
        self.total_alerts = 0
        self.alert_history = []
        self.results_history = []
        
        self.logger = self._setup_logger(enable_logging, log_file)
        self.logger.info(f"EnhancedThermalDetector 초기화: γ1={gamma1}, γ2={gamma2}, warmup={warmup_period}s")

    def _setup_logger(self, enable: bool, log_file: Optional[str]) -> logging.Logger:
        logger = logging.getLogger('EnhancedThermalDetector')
        logger.setLevel(logging.INFO if enable else logging.WARNING)
        logger.handlers.clear()
        
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
        
        if log_file:
            file_handler = logging.FileHandler(log_file)
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        
        return logger

    def update(
        self, 
        temperature: float, 
        timestamp: Optional[float] = None,
        metadata: Optional[Dict] = None
    ) -> Dict:
        self.temp_window.append(temperature)
        self.total_checks += 1
        
        current_time = timestamp or time.time()
        
        if self.total_checks <= self.warmup_period:
            result = {
                'alert': False,
                'severity': 'initializing',
                'v_T': 0.0,
                'a_T': 0.0,
                'temperature': temperature,
                'timestamp': current_time,
                'message': f'Warmup period ({self.total_checks}/{self.warmup_period})',
                'metadata': metadata or {}
            }
            self.results_history.append(result)
            return result
        
        if len(self.temp_window) < 5:
            result = {
                'alert': False,
                'severity': 'initializing',
                'v_T': 0.0,
                'a_T': 0.0,
                'temperature': temperature,
                'timestamp': current_time,
                'message': f'Collecting data ({len(self.temp_window)}/5)',
                'metadata': metadata or {}
            }
            self.results_history.append(result)
            return result
        
        T = list(self.temp_window)
        v_T = self._compute_velocity(T)
        a_T = self._compute_acceleration(T)
        
        alert, severity, trigger = self._multi_level_evaluation(temperature, v_T, a_T)
        
        if alert:
            self.total_alerts += 1
            self.alert_history.append({
                'timestamp': current_time,
                'temperature': temperature,
                'v_T': v_T,
                'a_T': a_T,
                'severity': severity,
                'trigger': trigger
            })
        
        result = {
            'alert': alert,
            'severity': severity,
            'trigger': trigger,
            'v_T': v_T,
            'a_T': a_T,
            'temperature': temperature,
            'timestamp': current_time,
            'message': self._generate_message(v_T, a_T, severity, temperature),
            'metadata': metadata or {}
        }
        
        self.results_history.append(result)
        return result

    def _compute_velocity(self, T: List[float]) -> float:
        if len(T) < 2:
            return 0.0
        v_T = (T[-1] - T[-2]) / self.Δt
        return float(v_T)

    def _compute_acceleration(self, T: List[float]) -> float:
        if len(T) < 5:
            return 0.0
        
        a_T_values = []
        
        a1 = (T[2] - 2*T[1] + T[0]) / (self.Δt ** 2)
        a_T_values.append(a1)
        
        a2 = (T[3] - 2*T[2] + T[1]) / (self.Δt ** 2)
        a_T_values.append(a2)
        
        a3 = (T[4] - 2*T[3] + T[2]) / (self.Δt ** 2)
        a_T_values.append(a3)
        
        mean_a_T = float(np.mean(a_T_values))
        return mean_a_T

    def _multi_level_evaluation(
        self, 
        T: float, 
        v_T: float, 
        a_T: float
    ) -> Tuple[bool, str, str]:
        if T >= self.TEMP_EMERGENCY:
            return True, 'emergency', 'temperature'
        
        temp_critical = (T >= self.TEMP_CRITICAL)
        deriv_critical = (v_T > self.γ1) and (a_T > self.γ2)
        
        if temp_critical or deriv_critical:
            if temp_critical and deriv_critical:
                trigger = 'both'
            elif temp_critical:
                trigger = 'temperature'
            else:
                trigger = 'derivative'
            return True, 'critical', trigger
        
        temp_warning = (T >= self.TEMP_WARNING)
        deriv_warning = (v_T > 0.75 * self.γ1) and (a_T > 0.6 * self.γ2)
        
        if temp_warning or deriv_warning:
            if temp_warning and deriv_warning:
                trigger = 'both'
            elif temp_warning:
                trigger = 'temperature'
            else:
                trigger = 'derivative'
            return True, 'warning', trigger
        
        return False, 'safe', 'none'

    def _generate_message(self, v_T: float, a_T: float, severity: str, T: float) -> str:
        if severity == 'emergency':
            return f"🔥 EMERGENCY! T={T:.1f}°C (Limit: 80°C) - IMMEDIATE SHUTDOWN"
        elif severity == 'critical':
            return f"🚨 CRITICAL! T={T:.1f}°C, v_T={v_T:.2f}°C/s, a_T={a_T:.3f}°C/s²"
        elif severity == 'warning':
            return f"⚠️ WARNING! T={T:.1f}°C, v_T={v_T:.2f}°C/s, a_T={a_T:.3f}°C/s²"
        else:
            return f"✅ SAFE. T={T:.1f}°C"

    def get_statistics(self) -> Dict:
        alert_rate = (self.total_alerts / max(self.total_checks, 1)) * 100
        return {
            'total_checks': self.total_checks,
            'total_alerts': self.total_alerts,
            'alert_rate': alert_rate,
            'alert_history': self.alert_history,
            'results_history': self.results_history
        }

    def reset(self):
        self.temp_window.clear()
        self.total_checks = 0
        self.total_alerts = 0
        self.alert_history.clear()
        self.results_history.clear()
        self.logger.info("리셋 완료")

class ThermalAnomalyDetector(EnhancedThermalDetector):
    pass

def simulate_temperature_profile(
    scenario: str = 'normal',
    duration: int = 600,
    sampling_rate: float = 1.0,
    noise_std: float = 0.5
) -> np.ndarray:
    t = np.arange(0, duration, sampling_rate)
    
    if scenario == 'normal':
        temp = 25 + 10 * t / duration
    elif scenario == 'fast_charge':
        temp = 25 + 20 * t / duration
    elif scenario == 'thermal_runaway':
        temp = 25 + 225 * (np.exp(t / (duration/4)) - 1) / (np.exp(4) - 1)
    else:
        raise ValueError(f"Unknown scenario: {scenario}")
    
    noise = np.random.normal(0, noise_std, len(temp))
    temp = np.maximum(temp + noise, 20)
    
    return temp

if __name__ == "__main__":
    print("="*70)
    print("ThermalDetector 모듈 테스트")
    print("="*70)
    
    detector = EnhancedThermalDetector(warmup_period=10, enable_logging=False)
    temps = simulate_temperature_profile('normal', duration=100)
    
    print(f"\n[정상 충전 시뮬레이션]")
    alert_count = 0
    
    for i, T in enumerate(temps):
        result = detector.update(T, timestamp=i)
        if result['alert']:
            alert_count += 1
            print(f"[{i:3d}s] {result['message']}")
    
    stats = detector.get_statistics()
    print(f"\n총 검사: {stats['total_checks']}, 총 경고: {stats['total_alerts']} ({stats['alert_rate']:.1f}%)")
    print("✅ 모듈 정상 작동!")