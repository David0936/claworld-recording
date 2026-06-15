const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceApp = path.join(root, "node_modules/electron/dist/Electron.app");
const outputApp = path.join(root, "dist/ClawCast Studio.app");
const resourcesDir = path.join(outputApp, "Contents/Resources");
const bundledAppDir = path.join(resourcesDir, "app");
const plistPath = path.join(outputApp, "Contents/Info.plist");
const appProcessPattern = "ClawCast Studio.app/Contents/MacOS/Electron";
const helperProcessPattern = "user-data-dir=.*clawcast-studio";

function ensureExists(target, message) {
  if (!fs.existsSync(target)) {
    throw new Error(message);
  }
}

function plist(command) {
  execFileSync("/usr/libexec/PlistBuddy", ["-c", command, plistPath], { stdio: "ignore" });
}

function setPlistValue(key, type, value) {
  try {
    plist(`Set :${key} ${value}`);
  } catch {
    plist(`Add :${key} ${type} ${value}`);
  }
}

function deletePlistValue(key) {
  try {
    plist(`Delete :${key}`);
  } catch {
    // Key already absent.
  }
}

function copyAppSource() {
  stopRunningApp();
  fs.rmSync(outputApp, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(outputApp), { recursive: true });
  execFileSync("/bin/cp", ["-R", sourceApp, outputApp]);
  fs.rmSync(path.join(resourcesDir, "default_app.asar"), { force: true });
  fs.rmSync(path.join(resourcesDir, "app"), { recursive: true, force: true });
  fs.mkdirSync(bundledAppDir, { recursive: true });
  fs.copyFileSync(path.join(root, "package.json"), path.join(bundledAppDir, "package.json"));
  fs.cpSync(path.join(root, "src"), path.join(bundledAppDir, "src"), { recursive: true });
  fs.copyFileSync(
    path.join(root, "src/assets/branding/app-logo.icns"),
    path.join(resourcesDir, "app-logo.icns")
  );
}

function stopRunningApp() {
  for (const pattern of [appProcessPattern, helperProcessPattern]) {
    spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });
  }
}

function updatePlist() {
  setPlistValue("CFBundleName", "string", "ClawCast Studio");
  setPlistValue("CFBundleDisplayName", "string", "爪播");
  setPlistValue("CFBundleIdentifier", "string", "com.claworld.clawcaststudio");
  setPlistValue("CFBundleExecutable", "string", "Electron");
  setPlistValue("CFBundleIconFile", "string", "app-logo");
  setPlistValue("CFBundleShortVersionString", "string", "0.1.0");
  setPlistValue("CFBundleVersion", "string", "0.1.0");
  deletePlistValue("LSUIElement");
  deletePlistValue("LSBackgroundOnly");
  setPlistValue(
    "NSCameraUsageDescription",
    "string",
    "爪播需要访问摄像头，用于录课名片里的真人画面。"
  );
  setPlistValue(
    "NSMicrophoneUsageDescription",
    "string",
    "爪播需要访问麦克风，用于录制你的讲解声音。"
  );
}

function signApp() {
  for (const signatureDir of findSignatureDirs(outputApp)) {
    fs.rmSync(signatureDir, { recursive: true, force: true });
  }
  const result = spawnSync("codesign", ["--force", "--deep", "--sign", "-", outputApp], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    for (const signatureDir of findSignatureDirs(outputApp)) {
      fs.rmSync(signatureDir, { recursive: true, force: true });
    }
    console.warn("codesign skipped:", (result.stderr || result.stdout || "codesign failed").trim());
  }
}

function findSignatureDirs(start) {
  const matches = [];
  for (const entry of fs.readdirSync(start, { withFileTypes: true })) {
    const next = path.join(start, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name === "_CodeSignature") {
      matches.push(next);
      continue;
    }
    matches.push(...findSignatureDirs(next));
  }
  return matches;
}

ensureExists(sourceApp, "Electron runtime is missing. Run npm install first.");
ensureExists(path.join(root, "src/main.js"), "src/main.js is missing.");
copyAppSource();
updatePlist();
signApp();

console.log(`Created ${outputApp}`);
