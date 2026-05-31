const { app, BrowserWindow, ipcMain, screen, session } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const {
  queryPrimaryDisplay,
  queryDisplayForBounds,
  dipPointToScreen,
  screenPointToDip,
  getResizeEdgeAnchorScreen,
} = require("./display-scale");

const { getSystemInfo } = require("./system-info");

// 默认透明桌面组件；设 WIDGET_OPAQUE=1 可改为不透明
const WINDOW_USE_TRANSPARENT = process.env.WIDGET_OPAQUE !== "1";
// Windows 透明窗需要 GPU 合成；仅不透明模式默认关 GPU（设 WIDGET_ENABLE_GPU=1 可强制开启）
const WINDOW_HW_ACCEL_DISABLED =
  process.platform === "win32" &&
  process.env.WIDGET_ENABLE_GPU !== "1" &&
  !WINDOW_USE_TRANSPARENT;

if (process.platform === "win32" && process.stdout?.setDefaultEncoding) {
  process.stdout.setDefaultEncoding("utf8");
  process.stderr.setDefaultEncoding("utf8");
}

process.on("uncaughtException", (err) => {
  console.error("[主进程] 未捕获异常:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[主进程] 未处理的 Promise 拒绝:", reason);
});

app.setName("天气组件");
app.setPath("userData", path.join(app.getPath("appData"), "weather-widget"));

function readWidgetSettings() {
  try {
    const settingsPath = path.join(app.getPath("appData"), "weather-widget", "settings.json");
    if (!fs.existsSync(settingsPath)) return {};
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (err) {
    console.error("[主进程] 读取设置失败:", err.message);
    return {};
  }
}

function normalizeUiLocale(value) {
  const tag = String(value || "").trim().replace(/_/g, "-");
  if (tag.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en";
}

function getWidgetUiLocale() {
  const settings = readWidgetSettings();
  if (settings.lang) return normalizeUiLocale(settings.lang);
  if (process.env.WIDGET_LANG) return normalizeUiLocale(process.env.WIDGET_LANG);
  return normalizeUiLocale(app.getLocale());
}

function applyWidgetSettingsEnv() {
  const locale = getWidgetUiLocale();
  process.env.WIDGET_LANG = locale;
}

applyWidgetSettingsEnv();
const APP_ICON_CANDIDATES = [
  path.join(app.getPath("appData"), "weather-widget", "app.ico"),
  path.join(__dirname, "assets", "icon.ico"),
];
const APP_ICON = APP_ICON_CANDIDATES.find((p) => fs.existsSync(p)) || APP_ICON_CANDIDATES[1];
if (WINDOW_HW_ACCEL_DISABLED) {
  app.disableHardwareAcceleration();
}
app.commandLine.appendSwitch("disk-cache-dir", path.join(__dirname, ".electron-cache"));
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

let mainWindow = null;
let desktopAttachTimer = null;
let dragState = null;
let isDragging = false;
let attachToDesktop = () => false;
let ensureDesktopAttached = () => false;
let isAttachedToDesktop = () => false;
let syncWindowScreenBounds = null;
let readNativeWindowScreenRect = null;
let detachFromDesktop = null;
// 默认挂桌面壁纸层；设 WIDGET_FLOAT=1 时使用浮窗置顶
const DESKTOP_ATTACH_ENABLED =
  process.platform === "win32" && process.env.WIDGET_FLOAT !== "1";
let stripChromeForWindow = () => {};
let restoreFloatWindowStyles = () => {};
let beginNativeDrag = null;
let updateNativeDrag = null;
let beginNativeResize = null;
let updateNativeResize = null;
let isPrimaryMouseButtonDown = null;
let endNativeDrag = null;
let endNativeResize = null;
let getWindowHwnd = null;
let ensureNativeResizeCapture = null;
let installGlobalLeftButtonUpListener = null;
let removeGlobalLeftButtonUpListener = null;
let pumpMainThreadMessages = null;
let isMouseCaptureHeld = null;
let releaseCaptureForHwnd = null;
const systemInfo = getSystemInfo();
let mouseIgnoring = null;
let passthroughLocked = false;

const WINDOW_SHOW_DELAY_MS = 520;
const WINDOW_FADE_MS = 560;
const NORMAL_MIN_WIDTH = 260;
const NORMAL_MIN_HEIGHT = 72;
const NORMAL_DEFAULT_WIDTH = 400;
const NORMAL_DEFAULT_HEIGHT = 640;
// 竖条渐变带 140~150、横条渐变带 190~200，带宽 10px
const STRIP_BAND_SIZE = 10;
const STRIP_V_BAND_ENTER = 140;
const STRIP_V_BAND_EXIT = 150;
const STRIP_H_BAND_ENTER = 190;
const STRIP_H_BAND_EXIT = 200;
const STRIP_SHRINK_MIN = 80;

const WM_LBUTTONDOWN = 0x0201;
const WM_MOUSEMOVE = 0x0200;

const STRIP_V_ENTER_WIDTH = STRIP_V_BAND_ENTER;
const STRIP_V_EXIT_WIDTH = STRIP_V_BAND_EXIT;
const STRIP_H_ENTER_HEIGHT = STRIP_H_BAND_ENTER;
const STRIP_H_EXIT_HEIGHT = STRIP_H_BAND_EXIT;

// 横条极限（非固定尺寸）
const STRIP_H_MIN_WIDTH = 400;
const STRIP_H_MAX_WIDTH = 720;

// 竖条极限（非固定尺寸）
// 竖条仅缩宽度；高度由 savedStripVHeight 锁定

const STRIP_V_SHRINK_MIN_WIDTH = STRIP_SHRINK_MIN;
const STRIP_H_SHRINK_MIN_HEIGHT = STRIP_SHRINK_MIN;

const STRIP_H_MORPH_START = STRIP_H_BAND_EXIT;
const STRIP_H_MORPH_END = STRIP_H_BAND_ENTER;

let windowMode = "normal";
let savedNormalBounds = null;
let savedStripVHeight = null;
let suppressCompactCheck = false;
let stripExpandInProgress = false;
let resizeState = null;
let isResizing = false;
let isSnapping = false;
let snapTimer = null;
let resizeWatchTimer = null;
let dragWatchTimer = null;
let lastPointerIdleSweepAt = 0;
let pointerHygieneTimer = null;
let blockResizeApplyUntil = 0;
let pointerHygieneRunning = false;
let layoutNotifyTimer = null;
let liveLayoutNotifyAt = 0;

const LIVE_LAYOUT_NOTIFY_MS = 48;

const POINTER_IDLE_SWEEP_MS = 12;
const RESIZE_APPLY_BLOCK_MS = 150;

const SNAP_ANIM_MS = 240;

if (process.platform === "win32") {
  try {
    const desktop = require("./desktop-win");
    attachToDesktop = desktop.attachToDesktop;
    ensureDesktopAttached = desktop.ensureDesktopAttached;
    isAttachedToDesktop = desktop.isAttachedToDesktop;
    syncWindowScreenBounds = desktop.syncWindowScreenBounds;
    readNativeWindowScreenRect = desktop.readNativeWindowScreenRect;
    detachFromDesktop = desktop.detachFromDesktop;
    stripChromeForWindow = desktop.stripChromeForWindow;
    restoreFloatWindowStyles = desktop.restoreFloatWindowStyles;
    beginNativeDrag = desktop.beginNativeDrag;
    updateNativeDrag = desktop.updateNativeDrag;
    beginNativeResize = desktop.beginNativeResize;
    updateNativeResize = desktop.updateNativeResize;
    isPrimaryMouseButtonDown = desktop.isPrimaryMouseButtonDown;
    endNativeDrag = desktop.endNativeDrag;
    endNativeResize = desktop.endNativeResize;
    getWindowHwnd = desktop.getWindowHwnd;
    ensureNativeResizeCapture = desktop.ensureNativeResizeCapture;
    installGlobalLeftButtonUpListener = desktop.installGlobalLeftButtonUpListener;
    removeGlobalLeftButtonUpListener = desktop.removeGlobalLeftButtonUpListener;
    pumpMainThreadMessages = desktop.pumpMainThreadMessages;
    isMouseCaptureHeld = desktop.isMouseCaptureHeld;
    releaseCaptureForHwnd = desktop.releaseCaptureForHwnd;
  } catch (err) {
    console.error("desktop module load failed:", err.message);
  }
}

function tickInputWatch() {
  sweepStalePointerCapture();
}

function shouldEndPointerSession() {
  return !isLeftMouseButtonDown();
}

function releaseOrphanNativeCapture() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (isLeftMouseButtonDown()) return false;
  const hwnd = typeof getWindowHwnd === "function" ? getWindowHwnd(mainWindow) : null;
  if (!hwnd || typeof isMouseCaptureHeld !== "function" || !isMouseCaptureHeld(hwnd)) {
    return false;
  }
  forceReleaseNativeCapture();
  notifyResizeCancelled();
  return true;
}

function blockResizeApply(ms = RESIZE_APPLY_BLOCK_MS) {
  blockResizeApplyUntil = Date.now() + ms;
}

function clearResizeApplyBlock() {
  blockResizeApplyUntil = 0;
}

function canApplyWindowResize() {
  return Date.now() >= blockResizeApplyUntil;
}

function hasStalePointerSession() {
  if (isResizing || resizeState || isDragging) return true;
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const hwnd = typeof getWindowHwnd === "function" ? getWindowHwnd(mainWindow) : null;
  return Boolean(
    hwnd && typeof isMouseCaptureHeld === "function" && isMouseCaptureHeld(hwnd)
  );
}

function pointerHygieneTick() {
  if (pointerHygieneRunning) return;
  pointerHygieneRunning = true;
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (!hasStalePointerSession()) return;

    const buttonDown = isLeftMouseButtonDown();
    // 按键仍按下时为正常拖动/缩放，不做清理
    if (buttonDown) return;

    if (isResizing || resizeState) {
      blockResizeApply();
      handleWindowResizeEnd(true);
      return;
    }
    if (isDragging && dragState) {
      finishDragSession(true);
      return;
    }
    releaseOrphanNativeCapture();
  } catch (err) {
    console.error("[主进程] pointerHygieneTick:", err.message);
  } finally {
    pointerHygieneRunning = false;
  }
}

