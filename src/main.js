const { app, BrowserWindow, ipcMain, globalShortcut, session, screen, systemPreferences, shell, desktopCapturer } = require("electron");
const fs = require("fs");
const path = require("path");
const { defaultSettings } = require("./defaultSettings");

let settings = structuredClone(defaultSettings);
let controlWindow;
let overlayWindow;
let prompterWindow;
let regionWindow;
let pendingRegionSelection;
let saveTimer;

const overlaySizes = {
  small: { width: 300, height: 210 },
  medium: { width: 360, height: 250 },
  large: { width: 430, height: 300 }
};

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(target, source) {
  const output = { ...target };
  for (const [key, value] of Object.entries(source || {})) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf8");
    settings = deepMerge(defaultSettings, JSON.parse(raw));
  } catch {
    settings = structuredClone(defaultSettings);
  }
}

function saveSettingsSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  }, 150);
}

function broadcastSettings() {
  for (const win of [controlWindow, overlayWindow, prompterWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("settings:changed", settings);
    }
  }
}

function updateSettings(partial, options = {}) {
  settings = deepMerge(settings, partial);
  saveSettingsSoon();
  if (!options.silent) {
    applyWindowSettings();
    broadcastSettings();
  }
  return settings;
}

function windowOptions(extra = {}) {
  return {
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    ...extra
  };
}

function getDisplayCenteredBounds(width, height, offsetX = 0, offsetY = 0) {
  const display = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(display.x + (display.width - width) / 2 + offsetX),
    y: Math.round(display.y + (display.height - height) / 2 + offsetY),
    width,
    height
  };
}

function createControlWindow() {
  const { width, height } = settings.windows.control;
  controlWindow = new BrowserWindow(
    windowOptions({
      width,
      height,
      minWidth: 880,
      minHeight: 660,
      title: "ClawCast Studio",
      trafficLightPosition: { x: 16, y: 18 },
      titleBarStyle: "hiddenInset",
      vibrancy: "sidebar",
      visualEffectState: "active"
    })
  );

  // The control panel is part of the user's working screen and should be visible
  // in screenshots/recordings. Only the teleprompter uses capture protection.
  controlWindow.setContentProtection(false);
  controlWindow.loadFile(path.join(__dirname, "windows/control.html"));
  controlWindow.once("ready-to-show", () => controlWindow.show());
  controlWindow.on("resize", () => {
    const [width, height] = controlWindow.getSize();
    updateSettings({ windows: { control: { width, height } } }, { silent: true });
  });
}

function createOverlayWindow() {
  const size = overlaySizes[settings.overlay.size] || overlaySizes.medium;
  const saved = settings.windows.overlay;
  const bounds =
    Number.isFinite(saved.x) && Number.isFinite(saved.y)
      ? { x: saved.x, y: saved.y, ...size }
      : getDisplayCenteredBounds(size.width, size.height, 310, 140);

  overlayWindow = new BrowserWindow(
    windowOptions({
      ...bounds,
      frame: false,
      transparent: true,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      focusable: true,
      title: "ClawCast Profile Card"
    })
  );

  overlayWindow.loadFile(path.join(__dirname, "windows/overlay.html"));
  overlayWindow.once("ready-to-show", () => {
    if (settings.overlay.visible) overlayWindow.showInactive();
    applyOverlaySettings();
  });
  overlayWindow.on("move", () => {
    const [x, y] = overlayWindow.getPosition();
    updateSettings({ windows: { overlay: { x, y } } }, { silent: true });
  });
}

