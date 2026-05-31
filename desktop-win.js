/**
 * 将窗口挂载到 Windows 桌面层（WorkerW）
 */

const koffi = require("koffi");

const user32 = koffi.load("user32.dll");

const HWND = koffi.pointer("HWND", koffi.opaque());

const FindWindowExW = user32.func(
  "HWND __stdcall FindWindowExW(HWND hWndParent, HWND hWndChildAfter, str16 className, str16 windowName)"
);
const SetParent = user32.func("HWND __stdcall SetParent(HWND hWndChild, HWND hWndNewParent)");
const GetWindowLongW = user32.func("long __stdcall GetWindowLongW(HWND hWnd, int nIndex)");
const SetWindowLongW = user32.func("long __stdcall SetWindowLongW(HWND hWnd, int nIndex, long dwNewLong)");
const SetWindowPos = user32.func(
  "int __stdcall SetWindowPos(HWND hWnd, HWND hWndInsertAfter, int x, int y, int cx, int cy, uint uFlags)"
);
const ShowWindow = user32.func("int __stdcall ShowWindow(HWND hWnd, int nCmdShow)");
const GetCursorPos = user32.func("int __stdcall GetCursorPos(int * lpPoint)");
const GetAsyncKeyState = user32.func("short __stdcall GetAsyncKeyState(int vKey)");
const GetKeyState = user32.func("short __stdcall GetKeyState(int nVirtKey)");
const SetWindowsHookExW = user32.func(
  "void * __stdcall SetWindowsHookExW(int idHook, void * lpfn, void * hMod, unsigned long dwThreadId)"
);
const UnhookWindowsHookEx = user32.func("int __stdcall UnhookWindowsHookEx(void * hHook)");
const CallNextHookEx = user32.func(
  "intptr __stdcall CallNextHookEx(void * hhk, int nCode, uintptr wParam, intptr lParam)"
);
const SetCapture = user32.func("HWND __stdcall SetCapture(HWND hWnd)");
const ReleaseCapture = user32.func("int __stdcall ReleaseCapture()");
const GetCapture = user32.func("HWND __stdcall GetCapture()");
const PeekMessageW = user32.func(
  "int __stdcall PeekMessageW(void * lpMsg, HWND hWnd, uint wMsgFilterMin, uint wMsgFilterMax, uint wRemoveMsg)"
);
const TranslateMessage = user32.func("int __stdcall TranslateMessage(void * lpMsg)");
const DispatchMessageW = user32.func("intptr __stdcall DispatchMessageW(void * lpMsg)");
const GetWindowRect = user32.func("int __stdcall GetWindowRect(HWND hWnd, int * lpRect)");
const GetParent = user32.func("HWND __stdcall GetParent(HWND hWnd)");
const ScreenToClient = user32.func("int __stdcall ScreenToClient(HWND hWnd, int * lpPoint)");
const WindowFromPoint = user32.func("HWND __stdcall WindowFromPoint(int x, int y)");
const IsChild = user32.func("int __stdcall IsChild(HWND hWndParent, HWND hWnd)");
const GetClassNameW = user32.func(
  "int __stdcall GetClassNameW(HWND hWnd, uint16 * lpClassName, int nMaxCount)"
);

let DwmSetWindowAttribute = null;

try {
  const dwmapi = koffi.load("dwmapi.dll");
  DwmSetWindowAttribute = dwmapi.func(
    "HRESULT __stdcall DwmSetWindowAttribute(HWND hwnd, uint dwAttribute, void * pvAttribute, uint cbAttribute)"
  );
} catch {
  // 部分环境无 dwmapi
}