function startPointerHygieneTimer() {
  if (pointerHygieneTimer) return;
  pointerHygieneTimer = setInterval(pointerHygieneTick, 16);
}

function sweepStalePointerCapture(options = {}) {
  const force = Boolean(options.force);
  if (!force) {
    const now = Date.now();
    if (now - lastPointerIdleSweepAt < POINTER_IDLE_SWEEP_MS) return;
    lastPointerIdleSweepAt = now;
  }
  pointerHygieneTick();
}

function onGlobalMouseInput(wParam) {
  if (wParam === WM_LBUTTONDOWN) {
    if (isResizing || resizeState) {
      blockResizeApply();
      handleWindowResizeEnd(true);
      return;
    }
    if (!isDragging) {
      releaseOrphanNativeCapture();
    }
    return;
  }

  if (wParam === WM_MOUSEMOVE) {
    sweepStalePointerCapture();
    return;
  }

  if (typeof pumpMainThreadMessages === "function") {
    pumpMainThreadMessages();
  }
  blockResizeApply();
  if (isResizing || resizeState) {
    handleWindowResizeEnd(true);
    return;
  }
  if (isDragging && dragState) {
    finishDragSession(true);
    return;
  }
  if (!isDragging) {
    releaseOrphanNativeCapture();
  }
}

function isLeftMouseButtonDown() {
  if (typeof isPrimaryMouseButtonDown !== "function") {
    // 无 Win32 按键检测时不靠轮询结束，避免误释放
    return true;
  }
  return isPrimaryMouseButtonDown();
}

function forceEndPointerSessions() {
  let ended = false;
  if (isResizing || resizeState) {
    handleWindowResizeEnd(true);
    ended = true;
  }
  if (isDragging && dragState) {
    finishDragSession(true);
    ended = true;
  }
  return ended;
}

function syncGlobalMouseReleaseGuard() {
  // 低层鼠标钩子在 Electron + koffi 下易触发原生崩溃，改用轮询清理粘连
  startPointerHygieneTimer();
}

function stopDragWatch() {
  if (!dragWatchTimer) return;
  clearInterval(dragWatchTimer);
  dragWatchTimer = null;
}

function finishDragSession(fromForce = false) {
  if (!isDragging && !dragState) return false;

  stopDragWatch();
  const nativeHwnd = dragState?.native?.hwnd;
  if (nativeHwnd && typeof endNativeDrag === "function") {
    endNativeDrag(nativeHwnd);
  }
  dragState = null;
  isDragging = false;
  passthroughLocked = false;

  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      syncElectronBoundsFromNative(mainWindow);
      if (
        DESKTOP_ATTACH_ENABLED &&
        typeof isAttachedToDesktop === "function" &&
        !isAttachedToDesktop(mainWindow) &&
        typeof attachToDesktop === "function"
      ) {
        attachToDesktop(mainWindow, dipBoundsToScreenRect(mainWindow.getBounds()));
      }
    } catch {
      // ignore
    }
    updateMouseHitState({ interactive: false });
    if (fromForce) {
      mainWindow.webContents.send("window-drag-cancelled");
    }
  }

  syncInputWatch();
  syncGlobalMouseReleaseGuard();
  releaseOrphanNativeCapture();
  return true;
}

function startDragWatch() {
  stopDragWatch();
  dragWatchTimer = setInterval(() => {
    tickInputWatch();
    if (!isDragging || !dragState) {
      stopDragWatch();
      return;
    }
    if (shouldEndPointerSession()) {
      finishDragSession(true);
      return;
    }
    if (dragState.mode === "win32-native" && updateNativeDrag) {
      updateNativeDrag(dragState.native);
      return;
    }
    if (dragState.electron) {
      moveWindowByElectron(screen.getCursorScreenPoint());
    }
  }, 16);
}

function stopResizeWatch() {
  if (!resizeWatchTimer) return;
  clearInterval(resizeWatchTimer);
  resizeWatchTimer = null;
}

function syncInputWatch() {
  if ((isResizing || resizeState) && mainWindow && !mainWindow.isDestroyed()) {
    startResizeWatch();
  } else {
    stopResizeWatch();
  }
  if (isDragging && dragState) {
    startDragWatch();
  } else {
    stopDragWatch();
  }
}

function startResizeWatch() {
  stopResizeWatch();
  resizeWatchTimer = setInterval(() => {
    tickInputWatch();
    if (isResizing && !resizeState) {
      handleWindowResizeEnd(true);
      stopResizeWatch();
      return;
    }
    if (!isResizing || !resizeState) {
      stopResizeWatch();
      return;
    }
    if (shouldEndPointerSession()) {
      handleWindowResizeEnd(true);
      return;
    }
    applyWindowResize();
  }, 16);
}

function applyMousePassThrough(ignore) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // 浮窗模式需要正常接收点击，不做穿透
  if (!DESKTOP_ATTACH_ENABLED) {
    ignore = false;
  }
  if (passthroughLocked) {
    ignore = false;
  }
  if (mouseIgnoring === ignore) return;
  mouseIgnoring = ignore;
  mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
}

function enableMousePassThrough(window) {
  if (!window || window.isDestroyed()) return;
  if (!DESKTOP_ATTACH_ENABLED) {
    mouseIgnoring = null;
    applyMousePassThrough(false);
    return;
  }
  mouseIgnoring = null;
  applyMousePassThrough(true);
}

function updateMouseHitState({ interactive = false, forceCapture = false, release = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (passthroughLocked || forceCapture || interactive) {
    applyMousePassThrough(false);
    return;
  }

  if (release) {
    applyMousePassThrough(true);
    return;
  }

  applyMousePassThrough(true);
}

function fadeInWindow(window) {
  if (WINDOW_HW_ACCEL_DISABLED) {
    window.setOpacity(1);
    return;
  }

  const steps = 18;
  const interval = WINDOW_FADE_MS / steps;
  let step = 0;

  const timer = setInterval(() => {
    if (!window || window.isDestroyed()) {
      clearInterval(timer);
      return;
    }

    step += 1;
    window.setOpacity(Math.min(1, step / steps));

    if (step >= steps) {
      clearInterval(timer);
      window.setOpacity(1);
    }
  }, interval);
}

function getBoundsMinimums(mode = windowMode) {
  if (mode === "strip-v") {
    return {
      width: STRIP_V_SHRINK_MIN_WIDTH,
      height: Math.max(getStripVLockedHeight(), NORMAL_MIN_HEIGHT),
    };
  }
  if (mode === "strip-h") {
    return {
      width: STRIP_H_MIN_WIDTH,
      height: STRIP_H_SHRINK_MIN_HEIGHT,
    };
  }
  return { width: NORMAL_MIN_WIDTH, height: NORMAL_MIN_HEIGHT };
}

function syncElectronBoundsFromNative(window = mainWindow) {
  if (!window || window.isDestroyed() || typeof readNativeWindowScreenRect !== "function") {
    return false;
  }
  const native = readNativeWindowScreenRect(window);
  if (!native) return false;
  const topLeft = screenPointToDip({ x: native.left, y: native.top });
  const bottomRight = screenPointToDip({
    x: native.left + native.width,
    y: native.top + native.height,
  });
  const rawWidth = Math.max(1, Math.round(bottomRight.x - topLeft.x));
  const rawHeight = Math.max(1, Math.round(bottomRight.y - topLeft.y));
  const mode = resolveWindowMode(rawWidth, rawHeight, windowMode);
  const mins = getBoundsMinimums(mode);
  window.setBounds({
    x: Math.round(topLeft.x),
    y: Math.round(topLeft.y),
    width: Math.max(mins.width, rawWidth),
    height: Math.max(mins.height, rawHeight),
  });
  return true;
}

function moveWindowByElectron(cursor) {
  if (!mainWindow || !dragState?.electron) return;

  const { bounds, cursor: startCursor, origin } = dragState.electron;
  const screenPos = {
    x: origin.x + cursor.x - startCursor.x,
    y: origin.y + cursor.y - startCursor.y,
  };
  const dipPos = screenPointToDip(screenPos);

  mainWindow.setBounds({
    x: Math.round(dipPos.x),
    y: Math.round(dipPos.y),
    width: bounds.width,
    height: bounds.height,
  });
}

function createElectronDragState() {
  const bounds = mainWindow.getBounds();
  const cursor = screen.getCursorScreenPoint();

  return {
    bounds,
    cursor,
    scaleFactor: queryDisplayForBounds(bounds).scaleFactor,
    origin: dipPointToScreen({ x: bounds.x, y: bounds.y }),
  };
}

function createResizeState(edge) {
  const bounds = mainWindow.getBounds();
  const snapshot = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };

  if (systemInfo.isWindows && beginNativeResize) {
    const native = beginNativeResize(mainWindow, edge);
    return {
      mode: "win32-native",
      edge,
      native,
      bounds: snapshot,
      startedMode: windowMode,
      lastWidth: snapshot.width,
      lastHeight: snapshot.height,
      scaleFactor: queryDisplayForBounds(bounds).scaleFactor,
      sessionId: 0,
    };
  }

  const cursorScreen = screen.getCursorScreenPoint();
  const edgeAnchorScreen = getResizeEdgeAnchorScreen(snapshot, edge);

  return {
    mode: "electron",
    edge,
    bounds: snapshot,
    cursor: cursorScreen,
    edgeAnchorScreen,
    grabOffsetScreen: {
      x: cursorScreen.x - edgeAnchorScreen.x,
      y: cursorScreen.y - edgeAnchorScreen.y,
    },
    startedMode: windowMode,
    lastWidth: snapshot.width,
    lastHeight: snapshot.height,
    scaleFactor: queryDisplayForBounds(bounds).scaleFactor,
  };
}

