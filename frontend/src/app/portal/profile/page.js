"use client";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { NOTIFY_PREF_KEY, PageHeader, usePortal } from "@/components/portal/PortalShell";
import { saveUser } from "@/lib/portal";

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
