const nodes = {
  card: document.getElementById("card"),
  handle: document.getElementById("handle"),
  name: document.getElementById("name"),
  headline: document.getElementById("headline"),
  bio: document.getElementById("bio"),
  cta: document.getElementById("cta"),
  camera: document.getElementById("camera"),
  avatarImage: document.getElementById("avatarImage"),
  initial: document.getElementById("initial")
};

let cameraStream;
let cameraKey = "";
let cameraRequestId = 0;

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
    nodes.camera.parentElement.classList.add("show-camera");
    nodes.camera.parentElement.classList.remove("show-image");
    return;
  }

  cameraKey = nextCameraKey;
  stopCamera();
  const requestId = ++cameraRequestId;

  try {
    const constraints = {
      audio: false,
      video: {
        width: { ideal: 720 },
        height: { ideal: 720 },
        deviceId: settings.profile.cameraDeviceId ? { exact: settings.profile.cameraDeviceId } : undefined
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (requestId !== cameraRequestId) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    cameraStream = stream;
    nodes.camera.srcObject = stream;
    nodes.camera.parentElement.classList.add("show-camera");
    nodes.camera.parentElement.classList.remove("show-image");
  } catch {
    if (requestId === cameraRequestId) renderAvatar(settings);
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
  const avatar = nodes.camera.parentElement;
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
}

window.addEventListener("beforeunload", stopCamera);
init();
