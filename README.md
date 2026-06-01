# EV Battery Service UI

이 프로젝트는 정적 HTML/CSS/JS로 만든 서비스 UI 프로토타입입니다.

## 페이지

- [사용자 페이지](/d:/30_Dev/00_Workspace/02_University/2026Capstone/index.html)
- [관리자 페이지](/d:/30_Dev/00_Workspace/02_University/2026Capstone/admin.html)

## 실행

가장 간단한 방법은 프로젝트 폴더의 `start-dashboard.cmd`를 더블 클릭하는 것입니다.
로컬 서버가 시작되고 사용자 페이지가 브라우저에서 열립니다.

직접 실행하려면 아래 명령을 사용할 수 있습니다.

```powershell
.\start-dashboard.cmd
```

브라우저에서 아래 주소로 접속하면 됩니다.

- `http://127.0.0.1:4173/index.html`
- `http://127.0.0.1:4173/admin.html`

대시보드 데이터는 JSON 파일로 분리되어 있으므로 브라우저의 `file://` 정책을 피하기 위해 로컬 서버 주소로 접속해야 합니다.

## 데이터

- `data/user-dashboard.json`: 사용자 페이지의 Client 09 SOH 예측값과 센서 요약값입니다.
- `data/admin-dashboard.json`: 관리자 페이지의 실제 평가 지표와 고정 FL 모니터링 replay입니다.
- AI 팀이 전달한 원본 폴더는 사이트 실행에 필요하지 않으며, 대시보드는 위 두 JSON 파일만 읽습니다.
