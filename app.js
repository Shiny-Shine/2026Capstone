const mockTelemetry = [
  {
    cycle: 128,
    time: "10:00",
    soh: 92.4,
    predictedSoh: 92.2,
    uncertaintyLower: 91.8,
    uncertaintyUpper: 92.6,
    temperature: 36.4,
    voltage: 398.6,
    current: 72.1,
    voltageDeviation: 0.08,
    alertScore: 0.16,
  },
  {
    cycle: 129,
    time: "10:03",
    soh: 92.3,
    predictedSoh: 92.1,
    uncertaintyLower: 91.6,
    uncertaintyUpper: 92.7,
    temperature: 38.2,
    voltage: 399.1,
    current: 84.8,
    voltageDeviation: 0.1,
    alertScore: 0.19,
  },
  {
    cycle: 130,
    time: "10:06",
    soh: 92.2,
    predictedSoh: 91.9,
    uncertaintyLower: 91.3,
    uncertaintyUpper: 92.6,
    temperature: 41.8,
    voltage: 400.2,
    current: 102.4,
    voltageDeviation: 0.13,
    alertScore: 0.28,
  },
  {
    cycle: 131,
    time: "10:09",
    soh: 92.0,
    predictedSoh: 91.6,
    uncertaintyLower: 90.8,
    uncertaintyUpper: 92.4,
    temperature: 48.5,
    voltage: 402.4,
    current: 136.2,
    voltageDeviation: 0.2,
    alertScore: 0.39,
  },
  {
    cycle: 132,
    time: "10:12",
    soh: 91.8,
    predictedSoh: 91.1,
    uncertaintyLower: 90.1,
    uncertaintyUpper: 92.2,
    temperature: 53.7,
    voltage: 404.7,
    current: 158.5,
    voltageDeviation: 0.29,
    alertScore: 0.48,
  },
  {
    cycle: 133,
    time: "10:15",
    soh: 91.5,
    predictedSoh: 90.6,
    uncertaintyLower: 89.4,
    uncertaintyUpper: 91.8,
    temperature: 59.1,
    voltage: 407.2,
    current: 174.7,
    voltageDeviation: 0.34,
    alertScore: 0.56,
  },
  {
    cycle: 134,
    time: "10:18",
    soh: 91.2,
    predictedSoh: 89.9,
    uncertaintyLower: 88.3,
    uncertaintyUpper: 91.4,
    temperature: 64.8,
    voltage: 410.6,
    current: 205.3,
    voltageDeviation: 0.44,
    alertScore: 0.67,
  },
  {
    cycle: 135,
    time: "10:21",
    soh: 90.8,
    predictedSoh: 88.7,
    uncertaintyLower: 86.9,
    uncertaintyUpper: 90.8,
    temperature: 72.6,
    voltage: 414.8,
    current: 236.9,
    voltageDeviation: 0.58,
    alertScore: 0.82,
  },
  {
    cycle: 136,
    time: "10:24",
    soh: 90.6,
    predictedSoh: 88.1,
    uncertaintyLower: 86.1,
    uncertaintyUpper: 90.2,
    temperature: 76.3,
    voltage: 416.1,
    current: 248.4,
    voltageDeviation: 0.63,
    alertScore: 0.88,
  },
  {
    cycle: 137,
    time: "10:27",
    soh: 90.5,
    predictedSoh: 89.2,
    uncertaintyLower: 87.9,
    uncertaintyUpper: 90.6,
    temperature: 61.7,
    voltage: 407.8,
    current: 164.2,
    voltageDeviation: 0.31,
    alertScore: 0.52,
  },
  {
    cycle: 138,
    time: "10:30",
    soh: 90.5,
    predictedSoh: 89.8,
    uncertaintyLower: 88.8,
    uncertaintyUpper: 90.7,
    temperature: 49.6,
    voltage: 402.6,
    current: 118.7,
    voltageDeviation: 0.18,
    alertScore: 0.33,
  },
  {
    cycle: 139,
    time: "10:33",
    soh: 90.4,
    predictedSoh: 90.0,
    uncertaintyLower: 89.3,
    uncertaintyUpper: 90.7,
    temperature: 42.1,
    voltage: 399.8,
    current: 92.4,
    voltageDeviation: 0.12,
    alertScore: 0.22,
  },
  {
    cycle: 140,
    time: "10:36",
    soh: 90.4,
    predictedSoh: 90.7,
    uncertaintyLower: 90.1,
    uncertaintyUpper: 91.1,
    temperature: 38.8,
    voltage: 398.9,
    current: 78.6,
    voltageDeviation: 0.09,
    alertScore: 0.18,
  },
];

const stateCopy = {
  normal: {
    badge: "NORMAL",
    label: "정상",
    notificationTitle: "정상 알림",
    notificationAction: "즉시 조치 없음",
    certificateGrade: "Grade A",
    certificateNote: "현재 상태 기준으로 발급 가능한 배터리 인증서 예시 화면입니다.",
  },
  caution: {
    badge: "CAUTION",
    label: "주의",
    notificationTitle: "주의 알림",
    notificationAction: "출력 제한 및 점검 권장",
    certificateGrade: "Issue Locked",
    certificateNote: "주의 상태에서는 배터리 인증서를 발급할 수 없습니다. 정상 상태 복귀 후 다시 시도하세요.",
  },
  warning: {
    badge: "WARNING",
    label: "경고",
    notificationTitle: "경고 알림",
    notificationAction: "즉시 정차 및 관제 연결",
    certificateGrade: "Issue Hold",
    certificateNote: "경고 상태에서는 배터리 인증서를 발급할 수 없습니다. 정비 확인이 우선입니다.",
  },
};

const formatPercent = (value) => `${value.toFixed(1)}%`;
const formatTemp = (value) => `${value.toFixed(1)}°C`;
const formatVolt = (value) => `${value.toFixed(1)}V`;
const formatAmp = (value) => `${value.toFixed(1)}A`;
const formatDeviation = (value) => `${value.toFixed(2)}V`;
const formatScore = (value) => `${Math.round(value * 100)}%`;
const formatDateTime = (date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);

function deriveAlertState(sample) {
  const uncertaintyWidth = sample.uncertaintyUpper - sample.uncertaintyLower;

  if (
    sample.alertScore >= 0.72 ||
    sample.temperature >= 70 ||
    sample.current >= 220 ||
    sample.voltageDeviation >= 0.5 ||
    sample.predictedSoh < 89 ||
    uncertaintyWidth >= 3.4
  ) {
    return "warning";
  }

  if (
    sample.alertScore >= 0.42 ||
    sample.temperature >= 52 ||
    sample.current >= 150 ||
    sample.voltageDeviation >= 0.25 ||
    sample.predictedSoh < 90.5 ||
    uncertaintyWidth >= 1.9
  ) {
    return "caution";
  }

  return "normal";
}

function createStateMessage(stateKey, sample) {
  if (stateKey === "warning") {
    return {
      reasonSummary: `온도 ${formatTemp(sample.temperature)}, 전류 ${formatAmp(sample.current)}, 전압 편차 ${formatDeviation(sample.voltageDeviation)}가 경고 기준에 진입했습니다.`,
      summaryTitle: "즉시 점검 필요",
      summaryBody: "모델 출력값과 센서 지표가 동시에 악화되어 운행 중단 및 정비 확인이 필요한 상태입니다.",
      certificateSummary: "경고 상태에서는 배터리 인증서를 발급할 수 없습니다.",
    };
  }

  if (stateKey === "caution") {
    return {
      reasonSummary: `온도 ${formatTemp(sample.temperature)}와 uncertainty 구간이 증가해 주의 상태로 분류되었습니다.`,
      summaryTitle: "주의 단계 진입",
      summaryBody: "SOH 예측 신뢰 구간과 센서 변화가 커지고 있어 냉각 상태와 충전 패턴 확인이 필요합니다.",
      certificateSummary: "주의 상태에서는 배터리 인증서를 발급할 수 없습니다.",
    };
  }

  return {
    reasonSummary: `SOH ${formatPercent(sample.soh)}, 온도 ${formatTemp(sample.temperature)}로 안정 범위입니다.`,
    summaryTitle: "안정 주행 가능",
    summaryBody: "AI 예측값과 센서 지표가 정상 범위이며 별도 조치가 필요하지 않습니다.",
    certificateSummary: "현재 상태 기준으로 배터리 인증서를 발급할 수 있습니다.",
  };
}

