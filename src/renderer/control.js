const $ = (id) => document.getElementById(id);

let settings;
let updateTimer;
let cameraDevices = [];
let recordingSources = [];
let mediaRecorder;
let recordedChunks = [];
let activeDisplayStream;
let activeMicStream;
let activeCanvasStream;
let activeRegionVideo;
let activeDrawFrame;
let activeCursorPoll;
let latestCursorPosition = null;
let recordingStartedAt = 0;
let recordingTimer;
let lastRecordingPath = "";
let updateCheckTimer;
let lastUpdateStatus;

const fields = {
  name: $("name"),
  headline: $("headline"),
  handle: $("handle"),
  bio: $("bio"),
  cta: $("cta"),
  useCamera: $("useCamera"),
  mirrorCamera: $("mirrorCamera"),
  cameraSource: $("cameraSource"),
  cameraDeviceId: $("cameraDeviceId"),
  size: $("size"),
  style: $("style"),
  accentColor: $("accentColor"),
  textColor: $("textColor"),
  overlayVisible: $("overlayVisible"),
  overlayProtectedFromCapture: $("overlayProtectedFromCapture"),
  showCta: $("showCta"),
  alwaysOnTop: $("alwaysOnTop"),
  locked: $("locked"),
  script: $("script"),
  speed: $("speed"),
  fontSize: $("fontSize"),
  opacity: $("opacity"),
  prompterVisible: $("prompterVisible"),
  protectedFromCapture: $("protectedFromCapture"),
  clickThrough: $("clickThrough"),
  recordingMode: $("recordingMode"),
  recordingFrameRate: $("recordingFrameRate"),
  recordingSourceId: $("recordingSourceId"),
  includeMic: $("includeMic"),
  magnifierEnabled: $("magnifierEnabled"),
  magnifierZoom: $("magnifierZoom"),
  magnifierSize: $("magnifierSize")
};

function isContinuityCamera(label = "") {
  return /iphone|continuity|desk view|接续|连续互通|手机/i.test(label);
}

function isBuiltInCamera(label = "") {
  return /facetime|built-?in|macbook|display camera|studio display|hd camera|内建|内置/i.test(label);
}

function normalizedCameraSource(nextSettings = settings) {
  const source = nextSettings?.profile?.cameraSource;
  return source === "phone" || source === "manual" ? source : "local";
}

function pickCameraForSource(cameras, source, currentDeviceId) {
  const current = cameras.find((device) => device.deviceId === currentDeviceId);

  if (source === "manual") {
    return current?.deviceId || "";
  }

  if (source === "phone") {
    if (current && isContinuityCamera(current.label)) {
      return currentDeviceId;
    }
    const phone = cameras.find((device) => isContinuityCamera(device.label));
    return phone?.deviceId || current?.deviceId || "";
  }

  if (current && !isContinuityCamera(current.label)) {
    return currentDeviceId;
  }

  const builtIn = cameras.find((device) => isBuiltInCamera(device.label) && !isContinuityCamera(device.label));
  if (builtIn) return builtIn.deviceId;

  const nonContinuity = cameras.find((device) => !isContinuityCamera(device.label));
  return nonContinuity?.deviceId || cameras[0]?.deviceId || "";
}

function sourceForManualDevice(device) {
  if (!device) return normalizedCameraSource();
  return isContinuityCamera(device.label) ? "phone" : "manual";
}

function setInputValue(input, value) {
  if (input.type === "checkbox") {
    input.checked = Boolean(value);
  } else {
    input.value = value ?? "";
  }
}

function readInput(input) {
  if (input.type === "checkbox") return input.checked;
  if (input.type === "range") return Number(input.value);
  return input.value;
}

function syncForm(next) {
  settings = next;
  setInputValue(fields.name, settings.profile.name);
  setInputValue(fields.headline, settings.profile.headline);
  setInputValue(fields.handle, settings.profile.handle);
  setInputValue(fields.bio, settings.profile.bio);
  setInputValue(fields.cta, settings.profile.cta);
  setInputValue(fields.useCamera, settings.profile.useCamera);
  setInputValue(fields.mirrorCamera, settings.profile.mirrorCamera);
  setInputValue(fields.cameraSource, normalizedCameraSource(settings));
  setInputValue(fields.cameraDeviceId, settings.profile.cameraDeviceId);
  setInputValue(fields.size, settings.overlay.size);
  setInputValue(fields.style, settings.overlay.style);
  setInputValue(fields.accentColor, settings.overlay.accentColor);
  setInputValue(fields.textColor, settings.overlay.textColor);
  setInputValue(fields.overlayVisible, settings.overlay.visible);
  setInputValue(fields.overlayProtectedFromCapture, settings.overlay.protectedFromCapture);
  setInputValue(fields.showCta, settings.overlay.showCta);
  setInputValue(fields.alwaysOnTop, settings.overlay.alwaysOnTop);
  setInputValue(fields.locked, settings.overlay.locked);
  setInputValue(fields.script, settings.prompter.script);
  setInputValue(fields.speed, settings.prompter.speed);
  setInputValue(fields.fontSize, settings.prompter.fontSize);
  setInputValue(fields.opacity, settings.prompter.opacity);
  setInputValue(fields.prompterVisible, settings.prompter.visible);
  setInputValue(fields.protectedFromCapture, settings.prompter.protectedFromCapture);
  setInputValue(fields.clickThrough, settings.prompter.clickThrough);
  setInputValue(fields.recordingMode, settings.recording.mode);
  setInputValue(fields.recordingFrameRate, settings.recording.frameRate);
  setInputValue(fields.recordingSourceId, settings.recording.sourceId);
  setInputValue(fields.includeMic, settings.recording.includeMic);
  setInputValue(fields.magnifierEnabled, settings.recording.magnifierEnabled);
  setInputValue(fields.magnifierZoom, settings.recording.magnifierZoom);
  setInputValue(fields.magnifierSize, settings.recording.magnifierSize);
  renderPreview();
  renderRecordingControls();
  renderSourcePicker();
  renderRegionSummary();
}