const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_CAPTION = 0x00c00000;
const WS_THICKFRAME = 0x00040000;
const WS_BORDER = 0x00800000;
const WS_SYSMENU = 0x00080000;
const WS_MINIMIZEBOX = 0x00020000;
const WS_MAXIMIZEBOX = 0x00010000;
const WS_DLGFRAME = 0x00400000;
const WS_POPUP = 0x80000000;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_APPWINDOW = 0x00040000;
const WS_EX_NOACTIVATE = 0x08000000;
const DWMWA_NCRENDERING_POLICY = 2;
const DWMNCRP_DISABLED = 1;
const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
const DWMWCP_DONOTROUND = 1;
const DWMWA_CAPTION_COLOR = 35;
const DWMWA_BORDER_COLOR = 34;
const DWMWA_VISIBLE_FRAME_BORDER_THICKNESS = 37;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SWP_SHOWWINDOW = 0x0040;
const SW_SHOW = 5;
const HWND_BOTTOM = 1;
const VK_LBUTTON = 0x01;
const WH_MOUSE_LL = 14;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;
const WM_MOUSEMOVE = 0x0200;
const WM_CAPTURECHANGED = 0x0215;
const HC_ACTION = 0;
const PM_REMOVE = 0x0001;

const kernel32 = koffi.load("kernel32.dll");
const GetModuleHandleW = kernel32.func("void * __stdcall GetModuleHandleW(str16 lpModuleName)");
const MouseHookProcType = koffi.proto(
  "intptr __stdcall MouseHookProc(int nCode, uintptr wParam, intptr lParam)"
);

let globalLeftButtonUpHandler = null;
let mouseHookHandle = null;
let mouseHookProc = null;

// 点击穿透：交给下层桌面/应用处理
const PASS_THROUGH_CLASSES = new Set([
  "SHELLDLL_DefView",
  "Shell_TrayWnd",
  "Shell_SecondaryTrayWnd",
  "TopLevelWindowForOverflowXamlIsland",
]);

// 纯壁纸层：空白区域可拖动窗口
const WALLPAPER_CLASSES = new Set(["WorkerW", "Progman"]);

let cachedWorkerW = null;

function readHwnd(window) {
  const buf = window.getNativeWindowHandle();

  if (buf.length >= 8) {
    return Number(buf.readBigUInt64LE(0));
  }

  return buf.readUInt32LE(0);
}

// 将 Electron 句柄数字、koffi HWND 指针等统一为可比较的数值
function normalizeHwnd(value) {
  if (value == null || value === 0) return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "bigint") return Number(value);
  if (Buffer.isBuffer(value)) {
    if (value.length >= 8) return Number(value.readBigUInt64LE(0));
    return value.readUInt32LE(0);
  }
  try {
    const addr = koffi.address(value);
    if (typeof addr === "bigint") return Number(addr);
    if (typeof addr === "number") return addr;
  } catch {
    // koffi 指针解析失败时视为无效句柄
  }
  return 0;
}

function isSameHwnd(a, b) {
  const left = normalizeHwnd(a);
  const right = normalizeHwnd(b);
  return left !== 0 && left === right;
}

function locateWorkerWWithoutRefresh() {
  let targetWithIcons = null;
  let workerW = FindWindowExW(null, null, "WorkerW", null);

  while (workerW) {
    const shellView = FindWindowExW(workerW, null, "SHELLDLL_DefView", null);
    if (shellView) {
      targetWithIcons = workerW;
      break;
    }
    workerW = FindWindowExW(null, workerW, "WorkerW", null);
  }

  if (targetWithIcons) {
    // 挂到含图标的 WorkerW（壁纸之上），避免落到壁纸后面的 WorkerW 导致完全看不见
    return targetWithIcons;
  }

  workerW = FindWindowExW(null, null, "WorkerW", null);
  while (workerW) {
    const shellView = FindWindowExW(workerW, null, "SHELLDLL_DefView", null);
    if (!shellView) return workerW;
    workerW = FindWindowExW(null, workerW, "WorkerW", null);
  }

  return null;
}

/**
 * 查找桌面 WorkerW（不发送 0x052C，避免 Explorer 刷新壁纸）
 */
function findDesktopWorkerW() {
  const existing = locateWorkerWWithoutRefresh();
  if (existing) {
    cachedWorkerW = existing;
    return existing;
  }

  return cachedWorkerW;
}

function isAttachedToDesktop(window) {
  if (!window || window.isDestroyed()) return false;

  try {
    const hwnd = readHwnd(window);
    const parent = GetParent(hwnd);
    if (!parent) return false;
    if (cachedWorkerW && parent === cachedWorkerW) return true;
    return getWindowClassName(parent) === "WorkerW";
  } catch {
    return false;
  }
}