function buildStatusReasons(sample, stateKey) {
  const uncertaintyWidth = sample.uncertaintyUpper - sample.uncertaintyLower;

  if (stateKey === "warning") {
    const reasons = [];
    if (sample.temperature >= 70) reasons.push(`Temperature ${formatTemp(sample.temperature)} exceeds the warning threshold.`);
    if (sample.current >= 220) reasons.push(`Current ${formatAmp(sample.current)} indicates high load.`);
    if (sample.voltageDeviation >= 0.5) reasons.push(`Voltage deviation ${formatDeviation(sample.voltageDeviation)} is above the safe range.`);
    if (sample.alertScore >= 0.72) reasons.push(`Alert Score ${formatScore(sample.alertScore)} requires immediate action.`);
    if (sample.predictedSoh < 89) reasons.push(`Predicted SOH ${formatPercent(sample.predictedSoh)} is below the warning band.`);
    return reasons.slice(0, 3);
  }

  if (stateKey === "caution") {
    const reasons = [];
    if (uncertaintyWidth >= 1.9) reasons.push(`Uncertainty width ${uncertaintyWidth.toFixed(1)}% is widening.`);
    if (sample.temperature >= 52) reasons.push(`Temperature ${formatTemp(sample.temperature)} is rising above the caution range.`);
    if (sample.current >= 150) reasons.push(`Current ${formatAmp(sample.current)} suggests elevated battery load.`);
    if (sample.voltageDeviation >= 0.25) reasons.push(`Voltage deviation ${formatDeviation(sample.voltageDeviation)} needs monitoring.`);
    if (sample.predictedSoh < 90.5) reasons.push(`Predicted SOH ${formatPercent(sample.predictedSoh)} is trending lower.`);
    if (sample.alertScore >= 0.42) reasons.push(`Alert Score ${formatScore(sample.alertScore)} indicates a developing risk.`);
    return reasons.slice(0, 3);
  }

  return [
    `Actual SOH ${formatPercent(sample.soh)} and Predicted SOH ${formatPercent(sample.predictedSoh)} remain stable.`,
    `Alert Score ${formatScore(sample.alertScore)} is low.`,
    `Temperature, current, and voltage deviation are within the normal monitoring range.`,
  ];
}

const partDefinitions = {
  battery: {
    title: "배터리 상세",
    diagnosticsTitle: "배터리 진단 포인트",
    metrics: (sample) => [
      ["현재 SOH", formatPercent(sample.soh)],
      ["예측 SOH", formatPercent(sample.predictedSoh)],
      [
        "Uncertainty",
        `${formatPercent(sample.uncertaintyLower)} - ${formatPercent(sample.uncertaintyUpper)}`,
      ],
      ["온도", formatTemp(sample.temperature)],
      ["전압", formatVolt(sample.voltage)],
      ["전류", formatAmp(sample.current)],
      ["전압 편차", formatDeviation(sample.voltageDeviation)],
      ["Alert Score", formatScore(sample.alertScore)],
    ],
    insights: (sample, stateKey) => {
      if (stateKey === "warning") {
        return [
          "온도, 전류, 전압 편차가 동시에 상승해 즉시 점검이 필요한 시나리오입니다.",
          "Uncertainty 구간이 넓어져 예측 신뢰도 저하를 함께 보여줄 수 있습니다.",
          "원시 데이터가 아니라 모델 출력값과 요약 센서 지표가 화면에 반영되는 구조입니다.",
        ];
      }

      if (stateKey === "caution") {
        return [
          "SOH 예측값 하락과 센서 변화가 함께 관찰되어 주의 상태로 자동 전환되었습니다.",
          "충전 부하를 낮추고 냉각 상태를 확인하는 안내를 표시하기 좋은 구간입니다.",
          "상태는 버튼이 아니라 mock telemetry 값으로 계산됩니다.",
        ];
      }

      return [
        "SOH와 예측 SOH가 안정적으로 유지되고 있습니다.",
        "전압 편차와 전류가 정상 범위라 배터리 팩 상태가 양호합니다.",
        "그래프는 실제 SOH, 예측 SOH, uncertainty 구간을 함께 보여줍니다.",
      ];
    },
  },
  tire: {
    title: "타이어 상세",
    diagnosticsTitle: "타이어 진단 포인트",
    metrics: (sample) => [
      ["전륜 공기압", "36 PSI"],
      ["후륜 공기압", "35 PSI"],
      ["마모도", sample.alertScore > 0.7 ? "69%" : "78%"],
      ["타이어 온도", formatTemp(Math.max(28, sample.temperature - 11))],
    ],
    insights: () => [
      "타이어 정보는 차량 전체 상태 대시보드 확장을 위한 mock 데이터입니다.",
      "배터리 경고와 별도로 공기압, 마모도, 온도를 간단히 표시합니다.",
      "핵심 시연은 배터리 SOH와 이상 징후 경고에 유지됩니다.",
    ],
  },
  motor: {
    title: "모터 상세",
    diagnosticsTitle: "모터 진단 포인트",
    metrics: (sample) => [
      ["구동계 상태", sample.current > 220 ? "부하 높음" : "정상"],
      ["모터 온도", formatTemp(Math.max(34, sample.temperature + 4))],
      ["출력 제한", sample.alertScore > 0.72 ? "권장" : "없음"],
      ["점검 필요", sample.current > 220 ? "예" : "아니오"],
    ],
    insights: (sample) => [
      sample.current > 220
        ? "전류가 높아 모터 부하 상태를 함께 강조합니다."
        : "모터는 현재 mock 기준 정상 범위입니다.",
      "EV에서는 엔진오일보다는 모터/감속기/구동계 상태 패널로 표현하는 것이 자연스럽습니다.",
      "배터리 경고 상태와 연동해 출력 제한 여부를 보여줄 수 있습니다.",
    ],
  },
  cooling: {
    title: "냉각 시스템 상세",
    diagnosticsTitle: "냉각 시스템 진단 포인트",
    metrics: (sample) => [
      ["냉각수 온도", formatTemp(Math.max(32, sample.temperature - 6))],
      ["펌프 상태", sample.temperature > 70 ? "고속 동작" : "정상"],
      ["열관리 모드", sample.temperature > 52 ? "Active Cooling" : "Eco Cooling"],
      ["점검 필요", sample.temperature > 70 ? "예" : "아니오"],
    ],
    insights: (sample) => [
      sample.temperature > 70
        ? "배터리 온도가 높아 냉각 시스템을 고속 동작 상태로 보여줍니다."
        : "냉각 시스템은 배터리 온도 변화에 따라 mock 상태가 함께 변합니다.",
      "논문 Module 2의 온도 변화 기반 이상 징후 경고와 가장 직접적으로 연결됩니다.",
      "실제 냉각 제어가 아니라 시연용 상태 표현입니다.",
    ],
  },
  brake: {
    title: "브레이크 상세",
    diagnosticsTitle: "브레이크 진단 포인트",
    metrics: (sample) => [
      ["패드 잔량", "81%"],
      ["디스크 온도", formatTemp(Math.max(31, sample.temperature - 4))],
      ["회생제동", sample.alertScore > 0.72 ? "제한 권장" : "정상"],
      ["점검 필요", "아니오"],
    ],
    insights: (sample) => [
      sample.alertScore > 0.72
        ? "배터리 경고 상태에서는 회생제동 제한 같은 보조 안내를 보여줄 수 있습니다."
        : "브레이크 패널은 차량 전체 상태 UI 확장을 위한 보조 mock 정보입니다.",
      "배터리 SOH 예측이 핵심이고, 브레이크는 부위별 상세 패널 예시로 가볍게 유지합니다.",
      "선택 부위가 바뀌어도 상단 배터리 경고와 그래프는 계속 실시간 갱신됩니다.",
    ],
  },
};

