// Minimal REST client for the MooMap backend (user-level endpoints only, no admin rights needed).
function createApi(baseUrl) {
  let token = null;

  async function request(method, path, body) {
    const res = await fetch(baseUrl + path, {
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
    return { ok: res.ok, status: res.status, data, error: data && (data.message || data.error) };
  }

  return {
    request,
    setToken: (t) => (token = t),
    get: (p) => request("GET", p),
    post: (p, b) => request("POST", p, b),
    put: (p, b) => request("PUT", p, b),
    del: (p) => request("DELETE", p),
  };
}

// Register (if needed) and log in the simulation user. Returns { userId }.
async function ensureUser(api, user, log = console.log) {
  let login = await api.post("/api/users/login", { mobile: user.mobile, password: user.password });
  if (login.status === 401) {
    const reg = await api.post("/api/users", {
      firstName: user.firstName,
      lastName: user.lastName,
      mobile: user.mobile,
      password: user.password,
      address: "MooMap simulator",
    });
    if (reg.status === 409) {
      throw new Error(`Mobile ${user.mobile} already belongs to another account with a different password. Set SIM_USER_MOBILE.`);
    }
    if (!reg.ok) throw new Error(`Could not register sim user: ${reg.error}`);
    log(`✔ Registered user ${user.firstName} ${user.lastName} (${user.mobile})`);
    login = await api.post("/api/users/login", { mobile: user.mobile, password: user.password });
  }
  if (!login.ok) throw new Error(`Sim user login failed: ${login.error}`);
  api.setToken(login.data.token);
  return { userId: login.data.user.userId };
}

module.exports = { createApi, ensureUser };
