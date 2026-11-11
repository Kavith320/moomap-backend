"use client";
import { useEffect, useState } from "react";
import { LocateFixed, LogOut } from "lucide-react";
import LocationPicker from "@/components/portal/LocationPicker";
import { NOTIFY_PREF_KEY, PageHeader, usePortal } from "@/components/portal/PortalShell";
import { saveUser, timeAgo } from "@/lib/portal";

const FIELDS = ["firstName", "lastName", "mobile", "gender", "nicNo", "address"];

export default function ProfilePage() {
  const { api, user, setUser, logout, toast } = usePortal();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const [notify, setNotify] = useState(false);
  const [notifySupported, setNotifySupported] = useState(true);

  useEffect(() => {
    if (user && !form) setForm(Object.fromEntries(FIELDS.map((k) => [k, user[k] || ""])));
  }, [user, form]);

  useEffect(() => {
    const supported = "Notification" in window;
    setNotifySupported(supported);
    try {
      setNotify(supported && Notification.permission === "granted" && localStorage.getItem(NOTIFY_PREF_KEY) === "on");
    } catch {}
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveProfile = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.firstName.trim() || !form.lastName.trim()) return setError("First and last name are required.");
    if (!/^\d{10,15}$/.test(form.mobile.trim())) return setError("Mobile must be 10–15 digits.");
    setSaving(true);
    const body = Object.fromEntries(FIELDS.map((k) => [k, form[k].trim()]));
    const r = await api("/api/users/me", { method: "PUT", body });
    setSaving(false);
    if (r.ok) {
      setUser(r.data.user);
      saveUser(r.data.user);
      toast({ title: "Profile saved", severity: "info", duration: 3000 });
    } else if (!r.authFailed) setError(r.error);
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwError("");
    if (pw.next.length < 6) return setPwError("Password must be at least 6 characters.");
    if (pw.next !== pw.confirm) return setPwError("Passwords do not match.");
    setPwSaving(true);
    const r = await api("/api/users/me", { method: "PUT", body: { password: pw.next } });
    setPwSaving(false);
    if (r.ok) {
      setPw({ next: "", confirm: "" });
      toast({ title: "Password changed", severity: "info", duration: 3000 });
    } else if (!r.authFailed) setPwError(r.error);
  };

  const toggleNotify = async (on) => {
    if (on) {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast({ title: "Notifications blocked", message: "Allow notifications for this site in your browser settings.", severity: "warning" });
        return;
      }
    }
    try {
      localStorage.setItem(NOTIFY_PREF_KEY, on ? "on" : "off");
    } catch {}
    setNotify(on);
  };

  if (!form) {
    return (
      <div className="pt-loading">
        <span className="pt-spinner" />
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Profile" subtitle={user && user.userId ? `User ID ${user.userId}` : ""} />

      <div className="pt-stack" style={{ maxWidth: 760 }}>
        <form className="pt-card pt-card-pad" onSubmit={saveProfile}>
          <h2 className="pt-card-title">Personal details</h2>
          <div className="pt-form-grid">
            {error && <div className="pt-error full">{error}</div>}
            <div className="pt-field">
              <label htmlFor="pf-first">First name</label>
              <input id="pf-first" type="text" value={form.firstName} onChange={set("firstName")} autoComplete="given-name" />
            </div>
            <div className="pt-field">
              <label htmlFor="pf-last">Last name</label>
              <input id="pf-last" type="text" value={form.lastName} onChange={set("lastName")} autoComplete="family-name" />
            </div>
            <div className="pt-field">
              <label htmlFor="pf-mobile">Mobile</label>
              <input id="pf-mobile" type="tel" inputMode="numeric" value={form.mobile} onChange={set("mobile")} autoComplete="tel" />
              <small>You log in with this number.</small>
            </div>
            <div className="pt-field">
              <label htmlFor="pf-gender">Gender</label>
              <select id="pf-gender" value={form.gender} onChange={set("gender")}>
                <option value="">—</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="pt-field">
              <label htmlFor="pf-nic">NIC number</label>
              <input id="pf-nic" type="text" value={form.nicNo} onChange={set("nicNo")} />
            </div>
            <div className="pt-field full">
              <label htmlFor="pf-address">Address</label>
              <textarea id="pf-address" value={form.address} onChange={set("address")} autoComplete="street-address" />
            </div>
            <div className="full" style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="pt-btn pt-btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </form>

        <HomeLocationCard />

        <form className="pt-card pt-card-pad" onSubmit={savePassword}>
          <h2 className="pt-card-title">Change password</h2>
          <div className="pt-form-grid">
            {pwError && <div className="pt-error full">{pwError}</div>}
            <div className="pt-field">
              <label htmlFor="pw-new">New password</label>
              <input id="pw-new" type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} autoComplete="new-password" />
            </div>
            <div className="pt-field">
              <label htmlFor="pw-confirm">Confirm password</label>
              <input id="pw-confirm" type="password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} autoComplete="new-password" />
            </div>
            <div className="full" style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="pt-btn pt-btn-primary" disabled={pwSaving || !pw.next}>
                {pwSaving ? "Saving…" : "Update password"}
              </button>
            </div>
          </div>
        </form>

        <div className="pt-card pt-card-pad">
          <h2 className="pt-card-title">Notifications</h2>
          <div className="pt-stack">
            <p className="pt-sub" style={{ fontSize: "0.88rem" }}>
              Alerts always appear in the app while it is open. Turn this on to also get a system notification when this tab is in the background.
            </p>
            <label className="pt-switch">
              <input type="checkbox" checked={notify} disabled={!notifySupported} onChange={(e) => toggleNotify(e.target.checked)} />
              {notifySupported ? "Browser notifications" : "Browser notifications are not supported here"}
            </label>
          </div>
        </div>

        <button type="button" className="pt-btn pt-btn-danger pt-btn-block" onClick={logout}>
          <LogOut size={17} /> Log out
        </button>
      </div>
    </>
  );
}