function initUserPage() {
  const body = document.body;
  if (!body.classList.contains("user-page")) return;

  const kpiStatusLabel = document.getElementById("kpiStatusLabel");
  const kpiStatusText = document.getElementById("kpiStatusText");
  const kpiActualSoh = document.getElementById("kpiActualSoh");
  const kpiPredictedSoh = document.getElementById("kpiPredictedSoh");
  const kpiUncertainty = document.getElementById("kpiUncertainty");
  const kpiAlertScore = document.getElementById("kpiAlertScore");
  const notificationTitle = document.getElementById("notificationTitle");
  const notificationBody = document.getElementById("notificationBody");
  const notificationAction = document.getElementById("notificationAction");
  const tempTag = document.getElementById("tempTag");
  const cellTag = document.getElementById("cellTag");
  const deviationTag = document.getElementById("deviationTag");
  const partTitle = document.getElementById("partTitle");
  const partStatusChip = document.getElementById("partStatusChip");
  const partMetricGrid = document.getElementById("partMetricGrid");
  const whyStatusList = document.getElementById("whyStatusList");
  const certificateGrade = document.getElementById("certificateGrade");
  const certificateSummary = document.getElementById("certificateSummary");
  const certificateModalId = document.getElementById("certificateModalId");
  const certificateModalIssuedAt = document.getElementById("certificateModalIssuedAt");
  const certificateModalGrade = document.getElementById("certificateModalGrade");
  const certificateModalSoh = document.getElementById("certificateModalSoh");
  const certificateModalPredictedSoh = document.getElementById("certificateModalPredictedSoh");
  const certificateModalUncertainty = document.getElementById("certificateModalUncertainty");
  const certificateModalState = document.getElementById("certificateModalState");
  const certificateModalNote = document.getElementById("certificateModalNote");
  const certificateEvidenceGrid = document.getElementById("certificateEvidenceGrid");
  const certificateChecklist = document.getElementById("certificateChecklist");
  const certificateModalSignature = document.getElementById("certificateModalSignature");
  const chartCycleLabel = document.getElementById("chartCycleLabel");
  const chartFallback = document.getElementById("chartFallback");
  const toast = document.getElementById("stateToast");
  const vehicleStateImage = document.getElementById("vehicleStateImage");
  const vehicleParts = document.querySelectorAll("[data-part]");
  const openCertificate = document.getElementById("openCertificate");
  const closeCertificate = document.getElementById("closeCertificate");
  const confirmIssue = document.getElementById("confirmIssue");
  const certificateModal = document.getElementById("certificateModal");

  let toastTimer = null;
  let telemetryIndex = 0;
  let selectedPart = "battery";
  let currentSample = mockTelemetry[0];
  let currentState = deriveAlertState(currentSample);
  let sohChart = null;
  const vehicleStateImages = {
    normal: "./img/normal.png",
    caution: "./img/caution.png",
    warning: "./img/warning.png",
  };

  Object.values(vehicleStateImages).forEach((src) => {
    const image = new Image();
    image.src = src;
  });

  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2200);
  };

  const createSohChart = () => {
    const canvas = document.getElementById("sohChart");
    if (!canvas) return null;

    if (!window.Chart) {
      if (chartFallback) chartFallback.hidden = false;
      return null;
    }

    if (chartFallback) chartFallback.hidden = true;

    return new window.Chart(canvas, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Uncertainty Lower",
            data: [],
            borderColor: "rgba(37, 99, 235, 0)",
            backgroundColor: "rgba(37, 99, 235, 0)",
            pointRadius: 0,
            tension: 0.34,
          },
          {
            label: "Uncertainty Band",
            data: [],
            borderColor: "rgba(37, 99, 235, 0.2)",
            backgroundColor: "rgba(37, 99, 235, 0.14)",
            fill: "-1",
            pointRadius: 0,
            tension: 0.34,
          },
          {
            label: "Actual SOH",
            data: [],
            borderColor: "#16a34a",
            backgroundColor: "#16a34a",
            pointRadius: 3,
            borderWidth: 2,
            tension: 0.34,
          },
          {
            label: "Predicted SOH",
            data: [],
            borderColor: "#d97706",
            backgroundColor: "#d97706",
            pointRadius: 3,
            borderDash: [6, 5],
            borderWidth: 2,
            tension: 0.34,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 420,
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
        plugins: {
          legend: {
            labels: {
              color: "#475569",
              filter: (item) => item.text !== "Uncertainty Lower",
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${formatPercent(context.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: "rgba(148, 163, 184, 0.22)",
            },
            ticks: {
              color: "#64748b",
            },
          },
          y: {
            min: 85,
            max: 94,
            grid: {
              color: "rgba(148, 163, 184, 0.22)",
            },
            ticks: {
              color: "#64748b",
              callback: (value) => `${value}%`,
            },
          },
        },
      },
    });
  };

  const updateChart = () => {
    if (!sohChart) return;

    const visibleSamples = mockTelemetry.slice(0, telemetryIndex + 1);
    sohChart.data.labels = visibleSamples.map((sample) => `C${sample.cycle}`);
    sohChart.data.datasets[0].data = visibleSamples.map((sample) => sample.uncertaintyLower);
    sohChart.data.datasets[1].data = visibleSamples.map((sample) => sample.uncertaintyUpper);
    sohChart.data.datasets[2].data = visibleSamples.map((sample) => sample.soh);
    sohChart.data.datasets[3].data = visibleSamples.map((sample) => sample.predictedSoh);
    sohChart.update();
  };

  const renderPartPanel = (sample, stateKey) => {
    const definition = partDefinitions[selectedPart] ?? partDefinitions.battery;
    const partStateKey = selectedPart === "battery" ? stateKey : "normal";
    const state = stateCopy[partStateKey];

    partTitle.textContent = definition.title;
    partStatusChip.textContent = state.badge;
    partStatusChip.classList.toggle("is-static-normal", selectedPart !== "battery");

    partMetricGrid.innerHTML = definition
      .metrics(sample, stateKey)
      .map(
        ([label, value]) => `
          <article class="part-metric">
            <span>${label}</span>
            <strong>${value}</strong>
          </article>
        `,
      )
      .join("");

    vehicleParts.forEach((part) => {
      const isSelected = part.dataset.part === selectedPart;
      part.classList.toggle("is-selected", isSelected);
      part.classList.toggle("is-static-normal", isSelected && selectedPart !== "battery");
      part.setAttribute("aria-pressed", String(isSelected));
    });
  };

  const renderCertificate = (sample, stateKey, state, copy) => {
    const certificateId = `EVB-SOH-${sample.cycle}-A${Math.round(sample.alertScore * 100)
      .toString()
      .padStart(2, "0")}`;

    if (certificateGrade) certificateGrade.textContent = state.certificateGrade;
    if (certificateSummary) certificateSummary.textContent = copy.certificateSummary;
    if (certificateModalId) certificateModalId.textContent = certificateId;
    if (certificateModalIssuedAt) certificateModalIssuedAt.textContent = formatDateTime(new Date());
    if (certificateModalGrade) certificateModalGrade.textContent = state.certificateGrade;
    if (certificateModalSoh) certificateModalSoh.textContent = formatPercent(sample.soh);
    if (certificateModalPredictedSoh) certificateModalPredictedSoh.textContent = formatPercent(sample.predictedSoh);
    if (certificateModalUncertainty) {
      certificateModalUncertainty.textContent = `${formatPercent(sample.uncertaintyLower)} - ${formatPercent(sample.uncertaintyUpper)}`;
    }
    if (certificateModalState) certificateModalState.textContent = state.label;
    if (certificateModalNote) certificateModalNote.textContent = state.certificateNote;
    if (certificateModalSignature) {
      certificateModalSignature.textContent = `Signed by EV Battery Intelligence Demo / Cycle ${sample.cycle}`;
    }

    if (certificateEvidenceGrid) {
      certificateEvidenceGrid.innerHTML = [
        ["Temperature", formatTemp(sample.temperature)],
        ["Voltage", formatVolt(sample.voltage)],
        ["Current", formatAmp(sample.current)],
        ["Voltage Deviation", formatDeviation(sample.voltageDeviation)],
        ["Alert Score", formatScore(sample.alertScore)],
        ["Prediction Basis", `Cycle ${sample.cycle} / ${sample.time}`],
      ]
        .map(
          ([label, value]) => `
            <article>
              <span>${label}</span>
              <strong>${value}</strong>
            </article>
          `,
        )
        .join("");
    }

    if (certificateChecklist) {
      certificateChecklist.innerHTML = buildCertificateChecks(sample, stateKey)
        .map(
          (check) => `
            <li class="${check.value ? "is-pass" : "is-fail"}">
              <span>${check.value ? "PASS" : "HOLD"}</span>
              <div>
                <strong>${check.label}</strong>
                <p>${check.detail}</p>
              </div>
            </li>
          `,
        )
        .join("");
    }
  };

  const applyTelemetrySample = (sample, shouldToast = true) => {
    const nextState = deriveAlertState(sample);
    const state = stateCopy[nextState];
    const copy = createStateMessage(nextState, sample);

    body.classList.remove("state-normal", "state-caution", "state-warning", "state-critical");
    body.classList.add(`state-${nextState}`);

    if (vehicleStateImage) {
      vehicleStateImage.src = vehicleStateImages[nextState] ?? vehicleStateImages.normal;
      vehicleStateImage.alt = `Vehicle battery status visualization: ${state.badge}`;
    }

    kpiStatusLabel.textContent = state.badge;
    kpiStatusText.textContent = copy.summaryTitle;
    kpiActualSoh.textContent = formatPercent(sample.soh);
    kpiPredictedSoh.textContent = formatPercent(sample.predictedSoh);
    kpiUncertainty.textContent = `${formatPercent(sample.uncertaintyLower)} - ${formatPercent(sample.uncertaintyUpper)}`;
    kpiAlertScore.textContent = formatScore(sample.alertScore);
    notificationTitle.textContent = state.notificationTitle;
    notificationBody.textContent = copy.reasonSummary;
    notificationAction.textContent = state.notificationAction;
    tempTag.textContent = `Pack Temp ${formatTemp(sample.temperature)}`;
    cellTag.textContent = `Predicted SOH ${formatPercent(sample.predictedSoh)}`;
    deviationTag.textContent = `Deviation ${formatDeviation(sample.voltageDeviation)}`;
    whyStatusList.innerHTML = buildStatusReasons(sample, nextState)
      .map((reason) => `<li>${reason}</li>`)
      .join("");
    renderCertificate(sample, nextState, state, copy);
    chartCycleLabel.textContent = `Cycle ${sample.cycle} / ${sample.time}`;

    const canIssueCertificate = nextState === "normal";
    openCertificate.disabled = !canIssueCertificate;
    openCertificate.textContent = canIssueCertificate
      ? "인증서 발급 보기"
      : "정상 상태에서 발급 가능";
    confirmIssue.disabled = !canIssueCertificate;
    confirmIssue.textContent = canIssueCertificate ? "발급 완료 처리" : "발급 불가";
    if (!canIssueCertificate && !certificateModal.hidden) {
      certificateModal.hidden = true;
    }

    renderPartPanel(sample, nextState);
    updateChart();

    if (shouldToast && nextState !== currentState) {
      showToast(`${state.label} 상태로 자동 전환되었습니다.`);
    }

    currentSample = sample;
    currentState = nextState;
  };

  vehicleParts.forEach((part) => {
    const selectPart = () => {
      selectedPart = part.dataset.part;
      renderPartPanel(currentSample, currentState);
    };

    part.addEventListener("click", selectPart);
    part.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectPart();
      }
    });
  });

  openCertificate?.addEventListener("click", () => {
    if (currentState !== "normal") {
      showToast("배터리 인증서는 정상 상태에서만 발급할 수 있습니다.");
      return;
    }

    certificateModal.hidden = false;
  });

  closeCertificate?.addEventListener("click", () => {
    certificateModal.hidden = true;
  });

  certificateModal?.addEventListener("click", (event) => {
    if (event.target === certificateModal) {
      certificateModal.hidden = true;
    }
  });

  confirmIssue?.addEventListener("click", () => {
    if (currentState !== "normal") {
      certificateModal.hidden = true;
      showToast("정상 상태가 아니므로 인증서 발급이 차단되었습니다.");
      return;
    }

    certificateModal.hidden = true;
    showToast("배터리 인증서 발급이 완료되었습니다.");
  });

  sohChart = createSohChart();
  applyTelemetrySample(currentSample, false);

  const telemetryTimer = window.setInterval(() => {
    if (telemetryIndex >= mockTelemetry.length - 1) {
      window.clearInterval(telemetryTimer);
      return;
    }

    telemetryIndex += 1;
    applyTelemetrySample(mockTelemetry[telemetryIndex]);
  }, 2400);
}

