/**
 * 天气桌面组件主逻辑
 */

const REFRESH_INTERVAL = 10 * 60 * 1000;

const els = {
  loading: document.getElementById("loading"),
  content: document.getElementById("content"),
  errorPanel: document.getElementById("errorPanel"),
  errorMessage: document.getElementById("errorMessage"),
  cityName: document.getElementById("cityName"),
  updateTime: document.getElementById("updateTime"),
  weatherIcon: document.getElementById("weatherIcon"),
  currentTemp: document.getElementById("currentTemp"),
  weatherDesc: document.getElementById("weatherDesc"),
  feelsLike: document.getElementById("feelsLike"),
  humidity: document.getElementById("humidity"),
  windSpeed: document.getElementById("windSpeed"),
  windDir: document.getElementById("windDir"),
  uvIndex: document.getElementById("uvIndex"),
  rainChance: document.getElementById("rainChance"),
  todayRange: document.getElementById("todayRange"),
  hourlyList: document.getElementById("hourlyList"),
  dailyList: document.getElementById("dailyList"),
  btnRefresh: document.getElementById("btnRefresh"),
  btnRetry: document.getElementById("btnRetry"),
  btnMinimize: document.getElementById("btnMinimize"),
  btnClose: document.getElementById("btnClose"),
  btnLocate: document.getElementById("btnLocate"),
  btnCitySearch: document.getElementById("btnCitySearch"),
  btnSearchFromError: document.getElementById("btnSearchFromError"),
  btnSearchFromLoading: document.getElementById("btnSearchFromLoading"),
  btnCityClose: document.getElementById("btnCityClose"),
  cityPanel: document.getElementById("cityPanel"),
  cityInput: document.getElementById("cityInput"),
  cityResults: document.getElementById("cityResults"),
  widget: document.getElementById("widget"),
  btnMove: document.getElementById("btnMove"),
  compactBar: document.getElementById("compactBar"),
  compactBarDrag: document.getElementById("compactBarDrag"),
  compactIcon: document.getElementById("compactIcon"),
  compactCity: document.getElementById("compactCity"),
  compactTemp: document.getElementById("compactTemp"),
  compactDesc: document.getElementById("compactDesc"),
  btnExpand: document.getElementById("btnExpand"),
  btnCompactClose: document.getElementById("btnCompactClose"),
  verticalBar: document.getElementById("verticalBar"),
  verticalBarDrag: document.getElementById("verticalBarDrag"),
  verticalIcon: document.getElementById("verticalIcon"),
  verticalCity: document.getElementById("verticalCity"),
  verticalTemp: document.getElementById("verticalTemp"),
  verticalDesc: document.getElementById("verticalDesc"),
  btnVerticalExpand: document.getElementById("btnVerticalExpand"),
  btnVerticalClose: document.getElementById("btnVerticalClose"),
};

let refreshTimer = null;
let searchTimer = null;
let currentLocation = null;
let activeLoadId = 0;
let dragState = null;
let windowMode = "normal";
let morphActive = 0;
let liveStripVPreviewHeld = false;
let liveStripHPreviewHeld = false;
let layoutApplyRaf = 0;
let layoutApplyPending = null;

// 与 main.js 保持一致：竖条 140~150、横条 190~200，渐变带宽度 10px
const LAYOUT = {
  STRIP_BAND_SIZE: 10,
  STRIP_V_ENTER: 140,
  STRIP_V_EXIT: 150,
  STRIP_H_ENTER: 190,
  STRIP_H_EXIT: 200,
  STRIP_SHRINK_MIN: 80,
  STRIP_V_SHRINK_MIN: 80,
  STRIP_H_SHRINK_MIN: 80,
  HIT_RING_SIZE: 24,
};

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

// 严格在 enter~exit 的 10px 带内线性渐变，带外立即为 0 或 1
function computeBandMorph(value, enter, exit) {
  if (value >= exit) return 0;
  if (value <= enter) return 1;
  return clamp01((exit - value) / (exit - enter));
}

function isInStripBand(value, enter, exit) {
  return value > enter && value < exit;
}

// 实时缩放时按轴向分别计算渐变，横竖互不干扰
function computeMorphProgress(
  width,
  height,
  mode,
  { livePreview = false, liveAxis = null, stripIntent = null } = {}
) {
  let morphV = 0;
  let morphH = 0;

  if (livePreview && liveAxis === "v") {
    if (width <= LAYOUT.STRIP_V_EXIT) {
      morphV = computeBandMorph(width, LAYOUT.STRIP_V_ENTER, LAYOUT.STRIP_V_EXIT);
    } else if (
      stripIntent?.direction === "expand" &&
      width <= LAYOUT.STRIP_V_EXIT + LAYOUT.STRIP_BAND_SIZE
    ) {
      morphV = 0;
    }
  } else if (livePreview && liveAxis === "h") {
    if (height <= LAYOUT.STRIP_H_EXIT) {
      morphH = computeBandMorph(height, LAYOUT.STRIP_H_ENTER, LAYOUT.STRIP_H_EXIT);
    } else if (
      stripIntent?.direction === "expand" &&
      height <= LAYOUT.STRIP_H_EXIT + LAYOUT.STRIP_BAND_SIZE
    ) {
      morphH = 0;
    }
  } else if (!livePreview) {
    if (mode === "strip-v") morphV = 1;
    if (mode === "strip-h") morphH = 1;
  }

  return { morphV, morphH, morphActive: Math.max(morphV, morphH) };
}

