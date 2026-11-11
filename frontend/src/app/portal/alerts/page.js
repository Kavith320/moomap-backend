"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BatteryLow, Bell, Check, CheckCheck, ShieldAlert, ShieldCheck, Trash2, Wifi, WifiOff } from "lucide-react";
import { PageHeader, usePortal } from "@/components/portal/PortalShell";
import { COLORS, timeAgo } from "@/lib/portal";

const TABS = [
  { key: "all", label: "All", query: "" },
  { key: "unread", label: "Unread", query: "unread=true" },
  { key: "fence", label: "Geofence", query: "type=geofence_exit,geofence_enter" },
  { key: "battery", label: "Battery", query: "type=low_battery" },
  { key: "collar", label: "Collar", query: "type=device_offline,device_online" },
];

const TYPE_UI = {
  geofence_exit: { icon: ShieldAlert, color: COLORS.danger },
  geofence_enter: { icon: ShieldCheck, color: COLORS.success },
  low_battery: { icon: BatteryLow, color: COLORS.warning },
  device_offline: { icon: WifiOff, color: COLORS.muted },
  device_online: { icon: Wifi, color: COLORS.success },
};

export default function AlertsPage() {
  const { api, alertTick, unread, setUnread, refreshUnread, toast } = usePortal();
  const [tab, setTab] = useState("all");
  const [alerts, setAlerts] = useState(null);
  const [nextBefore, setNextBefore] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const fetchPage = useCallback(
    async (before) => {
      const q = TABS.find((t) => t.key === tab).query;
      const params = [q, "limit=30", before && `before=${encodeURIComponent(before)}`].filter(Boolean).join("&");
      return api(`/api/alerts?${params}`);
    },
    [api, tab]
  );

  const load = useCallback(async () => {
    const r = await fetchPage();
    if (r.ok) {
      setAlerts(r.data.alerts);
      setNextBefore(r.data.nextBefore);
      setError("");
    } else if (!r.authFailed) setError(r.error);
  }, [fetchPage]);

  useEffect(() => {
    setAlerts(null);
    load();
  }, [load]);

  useEffect(() => {
    if (alertTick) load();
  }, [alertTick, load]);

  const loadMore = async () => {
    setLoadingMore(true);
    const r = await fetchPage(nextBefore);
    setLoadingMore(false);
    if (r.ok) {
      setAlerts((a) => [...a, ...r.data.alerts]);
      setNextBefore(r.data.nextBefore);
    }
  };

  const markRead = async (a) => {
    if (a.read) return;
    const r = await api(`/api/alerts/${a.alertId}/read`, { method: "PATCH" });
    if (r.ok) {
      setAlerts((list) =>
        tab === "unread" ? list.filter((x) => x.alertId !== a.alertId) : list.map((x) => (x.alertId === a.alertId ? r.data : x))
      );
      setUnread((n) => Math.max(0, n - 1));
    }
  };

  const markAll = async () => {
    const r = await api("/api/alerts/read-all", { method: "POST" });
    if (r.ok) {
      setUnread(0);
      load();
    } else if (!r.authFailed) toast({ title: "Could not update alerts", message: r.error, severity: "critical" });
  };

  const remove = async (a) => {
    const r = await api(`/api/alerts/${a.alertId}`, { method: "DELETE" });
    if (r.ok) {
      setAlerts((list) => list.filter((x) => x.alertId !== a.alertId));
      if (!a.read) refreshUnread();
    }
  };

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle={unread ? `${unread} unread` : "You're all caught up"}
        actions={
          <button type="button" className="pt-btn" onClick={markAll} disabled={!unread}>
            <CheckCheck size={17} /> Mark all read
          </button>
        }
      />

      <div className="pt-seg">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === "unread" && unread > 0 && <span className="pt-seg-n">{unread}</span>}
          </button>
        ))}
      </div>

      {error && <div className="pt-error pt-section">{error}</div>}

      {!alerts && !error && (
        <div className="pt-loading">
          <span className="pt-spinner" />
        </div>
      )}

      {alerts && alerts.length === 0 && (
        <div className="pt-card pt-empty">
          <Bell size={44} />
          <h3>No alerts</h3>
          <p>Geofence breaches, low batteries and offline collars will show up here.</p>
        </div>
      )}

      {alerts && alerts.length > 0 && (
        <div className="pt-card pt-alert-list">
          {alerts.map((a) => {
            const ui = TYPE_UI[a.type] || { icon: Bell, color: COLORS.primary };
            const Icon = ui.icon;
            return (
              <div key={a.alertId} className={`pt-alert ${a.read ? "" : "unread"}`} onClick={() => markRead(a)}>
                <span className="pt-alert-icon" style={{ "--c": ui.color }}>
                  <Icon size={20} />
                </span>
                <div className="pt-alert-main">
                  <div className="pt-alert-title">{a.title}</div>
                  {a.message && <div className="pt-alert-msg">{a.message}</div>}
                  <div className="pt-alert-meta">
                    <span title={new Date(a.createdAt).toLocaleString()}>{timeAgo(a.createdAt)}</span>
                    {a.severity === "critical" && <span className="pt-chip danger">Critical</span>}
                    {a.cattleId && (
                      <Link href={`/portal?cattle=${encodeURIComponent(a.cattleId)}`} onClick={(e) => e.stopPropagation()}>
                        View on map →
                      </Link>
                    )}
                  </div>
                </div>
                <div className="pt-alert-actions">
                  {!a.read && (
                    <button
                      type="button"
                      className="pt-icon-btn"
                      onClick={(e) => (e.stopPropagation(), markRead(a))}
                      aria-label="Mark read"
                      title="Mark read"
                    >
                      <Check size={18} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="pt-icon-btn danger"
                    onClick={(e) => (e.stopPropagation(), remove(a))}
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {nextBefore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <button type="button" className="pt-btn" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load older alerts"}
          </button>
        </div>
      )}
    </>
  );
}