function getTrackedEdgeScreenPoint(resizeState) {
  const cursorScreen = screen.getCursorScreenPoint();
  return {
    x: cursorScreen.x - resizeState.grabOffsetScreen.x,
    y: cursorScreen.y - resizeState.grabOffsetScreen.y,
  };
}

function notifySnapState(active) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("window-snap-changed", { active: Boolean(active) });
}

function notifyWindowLayoutChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("window-layout-changed", queryLayoutPayloadForRenderer());
}

function notifyLiveResizeLayout() {
  if (!mainWindow || mainWindow.isDestroyed() || !isResizing) return;
  const now = Date.now();
  if (now - liveLayoutNotifyAt < LIVE_LAYOUT_NOTIFY_MS) return;
  liveLayoutNotifyAt = now;
  notifyWindowLayoutChanged();
}

// 竖条/横条拖大过程中：仅在条带内对渲染层报告条模式，越过退出带后切 normal 预览
// 渲染层区分「缩小进条带」与「拖大恢复」，用于渐变方向
function getResizeStripIntent() {
  if (!isResizing || !resizeState || !mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  const { width, height } = mainWindow.getBounds();
  const edge = resizeState.edge;
  const started = resizeState.startedMode;
  const prevW = resizeState.lastWidth ?? resizeState.bounds.width;
  const prevH = resizeState.lastHeight ?? resizeState.bounds.height;
  const deltaW = width - prevW;
  const deltaH = height - prevH;

  resizeState.lastWidth = width;
  resizeState.lastHeight = height;

  if (isHorizontalResizeEdge(edge)) {
    if (started === "strip-v" || windowMode === "strip-v") {
      if (deltaW > 0) return { axis: "v", direction: "expand" };
      if (deltaW < 0) return { axis: "v", direction: "shrink" };
    } else if (started === "normal" || started === "strip-h") {
      if (deltaW < 0) return { axis: "v", direction: "shrink" };
      if (deltaW > 0 && width <= STRIP_V_BAND_EXIT + STRIP_BAND_SIZE) {
        return { axis: "v", direction: "expand" };
      }
    }
  }

  if (isVerticalResizeEdge(edge) && width > STRIP_V_BAND_ENTER) {
    const inStripHBand = height <= STRIP_H_BAND_EXIT + STRIP_BAND_SIZE;
    if (started === "strip-h" || windowMode === "strip-h") {
      if (deltaH > 0) return { axis: "h", direction: "expand" };
      if (deltaH < 0) return { axis: "h", direction: "shrink" };
    } else if (started === "normal") {
      if (deltaH < 0) return { axis: "h", direction: "shrink" };
      if (deltaH > 0 && inStripHBand) return { axis: "h", direction: "expand" };
    }
  }

  return null;
}

function getLayoutModeForRenderer(cachedIntent = undefined) {
  if (isResizing && resizeState && mainWindow && !mainWindow.isDestroyed()) {
    const { width, height } = mainWindow.getBounds();
    const intent = cachedIntent !== undefined ? cachedIntent : getResizeStripIntent();

    if (intent?.direction === "expand") {
      if (intent.axis === "h" && height > STRIP_H_BAND_EXIT + STRIP_BAND_SIZE) {
        return "normal";
      }
      if (intent.axis === "v" && width > STRIP_V_BAND_EXIT + STRIP_BAND_SIZE) {
        return "normal";
      }
    }

    if (
      isHorizontalResizeEdge(resizeState.edge) &&
      width <= STRIP_V_BAND_EXIT &&
      (intent?.direction === "shrink" ||
        resizeState.startedMode === "strip-v" ||
        (intent?.direction === "expand" && width <= STRIP_V_BAND_EXIT))
    ) {
      return "strip-v";
    }
    if (
      isVerticalResizeEdge(resizeState.edge) &&
      width > STRIP_V_BAND_ENTER &&
      height <= STRIP_H_BAND_EXIT + STRIP_BAND_SIZE &&
      (intent?.direction === "shrink" ||
        resizeState.startedMode === "strip-h" ||
        windowMode === "strip-h" ||
        (intent?.direction === "expand" &&
          height <= STRIP_H_BAND_EXIT + STRIP_BAND_SIZE))
    ) {
      return "strip-h";
    }
  }
  return windowMode;
}

function isStripVHorizontalExpandResize() {
  return (
    isResizing &&
    resizeState &&
    resizeState.startedMode === "strip-v" &&
    isHorizontalResizeEdge(resizeState.edge)
  );
}

function isStripHVerticalExpandResize() {
  return (
    isResizing &&
    resizeState &&
    resizeState.startedMode === "strip-h" &&
    isVerticalResizeEdge(resizeState.edge)
  );
}

function notifyWindowModeChanged() {
  notifyWindowLayoutChanged();
}

function saveNormalBoundsIfNeeded(bounds) {
  if (windowMode !== "normal") return;
  ensureNormalBoundsSnapshot(bounds);
}

function isRestorableNormalBounds(bounds) {
  if (!bounds) return false;
  return bounds.width >= STRIP_V_BAND_EXIT && bounds.height >= STRIP_H_BAND_EXIT;
}

function getDefaultNormalBounds(origin) {
  const current = origin || (mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null);
  return {
    x: current?.x ?? 0,
    y: current?.y ?? 0,
    width: NORMAL_DEFAULT_WIDTH,
    height: NORMAL_DEFAULT_HEIGHT,
  };
}

function ensureNormalBoundsSnapshot(bounds) {
  if (savedNormalBounds && isRestorableNormalBounds(savedNormalBounds)) return;

  if (isRestorableNormalBounds(bounds)) {
    savedNormalBounds = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    return;
  }

  savedNormalBounds = getDefaultNormalBounds(bounds);
}

function getStripVLockedHeight() {
  if (savedStripVHeight && savedStripVHeight >= NORMAL_MIN_HEIGHT) {
    return savedStripVHeight;
  }
  if (savedNormalBounds?.height >= NORMAL_MIN_HEIGHT) {
    return savedNormalBounds.height;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    return Math.max(mainWindow.getBounds().height, NORMAL_MIN_HEIGHT);
  }
  return NORMAL_DEFAULT_HEIGHT;
}

function ensureStripVHeightSnapshot(bounds) {
  const source = bounds || (mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null);
  if (!source) return;
  const height = Math.max(source.height, NORMAL_MIN_HEIGHT);
  if (!savedStripVHeight || height > savedStripVHeight) {
    savedStripVHeight = height;
  }
}

function clearStripVHeightSnapshot() {
  savedStripVHeight = null;
}

function enforceStripVHeightLock() {
  if (!mainWindow || mainWindow.isDestroyed() || windowMode !== "strip-v") return;
  const locked = getStripVLockedHeight();
  const bounds = mainWindow.getBounds();
  if (bounds.height >= locked) return;
  suppressCompactCheck = true;
  mainWindow.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: locked,
  });
  suppressCompactCheck = false;
}

function resolveRestoreNormalBounds() {
  const current = mainWindow.getBounds();
  let restore;
  if (savedNormalBounds && isRestorableNormalBounds(savedNormalBounds)) {
    restore = { ...savedNormalBounds };
  } else {
    restore = getDefaultNormalBounds(current);
    // 无历史尺寸时，竖条向左展开，保持右缘位置不动
    if (windowMode === "strip-v") {
      restore.x = current.x + current.width - restore.width;
    }
  }
  // 与横条一致：必须离开渐变带，否则会被 syncWindowMode 立即判回条模式
  if (restore.width < STRIP_V_BAND_EXIT) {
    restore.width = NORMAL_DEFAULT_WIDTH;
    if (windowMode === "strip-v" && !(savedNormalBounds && isRestorableNormalBounds(savedNormalBounds))) {
      restore.x = current.x + current.width - restore.width;
    }
  }
  if (restore.height < STRIP_H_BAND_EXIT) {
    restore.height = NORMAL_DEFAULT_HEIGHT;
  }
  return restore;
}