// 实时缩放：按拖动方向区分缩小迟滞与恢复渐变
function resolveStripAxis(sizeWidth, sizeHeight, { stripIntent = null } = {}) {
  if (stripIntent?.direction === "expand") {
    liveStripVPreviewHeld = false;
    liveStripHPreviewHeld = false;
    if (stripIntent.axis === "v") {
      return sizeWidth <= LAYOUT.STRIP_V_EXIT + LAYOUT.STRIP_BAND_SIZE ? "v" : "normal";
    }
    if (stripIntent.axis === "h") {
      return sizeHeight <= LAYOUT.STRIP_H_EXIT + LAYOUT.STRIP_BAND_SIZE ? "h" : "normal";
    }
  }

  if (stripIntent?.direction === "shrink" && stripIntent.axis === "v") {
    if (sizeWidth <= LAYOUT.STRIP_V_EXIT) {
      liveStripVPreviewHeld = true;
    } else if (sizeWidth > LAYOUT.STRIP_V_EXIT + 12) {
      liveStripVPreviewHeld = false;
    }
    liveStripHPreviewHeld = false;
    if (sizeWidth <= LAYOUT.STRIP_V_ENTER || liveStripVPreviewHeld) {
      return "v";
    }
    return "none";
  }

  if (stripIntent?.direction === "shrink" && stripIntent.axis === "h") {
    if (sizeWidth <= LAYOUT.STRIP_V_ENTER) {
      return "none";
    }
    if (sizeHeight <= LAYOUT.STRIP_H_EXIT) {
      liveStripHPreviewHeld = true;
    } else if (sizeHeight > LAYOUT.STRIP_H_EXIT + 12) {
      liveStripHPreviewHeld = false;
    }
    liveStripVPreviewHeld = false;
    if (sizeHeight <= LAYOUT.STRIP_H_ENTER || liveStripHPreviewHeld) {
      return "h";
    }
    return "none";
  }

  return resolveStripAxisFallback(sizeWidth, sizeHeight);
}

// 角拖动等无明确意图时的兜底判定
function resolveStripAxisFallback(sizeWidth, sizeHeight) {
  if (sizeWidth <= LAYOUT.STRIP_V_EXIT) {
    liveStripVPreviewHeld = true;
  } else if (sizeWidth > LAYOUT.STRIP_V_EXIT + 12) {
    liveStripVPreviewHeld = false;
  }

  if (sizeWidth <= LAYOUT.STRIP_V_ENTER || liveStripVPreviewHeld) {
    liveStripHPreviewHeld = false;
    return "v";
  }

  if (sizeWidth > LAYOUT.STRIP_V_ENTER) {
    if (sizeHeight <= LAYOUT.STRIP_H_EXIT) {
      liveStripHPreviewHeld = true;
    } else if (sizeHeight > LAYOUT.STRIP_H_EXIT + 12) {
      liveStripHPreviewHeld = false;
    }
    if (sizeHeight <= LAYOUT.STRIP_H_ENTER || liveStripHPreviewHeld) {
      return "h";
    }
  }

  liveStripHPreviewHeld = false;
  return "none";
}

// 吸附动画：仅在条带/渐变带内启用 morph
function resolveSnapStripAxis(sizeWidth, sizeHeight) {
  if (sizeWidth <= LAYOUT.STRIP_V_EXIT) return "v";
  if (sizeWidth > LAYOUT.STRIP_V_ENTER && sizeHeight <= LAYOUT.STRIP_H_EXIT) return "h";
  return "none";
}

function applyLiveShrinkOutsidePreview(sizeWidth, sizeHeight, layoutMode) {
  clearLiveStripPreviewClasses();
  syncStripLayoutMetrics(sizeWidth, sizeHeight, layoutMode);
}

function applyLiveNormalResizePreview(sizeWidth, sizeHeight) {
  clearLiveStripPreviewClasses();
  els.widget.classList.add("is-normal-resize-preview");
  els.widget.style.setProperty("--morph-v", "0");
  els.widget.style.setProperty("--morph-h", "0");
  els.widget.style.setProperty("--morph-active", "0");
  syncStripLayoutMetrics(sizeWidth, sizeHeight, "normal");
}

function applyInteractiveStripLayout(
  sizeWidth,
  sizeHeight,
  axis,
  layoutMode,
  stripIntent = null
) {
  const isStripAxis = axis === "v" || axis === "h";
  const morphMode = axis === "v" ? "strip-v" : axis === "h" ? "strip-h" : "normal";
  const { morphV, morphH, morphActive: active } = computeMorphProgress(
    sizeWidth,
    sizeHeight,
    morphMode,
    {
      livePreview: isStripAxis,
      liveAxis: isStripAxis ? axis : null,
      stripIntent,
    }
  );

  morphActive = active;
  els.widget.style.setProperty("--morph-v", morphV.toFixed(3));
  els.widget.style.setProperty("--morph-h", morphH.toFixed(3));
  els.widget.style.setProperty("--morph-active", active.toFixed(3));

  if (axis === "v") {
    applyLiveStripVPreview(sizeWidth, sizeHeight);
  } else if (axis === "h") {
    applyLiveStripHPreview(sizeWidth, sizeHeight);
  } else if (axis === "normal") {
    applyLiveNormalResizePreview(sizeWidth, sizeHeight);
  } else {
    applyLiveShrinkOutsidePreview(sizeWidth, sizeHeight, layoutMode);
  }

  syncNarrowHeaderLayout(sizeWidth);
}

function clearLiveStripPreviewClasses() {
  els.widget.classList.remove(
    "strip-v-mode",
    "strip-v-collapsed",
    "strip-full-v",
    "strip-h-mode",
    "strip-h-collapsed",
    "strip-full-h",
    "strip-layout",
    "is-morph-preview",
    "is-normal-resize-preview"
  );
}