function scheduleUpdate(partial) {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(async () => {
    settings = await window.overlayApp.updateSettings(partial);
    renderPreview();
  }, 80);
}

function bindInput(input, path) {
  input.addEventListener("input", () => {
    const value = readInput(input);
    scheduleUpdate(path.reduceRight((acc, key) => ({ [key]: acc }), value));
  });
  input.addEventListener("change", () => {
    const value = readInput(input);
    scheduleUpdate(path.reduceRight((acc, key) => ({ [key]: acc }), value));
  });
}

function renderPreview() {
  if (!settings) return;
  const miniCard = $("miniCard");
  const miniAvatar = $("miniAvatar");
  const miniAvatarWrap = miniAvatar.parentElement;
  const initial = (settings.profile.name || "D").trim().slice(0, 1).toUpperCase();

  miniCard.classList.toggle("clean", settings.overlay.style === "clean");
  miniCard.style.setProperty("--preview-accent", settings.overlay.accentColor);
  if (settings.overlay.style === "clean") {
    miniCard.style.background = "";
  } else {
    miniCard.style.background = `linear-gradient(135deg, color-mix(in srgb, ${settings.overlay.accentColor}, transparent 78%), transparent 38%), #0c0908`;
  }
  $("miniHandle").textContent = settings.profile.handle;
  $("miniName").textContent = settings.profile.name;
  $("miniHeadline").textContent = settings.profile.headline;
  $("miniBio").textContent = settings.profile.bio;
  $("miniCta").textContent = settings.profile.cta;
  $("miniCta").style.display = settings.overlay.showCta ? "block" : "none";
  $("miniInitial").textContent = initial;
  $("overlayStatus").textContent = `${settings.overlay.visible ? "录屏名片 · 已显示" : "录屏名片 · 已隐藏"} · ${
    settings.overlay.protectedFromCapture ? "隐身" : "入镜"
  }`;
  $("prompterStatus").textContent = `${settings.prompter.visible ? "防录屏提词器 · 已显示" : "防录屏提词器 · 已隐藏"} · ${
    settings.prompter.protectedFromCapture ? "隐身" : "入镜"
  }`;
  $("toggleOverlay").textContent = settings.overlay.visible ? "隐藏名片" : "显示名片";
  $("togglePrompter").textContent = settings.prompter.visible ? "隐藏提词器" : "显示提词器";

  if (settings.profile.avatarDataUrl) {
    miniAvatar.src = settings.profile.avatarDataUrl;
    miniAvatarWrap.classList.add("has-image");
  } else {
    miniAvatar.removeAttribute("src");
    miniAvatarWrap.classList.remove("has-image");
  }
}

function updateStateCopy(status) {
  if (!status) return "GitHub 同步：未检查";
  const commit = status.current ? ` · 本地 ${status.current}` : "";
  return `${status.title}${commit} · ${status.detail}`;
}

function renderUpdateStatus(status, busy = false) {
  lastUpdateStatus = status || lastUpdateStatus;
  const updateStatus = $("updateStatus");
  updateStatus.textContent = busy ? "GitHub 同步：正在处理..." : updateStateCopy(lastUpdateStatus);
  updateStatus.dataset.state = busy ? "busy" : lastUpdateStatus?.state || "idle";
  $("checkUpdate").disabled = busy;
  $("runUpdate").disabled = busy || !lastUpdateStatus?.canUpdate;
  $("restartApp").disabled = busy || !lastUpdateStatus?.restartRequired;
}

async function refreshUpdateStatus(fetchRemote = false) {
  renderUpdateStatus(lastUpdateStatus, true);
  const status = await window.overlayApp.getUpdateStatus({ fetchRemote });
  renderUpdateStatus(status);
}

async function runAppUpdate() {
  renderUpdateStatus(lastUpdateStatus, true);
  const status = await window.overlayApp.runUpdate();
  renderUpdateStatus(status);
}

