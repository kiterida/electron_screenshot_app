// src/utils/time.js
export function formatTime(seconds) {
  const date = new Date(null);
  date.setSeconds(seconds);
  const iso = date.toISOString();
  return iso.substr(11, 8).replace(/:/g, '-'); // "00-01-05"
}
