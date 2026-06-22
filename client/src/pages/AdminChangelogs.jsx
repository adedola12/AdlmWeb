// src/pages/AdminChangelogs.jsx
//
// Admin editor for the public "What's New" product changelogs. Lets staff
// manage products (metadata) and their releases (version / date / title /
// highlight + New / Improved / Fixed bullet lists) without hand-editing the
// markdown. Persists to the backend (/admin/changelogs); the public pages read
// the same shape from /changelogs (with the bundled markdown file as a
// fallback/seed — see src/data/changelogsSource.js).
//
// Gated by the `changelogs` admin area via <AdminRoute permission="changelogs">.
import React from "react";
import { Link } from "react-router-dom";
import {
  FiPlus,
  FiTrash2,
  FiArrowUp,
  FiArrowDown,
  FiSave,
  FiExternalLink,
  FiX,
  FiRotateCcw,
  FiStar,
  FiTrendingUp,
  FiTool,
  FiClock,
} from "react-icons/fi";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { Reveal } from "../components/effects.jsx";
import { ICONS, ACCENTS, iconOf, accentOf } from "../data/whatsNewTheme.js";

/* ----------------------------- shared styles ----------------------------- */

const INPUT =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-adlm-blue-700/40 dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:text-adlm-dark-text dark:placeholder:text-adlm-dark-dim";
const LABEL =
  "block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-dim mb-1";
const CARD =
  "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-adlm-dark-border dark:bg-adlm-dark-panel";

const ACCENT_KEYS = Object.keys(ACCENTS); // orange | blue | sky | emerald | violet | amber
const ICON_KEYS = Object.keys(ICONS); // cube | map | layers | zap | dollar | play | trending | book

// Visual treatment for the three change-group editors — mirrors the public
// WhatsNewProduct page so the admin previews what visitors will see.
const GROUPS = [
  { type: "new", label: "New", Icon: FiStar, tint: "text-emerald-600 dark:text-emerald-300" },
  { type: "improved", label: "Improved", Icon: FiTrendingUp, tint: "text-sky-600 dark:text-adlm-blue-400" },
  { type: "fixed", label: "Fixed", Icon: FiTool, tint: "text-amber-600 dark:text-amber-300" },
];

/* ------------------------------ draft helpers ---------------------------- */

// Monotonic client-only keys for unsaved releases (stable across re-renders so
// React doesn't tear down inputs mid-edit).
let keySeq = 0;
const nextKey = () => `tmp-${++keySeq}`;

function groupItems(release, type) {
  const g = (release.changes || []).find((x) => x.type === type);
  return g ? g.items.slice() : [];
}

// Raw product doc → editable draft (groups keyed by type for easy editing).
function toDraft(p) {
  return {
    _id: p._id,
    slug: p.slug || "",
    name: p.name || "",
    tagline: p.tagline || "",
    category: p.category || "",
    accent: ACCENT_KEYS.includes(p.accent) ? p.accent : "blue",
    icon: ICON_KEYS.includes(p.icon) ? p.icon : "cube",
    status: p.status === "live" ? "live" : "coming-soon",
    compatibility: p.compatibility || "",
    summary: p.summary || "",
    order: Number.isFinite(Number(p.order)) ? Number(p.order) : 999,
    releases: (p.releases || []).map((r) => ({
      _key: r._id || nextKey(),
      version: r.version || "",
      date: r.date || "",
      title: r.title || "",
      highlight: r.highlight || "",
      groups: {
        new: groupItems(r, "new"),
        improved: groupItems(r, "improved"),
        fixed: groupItems(r, "fixed"),
      },
    })),
  };
}

// Editable draft → API payload (groups → changes[], dropping empties).
function toPayload(draft) {
  return {
    slug: draft.slug,
    name: draft.name,
    tagline: draft.tagline,
    category: draft.category,
    accent: draft.accent,
    icon: draft.icon,
    status: draft.status,
    compatibility: draft.compatibility,
    summary: draft.summary,
    order: Number(draft.order) || 0,
    releases: draft.releases.map((r) => ({
      version: r.version,
      date: r.date,
      title: r.title,
      highlight: r.highlight,
      changes: GROUPS.map(({ type }) => ({
        type,
        items: (r.groups[type] || []).map((s) => s.trim()).filter(Boolean),
      })).filter((g) => g.items.length),
    })),
  };
}