function scheduleInitialUpdateCheck() {
  clearTimeout(updateCheckTimer);
  updateCheckTimer = setTimeout(() => refreshUpdateStatus(false), 400);
}

function recordingModeLabel(mode) {
  if (mode === "window") return "窗口";
  if (mode === "region") return "区域";
  return "屏幕";
}

function permissionCopy(status) {
  if (status === "granted") return ["已授权", "granted"];
  if (status === "denied" || status === "restricted") return ["未授权", "blocked"];
  if (status === "not-determined") return ["需实测", "unknown"];
  return ["未知", "unknown"];
}

function setPermissionCard(cardId, textId, status) {
  const [copy, state] = permissionCopy(status);
  const card = $(cardId);
  card.dataset.state = state;
  $(textId).textContent = copy;
}

async function refreshPermissionState() {
  const [screenAccess, cameraAccess, micAccess] = await Promise.all([
    window.overlayApp.getScreenAccessStatus().catch(() => "unknown"),
    window.overlayApp.getCameraAccessStatus().catch(() => "unknown"),
    window.overlayApp.getMicrophoneAccessStatus().catch(() => "unknown")
  ]);
  setPermissionCard("screenPermissionCard", "screenPermissionText", screenAccess);
  setPermissionCard("cameraPermissionCard", "cameraPermissionText", cameraAccess);
  setPermissionCard("micPermissionCard", "micPermissionText", micAccess);
  return { screenAccess, cameraAccess, micAccess };
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function preferredMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function setRecordingStatus(title, detail, state = "idle") {
  $("recordingStatusTitle").textContent = title;
  $("recordingStatusDetail").textContent = detail;
  $("recordingStatus").dataset.state = state;
}

function selectedRecordingSource() {
  return recordingSources.find((source) => source.id === fields.recordingSourceId.value);
}

function visibleRecordingSources(mode = fields.recordingMode.value) {
  const type = mode === "window" ? "window" : "screen";
  return recordingSources.filter((source) => source.type === type);
}

function showScreenPermissionRequired() {
  recordingSources = [];
  fields.recordingSourceId.innerHTML = `<option value="">录屏来源不可用</option>`;
  renderSourcePicker();
  setRecordingStatus(
    "暂时读取不到录屏来源",
    "可以先点“系统选择器录屏”继续录；如果想恢复缩略图来源，请点“授权后重启 App”。",
    "error"
  );
  renderRecordingControls();
}

function renderRecordingSources() {
  const select = fields.recordingSourceId;
  const mode = fields.recordingMode.value || settings.recording.mode;
  const sources = visibleRecordingSources(mode);
  select.innerHTML = "";

  if (!sources.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = mode === "window" ? "未发现可录窗口" : "未发现屏幕";
    select.append(option);
    renderSourcePicker();
    renderRecordingControls();
    return;
  }

  for (const source of sources) {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = `${recordingModeLabel(mode)} · ${source.name}`;
    select.append(option);
  }

  const currentId = settings.recording.sourceId;
  select.value = sources.some((source) => source.id === currentId) ? currentId : sources[0].id;
  renderSourcePicker();
  renderRecordingControls();
}

function renderSourcePicker() {
  const container = $("sourcePicker");
  if (!container) return;
  const mode = fields.recordingMode.value || settings?.recording?.mode || "screen";
  const sources = visibleRecordingSources(mode);
  container.innerHTML = "";

  if (!sources.length) {
    const empty = document.createElement("div");
    empty.className = "source-empty";
    empty.textContent = mode === "window"
      ? "暂无可选窗口。打开目标软件后点“刷新可录窗口”。"
      : "暂无可选屏幕。先开启录屏权限，然后点“刷新可录窗口”。";
    container.append(empty);
    return;
  }

  for (const source of sources.slice(0, 12)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "source-card";
    button.classList.toggle("active", source.id === fields.recordingSourceId.value);
    button.title = source.name;

    if (source.thumbnail) {
      const image = document.createElement("img");
      image.src = source.thumbnail;
      image.alt = source.name;
      button.append(image);
    }

    const name = document.createElement("span");
    name.textContent = source.name;
    button.append(name);
    button.addEventListener("click", async () => {
      fields.recordingSourceId.value = source.id;
      await updateRecordingSource();
    });
    container.append(button);
  }
}

function renderRegionSummary() {
  const region = settings?.recording?.region;
  const summary = $("regionSummary");
  if (!summary) return;
  if (fields.recordingMode.value !== "region") {
    summary.textContent = "切换到“框选区域”后，可以拖拽选择录制范围。";
    return;
  }
  if (!region) {
    summary.textContent = "未选择区域";
    return;
  }
  summary.textContent = `已选择区域：${Math.round(region.width)} x ${Math.round(region.height)}，位置 ${Math.round(region.x)}, ${Math.round(region.y)}`;
}

function isRecordingActive() {
  return mediaRecorder && mediaRecorder.state !== "inactive";
}

function renderRecordingControls() {
  const isRecording = isRecordingActive();
  const mode = fields.recordingMode.value;
  const hasSource = Boolean(fields.recordingSourceId.value);
  for (const id of ["quickRecord", "quickRecordInPanel"]) {
    const button = $(id);
    if (button) button.disabled = isRecording;
  }
  for (const id of ["quickSelectWindow", "quickSelectWindowInPanel"]) {
    const button = $(id);
    if (button) button.disabled = isRecording;
  }
  $("systemPickerRecord").disabled = isRecording;
  $("startRecording").disabled = isRecording || !hasSource;
  $("stopRecording").disabled = !isRecording;
  $("openRecordingFile").disabled = !lastRecordingPath;
  $("selectRecordingRegion").disabled = isRecording || mode !== "region" || !hasSource;
  $("refreshRecordingSources").disabled = isRecording;
  fields.recordingMode.disabled = isRecording;
  fields.recordingFrameRate.disabled = isRecording;
  fields.recordingSourceId.disabled = isRecording;
  fields.includeMic.disabled = isRecording;
  fields.magnifierEnabled.disabled = isRecording;
  fields.magnifierZoom.disabled = isRecording || !fields.magnifierEnabled.checked;
  fields.magnifierSize.disabled = isRecording || !fields.magnifierEnabled.checked;
}

async function refreshRecordingSources() {
  fields.recordingSourceId.innerHTML = `<option value="">正在读取屏幕和窗口...</option>`;
  try {
    await refreshPermissionState();
    recordingSources = await window.overlayApp.getRecordingSources();
    if (!recordingSources.length) {
      showScreenPermissionRequired();
      return;
    }
    setPermissionCard("screenPermissionCard", "screenPermissionText", "granted");
    setRecordingStatus("已读取录屏来源", "选择一个屏幕或窗口后即可开始录制。", "idle");
    renderRecordingSources();
  } catch (error) {
    console.error("Failed to load recording sources", error);
    fields.recordingSourceId.innerHTML = `<option value="">读取失败，请重启 App</option>`;
    setRecordingStatus(
      "读取录屏来源失败",
      "系统权限可能刚更新但 App 还没刷新。请点“授权后重启 App”；如果仍失败，再检查系统录屏权限。",
      "error"
    );
  }
}

function activateTab(tabName) {
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  const panel = document.querySelector(`[data-panel="${tabName}"]`);
  if (!tab || !panel) return;
  document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((item) => item.classList.remove("active"));
  tab.classList.add("active");
  panel.classList.add("active");
}

async function updateRecordingSettings(partial) {
  settings = await window.overlayApp.updateSettings({ recording: partial });
  renderRecordingControls();
  renderRegionSummary();
}

async function chooseFirstRecordingSource(mode) {
  fields.recordingMode.value = mode;
  await updateRecordingSettings({
    mode,
    sourceId: "",
    sourceName: "",
    region: mode === "region" ? settings.recording.region : null
  });
  await refreshRecordingSources();
  const sources = visibleRecordingSources(mode);
  if (!sources.length) return null;
  fields.recordingSourceId.value = sources[0].id;
  await updateRecordingSource();
  return sources[0];
}

async function quickRecordScreen() {
  if (isRecordingActive()) return;
  activateTab("recording");
  setRecordingStatus("准备快速录屏", "正在选择当前屏幕。", "saving");
  const source = await chooseFirstRecordingSource("screen");
  if (!source) {
    await startSystemPickerRecording();
    return;
  }
  await startRecording();
}

async function quickSelectWindow() {
  if (isRecordingActive()) return;
  activateTab("recording");
  setRecordingStatus("准备选择窗口", "正在读取当前可录制窗口。", "saving");
  const source = await chooseFirstRecordingSource("window");
  if (!source) {
    setRecordingStatus("未发现可录窗口", "先打开要录制的软件；如果系统开关已打开但仍读取失败，请点“授权后重启 App”。", "error");
    return;
  }
  setRecordingStatus("已切到窗口录制", `当前选择：${source.name}。可在下拉框切换其它窗口。`, "idle");
  fields.recordingSourceId.focus();
}

async function updateRecordingMode() {
  await updateRecordingSettings({
    mode: fields.recordingMode.value,
    sourceId: "",
    sourceName: "",
    region: null
  });
  renderRecordingSources();
  renderRegionSummary();
}

async function updateRecordingSource() {
  const source = selectedRecordingSource();
  await updateRecordingSettings({
    sourceId: source?.id || "",
    sourceName: source?.name || "",
    region: fields.recordingMode.value === "region" ? settings.recording.region : null
  });
  renderSourcePicker();
}

async function updateRecordingFrameRate() {
  await updateRecordingSettings({ frameRate: Number(fields.recordingFrameRate.value) });
}

async function updateIncludeMic() {
  await updateRecordingSettings({ includeMic: fields.includeMic.checked });
}

async function updateRecordingEffects() {
  await updateRecordingSettings({
    magnifierEnabled: fields.magnifierEnabled.checked,
    magnifierZoom: Number(fields.magnifierZoom.value),
    magnifierSize: Number(fields.magnifierSize.value)
  });
}

async function selectRecordingRegion() {
  const source = selectedRecordingSource();
  if (!source) {
    setRecordingStatus("先选择屏幕", "区域录制需要先选择要框选的屏幕。", "error");
    return;
  }
  setRecordingStatus("等待框选区域", "在透明选择层里拖拽，然后点击“使用这个区域”。", "idle");
  const region = await window.overlayApp.selectRecordingRegion(source.displayId);
  if (!region) {
    setRecordingStatus("已取消框选", "可以重新点击“框选录制区域”。", "idle");
    return;
  }
  await updateRecordingSettings({
    mode: "region",
    sourceId: source.id,
    sourceName: source.name,
    region
  });
  syncForm(settings);
}

async function getDesktopStream(sourceId, frameRate) {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        maxFrameRate: frameRate
      }
    }
  });
}