function buildCertificateChecks(sample, stateKey) {
  const uncertaintyWidth = sample.uncertaintyUpper - sample.uncertaintyLower;

  return [
    {
      label: "Overall status is NORMAL",
      value: stateKey === "normal",
      detail: `Current status: ${stateCopy[stateKey].badge}`,
    },
    {
      label: "SOH is above issue threshold",
      value: sample.soh >= 90,
      detail: `Actual SOH ${formatPercent(sample.soh)}`,
    },
    {
      label: "Prediction uncertainty is controlled",
      value: uncertaintyWidth < 1.9,
      detail: `Interval width ${uncertaintyWidth.toFixed(1)}%`,
    },
    {
      label: "Thermal and electrical signals are stable",
      value: sample.temperature < 52 && sample.current < 150 && sample.voltageDeviation < 0.25,
      detail: `${formatTemp(sample.temperature)} / ${formatAmp(sample.current)} / ${formatDeviation(sample.voltageDeviation)}`,
    },
    {
      label: "Alert Score is below caution range",
      value: sample.alertScore < 0.42,
      detail: `Alert Score ${formatScore(sample.alertScore)}`,
    },
  ];
}

const mockAdminTrainingRounds = [
  {
    round: 128,
    phase: "Local Training",
    phaseStep: 0,
    roundProgress: 18,
    aggregationProgress: 0,
    broadcastProgress: 0,
    syncStatus: "Local update pending",
    syncBadge: "TRAINING",
    loss: 0.184,
    mae: 1.28,
    rmse: 1.62,
    mape: 2.84,
    clients: [
      { id: "EV-01", status: "Training", localEpoch: "4 / 10", localLoss: 0.171, upload: 0, sync: "Local", latency: 72 },
      { id: "EV-02", status: "Training", localEpoch: "3 / 10", localLoss: 0.188, upload: 0, sync: "Local", latency: 86 },
      { id: "EV-03", status: "Training", localEpoch: "5 / 10", localLoss: 0.176, upload: 0, sync: "Local", latency: 81 },
      { id: "EV-04", status: "Training", localEpoch: "4 / 10", localLoss: 0.192, upload: 0, sync: "Local", latency: 94 },
      { id: "EV-05", status: "Training", localEpoch: "2 / 10", localLoss: 0.205, upload: 0, sync: "Local", latency: 132 },
    ],
  },
  {
    round: 129,
    phase: "Upload Representation",
    phaseStep: 1,
    roundProgress: 36,
    aggregationProgress: 12,
    broadcastProgress: 0,
    syncStatus: "Receiving updates",
    syncBadge: "UPLOADING",
    loss: 0.166,
    mae: 1.17,
    rmse: 1.51,
    mape: 2.56,
    clients: [
      { id: "EV-01", status: "Uploading", localEpoch: "10 / 10", localLoss: 0.149, upload: 78, sync: "Uploading", latency: 76 },
      { id: "EV-02", status: "Uploading", localEpoch: "10 / 10", localLoss: 0.161, upload: 65, sync: "Uploading", latency: 91 },
      { id: "EV-03", status: "Synced", localEpoch: "10 / 10", localLoss: 0.153, upload: 100, sync: "Queued", latency: 84 },
      { id: "EV-04", status: "Uploading", localEpoch: "9 / 10", localLoss: 0.178, upload: 43, sync: "Uploading", latency: 109 },
      { id: "EV-05", status: "Delayed", localEpoch: "6 / 10", localLoss: 0.201, upload: 16, sync: "Delayed", latency: 214 },
    ],
  },
  {
    round: 130,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 58,
    aggregationProgress: 55,
    broadcastProgress: 0,
    syncStatus: "Aggregating shared representation",
    syncBadge: "AGGREGATING",
    loss: 0.151,
    mae: 1.05,
    rmse: 1.38,
    mape: 2.29,
    clients: [
      { id: "EV-01", status: "Aggregating", localEpoch: "10 / 10", localLoss: 0.143, upload: 100, sync: "Server queue", latency: 74 },
      { id: "EV-02", status: "Aggregating", localEpoch: "10 / 10", localLoss: 0.156, upload: 100, sync: "Server queue", latency: 87 },
      { id: "EV-03", status: "Aggregating", localEpoch: "10 / 10", localLoss: 0.148, upload: 100, sync: "Server queue", latency: 80 },
      { id: "EV-04", status: "Aggregating", localEpoch: "10 / 10", localLoss: 0.169, upload: 100, sync: "Server queue", latency: 103 },
      { id: "EV-05", status: "Delayed", localEpoch: "8 / 10", localLoss: 0.196, upload: 48, sync: "Retry", latency: 226 },
    ],
  },
  {
    round: 131,
    phase: "Broadcast Global Representation",
    phaseStep: 3,
    roundProgress: 76,
    aggregationProgress: 100,
    broadcastProgress: 44,
    syncStatus: "Broadcast in progress",
    syncBadge: "BROADCAST",
    loss: 0.139,
    mae: 0.96,
    rmse: 1.25,
    mape: 2.08,
    clients: [
      { id: "EV-01", status: "Synced", localEpoch: "10 / 10", localLoss: 0.135, upload: 100, sync: "Received global rep.", latency: 73 },
      { id: "EV-02", status: "Synced", localEpoch: "10 / 10", localLoss: 0.147, upload: 100, sync: "Received global rep.", latency: 89 },
      { id: "EV-03", status: "Synced", localEpoch: "10 / 10", localLoss: 0.142, upload: 100, sync: "Received global rep.", latency: 79 },
      { id: "EV-04", status: "Uploading", localEpoch: "10 / 10", localLoss: 0.161, upload: 92, sync: "Broadcast pending", latency: 108 },
      { id: "EV-05", status: "Delayed", localEpoch: "9 / 10", localLoss: 0.185, upload: 66, sync: "Retry", latency: 231 },
    ],
  },
  {
    round: 132,
    phase: "Personalized Head Update",
    phaseStep: 4,
    roundProgress: 92,
    aggregationProgress: 100,
    broadcastProgress: 88,
    syncStatus: "Local head update",
    syncBadge: "SYNCING",
    loss: 0.128,
    mae: 0.89,
    rmse: 1.16,
    mape: 1.92,
    clients: [
      { id: "EV-01", status: "Synced", localEpoch: "10 / 10", localLoss: 0.126, upload: 100, sync: "Head updated", latency: 71 },
      { id: "EV-02", status: "Synced", localEpoch: "10 / 10", localLoss: 0.139, upload: 100, sync: "Head updated", latency: 86 },
      { id: "EV-03", status: "Synced", localEpoch: "10 / 10", localLoss: 0.133, upload: 100, sync: "Head updated", latency: 81 },
      { id: "EV-04", status: "Synced", localEpoch: "10 / 10", localLoss: 0.152, upload: 100, sync: "Head updated", latency: 101 },
      { id: "EV-05", status: "Uploading", localEpoch: "10 / 10", localLoss: 0.173, upload: 91, sync: "Catching up", latency: 174 },
    ],
  },
  {
    round: 133,
    phase: "Round Synced",
    phaseStep: 4,
    roundProgress: 100,
    aggregationProgress: 100,
    broadcastProgress: 100,
    syncStatus: "All clients synced",
    syncBadge: "SYNCED",
    loss: 0.119,
    mae: 0.82,
    rmse: 1.08,
    mape: 1.74,
    clients: [
      { id: "EV-01", status: "Synced", localEpoch: "10 / 10", localLoss: 0.118, upload: 100, sync: "Ready", latency: 70 },
      { id: "EV-02", status: "Synced", localEpoch: "10 / 10", localLoss: 0.129, upload: 100, sync: "Ready", latency: 84 },
      { id: "EV-03", status: "Synced", localEpoch: "10 / 10", localLoss: 0.124, upload: 100, sync: "Ready", latency: 78 },
      { id: "EV-04", status: "Synced", localEpoch: "10 / 10", localLoss: 0.141, upload: 100, sync: "Ready", latency: 96 },
      { id: "EV-05", status: "Synced", localEpoch: "10 / 10", localLoss: 0.158, upload: 100, sync: "Ready", latency: 118 },
    ],
  },
];

