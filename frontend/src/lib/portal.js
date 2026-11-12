// Shared helpers for the user portal (/portal).
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const TOKEN_KEY = "userToken";
const USER_KEY = "portalUser";

export function getSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    return { token, user: JSON.parse(localStorage.getItem(USER_KEY) || "null") };
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user || null));
  } catch {}
}

export function saveUser(user) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user || null));
  } catch {}
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}
}

// fetch wrapper: never throws, returns { ok, status, data, error, authFailed }
export async function apiRequest(token, path, { method = "GET", body } = {}) {
  try {
    const res = await fetch(API_URL + path, {
      method,
      headers: {
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {}
    const message = data && (data.message || data.error);
    const authFailed =
      res.status === 401 || (res.status === 403 && /token/i.test(message || ""));
    return {
      ok: res.ok,
      status: res.status,
      data,
      authFailed,
      error: message || `Request failed (${res.status})`,
    };
  } catch (err) {
    return { ok: false, status: 0, data: null, authFailed: false, error: "Cannot reach the server" };
  }
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function timeAgo(date) {
  if (!date) return "never";
  const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(date).toLocaleDateString();
}

// Status colours (hex so they also work inside Leaflet HTML)
export const COLORS = {
  danger: "#e53935",
  warning: "#f4b400",
  success: "#2ecc71",
  muted: "#9e9e9e",
  primary: "#ff8c00",
};

// One headline status per cattle, most urgent first.
export function cattleStatus(item) {
  if (item.fenceStatus === "outside") return { key: "danger", label: "Outside fence" };
  if (!item.collarId) return { key: "muted", label: "No collar" };
  if (!item.device) return { key: "muted", label: "Collar not found" };
  if (!item.device.online) return { key: "muted", label: "Offline" };
  if (item.device.lowBattery) return { key: "warning", label: "Low battery" };
  if (item.fenceStatus === "inside") return { key: "success", label: "Inside fence" };
  return { key: "success", label: "Online" };
}

export function hasLocation(item) {
  const loc = item && item.device && item.device.lastLocation;
  return Boolean(loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon));
}

// Cattle photos: "/media/..." paths live on the backend; full URLs are used as-is.
export function mediaUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return API_URL + path;
}

// Shrink a photo in the browser before upload (phones take 4000px+ photos).
// Returns a JPEG data URL no larger than maxSide on its longest edge.
export function resizeImage(file, maxSide = 800, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Choose an image file"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    img.src = url;
  });
}