function stopCursorPolling() {
  clearInterval(activeCursorPoll);
  activeCursorPoll = null;
  latestCursorPosition = null;
}

function startCursorPolling() {
  stopCursorPolling();
  activeCursorPoll = setInterval(async () => {
    try {
      latestCursorPosition = await window.overlayApp.getCursorPosition();
    } catch {
      latestCursorPosition = null;
    }
  }, 33);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function capturePlanFor(video, source, mode, region) {
  if (mode === "region" && region) {
    const scaleX = video.videoWidth / region.displayWidth;
    const scaleY = video.videoHeight / region.displayHeight;
    const sourceX = Math.max(0, Math.round(region.x * scaleX));
    const sourceY = Math.max(0, Math.round(region.y * scaleY));
    const sourceWidth = Math.min(video.videoWidth - sourceX, Math.max(2, Math.round(region.width * scaleX)));
    const sourceHeight = Math.min(video.videoHeight - sourceY, Math.max(2, Math.round(region.height * scaleY)));
    return {
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      canvasWidth: sourceWidth,
      canvasHeight: sourceHeight,
      displayId: String(region.displayId || source?.displayId || ""),
      displayX: region.displayX || 0,
      displayY: region.displayY || 0,
      displayWidth: region.displayWidth,
      displayHeight: region.displayHeight,
      scaleX,
      scaleY
    };
  }

  const bounds = source?.displayBounds?.bounds;
  return {
    sourceX: 0,
    sourceY: 0,
    sourceWidth: video.videoWidth,
    sourceHeight: video.videoHeight,
    canvasWidth: video.videoWidth,
    canvasHeight: video.videoHeight,
    displayId: String(source?.displayId || source?.displayBounds?.id || ""),
    displayX: bounds?.x || 0,
    displayY: bounds?.y || 0,
    displayWidth: bounds?.width || video.videoWidth,
    displayHeight: bounds?.height || video.videoHeight,
    scaleX: bounds?.width ? video.videoWidth / bounds.width : 1,
    scaleY: bounds?.height ? video.videoHeight / bounds.height : 1
  };
}

function drawMagnifier(context, video, plan, source) {
  const cursor = latestCursorPosition;
  const magnifier = settings.recording;
  if (!cursor || source?.type !== "screen") return;
  if (plan.displayId && cursor.displayId && String(plan.displayId) !== String(cursor.displayId)) return;

  const rawCursorX = (cursor.x - plan.displayX) * plan.scaleX;
  const rawCursorY = (cursor.y - plan.displayY) * plan.scaleY;
  const centerX = rawCursorX - plan.sourceX;
  const centerY = rawCursorY - plan.sourceY;
  if (centerX < 0 || centerY < 0 || centerX > plan.canvasWidth || centerY > plan.canvasHeight) return;

  const diameter = Math.max(120, Math.min(320, Number(magnifier.magnifierSize) || 190));
  const radius = diameter / 2;
  const zoom = Math.max(1.2, Math.min(4, Number(magnifier.magnifierZoom) || 2));
  const sampleWidth = diameter / zoom;
  const sampleHeight = diameter / zoom;
  const sampleX = clamp(plan.sourceX + centerX - sampleWidth / 2, 0, video.videoWidth - sampleWidth);
  const sampleY = clamp(plan.sourceY + centerY - sampleHeight / 2, 0, video.videoHeight - sampleHeight);
  const destX = centerX - radius;
  const destY = centerY - radius;

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.26)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 6;
  context.beginPath();
  context.arc(centerX, centerY, radius + 3, 0, Math.PI * 2);
  context.fillStyle = "rgba(8, 8, 8, 0.22)";
  context.fill();
  context.restore();

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();
  context.drawImage(video, sampleX, sampleY, sampleWidth, sampleHeight, destX, destY, diameter, diameter);
  const glow = context.createRadialGradient(centerX - radius * 0.35, centerY - radius * 0.35, radius * 0.1, centerX, centerY, radius);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.22)");
  glow.addColorStop(0.58, "rgba(255, 255, 255, 0)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0.22)");
  context.fillStyle = glow;
  context.fillRect(destX, destY, diameter, diameter);
  context.restore();

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.lineWidth = 5;
  context.strokeStyle = settings.overlay.accentColor || "#f51d2a";
  context.stroke();
  context.lineWidth = 2;
  context.strokeStyle = "rgba(255, 255, 255, 0.72)";
  context.stroke();
  context.restore();
}

