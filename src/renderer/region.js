const selection = document.getElementById("selection");
const actions = document.getElementById("actions");
const confirmButton = document.getElementById("confirm");
const resetButton = document.getElementById("reset");
const cancelButton = document.getElementById("cancel");

let displayInfo = {
  displayId: "",
  displayX: 0,
  displayY: 0,
  displayWidth: window.innerWidth,
  displayHeight: window.innerHeight,
  scaleFactor: 1
};
let startPoint = null;
let currentRegion = null;

function normalizeRegion(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(start.x - end.x);
  const height = Math.abs(start.y - end.y);
  return { x, y, width, height };
}

function drawRegion(region) {
  selection.style.display = "block";
  selection.style.left = `${region.x}px`;
  selection.style.top = `${region.y}px`;
  selection.style.width = `${region.width}px`;
  selection.style.height = `${region.height}px`;
}

function clearRegion() {
  currentRegion = null;
  startPoint = null;
  selection.style.display = "none";
  actions.classList.remove("show");
}

window.overlayApp.onRegionInit((payload) => {
  displayInfo = payload;
});

window.addEventListener("mousedown", (event) => {
  if (event.target.closest("button")) return;
  actions.classList.remove("show");
  startPoint = { x: event.clientX, y: event.clientY };
  currentRegion = normalizeRegion(startPoint, startPoint);
  drawRegion(currentRegion);
});

window.addEventListener("mousemove", (event) => {
  if (!startPoint) return;
  currentRegion = normalizeRegion(startPoint, { x: event.clientX, y: event.clientY });
  drawRegion(currentRegion);
});

window.addEventListener("mouseup", () => {
  if (!startPoint || !currentRegion) return;
  startPoint = null;
  if (currentRegion.width < 80 || currentRegion.height < 80) {
    clearRegion();
    return;
  }
  actions.classList.add("show");
});

confirmButton.addEventListener("click", async () => {
  if (!currentRegion) return;
  await window.overlayApp.finishRegionSelection({
    ...currentRegion,
    displayId: displayInfo.displayId,
    displayX: displayInfo.displayX,
    displayY: displayInfo.displayY,
    displayWidth: displayInfo.displayWidth,
    displayHeight: displayInfo.displayHeight,
    scaleFactor: displayInfo.scaleFactor
  });
});

resetButton.addEventListener("click", clearRegion);
cancelButton.addEventListener("click", () => window.overlayApp.cancelRegionSelection());

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    window.overlayApp.cancelRegionSelection();
  }
});