function createPrompterWindow() {
  const saved = settings.windows.prompter;
  const bounds =
    Number.isFinite(saved.x) && Number.isFinite(saved.y)
      ? saved
      : getDisplayCenteredBounds(saved.width, saved.height, 0, -250);

  prompterWindow = new BrowserWindow(
    windowOptions({
      ...bounds,
      minWidth: 520,
      minHeight: 170,
      frame: false,
      transparent: true,
      resizable: true,
      hasShadow: false,
      skipTaskbar: true,
      focusable: true,
      title: "ClawCast Protected Prompter"
    })
  );

  // macOS maps this to NSWindowSharingNone so screen capture tools should omit it.
  prompterWindow.setContentProtection(settings.prompter.protectedFromCapture);
  prompterWindow.loadFile(path.join(__dirname, "windows/prompter.html"));
  prompterWindow.once("ready-to-show", () => {
    if (settings.prompter.visible) prompterWindow.showInactive();
    applyPrompterSettings();
  });
  prompterWindow.on("move", persistPrompterBounds);
  prompterWindow.on("resize", persistPrompterBounds);
}

function createRegionWindow(display) {
  const bounds = display.bounds;
  regionWindow = new BrowserWindow(
    windowOptions({
      ...bounds,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      skipTaskbar: true,
      focusable: true,
      title: "ClawCast Region Selector"
    })
  );
  regionWindow.setAlwaysOnTop(true, "screen-saver");
  regionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  regionWindow.loadFile(path.join(__dirname, "windows/region.html"));
  regionWindow.once("ready-to-show", () => {
    regionWindow.webContents.send("region:init", {
      displayId: String(display.id),
      displayX: bounds.x,
      displayY: bounds.y,
      displayWidth: bounds.width,
      displayHeight: bounds.height,
      scaleFactor: display.scaleFactor || 1
    });
    regionWindow.show();
  });
  regionWindow.on("closed", () => {
    regionWindow = null;
    if (pendingRegionSelection) {
      pendingRegionSelection.resolve(null);
      pendingRegionSelection = null;
    }
  });
}

function persistPrompterBounds() {
  if (!prompterWindow || prompterWindow.isDestroyed()) return;
  const [x, y] = prompterWindow.getPosition();
  const [width, height] = prompterWindow.getSize();
  updateSettings({ windows: { prompter: { x, y, width, height } } }, { silent: true });
}

function applyOverlaySettings() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const size = overlaySizes[settings.overlay.size] || overlaySizes.medium;
  overlayWindow.setSize(size.width, size.height);
  overlayWindow.setAlwaysOnTop(settings.overlay.alwaysOnTop, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(Boolean(settings.overlay.locked), { forward: true });
  if (settings.overlay.visible) overlayWindow.showInactive();
  else overlayWindow.hide();
}

function applyPrompterSettings() {
  if (!prompterWindow || prompterWindow.isDestroyed()) return;
  prompterWindow.setAlwaysOnTop(true, "screen-saver");
  prompterWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  prompterWindow.setContentProtection(Boolean(settings.prompter.protectedFromCapture));
  prompterWindow.setIgnoreMouseEvents(Boolean(settings.prompter.clickThrough), { forward: true });
  if (settings.prompter.visible) prompterWindow.showInactive();
  else prompterWindow.hide();
}

function applyWindowSettings() {
  applyOverlaySettings();
  applyPrompterSettings();
}