async function createCompositedStream(displayStream, source, mode, region, frameRate) {
  const video = document.createElement("video");
  video.srcObject = displayStream;
  video.muted = true;
  video.playsInline = true;
  await new Promise((resolve) => {
    video.onloadedmetadata = resolve;
  });
  await video.play();

  const plan = capturePlanFor(video, source, mode, region);
  const shouldMagnify = Boolean(settings.recording.magnifierEnabled && source?.type === "screen");
  if (shouldMagnify) startCursorPolling();

  const canvas = document.createElement("canvas");
  canvas.width = plan.canvasWidth;
  canvas.height = plan.canvasHeight;
  const context = canvas.getContext("2d");

  function draw() {
    context.drawImage(
      video,
      plan.sourceX,
      plan.sourceY,
      plan.sourceWidth,
      plan.sourceHeight,
      0,
      0,
      plan.canvasWidth,
      plan.canvasHeight
    );
    if (shouldMagnify) drawMagnifier(context, video, plan, source);
    activeDrawFrame = requestAnimationFrame(draw);
  }

  activeRegionVideo = video;
  draw();
  activeCanvasStream = canvas.captureStream(frameRate);
  return activeCanvasStream;
}

async function createRecordingStream(source, mode, region, includeMic, frameRate) {
  const sourceId = source.id;
  activeDisplayStream = await getDesktopStream(sourceId, frameRate);
  const shouldComposite = mode === "region" || Boolean(settings.recording.magnifierEnabled && source.type === "screen");
  const videoStream = shouldComposite
    ? await createCompositedStream(activeDisplayStream, source, mode, region, frameRate)
    : activeDisplayStream;
  const tracks = [...videoStream.getVideoTracks()];

  if (includeMic) {
    activeMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
    tracks.push(...activeMicStream.getAudioTracks());
  }

  return new MediaStream(tracks);
}

