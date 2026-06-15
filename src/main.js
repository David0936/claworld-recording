const { app, BrowserWindow, ipcMain, globalShortcut, session, screen, systemPreferences, shell, desktopCapturer, Menu, Tray, nativeImage } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { defaultSettings } = require("./defaultSettings");

let settings = structuredClone(defaultSettings);
let controlWindow;
let overlayWindow;
let prompterWindow;
let regionWindow;
let tray;
let pendingRegionSelection;
let saveTimer;

const overlaySizes = {
  small: { width: 300, height: 210 },
  medium: { width: 360, height: 250 },
  large: { width: 430, height: 300 }
};
const updateRemote = "origin";
const updateBranch = "main";

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function findGitRoot() {
  const starts = [app.getAppPath(), __dirname, process.cwd()].filter(Boolean);
  for (const start of starts) {
    let dir = fs.existsSync(start) && fs.statSync(start).isFile() ? path.dirname(start) : start;
    while (dir && dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, ".git"))) return dir;
      dir = path.dirname(dir);
    }
  }
  return null;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        timeout: options.timeout || 120000,
        maxBuffer: 1024 * 1024 * 8
      },
      (error, stdout, stderr) => {
        const output = {
          stdout: stdout.trim(),
          stderr: stderr.trim()
        };
        if (error) {
          error.output = output;
          reject(error);
          return;
        }
        resolve(output);
      }
    );
  });
}

function runGit(args, cwd) {
  return runProcess("git", args, { cwd });
}

function updateResult(base, state, title, detail, extra = {}) {
  return {
    state,
    title,
    detail,
    canUpdate: false,
    restartRequired: false,
    ...base,
    ...extra
  };
}

async function getUpdateStatus(options = {}) {
  const gitRoot = findGitRoot();
  const base = { gitRoot, remote: updateRemote, branch: updateBranch };
  if (!gitRoot) {
    return updateResult(
      base,
      "unavailable",
      "一键更新不可用",
      "当前不是从 Git 仓库运行；打包版需要接 GitHub Release 更新。"
    );
  }

  try {
    const [branch, current, remoteUrl, dirtyStatus] = await Promise.all([
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], gitRoot),
      runGit(["rev-parse", "--short", "HEAD"], gitRoot),
      runGit(["config", "--get", `remote.${updateRemote}.url`], gitRoot).catch(() => ({ stdout: "" })),
      runGit(["status", "--porcelain"], gitRoot)
    ]);
    const nextBase = {
      ...base,
      current: current.stdout,
      currentBranch: branch.stdout,
      dirty: Boolean(dirtyStatus.stdout),
      remoteUrl: remoteUrl.stdout
    };

    if (options.fetchRemote) {
      await runGit(["fetch", updateRemote, updateBranch], gitRoot);
    }

    const remoteRef = `${updateRemote}/${updateBranch}`;
    const [latest, counts] = await Promise.all([
      runGit(["rev-parse", "--short", remoteRef], gitRoot),
      runGit(["rev-list", "--left-right", "--count", `HEAD...${remoteRef}`], gitRoot)
    ]);
    const [aheadText, behindText] = counts.stdout.split(/\s+/);
    const ahead = Number(aheadText || 0);
    const behind = Number(behindText || 0);
    const statusBase = { ...nextBase, latest: latest.stdout, ahead, behind };

    if (nextBase.dirty) {
      return updateResult(
        statusBase,
        "blocked",
        "本地有未提交改动",
        "为了不覆盖你的工作，先提交或清理本地改动后再更新。"
      );
    }
    if (ahead > 0 && behind > 0) {
      return updateResult(
        statusBase,
        "blocked",
        "本地和远端已分叉",
        "需要手动处理 Git 合并后再一键更新。"
      );
    }
    if (behind > 0) {
      return updateResult(
        statusBase,
        "available",
        "发现 GitHub 新版本",
        `远端领先 ${behind} 个提交，点击一键更新同步。`,
        { canUpdate: true }
      );
    }
    if (ahead > 0) {
      return updateResult(
        statusBase,
        "ahead",
        "本地领先远端",
        `本地领先 ${ahead} 个提交，先推送后其它设备才能同步。`
      );
    }
    return updateResult(statusBase, "current", "已经是最新版本", `当前提交 ${current.stdout}。`);
  } catch (error) {
    return updateResult(
      base,
      "error",
      "检查更新失败",
      error.output?.stderr || error.output?.stdout || error.message
    );
  }
}

