// client/src/pages/AdminLatest.jsx
// Curates the rotating "Latest from ADLM" band on the marketing pages.
// Pick what a visitor sees this week — a release, a course opening, a video, a
// LinkedIn post — without a code change. Gated by the "latest" permission area.
import React from "react";
import { FiBell } from "../components/icons.jsx";
import AdminPageHeader from "../components/AdminPageHeader.jsx";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

// Mirrors KINDS in server/models/LatestItem.js — the value drives the default
// chip shown above the headline.
const KINDS = [
  ["whats-new", "New release"],
  ["software", "Software update"],
  ["course", "Course open"],
  ["video", "New video"],
  ["linkedin", "From LinkedIn"],
  ["development", "In development"],
  ["custom", "(no chip)"],
];

const BLANK = {
  kind: "whats-new",
  tag: "",
  title: "",
  blurb: "",
  imageUrl: "",
  ctaLabel: "Read more",
  ctaHref: "",
  published: true,
  sort: 0,
};

const FIELD =
  "w-full border rounded px-3 py-2 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border";

export default function AdminLatest() {
  const { accessToken } = useAuth();
  const [state, setState] = React.useState({ status: "loading", items: [] });
  const [draft, setDraft] = React.useState(BLANK);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const out = await apiAuthed("/admin/latest", { token: accessToken });
      setState({ status: "ready", items: out.items || [] });
    } catch (err) {
      setState({ status: "error", items: [], error: String(err.message || err) });
    }
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setBusy(true);
    try {
      await apiAuthed("/admin/latest", { method: "POST", token: accessToken, body: draft });
      setDraft(BLANK);
      await load();
    } catch (err) {
      alert(`Could not add: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id, body) {
    setBusy(true);
    try {
      await apiAuthed(`/admin/latest/${id}`, { method: "PATCH", token: accessToken, body });
      await load();
    } catch (err) {
      alert(`Could not update: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id, title) {
    if (!window.confirm(`Remove "${title}" from the band?`)) return;
    setBusy(true);
    try {
      await apiAuthed(`/admin/latest/${id}`, { method: "DELETE", token: accessToken });
      await load();
    } catch (err) {
      alert(`Could not remove: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  const { status, items } = state;
  const live = items.filter((i) => i.published).length;

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        icon={FiBell}
        title="Latest from ADLM"
        subtitle="The rotating band near the foot of every marketing page. Lowest sort order shows first."
      />

      <p className="text-sm text-slate-500 mb-6">
        {live} item{live === 1 ? "" : "s"} live.{" "}
        {live === 0 && "With none published the band falls back to its built-in items."}
      </p>

      {/* ── add ─────────────────────────────────────────────────── */}
      <form onSubmit={create} className="grid gap-3 md:grid-cols-2 mb-8 max-w-4xl">
        <label className="md:col-span-2">
          <span className="block text-xs mb-1">Headline</span>
          <input
            className={FIELD}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Time Pro 1.1.1, dark mode and MS Project exports"
            required
          />
        </label>
        <label className="md:col-span-2">
          <span className="block text-xs mb-1">Supporting line</span>
          <input
            className={FIELD}
            value={draft.blurb}
            onChange={(e) => setDraft({ ...draft, blurb: e.target.value })}
            placeholder="Plus a rebuilt side menu and weather-aware site records."
          />
        </label>
        <label>
          <span className="block text-xs mb-1">Kind</span>
          <select
            className={FIELD}
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
          >
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-xs mb-1">Chip override (optional)</span>
          <input
            className={FIELD}
            value={draft.tag}
            onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
            placeholder="Leave blank to use the kind"
          />
        </label>
        <label>
          <span className="block text-xs mb-1">Image URL</span>
          <input
            className={FIELD}
            value={draft.imageUrl}
            onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
            placeholder="/ds/hd-work.jpg or a Cloudinary URL"
          />
        </label>
        <label>
          <span className="block text-xs mb-1">Link</span>
          <input
            className={FIELD}
            value={draft.ctaHref}
            onChange={(e) => setDraft({ ...draft, ctaHref: e.target.value })}
            placeholder="/whats-new  or  https://linkedin.com/..."
          />
        </label>
        <label>
          <span className="block text-xs mb-1">Button label</span>
          <input
            className={FIELD}
            value={draft.ctaLabel}
            onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
          />
        </label>
        <label>
          <span className="block text-xs mb-1">Sort order</span>
          <input
            type="number"
            className={FIELD}
            value={draft.sort}
            onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value) })}
          />
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded bg-adlm-orange text-white text-sm disabled:opacity-60"
          >
            Add to the band
          </button>
        </div>
      </form>

      {status === "loading" && <p className="text-slate-500">Loading…</p>}
      {status === "error" && <p className="text-red-600">Could not load: {state.error}</p>}

      {status === "ready" && items.length === 0 && (
        <p className="text-slate-500">
          Nothing curated yet. The band is showing its built-in items.
        </p>
      )}

      {/* ── list ────────────────────────────────────────────────── */}
      <div className="grid gap-3">
        {items.map((it) => (
          <div
            key={it._id}
            className="flex flex-wrap items-center gap-3 border rounded p-3 dark:border-adlm-dark-border"
          >
            <input
              type="number"
              className="w-16 border rounded px-2 py-1 text-sm dark:bg-adlm-dark-panel dark:border-adlm-dark-border"
              defaultValue={it.sort}
              onBlur={(e) =>
                Number(e.target.value) !== it.sort &&
                patch(it._id, { sort: Number(e.target.value) })
              }
              title="Sort order"
            />
            {it.imageUrl ? (
              <img src={it.imageUrl} alt="" className="w-16 h-10 object-cover rounded" />
            ) : (
              <span className="w-16 h-10 rounded bg-slate-200 dark:bg-adlm-dark-raised" />
            )}
            <div className="flex-1 min-w-[220px]">
              <div className="text-xs text-slate-500">
                {it.tag || KINDS.find(([v]) => v === it.kind)?.[1]}
              </div>
              <div className="font-medium">{it.title}</div>
              {it.ctaHref && <div className="text-xs text-slate-500">{it.ctaHref}</div>}
            </div>
            <label className="text-sm flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={it.published}
                disabled={busy}
                onChange={(e) => patch(it._id, { published: e.target.checked })}
              />
              Live
            </label>
            <button
              type="button"
              className="text-xs text-red-600 underline"
              disabled={busy}
              onClick={() => remove(it._id, it.title)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