async function createSystemPickerRecordingStream(includeMic, frameRate) {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("当前 Electron 不支持系统选择器录屏。");
  }

  activeDisplayStream = await navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: {
      frameRate,
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  });

  const tracks = [...activeDisplayStream.getVideoTracks()];

  if (includeMic) {
    activeMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
    tracks.push(...activeMicStream.getAudioTracks());
  }

  return new MediaStream(tracks);
}

function cleanupRecordingStreams() {
  stopCursorPolling();
  if (activeDrawFrame) {
    cancelAnimationFrame(activeDrawFrame);
    activeDrawFrame = null;
  }
  for (const stream of [activeCanvasStream, activeDisplayStream, activeMicStream]) {
    if (!stream) continue;
    for (const track of stream.getTracks()) track.stop();
  }
  activeCanvasStream = null;
  activeDisplayStream = null;
  activeMicStream = null;
  if (activeRegionVideo) {
    activeRegionVideo.pause();
    activeRegionVideo.srcObject = null;
    activeRegionVideo = null;
  }
}

function startRecordingTimer() {
  clearInterval(recordingTimer);
  recordingTimer = setInterval(() => {
    setRecordingStatus("正在录屏", `${formatDuration(Date.now() - recordingStartedAt)} · 点击停止并保存`, "recording");
  }, 500);
}

function stopRecordingTimer() {
  clearInterval(recordingTimer);
  recordingTimer = null;
}

async function saveCurrentRecording(mimeType) {
  stopRecordingTimer();
  setRecordingStatus("正在保存", "视频会保存到影片/ClawCast Studio。", "saving");
  try {
    const blob = new Blob(recordedChunks, { type: mimeType || "video/webm" });
    if (!blob.size) {
      throw new Error("录屏数据为空，可能录制刚开始就停止了。");
    }
    const buffer = await blob.arrayBuffer();
    const saved = await window.overlayApp.saveRecording({
      bytes: new Uint8Array(buffer),
      mimeType: blob.type,
      size: blob.size
    });
    lastRecordingPath = saved.path;
    setRecordingStatus("录屏已保存", `${saved.path} · ${Math.round(saved.size / 1024)} KB`, "done");
  } catch (error) {
    console.error("Recording save failed", error);
    setRecordingStatus("保存失败", error?.message || "录屏数据没有成功写入文件。", "error");
  } finally {
    cleanupRecordingStreams();
    mediaRecorder = null;
    recordedChunks = [];
    renderRecordingControls();
  }
}

function recordingErrorCopy(error) {
  const name = error?.name || String(error || "");
  if (name === "NotAllowedError" || name === "SecurityError") {
    return ["录屏权限被系统拒绝", "可以先用“系统选择器录屏”继续录；如果仍被拒绝，请点“授权后重启 App”，再检查系统录屏权限。"];
  }
  if (name === "NotReadableError") {
    return ["无法读取录制来源", "目标窗口可能关闭了，刷新后重选。"];
  }
  return ["开始录屏失败", "刷新来源或重新选择窗口后再试。"];
}

