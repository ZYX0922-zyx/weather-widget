const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("widgetApi", {
  minimize: () => ipcRenderer.send("window-minimize"),
  close: () => ipcRenderer.send("window-close"),
  getLocationByIp: () => ipcRenderer.invoke("get-location-by-ip"),
  getDisplayInfo: () => ipcRenderer.invoke("get-display-info"),
  onDisplayMetricsChanged: (handler) => {
    ipcRenderer.on("display-metrics-changed", (_event, info) => handler(info));
  },
  getPosition: () => ipcRenderer.invoke("window-get-position"),
  dragStart: () => ipcRenderer.send("window-drag-start"),
  dragMove: (payload) => ipcRenderer.send("window-drag-move", payload),
  dragEnd: () => ipcRenderer.send("window-drag-end"),
  updateMouseHit: (payload) => ipcRenderer.send("window-mouse-hit", payload),
  setFocusable: (focusable) => ipcRenderer.send("window-set-focusable", focusable),
  setWindowMode: (mode) => ipcRenderer.invoke("window-set-mode", mode),
  getWindowBounds: () => ipcRenderer.invoke("window-get-bounds"),
  onWindowModeChanged: (handler) => {
    ipcRenderer.on("window-mode-changed", (_event, payload) => handler(payload));
  },
  onWindowLayoutChanged: (handler) => {
    ipcRenderer.on("window-layout-changed", (_event, payload) => handler(payload));
  },
  onWindowSnapChanged: (handler) => {
    ipcRenderer.on("window-snap-changed", (_event, payload) => handler(payload));
  },
  resizeStart: (payload) => ipcRenderer.send("window-resize-start", payload),
  resizeMove: (payload) => ipcRenderer.send("window-resize-move", payload),
  resizeEnd: () => ipcRenderer.invoke("window-resize-end"),
  ensureResizeEnded: () => ipcRenderer.invoke("window-ensure-resize-ended"),
  isPrimaryButtonDown: () => ipcRenderer.invoke("is-primary-button-down"),
  onWindowResizeCancelled: (handler) => {
    ipcRenderer.on("window-resize-cancelled", () => handler());
  },
  onWindowDragCancelled: (handler) => {
    ipcRenderer.on("window-drag-cancelled", () => handler());
  },
});