function applyLiveStripVPreview(sizeWidth, sizeHeight) {
  els.widget.classList.remove("is-normal-resize-preview");
  els.widget.classList.add("strip-v-mode", "strip-layout", "is-morph-preview");
  els.widget.classList.remove("strip-h-mode", "strip-h-collapsed", "strip-full-h");
  els.widget.classList.toggle(
    "strip-v-collapsed",
    sizeWidth <= LAYOUT.STRIP_SHRINK_MIN + 20
  );
  els.widget.classList.toggle("strip-full-v", sizeWidth <= LAYOUT.STRIP_V_ENTER);
  syncStripView();
  syncStripLayoutMetrics(sizeWidth, sizeHeight, "strip-v");
}

function applyLiveStripHPreview(sizeWidth, sizeHeight) {
  els.widget.classList.remove("is-normal-resize-preview");
  els.widget.classList.add("strip-h-mode", "strip-layout", "is-morph-preview");
  els.widget.classList.remove("strip-v-mode", "strip-v-collapsed", "strip-full-v");
  els.widget.classList.toggle(
    "strip-h-collapsed",
    sizeHeight <= LAYOUT.STRIP_SHRINK_MIN + 20
  );
  els.widget.classList.toggle("strip-full-h", sizeHeight <= LAYOUT.STRIP_H_ENTER);
  syncStripView();
  syncStripLayoutMetrics(sizeWidth, sizeHeight, "normal");
}

function isStripInteractive() {
  return windowMode !== "normal";
}

const MOUSE_CAPTURE_SELECTOR =
  "button, input, .hourly-scroll, .daily-list, .content-scroll, .city-panel:not(.hidden), .float-toolbar, .move-handle, .compact-bar, .compact-toolbar, .vertical-bar, .vertical-toolbar, .resize-edge, .city-results, .error-actions, .loading-search-btn";

const UI_CONTROL_SELECTOR =
  "button, .glass-btn, .float-toolbar, .compact-toolbar, .vertical-toolbar, .move-handle, .city-panel:not(.hidden), input, .hourly-scroll, .daily-list, .city-results, .error-actions, .loading-search-btn, .city-name-btn";

function isUiControlTarget(target) {
  if (!target) return false;
  return Boolean(target.closest(UI_CONTROL_SELECTOR));
}

function isResizeEdgeTarget(target) {
  if (!target) return false;
  return Boolean(target.closest(".resize-edge"));
}

function isNearResizeBand(clientX, clientY) {
  const width = els.widget.clientWidth;
  const height = els.widget.clientHeight;
  const ring = LAYOUT.HIT_RING_SIZE;
  const pad = 6;
  return (
    clientX <= ring + pad ||
    clientY <= ring + pad ||
    clientX >= width - ring - pad ||
    clientY >= height - ring - pad
  );
}

function bindToolbarPointerGuards() {
  [els.compactToolbar, els.verticalToolbar, els.floatToolbar].forEach((toolbar) => {
    if (!toolbar) return;
    toolbar.addEventListener(
      "pointerdown",
      (e) => {
        e.stopPropagation();
      },
      true
    );
  });
}

function isStripMode() {
  return windowMode === "strip-h" || windowMode === "strip-v";
}

// 正常模式下窗口较窄时，顶栏改为两行并收紧内容排版
function syncNarrowHeaderLayout(sizeWidth) {
  const stripOrMorph =
    els.widget.classList.contains("strip-h-mode") ||
    els.widget.classList.contains("strip-v-mode") ||
    els.widget.classList.contains("is-morph-preview");
  const stackHeader =
    !stripOrMorph &&
    sizeWidth <= 400 &&
    sizeWidth >= LAYOUT.STRIP_V_EXIT;
  els.widget.classList.toggle("widget-header-stacked", stackHeader);
}

// 竖条进入缩小模式后锁定高度，仅缩宽度
function syncStripLayoutMetrics(width, height, mode) {
  const ring = LAYOUT.HIT_RING_SIZE;
  const innerW = Math.max(0, (width || els.widget.clientWidth) - ring * 2);

  if (mode !== "strip-v") {
    els.widget.classList.remove("strip-v-ultra");
    els.widget.style.removeProperty("--strip-v-toolbar-space");
    els.widget.style.removeProperty("--strip-v-inner-height");
    return;
  }

  els.widget.style.setProperty("--strip-v-inner-height", `${Math.max(0, (height || els.widget.clientHeight) - ring * 2)}px`);
  els.widget.style.setProperty("--strip-v-toolbar-space", "68px");
  els.widget.classList.toggle("strip-v-ultra", innerW > 0 && innerW < 96);
}

function isMouseCaptureTarget(target) {
  if (!target) return false;
  if (isStripInteractive()) return true;
  return Boolean(target.closest(MOUSE_CAPTURE_SELECTOR));
}

function shortCityLabel(city) {
  if (!city) return "--";
  return city.split(" · ")[0] || city;
}

// 竖条文字：逐字拆成竖排一列
function fillVerticalChars(el, text, maxChars = 12) {
  if (!el) return;
  const chars = [...String(text || "--").trim()].slice(0, maxChars);
  if (!chars.length) {
    el.textContent = "--";
    return;
  }
  el.replaceChildren(
    ...chars.map((ch) => {
      const span = document.createElement("span");
      span.className = "vertical-char";
      span.textContent = ch;
      return span;
    })
  );
}