function beginRecording(stream) {
  recordedChunks = [];
  const mimeType = preferredMimeType();
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) recordedChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", () => saveCurrentRecording(mediaRecorder.mimeType));
  mediaRecorder.start(1000);
  recordingStartedAt = Date.now();
  startRecordingTimer();
  setRecordingStatus("正在录屏", "00:00 · 点击停止并保存", "recording");
  renderRecordingControls();
}

async function startRecording() {
  const source = selectedRecordingSource();
  const mode = fields.recordingMode.value;
  const frameRate = Number(fields.recordingFrameRate.value);
  const includeMic = fields.includeMic.checked;
  const region = settings.recording.region;

  if (!source) {
    setRecordingStatus("没有录制来源", "先刷新并选择屏幕或窗口。", "error");
    return;
  }
  if (mode === "region" && !region) {
    setRecordingStatus("还没框选区域", "点击“框选录制区域”后再开始。", "error");
    return;
  }

  await updateRecordingSettings({
    mode,
    sourceId: source.id,
    sourceName: source.name,
    includeMic,
    frameRate
  });

  setRecordingStatus("正在请求录屏权限", "如果系统弹窗出现，请允许屏幕录制。", "saving");
  try {
    const stream = await createRecordingStream(source, mode, region, includeMic, frameRate);
    beginRecording(stream);
  } catch (error) {
    console.error("Recording start failed", error);
    cleanupRecordingStreams();
    const [title, detail] = recordingErrorCopy(error);
    setRecordingStatus(title, detail, "error");
    renderRecordingControls();
  }
}

async function startSystemPickerRecording() {
  if (isRecordingActive()) return;
  activateTab("recording");

  const frameRate = Number(fields.recordingFrameRate.value);
  const includeMic = fields.includeMic.checked;

  await updateRecordingSettings({
    mode: "screen",
    sourceId: "system-picker",
    sourceName: "系统选择器",
    includeMic,
    frameRate,
    region: null
  });

  setRecordingStatus("打开系统选择器", "在系统弹窗里选择屏幕或窗口，然后开始录制。", "saving");
  try {
    const stream = await createSystemPickerRecordingStream(includeMic, frameRate);
    beginRecording(stream);
  } catch (error) {
    console.error("System picker recording failed", error);
    cleanupRecordingStreams();
    const [title, detail] = recordingErrorCopy(error);
    setRecordingStatus(title, detail, "error");
    renderRecordingControls();
  }
}

function stopRecording() {
  if (!isRecordingActive()) return;
  setRecordingStatus("正在结束录屏", "马上保存文件。", "saving");
  mediaRecorder.stop();
  renderRecordingControls();
}

async function refreshCameraDevices() {
  const select = fields.cameraDeviceId;
  try {
    const access = await window.overlayApp.requestCameraAccess();
    if (access === "denied" || access === "restricted") {
      select.innerHTML = `<option value="">摄像头权限被拒绝</option>`;
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    cameraDevices = cameras;
    select.innerHTML = `<option value="">自动匹配来源</option>`;
    for (const device of cameras) {
      const option = document.createElement("option");
      option.value = device.deviceId;
      const label = device.label || `摄像头 ${select.length}`;
      const suffix = isContinuityCamera(label) ? " · iPhone" : isBuiltInCamera(label) ? " · 本机" : "";
      option.textContent = `${label}${suffix}`;
      select.append(option);
    }
    const source = normalizedCameraSource(settings);
    const preferredDeviceId = pickCameraForSource(cameras, source, settings.profile.cameraDeviceId);
    if (source !== "manual" && preferredDeviceId && preferredDeviceId !== settings.profile.cameraDeviceId) {
      settings = await window.overlayApp.updateSettings({ profile: { cameraDeviceId: preferredDeviceId } });
    }
    setInputValue(fields.cameraSource, normalizedCameraSource(settings));
    setInputValue(select, settings.profile.cameraDeviceId);
  } catch {
    cameraDevices = [];
    select.innerHTML = `<option value="">未发现摄像头</option>`;
  }
}

async function updateCameraSource() {
  settings = await window.overlayApp.updateSettings({
    profile: {
      cameraSource: fields.cameraSource.value
    }
  });
  await refreshCameraDevices();
  syncForm(settings);
}

async function updateCameraDevice() {
  const deviceId = fields.cameraDeviceId.value;
  const device = cameraDevices.find((item) => item.deviceId === deviceId);
  settings = await window.overlayApp.updateSettings({
    profile: {
      cameraDeviceId: deviceId,
      cameraSource: deviceId ? sourceForManualDevice(device) : normalizedCameraSource(settings)
    }
  });
  syncForm(settings);
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add("active");
    });
  });
}