async function runSourceUpdate() {
  const beforeStatus = await getUpdateStatus({ fetchRemote: true });
  if (!beforeStatus.canUpdate || beforeStatus.dirty || !beforeStatus.gitRoot) {
    return beforeStatus;
  }

  try {
    const before = await runGit(["rev-parse", "HEAD"], beforeStatus.gitRoot);
    await runGit(["pull", "--ff-only", updateRemote, updateBranch], beforeStatus.gitRoot);
    const after = await runGit(["rev-parse", "HEAD"], beforeStatus.gitRoot);
    const changedFiles = before.stdout === after.stdout
      ? []
      : (await runGit(["diff", "--name-only", before.stdout, after.stdout], beforeStatus.gitRoot)).stdout
          .split("\n")
          .filter(Boolean);
    const dependencyChanged = changedFiles.some((file) => ["package.json", "package-lock.json"].includes(file));
    if (dependencyChanged) {
      await runProcess("npm", ["install"], { cwd: beforeStatus.gitRoot, timeout: 300000 });
    }
    const finalStatus = await getUpdateStatus();
    return updateResult(
      finalStatus,
      "updated",
      "更新完成",
      dependencyChanged ? "已同步 GitHub 并更新依赖，请重启应用。" : "已同步 GitHub 最新代码，请重启应用。",
      {
        updated: true,
        dependencyChanged,
        changedFiles,
        restartRequired: true
      }
    );
  } catch (error) {
    return updateResult(
      beforeStatus,
      "error",
      "一键更新失败",
      error.output?.stderr || error.output?.stdout || error.message
    );
  }
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
    updateTrayMenu();
  }
  return settings;
}

function windowOptions(extra = {}) {
  return {
    show: false,
    backgroundColor: "#00000000",
    icon: path.join(__dirname, "assets/branding/app-logo.png"),
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

function displayToPayload(display) {
  if (!display) return null;
  return {
    id: String(display.id),
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height
    },
    workArea: {
      x: display.workArea.x,
      y: display.workArea.y,
      width: display.workArea.width,
      height: display.workArea.height
    },
    scaleFactor: display.scaleFactor || 1
  };
}

async function getRecordingSources() {
  const displays = screen.getAllDisplays();
  const displaysById = new Map(displays.map((display) => [String(display.id), display]));
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 360, height: 220 },
    fetchWindowIcons: true
  });
  return sources.map((source) => {
    const isScreen = source.id.startsWith("screen:");
    const display = displaysById.get(String(source.display_id)) || (isScreen ? screen.getPrimaryDisplay() : null);
    return {
      id: source.id,
      name: source.name,
      type: isScreen ? "screen" : "window",
      displayId: source.display_id || "",
      displayBounds: displayToPayload(display),
      thumbnail: source.thumbnail?.toDataURL() || ""
    };
  });
}

async function logCaptureDiagnostics() {
  try {
    const screenAccess = process.platform === "darwin" ? systemPreferences.getMediaAccessStatus("screen") : "unknown";
    const displays = screen.getAllDisplays();
    console.log("[recording:diagnose]", {
      screenAccess,
      displayCount: displays.length,
      displays: displays.map(displayToPayload)
    });
    const sources = await getRecordingSources();
    console.log("[recording:diagnose:sources]", sources.map((source) => ({
      id: source.id,
      name: source.name,
      type: source.type,
      displayId: source.displayId,
      hasDisplayBounds: Boolean(source.displayBounds),
      hasThumbnail: Boolean(source.thumbnail)
    })));
  } catch (error) {
    console.error("[recording:diagnose:error]", error);
  }
}

async function runRecordingSmokeTest() {
  try {
    if (!controlWindow || controlWindow.isDestroyed()) return;
    const sources = await getRecordingSources();
    const source = sources.find((item) => item.type === "screen") || sources[0];
    if (!source) throw new Error("No desktop source available for smoke test.");
    const shouldSave = process.env.CLAWCAST_RECORDING_SMOKE_SAVE === "1";
    const result = await controlWindow.webContents.executeJavaScript(`
      (async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: ${JSON.stringify(source.id)},
              maxFrameRate: 30
            }
          }
        });
        const chunks = [];
        const type = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm";
        const recorder = new MediaRecorder(stream, { mimeType: type });
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data && event.data.size) chunks.push(event.data);
        });
        await new Promise((resolve, reject) => {
          recorder.addEventListener("error", () => reject(recorder.error || new Error("MediaRecorder error")));
          recorder.addEventListener("stop", resolve, { once: true });
          recorder.start(250);
          setTimeout(() => recorder.stop(), 1200);
        });
        for (const track of stream.getTracks()) track.stop();
        const blob = new Blob(chunks, { type });
        const result = { sourceId: ${JSON.stringify(source.id)}, sourceName: ${JSON.stringify(source.name)}, type, size: blob.size };
        if (${JSON.stringify(shouldSave)}) {
          const buffer = await blob.arrayBuffer();
          result.bytes = Array.from(new Uint8Array(buffer));
        }
        return result;
      })();
    `);
    if (shouldSave && result.bytes?.length) {
      const dir = recordingsDir();
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `ClawCast-smoke-${Date.now()}.webm`);
      fs.writeFileSync(filePath, Buffer.from(result.bytes));
      result.savedPath = filePath;
      delete result.bytes;
    }
    console.log("[recording:smoke]", result);
  } catch (error) {
    console.error("[recording:smoke:error]", error);
  }
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
  controlWindow.once("ready-to-show", () => {
    controlWindow.show();
    if (process.env.CLAWCAST_RECORDING_SMOKE === "1") {
      setTimeout(runRecordingSmokeTest, 1200);
    }
  });
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
  overlayWindow.setContentProtection(Boolean(settings.overlay.protectedFromCapture));
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