function syncStripView() {
  const city = shortCityLabel(els.cityName.textContent);
  const temp = `${els.currentTemp.textContent}°C`;
  const tempShort = `${els.currentTemp.textContent}°`;
  const desc = els.weatherDesc.textContent;
  const iconSrc = els.weatherIcon.src;
  const iconAlt = els.weatherIcon.alt;

  if (els.compactBar) {
    els.compactCity.textContent = city;
    els.compactTemp.textContent = temp;
    els.compactDesc.textContent = desc;
    if (iconSrc) {
      els.compactIcon.src = iconSrc;
      els.compactIcon.alt = iconAlt;
    }
  }

  if (els.verticalBar) {
    fillVerticalChars(els.verticalCity, city, 10);
    fillVerticalChars(els.verticalTemp, tempShort.replace(/C$/i, ""), 6);
    fillVerticalChars(els.verticalDesc, desc, 8);
    if (iconSrc) {
      els.verticalIcon.src = iconSrc;
      els.verticalIcon.alt = iconAlt;
    }
  }
}

function applyWindowLayout(payload = {}) {
  const { mode, width, height, stripIntent } = payload;
  const isExpandingFromStrip = els.widget.classList.contains("is-expanding-from-strip");
  const isSnapAnim = els.widget.classList.contains("is-snapping");
  const isLiveResize =
    !isExpandingFromStrip &&
    !isSnapAnim &&
    els.widget.classList.contains("is-resizing");
  const isInteractiveLayout =
    !isExpandingFromStrip && (isLiveResize || isSnapAnim);
  const sizeWidth = width || els.widget.clientWidth;
  const sizeHeight = height || els.widget.clientHeight;
  const layoutMode = isExpandingFromStrip ? "normal" : mode || windowMode;

  if (isInteractiveLayout) {
    windowMode = layoutMode;
    const axis = isLiveResize
      ? resolveStripAxis(sizeWidth, sizeHeight, { stripIntent })
      : resolveSnapStripAxis(sizeWidth, sizeHeight);
    applyInteractiveStripLayout(sizeWidth, sizeHeight, axis, layoutMode, stripIntent);
    return;
  }

  const { morphV, morphH, morphActive: active } = computeMorphProgress(
    sizeWidth,
    sizeHeight,
    layoutMode,
    { livePreview: false }
  );

  morphActive = active;

  if (isExpandingFromStrip) {
    els.widget.style.setProperty("--morph-v", "0");
    els.widget.style.setProperty("--morph-h", "0");
    els.widget.style.setProperty("--morph-active", "0");
  } else {
    els.widget.style.setProperty("--morph-v", morphV.toFixed(3));
    els.widget.style.setProperty("--morph-h", morphH.toFixed(3));
    els.widget.style.setProperty("--morph-active", active.toFixed(3));
  }

  els.widget.classList.remove("is-morph-preview", "is-normal-resize-preview");
  windowMode = layoutMode;

  els.widget.classList.toggle("strip-h-mode", windowMode === "strip-h");
  els.widget.classList.toggle("strip-v-mode", windowMode === "strip-v");
  els.widget.classList.toggle(
    "strip-h-collapsed",
    windowMode === "strip-h" && sizeHeight <= LAYOUT.STRIP_SHRINK_MIN + 20
  );
  els.widget.classList.toggle(
    "strip-v-collapsed",
    windowMode === "strip-v" && sizeWidth <= LAYOUT.STRIP_SHRINK_MIN + 20
  );
  els.widget.classList.toggle("strip-layout", isStripInteractive());
  els.widget.classList.toggle(
    "strip-full-h",
    windowMode === "strip-h" && sizeHeight <= LAYOUT.STRIP_H_ENTER
  );
  els.widget.classList.toggle(
    "strip-full-v",
    windowMode === "strip-v" && sizeWidth <= LAYOUT.STRIP_V_ENTER
  );

  if (windowMode === "strip-h") {
    syncStripView();
  }
  if (windowMode === "strip-v") {
    syncStripView();
  }

  syncNarrowHeaderLayout(sizeWidth);
  syncStripLayoutMetrics(sizeWidth, sizeHeight, windowMode);

  if (isStripInteractive()) {
    window.widgetApi?.updateMouseHit?.({ forceCapture: true });
  } else {
    window.widgetApi?.updateMouseHit?.({ interactive: false });
  }
}

async function expandFromStrip() {
  if (!window.widgetApi?.setWindowMode) return;
  if (!isStripMode()) return;
  await window.widgetApi.setWindowMode("normal");
}

function scheduleApplyWindowLayout(payload) {
  layoutApplyPending = payload;
  if (layoutApplyRaf) return;
  layoutApplyRaf = requestAnimationFrame(() => {
    layoutApplyRaf = 0;
    const next = layoutApplyPending;
    layoutApplyPending = null;
    if (next) {
      applyWindowLayout(next);
    }
  });
}

