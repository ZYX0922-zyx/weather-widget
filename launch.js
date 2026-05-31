/**
 * 启动入口：直接拉起 Electron，并在失败时输出可读诊断信息
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

if (process.platform === "win32") {
  try {
    process.stdout.setDefaultEncoding("utf8");
    process.stderr.setDefaultEncoding("utf8");
  } catch {
    // ignore
  }
}

const appPath = __dirname;
const electronModuleDir = path.join(appPath, "node_modules", "electron");
const electronExePath = path.join(electronModuleDir, "dist", "electron.exe");

function ensureElectronBinary() {
  if (process.platform !== "win32") return;

  if (fs.existsSync(electronExePath)) return;

  console.error("[错误] 未找到 Electron 可执行文件，正在尝试重新下载...");
  try {
    require(path.join(electronModuleDir, "install.js"));
  } catch (err) {
    console.error("[错误] Electron 自动安装失败:", err.message);
  }

  if (!fs.existsSync(electronExePath)) {
    console.error("[错误] 仍缺少 electron.exe，请在本目录执行: npm install");
    process.exit(1);
  }
}

function decodeExitCode(code) {
  if (typeof code !== "number") return null;
  if (code > 255) return code >> 8;
  return code;
}

function printExitHelp(code) {
  const realCode = decodeExitCode(code);
  console.error(`[错误] Electron 进程退出，码: ${realCode ?? code}`);

  if (realCode === 11 || code === 2816) {
    console.error("[提示] 常见原因: Electron 安装不完整、显卡驱动冲突、或主进程崩溃");
    console.error("[提示] 请在本目录执行: npm install");
    console.error("[提示] 或设置环境变量: WIDGET_ELECTRON_ARGS=--disable-gpu");
  } else if (realCode === -144 || code === -36861) {
    console.error("[提示] 启动阶段发生 Win32 原生崩溃（crashpad not connected）");
    console.error("[提示] 请在任务管理器结束所有 electron.exe 后重试");
    console.error("[提示] 可设置: WIDGET_ELECTRON_ARGS=--disable-gpu --no-sandbox");
  } else if (realCode === 1) {
    console.error("[提示] 请在本目录执行: npm install");
    console.error("[提示] 或设置环境变量: WIDGET_ELECTRON_ARGS=--disable-gpu 后重试");
  }
}

function preflightCheck() {
  const files = ["main.js", "desktop-win.js", "preload.js", "launch.js"];
  for (const file of files) {
    const filePath = path.join(appPath, file);
    if (!fs.existsSync(filePath)) {
      console.error(`[错误] 缺少文件: ${file}`);
      process.exit(1);
    }
  }
}

ensureElectronBinary();
preflightCheck();

const silentLaunch = process.env.WIDGET_SILENT === "1";

let electronPath;
try {
  electronPath = require("electron");
} catch (err) {
  console.error("[错误] 无法加载 electron 模块:", err.message);
  console.error("[提示] 请在本目录执行: npm install");
  process.exit(1);
}

const userArgs = (process.env.WIDGET_ELECTRON_ARGS || "")
  .split(/\s+/)
  .filter(Boolean);
// 与 main.js 一致：透明模式需 GPU；仅 WIDGET_OPAQUE=1 时默认关 GPU
const defaultArgs =
  process.platform === "win32" &&
  process.env.WIDGET_ENABLE_GPU !== "1" &&
  process.env.WIDGET_OPAQUE === "1" &&
  !userArgs.includes("--disable-gpu")
    ? ["--disable-gpu", "--disable-gpu-sandbox"]
    : [];

function startElectron(runtimeArgs = [...defaultArgs, ...userArgs]) {
  const args = [...runtimeArgs, appPath];
  const child = spawn(electronPath, args, {
    cwd: appPath,
    stdio: silentLaunch ? "ignore" : "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      NODE_OPTIONS: "",
    },
  });

  child.on("error", (err) => {
    if (!silentLaunch) {
      console.error("[错误] 无法启动 Electron:", err.message);
    }
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (silentLaunch) {
      process.exit(0);
      return;
    }

    if (signal) {
      console.error(`[错误] Electron 异常终止，信号: ${signal}`);
      process.exit(1);
    }

    if (code && code !== 0) {
      printExitHelp(code);
    }

    process.exit(code ?? 0);
  });
}

if (!silentLaunch) {
  console.log("[启动] 正在拉起 Electron...");
}
startElectron();
