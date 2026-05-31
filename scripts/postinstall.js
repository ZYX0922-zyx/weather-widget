const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const appPath = path.join(__dirname, "..");
const electronExe = path.join(appPath, "node_modules", "electron", "dist", "electron.exe");

if (process.platform === "win32" && !fs.existsSync(electronExe)) {
  try {
    require(path.join(appPath, "node_modules", "electron", "install.js"));
  } catch (err) {
    console.warn("[postinstall] Electron download failed:", err.message);
  }
}

if (process.platform === "win32") {
  const iconScript = path.join(__dirname, "build-icon.ps1");
  if (fs.existsSync(iconScript)) {
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", iconScript, "-Root", appPath],
      { stdio: "inherit" }
    );
    if (result.status !== 0) {
      console.warn("[postinstall] Icon build failed, exit code:", result.status);
    }
  }
}