function showControlWindow() {
  if (!controlWindow || controlWindow.isDestroyed()) {
    createControlWindow();
  }
  controlWindow.show();
  controlWindow.focus();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示控制台", click: showControlWindow },
    {
      label: settings.overlay.visible ? "隐藏名片" : "显示名片",
      click: () => updateSettings({ overlay: { visible: !settings.overlay.visible } })
    },
    {
      label: settings.prompter.visible ? "隐藏提词器" : "显示提词器",
      click: () => updateSettings({ prompter: { visible: !settings.prompter.visible } })
    },
    { type: "separator" },
    { label: "退出爪播", accelerator: "Command+Q", click: () => app.quit() }
  ]));
}

function createTray() {
  const iconPath = path.join(__dirname, "assets/branding/app-logo.png");
  const image = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  tray = new Tray(image);
  tray.setToolTip("爪播 ClawCast Studio");
  updateTrayMenu();
  tray.on("click", showControlWindow);
}

function createApplicationMenu() {
  const template = [
    {
      label: "爪播",
      submenu: [
        { label: "显示控制台", accelerator: "Command+Shift+C", click: showControlWindow },
        { type: "separator" },
        { label: "退出爪播", accelerator: "Command+Q", click: () => app.quit() }
      ]
    },
    {
      label: "窗口",
      submenu: [
        { label: "重置悬浮位置", click: () => {
          const overlaySize = overlaySizes[settings.overlay.size] || overlaySizes.medium;
          const overlayBounds = getDisplayCenteredBounds(overlaySize.width, overlaySize.height, 310, 140);
          const prompterBounds = getDisplayCenteredBounds(settings.windows.prompter.width, settings.windows.prompter.height, 0, -250);
          if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.setBounds(overlayBounds);
          if (prompterWindow && !prompterWindow.isDestroyed()) prompterWindow.setBounds(prompterBounds);
          updateSettings({
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
        } }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function recordingPayloadToBuffer(payload = {}) {
  const input = payload.bytes ?? payload.buffer;
  if (Buffer.isBuffer(input)) return input;
  if (Array.isArray(input)) return Buffer.from(input);
  if (ArrayBuffer.isView(input)) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  throw new Error("没有收到可写入的视频数据。");
}

function recordingsDir() {
  return path.join(os.homedir(), "Movies", "ClawCast Studio");
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
  ipcMain.handle("microphone:get-access-status", () => {
    if (process.platform !== "darwin") return "unknown";
    return systemPreferences.getMediaAccessStatus("microphone");
  });
  ipcMain.handle("microphone:open-privacy", async () => {
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");
    return true;
  });
  ipcMain.handle("recording:get-sources", async () => {
    try {
      return await getRecordingSources();
    } catch (error) {
      console.error("[recording:get-sources:error]", error);
      throw error;
    }
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
    const dir = recordingsDir();
    fs.mkdirSync(dir, { recursive: true });
    const safeName = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(dir, `ClawCast-${safeName}.webm`);
    const buffer = recordingPayloadToBuffer(payload);
    if (!buffer.length) {
      throw new Error("录屏数据为空，没有写入文件。");
    }
    fs.writeFileSync(filePath, buffer);
    const { size } = fs.statSync(filePath);
    if (!size) {
      throw new Error("文件已创建但大小为 0。");
    }
    return { path: filePath, size };
  });
  ipcMain.handle("recording:show-file", async (_event, filePath) => {
    if (filePath) shell.showItemInFolder(filePath);
    return true;
  });
  ipcMain.handle("cursor:get-position", () => {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    return {
      x: point.x,
      y: point.y,
      displayId: String(display.id),
      displayBounds: displayToPayload(display)
    };
  });
  ipcMain.handle("update:get-status", (_event, options) => getUpdateStatus(options));
  ipcMain.handle("update:run", () => runSourceUpdate());
  ipcMain.handle("app:restart", () => {
    app.relaunch({ args: process.argv.slice(1) });
    app.exit(0);
    return true;
  });
  ipcMain.handle("app:quit", () => {
    app.quit();
    return true;
  });
  ipcMain.handle("window:show-control", () => {
    showControlWindow();
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
  app.setName("爪播");
  loadSettings();
  if (process.platform === "darwin" && app.dock) {
    app.dock.show();
    app.dock.setIcon(path.join(__dirname, "assets/branding/app-logo.png"));
  }
  registerIpc();
  createApplicationMenu();
  createTray();
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(["media", "camera", "microphone", "display-capture"].includes(permission));
  });
  createControlWindow();
  createOverlayWindow();
  createPrompterWindow();
  registerShortcuts();
  if (process.env.CLAWCAST_DEBUG_CAPTURE === "1") {
    setTimeout(logCaptureDiagnostics, 1200);
  }
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
