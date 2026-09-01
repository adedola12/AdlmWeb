// Storage — who is running out of room, and granting them more.
//
// WHAT THIS SCREEN IS FOR
//
// A subscription carries a number of project slots. When someone fills theirs
// they cannot start another project, and the first anyone hears about it is a
// support ticket. So the screen is ordered by how full each account is rather
// than alphabetically: the row that needs attention is the row at the top.
//
// The old screen listed the same figures in signup order behind a "Click
// Refresh to load storage data" button, which meant the one question it could
// answer — who is about to be stuck — took a scroll and a squint. Nothing here
// is new data. It is the same endpoint, sorted by urgency and summarised.
//
// GRANTING SLOTS IS AN ENTITLEMENT WRITE
//
// Extra slots are stored on the entitlement, not on a storage record, which is
// why saving posts to /admin/users/entitlement. The grant is per user AND per
// product: the same person can be generous on QUIV and tight on HERON.

import React from "react";
import { useNavigate } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip, AdmFilters } from "./adminUi.jsx";
import { useAdmToast } from "./adminKit.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

/** How full, as a whole number. A limit of zero is not 0% — it is unmetered. */
const fillOf = (r) => {
  const limit = Number(r.limit) || 0;
  if (limit <= 0) return null;
  return Math.round(((Number(r.used) || 0) / limit) * 100);
};

/**
 * Three bands, because they are three different situations: full is a person
 * who cannot work, filling is a person to talk to, and the rest is noise.
 */
const bandOf = (pct) => (pct == null ? "open" : pct >= 90 ? "full" : pct >= 70 ? "filling" : "fine");

const BAND_TONE = { full: "bad", filling: "due", fine: "ok", open: "" };
const BAND_WORD = { full: "nearly full", filling: "filling up", fine: "comfortable", open: "unmetered" };

/** His fill bar. Colour carries the same meaning as the chip, not a new one. */
function Fill({ pct }) {
  if (pct == null) return <AdmDim>—</AdmDim>;
  return (
    <span className={`adm-fill is-${bandOf(pct)}`}>
      <i style={{ width: `${Math.min(pct, 100)}%` }} />
      <b>{pct}%</b>
    </span>
  );
}

