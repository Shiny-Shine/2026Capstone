const USER_DASHBOARD_DATA_URL = "./data/user-dashboard.json";
const ADMIN_DASHBOARD_DATA_URL = "./data/admin-dashboard.json";
const USER_CHART_HISTORY_LIMIT = 36;
const TELEMETRY_INTERVAL_MS = 2400;
const REPLAY_CLOCK_STORAGE_KEY = "ev-battery-shared-replay-clock";
const REPLAY_CLOCK_VERSION = 1;
const REPLAY_CLOCK_TICK_MS = 400;
const fallbackReplayClock = {
  version: REPLAY_CLOCK_VERSION,
  startedAt: Date.now(),
  intervalMs: TELEMETRY_INTERVAL_MS,
};

function createReplayClock(totalFrames) {
  return {
    version: REPLAY_CLOCK_VERSION,
    startedAt: Date.now(),
    intervalMs: TELEMETRY_INTERVAL_MS,
    totalFrames,
  };
}

function isValidReplayClock(clock, totalFrames) {
  return (
    clock?.version === REPLAY_CLOCK_VERSION &&
    Number.isFinite(clock.startedAt) &&
    clock.startedAt > 0 &&
    Number.isFinite(clock.intervalMs) &&
    clock.intervalMs > 0 &&
    clock.totalFrames === totalFrames
  );
}

function readOrCreateReplayClock(totalFrames) {
  try {
    const storedClock = JSON.parse(window.localStorage.getItem(REPLAY_CLOCK_STORAGE_KEY));
    if (isValidReplayClock(storedClock, totalFrames)) return storedClock;

    const nextClock = createReplayClock(totalFrames);
    window.localStorage.setItem(REPLAY_CLOCK_STORAGE_KEY, JSON.stringify(nextClock));
    return nextClock;
  } catch (error) {
    console.warn("Shared replay clock is using an in-memory fallback.", error);
    return {
      ...fallbackReplayClock,
      totalFrames,
    };
  }
}

function getReplayFrameIndex(totalFrames) {
  const clock = readOrCreateReplayClock(totalFrames);
  const elapsedMs = Math.max(0, Date.now() - clock.startedAt);
  return Math.floor(elapsedMs / clock.intervalMs) % totalFrames;
}

