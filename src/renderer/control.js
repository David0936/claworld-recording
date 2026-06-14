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
let recordingStartedAt = 0;
let recordingTimer;
let lastRecordingPath = "";

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
  includeMic: $("includeMic")
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
  renderPreview();
  renderRecordingControls();
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
  $("overlayStatus").textContent = settings.overlay.visible ? "录屏名片 · 已显示" : "录屏名片 · 已隐藏";
  $("prompterStatus").textContent = settings.prompter.visible ? "防录屏提词器 · 已显示" : "防录屏提词器 · 已隐藏";
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

function recordingModeLabel(mode) {
  if (mode === "window") return "窗口";
  if (mode === "region") return "区域";
  return "屏幕";
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
  renderRecordingControls();
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
  $("startRecording").disabled = isRecording || !hasSource;
  $("stopRecording").disabled = !isRecording;
  $("openRecordingFile").disabled = !lastRecordingPath;
  $("selectRecordingRegion").disabled = isRecording || mode !== "region" || !hasSource;
  $("refreshRecordingSources").disabled = isRecording;
  fields.recordingMode.disabled = isRecording;
  fields.recordingFrameRate.disabled = isRecording;
  fields.recordingSourceId.disabled = isRecording;
  fields.includeMic.disabled = isRecording;
}

async function refreshRecordingSources() {
  fields.recordingSourceId.innerHTML = `<option value="">正在读取屏幕和窗口...</option>`;
  try {
    recordingSources = await window.overlayApp.getRecordingSources();
    renderRecordingSources();
  } catch (error) {
    console.error("Failed to load recording sources", error);
    fields.recordingSourceId.innerHTML = `<option value="">读取失败，请检查录屏权限</option>`;
    setRecordingStatus("读取录屏来源失败", "去系统设置开启屏幕录制权限后重试。", "error");
  }
}

async function updateRecordingSettings(partial) {
  settings = await window.overlayApp.updateSettings({ recording: partial });
  renderRecordingControls();
  renderRegionSummary();
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
}

async function updateRecordingFrameRate() {
  await updateRecordingSettings({ frameRate: Number(fields.recordingFrameRate.value) });
}

async function updateIncludeMic() {
  await updateRecordingSettings({ includeMic: fields.includeMic.checked });
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

async function createRegionStream(displayStream, region, frameRate) {
  const video = document.createElement("video");
  video.srcObject = displayStream;
  video.muted = true;
  video.playsInline = true;
  await new Promise((resolve) => {
    video.onloadedmetadata = resolve;
  });
  await video.play();

  const scaleX = video.videoWidth / region.displayWidth;
  const scaleY = video.videoHeight / region.displayHeight;
  const sourceX = Math.max(0, Math.round(region.x * scaleX));
  const sourceY = Math.max(0, Math.round(region.y * scaleY));
  const sourceWidth = Math.max(2, Math.round(region.width * scaleX));
  const sourceHeight = Math.max(2, Math.round(region.height * scaleY));

  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d");

  function draw() {
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    activeDrawFrame = requestAnimationFrame(draw);
  }

  activeRegionVideo = video;
  draw();
  activeCanvasStream = canvas.captureStream(frameRate);
  return activeCanvasStream;
}

async function createRecordingStream(sourceId, mode, region, includeMic, frameRate) {
  activeDisplayStream = await getDesktopStream(sourceId, frameRate);
  const videoStream = mode === "region" ? await createRegionStream(activeDisplayStream, region, frameRate) : activeDisplayStream;
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

function cleanupRecordingStreams() {
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
    const buffer = await blob.arrayBuffer();
    const saved = await window.overlayApp.saveRecording({ buffer, mimeType: blob.type });
    lastRecordingPath = saved.path;
    setRecordingStatus("录屏已保存", saved.path, "done");
  } catch (error) {
    console.error("Recording save failed", error);
    setRecordingStatus("保存失败", "录屏数据没有成功写入文件。", "error");
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
    return ["录屏权限被拒绝", "去系统设置开启屏幕录制权限，或允许麦克风权限。"];
  }
  if (name === "NotReadableError") {
    return ["无法读取录制来源", "目标窗口可能关闭了，刷新后重选。"];
  }
  return ["开始录屏失败", "刷新来源或重新选择窗口后再试。"];
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
    const stream = await createRecordingStream(source.id, mode, region, includeMic, frameRate);
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
  } catch (error) {
    console.error("Recording start failed", error);
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

  $("toggleOverlay").addEventListener("click", async () => syncForm(await window.overlayApp.toggleOverlay()));
  $("togglePrompter").addEventListener("click", async () => syncForm(await window.overlayApp.togglePrompter()));
  $("resetPositions").addEventListener("click", async () => syncForm(await window.overlayApp.resetPositions()));
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
  await refreshCameraDevices();
  await refreshRecordingSources();
}

init();