function createAdminClients(statuses, uploads, syncLabels, losses, latencies, epochs) {
  return ["EV-01", "EV-02", "EV-03", "EV-04", "EV-05"].map((id, index) => ({
    id,
    status: statuses[index] ?? statuses[0],
    localEpoch: epochs?.[index] ?? "10 / 10",
    localLoss: losses[index],
    upload: uploads[index],
    sync: syncLabels[index] ?? syncLabels[0],
    latency: latencies[index],
  }));
}

mockAdminTrainingRounds.push(
  {
    round: 134,
    phase: "Local Training",
    phaseStep: 0,
    roundProgress: 16,
    aggregationProgress: 0,
    broadcastProgress: 0,
    syncStatus: "New local round started",
    syncBadge: "TRAINING",
    loss: 0.113,
    mae: 0.79,
    rmse: 1.04,
    mape: 1.68,
    clients: createAdminClients(
      ["Training", "Training", "Training", "Training", "Training"],
      [0, 0, 0, 0, 0],
      ["Local", "Local", "Local", "Local", "Local"],
      [0.112, 0.119, 0.115, 0.126, 0.142],
      [70, 83, 78, 95, 128],
      ["5 / 10", "4 / 10", "6 / 10", "5 / 10", "3 / 10"],
    ),
  },
  {
    round: 135,
    phase: "Upload Representation",
    phaseStep: 1,
    roundProgress: 34,
    aggregationProgress: 10,
    broadcastProgress: 0,
    syncStatus: "Receiving updates",
    syncBadge: "UPLOADING",
    loss: 0.107,
    mae: 0.76,
    rmse: 0.99,
    mape: 1.61,
    clients: createAdminClients(
      ["Uploading", "Synced", "Uploading", "Uploading", "Delayed"],
      [82, 100, 73, 58, 22],
      ["Uploading", "Queued", "Uploading", "Uploading", "Delayed"],
      [0.105, 0.112, 0.109, 0.119, 0.136],
      [71, 82, 80, 99, 212],
    ),
  },
  {
    round: 136,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 55,
    aggregationProgress: 52,
    broadcastProgress: 0,
    syncStatus: "Aggregating shared representation",
    syncBadge: "AGGREGATING",
    loss: 0.102,
    mae: 0.73,
    rmse: 0.95,
    mape: 1.55,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Delayed"],
      [100, 100, 100, 100, 46],
      ["Server queue", "Server queue", "Server queue", "Server queue", "Retry"],
      [0.101, 0.108, 0.105, 0.115, 0.131],
      [69, 81, 79, 96, 221],
    ),
  },
  {
    round: 137,
    phase: "Broadcast Global Representation",
    phaseStep: 3,
    roundProgress: 74,
    aggregationProgress: 100,
    broadcastProgress: 42,
    syncStatus: "Broadcast in progress",
    syncBadge: "BROADCAST",
    loss: 0.098,
    mae: 0.7,
    rmse: 0.91,
    mape: 1.5,
    clients: createAdminClients(
      ["Synced", "Synced", "Synced", "Uploading", "Delayed"],
      [100, 100, 100, 94, 65],
      ["Received global rep.", "Received global rep.", "Received global rep.", "Broadcast pending", "Retry"],
      [0.097, 0.104, 0.101, 0.111, 0.127],
      [70, 82, 77, 101, 218],
    ),
  },
  {
    round: 138,
    phase: "Personalized Head Update",
    phaseStep: 4,
    roundProgress: 91,
    aggregationProgress: 100,
    broadcastProgress: 86,
    syncStatus: "Local head update",
    syncBadge: "SYNCING",
    loss: 0.094,
    mae: 0.68,
    rmse: 0.88,
    mape: 1.45,
    clients: createAdminClients(
      ["Synced", "Synced", "Synced", "Synced", "Uploading"],
      [100, 100, 100, 100, 88],
      ["Head updated", "Head updated", "Head updated", "Head updated", "Catching up"],
      [0.093, 0.1, 0.098, 0.108, 0.121],
      [68, 80, 78, 93, 168],
    ),
  },
  {
    round: 139,
    phase: "Round Synced",
    phaseStep: 4,
    roundProgress: 100,
    aggregationProgress: 100,
    broadcastProgress: 100,
    syncStatus: "All clients synced",
    syncBadge: "SYNCED",
    loss: 0.091,
    mae: 0.66,
    rmse: 0.86,
    mape: 1.41,
    clients: createAdminClients(
      ["Synced", "Synced", "Synced", "Synced", "Synced"],
      [100, 100, 100, 100, 100],
      ["Ready", "Ready", "Ready", "Ready", "Ready"],
      [0.09, 0.097, 0.095, 0.104, 0.116],
      [67, 79, 76, 91, 117],
    ),
  },
  {
    round: 140,
    phase: "Local Training",
    phaseStep: 0,
    roundProgress: 18,
    aggregationProgress: 0,
    broadcastProgress: 0,
    syncStatus: "Local update pending",
    syncBadge: "TRAINING",
    loss: 0.088,
    mae: 0.64,
    rmse: 0.83,
    mape: 1.36,
    clients: createAdminClients(
      ["Training", "Training", "Training", "Training", "Training"],
      [0, 0, 0, 0, 0],
      ["Local", "Local", "Local", "Local", "Local"],
      [0.087, 0.093, 0.091, 0.1, 0.112],
      [66, 78, 75, 89, 116],
      ["4 / 10", "5 / 10", "4 / 10", "3 / 10", "2 / 10"],
    ),
  },
  {
    round: 141,
    phase: "Upload Representation",
    phaseStep: 1,
    roundProgress: 37,
    aggregationProgress: 14,
    broadcastProgress: 0,
    syncStatus: "Receiving updates",
    syncBadge: "UPLOADING",
    loss: 0.085,
    mae: 0.62,
    rmse: 0.81,
    mape: 1.32,
    clients: createAdminClients(
      ["Uploading", "Uploading", "Synced", "Uploading", "Delayed"],
      [84, 77, 100, 62, 26],
      ["Uploading", "Uploading", "Queued", "Uploading", "Delayed"],
      [0.084, 0.09, 0.088, 0.097, 0.109],
      [67, 80, 74, 92, 206],
    ),
  },
  {
    round: 142,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 59,
    aggregationProgress: 58,
    broadcastProgress: 0,
    syncStatus: "Aggregating shared representation",
    syncBadge: "AGGREGATING",
    loss: 0.082,
    mae: 0.6,
    rmse: 0.78,
    mape: 1.27,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Delayed"],
      [100, 100, 100, 100, 51],
      ["Server queue", "Server queue", "Server queue", "Server queue", "Retry"],
      [0.081, 0.087, 0.085, 0.094, 0.106],
      [65, 77, 73, 88, 210],
    ),
  },
  {
    round: 143,
    phase: "Broadcast Global Representation",
    phaseStep: 3,
    roundProgress: 77,
    aggregationProgress: 100,
    broadcastProgress: 48,
    syncStatus: "Broadcast in progress",
    syncBadge: "BROADCAST",
    loss: 0.079,
    mae: 0.58,
    rmse: 0.76,
    mape: 1.24,
    clients: createAdminClients(
      ["Synced", "Synced", "Synced", "Uploading", "Delayed"],
      [100, 100, 100, 96, 70],
      ["Received global rep.", "Received global rep.", "Received global rep.", "Broadcast pending", "Retry"],
      [0.078, 0.084, 0.082, 0.091, 0.102],
      [65, 76, 72, 87, 198],
    ),
  },
  {
    round: 144,
    phase: "Personalized Head Update",
    phaseStep: 4,
    roundProgress: 93,
    aggregationProgress: 100,
    broadcastProgress: 91,
    syncStatus: "Local head update",
    syncBadge: "SYNCING",
    loss: 0.076,
    mae: 0.56,
    rmse: 0.73,
    mape: 1.2,
    clients: createAdminClients(
      ["Synced", "Synced", "Synced", "Synced", "Uploading"],
      [100, 100, 100, 100, 93],
      ["Head updated", "Head updated", "Head updated", "Head updated", "Catching up"],
      [0.075, 0.081, 0.079, 0.088, 0.099],
      [64, 75, 72, 86, 152],
    ),
  },
  {
    round: 145,
    phase: "Round Synced",
    phaseStep: 4,
    roundProgress: 100,
    aggregationProgress: 100,
    broadcastProgress: 100,
    syncStatus: "All clients synced",
    syncBadge: "SYNCED",
    loss: 0.073,
    mae: 0.54,
    rmse: 0.71,
    mape: 1.16,
    clients: createAdminClients(
      ["Synced", "Synced", "Synced", "Synced", "Synced"],
      [100, 100, 100, 100, 100],
      ["Ready", "Ready", "Ready", "Ready", "Ready"],
      [0.072, 0.078, 0.076, 0.084, 0.095],
      [63, 73, 70, 84, 110],
    ),
  },
);

