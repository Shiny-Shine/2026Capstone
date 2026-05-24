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

  const statusBadge = document.getElementById("statusBadge");
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
  const certificateModalGrade = document.getElementById("certificateModalGrade");
  const certificateModalSoh = document.getElementById("certificateModalSoh");
  const certificateModalState = document.getElementById("certificateModalState");
  const certificateModalNote = document.getElementById("certificateModalNote");
  const chartCycleLabel = document.getElementById("chartCycleLabel");
  const chartFallback = document.getElementById("chartFallback");
  const toast = document.getElementById("stateToast");
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

  const applyTelemetrySample = (sample, shouldToast = true) => {
    const nextState = deriveAlertState(sample);
    const state = stateCopy[nextState];
    const copy = createStateMessage(nextState, sample);

    body.classList.remove("state-normal", "state-caution", "state-warning", "state-critical");
    body.classList.add(`state-${nextState}`);

    statusBadge.textContent = state.badge;
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
    certificateGrade.textContent = state.certificateGrade;
    certificateSummary.textContent = copy.certificateSummary;
    certificateModalGrade.textContent = state.certificateGrade;
    certificateModalSoh.textContent = formatPercent(sample.soh);
    certificateModalState.textContent = state.label;
    certificateModalNote.textContent = state.certificateNote;
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

  window.setInterval(() => {
    telemetryIndex = (telemetryIndex + 1) % mockTelemetry.length;
    applyTelemetrySample(mockTelemetry[telemetryIndex]);
  }, 2400);
}

initUserPage();