function finishStripExpandToNormal() {
  windowMode = "normal";
  stripExpandInProgress = false;
  suppressCompactCheck = false;
  savedNormalBounds = null;
  clearStripVHeightSnapshot();
  syncStripSizeLocks();
  enableMousePassThrough(mainWindow);
  notifyWindowLayoutChanged();
  return mainWindow.getBounds();
}

function expandStripToNormal() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { mode: "normal" };
  }

  const from = mainWindow.getBounds();
  if (windowMode === "normal" && isRestorableNormalBounds(from)) {
    return { mode: windowMode, width: from.width, height: from.height };
  }

  // 物理尺寸已在 normal 区域：仅切模式，不恢复到 default/历史大尺寸
  if (isRestorableNormalBounds(from)) {
    const next = finishStripExpandToNormal();
    return { mode: windowMode, width: next.width, height: next.height };
  }

  const target = resolveRestoreNormalBounds();
  if (
    from.x === target.x &&
    from.y === target.y &&
    from.width === target.width &&
    from.height === target.height
  ) {
    const next = finishStripExpandToNormal();
    return { mode: windowMode, width: next.width, height: next.height };
  }

  return new Promise((resolve) => {
    cancelSnapAnimation();
    stripExpandInProgress = true;
    suppressCompactCheck = true;
    releaseStripSizeLocks();

    animateWindowSnap(from, target, () => {
      const next = finishStripExpandToNormal();
      resolve({ mode: windowMode, width: next.width, height: next.height });
    });
  });
}

function getStripVMaxWidth() {
  return STRIP_V_BAND_ENTER;
}

function getStripHMaxHeight() {
  return STRIP_H_BAND_ENTER;
}

function snapInModeBand(value, enter, exit, stripMode) {
  if (!isBetween(value, enter, exit)) return null;
  const mid = (enter + exit) / 2;
  if (value < mid) {
    return { value: enter, mode: stripMode };
  }
  return { value: exit, mode: "normal" };
}

function snapInShrinkBand(value, shrinkMin, maxBeforeExit, stripMode) {
  if (!isBetween(value, shrinkMin, maxBeforeExit)) return null;
  const mid = (shrinkMin + maxBeforeExit) / 2;
  return {
    value: value < mid ? shrinkMin : maxBeforeExit,
    mode: stripMode,
  };
}

function isHorizontalResizeEdge(edge) {
  return (
    edge === "left" ||
    edge === "right" ||
    edge === "top-left" ||
    edge === "top-right" ||
    edge === "bottom-left" ||
    edge === "bottom-right"
  );
}

function isVerticalResizeEdge(edge) {
  return (
    edge === "top" ||
    edge === "bottom" ||
    edge === "top-left" ||
    edge === "top-right" ||
    edge === "bottom-left" ||
    edge === "bottom-right"
  );
}

function applyStripSizeLocks(mode) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const bounds = mainWindow.getBounds();

  if (mode === "strip-h") {
    mainWindow.setMinimumSize(STRIP_H_MIN_WIDTH, STRIP_H_SHRINK_MIN_HEIGHT);
    mainWindow.setMaximumSize(STRIP_H_MAX_WIDTH, getStripHMaxHeight());
    return;
  }

  if (mode === "strip-v") {
    mainWindow.setMinimumSize(STRIP_V_SHRINK_MIN_WIDTH, getStripVLockedHeight());
    mainWindow.setMaximumSize(getStripVMaxWidth(), 0);
  }
}

function syncStripSizeLocks() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (windowMode === "strip-h") {
    applyStripSizeLocks("strip-h");
    return;
  }
  if (windowMode === "strip-v") {
    applyStripSizeLocks("strip-v");
    return;
  }
  releaseStripSizeLocks();
}

function prepareStripExpandResize(edge) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (windowMode === "strip-v" && isHorizontalResizeEdge(edge)) {
    mainWindow.setMaximumSize(0, 0);
    mainWindow.setMinimumSize(STRIP_V_SHRINK_MIN_WIDTH, getStripVLockedHeight());
    return;
  }

  if (windowMode === "strip-h" && isVerticalResizeEdge(edge)) {
    mainWindow.setMaximumSize(STRIP_H_MAX_WIDTH, 0);
    mainWindow.setMinimumSize(STRIP_H_MIN_WIDTH, STRIP_H_SHRINK_MIN_HEIGHT);
  }
}

// 从正常/横条/竖条沿水平边缩小时，放宽 Electron 尺寸锁
function prepareStripShrinkResize(edge) {
  if (!mainWindow || mainWindow.isDestroyed() || !resizeState) return;
  if (!isHorizontalResizeEdge(edge)) return;
  if (
    resizeState.startedMode !== "normal" &&
    resizeState.startedMode !== "strip-h" &&
    resizeState.startedMode !== "strip-v"
  ) {
    return;
  }

  suppressCompactCheck = true;
  mainWindow.setMaximumSize(0, 0);
  const lockHeight = Math.max(resizeState.bounds?.height || NORMAL_MIN_HEIGHT, NORMAL_MIN_HEIGHT);
  ensureStripVHeightSnapshot({ height: lockHeight });
  mainWindow.setMinimumSize(STRIP_V_SHRINK_MIN_WIDTH, getStripVLockedHeight());
}

function prepareStripResize(edge) {
  prepareStripExpandResize(edge);
  prepareStripShrinkResize(edge);
}

function tryExitStripModeDuringExpand(edge, width, height) {
  if (!isResizing || !resizeState) return;

  if (
    windowMode === "strip-v" &&
    isHorizontalResizeEdge(edge) &&
    width >= STRIP_V_EXIT_WIDTH
  ) {
    const anchorWidth = resizeState.bounds?.width || width;
    // 向内缩时不触发退出，避免在 150 附近卡住或闪烁
    if (width <= anchorWidth) {
      return;
    }
    releaseStripSizeLocks();
    // 从 normal/横条误触进入竖条后再拖宽：恢复 normal，避免松手后仍按竖条渲染
    if (
      resizeState.startedMode === "normal" ||
      resizeState.startedMode === "strip-h"
    ) {
      windowMode = "normal";
    }
    return;
  }

  if (
    windowMode === "strip-h" &&
    isVerticalResizeEdge(edge) &&
    height >= STRIP_H_EXIT_HEIGHT
  ) {
    const anchorHeight = resizeState.bounds?.height || height;
    // 向内缩时不触发退出，避免在 200 附近卡住或闪烁
    if (height <= anchorHeight) {
      return;
    }
    releaseStripSizeLocks();
    windowMode = "normal";
  }
}

// 从正常/横条沿水平边缩进时，宽度进入竖条带则切换为 strip-v
function tryEnterStripModeDuringShrink(edge, width) {
  if (!isResizing || !resizeState) return;
  if (!isHorizontalResizeEdge(edge)) return;
  if (windowMode === "strip-v") return;
  if (width > STRIP_V_BAND_ENTER) return;
  if (resizeState.startedMode !== "normal" && resizeState.startedMode !== "strip-h") return;

  if (windowMode === "normal") {
    ensureNormalBoundsSnapshot(mainWindow.getBounds());
  }
  ensureStripVHeightSnapshot(resizeState?.bounds || mainWindow.getBounds());
  windowMode = "strip-v";
  // 缩放过程中只切模式标记，尺寸锁与穿透留到松手后，避免首缩时窗口闪烁
}

// 从正常/竖条沿垂直边缩进时，高度进入横条带则切换为 strip-h
function tryEnterStripHModeDuringShrink(edge, width, height) {
  if (!isResizing || !resizeState) return;
  if (!isVerticalResizeEdge(edge)) return;
  if (windowMode === "strip-h") return;
  if (width <= STRIP_V_BAND_ENTER) return;
  if (height > STRIP_H_BAND_ENTER) return;
  if (resizeState.startedMode !== "normal" && resizeState.startedMode !== "strip-v") return;

  if (windowMode === "normal") {
    ensureNormalBoundsSnapshot(mainWindow.getBounds());
  }
  windowMode = "strip-h";
}

function releaseStripSizeLocks() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setMaximumSize(0, 0);

  if (isResizing && resizeState) {
    if (resizeState.startedMode === "strip-v" && isHorizontalResizeEdge(resizeState.edge)) {
      mainWindow.setMinimumSize(STRIP_V_SHRINK_MIN_WIDTH, getStripVLockedHeight());
      return;
    }
    if (resizeState.startedMode === "strip-h" && isVerticalResizeEdge(resizeState.edge)) {
      mainWindow.setMinimumSize(NORMAL_MIN_WIDTH, STRIP_H_SHRINK_MIN_HEIGHT);
      return;
    }
  }

  mainWindow.setMinimumSize(NORMAL_MIN_WIDTH, NORMAL_MIN_HEIGHT);
}

function enterStripHMode() {
  if (!mainWindow || mainWindow.isDestroyed() || windowMode === "strip-h") return;

  const bounds = mainWindow.getBounds();
  if (windowMode === "normal") {
    ensureNormalBoundsSnapshot(bounds);
  }
  windowMode = "strip-h";

  suppressCompactCheck = true;
  ensureStripHCompactWidth();
  applyStripSizeLocks("strip-h");
  suppressCompactCheck = false;

  applyMousePassThrough(false);
  notifyWindowLayoutChanged();
}