function setupWindowLayout() {
  if (!window.widgetApi?.onWindowLayoutChanged) return;

  window.widgetApi.onWindowLayoutChanged((payload) => {
    if (els.widget.classList.contains("is-resizing")) {
      scheduleApplyWindowLayout(payload);
      return;
    }
    applyWindowLayout(payload);
  });

  window.widgetApi.onWindowSnapChanged?.(({ active }) => {
    els.widget.classList.toggle("is-snapping", Boolean(active));
  });

  window.widgetApi.onWindowModeChanged?.((payload) => {
    if (payload?.mode) {
      applyWindowLayout(payload);
    }
  });

  els.btnExpand?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    expandFromStrip();
  });

  els.compactBarDrag?.addEventListener("dblclick", (e) => {
    if (windowMode !== "strip-h") return;
    if (e.target.closest(".compact-toolbar")) return;
    e.preventDefault();
    e.stopPropagation();
    expandFromStrip();
  });

  els.btnCompactClose?.addEventListener("click", (e) => {
    e.stopPropagation();
    window.widgetApi?.close();
  });

  els.btnVerticalExpand?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    expandFromStrip();
  });

  els.verticalBarDrag?.addEventListener("dblclick", (e) => {
    if (windowMode !== "strip-v") return;
    if (e.target.closest(".vertical-toolbar")) return;
    e.preventDefault();
    e.stopPropagation();
    expandFromStrip();
  });

  els.btnVerticalClose?.addEventListener("click", (e) => {
    e.stopPropagation();
    window.widgetApi?.close();
  });

  if (window.widgetApi.getWindowBounds) {
    window.widgetApi.getWindowBounds().then((payload) => {
      applyWindowLayout(payload);
    });
  }
}

function showLoading() {
  els.loading.classList.remove("hidden");
  els.content.classList.add("hidden");
  els.errorPanel.classList.add("hidden");
}

function showContent() {
  els.loading.classList.add("hidden");
  els.content.classList.remove("hidden");
  els.errorPanel.classList.add("hidden");
}

function showError(message) {
  els.loading.classList.add("hidden");
  els.content.classList.add("hidden");
  els.errorPanel.classList.remove("hidden");
  els.errorMessage.textContent = message;
}

function renderCurrent(data, city) {
  const current = data.current;
  const isDay = current.is_day === 1;
  const code = current.weather_code;

  els.cityName.textContent = city;
  els.updateTime.textContent = formatUpdateTime(new Date());
  els.currentTemp.textContent = Math.round(current.temperature_2m);
  els.weatherDesc.textContent = getWeatherDescription(code);
  els.feelsLike.textContent = Math.round(current.apparent_temperature);
  els.humidity.textContent = `${current.relative_humidity_2m}%`;
  els.windSpeed.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  els.windDir.textContent = formatWindDirection(current.wind_direction_10m);

  const todayMax = Math.round(data.daily.temperature_2m_max[0]);
  const todayMin = Math.round(data.daily.temperature_2m_min[0]);
  els.todayRange.textContent = `${todayMax}° / ${todayMin}°`;

  const uv = data.daily.uv_index_max[0];
  els.uvIndex.textContent = uv !== undefined ? Math.round(uv) : "--";

  const rain = data.daily.precipitation_probability_max[0];
  els.rainChance.textContent = rain !== undefined ? `${rain}%` : "--";

  els.weatherIcon.src = getWeatherIconSrc(code, isDay);
  els.weatherIcon.alt = getWeatherDescription(code);
  syncStripView();
}

function renderHourly(data) {
  const times = data.hourly.time;
  const temps = data.hourly.temperature_2m;
  const codes = data.hourly.weather_code;
  const isDayList = data.hourly.is_day;
  const now = Date.now();

  let startIndex = 0;
  for (let i = 0; i < times.length; i++) {
    if (new Date(times[i]).getTime() >= now) {
      startIndex = i;
      break;
    }
  }

  const items = [];
  for (let i = startIndex; i < startIndex + 12 && i < times.length; i++) {
    const isDay = isDayList[i] === 1;
    const isFirst = i === startIndex;

    items.push(`
      <div class="hourly-item${isFirst ? " now" : ""}">
        <span class="hourly-time">${formatHour(times[i], isFirst)}</span>
        <img class="hourly-icon" src="${getWeatherIconSrc(codes[i], isDay)}" alt="">
        <span class="hourly-temp">${Math.round(temps[i])}°</span>
      </div>
    `);
  }

  els.hourlyList.innerHTML = items.join("");
}

function renderDaily(data) {
  const days = data.daily.time;
  const maxTemps = data.daily.temperature_2m_max;
  const minTemps = data.daily.temperature_2m_min;
  const codes = data.daily.weather_code;
  const rainProbs = data.daily.precipitation_probability_max;

  const items = [];
  for (let i = 0; i < days.length; i++) {
    items.push(`
      <div class="daily-item">
        <div class="daily-left">
          <span class="daily-day">${formatWeekday(days[i])}</span>
          <span class="daily-desc">${getWeatherDescription(codes[i])}</span>
        </div>
        <img class="daily-icon" src="${getWeatherIconSrc(codes[i], true)}" alt="">
        <div class="daily-right">
          <div class="daily-temps">
            <span class="daily-high">${Math.round(maxTemps[i])}°</span>
            <span class="daily-low">${Math.round(minTemps[i])}°</span>
          </div>
          <span class="daily-rain">${rainProbs[i]}%</span>
        </div>
      </div>
    `);
  }

  els.dailyList.innerHTML = items.join("");
}

function isStale(loadId) {
  return loadId !== activeLoadId;
}

async function resolveLocationFromGeo() {
  try {
    const geo = await getGeolocation();
    const city = await reverseGeocode(geo.lat, geo.lon);
    const location = { lat: geo.lat, lon: geo.lon, city, source: "geo" };
    saveLocation(location);
    return location;
  } catch {
    if (window.widgetApi?.getLocationByIp) {
      const ipLoc = await window.widgetApi.getLocationByIp();
      if (ipLoc?.ok) {
        const location = {
          lat: ipLoc.lat,
          lon: ipLoc.lon,
          city: ipLoc.city,
          source: "ip",
        };
        saveLocation(location);
        return location;
      }
    }
    throw new Error(window.I18n?.t("error.needSearchOrGeo") || "请搜索城市或开启系统定位");
  }
}

