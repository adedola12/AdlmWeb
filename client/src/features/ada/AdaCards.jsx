// The cards Ada puts under a reply. Rendered by components/AiAgent.jsx for an
// action of type "price-proposal" or "project-report"; every rule they follow
// is in adaCardsModel.js.
//
// They sit inside his Ada bubble (.ada-m.ada-a), so they borrow his tokens —
// --line, --ink-2, --ink-3, --bg — and his buttons (.ds-btn .btn-p / .btn-o)
// rather than bringing a stylesheet of their own. The bubble is narrow (about
// 330px), so the line list scrolls in its own box instead of making the chat
// a mile long on a bill with three hundred unpriced lines.

import React from "react";
import { apiAuthed } from "../../api.js";
import { FaCheckCircle, FaExclamationTriangle, FaFilePdf } from "../../components/icons.jsx";
import { money, num, EN_DASH } from "../workProject/workProjectFormat.js";
import {
  allTicked,
  tickedLines,
  totalOf,
  applyLabel,
  priceManyPath,
  priceManyBody,
  summariseResult,
  applyErrorMessage,
  rangeLabel,
  isUserRateCard,
  splitLabel,
  sizeLabel,
  userRateHeading,
  PROJECT_UPDATED_EVENT,
} from "./adaCardsModel.js";

const box = {
  marginTop: 12,
  border: "1px solid var(--line)",
  borderRadius: 12,
  background: "var(--bg)",
  overflow: "hidden",
};
const head = { padding: "10px 12px", borderBottom: "1px solid var(--line)", fontSize: 12.5 };
const small = { fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.45 };
const foot = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 12px",
  borderTop: "1px solid var(--line)",
};

/**
 * The pricing confirm card. Every line starts ticked; Apply posts only the
 * ticked ones and reports how many were priced or skipped.
 *
 * Two kinds: rates Ada matched from the user's Rate Gen library (posted by
 * rate id), and a rate the USER stated ("windows are 88,000 per m2", "set
 * blockwork to 9,500"), card.mode "user-rate", which shows each line's size,
 * area, rate, amount and the material / labour / overhead split.
 */
