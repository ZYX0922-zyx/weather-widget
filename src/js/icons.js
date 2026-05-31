/**
 * 本地天气 SVG 图标（避免外部 CDN 404）
 */

const ICON_SVGS = {
  "clear-day": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="14" fill="#FFD93D"/><g stroke="#FFD93D" stroke-width="3" stroke-linecap="round"><line x1="32" y1="6" x2="32" y2="14"/><line x1="32" y1="50" x2="32" y2="58"/><line x1="6" y1="32" x2="14" y2="32"/><line x1="50" y1="32" x2="58" y2="32"/><line x1="13.6" y1="13.6" x2="19.2" y2="19.2"/><line x1="44.8" y1="44.8" x2="50.4" y2="50.4"/><line x1="13.6" y1="50.4" x2="19.2" y2="44.8"/><line x1="44.8" y1="19.2" x2="50.4" y2="13.6"/></g></svg>`,
  "clear-night": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M38 10c-10 2-17 11-17 21 0 12 10 22 22 22 5 0 10-2 14-5-12 1-23-8-23-21 0-8 5-15 12-18 0 0-1-1-8 1z" fill="#E8ECFF"/><circle cx="16" cy="18" r="1.5" fill="white" opacity="0.8"/><circle cx="48" cy="14" r="1" fill="white" opacity="0.6"/><circle cx="52" cy="28" r="1.2" fill="white" opacity="0.7"/></svg>`,
  "partly-cloudy-day": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="22" cy="22" r="9" fill="#FFD93D"/><ellipse cx="36" cy="38" rx="18" ry="12" fill="rgba(255,255,255,0.95)"/><ellipse cx="24" cy="40" rx="14" ry="10" fill="rgba(255,255,255,0.85)"/></svg>`,
  "partly-cloudy-night": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M26 14c-6 1-10 6-10 12 0 7 6 13 13 13 3 0 6-1 8-3-7 1-13-5-13-12 0-4 2-8 6-10z" fill="#E8ECFF"/><ellipse cx="38" cy="40" rx="18" ry="12" fill="rgba(255,255,255,0.9)"/><ellipse cx="26" cy="42" rx="14" ry="10" fill="rgba(255,255,255,0.75)"/></svg>`,
  cloudy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="32" cy="36" rx="22" ry="14" fill="rgba(255,255,255,0.95)"/><ellipse cx="20" cy="38" rx="16" ry="11" fill="rgba(255,255,255,0.85)"/><ellipse cx="44" cy="38" rx="14" ry="10" fill="rgba(255,255,255,0.8)"/></svg>`,
  fog: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="8" y="22" width="48" height="4" rx="2" fill="rgba(255,255,255,0.7)"/><rect x="12" y="32" width="40" height="4" rx="2" fill="rgba(255,255,255,0.55)"/><rect x="10" y="42" width="44" height="4" rx="2" fill="rgba(255,255,255,0.45)"/><rect x="16" y="52" width="32" height="4" rx="2" fill="rgba(255,255,255,0.35)"/></svg>`,
  drizzle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="32" cy="28" rx="20" ry="12" fill="rgba(255,255,255,0.9)"/><ellipse cx="20" cy="30" rx="14" ry="9" fill="rgba(255,255,255,0.8)"/><line x1="22" y1="44" x2="20" y2="52" stroke="#A8D4FF" stroke-width="2.5" stroke-linecap="round"/><line x1="32" y1="44" x2="30" y2="54" stroke="#A8D4FF" stroke-width="2.5" stroke-linecap="round"/><line x1="42" y1="44" x2="40" y2="52" stroke="#A8D4FF" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  rain: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="32" cy="26" rx="20" ry="12" fill="rgba(255,255,255,0.9)"/><ellipse cx="20" cy="28" rx="14" ry="9" fill="rgba(255,255,255,0.8)"/><line x1="18" y1="42" x2="14" y2="54" stroke="#6CB4FF" stroke-width="3" stroke-linecap="round"/><line x1="28" y1="42" x2="24" y2="56" stroke="#6CB4FF" stroke-width="3" stroke-linecap="round"/><line x1="38" y1="42" x2="34" y2="54" stroke="#6CB4FF" stroke-width="3" stroke-linecap="round"/><line x1="48" y1="42" x2="44" y2="56" stroke="#6CB4FF" stroke-width="3" stroke-linecap="round"/></svg>`,
  snow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="32" cy="26" rx="20" ry="12" fill="rgba(255,255,255,0.9)"/><circle cx="20" cy="46" r="3" fill="white"/><circle cx="32" cy="50" r="3" fill="white"/><circle cx="44" cy="46" r="3" fill="white"/><circle cx="26" cy="56" r="2.5" fill="white" opacity="0.8"/><circle cx="38" cy="56" r="2.5" fill="white" opacity="0.8"/></svg>`,
  thunderstorm: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="32" cy="24" rx="22" ry="13" fill="rgba(180,190,210,0.95)"/><polygon points="34,32 28,44 34,44 30,58 42,42 36,42" fill="#FFD93D"/></svg>`,
};

function svgToDataUri(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function getIconKey(code, isDay) {
  const dayNight = isDay ? "day" : "night";

  if (code === 0) return `clear-${dayNight}`;
  if (code <= 2) return `partly-cloudy-${dayNight}`;
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 85 && code <= 86) return "snow";
  if (code >= 95) return "thunderstorm";

  return `partly-cloudy-${dayNight}`;
}

function getWeatherIconSrc(code, isDay = true) {
  const key = getIconKey(code, isDay);
  const svg = ICON_SVGS[key] || ICON_SVGS[`partly-cloudy-${isDay ? "day" : "night"}`];
  return svgToDataUri(svg);
}