function blankRelease() {
  return {
    _key: nextKey(),
    version: "",
    date: "",
    title: "",
    highlight: "",
    groups: { new: [], improved: [], fixed: [] },
  };
}

/* ------------------------------ bullet editor ---------------------------- */

function BulletList({ group, items, onChange }) {
  const { Icon, label, tint } = group;

  const update = (i, val) => onChange(items.map((it, idx) => (idx === i ? val : it)));
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, ""]);

  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${tint} mb-2`}>
        <Icon className="h-3.5 w-3.5" />
        {label}
        <span className="text-slate-400 dark:text-adlm-dark-dim font-normal">
          ({items.length})
        </span>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-2">
            <textarea
              rows={1}
              value={it}
              onChange={(e) => update(i, e.target.value)}
              placeholder={`${label} bullet…`}
              className={`${INPUT} resize-y min-h-[38px]`}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              title="Remove bullet"
              className="mt-1.5 shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-adlm-blue-700 hover:text-adlm-blue-700 dark:border-adlm-dark-border dark:text-adlm-dark-muted dark:hover:border-adlm-blue-400 dark:hover:text-adlm-blue-400"
        >
          <FiPlus className="h-3.5 w-3.5" />
          Add {label.toLowerCase()} bullet
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ release editor --------------------------- */

function ReleaseEditor({ release, index, total, onChange, onRemove, onMove }) {
  const set = (key, val) => onChange({ ...release, [key]: val });
  const setGroup = (type, vals) =>
    onChange({ ...release, groups: { ...release.groups, [type]: vals } });

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-adlm-dark-border dark:bg-adlm-dark-raised/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-adlm-navy px-2.5 py-1 text-xs font-semibold text-white dark:bg-adlm-dark-raised">
            v{release.version || "—"}
          </span>
          {index === 0 ? (
            <span className="rounded-full bg-adlm-orange px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Latest
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
            title="Move up (newer)"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-adlm-dark-hover"
          >
            <FiArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
            title="Move down (older)"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-adlm-dark-hover"
          >
            <FiArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(index)}
            title="Remove release"
            className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
          >
            <FiTrash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[140px_180px_1fr]">
        <div>
          <label className={LABEL}>Version *</label>
          <input
            value={release.version}
            onChange={(e) => set("version", e.target.value)}
            placeholder="3.1.1"
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>Date</label>
          <input
            value={release.date}
            onChange={(e) => set("date", e.target.value)}
            placeholder="June 2026"
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>Title</label>
          <input
            value={release.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Short release title"
            className={INPUT}
          />
        </div>
      </div>

      <div className="mt-3">
        <label className={LABEL}>Highlight (optional)</label>
        <textarea
          rows={2}
          value={release.highlight}
          onChange={(e) => set("highlight", e.target.value)}
          placeholder="One–two sentence summary shown under the title."
          className={`${INPUT} resize-y`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
        {GROUPS.map((g) => (
          <BulletList
            key={g.type}
            group={g}
            items={release.groups[g.type] || []}
            onChange={(vals) => setGroup(g.type, vals)}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- meta form ------------------------------ */

function MetaForm({ draft, onField }) {
  const accent = accentOf(draft.accent);
  const PreviewIcon = iconOf(draft.icon);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <label className={LABEL}>Name</label>
        <input value={draft.name} onChange={(e) => onField("name", e.target.value)} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Slug (URL)</label>
        <input
          value={draft.slug}
          onChange={(e) => onField("slug", e.target.value)}
          placeholder="quiv"
          className={`${INPUT} font-mono`}
        />
      </div>

      <div className="md:col-span-2">
        <label className={LABEL}>Tagline</label>
        <input value={draft.tagline} onChange={(e) => onField("tagline", e.target.value)} className={INPUT} />
      </div>

      <div>
        <label className={LABEL}>Category</label>
        <input
          value={draft.category}
          onChange={(e) => onField("category", e.target.value)}
          placeholder="Revit Plugin"
          className={INPUT}
        />
      </div>
      <div>
        <label className={LABEL}>Compatibility</label>
        <input
          value={draft.compatibility}
          onChange={(e) => onField("compatibility", e.target.value)}
          placeholder="Revit 2024, 2026 & 2027"
          className={INPUT}
        />
      </div>

      <div className="md:col-span-2">
        <label className={LABEL}>Summary</label>
        <textarea
          rows={2}
          value={draft.summary}
          onChange={(e) => onField("summary", e.target.value)}
          className={`${INPUT} resize-y`}
        />
      </div>

      <div>
        <label className={LABEL}>Status</label>
        <select value={draft.status} onChange={(e) => onField("status", e.target.value)} className={INPUT}>
          <option value="live">Live</option>
          <option value="coming-soon">Coming soon</option>
        </select>
      </div>
      <div>
        <label className={LABEL}>Order</label>
        <input
          type="number"
          value={draft.order}
          onChange={(e) => onField("order", e.target.value)}
          className={INPUT}
        />
      </div>

      <div>
        <label className={LABEL}>Accent</label>
        <select value={draft.accent} onChange={(e) => onField("accent", e.target.value)} className={INPUT}>
          {ACCENT_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={LABEL}>Icon</label>
        <select value={draft.icon} onChange={(e) => onField("icon", e.target.value)} className={INPUT}>
          {ICON_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      {/* Live card preview — what the hub will show */}
      <div className="md:col-span-2">
        <label className={LABEL}>Preview</label>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-adlm-dark-border dark:bg-adlm-dark-raised">
          <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${accent.icon}`}>
            <PreviewIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-adlm-dark-text">
              {draft.name || draft.slug || "Untitled"}
              {draft.status === "coming-soon" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-adlm-dark-hover dark:text-adlm-dark-muted">
                  <FiClock className="h-2.5 w-2.5" /> Coming soon
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Live
                </span>
              )}
            </div>
            <div className="truncate text-xs text-slate-500 dark:text-adlm-dark-muted">
              {draft.summary || draft.tagline || "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- page ---------------------------------- */

export default function AdminChangelogs() {
  const { accessToken } = useAuth();

  const [products, setProducts] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  // "+ New product" inline form
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newSlug, setNewSlug] = React.useState("");

  const selected = React.useMemo(
    () => products.find((p) => p._id === selectedId) || null,
    [products, selectedId],
  );

  const load = React.useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiAuthed("/admin/changelogs", { token: accessToken });
      setProducts(Array.isArray(res?.products) ? res.products : []);
    } catch (e) {
      setError(e?.message || "Failed to load changelogs");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  // When the selected product changes, (re)build the editable draft.
  React.useEffect(() => {
    setDraft(selected ? toDraft(selected) : null);
    setDirty(false);
  }, [selected]);

  function confirmDiscard() {
    return !dirty || window.confirm("Discard unsaved changes?");
  }

  function selectProduct(id) {
    if (id === selectedId) return;
    if (!confirmDiscard()) return;
    setSelectedId(id);
    setNotice("");
    setError("");
  }

  /* ----- draft mutations ----- */
  const setField = (key, val) => {
    setDraft((d) => ({ ...d, [key]: val }));
    setDirty(true);
  };
  const setRelease = (idx, next) => {
    setDraft((d) => {
      const releases = d.releases.slice();
      releases[idx] = next;
      return { ...d, releases };
    });
    setDirty(true);
  };
  const addRelease = () => {
    setDraft((d) => ({ ...d, releases: [blankRelease(), ...d.releases] }));
    setDirty(true);
  };
  const removeRelease = (idx) => {
    setDraft((d) => ({ ...d, releases: d.releases.filter((_, i) => i !== idx) }));
    setDirty(true);
  };
  const moveRelease = (idx, dir) => {
    setDraft((d) => {
      const releases = d.releases.slice();
      const j = idx + dir;
      if (j < 0 || j >= releases.length) return d;
      [releases[idx], releases[j]] = [releases[j], releases[idx]];
      return { ...d, releases };
    });
    setDirty(true);
  };

  /* ----- server actions ----- */
  async function createProduct(e) {
    e?.preventDefault?.();
    const name = newName.trim();
    const slug = (newSlug.trim() || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) {
      setError("Enter a name or slug for the new product.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await apiAuthed("/admin/changelogs", {
        token: accessToken,
        method: "POST",
        body: { name: name || slug, slug, status: "coming-soon" },
      });
      const created = res?.product;
      if (created) {
        setProducts((prev) =>
          [...prev, created].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.name || "").localeCompare(b.name || "")),
        );
        setSelectedId(created._id);
      }
      setCreating(false);
      setNewName("");
      setNewSlug("");
      setNotice(`Created "${created?.name || slug}".`);
    } catch (e) {
      setError(e?.message || "Failed to create product");
    } finally {
      setSaving(false);
    }
  }

  async function saveProduct() {
    if (!draft) return;
    if (!draft.slug.trim()) {
      setError("Slug cannot be empty.");
      return;
    }
    const missing = draft.releases.find((r) => !r.version.trim());
    if (missing) {
      setError("Every release needs a version. Fill it in or remove the release.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await apiAuthed(`/admin/changelogs/${draft._id}`, {
        token: accessToken,
        method: "PUT",
        body: toPayload(draft),
      });
      const saved = res?.product;
      if (saved) {
        setProducts((prev) =>
          prev
            .map((p) => (p._id === saved._id ? saved : p))
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.name || "").localeCompare(b.name || "")),
        );
      }
      setDirty(false);
      setNotice("Saved. The public What's New page now reflects these changes.");
    } catch (e) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct() {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name || selected.slug}" and all its releases? This cannot be undone.`)) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiAuthed(`/admin/changelogs/${selected._id}`, {
        token: accessToken,
        method: "DELETE",
      });
      setProducts((prev) => prev.filter((p) => p._id !== selected._id));
      setSelectedId(null);
      setNotice("Product deleted.");
    } catch (e) {
      setError(e?.message || "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  /* -------------------------------- render -------------------------------- */
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-adlm-dark-bg md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-adlm-dark-text">
              <span aria-hidden className="h-6 w-1.5 rounded-full bg-gradient-to-b from-adlm-orange to-amber-400" />
              What&apos;s New
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-adlm-dark-muted">
              Manage product release notes shown on the public{" "}
              <Link to="/whats-new" className="font-medium text-adlm-blue-700 hover:underline dark:text-adlm-blue-400">
                What&apos;s New
              </Link>{" "}
              pages.
            </p>
          </div>
          <Link
            to="/whats-new"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white dark:border-adlm-dark-border dark:text-adlm-dark-text dark:hover:bg-adlm-dark-hover"
          >
            <FiExternalLink className="h-4 w-4" />
            View public page
          </Link>
        </header>

        {/* Banners */}
        {error ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            <span>{error}</span>
            <button onClick={() => setError("")} className="shrink-0 hover:opacity-70">
              <FiX className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {notice ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} className="shrink-0 hover:opacity-70">
              <FiX className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
          {/* ---------------- Product list ---------------- */}
          <aside className={`${CARD} h-max p-3`}>
            <div className="flex items-center justify-between px-1 pb-2">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-adlm-dark-text">
                Products ({products.length})
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCreating((v) => !v);
                  setError("");
                }}
                className="inline-flex items-center gap-1 rounded-md bg-adlm-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0050c8]"
              >
                <FiPlus className="h-3.5 w-3.5" />
                New
              </button>
            </div>

            {creating ? (
              <form onSubmit={createProduct} className="mb-3 space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-adlm-dark-raised">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Product name"
                  className={INPUT}
                />
                <input
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="slug (optional)"
                  className={`${INPUT} font-mono`}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-md bg-adlm-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0050c8] disabled:opacity-60"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-adlm-dark-hover"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {loading ? (
              <p className="px-1 py-6 text-center text-sm text-slate-400">Loading…</p>
            ) : products.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-slate-400">
                No products yet. Create one, or run the seed script.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {products.map((p) => {
                  const Icon = iconOf(p.icon);
                  const accent = accentOf(p.accent);
                  const active = p._id === selectedId;
                  const releaseCount = (p.releases || []).length;
                  return (
                    <li key={p._id}>
                      <button
                        type="button"
                        onClick={() => selectProduct(p._id)}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                          active
                            ? "border-adlm-blue-700 bg-adlm-blue-700/5 dark:border-adlm-blue-400 dark:bg-adlm-blue-400/10"
                            : "border-transparent hover:bg-slate-50 dark:hover:bg-adlm-dark-hover"
                        }`}
                      >
                        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent.icon}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-adlm-dark-text">
                            {p.name || p.slug}
                          </span>
                          <span className="block truncate text-xs text-slate-400 dark:text-adlm-dark-dim">
                            {releaseCount} release{releaseCount === 1 ? "" : "s"}
                            {p.status === "coming-soon" ? " · coming soon" : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* ---------------- Editor ---------------- */}
          <section className="min-w-0">
            {!draft ? (
              <div className={`${CARD} grid place-items-center px-6 py-20 text-center`}>
                <div>
                  <p className="text-sm text-slate-500 dark:text-adlm-dark-muted">
                    Select a product on the left to edit its release notes,
                  </p>
                  <p className="text-sm text-slate-500 dark:text-adlm-dark-muted">
                    or create a new one.
                  </p>
                </div>
              </div>
            ) : (
              <Reveal>
                <div className="space-y-6">
                  {/* Metadata */}
                  <div className={`${CARD} p-5`}>
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-adlm-dark-text">
                        Product details
                      </h2>
                      <button
                        type="button"
                        onClick={deleteProduct}
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-500/10"
                      >
                        <FiTrash2 className="h-3.5 w-3.5" />
                        Delete product
                      </button>
                    </div>
                    <MetaForm draft={draft} onField={setField} />
                  </div>

                  {/* Releases */}
                  <div className={`${CARD} p-5`}>
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-adlm-dark-text">
                        Releases ({draft.releases.length})
                      </h2>
                      <button
                        type="button"
                        onClick={addRelease}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-adlm-blue-700 hover:text-adlm-blue-700 dark:border-adlm-dark-border dark:text-adlm-dark-text dark:hover:border-adlm-blue-400 dark:hover:text-adlm-blue-400"
                      >
                        <FiPlus className="h-4 w-4" />
                        Add release
                      </button>
                    </div>

                    {draft.releases.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400 dark:border-adlm-dark-border">
                        No releases yet. Add one — the top release is shown as “Latest”.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {draft.releases.map((r, i) => (
                          <ReleaseEditor
                            key={r._key}
                            release={r}
                            index={i}
                            total={draft.releases.length}
                            onChange={(next) => setRelease(i, next)}
                            onRemove={removeRelease}
                            onMove={moveRelease}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Sticky save bar */}
                  <div className="sticky bottom-4 z-10">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-depth backdrop-blur dark:border-adlm-dark-border dark:bg-adlm-dark-panel/95">
                      <span className="text-xs text-slate-500 dark:text-adlm-dark-muted">
                        {dirty ? "Unsaved changes" : "All changes saved"}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (confirmDiscard()) {
                              setDraft(toDraft(selected));
                              setDirty(false);
                            }
                          }}
                          disabled={!dirty || saving}
                          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:text-adlm-dark-text dark:hover:bg-adlm-dark-hover"
                        >
                          <FiRotateCcw className="h-4 w-4" />
                          Revert
                        </button>
                        <button
                          type="button"
                          onClick={saveProduct}
                          disabled={saving || !dirty}
                          className="inline-flex items-center gap-1.5 rounded-md bg-adlm-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0050c8] disabled:opacity-60"
                        >
                          <FiSave className="h-4 w-4" />
                          {saving ? "Saving…" : "Save changes"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
