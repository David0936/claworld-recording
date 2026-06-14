const $ = (id) => document.getElementById(id);

let settings;
let updateTimer;

const fields = {
  name: $("name"),
  headline: $("headline"),
  handle: $("handle"),
  bio: $("bio"),
  cta: $("cta"),
  useCamera: $("useCamera"),
  mirrorCamera: $("mirrorCamera"),
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

async function refreshCameraDevices() {
  const select = fields.cameraDeviceId;
  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    select.innerHTML = `<option value="">默认摄像头</option>`;
    for (const device of cameras) {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `摄像头 ${select.length}`;
      select.append(option);
    }
    setInputValue(select, settings.profile.cameraDeviceId);
  } catch {
    select.innerHTML = `<option value="">未授权或未发现摄像头</option>`;
  }
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
  bindInput(fields.cameraDeviceId, ["profile", "cameraDeviceId"]);
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