mockAdminTrainingRounds.push(
  {
    round: 146,
    phase: "Local Training",
    phaseStep: 0,
    roundProgress: 17,
    aggregationProgress: 0,
    broadcastProgress: 0,
    syncStatus: "New local round started",
    syncBadge: "TRAINING",
    loss: 0.071,
    mae: 0.52,
    rmse: 0.69,
    mape: 1.12,
    clients: createAdminClients(
      ["Training", "Training", "Training", "Training", "Training"],
      [0, 0, 0, 0, 0],
      ["Local", "Local", "Local", "Local", "Local"],
      [0.07, 0.076, 0.074, 0.082, 0.092],
      [63, 72, 70, 82, 106],
      ["4 / 10", "5 / 10", "4 / 10", "3 / 10", "2 / 10"],
    ),
  },
  {
    round: 147,
    phase: "Upload Representation",
    phaseStep: 1,
    roundProgress: 35,
    aggregationProgress: 12,
    broadcastProgress: 0,
    syncStatus: "Receiving updates",
    syncBadge: "UPLOADING",
    loss: 0.068,
    mae: 0.5,
    rmse: 0.66,
    mape: 1.08,
    clients: createAdminClients(
      ["Uploading", "Uploading", "Synced", "Uploading", "Delayed"],
      [86, 79, 100, 68, 31],
      ["Uploading", "Uploading", "Queued", "Uploading", "Delayed"],
      [0.067, 0.073, 0.071, 0.079, 0.089],
      [62, 73, 69, 84, 184],
    ),
  },
  {
    round: 148,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 57,
    aggregationProgress: 61,
    broadcastProgress: 0,
    syncStatus: "Aggregating shared representation",
    syncBadge: "AGGREGATING",
    loss: 0.065,
    mae: 0.48,
    rmse: 0.63,
    mape: 1.04,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Delayed"],
      [100, 100, 100, 100, 58],
      ["Server queue", "Server queue", "Server queue", "Server queue", "Retry"],
      [0.064, 0.07, 0.068, 0.076, 0.086],
      [61, 71, 68, 81, 196],
    ),
  },
  {
    round: 149,
    phase: "Broadcast Global Representation",
    phaseStep: 3,
    roundProgress: 78,
    aggregationProgress: 100,
    broadcastProgress: 52,
    syncStatus: "Broadcast in progress",
    syncBadge: "BROADCAST",
    loss: 0.062,
    mae: 0.46,
    rmse: 0.61,
    mape: 1.0,
    clients: createAdminClients(
      ["Synced", "Synced", "Synced", "Uploading", "Delayed"],
      [100, 100, 100, 97, 74],
      ["Received global rep.", "Received global rep.", "Received global rep.", "Broadcast pending", "Retry"],
      [0.061, 0.067, 0.065, 0.073, 0.083],
      [60, 70, 67, 80, 178],
    ),
  },
  {
    round: 150,
    phase: "Personalized Head Update",
    phaseStep: 4,
    roundProgress: 94,
    aggregationProgress: 100,
    broadcastProgress: 93,
    syncStatus: "Local head update",
    syncBadge: "SYNCING",
    loss: 0.06,
    mae: 0.45,
    rmse: 0.59,
    mape: 0.96,
    clients: createAdminClients(
      ["Synced", "Synced", "Synced", "Synced", "Uploading"],
      [100, 100, 100, 100, 95],
      ["Head updated", "Head updated", "Head updated", "Head updated", "Catching up"],
      [0.059, 0.065, 0.063, 0.071, 0.079],
      [59, 69, 66, 78, 142],
    ),
  },
  {
    round: 151,
    phase: "Round Synced",
    phaseStep: 4,
    roundProgress: 100,
    aggregationProgress: 100,
    broadcastProgress: 100,
    syncStatus: "All clients synced",
    syncBadge: "SYNCED",
    loss: 0.058,
    mae: 0.43,
    rmse: 0.57,
    mape: 0.92,
    clients: createAdminClients(
      ["Synced", "Synced", "Synced", "Synced", "Synced"],
      [100, 100, 100, 100, 100],
      ["Ready", "Ready", "Ready", "Ready", "Ready"],
      [0.057, 0.063, 0.061, 0.068, 0.076],
      [58, 67, 65, 76, 104],
    ),
  },
  {
    round: 152,
    phase: "Local Training",
    phaseStep: 0,
    roundProgress: 19,
    aggregationProgress: 0,
    broadcastProgress: 0,
    syncStatus: "New local round started",
    syncBadge: "TRAINING",
    loss: 0.056,
    mae: 0.42,
    rmse: 0.55,
    mape: 0.89,
    clients: createAdminClients(
      ["Training", "Training", "Training", "Training", "Training"],
      [0, 0, 0, 0, 0],
      ["Local", "Local", "Local", "Local", "Local"],
      [0.055, 0.061, 0.059, 0.066, 0.074],
      [57, 66, 64, 75, 102],
      ["5 / 10", "4 / 10", "5 / 10", "4 / 10", "3 / 10"],
    ),
  },
  {
    round: 153,
    phase: "Upload Representation",
    phaseStep: 1,
    roundProgress: 41,
    aggregationProgress: 18,
    broadcastProgress: 0,
    syncStatus: "Receiving updates",
    syncBadge: "UPLOADING",
    loss: 0.054,
    mae: 0.4,
    rmse: 0.53,
    mape: 0.86,
    clients: createAdminClients(
      ["Uploading", "Uploading", "Synced", "Uploading", "Delayed"],
      [88, 82, 100, 72, 38],
      ["Uploading", "Uploading", "Queued", "Uploading", "Delayed"],
      [0.053, 0.059, 0.057, 0.064, 0.071],
      [56, 65, 63, 74, 171],
    ),
  },
  {
    round: 154,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 67,
    aggregationProgress: 76,
    broadcastProgress: 0,
    syncStatus: "Aggregating shared representation",
    syncBadge: "AGGREGATING",
    loss: 0.052,
    mae: 0.39,
    rmse: 0.51,
    mape: 0.83,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Uploading"],
      [100, 100, 100, 100, 86],
      ["Server queue", "Server queue", "Server queue", "Server queue", "Catching up"],
      [0.051, 0.057, 0.055, 0.062, 0.069],
      [55, 64, 62, 72, 136],
    ),
  },
  {
    round: 155,
    phase: "Round Synced",
    phaseStep: 4,
    roundProgress: 100,
    aggregationProgress: 100,
    broadcastProgress: 100,
    syncStatus: "All clients synced",
    syncBadge: "SYNCED",
    loss: 0.05,
    mae: 0.37,
    rmse: 0.49,
    mape: 0.8,
    clients: createAdminClients(
      ["Synced", "Synced", "Synced", "Synced", "Synced"],
      [100, 100, 100, 100, 100],
      ["Ready", "Ready", "Ready", "Ready", "Ready"],
      [0.049, 0.055, 0.053, 0.06, 0.066],
      [54, 62, 60, 70, 98],
    ),
  },
);

