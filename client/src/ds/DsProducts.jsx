// His Products screen, on the real catalogue.
//
// His version lists seven products against a sample tenant that holds three of
// them. Ours lists whatever /products publishes, split by whether this account
// actually holds a licence — so the filter counts, the seat lines and the
// "not subscribed" wording are all consequences of the data rather than
// numbers typed into the markup.
//
// His markup: .dsh-head / .dsh-seg / .dsh-grid / .dsh-card / .pill / .foot2.
// The `off` class on a card is his way of dimming one the account does not
// hold, and it carries through here unchanged.
//
// Feature grants (boq-import, ai) are deliberately not cards. They are
// switches on a product somebody already owns, with no seat and nothing to
// install, and giving them a card with a "Manage" button implies a screen that
// does not exist. The overview lists them under Feature access instead.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { API_BASE } from "../config.js";
import { useAuth } from "../store.jsx";

// His icons are per-product PNGs; ours are keyed by the catalogue's own keys,
// which are the legacy CAD-host slugs rather than the product names.
const ICONS = {
  revit: "/ds/ic-quiv.png",
  planswift: "/ds/ic-heron.png",
  rategen: "/ds/ic-rategen.png",
  mep: "/ds/ic-mep.png",
  "qs-takeoff": "/ds/ic-timepro.png",
  civil3d: "/ds/ic-civiq.png",
};

const FILTERS = [
  { id: "all", label: "All products" },
  { id: "sub", label: "Covered by the account" },
  { id: "avail", label: "Available to add" },
];

export default function DsProducts() {
  const { accessToken } = useAuth();
  const [summary, setSummary] = React.useState(null);
  const [catalogue, setCatalogue] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [filter, setFilter] = React.useState("all");

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;

    apiAuthed("/me/summary", { token: accessToken })
      .then((d) => alive && setSummary(d))
      .catch(() => alive && setFailed(true));

    fetch(`${API_BASE}/products`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (!alive || !raw) return;
        const all = Array.isArray(raw) ? raw : raw.items || raw.products || [];
        setCatalogue(all.filter((p) => !p.isCourse));
      })
      .catch(() => alive && setFailed(true));

    return () => {
      alive = false;
    };
  }, [accessToken]);

  const cards = React.useMemo(() => {
    if (!summary || !catalogue) return null;

    const held = new Map();
    for (const e of summary.entitlements || []) {
      if (e.isCourse) continue;
      held.set(e.productKey, e);
    }

    return catalogue.map((p) => {
      const ent = held.get(p.key) || null;
      const owned = ent ? Number(ent.seats) || 1 : 0;
      // seatsUsed, not devices.length — see the note in DsManageOverview.
      const used = ent ? Number(ent.seatsUsed) || 0 : 0;

      let pill = null;
      if (ent && ent.status === "active" && !ent.isExpired) {
        pill = { cls: "pill-a", text: "Current" };
      } else if (ent && ent.isExpired) {
        pill = { cls: "pill-b", text: "Expired" };
      } else if (ent) {
        pill = { cls: "pill-b", text: ent.status || "Inactive" };
      }

      // The line under the name. His reads "v3.1.7 · 2 of 2 seats in use"; we
      // do not publish a version per product on the catalogue, so it carries
      // the seat position instead, which is the part that changes.
      let sub;
      if (ent) {
        sub = `${used} of ${owned} seat${owned === 1 ? "" : "s"} in use`;
        if (ent.expiresAt) {
          sub += ` · ${ent.isExpired ? "expired" : "renews"} ${new Date(
            ent.expiresAt,
          ).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
        }
      } else if (p.isComingSoon) {
        sub = "In development";
      } else {
        sub = "Not in the subscription";
      }

      return {
        key: p.key,
        name: p.name,
        blurb: p.blurb || "",
        icon: ICONS[p.key] || "",
        cat: ent ? "sub" : "avail",
        off: !ent,
        comingSoon: !!p.isComingSoon,
        spare: ent ? owned - used : 0,
        pill,
        sub,
      };
    });
  }, [summary, catalogue]);

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="sub">Your products could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!cards) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading your products…</p>
      </div>
    );
  }

  const shown = cards.filter((c) => filter === "all" || c.cat === filter);
  const ownedCount = cards.filter((c) => c.cat === "sub").length;

  return (
    <div className="dsh-in">
      <div className="dsh-head">
        <div>
          <h1>Products</h1>
          <p>
            {ownedCount
              ? `${ownedCount} of ${cards.length} on this account. The rest are listed so you can see what it could cover: nothing here is charged until you add it.`
              : "Nothing is licensed on this account yet. Everything ADLM makes is listed here, and nothing is charged until you add it."}
          </p>
        </div>
        <div className="dsh-acts">
          <Link className="btn btn-o btn-sm" to="/pricing">
            See pricing
          </Link>
          <Link className="btn btn-p btn-sm" to="/contact">
            Talk to us about seats
          </Link>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <div className="dsh-seg">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={filter === f.id ? "on" : ""}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: "12.5px", color: "var(--ink-3)" }}>
          {shown.length} item{shown.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="dsh-grid">
        {shown.map((c) => (
          <article key={c.key} className={c.off ? "dsh-card off" : "dsh-card"}>
            <div className="top">
              {c.icon ? <img className="picon" src={c.icon} alt="" /> : <span className="picon" />}
              <div>
                <h3>{c.name}</h3>
                <span className="ver">{c.sub}</span>
              </div>
              {c.pill && <span className={`pill ${c.pill.cls}`}>{c.pill.text}</span>}
            </div>
            <p>{c.blurb}</p>
            <div className="foot2">
              {c.cat === "sub" ? (
                <>
                  <Link className="btn btn-o btn-sm" to="/manage/downloads">
                    Download
                  </Link>
                  <Link
                    className={c.spare > 0 ? "btn btn-p btn-sm" : "btn btn-o btn-sm"}
                    to="/manage/team"
                  >
                    {c.spare > 0
                      ? `Assign ${c.spare === 1 ? "the spare seat" : `${c.spare} spare seats`}`
                      : "Seats"}
                  </Link>
                </>
              ) : c.comingSoon ? (
                <Link className="btn btn-o btn-sm" to={`/product/${c.key}`}>
                  Join the waitlist
                </Link>
              ) : (
                <>
                  <Link className="btn btn-o btn-sm" to={`/product/${c.key}`}>
                    What it does
                  </Link>
                  <Link className="btn btn-p btn-sm" to={`/purchase?product=${c.key}`}>
                    Add to subscription
                  </Link>
                </>
              )}
            </div>
          </article>
        ))}
      </div>

      {!shown.length && (
        <p className="sub" style={{ marginTop: 8 }}>
          Nothing in this view.
        </p>
      )}
    </div>
  );
}
