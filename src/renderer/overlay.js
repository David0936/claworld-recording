const nodes = {
  card: document.getElementById("card"),
  handle: document.getElementById("handle"),
  name: document.getElementById("name"),
  headline: document.getElementById("headline"),
  bio: document.getElementById("bio"),
  cta: document.getElementById("cta"),
  avatar: document.querySelector(".avatar"),
  camera: document.getElementById("camera"),
  cameraStatus: document.getElementById("cameraStatus"),
  cameraStatusTitle: document.getElementById("cameraStatusTitle"),
  cameraStatusDetail: document.getElementById("cameraStatusDetail"),
  avatarImage: document.getElementById("avatarImage"),
  initial: document.getElementById("initial")
};

let cameraStream;
let cameraKey = "";
let cameraRequestId = 0;
let latestSettings;
let lastCameraFailure = "";

function isContinuityCamera(label = "") {
  return /iphone|continuity|desk view|接续|连续互通|手机/i.test(label);
}

function isBuiltInCamera(label = "") {
  return /facetime|built-?in|macbook|display camera|studio display|hd camera|内建|内置/i.test(label);
}

async function chooseCameraDeviceId(preferredDeviceId) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");
  if (!cameras.length) return "";

  const preferred = cameras.find((device) => device.deviceId === preferredDeviceId);
  if (preferred && !isContinuityCamera(preferred.label)) {
    return preferredDeviceId;
  }

  const builtIn = cameras.find((device) => isBuiltInCamera(device.label) && !isContinuityCamera(device.label));
  if (builtIn) return builtIn.deviceId;

  const nonContinuity = cameras.find((device) => !isContinuityCamera(device.label));
  return (nonContinuity || cameras[0]).deviceId;
}

function cameraFailureCopy(error) {
  const name = error?.name || String(error || "");
  if (name === "NotAllowedError" || name === "SecurityError") {
    return ["权限被拒绝", "点此打开设置"];
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return ["未发现摄像头", "检查设备连接"];
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return ["摄像头被占用", "关掉其它视频软件"];
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return ["设备不可用", "换默认摄像头"];
  }
  return ["CAM OFF", "点此重试"];
}

function setCameraStatus(title, detail, failure = "") {
  lastCameraFailure = failure;
  nodes.cameraStatusTitle.textContent = title;
  nodes.cameraStatusDetail.textContent = detail;
  nodes.avatar.classList.add("needs-attention");
  nodes.avatar.classList.remove("show-camera");
}

function clearCameraStatus() {
  lastCameraFailure = "";
  nodes.avatar.classList.remove("needs-attention");
}

async function startCamera(settings) {
  const nextCameraKey = `${settings.profile.useCamera}:${settings.profile.cameraDeviceId || "default"}`;
  if (!settings.profile.useCamera) {
    cameraRequestId += 1;
    cameraKey = nextCameraKey;
    stopCamera();
    renderAvatar(settings);
    return;
  }

  if (cameraStream && cameraKey === nextCameraKey) {
    renderAvatar(settings);
    clearCameraStatus();
    nodes.camera.parentElement.classList.add("show-camera");
    nodes.camera.parentElement.classList.remove("show-image");
    return;
  }

  cameraKey = nextCameraKey;
  stopCamera();
  const requestId = ++cameraRequestId;
  clearCameraStatus();
  setCameraStatus("连接中", "请稍等");

  try {
    const access = await window.overlayApp.requestCameraAccess();
    if (requestId !== cameraRequestId) return;
    if (access === "denied" || access === "restricted") {
      setCameraStatus("权限被拒绝", "点此打开设置", "permission");
      return;
    }
    const deviceId = await chooseCameraDeviceId(settings.profile.cameraDeviceId);
    if (requestId !== cameraRequestId) return;
    const constraints = {
      audio: false,
      video: {
        width: { ideal: 720 },
        height: { ideal: 720 },
        deviceId: deviceId ? { exact: deviceId } : undefined
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (requestId !== cameraRequestId) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    cameraStream = stream;
    nodes.camera.srcObject = stream;
    await nodes.camera.play();
    if (requestId !== cameraRequestId) return;
    clearCameraStatus();
    nodes.camera.parentElement.classList.add("show-camera");
    nodes.camera.parentElement.classList.remove("show-image");
  } catch (error) {
    if (requestId === cameraRequestId) {
      console.error("Camera start failed", error);
      const [title, detail] = cameraFailureCopy(error);
      setCameraStatus(title, detail, title === "权限被拒绝" ? "permission" : "retry");
      renderAvatar(settings);
    }
  }
}

function stopCamera() {
  if (!cameraStream) return;
  for (const track of cameraStream.getTracks()) track.stop();
  cameraStream = null;
  nodes.camera.srcObject = null;
  nodes.camera.parentElement.classList.remove("show-camera");
}

function renderAvatar(settings) {
  const avatar = nodes.avatar;
  avatar.classList.toggle("mirror", settings.profile.mirrorCamera);
  nodes.initial.textContent = (settings.profile.name || "D").trim().slice(0, 1).toUpperCase();
  if (settings.profile.avatarDataUrl) {
    nodes.avatarImage.src = settings.profile.avatarDataUrl;
    avatar.classList.add("show-image");
  } else {
    nodes.avatarImage.removeAttribute("src");
    avatar.classList.remove("show-image");
  }
}

function render(settings) {
  latestSettings = settings;
  nodes.card.className = `card ${settings.overlay.style} ${settings.overlay.size}`;
  nodes.card.classList.toggle("no-cta", !settings.overlay.showCta);
  nodes.card.style.setProperty("--accent", settings.overlay.accentColor);
  nodes.card.style.setProperty("--text", settings.overlay.textColor);
  nodes.handle.textContent = settings.profile.handle;
  nodes.name.textContent = settings.profile.name;
  nodes.headline.textContent = settings.profile.headline;
  nodes.bio.textContent = settings.profile.bio;
  nodes.cta.textContent = settings.profile.cta;
  renderAvatar(settings);
  startCamera(settings);
}

async function init() {
  const settings = await window.overlayApp.getSettings();
  render(settings);
  window.overlayApp.onSettingsChanged(render);
  nodes.cameraStatus.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (lastCameraFailure === "permission") {
      await window.overlayApp.openCameraPrivacy();
      return;
    }
    if (latestSettings) startCamera(latestSettings);
  });
}

window.addEventListener("beforeunload", stopCamera);
init();