export function AdaPricingCard({ card, token }) {
  const lines = React.useMemo(() => (Array.isArray(card?.lines) ? card.lines : []), [card]);
  const [ticks, setTicks] = React.useState(() => allTicked(lines));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState(null);

  const picked = tickedLines(lines, ticks);
  const total = totalOf(picked);
  const path = priceManyPath(card?.project);
  const done = Boolean(result);
  const stated = isUserRateCard(card);

  async function apply() {
    if (busy || done || !picked.length || !path) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiAuthed(path, {
        token,
        method: "POST",
        body: priceManyBody(picked),
      });
      setResult(summariseResult(res, picked.length));
      // The project page, if it is open, reloads its copy rather than showing
      // the bill as it was before the rates went on.
      try {
        window.dispatchEvent(
          new CustomEvent(PROJECT_UPDATED_EVENT, { detail: { id: card?.project?.id } }),
        );
      } catch {
        /* nothing listening */
      }
    } catch (e) {
      setError(applyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!lines.length) return null;

  return (
    <div style={box} aria-label="Proposed rates">
      <div style={head}>
        {stated ? (
          <>
            <b>{userRateHeading(card, money)}</b>
            <div style={small}>
              {card?.project?.name || "This project"}: {lines.length} line{lines.length === 1 ? "" : "s"},{" "}
              {splitLabel(card?.split)}. Nothing is saved until you apply.
            </div>
          </>
        ) : (
          <>
            <b>Proposed rates for {card?.project?.name || "this project"}</b>
            <div style={small}>
              {lines.length} of {card?.unpricedCount ?? lines.length} unpriced lines matched your RateGen
              rates. Nothing is saved until you apply.
            </div>
          </>
        )}
      </div>

      <ul
        style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 260, overflowY: "auto" }}
        aria-label="Lines to price"
      >
        {lines.map((l) => {
          const id = `ada-price-${card?.project?.id}-${l.code}`;
          return (
            <li
              key={l.code}
              style={{
                display: "flex",
                gap: 8,
                padding: "8px 12px",
                borderBottom: "1px solid var(--line)",
                opacity: ticks[l.code] ? 1 : 0.55,
              }}
            >
              <input
                id={id}
                type="checkbox"
                checked={Boolean(ticks[l.code])}
                disabled={busy || done}
                onChange={(e) => setTicks((t) => ({ ...t, [l.code]: e.target.checked }))}
                style={{ marginTop: 3, flex: "none" }}
              />
              <label htmlFor={id} style={{ minWidth: 0, flex: 1, cursor: done ? "default" : "pointer" }}>
                <div style={{ fontSize: 12.5, color: "var(--ink)" }}>
                  <b style={{ fontWeight: 500 }}>{l.code}</b> {l.description || EN_DASH}
                </div>
                {stated ? (
                  <>
                    {sizeLabel(l) ? <div style={small}>{sizeLabel(l)}</div> : null}
                    <div style={small}>
                      {num(l.qty)} {l.unit || ""} × {money(l.userRate)} = <b>{money(l.amount)}</b>
                      {Number(l.currentRate) > 0 ? ` (now ${money(l.currentRate)})` : ""}
                    </div>
                    <div style={small}>
                      Material {money(l.splitAmounts?.material)} · Labour {money(l.splitAmounts?.labour)} ·
                      O&amp;P {money(l.splitAmounts?.overheadProfit)}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={small}>
                      {num(l.qty)} {l.unit || ""} × {money(l.unitPrice)} = <b>{money(l.amount)}</b>
                    </div>
                    <div style={small}>
                      {l.rateDescription || EN_DASH}. {l.why}
                    </div>
                  </>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {stated && card?.repricedCount && !done ? (
        <div style={{ ...small, padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
          {card.repricedCount} line{card.repricedCount === 1 ? " already has a rate" : "s already have a rate"}; applying
          replaces it and keeps your figure when the plugin saves again.
        </div>
      ) : null}

      {!stated && (card?.unmatchedCount || card?.noCodeCount || card?.truncated) && !done ? (
        <div style={{ ...small, padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
          {card.unmatchedCount ? `${card.unmatchedCount} line(s) had no rate in the same unit. ` : ""}
          {card.noCodeCount ? `${card.noCodeCount} line(s) have no code and must be priced on the line. ` : ""}
          {card.truncated ? "Only the first 500 are here. Ask Ada again after applying." : ""}
        </div>
      ) : null}

      {done ? (
        <div style={{ padding: "10px 12px", fontSize: 12.5 }} role="status">
          <div style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--ink)" }}>
            <FaCheckCircle className="w-4 h-4" /> <b style={{ fontWeight: 500 }}>{result.headline}</b>
          </div>
          {result.skipped.slice(0, 5).map((s) => (
            <div key={s.code} style={small}>
              {s.code}: {s.reason}
            </div>
          ))}
          {result.skipped.length > 5 ? (
            <div style={small}>…and {result.skipped.length - 5} more skipped.</div>
          ) : null}
          {result.warnings.slice(0, 4).map((w, i) => (
            <div key={i} style={small}>
              {w}
            </div>
          ))}
        </div>
      ) : (
        <div style={foot}>
          <div style={{ fontSize: 12.5 }}>
            <div style={small}>Adds to the bill</div>
            <b style={{ fontWeight: 500 }}>{picked.length ? money(total) : EN_DASH}</b>
          </div>
          <button
            type="button"
            className="ds-btn ds-btn-sm btn-p"
            onClick={apply}
            disabled={busy || !picked.length || !path}
          >
            {busy ? "Applying…" : applyLabel(picked.length)}
          </button>
        </div>
      )}

      {error ? (
        <div
          role="alert"
          style={{ ...small, display: "flex", gap: 6, padding: "0 12px 10px", color: "var(--fb-warn, var(--ink-2))" }}
        >
          <FaExclamationTriangle className="w-4 h-4" /> {error}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The report card: the range, three headline figures and a button that opens
 * the existing Project report for that range.
 */
export function AdaReportCard({ card, onOpen }) {
  const s = card?.summary || {};
  const masked = Boolean(s.moneyMasked);
  const fig = (v) => (masked ? EN_DASH : money(v));
  return (
    <div style={box} aria-label="Project report">
      <div style={head}>
        <b>{card?.project?.name || "Project"} report</b>
        <div style={small}>{rangeLabel(card?.from, card?.to)}</div>
      </div>
      {s.quiet ? (
        <div style={{ ...small, padding: "10px 12px" }}>Nothing was recorded in this period.</div>
      ) : (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "4px 10px",
            margin: 0,
            padding: "10px 12px",
            fontSize: 12.5,
          }}
        >
          <dt style={small}>Work valued</dt>
          <dd style={{ margin: 0 }}>{fig(s.valued)}</dd>
          <dt style={small}>Certified</dt>
          <dd style={{ margin: 0 }}>{fig(s.certified)}</dd>
          <dt style={small}>Bought</dt>
          <dd style={{ margin: 0 }}>{fig(s.bought)}</dd>
          <dt style={small}>Activity entries</dt>
          <dd style={{ margin: 0 }}>{Number(s.activity) || 0}</dd>
        </dl>
      )}
      <div style={{ ...foot, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="ds-btn ds-btn-sm btn-o"
          onClick={() =>
            onOpen?.({
              productKey: card?.project?.productKey,
              projectId: card?.project?.id,
              from: card?.from,
              to: card?.to,
            })
          }
          disabled={!card?.project?.id}
        >
          <FaFilePdf className="w-4 h-4" /> {card?.label || "Open the report"}
        </button>
      </div>
    </div>
  );
}