function registerIpc() {
  ipcMain.handle("settings:get", () => settings);
  ipcMain.handle("settings:update", (_event, partial) => updateSettings(partial));
  ipcMain.handle("settings:reset", () => {
    settings = structuredClone(defaultSettings);
    saveSettingsSoon();
    applyWindowSettings();
    broadcastSettings();
    return settings;
  });
  ipcMain.handle("window:toggle-overlay", () => {
    return updateSettings({ overlay: { visible: !settings.overlay.visible } });
  });
  ipcMain.handle("window:toggle-prompter", () => {
    return updateSettings({ prompter: { visible: !settings.prompter.visible } });
  });
  ipcMain.handle("window:reset-positions", () => {
    const overlaySize = overlaySizes[settings.overlay.size] || overlaySizes.medium;
    const overlayBounds = getDisplayCenteredBounds(overlaySize.width, overlaySize.height, 310, 140);
    const prompterBounds = getDisplayCenteredBounds(settings.windows.prompter.width, settings.windows.prompter.height, 0, -250);
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.setBounds(overlayBounds);
    if (prompterWindow && !prompterWindow.isDestroyed()) prompterWindow.setBounds(prompterBounds);
    return updateSettings({
      windows: {
        overlay: { x: overlayBounds.x, y: overlayBounds.y },
        prompter: {
          x: prompterBounds.x,
          y: prompterBounds.y,
          width: prompterBounds.width,
          height: prompterBounds.height
        }
      }
    });
  });
  ipcMain.handle("prompter:command", (_event, command) => {
    if (prompterWindow && !prompterWindow.isDestroyed()) {
      prompterWindow.webContents.send("prompter:command", command);
    }
    return true;
  });
  ipcMain.handle("camera:get-access-status", () => {
    if (process.platform !== "darwin") return "unknown";
    return systemPreferences.getMediaAccessStatus("camera");
  });
  ipcMain.handle("camera:request-access", async () => {
    if (process.platform !== "darwin") return "unknown";
    const status = systemPreferences.getMediaAccessStatus("camera");
    if (status === "granted" || status === "denied" || status === "restricted") return status;
    const granted = await systemPreferences.askForMediaAccess("camera");
    return granted ? "granted" : systemPreferences.getMediaAccessStatus("camera");
  });
  ipcMain.handle("camera:open-privacy", async () => {
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera");
    return true;
  });
  ipcMain.handle("recording:get-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 360, height: 220 },
      fetchWindowIcons: true
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      type: source.id.startsWith("screen:") ? "screen" : "window",
      displayId: source.display_id || "",
      thumbnail: source.thumbnail?.toDataURL() || ""
    }));
  });
  ipcMain.handle("recording:get-screen-access-status", () => {
    if (process.platform !== "darwin") return "unknown";
    return systemPreferences.getMediaAccessStatus("screen");
  });
  ipcMain.handle("recording:open-screen-privacy", async () => {
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
    return true;
  });
  ipcMain.handle("recording:select-region", async (_event, displayId) => {
    if (pendingRegionSelection) return null;
    const displays = screen.getAllDisplays();
    const display = displays.find((item) => String(item.id) === String(displayId)) || screen.getPrimaryDisplay();
    return new Promise((resolve) => {
      pendingRegionSelection = { resolve };
      createRegionWindow(display);
    });
  });
  ipcMain.handle("region:finish", (_event, region) => {
    if (!pendingRegionSelection) return false;
    pendingRegionSelection.resolve(region);
    pendingRegionSelection = null;
    if (regionWindow && !regionWindow.isDestroyed()) regionWindow.close();
    return true;
  });
  ipcMain.handle("region:cancel", () => {
    if (pendingRegionSelection) {
      pendingRegionSelection.resolve(null);
      pendingRegionSelection = null;
    }
    if (regionWindow && !regionWindow.isDestroyed()) regionWindow.close();
    return true;
  });
  ipcMain.handle("recording:save", async (_event, payload) => {
    const dir = path.join(app.getPath("movies"), "ClawCast Studio");
    fs.mkdirSync(dir, { recursive: true });
    const safeName = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(dir, `ClawCast-${safeName}.webm`);
    fs.writeFileSync(filePath, Buffer.from(payload.buffer));
    return { path: filePath };
  });
  ipcMain.handle("recording:show-file", async (_event, filePath) => {
    if (filePath) shell.showItemInFolder(filePath);
    return true;
  });
}

function registerShortcuts() {
  globalShortcut.register("CommandOrControl+Shift+O", () => {
    updateSettings({ overlay: { visible: !settings.overlay.visible } });
  });
  globalShortcut.register("CommandOrControl+Shift+P", () => {
    updateSettings({ prompter: { visible: !settings.prompter.visible } });
  });
  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    updateSettings({ prompter: { running: !settings.prompter.running } });
  });
}

app.whenReady().then(() => {
  loadSettings();
  registerIpc();
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(["media", "camera", "microphone", "display-capture"].includes(permission));
  });
  createControlWindow();
  createOverlayWindow();
  createPrompterWindow();
  registerShortcuts();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow();
      createOverlayWindow();
      createPrompterWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