// Farm home location: used as the start view for the overview and geofence maps.
function HomeLocationCard() {
  const { api, user, setUser, toast } = usePortal();
  const saved = user && user.homeLocation;
  const [loc, setLoc] = useState(saved ? { lat: saved.lat, lon: saved.lon } : null);
  const [name, setName] = useState((saved && saved.name) || "");
  const [latText, setLatText] = useState(saved ? String(saved.lat) : "");
  const [lonText, setLonText] = useState(saved ? String(saved.lon) : "");
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  // follow the server copy when it changes (e.g. profile refreshed after load)
  const savedKey = saved ? `${saved.lat},${saved.lon},${saved.name || ""},${saved.updatedAt}` : "";
  useEffect(() => {
    if (!saved) return;
    setLoc({ lat: saved.lat, lon: saved.lon });
    setLatText(String(saved.lat));
    setLonText(String(saved.lon));
    setName(saved.name || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const round = (v) => Math.round(v * 1e6) / 1e6;
  const place = (lat, lon) => {
    const p = { lat: round(lat), lon: round(lon) };
    setLoc(p);
    setLatText(String(p.lat));
    setLonText(String(p.lon));
    setError("");
  };

  const typed = (which) => (e) => {
    const v = e.target.value;
    which === "lat" ? setLatText(v) : setLonText(v);
    const lat = Number(which === "lat" ? v : latText);
    const lon = Number(which === "lon" ? v : lonText);
    if (v !== "" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      setLoc({ lat, lon });
    }
  };

  const useGps = () => {
    if (!("geolocation" in navigator)) return setError("This browser cannot share its location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        place(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setLocating(false);
        setError(err.code === 1 ? "Location permission was denied." : "Could not get your location.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const save = async (homeLocation) => {
    setSaving(true);
    setError("");
    const r = await api("/api/users/me", { method: "PUT", body: { homeLocation } });
    setSaving(false);
    if (r.ok) {
      setUser(r.data.user);
      saveUser(r.data.user);
      toast({ title: homeLocation ? "Home location saved" : "Home location removed", severity: "info", duration: 3000 });
    } else if (!r.authFailed) setError(r.error);
  };

  const onSave = () => {
    if (!loc) return setError("Pick a spot on the map first.");
    save({ lat: loc.lat, lon: loc.lon, name: name.trim() });
  };

  const onClear = () => {
    setLoc(null);
    setLatText("");
    setLonText("");
    setName("");
    if (saved) save(null);
  };

  const dirty =
    (loc && (!saved || saved.lat !== loc.lat || saved.lon !== loc.lon || (saved.name || "") !== name.trim())) || false;

  return (
    <div className="pt-card pt-card-pad">
      <div className="pt-row-between" style={{ marginBottom: 6 }}>
        <h2 className="pt-card-title" style={{ margin: 0 }}>
          Farm home location
        </h2>
        {saved && <span className="pt-chip success">Saved {timeAgo(saved.updatedAt)}</span>}
      </div>
      <p className="pt-sub" style={{ fontSize: "0.88rem", marginBottom: 12 }}>
        Where your farm is. Your maps open here, and new geofences start here.
      </p>
      <div className="pt-stack">
        {error && <div className="pt-error">{error}</div>}
        <LocationPicker value={loc} onChange={place} />
        <div className="pt-form-grid">
          <div className="pt-field full">
            <label htmlFor="home-name">Name</label>
            <input id="home-name" type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main farm" />
          </div>
          <div className="pt-field">
            <label htmlFor="home-lat">Latitude</label>
            <input id="home-lat" type="number" step="0.000001" inputMode="decimal" value={latText} onChange={typed("lat")} placeholder="7.290600" />
          </div>
          <div className="pt-field">
            <label htmlFor="home-lon">Longitude</label>
            <input id="home-lon" type="number" step="0.000001" inputMode="decimal" value={lonText} onChange={typed("lon")} placeholder="80.633700" />
          </div>
        </div>
        <div className="pt-draw-tools">
          <button type="button" className="pt-btn" onClick={useGps} disabled={locating}>
            <LocateFixed size={16} /> {locating ? "Locating…" : "Use my current location"}
          </button>
          <span style={{ flex: 1 }} />
          {(saved || loc) && (
            <button type="button" className="pt-btn pt-btn-danger" onClick={onClear} disabled={saving}>
              Clear
            </button>
          )}
          <button type="button" className="pt-btn pt-btn-primary" onClick={onSave} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save location"}
          </button>
        </div>
      </div>
    </div>
  );
}
