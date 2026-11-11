"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eraser, Fence, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import LeafletMap from "@/components/portal/LeafletMap";
import { PageHeader, usePortal } from "@/components/portal/PortalShell";

export default function GeofencesPage() {
  const { api, toast, alertTick } = usePortal();
  const [fences, setFences] = useState(null);
  const [status, setStatus] = useState({}); // fenceId -> status entry
  const [cattle, setCattle] = useState([]);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(null); // null | { fenceId?, name, enabled, cattleIds, polygon }
  const [fitKey, setFitKey] = useState(0);

  const load = useCallback(async () => {
    const [f, s, o] = await Promise.all([
      api("/api/geofences"),
      api("/api/geofences/status"),
      api("/api/me/overview"),
    ]);
    if (f.ok) setFences(f.data);
    else if (!f.authFailed) setError(f.error);
    if (s.ok) setStatus(Object.fromEntries(s.data.map((x) => [x.fenceId, x])));
    if (o.ok) setCattle(o.data.cattle);
  }, [api]);

  useEffect(() => {
    load();
  }, [load, alertTick]);

  const startCreate = () => {
    setSelectedId(null);
    setEditor({ name: "", enabled: true, cattleIds: [], polygon: [] });
  };

  const startEdit = (f) => {
    setSelectedId(String(f._id));
    setEditor({
      fenceId: String(f._id),
      name: f.name || "",
      enabled: f.enabled !== false,
      cattleIds: [...(f.cattleIds || [])],
      polygon: (f.polygon || []).map((p) => ({ lat: p.lat, lon: p.lon })),
    });
  };

  const toggleEnabled = async (f) => {
    const r = await api(`/api/geofences/${f._id}`, { method: "PUT", body: { enabled: f.enabled === false } });
    if (r.ok) load();
    else if (!r.authFailed) toast({ title: "Could not update fence", message: r.error, severity: "critical" });
  };

  const remove = async (f) => {
    if (!window.confirm(`Delete geofence "${f.name || "Unnamed"}"?`)) return;
    const r = await api(`/api/geofences/${f._id}`, { method: "DELETE" });
    if (r.ok) {
      if (selectedId === String(f._id)) setSelectedId(null);
      toast({ title: "Geofence deleted", severity: "info", duration: 3000 });
      load();
    } else if (!r.authFailed) toast({ title: "Could not delete", message: r.error, severity: "critical" });
  };

  const mapFences = useMemo(() => {
    if (!fences) return [];
    return editor && editor.fenceId ? fences.filter((f) => String(f._id) !== editor.fenceId) : fences;
  }, [fences, editor]);

  const addPoint = useCallback((p) => setEditor((e) => (e ? { ...e, polygon: [...e.polygon, p] } : e)), []);

  return (
    <>
      <PageHeader
        title="Geofences"
        subtitle="Draw safe zones and get alerted when cattle leave them"
        actions={
          !editor && (
            <button type="button" className="pt-btn pt-btn-primary" onClick={startCreate}>
              <Plus size={18} /> New geofence
            </button>
          )
        }
      />

      {error && <div className="pt-error pt-section">{error}</div>}

      <div className="pt-fence-layout">
        <div className="pt-map-wrap">
          <LeafletMap
            cattle={cattle}
            fences={mapFences}
            highlightFenceId={selectedId}
            draft={editor ? editor.polygon : null}
            onMapClick={editor ? addPoint : undefined}
            fitKey={fitKey}
          />
          {editor && (
            <div className="pt-map-hint">
              {editor.polygon.length < 3
                ? `Tap the map to add corners (${editor.polygon.length}/3 minimum)`
                : `${editor.polygon.length} corners · tap to add more`}
            </div>
          )}
        </div>

        <div>
          {editor ? (
            <FenceEditor
              editor={editor}
              setEditor={setEditor}
              cattle={cattle}
              onCancel={() => setEditor(null)}
              onSaved={() => {
                setEditor(null);
                setFitKey((k) => k + 1);
                load();
              }}
            />
          ) : (
            <FenceList
              fences={fences}
              status={status}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
              onEdit={startEdit}
              onToggle={toggleEnabled}
              onDelete={remove}
              onCreate={startCreate}
            />
          )}
        </div>
      </div>
    </>
  );
}