async function loadWeather(options = {}) {
  const loadId = ++activeLoadId;
  const hasContent = !els.content.classList.contains("hidden");

  if (!hasContent && !options.keepCityPanel) {
    showLoading();
  }

  els.widget.classList.add("refreshing");

  try {
    let location;

    if (options.lat && options.lon) {
      location = {
        lat: options.lat,
        lon: options.lon,
        city: options.city,
        source: "search",
      };
      saveLocation(location);
    } else if (options.useGeo) {
      location = await resolveLocationFromGeo();
    } else if (currentLocation && !options.useGeo) {
      location = currentLocation;
    } else {
      const saved = loadSavedLocation();
      if (saved) {
        location = saved;
      } else if (options.tryGeo) {
        location = await resolveLocationFromGeo();
      } else {
        throw new Error(window.I18n?.t("error.needSearch") || "请搜索城市");
      }
    }

    if (isStale(loadId)) return;

    currentLocation = location;
    const data = await fetchWeather(location.lat, location.lon);

    if (isStale(loadId)) return;

    const city = location.city || (await reverseGeocode(location.lat, location.lon));

    if (isStale(loadId)) return;

    renderCurrent(data, city);
    renderHourly(data);
    renderDaily(data);
    showContent();
    closeCityPanel();
  } catch (err) {
    if (isStale(loadId)) return;

    const message = err.message || window.I18n?.t("error.default") || "无法获取天气数据";

    if (hasContent) {
      els.updateTime.textContent = message;
    } else {
      showError(message);
    }
  } finally {
    if (!isStale(loadId)) {
      els.widget.classList.remove("refreshing");
    }
  }
}

function openCityPanel() {
  els.cityPanel.classList.remove("hidden");
  window.widgetApi?.setFocusable?.(true);
  window.widgetApi?.updateMouseHit?.({ forceCapture: true });
  requestAnimationFrame(() => {
    els.cityInput.focus();
  });
}

function closeCityPanel() {
  els.cityPanel.classList.add("hidden");
  els.cityResults.innerHTML = "";
  els.cityInput.value = "";
  window.widgetApi?.setFocusable?.(false);
  window.widgetApi?.updateMouseHit?.({ interactive: false });
}

async function handleCitySearch(keyword) {
  const trimmed = keyword.trim();
  if (trimmed.length < 1) {
    els.cityResults.innerHTML = "";
    return;
  }

  els.cityResults.innerHTML = `<p class="city-result-empty">${window.I18n?.t("city.searching") || "搜索中..."}</p>`;

  try {
    const results = await searchCity(trimmed);
    els.cityResults.innerHTML = results
      .map(
        (item, index) => `
          <button class="city-result-item" type="button" data-index="${index}">
            <span class="city-result-name">${item.name}</span>
            <span class="city-result-meta">${[item.admin1, item.country].filter(Boolean).join(" · ")}</span>
          </button>
        `
      )
      .join("");

    els.cityResults.querySelectorAll(".city-result-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = results[Number(btn.dataset.index)];
        loadWeather({
          lat: item.lat,
          lon: item.lon,
          city: item.label,
        });
      });
    });
  } catch (err) {
    els.cityResults.innerHTML = `<p class="city-result-empty">${err.message}</p>`;
  }
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (currentLocation) loadWeather();
  }, REFRESH_INTERVAL);
}

const DRAG_THRESHOLD = 6;
const RESIZE_DRAG_THRESHOLD = 6;
let nextResizeSessionId = 0;
let mouseHitTimer = null;
let resizeDragState = null;
let resizePointerWatchTimer = null;
let resizeEndInFlight = false;
let resizePointerWatchBusy = false;
let rendererHygieneTimer = null;

function sweepRendererOrphanResizeState() {
  if (resizeDragState || resizeEndInFlight) return;
  if (
    !els.widget.classList.contains("is-resizing") &&
    !els.widget.classList.contains("is-resize-armed")
  ) {
    return;
  }
  els.widget.classList.remove("is-resize-armed", "is-resizing");
  window.widgetApi?.ensureResizeEnded?.();
}

function startRendererPointerHygiene() {
  if (rendererHygieneTimer || !window.widgetApi?.isPrimaryButtonDown) return;
  rendererHygieneTimer = setInterval(() => {
    if (resizeDragState) {
      if (resizePointerWatchBusy) return;
      resizePointerWatchBusy = true;
      window.widgetApi
        .isPrimaryButtonDown()
        .then((down) => {
          if (!down && resizeDragState) {
            endResizeSession();
            return;
          }
          if (!down) {
            sweepRendererOrphanResizeState();
          }
        })
        .finally(() => {
          resizePointerWatchBusy = false;
        });
      return;
    }
    sweepRendererOrphanResizeState();
  }, 16);
}

function stopResizePointerWatch() {
  if (!resizePointerWatchTimer) return;
  clearInterval(resizePointerWatchTimer);
  resizePointerWatchTimer = null;
}

function startResizePointerWatch() {
  stopResizePointerWatch();
  startRendererPointerHygiene();
}

function clearResizeDragState() {
  if (!resizeDragState) return;
  stopResizePointerWatch();
  unbindGlobalResizeListeners();
  if (
    resizeDragState.captureTarget &&
    resizeDragState.pointerId != null &&
    resizeDragState.captureTarget.releasePointerCapture
  ) {
    try {
      resizeDragState.captureTarget.releasePointerCapture(resizeDragState.pointerId);
    } catch {
      // 忽略释放失败
    }
  }
  els.widget.classList.remove("is-resize-armed", "is-resizing");
  liveStripVPreviewHeld = false;
  liveStripHPreviewHeld = false;
  resizeDragState = null;
}