function ensureStripHCompactWidth() {
  if (!mainWindow || mainWindow.isDestroyed() || windowMode !== "strip-h") return;
  const bounds = mainWindow.getBounds();
  if (bounds.width >= STRIP_H_MIN_WIDTH) return;
  const nextX = bounds.x + bounds.width - STRIP_H_MIN_WIDTH;
  suppressCompactCheck = true;
  mainWindow.setSize(STRIP_H_MIN_WIDTH, bounds.height);
  mainWindow.setPosition(nextX, bounds.y);
  suppressCompactCheck = false;
}

function enterStripVMode() {
  if (!mainWindow || mainWindow.isDestroyed() || windowMode === "strip-v") return;

  const bounds = mainWindow.getBounds();
  if (windowMode === "normal") {
    ensureNormalBoundsSnapshot(bounds);
  }
  ensureStripVHeightSnapshot(bounds);
  windowMode = "strip-v";

  suppressCompactCheck = true;
  applyStripSizeLocks("strip-v");
  suppressCompactCheck = false;
  enforceStripVHeightLock();

  applyMousePassThrough(false);
  notifyWindowLayoutChanged();
}

function exitStripModeForResize(options = {}) {
  if (!mainWindow || mainWindow.isDestroyed() || windowMode === "normal") return;

  const bounds = mainWindow.getBounds();
  if (isRestorableNormalBounds(bounds)) {
    if (!options.preserveSavedBounds) {
      savedNormalBounds = null;
    }
    finishStripExpandToNormal();
    return;
  }

  windowMode = "normal";
  suppressCompactCheck = true;
  releaseStripSizeLocks();
  suppressCompactCheck = false;

  if (!options.preserveSavedBounds) {
    savedNormalBounds = null;
  }
  if (!options.silent) {
    notifyWindowModeChanged();
  }
}

function exitStripMode() {
  if (!mainWindow || mainWindow.isDestroyed() || windowMode === "normal") return;
  expandStripToNormal();
}

function isStripVActive(width, mode) {
  if (stripExpandInProgress) return false;
  if (width <= STRIP_V_BAND_ENTER) return true;
  return mode === "strip-v" && width < STRIP_V_BAND_EXIT;
}

function isStripHActive(width, height, mode) {
  if (stripExpandInProgress) return false;
  if (width <= STRIP_V_BAND_ENTER) return false;
  if (height <= STRIP_H_BAND_ENTER) return true;
  return mode === "strip-h" && height < STRIP_H_BAND_EXIT;
}

function resolveWindowMode(width, height, currentMode) {
  if (isStripVActive(width, currentMode)) return "strip-v";
  if (isStripHActive(width, height, currentMode)) return "strip-h";
  return "normal";
}

function applyWindowMode(targetMode) {
  if (targetMode === windowMode) return;
  if (targetMode === "strip-v") {
    enterStripVMode();
    return;
  }
  if (targetMode === "strip-h") {
    enterStripHMode();
    return;
  }
  exitStripModeForResize();
  if (!passthroughLocked && !isDragging) {
    enableMousePassThrough(mainWindow);
  }
}

function syncWindowModeFromBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (process.platform === "win32" && typeof readNativeWindowScreenRect === "function") {
    syncElectronBoundsFromNative(mainWindow);
  }
  const { width, height } = mainWindow.getBounds();
  applyWindowMode(resolveWindowMode(width, height, windowMode));
  syncStripSizeLocks();
}

function checkWindowModeByResize() {
  if (!mainWindow || mainWindow.isDestroyed() || suppressCompactCheck || isResizing || isSnapping) return;
  syncWindowModeFromBounds();
}

function finalizeBoundsAfterResize() {
  if (!mainWindow || mainWindow.isDestroyed() || windowMode !== "normal") return;

  const bounds = mainWindow.getBounds();
  const width = Math.max(bounds.width, NORMAL_MIN_WIDTH);
  const height = Math.max(bounds.height, NORMAL_MIN_HEIGHT);

  if (width === bounds.width && height === bounds.height) return;

  suppressCompactCheck = true;
  mainWindow.setBounds({
    x: bounds.x,
    y: bounds.y,
    width,
    height,
  });
  suppressCompactCheck = false;
}

function bindWindowResizeHandler(window) {
  window.on("resize", () => {
    if (isSnapping || isResizing) return;
    checkWindowModeByResize();
    notifyWindowLayoutChanged();
  });
}

function getSizeLimits(widthRef, heightRef) {
  const bounds = mainWindow.getBounds();
  const width = typeof widthRef === "number" ? widthRef : bounds.width;
  const height = typeof heightRef === "number" ? heightRef : bounds.height;
  const lockHeight = Math.max(getStripVLockedHeight(), NORMAL_MIN_HEIGHT);

  // 缩放过程中优先使用宽松限制，避免卡在 260/140 等边界
  if (isResizing && resizeState) {
    if (isHorizontalResizeEdge(resizeState.edge)) {
      return {
        minWidth: STRIP_V_SHRINK_MIN_WIDTH,
        minHeight: lockHeight,
        maxWidth: 0,
        maxHeight: 0,
      };
    }
    if (isVerticalResizeEdge(resizeState.edge)) {
      if (windowMode === "strip-v" || resizeState.startedMode === "strip-v") {
        return {
          minWidth: STRIP_V_SHRINK_MIN_WIDTH,
          minHeight: lockHeight,
          maxWidth: 0,
          maxHeight: 0,
        };
      }
      if (windowMode === "strip-h" || resizeState.startedMode === "strip-h") {
        return {
          minWidth: STRIP_H_MIN_WIDTH,
          minHeight: STRIP_H_SHRINK_MIN_HEIGHT,
          maxWidth: STRIP_H_MAX_WIDTH,
          maxHeight: 0,
        };
      }
      return {
        minWidth: NORMAL_MIN_WIDTH,
        minHeight: STRIP_H_SHRINK_MIN_HEIGHT,
        maxWidth: 0,
        maxHeight: 0,
      };
    }
  }

  if (windowMode === "strip-h") {
    if (isStripHVerticalExpandResize()) {
      return {
        minWidth: STRIP_H_MIN_WIDTH,
        minHeight: STRIP_H_SHRINK_MIN_HEIGHT,
        maxWidth: STRIP_H_MAX_WIDTH,
        maxHeight: 0,
      };
    }
    const expandingV =
      isResizing && resizeState && isVerticalResizeEdge(resizeState.edge);
    const shrinkingH =
      isResizing && resizeState && isHorizontalResizeEdge(resizeState.edge);
    if (shrinkingH) {
      return {
        minWidth: STRIP_V_SHRINK_MIN_WIDTH,
        minHeight: STRIP_H_SHRINK_MIN_HEIGHT,
        maxWidth: STRIP_H_MAX_WIDTH,
        maxHeight: getStripHMaxHeight(),
      };
    }
    return {
      minWidth: STRIP_H_MIN_WIDTH,
      minHeight: STRIP_H_SHRINK_MIN_HEIGHT,
      maxWidth: STRIP_H_MAX_WIDTH,
      maxHeight: expandingV ? 0 : getStripHMaxHeight(),
    };
  }
  if (windowMode === "strip-v") {
    const lockedHeight = getStripVLockedHeight();
    return {
      minWidth: STRIP_V_SHRINK_MIN_WIDTH,
      minHeight: lockedHeight,
      maxWidth: 0,
      maxHeight: 0,
    };
  }

  return {
    minWidth: NORMAL_MIN_WIDTH,
    minHeight: NORMAL_MIN_HEIGHT,
    maxWidth: 0,
    maxHeight: 0,
  };
}

function clampSize(value, min, max) {
  let next = value;
  if (min && next < min) next = min;
  if (max && max > 0 && next > max) next = max;
  return next;
}

function isBetween(value, min, max) {
  return value > min && value < max;
}

function clampBoundsForResize(edge, x, y, width, height) {
  tryExitStripModeDuringExpand(edge, width, height);
  tryEnterStripModeDuringShrink(edge, width);
  tryEnterStripHModeDuringShrink(edge, width, height);

  const limits = getSizeLimits(width, height);
  let nextWidth = clampSize(width, limits.minWidth, limits.maxWidth);
  let nextHeight = clampSize(height, limits.minHeight, limits.maxHeight);

  if (nextWidth !== width && edge.includes("left")) {
    x += width - nextWidth;
  }
  if (nextHeight !== height && edge.includes("top")) {
    y += height - nextHeight;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(nextWidth),
    height: Math.round(nextHeight),
  };
}

function applyBoundsIfChanged(next) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const current = mainWindow.getBounds();
  if (
    next.x === current.x &&
    next.y === current.y &&
    next.width === current.width &&
    next.height === current.height
  ) {
    return;
  }

  suppressCompactCheck = true;
  mainWindow.setBounds(next);
  suppressCompactCheck = false;
}