const adminUploadToAggregationRounds = [
  {
    round: 140,
    phase: "Upload Representation",
    phaseStep: 1,
    roundProgress: 42,
    aggregationProgress: 0,
    broadcastProgress: 0,
    syncStatus: "Collecting representation updates",
    syncBadge: "UPLOADING",
    loss: 0.088,
    mae: 0.64,
    rmse: 0.83,
    mape: 1.36,
    clients: createAdminClients(
      ["Uploading", "Uploading", "Synced", "Uploading", "Delayed"],
      [88, 76, 100, 64, 34],
      ["Uploading shared rep.", "Uploading shared rep.", "Queued for aggregation", "Uploading shared rep.", "Delayed"],
      [0.087, 0.093, 0.091, 0.1, 0.112],
      [66, 78, 75, 89, 196],
    ),
  },
  {
    round: 141,
    phase: "Upload Representation",
    phaseStep: 1,
    roundProgress: 44,
    aggregationProgress: 0,
    broadcastProgress: 0,
    syncStatus: "Waiting for late client updates",
    syncBadge: "UPLOADING",
    loss: 0.085,
    mae: 0.62,
    rmse: 0.81,
    mape: 1.32,
    clients: createAdminClients(
      ["Uploading", "Uploading", "Synced", "Uploading", "Delayed"],
      [92, 84, 100, 74, 45],
      ["Uploading shared rep.", "Uploading shared rep.", "Queued for aggregation", "Uploading shared rep.", "Delayed"],
      [0.084, 0.09, 0.088, 0.097, 0.109],
      [67, 80, 74, 92, 204],
    ),
  },
  {
    round: 142,
    phase: "Upload Representation",
    phaseStep: 1,
    roundProgress: 46,
    aggregationProgress: 3,
    broadcastProgress: 0,
    syncStatus: "Pre-aggregation validation started",
    syncBadge: "UPLOADING",
    loss: 0.082,
    mae: 0.6,
    rmse: 0.78,
    mape: 1.27,
    clients: createAdminClients(
      ["Uploading", "Uploading", "Synced", "Uploading", "Delayed"],
      [96, 90, 100, 83, 57],
      ["Checksum validation", "Uploading shared rep.", "Queued for aggregation", "Uploading shared rep.", "Retry"],
      [0.081, 0.087, 0.085, 0.094, 0.106],
      [65, 77, 73, 88, 210],
    ),
  },
  {
    round: 143,
    phase: "Upload Representation",
    phaseStep: 1,
    roundProgress: 48,
    aggregationProgress: 6,
    broadcastProgress: 0,
    syncStatus: "Preparing server aggregation queue",
    syncBadge: "UPLOADING",
    loss: 0.079,
    mae: 0.58,
    rmse: 0.76,
    mape: 1.24,
    clients: createAdminClients(
      ["Synced", "Uploading", "Synced", "Uploading", "Delayed"],
      [100, 95, 100, 90, 66],
      ["Queued for aggregation", "Checksum validation", "Queued for aggregation", "Uploading shared rep.", "Retry"],
      [0.078, 0.084, 0.082, 0.091, 0.102],
      [65, 76, 72, 87, 198],
    ),
  },
  {
    round: 144,
    phase: "Upload Representation",
    phaseStep: 1,
    roundProgress: 50,
    aggregationProgress: 9,
    broadcastProgress: 0,
    syncStatus: "Most representation updates received",
    syncBadge: "UPLOADING",
    loss: 0.076,
    mae: 0.56,
    rmse: 0.73,
    mape: 1.2,
    clients: createAdminClients(
      ["Synced", "Synced", "Synced", "Uploading", "Uploading"],
      [100, 100, 100, 96, 78],
      ["Queued for aggregation", "Queued for aggregation", "Queued for aggregation", "Checksum validation", "Catching up"],
      [0.075, 0.081, 0.079, 0.088, 0.099],
      [64, 75, 72, 86, 152],
    ),
  },
  {
    round: 145,
    phase: "Upload Representation",
    phaseStep: 1,
    roundProgress: 52,
    aggregationProgress: 12,
    broadcastProgress: 0,
    syncStatus: "Final client update is catching up",
    syncBadge: "UPLOADING",
    loss: 0.073,
    mae: 0.54,
    rmse: 0.71,
    mape: 1.16,
    clients: createAdminClients(
      ["Synced", "Synced", "Synced", "Synced", "Uploading"],
      [100, 100, 100, 100, 88],
      ["Queued for aggregation", "Queued for aggregation", "Queued for aggregation", "Queued for aggregation", "Catching up"],
      [0.072, 0.078, 0.076, 0.084, 0.095],
      [63, 73, 70, 84, 110],
    ),
  },
  {
    round: 146,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 54,
    aggregationProgress: 18,
    broadcastProgress: 0,
    syncStatus: "Server aggregation started",
    syncBadge: "AGGREGATING",
    loss: 0.071,
    mae: 0.52,
    rmse: 0.69,
    mape: 1.12,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Aggregating"],
      [100, 100, 100, 100, 100],
      ["Server queue", "Server queue", "Server queue", "Server queue", "Server queue"],
      [0.07, 0.076, 0.074, 0.082, 0.092],
      [63, 72, 70, 82, 106],
    ),
  },
  {
    round: 147,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 56,
    aggregationProgress: 26,
    broadcastProgress: 0,
    syncStatus: "Normalizing client update weights",
    syncBadge: "AGGREGATING",
    loss: 0.068,
    mae: 0.5,
    rmse: 0.66,
    mape: 1.08,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Aggregating"],
      [100, 100, 100, 100, 100],
      ["Weight normalization", "Weight normalization", "Weight normalization", "Weight normalization", "Weight normalization"],
      [0.067, 0.073, 0.071, 0.079, 0.089],
      [62, 73, 69, 84, 104],
    ),
  },
  {
    round: 148,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 58,
    aggregationProgress: 34,
    broadcastProgress: 0,
    syncStatus: "Merging shared representation updates",
    syncBadge: "AGGREGATING",
    loss: 0.065,
    mae: 0.48,
    rmse: 0.63,
    mape: 1.04,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Aggregating"],
      [100, 100, 100, 100, 100],
      ["Representation merge", "Representation merge", "Representation merge", "Representation merge", "Representation merge"],
      [0.064, 0.07, 0.068, 0.076, 0.086],
      [61, 71, 68, 81, 102],
    ),
  },
  {
    round: 149,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 60,
    aggregationProgress: 43,
    broadcastProgress: 0,
    syncStatus: "Aggregating global representation",
    syncBadge: "AGGREGATING",
    loss: 0.062,
    mae: 0.46,
    rmse: 0.61,
    mape: 1.0,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Aggregating"],
      [100, 100, 100, 100, 100],
      ["Representation merge", "Representation merge", "Representation merge", "Representation merge", "Representation merge"],
      [0.061, 0.067, 0.065, 0.073, 0.083],
      [60, 70, 67, 80, 100],
    ),
  },
  {
    round: 150,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 61,
    aggregationProgress: 52,
    broadcastProgress: 0,
    syncStatus: "Aggregating global representation",
    syncBadge: "AGGREGATING",
    loss: 0.06,
    mae: 0.45,
    rmse: 0.59,
    mape: 0.96,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Aggregating"],
      [100, 100, 100, 100, 100],
      ["Representation merge", "Representation merge", "Representation merge", "Representation merge", "Representation merge"],
      [0.059, 0.065, 0.063, 0.071, 0.079],
      [59, 69, 66, 78, 98],
    ),
  },
  {
    round: 151,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 63,
    aggregationProgress: 61,
    broadcastProgress: 0,
    syncStatus: "Validating aggregated representation",
    syncBadge: "AGGREGATING",
    loss: 0.058,
    mae: 0.43,
    rmse: 0.57,
    mape: 0.92,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Aggregating"],
      [100, 100, 100, 100, 100],
      ["Validation queue", "Validation queue", "Validation queue", "Validation queue", "Validation queue"],
      [0.057, 0.063, 0.061, 0.068, 0.076],
      [58, 67, 65, 76, 96],
    ),
  },
  {
    round: 152,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 65,
    aggregationProgress: 70,
    broadcastProgress: 0,
    syncStatus: "Validating aggregated representation",
    syncBadge: "AGGREGATING",
    loss: 0.056,
    mae: 0.42,
    rmse: 0.55,
    mape: 0.89,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Aggregating"],
      [100, 100, 100, 100, 100],
      ["Validation queue", "Validation queue", "Validation queue", "Validation queue", "Validation queue"],
      [0.055, 0.061, 0.059, 0.066, 0.074],
      [57, 66, 64, 75, 94],
    ),
  },
  {
    round: 153,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 67,
    aggregationProgress: 80,
    broadcastProgress: 0,
    syncStatus: "Finalizing server aggregation",
    syncBadge: "AGGREGATING",
    loss: 0.054,
    mae: 0.4,
    rmse: 0.53,
    mape: 0.86,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Aggregating"],
      [100, 100, 100, 100, 100],
      ["Finalize merge", "Finalize merge", "Finalize merge", "Finalize merge", "Finalize merge"],
      [0.053, 0.059, 0.057, 0.064, 0.071],
      [56, 65, 63, 74, 92],
    ),
  },
  {
    round: 154,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 69,
    aggregationProgress: 89,
    broadcastProgress: 0,
    syncStatus: "Finalizing server aggregation",
    syncBadge: "AGGREGATING",
    loss: 0.052,
    mae: 0.39,
    rmse: 0.51,
    mape: 0.83,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Aggregating"],
      [100, 100, 100, 100, 100],
      ["Finalize merge", "Finalize merge", "Finalize merge", "Finalize merge", "Finalize merge"],
      [0.051, 0.057, 0.055, 0.062, 0.069],
      [55, 64, 62, 72, 90],
    ),
  },
  {
    round: 155,
    phase: "Server Aggregation",
    phaseStep: 2,
    roundProgress: 70,
    aggregationProgress: 96,
    broadcastProgress: 0,
    syncStatus: "Shared representation aggregation nearly complete",
    syncBadge: "AGGREGATING",
    loss: 0.05,
    mae: 0.37,
    rmse: 0.49,
    mape: 0.8,
    clients: createAdminClients(
      ["Aggregating", "Aggregating", "Aggregating", "Aggregating", "Aggregating"],
      [100, 100, 100, 100, 100],
      ["Finalize merge", "Finalize merge", "Finalize merge", "Finalize merge", "Finalize merge"],
      [0.049, 0.055, 0.053, 0.06, 0.066],
      [54, 62, 60, 70, 88],
    ),
  },
];

adminUploadToAggregationRounds.forEach((roundOverride) => {
  const targetIndex = mockAdminTrainingRounds.findIndex((round) => round.round === roundOverride.round);
  if (targetIndex >= 0) {
    mockAdminTrainingRounds[targetIndex] = roundOverride;
  }
});

const ADMIN_INITIAL_ROUND = 140;

const mockAdminModelComparison = [
  { model: "Local-only", mae: 3.12, rmse: 3.84, mape: 3.25 },
  { model: "FedAvg", mae: 2.15, rmse: 2.41, mape: 2.18 },
  { model: "FedAvg+FT", mae: 1.82, rmse: 2.08, mape: 1.9 },
  { model: "Proposed FedRep", mae: 1.21, rmse: 1.42, mape: 1.25 },
];