function setupBindings() {
  bindInput(fields.name, ["profile", "name"]);
  bindInput(fields.headline, ["profile", "headline"]);
  bindInput(fields.handle, ["profile", "handle"]);
  bindInput(fields.bio, ["profile", "bio"]);
  bindInput(fields.cta, ["profile", "cta"]);
  bindInput(fields.useCamera, ["profile", "useCamera"]);
  bindInput(fields.mirrorCamera, ["profile", "mirrorCamera"]);
  fields.cameraSource.addEventListener("change", updateCameraSource);
  fields.cameraDeviceId.addEventListener("change", updateCameraDevice);
  bindInput(fields.size, ["overlay", "size"]);
  bindInput(fields.style, ["overlay", "style"]);
  bindInput(fields.accentColor, ["overlay", "accentColor"]);
  bindInput(fields.textColor, ["overlay", "textColor"]);
  bindInput(fields.overlayVisible, ["overlay", "visible"]);
  bindInput(fields.overlayProtectedFromCapture, ["overlay", "protectedFromCapture"]);
  bindInput(fields.showCta, ["overlay", "showCta"]);
  bindInput(fields.alwaysOnTop, ["overlay", "alwaysOnTop"]);
  bindInput(fields.locked, ["overlay", "locked"]);
  bindInput(fields.script, ["prompter", "script"]);
  bindInput(fields.speed, ["prompter", "speed"]);
  bindInput(fields.fontSize, ["prompter", "fontSize"]);
  bindInput(fields.opacity, ["prompter", "opacity"]);
  bindInput(fields.prompterVisible, ["prompter", "visible"]);
  bindInput(fields.protectedFromCapture, ["prompter", "protectedFromCapture"]);
  bindInput(fields.clickThrough, ["prompter", "clickThrough"]);
  fields.recordingMode.addEventListener("change", updateRecordingMode);
  fields.recordingSourceId.addEventListener("change", updateRecordingSource);
  fields.recordingFrameRate.addEventListener("change", updateRecordingFrameRate);
  fields.includeMic.addEventListener("change", updateIncludeMic);
  fields.magnifierEnabled.addEventListener("change", updateRecordingEffects);
  fields.magnifierZoom.addEventListener("change", updateRecordingEffects);
  fields.magnifierSize.addEventListener("change", updateRecordingEffects);

  $("toggleOverlay").addEventListener("click", async () => syncForm(await window.overlayApp.toggleOverlay()));
  $("togglePrompter").addEventListener("click", async () => syncForm(await window.overlayApp.togglePrompter()));
  $("resetPositions").addEventListener("click", async () => syncForm(await window.overlayApp.resetPositions()));
  $("checkUpdate").addEventListener("click", () => refreshUpdateStatus(true));
  $("runUpdate").addEventListener("click", runAppUpdate);
  $("restartApp").addEventListener("click", () => window.overlayApp.restartApp());
  $("quitApp").addEventListener("click", () => window.overlayApp.quitApp());
  $("restartAfterPermission").addEventListener("click", () => window.overlayApp.restartApp());
  $("refreshPermissions").addEventListener("click", refreshPermissionState);
  $("quickRecord").addEventListener("click", quickRecordScreen);
  $("quickRecordInPanel").addEventListener("click", quickRecordScreen);
  $("quickSelectWindow").addEventListener("click", quickSelectWindow);
  $("quickSelectWindowInPanel").addEventListener("click", quickSelectWindow);
  $("systemPickerRecord").addEventListener("click", startSystemPickerRecording);
  $("refreshRecordingSources").addEventListener("click", refreshRecordingSources);
  $("openScreenPrivacy").addEventListener("click", () => window.overlayApp.openScreenPrivacy());
  $("selectRecordingRegion").addEventListener("click", selectRecordingRegion);
  $("startRecording").addEventListener("click", startRecording);
  $("stopRecording").addEventListener("click", stopRecording);
  $("openRecordingFile").addEventListener("click", () => window.overlayApp.showRecordingFile(lastRecordingPath));
  $("playPrompter").addEventListener("click", async () => {
    syncForm(await window.overlayApp.updateSettings({ prompter: { running: true } }));
  });
  $("pausePrompter").addEventListener("click", async () => {
    syncForm(await window.overlayApp.updateSettings({ prompter: { running: false } }));
  });
  $("resetPrompter").addEventListener("click", () => window.overlayApp.prompterCommand("reset"));
  $("avatarInput").addEventListener("change", handleAvatarChange);
}

function handleAvatarChange(event) {
  const [file] = event.target.files;
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    settings = await window.overlayApp.updateSettings({
      profile: {
        avatarDataUrl: reader.result,
        useCamera: false
      }
    });
    syncForm(settings);
  });
  reader.readAsDataURL(file);
}

async function init() {
  setupTabs();
  setupBindings();
  syncForm(await window.overlayApp.getSettings());
  window.overlayApp.onSettingsChanged(syncForm);
  scheduleInitialUpdateCheck();
  await refreshPermissionState();
  await refreshCameraDevices();
  await refreshRecordingSources();
}

init();