function finishResizeLayoutRefresh() {
  if (!window.widgetApi?.getWindowBounds) return;
  return window.widgetApi.getWindowBounds().then((payload) => {
    applyWindowLayout(payload);
  });
}

async function endResizeSession() {
  if (!resizeDragState || resizeEndInFlight) return;
  resizeEndInFlight = true;
  const wasActive = resizeDragState.active;

  try {
    if (wasActive && window.widgetApi?.resizeEnd) {
      const payload = await window.widgetApi.resizeEnd();
      if (payload) {
        applyWindowLayout(payload);
      }
    } else {
      await window.widgetApi?.ensureResizeEnded?.();
    }
  } finally {
    resizeEndInFlight = false;
    clearResizeDragState();
  }
}

function tryActivateResize(e) {
  if (!resizeDragState || resizeDragState.active || !resizeDragState.holdReady) return false;

  const dx = e.screenX - resizeDragState.startX;
  const dy = e.screenY - resizeDragState.startY;
  if (Math.hypot(dx, dy) < RESIZE_DRAG_THRESHOLD) return false;

  resizeDragState.active = true;
  els.widget.classList.remove("is-resize-armed");
  els.widget.classList.add("is-resizing");
  bindGlobalResizeListeners();
  const sessionId = ++nextResizeSessionId;
  resizeDragState.sessionId = sessionId;
  window.widgetApi.resizeStart({
    edge: resizeDragState.edge,
    sessionId,
  });
  return true;
}

function onGlobalResizePointerMove(e) {
  if (!resizeDragState) return;
  if (resizeDragState.pointerId != null && e.pointerId !== resizeDragState.pointerId) return;

  if (resizeDragState.active && e.buttons === 0) {
    endResizeSession();
    return;
  }

  if (!resizeDragState.active) {
    if (!tryActivateResize(e)) return;
  }

  window.widgetApi.resizeMove({
    buttons: e.buttons,
    sessionId: resizeDragState.sessionId,
  });
}

function onGlobalResizeMouseMove(e) {
  if (!resizeDragState?.active) return;
  if (e.buttons === 0) {
    endResizeSession();
  }
}

function onGlobalResizePointerUp(e) {
  if (!resizeDragState) return;
  if (resizeDragState.pointerId != null && e.pointerId !== resizeDragState.pointerId) return;
  endResizeSession();
}

function bindGlobalResizeListeners() {
  if (resizeDragState?.globalBound) return;
  document.addEventListener("pointermove", onGlobalResizePointerMove, true);
  document.addEventListener("pointerup", onGlobalResizePointerUp, true);
  document.addEventListener("pointercancel", onGlobalResizePointerUp, true);
  document.addEventListener("mousemove", onGlobalResizeMouseMove, true);
  document.addEventListener("mouseup", endResizeSession, true);
  if (resizeDragState) {
    resizeDragState.globalBound = true;
  }
}

function unbindGlobalResizeListeners() {
  document.removeEventListener("pointermove", onGlobalResizePointerMove, true);
  document.removeEventListener("pointerup", onGlobalResizePointerUp, true);
  document.removeEventListener("pointercancel", onGlobalResizePointerUp, true);
  document.removeEventListener("mousemove", onGlobalResizeMouseMove, true);
  document.removeEventListener("mouseup", endResizeSession, true);
  if (resizeDragState) {
    resizeDragState.globalBound = false;
  }
}

function setupWindowResize() {
  if (!window.widgetApi?.resizeStart) return;

  startRendererPointerHygiene();

  const edges = document.querySelectorAll(".resize-edge");
  if (!edges.length) return;

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (isUiControlTarget(e.target)) return;
    if (!isNearResizeBand(e.clientX, e.clientY)) return;
    const edge = e.currentTarget.dataset.edge;
    if (!edge) return;
    e.preventDefault();
    e.stopPropagation();

    clearResizeDragState();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 忽略捕获失败
    }

    els.widget.classList.add("is-resize-armed");

    resizeDragState = {
      edge,
      pointerId: e.pointerId,
      captureTarget: e.currentTarget,
      startX: e.screenX,
      startY: e.screenY,
      active: false,
      holdReady: true,
      sessionId: 0,
      globalBound: false,
    };

    bindGlobalResizeListeners();
    startResizePointerWatch();
  };

  const onPointerMove = (e) => {
    onGlobalResizePointerMove(e);
  };

  edges.forEach((edgeEl) => {
    edgeEl.addEventListener("pointerdown", onPointerDown);
    edgeEl.addEventListener("pointermove", onPointerMove);
    edgeEl.addEventListener("pointerup", endResizeSession);
    edgeEl.addEventListener("pointercancel", endResizeSession);
    edgeEl.addEventListener("lostpointercapture", (e) => {
      if (!resizeDragState || resizeDragState.pointerId !== e.pointerId) return;
      if (!resizeDragState.active) {
        endResizeSession();
        return;
      }
      window.widgetApi?.isPrimaryButtonDown?.().then((down) => {
        if (!down) {
          endResizeSession();
        }
      });
    });
  });

  window.addEventListener("blur", endResizeSession);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      endResizeSession();
    }
  });

  window.widgetApi.onWindowResizeCancelled?.(() => {
    if (resizeDragState) {
      endResizeSession();
      return;
    }
    sweepRendererOrphanResizeState();
  });
}

