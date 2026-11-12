// Login for the simulator control panel.
//
// The panel can be published on the internet, and whoever controls it can fake breakouts
// and alerts, so every request needs one of:
//   - a session cookie, obtained by logging in with a MooMap ADMIN account (checked
//     against the backend), valid for 12 hours
//   - the local command key (X-Sim-Token header) used by `npm run cmd`. It is written to
//     simulator/.control-token (mode 600), so only the server account can read it.
// Set PANEL_AUTH=off only for local development.
const fs = require("fs");
const crypto = require("crypto");

const COOKIE = "moomap_sim";
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FAILS = 8; // per client within the window
const WINDOW_MS = 10 * 60 * 1000;

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function createPanelAuth({ backendUrl, tokenFile, log = () => {} }) {
  const enabled = String(process.env.PANEL_AUTH || "on").toLowerCase() !== "off";
  const sessions = new Map(); // id -> { name, mobile, expires }
  const fails = new Map(); // client -> { count, first }

  // command key for npm run cmd
  const cmdToken = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(tokenFile, cmdToken + "\n", { mode: 0o600 });
  fs.chmodSync(tokenFile, 0o600);

  // The proxy appends the real client address last; earlier entries can be forged by the client.
  const clientKey = (req) => String(req.headers["x-forwarded-for"] || "").split(",").pop().trim() || "direct";

  function sessionOf(req) {
    const id = parseCookies(req.headers.cookie)[COOKIE];
    if (!id) return null;
    const s = sessions.get(id);
    if (!s) return null;
    if (s.expires < Date.now()) {
      sessions.delete(id);
      return null;
    }
    return s;
  }

  // Returns who is calling, or null when not allowed.
  function identify(req) {
    if (!enabled) return { name: "local", via: "auth-off" };
    const key = req.headers["x-sim-token"];
    if (key && safeEqual(key, cmdToken)) return { name: "npm run cmd", via: "token" };
    const s = sessionOf(req);
    return s ? { name: s.name, via: "session" } : null;
  }

  function cookieFlags(req) {
    const host = String(req.headers.host || "");
    const local = /^(127\.0\.0\.1|localhost)(:|$)/.test(host) && !req.headers["x-forwarded-proto"];
    return `Path=/; HttpOnly; SameSite=Lax${local ? "" : "; Secure"}`;
  }

  // POST /login {mobile, password} -> { status, body, cookie? }
  async function login(req, body) {
    const who = clientKey(req);
    const f = fails.get(who);
    if (f && Date.now() - f.first < WINDOW_MS && f.count >= MAX_FAILS) {
      return { status: 429, body: { error: "Too many failed attempts. Try again in a few minutes." } };
    }
    let mobile, password;
    try {
      ({ mobile, password } = JSON.parse(body || "{}"));
    } catch {
      return { status: 400, body: { error: "Bad request" } };
    }
    const failed = (status, error) => {
      const cur = fails.get(who);
      if (!cur || Date.now() - cur.first > WINDOW_MS) fails.set(who, { count: 1, first: Date.now() });
      else cur.count++;
      log(`🔒 Panel login failed for ${String(mobile || "?").slice(0, 20)} (${error})`);
      return { status, body: { error } };
    };
    if (!mobile || !password) return failed(400, "Enter mobile and password");

    let r;
    try {
      r = await fetch(backendUrl + "/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, password }),
      });
    } catch {
      return { status: 502, body: { error: "MooMap backend is not reachable" } };
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return failed(401, "Wrong mobile or password");

    // admin only: trust the role in the login reply, else ask an admin-only endpoint
    let isAdmin = data.user && data.user.role === "admin";
    if (!isAdmin && data.user && data.user.role === undefined) {
      const s = await fetch(backendUrl + "/api/admin/stats", { headers: { Authorization: `Bearer ${data.token}` } }).catch(() => null);
      isAdmin = Boolean(s && s.ok);
    }
    if (!isAdmin) return failed(403, "Only MooMap admin accounts can use the simulator");

    fails.delete(who);
    const id = crypto.randomBytes(32).toString("hex");
    const name = [data.user.firstName, data.user.lastName].filter(Boolean).join(" ") || mobile;
    sessions.set(id, { name, mobile, expires: Date.now() + SESSION_MS });
    log(`🔓 Panel login: ${name}`);
    return {
      status: 200,
      body: { ok: true, name },
      cookie: `${COOKIE}=${id}; Max-Age=${SESSION_MS / 1000}; ${cookieFlags(req)}`,
    };
  }

  function logout(req) {
    const id = parseCookies(req.headers.cookie)[COOKIE];
    if (id) sessions.delete(id);
    return `${COOKIE}=; Max-Age=0; ${cookieFlags(req)}`;
  }

  // drop expired sessions now and then
  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) if (s.expires < now) sessions.delete(id);
  }, 60 * 60 * 1000).unref();

  return { enabled, identify, login, logout };
}

module.exports = { createPanelAuth };