function startSharedReplay(totalFrames, renderFrame) {
  let lastFrameIndex = null;

  const syncFrame = (force = false) => {
    const frameIndex = getReplayFrameIndex(totalFrames);
    if (!force && frameIndex === lastFrameIndex) return;

    lastFrameIndex = frameIndex;
    renderFrame(frameIndex);
  };

  const handleStorage = (event) => {
    if (event.key === REPLAY_CLOCK_STORAGE_KEY) syncFrame(true);
  };
  const handleVisibility = () => {
    if (!document.hidden) syncFrame(true);
  };
  const handleFocus = () => syncFrame(true);

  syncFrame(true);
  const timer = window.setInterval(syncFrame, REPLAY_CLOCK_TICK_MS);
  window.addEventListener("storage", handleStorage);
  window.addEventListener("focus", handleFocus);
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("focus", handleFocus);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const scaleRisk = (value, cautionStart, warningStart) =>
  clamp((value - cautionStart) / (warningStart - cautionStart), 0, 1);

function deriveRiskScore(sample, previousSample = null) {
  const temperatureRisk = scaleRisk(sample.temperature, 40, 46);
  const currentRisk = scaleRisk(sample.current, 70, 86);
  const voltageGapRisk = scaleRisk(sample.voltageDeviation, 0.043, 0.095);
  const temperatureRise = previousSample ? sample.temperature - previousSample.temperature : 0;
  const temperatureRiseRisk = scaleRisk(temperatureRise, 2, 6);
  const weightedRisk = clamp(
    temperatureRisk * 0.34 +
      currentRisk * 0.22 +
      voltageGapRisk * 0.34 +
      temperatureRiseRisk * 0.1,
    0,
    1,
  );

  if (
    sample.temperature >= 46 ||
    sample.current >= 86 ||
    sample.voltageDeviation >= 0.095
  ) {
    return Math.max(weightedRisk, 0.72);
  }

  if (
    sample.temperature >= 42 ||
    sample.current >= 72 ||
    sample.voltageDeviation >= 0.065
  ) {
    return Math.max(weightedRisk, 0.42);
  }

  return weightedRisk;
}

function prepareTelemetryRecords(records) {
  return records.map((record, index) => {
    const sample = {
      ...record,
      time: record.timeStart?.slice(11, 16) ?? "--:--",
    };

    return {
      ...sample,
      alertScore: deriveRiskScore(sample, index > 0 ? records[index - 1] : null),
    };
  });
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

const stateCopy = {
  normal: {
    badge: "NORMAL",
    label: "정상",
    notificationTitle: "정상 알림",
    notificationAction: "즉시 조치 없음",
    certificateNote: "현재 상태 기준으로 발급 가능한 배터리 인증서 예시 화면입니다.",
  },
  caution: {
    badge: "CAUTION",
    label: "주의",
    notificationTitle: "주의 알림",
    notificationAction: "출력 제한 및 점검 권장",
    certificateNote: "주의 상태에서는 배터리 인증서를 발급할 수 없습니다. 정상 상태 복귀 후 다시 시도하세요.",
  },
  warning: {
    badge: "WARNING",
    label: "경고",
    notificationTitle: "경고 알림",
    notificationAction: "즉시 정차 및 관제 연결",
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
  if (
    sample.alertScore >= 0.72 ||
    sample.temperature >= 46 ||
    sample.current >= 86 ||
    sample.voltageDeviation >= 0.095
  ) {
    return "warning";
  }

  if (
    sample.alertScore >= 0.42 ||
    sample.temperature >= 42 ||
    sample.current >= 72 ||
    sample.voltageDeviation >= 0.065
  ) {
    return "caution";
  }

  return "normal";
}

const alertSignalDefinitions = [
  {
    label: "온도",
    value: (sample) => sample.temperature,
    format: formatTemp,
    cautionThreshold: 42,
    warningThreshold: 46,
  },
  {
    label: "충전 전류",
    value: (sample) => sample.current,
    format: formatAmp,
    cautionThreshold: 72,
    warningThreshold: 86,
  },
  {
    label: "셀 전압 편차",
    value: (sample) => sample.voltageDeviation,
    format: formatDeviation,
    cautionThreshold: 0.065,
    warningThreshold: 0.095,
  },
];

function getTriggeredAlertSignals(sample, stateKey) {
  const thresholdKey = stateKey === "warning" ? "warningThreshold" : "cautionThreshold";

  return alertSignalDefinitions
    .map((signal) => {
      const value = signal.value(sample);
      return {
        ...signal,
        value,
        threshold: signal[thresholdKey],
      };
    })
    .filter((signal) => signal.value >= signal.threshold);
}

function buildAlertReasonSummary(sample, stateKey) {
  const signals = getTriggeredAlertSignals(sample, stateKey);
  const riskThreshold = stateKey === "warning" ? 0.72 : 0.42;
  const factors = signals.map((signal) => `${signal.label} ${signal.format(signal.value)}`);

  if (sample.alertScore >= riskThreshold) {
    factors.push(`Risk Score ${formatScore(sample.alertScore)}`);
  }

  if (!factors.length) {
    return "복합 센서 변화가 감지되어 추가 확인이 필요합니다.";
  }

  const statusLabel = stateKey === "warning" ? "경고" : "주의";
  return `${factors.join(", ")}으로 ${statusLabel} 상태입니다.`;
}

function createStateMessage(stateKey, sample) {
  if (stateKey === "warning") {
    return {
      reasonSummary: buildAlertReasonSummary(sample, stateKey),
      summaryTitle: "즉시 점검 필요",
      summaryBody: "모델 출력값과 센서 지표가 동시에 악화되어 운행 중단 및 정비 확인이 필요한 상태입니다.",
      certificateSummary: "경고 상태에서는 배터리 인증서를 발급할 수 없습니다.",
    };
  }

  if (stateKey === "caution") {
    return {
      reasonSummary: buildAlertReasonSummary(sample, stateKey),
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
  if (stateKey === "warning") {
    const reasons = [];
    if (sample.temperature >= 46) reasons.push(`온도 ${formatTemp(sample.temperature)}가 경고 기준 46.0°C 이상입니다.`);
    if (sample.current >= 86) reasons.push(`충전 전류 ${formatAmp(sample.current)}가 경고 기준 86.0A 이상입니다.`);
    if (sample.voltageDeviation >= 0.095) reasons.push(`셀 전압 편차 ${formatDeviation(sample.voltageDeviation)}가 경고 기준 0.10V 이상입니다.`);
    if (sample.alertScore >= 0.72) reasons.push(`Risk Score ${formatScore(sample.alertScore)}로 즉시 점검이 필요합니다.`);
    if (!reasons.length) reasons.push(`복합 센서 변화가 감지되어 즉시 확인이 필요합니다.`);
    return reasons.slice(0, 3);
  }

  if (stateKey === "caution") {
    const reasons = [];
    if (sample.temperature >= 42) reasons.push(`온도 ${formatTemp(sample.temperature)}가 주의 기준 42.0°C 이상입니다.`);
    if (sample.current >= 72) reasons.push(`충전 전류 ${formatAmp(sample.current)}가 주의 기준 72.0A 이상입니다.`);
    if (sample.voltageDeviation >= 0.065) reasons.push(`셀 전압 편차 ${formatDeviation(sample.voltageDeviation)}가 주의 기준 0.07V 이상입니다.`);
    if (sample.alertScore >= 0.42) reasons.push(`Risk Score ${formatScore(sample.alertScore)}로 관찰이 필요합니다.`);
    if (!reasons.length) reasons.push(`센서 신호가 주의 구간에 가까워지고 있습니다.`);
    return reasons.slice(0, 3);
  }

  return [
    `현재 SOH ${formatPercent(sample.soh)}와 예측 SOH ${formatPercent(sample.predictedSoh)}가 안정 범위입니다.`,
    `Risk Score ${formatScore(sample.alertScore)}로 낮은 수준입니다.`,
    `온도, 충전 전류, 셀 전압 편차가 정상 범위입니다.`,
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
      ["Risk Score", formatScore(sample.alertScore)],
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
          "상태는 버튼이 아니라 실제 센서 요약값에서 계산한 Risk Score로 자동 전환됩니다.",
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
      "타이어 정보는 차량 전체 상태 대시보드 확장을 위한 보조 데이터입니다.",
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
        : "모터는 현재 보조 상태 지표 기준 정상 범위입니다.",
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
        : "냉각 시스템은 배터리 온도 변화에 따라 보조 상태가 함께 변합니다.",
      "논문 Module 2의 온도 변화 기반 이상 징후 경고와 가장 직접적으로 연결됩니다.",
      "배터리 이상 징후와 연결해 확인하는 보조 상태 표현입니다.",
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
        : "브레이크 패널은 차량 전체 상태 UI 확장을 위한 보조 정보입니다.",
      "배터리 SOH 예측이 핵심이고, 브레이크는 부위별 상세 패널 예시로 가볍게 유지합니다.",
      "선택 부위가 바뀌어도 상단 배터리 경고와 그래프는 계속 실시간 갱신됩니다.",
    ],
  },
};

async function initUserPage() {
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
  const certificateStatus = document.getElementById("certificateStatus");
  const certificateSummary = document.getElementById("certificateSummary");
  const certificateModalId = document.getElementById("certificateModalId");
  const certificateModalIssuedAt = document.getElementById("certificateModalIssuedAt");
  const certificateModalStatus = document.getElementById("certificateModalStatus");
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

  let telemetryData = [];
  try {
    const dashboardData = await loadJson(USER_DASHBOARD_DATA_URL);
    telemetryData = prepareTelemetryRecords(dashboardData.records ?? []);
  } catch (error) {
    console.error(error);
    if (chartFallback) {
      chartFallback.hidden = false;
      chartFallback.textContent = "Unable to load the dashboard telemetry JSON.";
    }
    return;
  }

  if (!telemetryData.length) {
    if (chartFallback) {
      chartFallback.hidden = false;
      chartFallback.textContent = "The dashboard telemetry JSON does not contain any records.";
    }
    return;
  }

  let toastTimer = null;
  let telemetryIndex = 0;
  let hasRenderedTelemetry = false;
  let selectedPart = "battery";
  let currentSample = telemetryData[0];
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
            title: {
              display: true,
              text: "충전 사이클",
              color: "#64748b",
              font: {
                size: 11,
                weight: "600",
              },
            },
            grid: {
              color: "rgba(148, 163, 184, 0.22)",
            },
            ticks: {
              color: "#64748b",
            },
          },
          y: {
            suggestedMin: 60,
            suggestedMax: 100,
            title: {
              display: true,
              text: "SOH (%)",
              color: "#64748b",
              font: {
                size: 11,
                weight: "600",
              },
            },
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

    const visibleSamples = telemetryData.slice(
      Math.max(0, telemetryIndex - USER_CHART_HISTORY_LIMIT + 1),
      telemetryIndex + 1,
    );
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

    if (certificateStatus) certificateStatus.textContent = state.badge;
    if (certificateSummary) certificateSummary.textContent = copy.certificateSummary;
    if (certificateModalId) certificateModalId.textContent = certificateId;
    if (certificateModalIssuedAt) certificateModalIssuedAt.textContent = formatDateTime(new Date());
    if (certificateModalStatus) certificateModalStatus.textContent = state.badge;
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
        ["Risk Score", formatScore(sample.alertScore)],
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
  startSharedReplay(telemetryData.length, (frameIndex) => {
    telemetryIndex = frameIndex;
    applyTelemetrySample(telemetryData[telemetryIndex], hasRenderedTelemetry);
    hasRenderedTelemetry = true;
  });
}

function buildCertificateChecks(sample, stateKey) {
  return [
    {
      label: "Overall status is NORMAL",
      value: stateKey === "normal",
      detail: `Current status: ${stateCopy[stateKey].badge}`,
    },
    {
      label: "SOH is above issue threshold",
      value: sample.soh >= 75,
      detail: `Actual SOH ${formatPercent(sample.soh)}`,
    },
    {
      label: "Prediction uncertainty is controlled",
      value: sample.predStd <= 6.5,
      detail: `Prediction std ${sample.predStd.toFixed(1)}%`,
    },
    {
      label: "Thermal and electrical signals are stable",
      value: sample.temperature < 42 && sample.current < 72 && sample.voltageDeviation < 0.065,
      detail: `${formatTemp(sample.temperature)} / ${formatAmp(sample.current)} / ${formatDeviation(sample.voltageDeviation)}`,
    },
    {
      label: "Risk Score is below caution range",
      value: sample.alertScore < 0.42,
      detail: `Risk Score ${formatScore(sample.alertScore)}`,
    },
  ];
}

function buildClientH1Comparison(evaluation) {
  return (evaluation.clientH1Metrics ?? []).map((client) => {
    const methods = Object.fromEntries(
      client.methods.map((method) => [method.method, method]),
    );

    return {
      client: `EV-${client.clientId}`,
      localMae: methods.local?.mae ?? null,
      proposedMae: methods.proposed?.mae ?? null,
    };
  });
}

async function initAdminPage() {
  const body = document.body;
  if (!body.classList.contains("admin-page")) return;

  const dashboard = document.querySelector(".admin-dashboard");
  if (!dashboard) return;

  const pipelineSteps = document.querySelectorAll("[data-pipeline-step]");
  const clientGrid = document.getElementById("adminClientGrid");
  const trainingChartFallback = document.getElementById("adminTrainingChartFallback");
  const personalizationChartFallback = document.getElementById("adminPersonalizationChartFallback");
  let adminTrainingConfig = {};
  let adminTrainingRoundMetrics = [];
  let adminClientH1Comparison = [];
  let adminReplayFrames = [];

  try {
    const adminDashboardData = await loadJson(ADMIN_DASHBOARD_DATA_URL);
    const adminModelEvaluation = adminDashboardData.evaluation ?? {};
    adminTrainingConfig = adminDashboardData.trainingReplay?.config ?? {};
    adminTrainingRoundMetrics = adminDashboardData.trainingReplay?.rounds ?? [];
    adminClientH1Comparison = buildClientH1Comparison(adminModelEvaluation);
    adminReplayFrames = adminDashboardData.replay?.frames ?? [];
  } catch (error) {
    console.error(error);
    if (trainingChartFallback) {
      trainingChartFallback.hidden = false;
      trainingChartFallback.textContent = "Unable to load the admin dashboard JSON.";
    }
    if (personalizationChartFallback) {
      personalizationChartFallback.hidden = false;
      personalizationChartFallback.textContent = "Unable to load the admin dashboard JSON.";
    }
  }

  let adminRoundIndex = 0;
  const adminReplayLastCycle = adminReplayFrames[adminReplayFrames.length - 1]?.cycle ?? "--";
  const adminGlobalRoundTotal = adminTrainingConfig.globalRounds ?? adminTrainingRoundMetrics.length;
  const adminClientMetricsById = new Map(
    adminClientH1Comparison.map((client) => [client.client, client]),
  );
  let adminTrainingMetricsChart = null;
  let adminPersonalizationChart = null;

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

    if (!adminTrainingRoundMetrics.length) {
      if (trainingChartFallback) trainingChartFallback.hidden = false;
      return null;
    }

    if (!window.Chart) {
      if (trainingChartFallback) trainingChartFallback.hidden = false;
      return null;
    }

    if (trainingChartFallback) trainingChartFallback.hidden = true;

    return new window.Chart(canvas, {
      type: "line",
      data: {
        labels: adminTrainingRoundMetrics.map((metric) => `R${metric.round}`),
        datasets: [
          {
            label: "Validation MAE",
            data: adminTrainingRoundMetrics.map(() => null),
            borderColor: "#2563eb",
            backgroundColor: "#2563eb",
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.36,
          },
          {
            label: "Validation RMSE",
            data: adminTrainingRoundMetrics.map(() => null),
            borderColor: "#16a34a",
            backgroundColor: "#16a34a",
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
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(3)}%`,
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Global FL Round",
              color: "#64748b",
              font: {
                size: 11,
                weight: "600",
              },
            },
            grid: {
              color: "rgba(148, 163, 184, 0.22)",
            },
            ticks: {
              color: "#64748b",
            },
          },
          y: {
            min: 0,
            suggestedMax: 4.4,
            title: {
              display: true,
              text: "검증 오차 (%)",
              color: "#64748b",
              font: {
                size: 11,
                weight: "600",
              },
            },
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

  const updateAdminTrainingMetricsChart = (round) => {
    if (!adminTrainingMetricsChart) return;

    const hasValidatedCurrentRound = round.phaseStep >= 4;
    const completedRound = round.phaseStep === 5
      ? adminGlobalRoundTotal
      : Math.max(0, round.globalRound - (hasValidatedCurrentRound ? 0 : 1));
    const visibleMetrics = (key) =>
      adminTrainingRoundMetrics.map((metric) => (metric.round <= completedRound ? metric[key] : null));

    adminTrainingMetricsChart.data.datasets[0].data = visibleMetrics("valMae");
    adminTrainingMetricsChart.data.datasets[1].data = visibleMetrics("valRmse");
    adminTrainingMetricsChart.data.datasets.forEach((dataset) => {
      dataset.pointRadius = adminTrainingRoundMetrics.map((metric) =>
        metric.round <= completedRound && metric.round === adminTrainingConfig.bestRound ? 6 : 3,
      );
      dataset.pointBackgroundColor = adminTrainingRoundMetrics.map((metric) =>
        metric.round === adminTrainingConfig.bestRound ? "#d97706" : dataset.borderColor,
      );
    });
    adminTrainingMetricsChart.update();

    setText(
      "adminMetricBadge",
      `Round ${completedRound} / ${adminGlobalRoundTotal} · Best R${adminTrainingConfig.bestRound ?? "--"}`,
    );
  };

  const createAdminPersonalizationChart = () => {
    const canvas = document.getElementById("adminPersonalizationChart");
    if (!canvas) return null;

    if (!adminClientH1Comparison.length) {
      if (personalizationChartFallback) personalizationChartFallback.hidden = false;
      return null;
    }

    if (!window.Chart) {
      if (personalizationChartFallback) personalizationChartFallback.hidden = false;
      return null;
    }

    if (personalizationChartFallback) personalizationChartFallback.hidden = true;

    return new window.Chart(canvas, {
      type: "bar",
      data: {
        labels: adminClientH1Comparison.map((item) => item.client),
        datasets: [
          {
            label: "Local-only",
            data: adminClientH1Comparison.map((item) => item.localMae),
            backgroundColor: "rgba(37, 99, 235, 0.28)",
            borderColor: "#2563eb",
            borderWidth: 1,
            borderRadius: 8,
          },
          {
            label: "Proposed pFL",
            data: adminClientH1Comparison.map((item) => item.proposedMae),
            backgroundColor: "rgba(22, 163, 74, 0.42)",
            borderColor: "#16a34a",
            borderWidth: 1,
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
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)}% MAE`,
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "차량 클라이언트",
              color: "#64748b",
              font: {
                size: 11,
                weight: "600",
              },
            },
            grid: {
              display: false,
            },
            ticks: {
              color: "#64748b",
            },
          },
          y: {
            min: 0,
            suggestedMax: 6,
            title: {
              display: true,
              text: "MAE",
              color: "#64748b",
              font: {
                size: 11,
                weight: "600",
              },
            },
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

  const renderAdminPipeline = (round) => {
    pipelineSteps.forEach((step) => {
      const stepIndex = Number(step.dataset.pipelineStep);
      step.classList.toggle("is-complete", stepIndex < round.phaseStep || round.replayProgress === 100);
      step.classList.toggle("is-active", stepIndex === round.phaseStep && round.replayProgress < 100);
    });
  };

  const renderAdminClients = (round) => {
    if (!clientGrid) return;

    clientGrid.innerHTML = round.clients
      .map((client) => {
        const evaluation = adminClientMetricsById.get(client.id);
        const finalH1Mae = evaluation?.proposedMae;
        const validationMae = client.valMae ?? finalH1Mae;
        const validationRmse = client.valRmse;

        return `
          <article class="client-card ${statusClass(client.status)}">
            <div class="client-card__head">
              <strong>${client.id}</strong>
              <span class="client-status">${client.status}</span>
            </div>
            <div class="client-card__metrics">
              <span>Local Epoch <strong>${client.localEpoch}</strong></span>
              <span>Validation MAE <strong>${validationMae == null ? "--" : `${validationMae.toFixed(3)}%`}</strong></span>
              <span>Validation RMSE <strong>${validationRmse == null ? "--" : `${validationRmse.toFixed(3)}%`}</strong></span>
              <span>Sync <strong>${client.sync}</strong></span>
            </div>
            <div class="client-upload">
              <span>Upload ${client.upload}%</span>
              <div class="admin-progress">
                <span style="width: ${client.upload}%"></span>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  };

  const applyAdminRound = (round) => {
    const totalClients = round.clients.length;
    const activeClients = round.clients.filter((client) => client.status !== "Delayed").length;
    const uploadedClients = round.clients.filter((client) => client.upload >= 100).length;
    const uploadAverage = totalClients
      ? round.clients.reduce((sum, client) => sum + client.upload, 0) / totalClients
      : 0;
    const delayedClients = round.clients.filter((client) => client.status === "Delayed");
    const delayedLabel = delayedClients.length
      ? delayedClients.map((client) => client.id).join(", ")
      : "None";

    setText("adminRoundStatus", round.phase.toUpperCase());
    setText("adminRoundValue", `${round.globalRound} / ${adminGlobalRoundTotal}`);
    setText(
      "adminRoundLabel",
      `${round.stageLabel} · Cycle ${round.cycle} / ${adminReplayLastCycle}`,
    );
    setText("adminRoundProgressText", `${round.trainingProgress}%`);
    setText("adminClientCount", `${totalClients} / ${totalClients}`);
    setText("adminActiveClientCount", String(activeClients));
    setText("adminDelayedClientText", delayedClients.length ? `${delayedLabel} delayed` : "No delayed client");
    setText(
      "adminAggregationStatus",
      round.phaseStep < 2 ? "Waiting" : round.aggregationProgress >= 100 ? "Complete" : round.phase,
    );
    setText("adminAggregationProgressText", `${round.aggregationProgress}% server merge`);
    setText("adminSyncStatus", round.syncStatus);
    setText("adminBroadcastProgressText", `${round.broadcastProgress}% broadcast`);
    setText("adminPipelinePhase", round.phase);
    setText("adminSyncBadge", round.syncBadge);
    setText("adminUploadText", `${uploadedClients} / ${totalClients} updates received (${Math.round(uploadAverage)}%)`);
    setText("adminAggregationText", `${round.aggregationProgress}% merged`);
    setText("adminBroadcastText", `${round.broadcastProgress}% deployed`);
    setText("adminDelayedClient", delayedLabel);
    setText("adminSyncMessage", round.syncMessage);
    setText("adminClientPhase", round.clientPhase);

    setProgress("adminRoundProgressBar", round.trainingProgress);
    setProgress("adminUploadBar", uploadAverage);
    setProgress("adminAggregationBar", round.aggregationProgress);
    setProgress("adminBroadcastBar", round.broadcastProgress);

    renderAdminPipeline(round);
    renderAdminClients(round);
    updateAdminTrainingMetricsChart(round);
  };

  adminTrainingMetricsChart = createAdminTrainingMetricsChart();
  adminPersonalizationChart = createAdminPersonalizationChart();

  if (!adminReplayFrames.length) {
    if (clientGrid) {
      clientGrid.innerHTML = '<p class="chart-fallback">Unable to load the FL monitoring replay JSON.</p>';
    }
    return;
  }

  startSharedReplay(adminReplayFrames.length, (frameIndex) => {
    adminRoundIndex = frameIndex;
    applyAdminRound(adminReplayFrames[adminRoundIndex]);
  });
}

void initUserPage();
void initAdminPage();
