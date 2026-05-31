/**
 * 识别 Windows 版本，供桌面层与拖动策略选择
 */

const os = require("os");

function getSystemInfo() {
  if (process.platform !== "win32") {
    return {
      platform: process.platform,
      isWindows: false,
      isWin10: false,
      isWin11: false,
      dragMode: "electron",
    };
  }

  const release = os.release();
  const parts = release.split(".");
  const build = parseInt(parts[2] || "0", 10);
  const isWin11 = build >= 22000;

  return {
    platform: "win32",
    isWindows: true,
    isWin10: !isWin11,
    isWin11,
    release,
    build,
    // Win11 桌面层窗口必须用 Win32 物理坐标拖动
    dragMode: isWin11 ? "win32-native" : "win32-native",
  };
}

module.exports = { getSystemInfo };
