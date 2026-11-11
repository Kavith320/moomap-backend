"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Fence, LayoutDashboard, LogOut, User, X } from "lucide-react";
import HoofPrint from "@/components/portal/HoofPrint";
import { API_URL, apiRequest, clearSession, getSession, saveUser } from "@/lib/portal";

const PortalContext = createContext(null);
export const usePortal = () => useContext(PortalContext);

export const NOTIFY_PREF_KEY = "portalBrowserNotifications";

const NAV = [
  { href: "/portal", label: "Overview", icon: LayoutDashboard },
  { href: "/portal/cattle", label: "Cattle", icon: HoofPrint },
  { href: "/portal/geofences", label: "Geofences", icon: Fence },
  { href: "/portal/alerts", label: "Alerts", icon: Bell },
  { href: "/portal/profile", label: "Profile", icon: User },
];

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="pt-page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="pt-page-actions">{actions}</div>}
    </div>
  );
}

export default function PortalShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [unread, setUnread] = useState(0);
  const [alertTick, setAlertTick] = useState(0);
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef(new Set());

  // Session guard
  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    setToken(s.token);
    setUser(s.user);
  }, [router]);

  const logout = useCallback(() => {
    clearSession();
    router.replace("/login");
  }, [router]);

  const api = useCallback(
    async (path, opts) => {
      const r = await apiRequest(token, path, opts);
      if (r.authFailed) logout();
      return r;
    },
    [token, logout]
  );

  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (t) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((list) => [...list.slice(-3), { id, ...t }]);
      const timer = setTimeout(() => {
        dismissToast(id);
        toastTimers.current.delete(timer);
      }, t.duration || 6000);
      toastTimers.current.add(timer);
    },
    [dismissToast]
  );

  useEffect(() => () => toastTimers.current.forEach(clearTimeout), []);

  const refreshUnread = useCallback(async () => {
    const r = await api("/api/alerts/unread-count");
    if (r.ok) setUnread(r.data.count);
  }, [api]);

  // Validate token, load profile + unread count
  useEffect(() => {
    if (!token) return;
    (async () => {
      const r = await api("/api/users/me");
      if (r.ok) {
        setUser(r.data);
        saveUser(r.data);
      }
    })();
    refreshUnread();
  }, [token, api, refreshUnread]);

  // Live alerts (Server-Sent Events)
  useEffect(() => {
    if (!token) return;
    const es = new EventSource(`${API_URL}/api/alerts/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener("alert", (e) => {
      let a;
      try {
        a = JSON.parse(e.data);
      } catch {
        return;
      }
      setUnread((n) => n + 1);
      setAlertTick((n) => n + 1);
      toast({ title: a.title, message: a.message, severity: a.severity });

      try {
        if (
          localStorage.getItem(NOTIFY_PREF_KEY) === "on" &&
          "Notification" in window &&
          Notification.permission === "granted" &&
          document.visibilityState !== "visible"
        ) {
          new Notification(a.title, { body: a.message, icon: "/logo.png", tag: a.alertId });
        }
      } catch {}
    });
    return () => es.close();
  }, [token, toast]);

  if (!token) {
    return (
      <div className="pt-boot">
        <span className="pt-spinner" />
      </div>
    );
  }

  const isActive = (href) => (href === "/portal" ? pathname === "/portal" : pathname.startsWith(href));
  const current = NAV.find((n) => isActive(n.href));
  const displayName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "";

  const ctx = { token, user, setUser, api, toast, unread, setUnread, refreshUnread, alertTick, logout };

  return (
    <PortalContext.Provider value={ctx}>
      <div className="pt-shell">
        <aside className="pt-sidebar">
          <div className="pt-brand">
            <img src="/logo.png" alt="" width={32} height={32} />
            <span>MooMap</span>
          </div>
          <nav className="pt-side-nav">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={isActive(href) ? "active" : ""}>
                <Icon size={19} />
                <span>{label}</span>
                {href === "/portal/alerts" && unread > 0 && (
                  <span className="pt-count">{unread > 99 ? "99+" : unread}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="pt-side-user">
            <div className="pt-avatar">{(displayName || "U").charAt(0).toUpperCase()}</div>
            <div className="pt-side-user-info">
              <strong>{displayName || "My account"}</strong>
              <span>{user && user.mobile}</span>
            </div>
            <button type="button" className="pt-icon-btn light" onClick={logout} aria-label="Log out" title="Log out">
              <LogOut size={18} />
            </button>
          </div>
        </aside>

        <header className="pt-topbar">
          <img src="/logo.png" alt="" width={28} height={28} />
          <span className="pt-topbar-title">{current ? current.label : "MooMap"}</span>
          <Link href="/portal/alerts" className="pt-bell" aria-label={`Alerts, ${unread} unread`}>
            <Bell size={21} />
            {unread > 0 && <span className="pt-count">{unread > 99 ? "99+" : unread}</span>}
          </Link>
        </header>

        <main className="pt-main">
          <div className="pt-container">{children}</div>
        </main>

        <nav className="pt-bottomnav">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={isActive(href) ? "active" : ""}>
              <span className="pt-bottomnav-icon">
                <Icon size={21} />
                {href === "/portal/alerts" && unread > 0 && <span className="pt-dot" />}
              </span>
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="pt-toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`pt-toast ${t.severity || "info"}`}>
              <button
                type="button"
                className="pt-toast-body"
                onClick={() => {
                  dismissToast(t.id);
                  router.push("/portal/alerts");
                }}
              >
                <strong>{t.title}</strong>
                {t.message && <span>{t.message}</span>}
              </button>
              <button type="button" className="pt-icon-btn" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </PortalContext.Provider>
  );
}
