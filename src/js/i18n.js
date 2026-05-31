/**
 * UI 多语言：英文 / 简体中文，跟随系统或 WIDGET_LANG
 */
(function () {
  const LOCALES = {
    en: {
      "app.title": "天气组件",
      "btn.searchCity": "Search city",
      "btn.locate": "Locate",
      "btn.refresh": "Refresh",
      "btn.hide": "Hide",
      "btn.close": "Close",
      "btn.expand": "Expand",
      "btn.move": "Drag to move",
      "btn.moveHint": "Drag here to move",
      "loading.text": "Loading weather...",
      "loading.searchCity": "Search city",
      "error.default": "Unable to fetch weather data",
      "error.retryLocate": "Retry location",
      "error.searchCity": "Search city",
      "error.needSearch": "Search for a city to get weather",
      "error.needSearchOrGeo": "Search for a city or enable system location",
      "error.fetchFailed": "Weather API request failed",
      "error.searchFailed": "City search failed",
      "error.searchEmpty": "No matching city. Try another keyword.",
      "error.geoUnsupported": "Geolocation is not supported",
      "city.panelTitle": "Search city",
      "city.placeholder": "Enter city name, e.g. London, Tokyo",
      "city.searching": "Searching...",
      "stat.humidity": "Humidity",
      "stat.windSpeed": "Wind",
      "stat.windDir": "Direction",
      "stat.uv": "UV index",
      "stat.rain": "Rain chance",
      "stat.todayRange": "Today",
      "panel.hourly": "Hourly",
      "panel.daily": "Next 7 days",
      "feelsLike": "Feels like",
      "updatedAt": "Updated at {time}",
      "day.today": "Today",
      "day.tomorrow": "Tomorrow",
      "day.dayAfter": "Day after",
      "hour.now": "Now",
      "weather.unknown": "Unknown",
      "wmo.0": "Clear",
      "wmo.1": "Mainly clear",
      "wmo.2": "Partly cloudy",
      "wmo.3": "Overcast",
      "wmo.45": "Fog",
      "wmo.48": "Depositing rime fog",
      "wmo.51": "Light drizzle",
      "wmo.53": "Drizzle",
      "wmo.55": "Heavy drizzle",
      "wmo.56": "Freezing drizzle",
      "wmo.57": "Heavy freezing drizzle",
      "wmo.61": "Light rain",
      "wmo.63": "Rain",
      "wmo.65": "Heavy rain",
      "wmo.66": "Freezing rain",
      "wmo.67": "Heavy freezing rain",
      "wmo.71": "Light snow",
      "wmo.73": "Snow",
      "wmo.75": "Heavy snow",
      "wmo.77": "Snow grains",
      "wmo.80": "Light showers",
      "wmo.81": "Showers",
      "wmo.82": "Heavy showers",
      "wmo.85": "Light snow showers",
      "wmo.86": "Heavy snow showers",
      "wmo.95": "Thunderstorm",
      "wmo.96": "Thunderstorm with hail",
      "wmo.99": "Thunderstorm with heavy hail",
      "wind.N": "N",
      "wind.NE": "NE",
      "wind.E": "E",
      "wind.SE": "SE",
      "wind.S": "S",
      "wind.SW": "SW",
      "wind.W": "W",
      "wind.NW": "NW",
      "week.0": "Sun",
      "week.1": "Mon",
      "week.2": "Tue",
      "week.3": "Wed",
      "week.4": "Thu",
      "week.5": "Fri",
      "week.6": "Sat",
    },
    "zh-CN": {
      "app.title": "天气组件",
      "btn.searchCity": "搜索城市",
      "btn.locate": "定位",
      "btn.refresh": "刷新",
      "btn.hide": "隐藏",
      "btn.close": "关闭",
      "btn.expand": "放大",
      "btn.move": "按住拖动窗口",
      "btn.moveHint": "按住此处移动",
      "loading.text": "正在获取天气...",
      "loading.searchCity": "搜索城市",
      "error.default": "无法获取天气数据",
      "error.retryLocate": "定位重试",
      "error.searchCity": "搜索城市",
      "error.needSearch": "请搜索城市获取天气",
      "error.needSearchOrGeo": "请搜索城市或开启系统定位",
      "error.fetchFailed": "天气 API 请求失败",
      "error.searchFailed": "城市搜索失败",
      "error.searchEmpty": "未找到匹配城市，请换个关键词",
      "error.geoUnsupported": "当前环境不支持定位",
      "city.panelTitle": "搜索城市",
      "city.placeholder": "输入城市名，如：北京、上海",
      "city.searching": "搜索中...",
      "stat.humidity": "湿度",
      "stat.windSpeed": "风速",
      "stat.windDir": "风向",
      "stat.uv": "紫外线",
      "stat.rain": "降水概率",
      "stat.todayRange": "今日温度",
      "panel.hourly": "逐小时",
      "panel.daily": "未来 7 天",
      "feelsLike": "体感",
      "updatedAt": "更新于 {time}",
      "day.today": "今天",
      "day.tomorrow": "明天",
      "day.dayAfter": "后天",
      "hour.now": "现在",
      "weather.unknown": "未知",
      "wmo.0": "晴朗",
      "wmo.1": "大部晴朗",
      "wmo.2": "局部多云",
      "wmo.3": "阴天",
      "wmo.45": "雾",
      "wmo.48": "雾凇",
      "wmo.51": "小毛毛雨",
      "wmo.53": "毛毛雨",
      "wmo.55": "大毛毛雨",
      "wmo.56": "冻毛毛雨",
      "wmo.57": "强冻毛毛雨",
      "wmo.61": "小雨",
      "wmo.63": "中雨",
      "wmo.65": "大雨",
      "wmo.66": "冻雨",
      "wmo.67": "强冻雨",
      "wmo.71": "小雪",
      "wmo.73": "中雪",
      "wmo.75": "大雪",
      "wmo.77": "雪粒",
      "wmo.80": "小阵雨",
      "wmo.81": "阵雨",
      "wmo.82": "大阵雨",
      "wmo.85": "小阵雪",
      "wmo.86": "大阵雪",
      "wmo.95": "雷暴",
      "wmo.96": "雷暴伴小冰雹",
      "wmo.99": "雷暴伴大冰雹",
      "wind.N": "北",
      "wind.NE": "东北",
      "wind.E": "东",
      "wind.SE": "东南",
      "wind.S": "南",
      "wind.SW": "西南",
      "wind.W": "西",
      "wind.NW": "西北",
      "week.0": "周日",
      "week.1": "周一",
      "week.2": "周二",
      "week.3": "周三",
      "week.4": "周四",
      "week.5": "周五",
      "week.6": "周六",
    },
  };

  let activeLocale = "zh-CN";
  let messages = LOCALES["zh-CN"];

  function normalizeLocale(value) {
    if (!value) return "en";
    const tag = String(value).trim().replace(/_/g, "-");
    if (tag.toLowerCase().startsWith("zh")) return "zh-CN";
    return "en";
  }

  function resolveLocale(candidates) {
    for (const item of candidates) {
      const locale = normalizeLocale(item);
      if (LOCALES[locale]) return locale;
    }
    return "en";
  }

  function t(key, params) {
    let text = messages[key] ?? LOCALES.en[key] ?? key;
    if (params && typeof params === "object") {
      Object.keys(params).forEach((name) => {
        text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(params[name]));
      });
    }
    return text;
  }

  function getApiLanguage() {
    return activeLocale === "zh-CN" ? "zh" : "en";
  }

  function getReverseGeoLanguage() {
    return activeLocale === "zh-CN" ? "zh" : "en";
  }

  function applyToDocument(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (key) el.setAttribute("title", t(key));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key) el.setAttribute("placeholder", t(key));
    });
    document.documentElement.lang = activeLocale;
    document.title = t("app.title");
  }

  function init(options) {
    activeLocale = resolveLocale([
      options?.forcedLocale,
      options?.electronLocale,
      navigator.language,
    ]);
    messages = LOCALES[activeLocale] || LOCALES.en;
    applyToDocument();
    return activeLocale;
  }

  window.I18n = {
    init,
    t,
    applyToDocument,
    getLocale: () => activeLocale,
    getApiLanguage,
    getReverseGeoLanguage,
  };
})();
