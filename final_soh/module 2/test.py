from thermal_detector import EnhancedThermalDetector, simulate_temperature_profile
import numpy as np

def run_improved_test():
    scenarios = ['normal', 'fast_charge', 'thermal_runaway']
    
    print("="*70)
    print("개선된 감지 테스트 (Warmup=30s)")
    print("="*70)
    
    for scenario in scenarios:
        print(f"\n[{scenario.upper()}]")
        
        detector = EnhancedThermalDetector(
            gamma1=1.5,
            gamma2=0.3,
            warmup_period=30,
            enable_logging=False
        )
        
        temps = simulate_temperature_profile(scenario, duration=600)
        
        for i, T in enumerate(temps):
            detector.update(T, timestamp=i)
        
        stats = detector.get_statistics()
        
        print(f"  총 검사: {stats['total_checks']}")
        print(f"  총 경고: {stats['total_alerts']}")
        print(f"  경고율: {stats['alert_rate']:.1f}%")
        
        warmup_period = 30
        total_after_warmup = stats['total_checks'] - warmup_period
        alerts_after_warmup = len([
            a for a in stats['alert_history'] 
            if a['timestamp'] >= warmup_period
        ])
        
        adjusted_rate = (alerts_after_warmup / total_after_warmup * 100) if total_after_warmup > 0 else 0
        
        print(f"  조정 경고율 (warmup 제외): {adjusted_rate:.1f}%")
        
        if stats['alert_history']:
            first_alert = stats['alert_history'][0]
            print(
                f"  첫 경고: {first_alert['timestamp']:.0f}초, "
                f"T={first_alert['temperature']:.1f}°C, "
                f"severity={first_alert['severity']}"
            )

if __name__ == "__main__":
    run_improved_test()