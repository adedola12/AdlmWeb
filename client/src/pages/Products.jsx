import React from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

/* ---------- Small helpers ---------- */
function CardVideo({ src, poster }) {
  const ref = React.useRef(null);
  const onEnter = () => ref.current?.play();
  const onLeave = () => {
    if (ref.current) {
      ref.current.pause();
      ref.current.currentTime = 0;
    }
  };
  return (
    <div
      className="rounded-xl overflow-hidden border aspect-video bg-black"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {src ? (
        <video
          ref={ref}
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
          src={src}
          poster={poster || undefined}
        />
      ) : (
        poster && <img src={poster} className="w-full h-full object-cover" />
      )}
    </div>
  );
}

const ngn = (n) => `₦${(Number(n) || 0).toLocaleString()}`;

/* ---------- Page ---------- */
export default function Products() {
  const [qs, setQs] = useSearchParams();
  const pageFromQs = Math.max(parseInt(qs.get("page") || "1", 10), 1);
  const [page, setPage] = React.useState(pageFromQs);
  const pageSize = 9; // 3x3
  const [data, setData] = React.useState({
    items: [],
    total: 0,
    page,
    pageSize,
  });
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  // admin-only edit state
  const [editingId, setEditingId] = React.useState(null);
  const [draft, setDraft] = React.useState({});
  const isEditing = (id) => editingId === id;

  const { user, accessToken } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();

  /* ---------- Load products ---------- */
  async function load() {
    setLoading(true);
    setMsg("");
    try {
      // const res = await fetch(
      //   `${API_BASE}/products?page=${page}&pageSize=${pageSize}`,
      //   { credentials: "include" }
      // );
      // const json = await res.json();
      // setData(json);

      if (isAdmin) {
        // admin endpoint returns full list; add client-side paging
        const res = await apiAuthed(`/admin/products`, { token: accessToken });
        const all = Array.isArray(res) ? res : [];
        const total = all.length;
        const start = (page - 1) * pageSize;
        const items = all.slice(start, start + pageSize);
        setData({ items, total, page, pageSize });
      } else {
        const res = await fetch(
          `${API_BASE}/products?page=${page}&pageSize=${pageSize}`,
          { credentials: "include" }
        );
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      setMsg(e.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    setQs(
      (p) => {
        const n = new URLSearchParams(p);
        n.set("page", String(page));
        return n;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const pages = Math.max(Math.ceil(data.total / pageSize), 1);
  const hasPrev = page > 1;
  const hasNext = page < pages;

  function goPurchase(key, months = 1) {
    if (!user) {
      const next = encodeURIComponent(
        `/purchase?product=${key}&months=${months}`
      );
      return navigate(`/login?next=${next}`);
    }
    navigate(`/purchase?product=${key}&months=${months}`);
  }

  /* ---------- Admin: start/stop edit ---------- */
  function startEdit(p) {
    setEditingId(p._id);
    setDraft({
      name: p.name || "",
      blurb: p.blurb || "",
      description: p.description || "",
      // store features as \n-separated string for a simple textarea editor
      featuresText: Array.isArray(p.features) ? p.features.join("\n") : "",
      billingInterval: p.billingInterval || "monthly",
      monthlyNGN: p.price?.monthlyNGN ?? 0,
      yearlyNGN: p.price?.yearlyNGN ?? 0,
      installNGN: p.price?.installNGN ?? 0,
      monthlyUSD: p.price?.monthlyUSD ?? "",
      yearlyUSD: p.price?.yearlyUSD ?? "",
      installUSD: p.price?.installUSD ?? "",
      previewUrl: p.previewUrl || "",
      thumbnailUrl: p.thumbnailUrl || "",
      isPublished: !!p.isPublished,
      sort: p.sort ?? 0,
    });
  }
  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }

  /* ---------- Admin: save edit ---------- */
  async function saveEdit(p) {
    try {
      setMsg("");
      // build payload — keep to fields your PATCH allows
      const payload = {
        name: draft.name,
        blurb: draft.blurb,
        description: draft.description,
        features: (draft.featuresText || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        billingInterval: draft.billingInterval,
        price: {
          monthlyNGN: Number(draft.monthlyNGN || 0),
          yearlyNGN: Number(draft.yearlyNGN || 0),
          installNGN: Number(draft.installNGN || 0),
        },
        previewUrl: draft.previewUrl || undefined,
        thumbnailUrl: draft.thumbnailUrl || undefined,
        isPublished: !!draft.isPublished,
        sort: Number(draft.sort || 0),
      };

      // optional USD overrides if set (empty string = remove)
      if (draft.monthlyUSD !== "")
        payload.price.monthlyUSD = Number(draft.monthlyUSD);
      else payload.price.monthlyUSD = undefined;

      if (draft.yearlyUSD !== "")
        payload.price.yearlyUSD = Number(draft.yearlyUSD);
      else payload.price.yearlyUSD = undefined;

      if (draft.installUSD !== "")
        payload.price.installUSD = Number(draft.installUSD);
      else payload.price.installUSD = undefined;

      await apiAuthed(`/admin/products/${p._id}`, {
        token: accessToken,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      await load();
      setMsg("Product updated.");
      cancelEdit();
    } catch (e) {
      setMsg(e.message || "Failed to update product");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>

        {/* Admin-only Add Product button */}
        {isAdmin && (
          <Link className="btn btn-sm" to="/admin/products" title="Add product">
            Add product
          </Link>
        )}
      </div>

      {msg && <div className="text-sm">{msg}</div>}

      {loading ? (
        <div className="text-sm text-slate-600">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.items.map((p) => {
              const yearly = p.price?.yearlyNGN || 0;
              const monthly = p.price?.monthlyNGN || 0;
              const cadence = p.billingInterval === "yearly" ? "year" : "month";
              const unit = p.billingInterval === "yearly" ? yearly : monthly;
              const editing = isEditing(p._id);

              return (
                <article key={p._id} className="card flex flex-col">
                  <CardVideo src={p.previewUrl} poster={p.thumbnailUrl} />

                  {/* Name + NGN price inline */}
                  <Link
                    to={`/product/${encodeURIComponent(p.key)}`}
                    className="mt-3 text-lg font-semibold hover:text-blue-700"
                    title={p.name}
                  >
                    {p.name}
                    {" · "}
                    <span className="font-normal text-slate-700">
                      {ngn(unit)} / {cadence}
                    </span>
                  </Link>

                  {p.blurb && !editing && (
                    <p className="mt-1 text-slate-600">{p.blurb}</p>
                  )}

                  {/* Admin inline editor */}
                  {editing && isAdmin ? (
                    <div className="mt-3 space-y-2 text-sm">
                      <input
                        className="input"
                        value={draft.name}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, name: e.target.value }))
                        }
                        placeholder="Name"
                      />
                      <textarea
                        className="input"
                        rows={2}
                        value={draft.blurb}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, blurb: e.target.value }))
                        }
                        placeholder="Short blurb"
                      />

                      {/* Full description */}
                      <textarea
                        className="input"
                        rows={6}
                        value={draft.description}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            description: e.target.value,
                          }))
                        }
                        placeholder="Full product description (markdown or HTML allowed)"
                      />

                      {/* Features (one per line) */}
                      <label className="text-xs">
                        Features (one per line)
                        <textarea
                          className="input mt-1"
                          rows={5}
                          value={draft.featuresText}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              featuresText: e.target.value,
                            }))
                          }
                          placeholder={`Feature 1\nFeature 2\nFeature 3`}
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs">Billing interval</span>
                        <select
                          className="input"
                          value={draft.billingInterval}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              billingInterval: e.target.value,
                            }))
                          }
                        >
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </label>

                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-xs">
                          NGN / month
                          <input
                            className="input mt-1"
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.monthlyNGN}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                monthlyNGN: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="text-xs">
                          NGN / year
                          <input
                            className="input mt-1"
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.yearlyNGN}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                yearlyNGN: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="text-xs">
                          NGN install
                          <input
                            className="input mt-1"
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.installNGN}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                installNGN: e.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-xs">
                          USD / month (opt)
                          <input
                            className="input mt-1"
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.monthlyUSD}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                monthlyUSD: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="text-xs">
                          USD / year (opt)
                          <input
                            className="input mt-1"
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.yearlyUSD}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                yearlyUSD: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="text-xs">
                          USD install (opt)
                          <input
                            className="input mt-1"
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.installUSD}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                installUSD: e.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>

                      <input
                        className="input"
                        placeholder="Preview video URL"
                        value={draft.previewUrl}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            previewUrl: e.target.value,
                          }))
                        }
                      />
                      <input
                        className="input"
                        placeholder="Thumbnail image URL"
                        value={draft.thumbnailUrl}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            thumbnailUrl: e.target.value,
                          }))
                        }
                      />

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!draft.isPublished}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                isPublished: e.target.checked,
                              }))
                            }
                          />
                          Published
                        </label>

                        <label className="text-xs">
                          Sort
                          <input
                            className="input ml-2 w-24"
                            type="number"
                            value={draft.sort}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                sort: Number(e.target.value || 0),
                              }))
                            }
                          />
                        </label>
                      </div>

                      <div className="flex gap-2 mt-1">
                        <button
                          className="btn btn-sm"
                          onClick={() => saveEdit(p)}
                          title="Save changes"
                        >
                          Save
                        </button>
                        <button className="btn btn-sm" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            goPurchase(
                              p.key,
                              p.billingInterval === "yearly" ? 1 : 1
                            )
                          }
                        >
                          Purchase
                        </button>
                        <Link
                          className="btn btn-sm"
                          to={`/product/${encodeURIComponent(p.key)}`}
                        >
                          View details
                        </Link>

                        {/* Admin-only Edit button */}
                        {isAdmin && (
                          <button
                            className="btn btn-sm"
                            onClick={() =>
                              navigate(`/admin/products/${p._id}/edit`)
                            }
                            title="Edit product"
                          >
                            Edit
                          </button>
                        )}
                      </div>

                      {isAdmin && (
                        <div className="mt-2 text-xs text-slate-600">
                          {p.isPublished ? "Published" : "Hidden"} · sort{" "}
                          {p.sort}
                        </div>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              className="btn btn-sm"
              disabled={!hasPrev}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <div className="text-sm text-slate-600">
              Page {page} of {pages}
            </div>
            <button
              className="btn btn-sm"
              disabled={!hasNext}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