function FenceList({ fences, status, selectedId, onSelect, onEdit, onToggle, onDelete, onCreate }) {
  if (!fences) {
    return (
      <div className="pt-loading">
        <span className="pt-spinner" />
      </div>
    );
  }
  if (fences.length === 0) {
    return (
      <div className="pt-card pt-empty">
        <Fence size={44} />
        <h3>No geofences yet</h3>
        <p>Draw a boundary around your pasture and choose which cattle it protects.</p>
        <button type="button" className="pt-btn pt-btn-primary" onClick={onCreate}>
          <Plus size={18} /> New geofence
        </button>
      </div>
    );
  }
  return (
    <div className="pt-list">
      {fences.map((f) => {
        const id = String(f._id);
        const st = status[id];
        const enabled = f.enabled !== false;
        return (
          <div
            key={id}
            className={`pt-fence-item ${selectedId === id ? "selected" : ""}`}
            onClick={() => onSelect(id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onSelect(id)}
          >
            <div className="pt-fence-item-head">
              <strong>{f.name || "Unnamed fence"}</strong>
              <label className="pt-switch" onClick={(e) => e.stopPropagation()} title={enabled ? "Monitoring on" : "Monitoring off"}>
                <input type="checkbox" checked={enabled} onChange={() => onToggle(f)} aria-label="Monitoring" />
              </label>
              <button type="button" className="pt-icon-btn" onClick={(e) => (e.stopPropagation(), onEdit(f))} aria-label="Edit">
                <Pencil size={17} />
              </button>
              <button type="button" className="pt-icon-btn danger" onClick={(e) => (e.stopPropagation(), onDelete(f))} aria-label="Delete">
                <Trash2 size={17} />
              </button>
            </div>
            <div className="pt-fence-item-meta">
              {!enabled && <span className="pt-chip">Off</span>}
              {(f.polygon || []).length < 3 && <span className="pt-chip warning">No boundary drawn</span>}
              <span className="pt-chip plain">
                {(f.cattleIds || []).length} cattle assigned
              </span>
              {st && st.insideCount > 0 && <span className="pt-chip success">{st.insideCount} inside</span>}
              {st && st.outsideCount > 0 && <span className="pt-chip danger">{st.outsideCount} outside</span>}
            </div>
            {selectedId === id && st && st.cattle.length > 0 && (
              <div className="pt-fence-item-meta">
                {st.cattle.map((c) => (
                  <span
                    key={c.cattleId}
                    className={`pt-chip ${c.status === "outside" ? "danger" : c.status === "inside" ? "success" : ""}`}
                  >
                    {c.name || c.cattleId}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FenceEditor({ editor, setEditor, cattle, onCancel, onSaved }) {
  const { api, toast } = usePortal();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isNew = !editor.fenceId;
  const set = (patch) => setEditor((e) => ({ ...e, ...patch }));
  const toggleCattle = (id) =>
    set({
      cattleIds: editor.cattleIds.includes(id)
        ? editor.cattleIds.filter((x) => x !== id)
        : [...editor.cattleIds, id],
    });

  const canSave = editor.name.trim() && editor.polygon.length >= 3;

  const save = async () => {
    setError("");
    if (!editor.name.trim()) return setError("Give the geofence a name.");
    if (editor.polygon.length < 3) return setError("Tap at least 3 points on the map.");
    setSaving(true);
    const body = {
      name: editor.name.trim(),
      enabled: editor.enabled,
      polygon: editor.polygon,
      cattleIds: editor.cattleIds,
    };
    const r = isNew
      ? await api("/api/geofences", { method: "POST", body })
      : await api(`/api/geofences/${editor.fenceId}`, { method: "PUT", body });
    setSaving(false);
    if (r.ok) {
      toast({ title: isNew ? "Geofence created" : "Geofence saved", severity: "info", duration: 3000 });
      onSaved();
    } else if (!r.authFailed) setError(r.error);
  };

  return (
    <div className="pt-card pt-card-pad pt-stack">
      <div className="pt-row-between">
        <h2 className="pt-card-title" style={{ margin: 0 }}>
          {isNew ? "New geofence" : "Edit geofence"}
        </h2>
        <label className="pt-switch">
          <input type="checkbox" checked={editor.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          {editor.enabled ? "On" : "Off"}
        </label>
      </div>

      {error && <div className="pt-error">{error}</div>}

      <div className="pt-field">
        <label htmlFor="gf-name">Name</label>
        <input id="gf-name" type="text" value={editor.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. North pasture" />
      </div>

      <div className="pt-field">
        <span className="pt-label">Boundary</span>
        <div className="pt-draw-tools">
          <span className="pt-sub" style={{ flex: 1 }}>
            {editor.polygon.length} point{editor.polygon.length === 1 ? "" : "s"}. Tap the map to add.
          </span>
          <button
            type="button"
            className="pt-btn pt-btn-sm"
            onClick={() => set({ polygon: editor.polygon.slice(0, -1) })}
            disabled={!editor.polygon.length}
          >
            <Undo2 size={15} /> Undo
          </button>
          <button type="button" className="pt-btn pt-btn-sm" onClick={() => set({ polygon: [] })} disabled={!editor.polygon.length}>
            <Eraser size={15} /> Clear
          </button>
        </div>
      </div>

      <div className="pt-field">
        <span className="pt-label">Cattle to monitor ({editor.cattleIds.length})</span>
        {cattle.length === 0 ? (
          <span className="pt-sub">You have no cattle yet.</span>
        ) : (
          <div className="pt-checklist">
            {cattle.map((c) => (
              <label key={c.cattleId}>
                <input type="checkbox" checked={editor.cattleIds.includes(c.cattleId)} onChange={() => toggleCattle(c.cattleId)} />
                <span style={{ flex: 1 }}>{c.name || c.cattleId}</span>
                <span className="pt-sub pt-mono">{c.cattleId}</span>
              </label>
            ))}
          </div>
        )}
        <small>Only the selected cattle trigger alerts for this fence.</small>
      </div>

      <div className="pt-draw-tools">
        <button type="button" className="pt-btn" onClick={onCancel} style={{ flex: 1 }}>
          Cancel
        </button>
        <button type="button" className="pt-btn pt-btn-primary" onClick={save} disabled={saving || !canSave} style={{ flex: 1 }}>
          {saving ? "Saving…" : "Save geofence"}
        </button>
      </div>
    </div>
  );
}