function setupMousePassThrough() {
  if (!window.widgetApi?.updateMouseHit) return;

  const scheduleMouseHit = (interactive) => {
    if (mouseHitTimer) return;
    mouseHitTimer = setTimeout(() => {
      mouseHitTimer = null;
      window.widgetApi.updateMouseHit({ interactive });
    }, 16);
  };

  document.addEventListener("mousemove", (e) => {
    scheduleMouseHit(isMouseCaptureTarget(e.target));
  });

  document.addEventListener("mouseleave", () => {
    window.widgetApi.updateMouseHit({ release: true });
  });

  // 点击非缩放热区时，强制结束可能泄漏的 Resize 会话
  document.addEventListener(
    "mousedown",
    (e) => {
      if (e.button !== 0) return;
      if (isResizeEdgeTarget(e.target) && isNearResizeBand(e.clientX, e.clientY)) return;
      if (resizeDragState) {
        endResizeSession();
        return;
      }
      window.widgetApi?.ensureResizeEnded?.();
    },
    true
  );
}

function setupWindowDrag() {
  if (!window.widgetApi) return;

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    if (isResizeEdgeTarget(e.target)) return;
    if (resizeDragState) return;

    const dragRoot = e.currentTarget;
    const isMoveButton = dragRoot === els.btnMove;
    const isBarDrag = dragRoot === els.compactBarDrag || dragRoot === els.verticalBarDrag;

    if (isBarDrag && isNearResizeBand(e.clientX, e.clientY)) return;

    if (!isMoveButton) {
      if (isUiControlTarget(e.target)) return;
      if (e.target.closest(".compact-toolbar")) return;
      if (e.target.closest(".vertical-toolbar")) return;
    }

    e.preventDefault();

    dragState = {
      startX: e.screenX,
      startY: e.screenY,
      active: false,
    };
  };

  const onMouseMove = (e) => {
    if (!dragState) return;

    if (dragState.active && e.buttons === 0) {
      onMouseUp();
      return;
    }

    const dx = e.screenX - dragState.startX;
    const dy = e.screenY - dragState.startY;

    if (!dragState.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragState.active = true;
      els.widget.classList.add("is-dragging");
      window.widgetApi.dragStart();
    }

    window.widgetApi.dragMove({ buttons: e.buttons });
  };

  const onMouseUp = () => {
    if (!dragState) return;
    if (dragState.active) {
      els.widget.classList.remove("is-dragging");
      window.widgetApi.dragEnd();
    }
    dragState = null;
  };

  if (els.btnMove) {
    els.btnMove.addEventListener("mousedown", onMouseDown);
  }
  if (els.compactBarDrag) {
    els.compactBarDrag.addEventListener("mousedown", onMouseDown);
  }
  if (els.verticalBarDrag) {
    els.verticalBarDrag.addEventListener("mousedown", onMouseDown);
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mouseup", onMouseUp, true);
  window.addEventListener("blur", onMouseUp);

  window.widgetApi.onWindowDragCancelled?.(() => {
    if (!dragState) return;
    if (dragState.active) {
      els.widget.classList.remove("is-dragging");
    }
    dragState = null;
  });
}

els.btnRefresh.addEventListener("click", () => loadWeather());
els.btnRetry.addEventListener("click", () => loadWeather({ useGeo: true }));
els.btnLocate.addEventListener("click", () => loadWeather({ useGeo: true }));
els.btnCitySearch.addEventListener("click", openCityPanel);
els.btnSearchFromError.addEventListener("click", openCityPanel);
els.btnSearchFromLoading.addEventListener("click", openCityPanel);
els.cityName.addEventListener("click", openCityPanel);
els.btnCityClose.addEventListener("click", closeCityPanel);

els.cityInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => handleCitySearch(els.cityInput.value), 350);
});

els.cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    clearTimeout(searchTimer);
    handleCitySearch(els.cityInput.value);
  }
});

if (window.widgetApi) {
  els.btnMinimize.addEventListener("click", () => window.widgetApi.minimize());
  els.btnClose.addEventListener("click", () => window.widgetApi.close());
}

function applyDisplayScale(info) {
  if (!info?.scaleFactor) return;
  document.documentElement.style.setProperty("--display-scale", String(info.scaleFactor));
  document.documentElement.dataset.scale = String(info.scaleFactor);
  if (info.hardwareAccelerationDisabled) {
    document.documentElement.classList.add("software-render");
  } else {
    document.documentElement.classList.remove("software-render");
  }
  if (info.system?.isWin11) {
    document.documentElement.dataset.os = "win11";
  } else if (info.system?.isWin10) {
    document.documentElement.dataset.os = "win10";
  }
}

async function initI18nAndDisplay() {
  let electronLocale = null;
  if (window.widgetApi?.getDisplayInfo) {
    const info = await window.widgetApi.getDisplayInfo();
    electronLocale = info.uiLocale;
    applyDisplayScale(info);
    window.widgetApi.onDisplayMetricsChanged?.(applyDisplayScale);
  }
  if (window.I18n) {
    window.I18n.init({ forcedLocale: electronLocale, electronLocale });
  }
}

async function bootstrap() {
  await initI18nAndDisplay();
  setupWindowDrag();
  setupWindowResize();
  setupMousePassThrough();
  bindToolbarPointerGuards();
  setupWindowLayout();
  currentLocation = loadSavedLocation();

  if (currentLocation) {
    loadWeather();
  } else {
    showError(window.I18n?.t("error.needSearch") || "请搜索城市获取天气");
    openCityPanel();
  }

  startAutoRefresh();
}

bootstrap();