function setDwmIntAttribute(hwnd, attribute, value) {
  if (!DwmSetWindowAttribute) return;
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(value, 0);
  DwmSetWindowAttribute(hwnd, attribute, buf, 4);
}

function applyWindowStyles(hwnd, refreshFrame) {
  let style = GetWindowLongW(hwnd, GWL_STYLE);
  style &= ~(
    WS_CAPTION |
    WS_THICKFRAME |
    WS_BORDER |
    WS_SYSMENU |
    WS_MINIMIZEBOX |
    WS_MAXIMIZEBOX |
    WS_DLGFRAME
  );
  style |= WS_POPUP;
  SetWindowLongW(hwnd, GWL_STYLE, style);

  let exStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
  exStyle |= WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
  exStyle &= ~WS_EX_APPWINDOW;
  SetWindowLongW(hwnd, GWL_EXSTYLE, exStyle);

  setDwmIntAttribute(hwnd, DWMWA_NCRENDERING_POLICY, DWMNCRP_DISABLED);
  setDwmIntAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND);
  setDwmIntAttribute(hwnd, DWMWA_CAPTION_COLOR, 0);
  setDwmIntAttribute(hwnd, DWMWA_BORDER_COLOR, 0);
  setDwmIntAttribute(hwnd, DWMWA_VISIBLE_FRAME_BORDER_THICKNESS, 0);

  const flags =
    SWP_NOMOVE |
    SWP_NOSIZE |
    SWP_NOZORDER |
    SWP_NOACTIVATE |
    SWP_SHOWWINDOW |
    (refreshFrame ? SWP_FRAMECHANGED : 0);

  SetWindowPos(hwnd, null, 0, 0, 0, 0, flags);
}

function stripWindowChrome(hwnd, refreshFrame = true) {
  applyWindowStyles(hwnd, refreshFrame);
}

function stripChromeForWindow(window, refreshFrame = false) {
  if (!window || window.isDestroyed()) return;
  applyWindowStyles(readHwnd(window), refreshFrame);
}