function cancelSnapAnimation() {
  if (snapTimer) {
    clearInterval(snapTimer);
    snapTimer = null;
  }
  if (isSnapping) {
    isSnapping = false;
    notifySnapState(false);
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function applySnapMode(targetMode) {
  if (!targetMode) return;
  if (targetMode === "strip-v" && windowMode !== "strip-v") {
    enterStripVMode();
    return;
  }
  if (targetMode === "strip-h" && windowMode !== "strip-h") {
    enterStripHMode();
    return;
  }
  if (targetMode === "normal" && windowMode !== "normal") {
    exitStripModeForResize();
  }
}

function resolveSnapTarget(bounds, endedResize) {
  const { edge, startedMode } = endedResize;
  let { x, y, width, height } = bounds;
  let targetW = width;
  let targetH = height;
  let targetMode = null;
  let changed = false;
  const stripMaxW = getStripVMaxWidth();
  const stripMaxH = getStripHMaxHeight();

  if (isHorizontalResizeEdge(edge)) {
    // 正常模式宽度仍在 normal 区：不做竖条 snap
    if (startedMode === "normal" && width >= STRIP_V_BAND_EXIT) {
      return null;
    }
    // 从竖条向外拖大：超过退出带则保持当前尺寸，不要 snap 回竖条
    if (startedMode === "strip-v" && width >= STRIP_V_BAND_EXIT) {
      return null;
    }
    // 在渐变带内松手且来自竖条展开：归到 normal 侧
    if (
      startedMode === "strip-v" &&
      width > STRIP_V_BAND_ENTER &&
      width < STRIP_V_BAND_EXIT
    ) {
      targetW = STRIP_V_BAND_EXIT;
      targetMode = "normal";
      changed = true;
    } else {
      const modeSnap = snapInModeBand(width, STRIP_V_BAND_ENTER, STRIP_V_BAND_EXIT, "strip-v");
      if (modeSnap) {
        targetW = modeSnap.value;
        targetMode = modeSnap.mode;
        changed = true;
      } else if (width <= STRIP_V_BAND_ENTER) {
        const shrinkSnap = snapInShrinkBand(width, STRIP_SHRINK_MIN, stripMaxW, "strip-v");
        targetW = shrinkSnap ? shrinkSnap.value : stripMaxW;
        targetMode = "strip-v";
        changed = true;
      } else if (windowMode === "strip-v" || startedMode === "strip-v") {
        const shrinkSnap = snapInShrinkBand(width, STRIP_SHRINK_MIN, stripMaxW, "strip-v");
        if (shrinkSnap) {
          targetW = shrinkSnap.value;
          targetMode = shrinkSnap.mode;
          changed = true;
        }
      }
    }
  }

  if (isVerticalResizeEdge(edge) && width > STRIP_V_BAND_ENTER) {
    if (startedMode === "strip-h" && height >= STRIP_H_BAND_EXIT) {
      // 从横条向外拖高：超过退出带则保持当前尺寸
    } else if (
      startedMode === "strip-h" &&
      height > STRIP_H_BAND_ENTER &&
      height < STRIP_H_BAND_EXIT
    ) {
      targetH = STRIP_H_BAND_EXIT;
      if (targetMode !== "strip-v") {
        targetMode = "normal";
      }
      changed = true;
    } else {
      const modeSnap = snapInModeBand(height, STRIP_H_BAND_ENTER, STRIP_H_BAND_EXIT, "strip-h");
      if (modeSnap) {
        targetH = modeSnap.value;
        if (targetMode !== "strip-v") {
          targetMode = modeSnap.mode;
        }
        changed = true;
      } else if (windowMode === "strip-h" || startedMode === "strip-h") {
        const shrinkSnap = snapInShrinkBand(height, STRIP_SHRINK_MIN, stripMaxH, "strip-h");
        if (shrinkSnap) {
          targetH = shrinkSnap.value;
          if (targetMode !== "strip-v") {
            targetMode = shrinkSnap.mode;
          }
          changed = true;
        }
      }
    }
  }

  if (!changed) return null;

  if (targetW !== width && edge.includes("left")) {
    x += width - targetW;
  }
  if (targetH !== height && edge.includes("top")) {
    y += height - targetH;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(targetW),
    height: Math.round(targetH),
    mode: targetMode,
  };
}

function animateWindowSnap(from, to, onDone) {
  cancelSnapAnimation();
  isSnapping = true;
  notifySnapState(true);
  suppressCompactCheck = true;

  const startAt = Date.now();

  snapTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      cancelSnapAnimation();
      suppressCompactCheck = false;
      onDone?.();
      return;
    }

    const t = Math.min(1, (Date.now() - startAt) / SNAP_ANIM_MS);
    const e = easeOutCubic(t);
    mainWindow.setBounds({
      x: Math.round(from.x + (to.x - from.x) * e),
      y: Math.round(from.y + (to.y - from.y) * e),
      width: Math.round(from.width + (to.width - from.width) * e),
      height: Math.round(from.height + (to.height - from.height) * e),
    });
    notifyWindowLayoutChanged();

    if (t >= 1) {
      clearInterval(snapTimer);
      snapTimer = null;
      isSnapping = false;
      suppressCompactCheck = false;
      notifySnapState(false);
      onDone?.();
    }
  }, 16);
}

function finishResizeEnd() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  enforceStripVHeightLock();
  syncWindowModeFromBounds();
  finalizeBoundsAfterResize();
  notifyWindowLayoutChanged();

  if (windowMode !== "normal") {
    applyMousePassThrough(false);
  } else {
    updateMouseHitState({ interactive: false });
  }
}

function runResizeEndSnap(endedResize) {
  if (process.platform === "win32" && typeof readNativeWindowScreenRect === "function") {
    syncElectronBoundsFromNative(mainWindow);
  }
  const from = mainWindow.getBounds();
  if (
    endedResize.startedMode === "normal" &&
    from.width >= STRIP_V_BAND_EXIT &&
    windowMode === "strip-v"
  ) {
    windowMode = "normal";
    releaseStripSizeLocks();
  }
  const target = resolveSnapTarget(from, endedResize);

  if (!target) {
    finishResizeEnd();
    return;
  }

  applySnapMode(target.mode);

  const to = {
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
  };

  if (
    from.x === to.x &&
    from.y === to.y &&
    from.width === to.width &&
    from.height === to.height
  ) {
    finishResizeEnd();
    return;
  }

  animateWindowSnap(from, to, finishResizeEnd);
}

function applyNativeWindowResize() {
  if (!updateNativeResize || !resizeState?.native) return;
  updateNativeResize(resizeState.native);
  if (typeof ensureNativeResizeCapture === "function") {
    ensureNativeResizeCapture(resizeState.native);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    const { width, height } = mainWindow.getBounds();
    tryExitStripModeDuringExpand(resizeState.edge, width, height);
    tryEnterStripModeDuringShrink(resizeState.edge, width);
    tryEnterStripHModeDuringShrink(resizeState.edge, width, height);
  }
  notifyLiveResizeLayout();
}

function applyElectronWindowResize() {
  if (!mainWindow || !resizeState) return;

  const b = resizeState.bounds;
  const edgeDip = screenPointToDip(getTrackedEdgeScreenPoint(resizeState));

  let x = b.x;
  let y = b.y;
  let width = b.width;
  let height = b.height;

  switch (resizeState.edge) {
    case "left":
      x = edgeDip.x;
      width = b.x + b.width - edgeDip.x;
      break;
    case "right":
      width = edgeDip.x - b.x;
      break;
    case "top":
      y = edgeDip.y;
      height = b.y + b.height - edgeDip.y;
      break;
    case "bottom":
      height = edgeDip.y - b.y;
      break;
    case "top-left":
      x = edgeDip.x;
      y = edgeDip.y;
      width = b.x + b.width - edgeDip.x;
      height = b.y + b.height - edgeDip.y;
      break;
    case "top-right":
      y = edgeDip.y;
      width = edgeDip.x - b.x;
      height = b.y + b.height - edgeDip.y;
      break;
    case "bottom-left":
      x = edgeDip.x;
      width = b.x + b.width - edgeDip.x;
      height = edgeDip.y - b.y;
      break;
    case "bottom-right":
      width = edgeDip.x - b.x;
      height = edgeDip.y - b.y;
      break;
    default:
      return;
  }

  const next = clampBoundsForResize(resizeState.edge, x, y, width, height);
  applyBoundsIfChanged(next);
  notifyLiveResizeLayout();
}

function applyWindowResize() {
  if (!mainWindow || !resizeState || !isResizing) return;
  if (!canApplyWindowResize()) return;
  if (shouldEndPointerSession()) {
    handleWindowResizeEnd(true);
    return;
  }

  if (resizeState.mode === "win32-native") {
    applyNativeWindowResize();
    return;
  }

  applyElectronWindowResize();
}

function getInitialWindowBounds() {
  const { workArea } = queryPrimaryDisplay();
  const width = NORMAL_DEFAULT_WIDTH;
  const height = NORMAL_DEFAULT_HEIGHT;
  if (DESKTOP_ATTACH_ENABLED) {
    return clampBoundsToWorkArea({
      x: workArea.x + workArea.width - width - 20,
      y: workArea.y + 20,
      width,
      height,
    });
  }
  return clampBoundsToWorkArea({
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  });
}

