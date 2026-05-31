/**
 * 天气数据工具
 */

function tr(key, fallback) {
  if (window.I18n) return window.I18n.t(key);
  return fallback;
}

const WMO_DESCRIPTIONS = {
  0: "晴朗",
  1: "大部晴朗",
  2: "局部多云",
  3: "阴天",
  45: "雾",
  48: "雾凇",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "大毛毛雨",
  56: "冻毛毛雨",
  57: "强冻毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "冻雨",
  67: "强冻雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  77: "雪粒",
  80: "小阵雨",
  81: "阵雨",
  82: "大阵雨",
  85: "小阵雪",
  86: "大阵雪",
  95: "雷暴",
  96: "雷暴伴小冰雹",
  99: "雷暴伴大冰雹",
};

const WIND_DIRECTIONS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];

const STORAGE_KEY = "weather_widget_location";

function getWeatherDescription(code) {
  return tr(`wmo.${code}`, WMO_DESCRIPTIONS[code] || tr("weather.unknown", "未知"));
}

function getBackgroundName(code, isDay = true) {
  const dayNight = isDay ? "day" : "night";

  if (code === 0 || code === 1) return `sky-clear-${dayNight}`;
  if (code <= 3) return `sky-cloudy-${dayNight}`;
  if (code === 45 || code === 48) return "sky-fog";
  if (code >= 51 && code <= 67) return "sky-rain";
  if (code >= 71 && code <= 77) return "sky-snow";
  if (code >= 80 && code <= 86) return "sky-rain";
  if (code >= 95) return "sky-storm";

  return `sky-clear-${dayNight}`;
}

function isDaytime(hour) {
  return hour >= 6 && hour < 20;
}

function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatUpdateTime(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const time = `${h}:${m}`;
  if (window.I18n) return window.I18n.t("updatedAt", { time });
  return `更新于 ${time}`;
}

function formatWeekday(dateStr) {
  const date = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));

  if (diff === 0) return tr("day.today", "今天");
  if (diff === 1) return tr("day.tomorrow", "明天");
  if (diff === 2) return tr("day.dayAfter", "后天");

  const weekdays = [
    tr("week.0", "周日"),
    tr("week.1", "周一"),
    tr("week.2", "周二"),
    tr("week.3", "周三"),
    tr("week.4", "周四"),
    tr("week.5", "周五"),
    tr("week.6", "周六"),
  ];
  return weekdays[date.getDay()];
}

function formatHour(timeStr, isFirst) {
  if (isFirst) return tr("hour.now", "现在");
  const date = new Date(timeStr);
  return `${String(date.getHours()).padStart(2, "0")}:00`;
}

function formatWindDirection(degree) {
  if (degree === undefined || degree === null) return "--";
  const index = Math.round(degree / 45) % 8;
  const keys = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const fallbacks = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return tr(`wind.${keys[index]}`, fallbacks[index]);
}

function saveLocation(location) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
}

function loadSavedLocation() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

async function searchCity(keyword) {
  const lang = window.I18n?.getApiLanguage?.() || "zh";
  const params = new URLSearchParams({
    name: keyword,
    count: 8,
    language: lang,
    format: "json",
  });

  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) throw new Error(tr("error.searchFailed", "城市搜索失败"));

  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(tr("error.searchEmpty", "未找到匹配城市，请换个关键词"));
  }

  return data.results.map((item) => ({
    name: item.name,
    admin1: item.admin1 || "",
    country: item.country || "",
    lat: item.latitude,
    lon: item.longitude,
    label: [item.name, item.admin1, item.country].filter(Boolean).join(" · "),
  }));
}

async function reverseGeocode(lat, lon) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const geoLang = window.I18n?.getReverseGeoLanguage?.() || "zh";
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${geoLang}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "WeatherWidget/1.0" },
    });

    if (res.ok) {
      const data = await res.json();
      const city =
        data.city ||
        data.locality ||
        data.principalSubdivision ||
        data.countryName;

      if (city) return city;
    }
  } catch {
    // 逆地理编码失败
  } finally {
    clearTimeout(timer);
  }

  return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
}

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "weather_code",
      "wind_speed_10m",
      "wind_direction_10m",
      "is_day",
    ].join(","),
    hourly: "temperature_2m,weather_code,is_day,precipitation_probability",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max",
    timezone: "auto",
    forecast_days: 7,
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(tr("error.fetchFailed", "天气 API 请求失败"));
  return res.json();
}

function getGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error(tr("error.geoUnsupported", "当前环境不支持定位")));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        const messages = {
          1: "定位被拒绝，请在系统设置中允许位置权限",
          2: "无法确定位置，请检查网络或 GPS",
          3: "定位超时，请稍后重试",
        };
        reject(new Error(messages[err.code] || "无法获取位置"));
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  });
}

function getBackgroundDataUri(name) {
  const backgrounds = {
    "sky-clear-day": `
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#4facfe"/>
          <stop offset="50%" style="stop-color:#00c6fb"/>
          <stop offset="100%" style="stop-color:#74ebd5"/>
        </linearGradient>
      </defs>
      <rect width="400" height="640" fill="url(#g)"/>
      <circle cx="320" cy="80" r="50" fill="rgba(255,220,100,0.9)"/>
    `,
    "sky-clear-night": `
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#0f0c29"/>
          <stop offset="50%" style="stop-color:#302b63"/>
          <stop offset="100%" style="stop-color:#24243e"/>
        </linearGradient>
      </defs>
      <rect width="400" height="640" fill="url(#g)"/>
      <circle cx="300" cy="70" r="30" fill="rgba(240,240,255,0.85)"/>
      <circle cx="80" cy="120" r="1.5" fill="white" opacity="0.8"/>
      <circle cx="150" cy="60" r="1" fill="white" opacity="0.6"/>
      <circle cx="220" cy="100" r="1.2" fill="white" opacity="0.7"/>
      <circle cx="350" cy="150" r="1" fill="white" opacity="0.5"/>
    `,
    "sky-cloudy-day": `
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#89b4c8"/>
          <stop offset="100%" style="stop-color:#6a8caf"/>
        </linearGradient>
      </defs>
      <rect width="400" height="640" fill="url(#g)"/>
      <ellipse cx="200" cy="100" rx="80" ry="30" fill="rgba(255,255,255,0.5)"/>
      <ellipse cx="280" cy="130" rx="60" ry="25" fill="rgba(255,255,255,0.35)"/>
    `,
    "sky-cloudy-night": `
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#1a1a2e"/>
          <stop offset="100%" style="stop-color:#16213e"/>
        </linearGradient>
      </defs>
      <rect width="400" height="640" fill="url(#g)"/>
      <ellipse cx="200" cy="100" rx="80" ry="30" fill="rgba(255,255,255,0.15)"/>
    `,
    "sky-rain": `
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#536976"/>
          <stop offset="100%" style="stop-color:#292e49"/>
        </linearGradient>
      </defs>
      <rect width="400" height="640" fill="url(#g)"/>
      <ellipse cx="200" cy="80" rx="90" ry="35" fill="rgba(100,110,130,0.8)"/>
      <line x1="120" y1="150" x2="115" y2="180" stroke="rgba(150,180,220,0.5)" stroke-width="2"/>
      <line x1="200" y1="140" x2="195" y2="175" stroke="rgba(150,180,220,0.5)" stroke-width="2"/>
      <line x1="280" y1="155" x2="275" y2="190" stroke="rgba(150,180,220,0.5)" stroke-width="2"/>
    `,
    "sky-snow": `
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#bdc3c7"/>
          <stop offset="100%" style="stop-color:#8e9eab"/>
        </linearGradient>
      </defs>
      <rect width="400" height="640" fill="url(#g)"/>
      <ellipse cx="200" cy="90" rx="85" ry="32" fill="rgba(255,255,255,0.6)"/>
      <circle cx="100" cy="160" r="3" fill="white" opacity="0.8"/>
      <circle cx="200" cy="200" r="2.5" fill="white" opacity="0.7"/>
      <circle cx="300" cy="170" r="3" fill="white" opacity="0.8"/>
    `,
    "sky-fog": `
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#9ca3af"/>
          <stop offset="100%" style="stop-color:#6b7280"/>
        </linearGradient>
      </defs>
      <rect width="400" height="640" fill="url(#g)"/>
      <rect x="0" y="200" width="400" height="40" fill="rgba(255,255,255,0.2)"/>
      <rect x="0" y="280" width="400" height="50" fill="rgba(255,255,255,0.15)"/>
    `,
    "sky-storm": `
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#232526"/>
          <stop offset="100%" style="stop-color:#414345"/>
        </linearGradient>
      </defs>
      <rect width="400" height="640" fill="url(#g)"/>
      <ellipse cx="200" cy="70" rx="100" ry="40" fill="rgba(60,60,80,0.9)"/>
      <polygon points="210,120 200,150 215,150 205,190 230,145 215,145" fill="rgba(255,220,80,0.9)"/>
    `,
  };

  const svg = backgrounds[name] || backgrounds["sky-clear-day"];
  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="640">${svg}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(fullSvg)}`;
}