// 浮窗模式：撤销 stripChrome 写入的样式，避免窗口从任务栏/屏幕消失
function restoreFloatWindowStyles(window) {
  if (!window || window.isDestroyed()) return;
  try {
    const hwnd = readHwnd(window);
    let exStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
    exStyle &= ~(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
    exStyle |= WS_EX_APPWINDOW;
    SetWindowLongW(hwnd, GWL_EXSTYLE, exStyle);
    SetWindowPos(
      hwnd,
      null,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW
    );
  } catch (err) {
    console.error("restore float window styles error:", err.message);
  }
}

function readCursorPos() {
  const buf = Buffer.alloc(8);
  GetCursorPos(buf);
  return { x: buf.readInt32LE(0), y: buf.readInt32LE(4) };
}

function isPrimaryMouseButtonDown() {
  return (GetAsyncKeyState(VK_LBUTTON) & 0x8000) !== 0;
}

function pumpMainThreadMessages() {
  const msg = Buffer.alloc(48);
  let count = 0;
  while (PeekMessageW(msg, null, 0, 0, PM_REMOVE) !== 0) {
    TranslateMessage(msg);
    DispatchMessageW(msg);
    count += 1;
    if (count > 64) break;
  }
}

function isMouseCaptureHeld(hwnd) {
  if (!hwnd) return false;
  try {
    const captureHwnd = GetCapture();
    if (!captureHwnd || normalizeHwnd(captureHwnd) === 0) return false;
    return isSameHwnd(hwnd, captureHwnd);
  } catch {
    return false;
  }
}

function onMouseHook(nCode, wParam, lParam) {
  if (nCode === HC_ACTION && globalLeftButtonUpHandler) {
    if (wParam === WM_LBUTTONDOWN || wParam === WM_LBUTTONUP || wParam === WM_MOUSEMOVE) {
      try {
        globalLeftButtonUpHandler(wParam);
      } catch (err) {
        console.error("global mouse hook handler error:", err.message);
      }
    } else if (wParam === WM_CAPTURECHANGED && !isPrimaryMouseButtonDown()) {
      try {
        globalLeftButtonUpHandler(WM_LBUTTONUP);
      } catch (err) {
        console.error("global mouse hook handler error:", err.message);
      }
    }
  }
  return CallNextHookEx(mouseHookHandle, nCode, wParam, lParam);
}

function installGlobalLeftButtonUpListener(handler) {
  removeGlobalLeftButtonUpListener();
  if (typeof handler !== "function") return false;

  try {
    globalLeftButtonUpHandler = handler;
    mouseHookProc = koffi.register(onMouseHook, koffi.pointer(MouseHookProcType));
    const hMod = GetModuleHandleW(null);
    mouseHookHandle = SetWindowsHookExW(WH_MOUSE_LL, mouseHookProc, hMod, 0);
    return Boolean(mouseHookHandle);
  } catch (err) {
    console.error("install mouse hook failed:", err.message);
    removeGlobalLeftButtonUpListener();
    return false;
  }
}

function removeGlobalLeftButtonUpListener() {
  globalLeftButtonUpHandler = null;
  if (mouseHookHandle) {
    UnhookWindowsHookEx(mouseHookHandle);
    mouseHookHandle = null;
  }
  if (mouseHookProc) {
    koffi.unregister(mouseHookProc);
    mouseHookProc = null;
  }
}

function pointInRect(x, y, rect) {
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

function getWindowClassName(hwnd) {
  if (!hwnd) return "";
  const buf = Buffer.alloc(512);
  const len = GetClassNameW(hwnd, buf, 256);
  if (len <= 0) return "";
  return buf.toString("utf16le", 0, len * 2);
}

function isSameWindowTree(ourHwnd, targetHwnd) {
  if (!ourHwnd || !targetHwnd) return false;
  if (normalizeHwnd(targetHwnd) === 0) return false;
  return isSameHwnd(ourHwnd, targetHwnd);
}

/**
 * 判断空白区域是否应由本窗口接管（拖动），否则穿透到下层应用
 */
function shouldCaptureMouseAtPoint(window, screenX, screenY) {
  if (!window || window.isDestroyed()) return false;

  const ourHwnd = readHwnd(window);
  const rect = readWindowRect(ourHwnd);

  if (!pointInRect(screenX, screenY, rect)) {
    return false;
  }

  const topHwnd = WindowFromPoint(screenX, screenY);
  if (!topHwnd) return true;

  if (isSameWindowTree(ourHwnd, topHwnd)) {
    return true;
  }

  const className = getWindowClassName(topHwnd);

  if (PASS_THROUGH_CLASSES.has(className)) {
    return false;
  }

  if (WALLPAPER_CLASSES.has(className)) {
    return true;
  }

  // 其它应用窗口在上层，穿透点击
  return false;
}

function readWindowRect(hwnd) {
  const buf = Buffer.alloc(16);
  GetWindowRect(hwnd, buf);
  return {
    left: buf.readInt32LE(0),
    top: buf.readInt32LE(4),
    right: buf.readInt32LE(8),
    bottom: buf.readInt32LE(12),
  };
}

function screenPointToParentClient(parent, screenX, screenY) {
  const buf = Buffer.alloc(8);
  buf.writeInt32LE(screenX, 0);
  buf.writeInt32LE(screenY, 4);
  ScreenToClient(parent, buf);
  return { x: buf.readInt32LE(0), y: buf.readInt32LE(4) };
}

function setWindowScreenPosition(hwnd, screenX, screenY) {
  const parent = GetParent(hwnd);
  let x = screenX;
  let y = screenY;

  if (parent) {
    const client = screenPointToParentClient(parent, screenX, screenY);
    x = client.x;
    y = client.y;
  }

  SetWindowPos(
    hwnd,
    null,
    x,
    y,
    0,
    0,
    SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW
  );
}

/**
 * Win32 原生拖动：物理像素坐标，与鼠标 1:1，适配 Win11 桌面层 + 高 DPI
 */
function beginNativeDrag(window) {
  const hwnd = readHwnd(window);
  releaseMouseCaptureForHwnd(hwnd);
  SetCapture(hwnd);
  return {
    hwnd,
    startCursor: readCursorPos(),
    startRect: readWindowRect(hwnd),
  };
}

function updateNativeDrag(state) {
  if (!state?.hwnd) return;

  const cursor = readCursorPos();
  const dx = cursor.x - state.startCursor.x;
  const dy = cursor.y - state.startCursor.y;
  const screenX = state.startRect.left + dx;
  const screenY = state.startRect.top + dy;

  setWindowScreenPosition(state.hwnd, screenX, screenY);
}

function releaseMouseCaptureForHwnd(hwnd) {
  if (!hwnd) return false;
  try {
    const captureHwnd = GetCapture();
    if (!captureHwnd || normalizeHwnd(captureHwnd) === 0) return false;
    if (!isSameHwnd(hwnd, captureHwnd)) {
      return false;
    }
    ReleaseCapture();
    return true;
  } catch {
    // 忽略释放失败
  }
  return false;
}

function getWindowHwnd(window) {
  if (!window || window.isDestroyed()) return null;
  try {
    return readHwnd(window);
  } catch {
    return null;
  }
}

function endNativeDrag(hwnd) {
  releaseMouseCaptureForHwnd(hwnd);
}

function endNativeResize(hwnd) {
  releaseMouseCaptureForHwnd(hwnd);
}

function setWindowScreenBounds(hwnd, screenLeft, screenTop, screenWidth, screenHeight) {
  const parent = GetParent(hwnd);
  let x = screenLeft;
  let y = screenTop;

  if (parent) {
    const client = screenPointToParentClient(parent, screenLeft, screenTop);
    x = client.x;
    y = client.y;
  }

  SetWindowPos(
    hwnd,
    HWND_BOTTOM,
    Math.round(x),
    Math.round(y),
    Math.max(1, Math.round(screenWidth)),
    Math.max(1, Math.round(screenHeight)),
    SWP_NOACTIVATE | SWP_SHOWWINDOW
  );
}

function getNativeEdgeAnchor(rect, edge) {
  const midX = Math.round((rect.left + rect.right) / 2);
  const midY = Math.round((rect.top + rect.bottom) / 2);

  switch (edge) {
    case "left":
      return { x: rect.left, y: midY };
    case "right":
      return { x: rect.right, y: midY };
    case "top":
      return { x: midX, y: rect.top };
    case "bottom":
      return { x: midX, y: rect.bottom };
    case "top-left":
      return { x: rect.left, y: rect.top };
    case "top-right":
      return { x: rect.right, y: rect.top };
    case "bottom-left":
      return { x: rect.left, y: rect.bottom };
    case "bottom-right":
      return { x: rect.right, y: rect.bottom };
    default:
      return { x: midX, y: midY };
  }
}

/**
 * Win32 原生缩放：物理像素坐标，与鼠标 1:1
 */
function beginNativeResize(window, edge) {
  const hwnd = readHwnd(window);
  releaseMouseCaptureForHwnd(hwnd);
  SetCapture(hwnd);
  const startRect = readWindowRect(hwnd);
  const startCursor = readCursorPos();
  const edgeAnchor = getNativeEdgeAnchor(startRect, edge);

  return {
    hwnd,
    edge,
    startRect,
    startCursor,
    edgeAnchor,
    grabOffset: {
      x: startCursor.x - edgeAnchor.x,
      y: startCursor.y - edgeAnchor.y,
    },
  };
}

function getTrackedEdgeNative(state) {
  const cursor = readCursorPos();
  return {
    x: cursor.x - state.grabOffset.x,
    y: cursor.y - state.grabOffset.y,
  };
}

function computeNativeResizeRect(state) {
  const r = state.startRect;
  const edge = getTrackedEdgeNative(state);
  let left = r.left;
  let top = r.top;
  let right = r.right;
  let bottom = r.bottom;

  switch (state.edge) {
    case "left":
      left = edge.x;
      break;
    case "right":
      right = edge.x;
      break;
    case "top":
      top = edge.y;
      break;
    case "bottom":
      bottom = edge.y;
      break;
    case "top-left":
      left = edge.x;
      top = edge.y;
      break;
    case "top-right":
      right = edge.x;
      top = edge.y;
      break;
    case "bottom-left":
      left = edge.x;
      bottom = edge.y;
      break;
    case "bottom-right":
      right = edge.x;
      bottom = edge.y;
      break;
    default:
      return null;
  }

  if (right < left) {
    const swap = left;
    left = right;
    right = swap;
  }
  if (bottom < top) {
    const swap = top;
    top = bottom;
    bottom = swap;
  }

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function ensureNativeResizeCapture(state) {
  if (!state?.hwnd) return;
  try {
    if (!isPrimaryMouseButtonDown()) return;
    if (isMouseCaptureHeld(state.hwnd)) return;
    SetCapture(state.hwnd);
  } catch {
    // 忽略捕获失败
  }
}

function updateNativeResize(state) {
  if (!state?.hwnd) return null;

  const rect = computeNativeResizeRect(state);
  if (!rect || rect.width < 1 || rect.height < 1) return null;

  setWindowScreenBounds(state.hwnd, rect.left, rect.top, rect.width, rect.height);
  return rect;
}

function moveWindow(window, x, y, width, height) {
  if (!window || window.isDestroyed()) return;

  try {
    const hwnd = readHwnd(window);
    SetWindowPos(
      hwnd,
      null,
      x,
      y,
      0,
      0,
      SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW
    );
  } catch {
    window.setBounds({ x, y, width, height });
  }
}

function readNativeWindowScreenRect(window) {
  if (!window || window.isDestroyed()) return null;
  try {
    const rect = readWindowRect(readHwnd(window));
    return {
      left: rect.left,
      top: rect.top,
      width: Math.max(0, rect.right - rect.left),
      height: Math.max(0, rect.bottom - rect.top),
    };
  } catch {
    return null;
  }
}

function detachFromDesktop(window) {
  if (!window || window.isDestroyed()) return false;
  try {
    const hwnd = readHwnd(window);
    SetParent(hwnd, null);
    ShowWindow(hwnd, SW_SHOW);
    return true;
  } catch {
    return false;
  }
}

function attachToDesktop(window, screenBounds = null) {
  if (!window || window.isDestroyed()) return false;

  try {
    const hwnd = readHwnd(window);
    const workerW = findDesktopWorkerW();
    if (!workerW) return false;

    const currentParent = GetParent(hwnd);
    const needsReparent = currentParent !== workerW;
    if (needsReparent) {
      applyWindowStyles(hwnd, false);
      SetParent(hwnd, workerW);
      applyWindowStyles(hwnd, true);
    }

    if (screenBounds) {
      setWindowScreenBounds(
        hwnd,
        screenBounds.left,
        screenBounds.top,
        screenBounds.width,
        screenBounds.height
      );
    } else if (needsReparent) {
      SetWindowPos(
        hwnd,
        null,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW
      );
    }
    ShowWindow(hwnd, SW_SHOW);

    return true;
  } catch (err) {
    console.error("desktop attach failed:", err.message);
    return false;
  }
}

function syncWindowScreenBounds(window, screenBounds) {
  if (!window || window.isDestroyed() || !screenBounds) return false;
  try {
    const hwnd = readHwnd(window);
    setWindowScreenBounds(
      hwnd,
      screenBounds.left,
      screenBounds.top,
      screenBounds.width,
      screenBounds.height
    );
    ShowWindow(hwnd, SW_SHOW);
    return true;
  } catch (err) {
    console.error("sync desktop bounds failed:", err.message);
    return false;
  }
}

function ensureDesktopAttached(window) {
  if (!window || window.isDestroyed()) return false;
  if (isAttachedToDesktop(window)) {
    return true;
  }
  return attachToDesktop(window);
}

module.exports = {
  attachToDesktop,
  ensureDesktopAttached,
  isAttachedToDesktop,
  syncWindowScreenBounds,
  readNativeWindowScreenRect,
  detachFromDesktop,
  moveWindow,
  stripChromeForWindow,
  restoreFloatWindowStyles,
  beginNativeDrag,
  updateNativeDrag,
  endNativeDrag,
  beginNativeResize,
  updateNativeResize,
  endNativeResize,
  getWindowHwnd,
  shouldCaptureMouseAtPoint,
  readCursorPos,
  isPrimaryMouseButtonDown,
  pumpMainThreadMessages,
  isMouseCaptureHeld,
  releaseCaptureForHwnd: releaseMouseCaptureForHwnd,
  ensureNativeResizeCapture,
  installGlobalLeftButtonUpListener,
  removeGlobalLeftButtonUpListener,
};