function clampBoundsToWorkArea(bounds, mode = windowMode) {
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const mins = getBoundsMinimums(mode);
  let width = Math.max(
    mins.width,
    Math.round(Number(bounds.width) || NORMAL_DEFAULT_WIDTH)
  );
  let height = Math.max(
    mins.height,
    Math.round(Number(bounds.height) || NORMAL_DEFAULT_HEIGHT)
  );
  width = Math.min(width, area.width);
  height = Math.min(height, area.height);

  let x = Math.round(Number(bounds.x));
  let y = Math.round(Number(bounds.y));
  const offScreenX =
    !Number.isFinite(x) || x < area.x - width + 80 || x > area.x + area.width - 40;
  const offScreenY =
    !Number.isFinite(y) || y < area.y - height + 80 || y > area.y + area.height - 40;

  if (offScreenX) {
    x = area.x + area.width - width - 20;
  }
  if (offScreenY) {
    y = area.y + 20;
  }

  x = Math.max(area.x, Math.min(x, area.x + area.width - width));
  y = Math.max(area.y, Math.min(y, area.y + area.height - height));
  return { x, y, width, height };
}

function ensureSaneWindowBounds(window = mainWindow) {
  if (!window || window.isDestroyed()) return null;
  const current = window.getBounds();
  const mode = resolveWindowMode(current.width, current.height, windowMode);
  const sane = clampBoundsToWorkArea(current, mode);
  if (
    sane.x !== current.x ||
    sane.y !== current.y ||
    sane.width !== current.width ||
    sane.height !== current.height
  ) {
    window.setBounds(sane);
  }
  return sane;
}

function dipBoundsToScreenRect(bounds) {
  const topLeft = dipPointToScreen({ x: bounds.x, y: bounds.y });
  const bottomRight = dipPointToScreen({
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height,
  });
  return {
    left: topLeft.x,
    top: topLeft.y,
    width: Math.max(1, bottomRight.x - topLeft.x),
    height: Math.max(1, bottomRight.y - topLeft.y),
  };
}

function syncDesktopNativeBounds(window = mainWindow) {
  if (!window || window.isDestroyed() || typeof syncWindowScreenBounds !== "function") {
    return false;
  }
  const bounds = window.getBounds();
  const synced = syncWindowScreenBounds(window, dipBoundsToScreenRect(bounds));
  if (synced) {
    window.setBounds(bounds);
  }
  return synced;
}

function repairNativeWindowBounds(window, dipBounds) {
  if (!window || window.isDestroyed() || !dipBounds) return false;
  const screenRect = dipBoundsToScreenRect(dipBounds);
  if (typeof syncWindowScreenBounds === "function") {
    syncWindowScreenBounds(window, screenRect);
  }
  window.setBounds(dipBounds);
  return true;
}

function logNativeWindowSize(window, label) {
  if (typeof readNativeWindowScreenRect !== "function") return null;
  const native = readNativeWindowScreenRect(window);
  if (native) {
    console.log(`[主进程] ${label} 原生像素`, native);
  }
  return native;
}

function ensureNativeWindowVisible(window, dipBounds) {
  let native = logNativeWindowSize(window, "挂载后");
  if (!native) return true;

  const minW = Math.max(120, Math.floor(dipBounds.width * 0.25));
  const minH = Math.max(120, Math.floor(dipBounds.height * 0.25));
  if (native.width >= minW && native.height >= minH) {
    return true;
  }

  console.warn("[主进程] 原生窗口过小，尝试修复尺寸");
  repairNativeWindowBounds(window, dipBounds);
  native = logNativeWindowSize(window, "修复后");
  console.warn("[主进程] 原生窗口尺寸异常，仍保持桌面层");
  return true;
}

function applyFloatWindowMode(window) {
  if (!window || window.isDestroyed()) return;
  if (
    process.platform === "win32" &&
    typeof detachFromDesktop === "function" &&
    typeof isAttachedToDesktop === "function" &&
    isAttachedToDesktop(window)
  ) {
    detachFromDesktop(window);
  }
  if (process.platform === "win32" && typeof restoreFloatWindowStyles === "function") {
    restoreFloatWindowStyles(window);
  }
  // 浮窗模式不要 stripChrome，Win32 样式可能把窗口弄没
  window.setAlwaysOnTop(true, "floating");
  window.setSkipTaskbar(false);
  window.setFocusable(true);
  window.center();
  ensureSaneWindowBounds(window);
  window.setOpacity(1);
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
  window.moveTop();
  console.log("[主进程] 浮窗模式（屏幕居中）", window.getBounds(), {
    visible: window.isVisible(),
    minimized: window.isMinimized(),
    opacity: window.getOpacity(),
  });
}

function prepareWindowForShow(window) {
  if (!window || window.isDestroyed()) return;

  if (!DESKTOP_ATTACH_ENABLED) {
    applyFloatWindowMode(window);
    notifyWindowLayoutChanged();
    return;
  }

  const saneBounds = ensureSaneWindowBounds(window);

  if (!window.isVisible()) {
    window.showInactive();
  }
  window.setOpacity(1);
  console.log("[主进程] 窗口 show", window.getBounds());

  notifyWindowLayoutChanged();

  if (process.platform !== "win32") return;

  setTimeout(() => {
    if (!window || window.isDestroyed()) return;
    try {
      const latestBounds = ensureSaneWindowBounds(window) || saneBounds;
      stripChromeForWindow(window, true);
      const attached = attachToDesktop(window, dipBoundsToScreenRect(latestBounds));
      window.setBounds(latestBounds);
      repairNativeWindowBounds(window, latestBounds);
      ensureNativeWindowVisible(window, latestBounds);
      notifyWindowLayoutChanged();
      console.log(
        attached ? "[主进程] 已挂桌面层（透明底+边框按钮）" : "[主进程] 桌面层挂载失败",
        window.getBounds()
      );
    } catch (err) {
      console.error("desktop prepare error:", err.message);
    }
  }, 400);
}

function startDesktopAttachTimer(window) {
  if (!DESKTOP_ATTACH_ENABLED || desktopAttachTimer) return;
  desktopAttachTimer = setInterval(() => {
    if (!window || window.isDestroyed()) {
      clearInterval(desktopAttachTimer);
      desktopAttachTimer = null;
      return;
    }
    if (isDragging || isResizing) return;
    try {
      const bounds = ensureSaneWindowBounds(window);
      if (!bounds) return;
      if (typeof isAttachedToDesktop === "function" && isAttachedToDesktop(window)) {
        return;
      }
      attachToDesktop(window, dipBoundsToScreenRect(bounds));
      window.setBounds(bounds);
    } catch {
      // 忽略重挂载异常
    }
  }, 5000);
}

function refreshWindowChrome(window) {
  if (!DESKTOP_ATTACH_ENABLED) return;
  if (process.platform !== "win32" || !window || window.isDestroyed()) return;
  try {
    stripChromeForWindow(window, false);
  } catch {
    // ignore
  }
}

function createWindow() {
  const initialBounds = getInitialWindowBounds();

  mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: NORMAL_MIN_WIDTH,
    minHeight: NORMAL_MIN_HEIGHT,
    x: initialBounds.x,
    y: initialBounds.y,
    show: false,
    title: "天气组件",
    icon: APP_ICON,
    frame: false,
    transparent: WINDOW_USE_TRANSPARENT,
    thickFrame: false,
    hasShadow: false,
    roundedCorners: false,
    alwaysOnTop: !DESKTOP_ATTACH_ENABLED,
    resizable: true,
    skipTaskbar: DESKTOP_ATTACH_ENABLED,
    focusable: !DESKTOP_ATTACH_ENABLED,
    autoHideMenuBar: true,
    backgroundColor: WINDOW_USE_TRANSPARENT ? "#00000000" : "#152030",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.setBounds(initialBounds);
  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));

  mainWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.error("[主进程] 页面加载失败:", code, desc, url);
  });

  let pageReady = false;
  let windowReady = false;
  let hasShown = false;

  const tryShowWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed() || hasShown) return;
    if (!pageReady || !windowReady) return;

    hasShown = true;
    console.log("[主进程] ready-to-show + 页面加载完成，准备显示");

    const reveal = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      prepareWindowForShow(mainWindow);
      enableMousePassThrough(mainWindow);
      startDesktopAttachTimer(mainWindow);
      startPointerHygieneTimer();
      if (WINDOW_USE_TRANSPARENT && !WINDOW_HW_ACCEL_DISABLED) {
        mainWindow.setOpacity(0);
        fadeInWindow(mainWindow);
      }
    };

    if (!DESKTOP_ATTACH_ENABLED) {
      reveal();
      return;
    }

    setTimeout(reveal, WINDOW_SHOW_DELAY_MS);
  };

  setTimeout(() => {
    if (hasShown || !mainWindow || mainWindow.isDestroyed()) return;
    console.warn("[主进程] 显示超时，强制显示（可能 ready-to-show 未触发）");
    pageReady = true;
    windowReady = true;
    tryShowWindow();
  }, 2800);

  mainWindow.on("blur", () => {
    if (isDragging || isResizing) return;
    forceEndPointerSessions();
    refreshWindowChrome(mainWindow);
  });

  mainWindow.once("ready-to-show", () => {
    windowReady = true;
    console.log("[主进程] ready-to-show");
    tryShowWindow();
  });

  mainWindow.once("show", () => {
    console.log("[主进程] show 事件", mainWindow.getBounds());
  });

  mainWindow.webContents.once("did-finish-load", () => {
    pageReady = true;
    console.log("[主进程] did-finish-load");
    notifyWindowLayoutChanged();
    tryShowWindow();
  });

  bindWindowResizeHandler(mainWindow);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;

    client
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          let text = buf.toString("utf8");
          try {
            resolve(JSON.parse(text));
          } catch {
            try {
              text = decodeURIComponent(escape(buf.toString("binary")));
              resolve(JSON.parse(text));
            } catch {
              reject(new Error("parse failed"));
            }
          }
        });
      })
      .on("error", reject);
  });
}