function initAdminPage() {
  const body = document.body;
  if (!body.classList.contains("admin-page")) return;

  const dashboard = document.querySelector(".admin-dashboard");
  if (!dashboard) return;

  const pipelineSteps = document.querySelectorAll("[data-pipeline-step]");
  const clientGrid = document.getElementById("adminClientGrid");
  const trainingChartFallback = document.getElementById("adminTrainingChartFallback");
  const comparisonChartFallback = document.getElementById("adminComparisonChartFallback");

  let adminRoundIndex = Math.max(
    0,
    mockAdminTrainingRounds.findIndex((round) => round.round === ADMIN_INITIAL_ROUND),
  );
  let adminTrainingMetricsChart = null;
  let adminModelComparisonChart = null;

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  const setProgress = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.style.width = `${Math.max(0, Math.min(100, value))}%`;
  };

  const statusClass = (status) => `status-${status.toLowerCase().replace(/\s+/g, "-")}`;

  const createAdminTrainingMetricsChart = () => {
    const canvas = document.getElementById("adminTrainingMetricsChart");
    if (!canvas) return null;

    if (!window.Chart) {
      if (trainingChartFallback) trainingChartFallback.hidden = false;
      return null;
    }

    if (trainingChartFallback) trainingChartFallback.hidden = true;

    return new window.Chart(canvas, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Loss",
            data: [],
            borderColor: "#2563eb",
            backgroundColor: "#2563eb",
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.36,
          },
          {
            label: "MAE",
            data: [],
            borderColor: "#16a34a",
            backgroundColor: "#16a34a",
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.36,
          },
          {
            label: "RMSE",
            data: [],
            borderColor: "#d97706",
            backgroundColor: "#d97706",
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.36,
          },
          {
            label: "MAPE",
            data: [],
            borderColor: "#7c3aed",
            backgroundColor: "#7c3aed",
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.36,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 420,
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
        plugins: {
          legend: {
            labels: {
              color: "#475569",
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: "rgba(148, 163, 184, 0.22)",
            },
            ticks: {
              color: "#64748b",
            },
          },
          y: {
            min: 0,
            max: 3,
            grid: {
              color: "rgba(148, 163, 184, 0.22)",
            },
            ticks: {
              color: "#64748b",
            },
          },
        },
      },
    });
  };

  const createAdminModelComparisonChart = () => {
    const canvas = document.getElementById("adminModelComparisonChart");
    if (!canvas) return null;

    if (!window.Chart) {
      if (comparisonChartFallback) comparisonChartFallback.hidden = false;
      return null;
    }

    if (comparisonChartFallback) comparisonChartFallback.hidden = true;

    return new window.Chart(canvas, {
      type: "bar",
      data: {
        labels: mockAdminModelComparison.map((item) => item.model),
        datasets: [
          {
            label: "MAE",
            data: mockAdminModelComparison.map((item) => item.mae),
            backgroundColor: ["#94a3b8", "#60a5fa", "#38bdf8", "#16a34a"],
            borderRadius: 8,
          },
          {
            label: "RMSE",
            data: mockAdminModelComparison.map((item) => item.rmse),
            backgroundColor: ["#cbd5e1", "#93c5fd", "#7dd3fc", "#86efac"],
            borderRadius: 8,
          },
          {
            label: "MAPE",
            data: mockAdminModelComparison.map((item) => item.mape),
            backgroundColor: ["#e2e8f0", "#bfdbfe", "#bae6fd", "#bbf7d0"],
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: "#475569",
            },
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            ticks: {
              color: "#64748b",
            },
          },
          y: {
            min: 0,
            max: 4.2,
            grid: {
              color: "rgba(148, 163, 184, 0.22)",
            },
            ticks: {
              color: "#64748b",
            },
          },
        },
      },
    });
  };

  const updateAdminCharts = () => {
    if (adminTrainingMetricsChart) {
      const visibleRounds = mockAdminTrainingRounds.slice(0, adminRoundIndex + 1);
      adminTrainingMetricsChart.data.labels = visibleRounds.map((round) => `R${round.round}`);
      adminTrainingMetricsChart.data.datasets[0].data = visibleRounds.map((round) => round.loss);
      adminTrainingMetricsChart.data.datasets[1].data = visibleRounds.map((round) => round.mae);
      adminTrainingMetricsChart.data.datasets[2].data = visibleRounds.map((round) => round.rmse);
      adminTrainingMetricsChart.data.datasets[3].data = visibleRounds.map((round) => round.mape);
      adminTrainingMetricsChart.update();
    }

    if (adminModelComparisonChart) {
      adminModelComparisonChart.update();
    }
  };

  const renderAdminPipeline = (round) => {
    pipelineSteps.forEach((step) => {
      const stepIndex = Number(step.dataset.pipelineStep);
      step.classList.toggle("is-complete", stepIndex < round.phaseStep || round.roundProgress === 100);
      step.classList.toggle("is-active", stepIndex === round.phaseStep && round.roundProgress < 100);
    });
  };

  const renderAdminClients = (round) => {
    if (!clientGrid) return;

    clientGrid.innerHTML = round.clients
      .map(
        (client) => `
          <article class="client-card ${statusClass(client.status)}">
            <div class="client-card__head">
              <strong>${client.id}</strong>
              <span class="client-status">${client.status}</span>
            </div>
            <div class="client-card__metrics">
              <span>Local Epoch <strong>${client.localEpoch}</strong></span>
              <span>Local Loss <strong>${client.localLoss.toFixed(3)}</strong></span>
              <span>Latency <strong>${client.latency}ms</strong></span>
              <span>Sync <strong>${client.sync}</strong></span>
            </div>
            <div class="client-upload">
              <span>Upload ${client.upload}%</span>
              <div class="admin-progress">
                <span style="width: ${client.upload}%"></span>
              </div>
            </div>
          </article>
        `,
      )
      .join("");
  };

  const applyAdminRound = (round) => {
    const totalClients = round.clients.length;
    const activeClients = round.clients.filter((client) => client.status !== "Delayed").length;
    const uploadedClients = round.clients.filter((client) => client.upload >= 100).length;
    const uploadAverage = round.clients.reduce((sum, client) => sum + client.upload, 0) / totalClients;
    const uploadingClients = round.clients.filter((client) => client.status === "Uploading").length;
    const aggregatingClients = round.clients.filter((client) => client.status === "Aggregating").length;
    const delayedClients = round.clients.filter((client) => client.status === "Delayed");
    const delayedLabel = delayedClients.length
      ? delayedClients.map((client) => client.id).join(", ")
      : "None";

    setText("adminRoundStatus", round.phase.toUpperCase());
    setText("adminRoundValue", String(round.round));
    setText("adminRoundLabel", `${round.phase} phase`);
    setText("adminRoundProgressText", `${round.roundProgress}%`);
    setText("adminClientCount", `${totalClients} / ${totalClients}`);
    setText("adminActiveClientCount", String(activeClients));
    setText("adminDelayedClientText", delayedClients.length ? `${delayedLabel} delayed` : "No delayed client");
    setText("adminAggregationStatus", round.aggregationProgress >= 100 ? "Complete" : round.phase);
    setText("adminAggregationProgressText", `${round.aggregationProgress}% server merge`);
    setText("adminSyncStatus", round.syncStatus);
    setText("adminBroadcastProgressText", `${round.broadcastProgress}% broadcast`);
    setText("adminPipelinePhase", round.phase);
    setText("adminSyncBadge", round.syncBadge);
    setText("adminUploadText", `${uploadedClients} / ${totalClients} updates received (${Math.round(uploadAverage)}%)`);
    setText("adminAggregationText", `${round.aggregationProgress}% merged`);
    setText("adminBroadcastText", `${round.broadcastProgress}% deployed`);
    setText("adminDelayedClient", delayedLabel);
    setText(
      "adminSyncMessage",
      delayedClients.length
        ? "A delayed client is shown as mock network latency for the demo."
        : "All clients are inside the expected sync window.",
    );
    setText(
      "adminClientPhase",
      round.phaseStep === 2
        ? `${aggregatingClients} clients in aggregation queue`
        : `${uploadingClients} clients uploading`,
    );

    setProgress("adminRoundProgressBar", round.roundProgress);
    setProgress("adminUploadBar", uploadAverage);
    setProgress("adminAggregationBar", round.aggregationProgress);
    setProgress("adminBroadcastBar", round.broadcastProgress);

    renderAdminPipeline(round);
    renderAdminClients(round);
    updateAdminCharts();
  };

  adminTrainingMetricsChart = createAdminTrainingMetricsChart();
  adminModelComparisonChart = createAdminModelComparisonChart();
  applyAdminRound(mockAdminTrainingRounds[adminRoundIndex]);

  const adminRoundTimer = window.setInterval(() => {
    if (adminRoundIndex >= mockAdminTrainingRounds.length - 1) {
      window.clearInterval(adminRoundTimer);
      return;
    }

    adminRoundIndex += 1;
    applyAdminRound(mockAdminTrainingRounds[adminRoundIndex]);
  }, 2400);
}

initUserPage();
initAdminPage();
