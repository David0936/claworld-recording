const prompter = document.getElementById("prompter");
const viewport = document.getElementById("viewport");
const script = document.getElementById("script");
const state = document.getElementById("state");

let settings;
let y = 0;
let lastFrame = performance.now();
let animationId;

function render(next) {
  const scriptChanged = !settings || settings.prompter.script !== next.prompter.script;
  settings = next;
  if (scriptChanged) y = 0;

  prompter.style.background = `rgba(18, 22, 21, ${settings.prompter.opacity})`;
  script.style.fontSize = `${settings.prompter.fontSize}px`;
  script.textContent = settings.prompter.script;
  state.textContent = settings.prompter.running ? "滚动" : "暂停";
  applyTransform();
}

function applyTransform() {
  script.style.transform = `translateY(${-Math.round(y)}px)`;
}

function tick(now) {
  const delta = Math.min(80, now - lastFrame) / 1000;
  lastFrame = now;
  if (settings?.prompter.running) {
    const maxY = Math.max(0, script.scrollHeight - viewport.clientHeight + 60);
    y += settings.prompter.speed * delta;
    if (y > maxY) y = maxY;
    applyTransform();
  }
  animationId = requestAnimationFrame(tick);
}

function handleCommand(command) {
  if (command === "reset") {
    y = 0;
    applyTransform();
  }
}

async function init() {
  render(await window.overlayApp.getSettings());
  window.overlayApp.onSettingsChanged(render);
  window.overlayApp.onPrompterCommand(handleCommand);
  animationId = requestAnimationFrame(tick);
}

window.addEventListener("beforeunload", () => cancelAnimationFrame(animationId));
init();