async function geocodeCityName(cityName) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=zh&format=json`;
  const data = await fetchJson(url);

  if (!data.results || data.results.length === 0) {
    throw new Error("geocode failed");
  }

  const item = data.results[0];
  return {
    lat: item.latitude,
    lon: item.longitude,
    city: [item.name, item.admin1, item.country].filter(Boolean).join(" · "),
  };
}

ipcMain.handle("get-location-by-ip", async () => {
  try {
    const data = await fetchJson("http://whois.pconline.com.cn/ipJson.jsp?json=true");
    const cityName = data.city || data.pro || data.addr;

    if (!cityName || cityName === "\u672a\u77e5" || data.err) {
      return { ok: false };
    }

    const names = [cityName, cityName.replace(/(\u5e02|\u7701)$/, "")];

    for (const name of names) {
      try {
        const result = await geocodeCityName(name);
        return { ok: true, ...result };
      } catch {
        // try next name
      }
    }

    return { ok: false };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle("window-get-bounds", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { width: NORMAL_DEFAULT_WIDTH, height: NORMAL_DEFAULT_HEIGHT, mode: "normal" };
  }
  const bounds = mainWindow.getBounds();
  const mode = resolveWindowMode(bounds.width, bounds.height, windowMode);
  return { width: bounds.width, height: bounds.height, mode };
});

ipcMain.handle("window-get-position", () => {
  if (!mainWindow) return { x: 0, y: 0 };
  const [x, y] = mainWindow.getPosition();
  return { x, y };
});

ipcMain.handle("window-set-mode", async (_event, mode) => {
  if (mode === "normal") {
    return expandStripToNormal();
  }
  if (mode === "strip-h" || mode === "compact") {
    enterStripHMode();
  } else if (mode === "strip-v") {
    enterStripVMode();
  }
  const bounds = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null;
  return {
    mode: windowMode,
    width: bounds?.width,
    height: bounds?.height,
  };
});

ipcMain.handle("get-display-info", () => {
  const displayInfo =
    !mainWindow || mainWindow.isDestroyed()
      ? queryPrimaryDisplay()
      : queryDisplayForBounds(mainWindow.getBounds());

  return {
    ...displayInfo,
    system: systemInfo,
    hardwareAccelerationDisabled: WINDOW_HW_ACCEL_DISABLED,
    uiLocale: getWidgetUiLocale(),
  };
});

ipcMain.on("window-drag-start", () => {
  if (!mainWindow || isResizing) return;
  isDragging = true;
  passthroughLocked = true;
  applyMousePassThrough(false);

  if (systemInfo.isWindows && beginNativeDrag) {
    dragState = {
      mode: "win32-native",
      native: beginNativeDrag(mainWindow),
    };
  } else {
    dragState = {
      mode: "electron",
      electron: createElectronDragState(),
    };
  }
  startDragWatch();
  syncGlobalMouseReleaseGuard();
});

ipcMain.on("window-drag-move", (_event, payload = {}) => {
  if (!mainWindow || !dragState) return;

  if (payload.buttons === 0 || shouldEndPointerSession()) {
    finishDragSession(true);
  }
  // 位置更新统一由 dragWatch 定时器处理，避免 IPC 与轮询双重 setBounds 闪烁
});

ipcMain.on("window-drag-end", () => {
  if (isResizing) {
    dragState = null;
    isDragging = false;
    stopDragWatch();
    return;
  }
  finishDragSession(false);
});

ipcMain.on("window-resize-start", (_event, payload = {}) => {
  if (!mainWindow || !payload.edge || isDragging) return;

  cancelSnapAnimation();
  isResizing = true;
  passthroughLocked = true;
  applyMousePassThrough(false);

  resizeState = createResizeState(payload.edge);
  if (resizeState && payload.sessionId) {
    resizeState.sessionId = payload.sessionId;
  }
  if (
    resizeState &&
    (windowMode === "strip-v" || isHorizontalResizeEdge(resizeState.edge))
  ) {
    ensureStripVHeightSnapshot(resizeState.bounds);
  }
  clearResizeApplyBlock();
  liveLayoutNotifyAt = 0;
  prepareStripResize(payload.edge);
  startResizeWatch();
  syncGlobalMouseReleaseGuard();
});

ipcMain.on("window-resize-move", (_event, payload = {}) => {
  if (!mainWindow) return;

  if (!resizeState) {
    if (isResizing) {
      handleWindowResizeEnd(true);
    }
    return;
  }

  if (payload.buttons === 0 || shouldEndPointerSession()) {
    handleWindowResizeEnd(true);
    return;
  }
  if (payload.sessionId && resizeState.sessionId && payload.sessionId !== resizeState.sessionId) {
    return;
  }

  applyWindowResize();
});

ipcMain.handle("is-primary-button-down", () => isLeftMouseButtonDown());

function notifyResizeCancelled() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("window-resize-cancelled");
}

function forceReleaseNativeCapture() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const hwnd =
    resizeState?.native?.hwnd ||
    (typeof getWindowHwnd === "function" ? getWindowHwnd(mainWindow) : null);
  if (!hwnd) return;
  if (typeof endNativeResize === "function") {
    endNativeResize(hwnd);
  } else if (typeof releaseCaptureForHwnd === "function") {
    releaseCaptureForHwnd(hwnd);
  }
}

function handleWindowResizeEnd(fromMainForce = false) {
  blockResizeApply();

  if (!isResizing && !resizeState) {
    forceReleaseNativeCapture();
    if (fromMainForce) {
      notifyResizeCancelled();
    }
    releaseOrphanNativeCapture();
    return false;
  }

  forceReleaseNativeCapture();

  const endedResize = resizeState
    ? { edge: resizeState.edge, startedMode: resizeState.startedMode }
    : null;

  resizeState = null;
  isResizing = false;
  if (!isDragging) {
    passthroughLocked = false;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (endedResize) {
      runResizeEndSnap(endedResize);
    } else {
      finishResizeEnd();
    }
    if (fromMainForce) {
      notifyResizeCancelled();
    }
  }

  syncInputWatch();
  syncGlobalMouseReleaseGuard();
  releaseOrphanNativeCapture();
  if (layoutNotifyTimer) {
    clearTimeout(layoutNotifyTimer);
    layoutNotifyTimer = null;
  }
  return true;
}

function queryLayoutPayloadForRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return {
      mode: "normal",
      width: NORMAL_DEFAULT_WIDTH,
      height: NORMAL_DEFAULT_HEIGHT,
    };
  }
  const bounds = mainWindow.getBounds();
  const stripIntent = isResizing ? getResizeStripIntent() : null;
  return {
    mode:
      isResizing || isSnapping
        ? getLayoutModeForRenderer(stripIntent)
        : resolveWindowMode(bounds.width, bounds.height, windowMode),
    width: bounds.width,
    height: bounds.height,
    stripIntent,
  };
}

ipcMain.handle("window-resize-end", () => {
  handleWindowResizeEnd(false);
  return queryLayoutPayloadForRenderer();
});

ipcMain.handle("window-ensure-resize-ended", () => {
  if (isResizing || resizeState) {
    handleWindowResizeEnd(true);
  } else {
    forceReleaseNativeCapture();
    releaseOrphanNativeCapture();
  }
  return queryLayoutPayloadForRenderer();
});

ipcMain.on("window-mouse-hit", (_event, payload) => {
  updateMouseHitState(payload || {});
  if (payload?.release) {
    refreshWindowChrome(mainWindow);
  }
});

ipcMain.on("window-set-focusable", (_event, focusable) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setFocusable(Boolean(focusable));
  if (focusable) {
    mainWindow.focus();
  } else {
    refreshWindowChrome(mainWindow);
  }
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "geolocation");
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "geolocation";
  });

  createWindow();

  screen.on("display-metrics-changed", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("display-metrics-changed", queryDisplayForBounds(mainWindow.getBounds()));
  });
}).catch((err) => {
  console.error("[主进程] 启动失败:", err);
  app.quit();
});

app.on("window-all-closed", () => {
  shutdownAppTimers();
  if (typeof removeGlobalLeftButtonUpListener === "function") {
    removeGlobalLeftButtonUpListener();
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on("window-minimize", () => {
  mainWindow?.hide();
});

function shutdownAppTimers() {
  if (desktopAttachTimer) {
    clearInterval(desktopAttachTimer);
    desktopAttachTimer = null;
  }
  if (pointerHygieneTimer) {
    clearInterval(pointerHygieneTimer);
    pointerHygieneTimer = null;
  }
}

ipcMain.on("window-close", () => {
  shutdownAppTimers();
  if (typeof removeGlobalLeftButtonUpListener === "function") {
    removeGlobalLeftButtonUpListener();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    mainWindow = null;
  }
  app.quit();
});
