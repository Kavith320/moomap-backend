"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Pencil, Plus, Search, Trash2 } from "lucide-react";
import HoofPrint from "@/components/portal/HoofPrint";
import Modal from "@/components/portal/Modal";
import { PageHeader, usePortal } from "@/components/portal/PortalShell";
import { cattleStatus, hasLocation, timeAgo } from "@/lib/portal";

const EMPTY = {
  cattleId: "",
  name: "",
  breed: "",
  gender: "",
  age: "",
  weight: "",
  color: "",
  collarId: "",
  farmName: "",
  healthNotes: "",
};

export default function CattlePage() {
  const { api, toast, alertTick } = usePortal();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // null | { mode: "create"|"edit", form }

  const load = useCallback(async () => {
    const r = await api("/api/me/overview");
    if (r.ok) {
      setItems(r.data.cattle);
      setError("");
    } else if (!r.authFailed) setError(r.error);
  }, [api]);

  useEffect(() => {
    load();
  }, [load, alertTick]);

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.name || c.cattleId}? This cannot be undone.`)) return;
    const r = await api(`/api/cattles/${encodeURIComponent(c.cattleId)}`, { method: "DELETE" });
    if (r.ok) {
      toast({ title: "Cattle deleted", severity: "info", duration: 3000 });
      load();
    } else if (!r.authFailed) {
      toast({ title: "Could not delete", message: r.error, severity: "critical" });
    }
  };

  const q = query.trim().toLowerCase();
  const visible = (items || []).filter(
    (c) =>
      !q ||
      [c.cattleId, c.name, c.breed, c.collarId].some((v) => v && String(v).toLowerCase().includes(q))
  );

  return (
    <>
      <PageHeader
        title="My cattle"
        subtitle={items ? `${items.length} animal${items.length === 1 ? "" : "s"}` : " "}
        actions={
          <button type="button" className="pt-btn pt-btn-primary" onClick={() => setEditing({ mode: "create", form: EMPTY })}>
            <Plus size={18} /> Add cattle
          </button>
        }
      />

      {error && <div className="pt-error pt-section">{error}</div>}

      {items && items.length > 0 && (
        <div className="pt-toolbar">
          <div className="pt-search">
            <Search size={17} />
            <input
              type="search"
              placeholder="Search by name, ID, breed or collar"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {!items && !error && (
        <div className="pt-loading">
          <span className="pt-spinner" />
        </div>
      )}

      {items && items.length === 0 && (
        <div className="pt-card pt-empty">
          <HoofPrint size={44} />
          <h3>No cattle yet</h3>
          <p>Add an animal and enter the ID printed on its collar.</p>
          <button type="button" className="pt-btn pt-btn-primary" onClick={() => setEditing({ mode: "create", form: EMPTY })}>
            <Plus size={18} /> Add cattle
          </button>
        </div>
      )}

      {items && items.length > 0 && visible.length === 0 && <div className="pt-empty">No matches for “{query}”.</div>}

      <div className="pt-grid">
        {visible.map((c) => {
          const st = cattleStatus(c);
          return (
            <article key={c.cattleId} className="pt-card pt-cattle-card">
              <div className="pt-cattle-card-head">
                <div>
                  <h3>{c.name || c.cattleId}</h3>
                  <div className="pt-sub pt-mono">{c.cattleId}</div>
                </div>
                <span className={`pt-chip ${st.key}`}>{st.label}</span>
              </div>

              <dl className="pt-kv">
                <div>
                  <dt>Breed</dt>
                  <dd>{c.breed || "—"}</dd>
                </div>
                <div>
                  <dt>Gender / age</dt>
                  <dd>
                    {[c.gender, c.age != null && c.age !== "" ? `${c.age} y` : null].filter(Boolean).join(" · ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt>Collar</dt>
                  <dd className="pt-mono">{c.collarId || "—"}</dd>
                </div>
                <div>
                  <dt>Battery</dt>
                  <dd>{c.device && c.device.batteryPercent != null ? `${c.device.batteryPercent}%` : "—"}</dd>
                </div>
                <div>
                  <dt>Last seen</dt>
                  <dd>{c.device ? timeAgo(c.device.lastSeen) : "—"}</dd>
                </div>
                <div>
                  <dt>Geofences</dt>
                  <dd>{c.fences.length ? c.fences.map((f) => f.name || "Fence").join(", ") : "—"}</dd>
                </div>
              </dl>

              <div className="pt-card-actions">
                {hasLocation(c) && (
                  <Link href={`/portal?cattle=${encodeURIComponent(c.cattleId)}`} className="pt-btn pt-btn-sm">
                    <MapPin size={15} /> Map
                  </Link>
                )}
                <button
                  type="button"
                  className="pt-btn pt-btn-sm"
                  onClick={() =>
                    setEditing({
                      mode: "edit",
                      form: Object.fromEntries(Object.keys(EMPTY).map((k) => [k, c[k] ?? ""])),
                    })
                  }
                >
                  <Pencil size={15} /> Edit
                </button>
                <button type="button" className="pt-btn pt-btn-sm pt-btn-danger" onClick={() => remove(c)} aria-label="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {editing && (
        <CattleForm
          mode={editing.mode}
          initial={editing.form}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function CattleForm({ mode, initial, onClose, onSaved }) {
  const { api, toast } = usePortal();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (mode === "create" && !form.cattleId.trim()) {
      setError("Cattle ID is required.");
      return;
    }
    const num = (v) => (v === "" || v == null ? undefined : Number(v));
    const body = {
      name: form.name.trim(),
      breed: form.breed.trim(),
      gender: form.gender,
      age: num(form.age),
      weight: num(form.weight),
      color: form.color.trim(),
      farmName: form.farmName.trim(),
      healthNotes: form.healthNotes.trim(),
      collarId: form.collarId.trim(),
    };
    setSaving(true);
    const r =
      mode === "create"
        ? await api("/api/cattles", {
            method: "POST",
            body: { ...body, cattleId: form.cattleId.trim(), collarId: body.collarId || undefined },
          })
        : await api(`/api/cattles/${encodeURIComponent(form.cattleId)}`, { method: "PUT", body });
    setSaving(false);
    if (r.ok) {
      toast({ title: mode === "create" ? "Cattle added" : "Changes saved", severity: "info", duration: 3000 });
      onSaved();
    } else if (!r.authFailed) {
      setError(r.error);
    }
  };

  return (
    <Modal
      title={mode === "create" ? "Add cattle" : `Edit ${initial.name || initial.cattleId}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="pt-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="cattle-form" className="pt-btn pt-btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="cattle-form" onSubmit={submit} className="pt-form-grid">
        {error && <div className="pt-error full">{error}</div>}
        <div className="pt-field">
          <label htmlFor="cf-id">Cattle ID *</label>
          <input id="cf-id" type="text" value={form.cattleId} onChange={set("cattleId")} disabled={mode === "edit"} placeholder="e.g. TAG-0042" />
        </div>
        <div className="pt-field">
          <label htmlFor="cf-name">Name</label>
          <input id="cf-name" type="text" value={form.name} onChange={set("name")} placeholder="e.g. Bessie" />
        </div>
        <div className="pt-field">
          <label htmlFor="cf-breed">Breed</label>
          <input id="cf-breed" type="text" value={form.breed} onChange={set("breed")} />
        </div>
        <div className="pt-field">
          <label htmlFor="cf-gender">Gender</label>
          <select id="cf-gender" value={form.gender} onChange={set("gender")}>
            <option value="">—</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </select>
        </div>
        <div className="pt-field">
          <label htmlFor="cf-age">Age (years)</label>
          <input id="cf-age" type="number" min="0" step="0.1" inputMode="decimal" value={form.age} onChange={set("age")} />
        </div>
        <div className="pt-field">
          <label htmlFor="cf-weight">Weight (kg)</label>
          <input id="cf-weight" type="number" min="0" step="0.1" inputMode="decimal" value={form.weight} onChange={set("weight")} />
        </div>
        <div className="pt-field">
          <label htmlFor="cf-color">Color</label>
          <input id="cf-color" type="text" value={form.color} onChange={set("color")} />
        </div>
        <div className="pt-field">
          <label htmlFor="cf-farm">Farm</label>
          <input id="cf-farm" type="text" value={form.farmName} onChange={set("farmName")} />
        </div>
        <div className="pt-field full">
          <label htmlFor="cf-collar">Collar ID</label>
          <input
            id="cf-collar"
            type="text"
            className="pt-mono"
            value={form.collarId}
            onChange={set("collarId")}
            placeholder="ID printed on the collar, e.g. 7454927D7850"
            autoCapitalize="characters"
          />
          <small>{mode === "edit" ? "Clear this field to detach the collar." : "Optional. You can attach a collar later."}</small>
        </div>
        <div className="pt-field full">
          <label htmlFor="cf-notes">Health notes</label>
          <textarea id="cf-notes" value={form.healthNotes} onChange={set("healthNotes")} />
        </div>
      </form>
    </Modal>
  );
}
