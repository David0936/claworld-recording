const $ = (id) => document.getElementById(id);

let settings;
let updateTimer;
let cameraDevices = [];

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
  clickThrough: $("clickThrough")
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
  renderPreview();
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
  $("overlayStatus").textContent = settings.overlay.visible ? "悬浮名片 · 已显示" : "悬浮名片 · 已隐藏";
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

  $("toggleOverlay").addEventListener("click", async () => syncForm(await window.overlayApp.toggleOverlay()));
  $("togglePrompter").addEventListener("click", async () => syncForm(await window.overlayApp.togglePrompter()));
  $("resetPositions").addEventListener("click", async () => syncForm(await window.overlayApp.resetPositions()));
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
}

init();