export default function DsAdminStorage() {
  const { accessToken } = useAuth();
  const nav = useNavigate();
  const [say, toast] = useAdmToast();

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState("all");
  const [edit, setEdit] = React.useState(null); // { key, value }
  const [saving, setSaving] = React.useState(false);
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    setFailed(false);
    // Loads on open. The old screen waited behind a Refresh button, which is a
    // question the screen could have answered without being asked.
    apiAuthed("/admin/storage", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  const rows = React.useMemo(() => {
    const all = (d?.rows || []).map((r) => {
      const pct = fillOf(r);
      return { ...r, pct, band: bandOf(pct), key: `${r.email}::${r.productKey}` };
    });
    // Fullest first. An unmetered row has no urgency, so it sorts last rather
    // than sorting as zero and sitting above accounts that are 60% full.
    all.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.email.localeCompare(b.email));
    return view === "all" ? all : all.filter((r) => r.band === view);
  }, [d, view]);

  const counts = React.useMemo(() => {
    const c = { all: 0, full: 0, filling: 0, fine: 0, open: 0 };
    for (const r of d?.rows || []) {
      c.all += 1;
      c[bandOf(fillOf(r))] += 1;
    }
    return c;
  }, [d]);

  const grantedSlots = (d?.rows || []).reduce((t, r) => t + (Number(r.extraSlots) || 0), 0);

  async function save(row) {
    const slots = Number(edit?.value);
    if (!Number.isFinite(slots) || slots < 0) {
      say("Extra slots must be zero or more.");
      return;
    }
    setSaving(true);
    try {
      await apiAuthed("/admin/users/entitlement", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: row.email,
          productKey: row.productKey,
          extraProjectSlots: slots,
        }),
      });
      // Closing the editor is keyed off the same string that opened it. The old
      // screen wrote "storage::a@b::quiv" and deleted "a@b::quiv", so the row
      // stayed in edit mode after a successful save and looked unsaved.
      setEdit(null);
      setReload((n) => n + 1);
      say(`${row.email} now has ${slots} extra slot${slots === 1 ? "" : "s"} on ${row.productKey}.`);
    } catch (err) {
      say(err?.message || "Those slots could not be granted.");
    } finally {
      setSaving(false);
    }
  }

  if (failed) {
    return <p className="adm-note">Storage could not be read just now. Please refresh.</p>;
  }

  const prices = Object.entries(d?.slotPriceByKey || {});

  const cols = [
    {
      h: "Account",
      w: "26%",
      cell: (r) => <AdmTwo top={r.email} under={r.username ? `@${r.username}` : ""} />,
    },
    { h: "Product", cell: (r) => r.productKey },
    {
      h: "Projects",
      num: true,
      cell: (r) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {r.used} / {r.limit || <AdmDim>∞</AdmDim>}
        </span>
      ),
    },
    { h: "How full", w: "16%", cell: (r) => <Fill pct={r.pct} /> },
    {
      h: "",
      cell: (r) => <AdmChip tone={BAND_TONE[r.band]}>{BAND_WORD[r.band]}</AdmChip>,
    },
    {
      h: "Extra slots",
      num: true,
      cell: (r) =>
        edit?.key === r.key ? (
          <span className="adm-inline">
            <input
              type="number"
              min="0"
              step="1"
              value={edit.value}
              autoFocus
              onChange={(e) => setEdit({ key: r.key, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") save(r);
                if (e.key === "Escape") setEdit(null);
              }}
              aria-label={`Extra slots for ${r.email} on ${r.productKey}`}
            />
            <button type="button" className="adm-b" disabled={saving} onClick={() => save(r)}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="adm-b" onClick={() => setEdit(null)}>
              Cancel
            </button>
          </span>
        ) : (
          <span className="adm-inline">
            <b style={{ fontVariantNumeric: "tabular-nums" }}>
              {r.extraSlots ? `+${r.extraSlots}` : <AdmDim>none</AdmDim>}
            </b>
            <button
              type="button"
              className="adm-b"
              onClick={() => setEdit({ key: r.key, value: String(r.extraSlots || 0) })}
            >
              Grant
            </button>
          </span>
        ),
    },
    {
      h: "Slot price",
      num: true,
      cell: (r) =>
        r.slotUpgradePrice != null ? (
          money(r.slotUpgradePrice)
        ) : (
          // Not "₦0". No price set means the 3% default applies, and showing a
          // zero would read as free.
          <AdmDim>3% default</AdmDim>
        ),
    },
    {
      h: "",
      cell: (r) => (
        <button
          type="button"
          className="adm-b"
          onClick={() => nav(r.productId ? `/admin/products/${r.productId}/edit` : "/admin/products")}
        >
          {r.productId ? "Edit product" : "Products"}
        </button>
      ),
    },
  ];

  return (
    <>
      {toast}

      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Storage</h1>
          <p className="adm-lede">
            How much project room each subscription has left. A person who has filled their slots
            cannot start another project, so the fullest accounts are listed first — this screen is
            read from the top, not searched.
          </p>
        </div>
      </div>

      {!d ? (
        <p className="adm-note">Reading storage…</p>
      ) : (
        <>
          <div className="adm-kpis">
            <div className="adm-kpi">
              <span className="k">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <use href="#hi-downloads" />
                </svg>
                <span>Nearly full</span>
              </span>
              <b>{counts.full}</b>
              <span className="sub">
                {counts.full
                  ? "at 90% or more — these people are about to be stuck"
                  : "nobody is close to their limit"}
              </span>
            </div>
            <div className="adm-kpi">
              <span className="k">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <use href="#hi-downloads" />
                </svg>
                <span>Filling up</span>
              </span>
              <b>{counts.filling}</b>
              <span className="sub">between 70% and 90% — worth a conversation</span>
            </div>
            <div className="adm-kpi">
              <span className="k">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <use href="#hi-plus" />
                </svg>
                <span>Slots granted</span>
              </span>
              <b>{grantedSlots}</b>
              <span className="sub">extra slots given out by hand, across all accounts</span>
            </div>
          </div>

          <AdmFilters
            current={view}
            onPick={setView}
            options={[
              ["all", "Every account", counts.all],
              ["full", "Nearly full", counts.full],
              ["filling", "Filling up", counts.filling],
              ["fine", "Comfortable", counts.fine],
              ["open", "Unmetered", counts.open],
            ]}
          />

          <AdmTable
            cols={cols}
            rows={rows}
            rowKey={(r) => r.key}
            empty={
              view === "all"
                ? ["No storage in use", "No active subscription carries project storage."]
                : ["Nothing in this band", "No account is in this state just now."]
            }
          />

          {prices.length ? (
            <p className="adm-foot-note">
              Slot prices, per product:{" "}
              {prices.map(([key, price], i) => (
                <React.Fragment key={key}>
                  {i ? " · " : ""}
                  <b>{key}</b>{" "}
                  {price != null ? `${money(price)} per 10 slots` : "3% of the subscription"}
                </React.Fragment>
              ))}
              <br />
              A product with no price set charges 3% of the subscription for a block of slots. Set
              a figure on the product itself if that is not what you want.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
