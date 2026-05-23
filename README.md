# EV Battery Service UI

이 프로젝트는 정적 HTML/CSS/JS로 만든 서비스 UI 프로토타입입니다.

## 페이지

- [사용자 페이지](/d:/30_Dev/00_Workspace/02_University/2026Capstone/index.html)
- [관리자 페이지](/d:/30_Dev/00_Workspace/02_University/2026Capstone/admin.html)

## 실행

```powershell
python -m http.server 8000
```

브라우저에서 아래 주소로 접속하면 됩니다.

- `http://localhost:8000/index.html`
- `http://localhost:8000/admin.html`

## 주요 자산

- [assets/car-ghost.png](/d:/30_Dev/00_Workspace/02_University/2026Capstone/assets/car-ghost.png)
- [assets/battery-pack.png](/d:/30_Dev/00_Workspace/02_University/2026Capstone/assets/battery-pack.png)

사용자 페이지는 배터리 상태 전환, 알림, 인증서 발급 모달을 포함하고 있고, 관리자 페이지는 연합학습 운영 현황을 3개 대시보드 블록으로 보여줍니다.
