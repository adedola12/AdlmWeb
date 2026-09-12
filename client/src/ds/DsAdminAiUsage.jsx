// AI usage — his screen, on our numbers.
//
// Richard's page, view for view: Overview, By feature, By model, By account,
// Call log, with the period switch in the page actions and the credit leading
// the overview. His framing, kept because it is the right one: "the question
// is not what did we spend, it is which runs out first — the money or the
// clock."
//
// WHAT OURS ADDS TO HIS, AND WHY
//
// His By account tab is built from the call log, so it lists the people who
// spent something. Ours is built from the ACCOUNTS: everybody holding a
// licence, plus everybody who has spent. The row that matters most on this
// screen is the one his data cannot produce — a firm on three seats that has
// never made a single AI call. That is not an accounting fact, it is a product
// one, and it only appears if the list starts from who has access rather than
// from who has spent.
//
// So the account rows carry what they hold as well as what they spend, and the
// row opens the account beside you (his idiom) with the licences, the
// allowance, the features they reach for and their last calls.
//
// THE BUTTONS ON THE ACCOUNT ROWS ARE NOT HIS AND HAVE TO BE HERE
//
// His prototype has no backend, so an allowance is a number on a page. Ours is
// enforced, which means "this person is spending too much" needs a button on
// it. Three things can be done to an account: stop it, set what it may have,
// or sell it more.
//
// Setting a limit REPLACES it. Selling somebody more ADDS to it, appends the
// reason to the record rather than overwriting it, and refuses to touch a cap
// of zero — because zero means unlimited, and "adding" a thousand calls to
// unlimited would quietly impose a ceiling on somebody who has just paid to
// avoid one.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip, AdmFilters } from "./adminUi.jsx";
import { useAdmToast, checkFields, toneFor } from "./adminKit.jsx";
import { AdmDrawer, AdmFields } from "./adminForm.jsx";

const usd = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    .format(Number(n) || 0);

const num = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

// His token columns are written in millions because his prototype deals in
// them. Ours deal in thousands as often as millions, and "0.0M" is a column of
// nothing — so the unit follows the number instead of the other way round.
const compact = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e4) return `${Math.round(v / 1e3)}k`;
  return num(v);
};

const day = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";

const date = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";

const stamp = (d) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const pct = (used, limit) => (limit > 0 ? Math.round((used / limit) * 1000) / 10 : null);

/**
 * A feature key as written in the code, said in words.
 *
 * A fallback rather than the source: the server sends the catalogue with the
 * overview, so a feature added to config/aiPricing.js is named here without
 * anybody remembering to edit this map. The map covers the keys that predate
 * the catalogue and the ones the desktop tools send.
 */
const FEATURE = {
  "programme-outputs": "Programme — gang outputs",
  "course-quiz-draft": "Quiz drafting",
  agent: "Ada",
  "agent-chat": "Ada",
  "ada-chat": "Ada",
  helpbot: "HelpBot (retired)",
  "boq-check": "BoQ check",
};

function namesFrom(catalogue) {
  const m = { ...FEATURE };
  for (const f of catalogue || []) if (f?.key) m[f.key] = f.label || f.key;
  return (k) => m[k] || k || "Unattributed";
}

// A cap of nothing is not a cap. Said in words everywhere it is shown, because
// "0" in a limit column reads as "blocked" to everybody who has not read the
// schema.
const cap = (n, unit) => (Number(n) > 0 ? `${num(n)} ${unit}` : "unlimited");

// His two, plus a quarter. Seven days says whether something broke this week;
// ninety says whether anybody ever took to it. Both are decisions.
const PERIODS = [7, 30, 90];

const VIEWS = [
  ["overview", "Overview"],
  ["feature", "By feature"],
  ["model", "By model"],
  ["account", "By account"],
  ["log", "Call log"],
];

// The account filters. "Idle" is the one the screen exists for: they hold a
// licence and have not touched the AI in it.
const HOLDING = [
  ["all", "Everyone"],
  ["using", "Using it"],
  ["idle", "Holds it, never used it"],
  ["lapsed", "Licence lapsed"],
  ["capped", "Near the cap"],
];

/* ── the forms ─────────────────────────────────────────────────────────── */

// Set what an account may have. Zero means unlimited in every one of these,
// which the hints say out loud rather than leaving to be discovered.
const LIMIT_FIELDS = [
  {
    k: "enabled",
    label: "May use AI at all",
    type: "check",
    hint: "Turn this off to stop the account using any AI feature. A limit of zero does not do this — zero is unlimited.",
  },
  {
    k: "calls",
    label: "Calls",
    type: "number",
    hint: "Requests to the model in the window. 0 for unlimited.",
  },
  {
    k: "tokens",
    label: "Tokens",
    type: "number",
    hint: "Read and written combined. 0 for unlimited.",
  },
  {
    k: "costUsd",
    label: "Spend, US$",
    type: "number",
    hint: "The ceiling in money, which is the one that actually protects the credit. 0 for unlimited.",
  },
  {
    k: "window",
    label: "Counted over",
    type: "select",
    options: ["month", "day"],
    hint: "A month suits the website features. A day suits a desktop tool, where a whole month spent on the first morning reads as the product being broken.",
  },
  {
    k: "notes",
    label: "Note",
    type: "textarea",
    rows: 2,
    wide: true,
    hint: "Why this account is different. It is kept with the allowance.",
  },
];

// Sell somebody more.
const TOPUP_FIELDS = [
  { k: "calls", label: "Add calls", type: "number", hint: "Left alone if their calls are already unlimited." },
  { k: "tokens", label: "Add tokens", type: "number" },
  { k: "costUsd", label: "Add spend, US$", type: "number" },
  {
    k: "why",
    label: "What it was for",
    type: "text",
    wide: true,
    required: true,
    placeholder: "Invoice ADLM-INV-0042",
    hint: "Appended to the record rather than replacing what is there, so the history of who bought what survives.",
  },
];

// The credit pool the burn-down runs against. Without it his whole overview is
// a bar with nothing behind it, so the panel carries the form that fills it.
const CREDIT_FIELDS = [
  { k: "label", label: "What the pool is called", type: "text", placeholder: "AWS credit" },
  {
    k: "totalUsd",
    label: "The pool, US$",
    type: "number",
    hint: "What was granted in total. The burn-down is drawn against this.",
  },
  {
    k: "openingSpendUsd",
    label: "Spent before metering, US$",
    type: "number",
    hint: "Anything burnt before this dashboard existed, and anything a desktop plugin spends straight against the AI service without passing through here. It cannot be measured, so it is stated.",
  },
  { k: "startAt", label: "Granted on", type: "date" },
  {
    k: "expiresAt",
    label: "Expires on",
    type: "date",
    hint: "The date the unspent balance is lost. This is what decides whether the money or the clock runs out first.",
  },
];

/* ── his pieces ────────────────────────────────────────────────────────── */

function Panel({ title, note, children }) {
  return (
    <section className="adm-panel">
      <div className="adm-panel-h">
        <h2>{title}</h2>
        {note ? <span className="note">{note}</span> : null}
      </div>
      <div className="adm-panel-b">{children}</div>
    </section>
  );
}

/** His fact grid. `[value, what it is, warn?]`. */
function Facts({ items }) {
  return (
    <div className="adm-facts">
      {items.map((f) => (
        <div key={f[1]} className={`adm-fact${f[2] ? " warn" : ""}`}>
          <b>{f[0]}</b>
          <span>{f[1]}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The credit burn-down — his bar, and the reason his page leads with it.
 *
 * Two segments on one track: what has been spent, and what the current rate
 * will have consumed by the expiry date. The gap between the second and the
 * end of the track is credit that will be lost, which is the whole point of
 * drawing it this way rather than as a percentage.
 */
function BurnDown({ credit, onEdit }) {
  const pool = Number(credit?.totalUsd) || 0;
  const spent = Number(credit?.spentUsd) || 0;
  const left = Number(credit?.remainingUsd) || 0;
  const rate = Number(credit?.perDayUsd) || 0;
  const expiresAt = credit?.expiresAt || null;
  const toExpiry = expiresAt
    ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86400000))
    : null;

  // An unconfigured pool is not a zero pool. Drawing a full red bar against a
  // total nobody has entered would invent a crisis, so it says what is missing.
  if (!pool) {
    return (
      <>
        <Facts
          items={[
            [usd(spent), "billed to the pool so far"],
            [rate ? usd(rate) : "—", "a day, month to date"],
            [credit?.label || "AWS credit", "the pool this is billed to"],
          ]}
        />
        <p className="adm-foot-note">
          <b>No pool has been entered, so there is nothing to burn down. </b>
          The spend above is real; what it is a share of is not recorded. Enter the grant and its
          expiry and this becomes a runway.
        </p>
        <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={onEdit}>
          Enter the credit pool
        </button>
      </>
    );
  }

  const willUse = toExpiry === null ? left : Math.min(left, rate * toExpiry);
  const unused = Math.max(0, left - willUse);

  return (
    <div className="adm-burn">
      <div className="adm-burn-bar">
        {/* A floor on the drawn width, his idiom everywhere else on the page:
            $1.58 of $24,000 is a sub-pixel segment, and a track with nothing
            on it reads as "no data" rather than "barely touched". The figure
            beside it is the truth; the bar is only the shape of it. */}
        <span
          className="spent"
          style={{ width: `${spent > 0 ? Math.max(1.2, Math.min(100, (spent / pool) * 100)) : 0}%` }}
        />
        <span
          className="proj"
          style={{ width: `${Math.min(100, ((spent + willUse) / pool) * 100)}%` }}
        />
      </div>

      <div className="adm-burn-k">
        <span className="ds-a">Spent {usd(spent)}</span>
        <span className="b">
          {toExpiry === null
            ? `Will be used at today’s rate — ${usd(willUse)}`
            : `Will be used by ${date(expiresAt)} at today’s rate — ${usd(willUse)}`}
        </span>
        <span className="c">Left over {usd(unused)}</span>
      </div>

      <Facts
        items={[
          [usd(left), "credit remaining"],
          [rate ? usd(rate) : "—", "a day, month to date"],
          [toExpiry === null ? "—" : `${num(toExpiry)} days`, "until the credit expires"],
          [usd(unused), "would expire unused", unused > 0],
        ]}
      />

      {unused > 0 && rate > 0 ? (
        <p className="adm-foot-note">
          <b>The clock runs out before the money does. </b>
          At {usd(rate)} a day the credit would last {num(Math.floor(left / rate))} days, but it
          expires in {num(toExpiry)}. Either the usage grows into it or {usd(unused)} is written
          off.
        </p>
      ) : null}

      <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={onEdit}>
        Change the pool
      </button>
    </div>
  );
}

/**
 * His daily column chart.
 *
 * The series is filled in rather than plotted as it comes: the database returns
 * only the days something happened, so plotting it directly would put Monday
 * next to Friday at the same width and call it a week.
 */
function DailySpend({ daily, days }) {
  const byDate = new Map((daily || []).map((r) => [r.date, r]));
  const rows = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const r = byDate.get(d);
    rows.push({ on: d, cost: r?.costUsd || 0, calls: r?.calls || 0 });
  }

  const max = rows.reduce((n, r) => Math.max(n, r.cost), 0) || 1;
  const peak = rows.reduce((a, r) => (r.cost > a.cost ? r : a), rows[0]);

  return (
    <div>
      <div className="adm-cols-chart">
        {rows.map((r) => (
          <span
            key={r.on}
            className={`adm-col${r === peak && peak.cost > 0 ? " peak" : ""}`}
            title={`${r.on} · ${usd(r.cost)} · ${num(r.calls)} calls`}
          >
            <i style={{ height: `${Math.max(2, (r.cost / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="adm-col-ax">
        <span>{rows[0]?.on}</span>
        <span className="mid">
          {peak?.cost ? `peak ${usd(peak.cost)} on ${peak.on}` : "nothing spent in this window"}
        </span>
        <span>{rows[rows.length - 1]?.on}</span>
      </div>
    </div>
  );
}

/** His breakdown: the same table by feature, by model, by anything. */
function Breakdown({ rows, head, empty, onRow }) {
  const total = rows.reduce((n, r) => n + (r.cost || 0), 0) || 1;
  return (
    <AdmTable
      cols={[
        { h: head, w: "34%", cell: (r) => <AdmTwo top={r.k} under={r.sub || ""} /> },
        {
          h: "Calls",
          num: true,
          cell: (r) =>
            r.errors ? <AdmTwo top={num(r.calls)} under={`${num(r.errors)} failed`} /> : num(r.calls),
        },
        { h: "Tokens", num: true, cell: (r) => compact(r.tokens) },
        { h: "Cost", num: true, cell: (r) => (r.cost ? usd(r.cost) : <AdmDim>—</AdmDim>) },
        {
          h: "Share",
          cell: (r) => (
            <span className="adm-bar-t">
              <span
                className="adm-bar-f"
                style={{ width: `${Math.max(2, ((r.cost || 0) / total) * 100)}%` }}
              />
            </span>
          ),
        },
      ]}
      rows={rows}
      rowKey={(r) => r.id}
      onRow={onRow}
      empty={empty}
    />
  );
}

/**
 * A bar per dimension of the allowance: what has gone, out of what there is.
 *
 * Only drawn against a limit that can be compared to what is on screen. An
 * allowance counted per DAY cannot be read against a month of calls — the bar
 * would say 3000% and mean nothing — so that case gets the numbers and a
 * sentence instead of a bar that lies.
 */
function Allowance({ used, limits, comparable }) {
  const rows = [
    { k: "Calls", used: used.calls, limit: limits.calls, fmt: num },
    { k: "Tokens", used: used.tokens, limit: limits.tokens, fmt: num },
    { k: "Spend", used: used.costUsd, limit: limits.costUsd, fmt: usd },
  ];
  return (
    <div className="adm-bars">
      {rows.map((r) => {
        const p = comparable ? pct(r.used, r.limit) : null;
        return (
          <div
            key={r.k}
            className={`adm-bar-r${p != null && p >= 80 ? " hot" : ""}${p == null ? " none" : ""}`}
          >
            <span className="adm-bar-l">{r.k}</span>
            <span className="adm-bar-t">
              {p == null ? null : (
                <span
                  className="adm-bar-f"
                  style={{ width: `${Math.min(100, Math.max(1.5, p))}%` }}
                />
              )}
            </span>
            <span className="adm-bar-v">
              {r.fmt(r.used)}
              {r.limit > 0 ? ` of ${r.fmt(r.limit)}` : " · unlimited"}
              {p == null ? "" : ` · ${p}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** One per-feature cap, in the words the limits form uses. */
function capSays(l) {
  if (!l) return "";
  if (l.enabled === false) return "switched off";
  const bits = [];
  if (l.calls > 0) bits.push(`${num(l.calls)} calls`);
  if (l.costUsd > 0) bits.push(usd(l.costUsd));
  if (l.tokens > 0) bits.push(`${num(l.tokens)} tokens`);
  return bits.length ? `${bits.join(", ")} a ${l.window || "month"}` : "";
}

/**
 * One account, opened beside the list — his accountPeek.
 *
 * What they hold, what they are allowed, what they reach for, and the last
 * calls they made. The licences come with the row; the features and the calls
 * are read when it opens, because 400 rows of call history is not something to
 * carry on a list nobody may click.
 */
function AccountPeek({ row, days, token, label, busy, onClose, onLimits, onTopUp, onDefault }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    setD(null);
    setErr("");
    apiAuthed(`/admin/ai-usage/user/${row.userId}?days=${days}`, { token })
      .then((r) => alive && setD(r))
      .catch(() => alive && setErr("That record could not be read just now."));
    return () => {
      alive = false;
    };
  }, [row.userId, days, token]);

  const u = row.usage || {};
  const limits = row.allocation?.total || null;
  const month = row.month || { calls: 0, tokens: 0, costUsd: 0 };

  // Per-feature caps: shown against the feature where there is a row for it,
  // and listed underneath where there is not — a cap on something they have
  // never used is still a cap, and is exactly the one that surprises somebody.
  const caps = row.allocation?.features || {};
  const reached = new Set((d?.byFeature || []).map((f) => f.feature));
  const unusedCaps = Object.entries(caps).filter(([k, l]) => !reached.has(k) && capSays(l));

  return (
    <AdmDrawer
      peek
      title={row.name || row.email || "Account"}
      intro={[row.firm, row.email].filter(Boolean).join(" · ")}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={onClose}>
            Close
          </button>
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={onTopUp}>
            They paid for more
          </button>
          <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={onLimits}>
            Change what they may use
          </button>
        </>
      }
    >
      <Facts
        items={[
          [num(u.calls), `calls in ${days} days`],
          [compact(u.tokens), "tokens read and written"],
          [usd(u.costUsd), "what they cost us"],
          [num(u.errors), "calls that failed", u.errors > 0],
        ]}
      />

      <p className="adm-peek-h">Holds</p>
      {row.holds?.length ? (
        <AdmTable
          cols={[
            {
              h: "Product",
              cell: (h) => (
                <AdmTwo
                  top={h.label}
                  under={[
                    h.seats > 1 ? `${h.seats} seats` : "1 seat",
                    h.licenseType === "organization" ? h.organisation || "organisation" : "personal",
                    h.devices ? `${h.devices} device${h.devices === 1 ? "" : "s"}` : "not installed",
                  ].join(" · ")}
                />
              ),
            },
            { h: "Runs to", cell: (h) => date(h.expiresAt) || <AdmDim>no end date</AdmDim> },
            { h: "State", cell: (h) => <AdmChip tone={toneFor(h.status)}>{h.status}</AdmChip> },
          ]}
          rows={row.holds}
          rowKey={(h) => h.key}
        />
      ) : (
        <p className="adm-lede">No licence on this account. They reached the AI without one.</p>
      )}

      <p className="adm-peek-h">This month, against what they are allowed</p>
      {limits ? (
        <>
          <Allowance used={month} limits={limits} comparable={limits.window === "month"} />
          <p className="adm-lede" style={{ marginTop: 10 }}>
            {row.allocation?.enabled === false
              ? "AI is switched off for this account, so nothing above can grow."
              : row.allocationScope === "user"
                ? "Their own allowance."
                : "The platform default — they have no allowance of their own."}
            {limits.window === "day"
              ? " It is counted per day, so the figures above are this month's total for context rather than a share of the cap."
              : ""}
          </p>
          {row.allocationScope === "user" ? (
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              disabled={busy}
              onClick={onDefault}
            >
              Put them back on the default
            </button>
          ) : null}
        </>
      ) : (
        <p className="adm-lede">
          Nothing governs this account: no allowance of its own, and no platform default set.
        </p>
      )}

      <p className="adm-peek-h">Which features they reach for</p>
      {err ? (
        <p className="adm-note">{err}</p>
      ) : !d ? (
        <p className="adm-note">Reading…</p>
      ) : (
        <>
          <AdmTable
            cols={[
              { h: "Feature", cell: (f) => label(f.feature) },
              {
                h: "Calls",
                num: true,
                cell: (f) =>
                  f.errors ? (
                    <AdmTwo top={num(f.calls)} under={`${num(f.errors)} failed`} />
                  ) : (
                    num(f.calls)
                  ),
              },
              { h: "Cost", num: true, cell: (f) => (f.costUsd ? usd(f.costUsd) : <AdmDim>—</AdmDim>) },
              { h: "Last", num: true, cell: (f) => day(f.lastAt) || <AdmDim>—</AdmDim> },
              {
                // A cap is invisible until it bites, which is how somebody ends
                // up debugging "the AI stopped working for this customer".
                h: "Capped at",
                cell: (f) => {
                  const said = capSays(caps[f.feature]);
                  return said ? <AdmChip tone="due">{said}</AdmChip> : <AdmDim>—</AdmDim>;
                },
              },
            ]}
            rows={d.byFeature || []}
            rowKey={(f) => f.feature}
            empty={["Nothing", `No AI call from this account in ${days} days.`]}
          />

          {unusedCaps.length ? (
            <p className="adm-lede" style={{ marginTop: 8 }}>
              Also capped, on features they have not reached for in this period:{" "}
              {unusedCaps.map(([k, l]) => `${label(k)} — ${capSays(l)}`).join("; ")}.
            </p>
          ) : null}

          <p className="adm-peek-h">Their last calls</p>
          {d.events?.length ? (
            <ul className="adm-time">
              {d.events.slice(0, 12).map((e) => (
                <li key={e._id} className={e.ok === false ? "warn" : undefined}>
                  <span className="when">{stamp(e.at)}</span>
                  <b>
                    {label(e.feature)}
                    {e.ok === false ? " — failed" : ""}
                  </b>
                  <span className="det">
                    {[
                      e.product && e.product !== "cloud" ? e.product : "",
                      e.model || (e.provider && e.provider !== "none" ? e.provider : ""),
                      e.totalTokens
                        ? `${num(e.totalTokens)} tokens`
                        : e.tokenSource === "none"
                          ? "no model call"
                          : "",
                      e.costUsd ? usd(e.costUsd) : "",
                      e.ms ? `${num(e.ms)} ms` : "",
                      e.ok === false && e.errorCode ? e.errorCode : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="adm-lede">No calls in this period.</p>
          )}
        </>
      )}
    </AdmDrawer>
  );
}

/**
 * Limits on one feature at a time.
 *
 * WHAT THIS IS FOR, IN THE WORDS SOMEBODY WILL ARRIVE WITH
 *
 * The fields above set what an account may spend on AI ALTOGETHER. This sets
 * what it may spend on ONE thing — "Ada can stay open, but cap the BoQ check
 * at fifty a month" — which is the shape almost every real decision takes,
 * because the thing worth turning down is a feature, not an account.
 *
 * THE THREE RULES, BECAUSE THEY ARE NOT GUESSABLE
 *
 * 1. Both caps are checked. A call has to be inside the overall allowance AND
 *    inside the cap for its own feature; whichever runs out first stops it.
 * 2. A feature left alone here is NOT uncapped — it keeps whatever the
 *    platform default says about it. Naming one feature never silently frees
 *    the rest.
 * 3. The tick is the off switch; 0 is not. Zero means "no limit of its own",
 *    the same as everywhere else on this screen, so an untouched form changes
 *    nothing.
 *
 * On the DEFAULT allowance the same block means everybody: the numbers apply
 * to every account that has not named that feature itself, and unticking one
 * stops it for the whole platform, including accounts with their own
 * allowance. That is the kill switch, and it is checked first.
 */
function FeatureLimits({ catalogue, value, onChange, forEveryone }) {
  const rows = catalogue || [];

  const edit = (key, patch) => {
    const cur = value[key] || { enabled: true, calls: 0, tokens: 0, costUsd: 0, window: "month" };
    onChange({ ...value, [key]: { ...cur, ...patch } });
  };

  if (!rows.length) return null;

  return (
    <div className="adm-flim">
      <p className="adm-peek-h">Limits on one feature</p>
      <p className="adm-flim-say">
        Everything above is the allowance for AI <b>altogether</b>. This is for turning one thing
        down without touching the rest. A call has to pass both, so whichever runs out first stops
        it — and a feature you leave alone here still follows{" "}
        {forEveryone ? "whatever it is set to in the code" : "the platform default"}, it is not set
        free. The tick is the off switch; <b>0 means no limit of its own</b>.
        {forEveryone
          ? " Unticking one here stops it for everybody, including accounts that have their own allowance."
          : ""}
      </p>

      {rows.map((f) => {
        const v = value[f.key] || {};
        const on = v.enabled !== false;
        const capped = Number(v.calls) > 0 || Number(v.costUsd) > 0 || Number(v.tokens) > 0;
        return (
          <div key={f.key} className={`adm-flim-r${on ? "" : " off"}`}>
            <label className="adm-flim-sw">
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => edit(f.key, { enabled: e.target.checked })}
              />
              <span>
                <b>
                  {f.label}
                  {on && capped ? <AdmChip tone="due">capped</AdmChip> : null}
                  {on ? null : <AdmChip tone="bad">off</AdmChip>}
                </b>
                <em>{f.desc}</em>
              </span>
            </label>

            {on ? (
              <div className="adm-flim-f">
                <label className="adm-f">
                  <span className="adm-f-l">Calls</span>
                  <input
                    type="number"
                    min="0"
                    value={v.calls ?? 0}
                    onChange={(e) => edit(f.key, { calls: e.target.value })}
                  />
                </label>
                <label className="adm-f">
                  <span className="adm-f-l">Spend, US$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={v.costUsd ?? 0}
                    onChange={(e) => edit(f.key, { costUsd: e.target.value })}
                  />
                </label>
                <label className="adm-f">
                  <span className="adm-f-l">Counted over</span>
                  <select
                    value={v.window || "month"}
                    onChange={(e) => edit(f.key, { window: e.target.value })}
                  >
                    <option value="month">a month</option>
                    <option value="day">a day</option>
                  </select>
                </label>
              </div>
            ) : (
              <p className="adm-flim-off">
                Switched off. {forEveryone ? "Nobody" : "This account"} can use it at all, whatever
                the numbers say.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── the screen ────────────────────────────────────────────────────────── */

export default function DsAdminAiUsage() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [days, setDays] = React.useState(30);
  const [view, setView] = React.useState("overview");
  const [holding, setHolding] = React.useState("all");

  const [ov, setOv] = React.useState(null); // the window: totals, splits, credit
  const [acc, setAcc] = React.useState(null); // every account
  const [log, setLog] = React.useState(null); // the raw calls
  const [alloc, setAlloc] = React.useState(null); // the platform default

  const [failed, setFailed] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(null); // { mode, row, values, errors }

  /* The overview pays for every view's header, so it is always read. The other
     three are read when their tab is opened and kept afterwards — switching
     back to a tab you have already seen should not blank it. */
  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setOv(null);
    setFailed(false);
    apiAuthed(`/admin/ai-usage/overview?days=${days}`, { token: accessToken })
      .then((r) => alive && setOv(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, days, reload]);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/admin/ai-usage/allocations", { token: accessToken })
      .then((r) => alive && setAlloc(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  React.useEffect(() => {
    if (!accessToken || view !== "account") return undefined;
    let alive = true;
    setAcc(null);
    apiAuthed(`/admin/ai-usage/accounts?days=${days}`, { token: accessToken })
      .then((r) => alive && setAcc(r))
      .catch(() => alive && setAcc({ rows: [], counts: {}, failed: true }));
    return () => {
      alive = false;
    };
  }, [accessToken, view, days, reload]);

  React.useEffect(() => {
    if (!accessToken || view !== "log") return undefined;
    let alive = true;
    setLog(null);
    apiAuthed(`/admin/ai-usage/events?days=${days}&limit=200`, { token: accessToken })
      .then((r) => alive && setLog(r))
      .catch(() => alive && setLog({ events: [], failed: true }));
    return () => {
      alive = false;
    };
  }, [accessToken, view, days, reload]);

  async function write(path, { method = "PUT", body, ok } = {}) {
    setBusy(true);
    try {
      const r = await apiAuthed(path, {
        token: accessToken,
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      setReload((n) => n + 1);
      if (ok) say(typeof ok === "function" ? ok(r) : ok);
      return r || true;
    } catch (err) {
      say(
        err?.status === 403
          ? "Changing an allowance needs the AI usage permission."
          : err?.message || "That did not work.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  const fallback = alloc?.default || null;

  /** Open the limits form on an account, or on the platform default. */
  function editLimits(row) {
    const a = row ? row.allocation : fallback;
    const t = a?.total || {};
    setOpen({
      mode: "limits",
      row,
      errors: {},
      values: {
        enabled: a ? a.enabled !== false : true,
        calls: t.calls ?? 0,
        tokens: t.tokens ?? 0,
        costUsd: t.costUsd ?? 0,
        window: t.window || "month",
        notes: a?.notes || "",
      },
      // Seeded from what is already stored, and sent back on save. The PUT
      // REPLACES this map rather than merging into it, so a form that did not
      // carry it deleted every per-feature limit on the account the moment
      // somebody pressed Save on an unrelated field.
      features: a?.features ? JSON.parse(JSON.stringify(a.features)) : {},
    });
  }

  async function saveLimits() {
    const errs = checkFields(LIMIT_FIELDS, open.values);
    if (Object.keys(errs).length) {
      setOpen((o) => ({ ...o, errors: errs }));
      return;
    }
    const v = open.values;
    const who = open.row?.name || open.row?.email || "They";

    // Only the features that actually say something travel. An all-zero,
    // switched-on entry is the same as no entry, and the server drops it
    // anyway — sending them would fill the record with rows that cap nothing.
    const features = {};
    for (const [key, f] of Object.entries(open.features || {})) {
      const calls = Number(f.calls) || 0;
      const tokens = Number(f.tokens) || 0;
      const costUsd = Number(f.costUsd) || 0;
      if (f.enabled === false || calls || tokens || costUsd) {
        features[key] = {
          enabled: f.enabled !== false,
          calls,
          tokens,
          costUsd,
          window: f.window || "month",
        };
      }
    }

    const body = {
      enabled: !!v.enabled,
      total: {
        enabled: true,
        calls: Number(v.calls) || 0,
        tokens: Number(v.tokens) || 0,
        costUsd: Number(v.costUsd) || 0,
        window: v.window || "month",
      },
      features,
      notes: v.notes || "",
    };

    const done = open.row
      ? await write(`/admin/ai-usage/allocations/user/${open.row.userId}`, {
          body,
          ok: v.enabled
            ? `${who} is on their own allowance now.`
            : `${who} can no longer use any AI feature.`,
        })
      : await write("/admin/ai-usage/allocations/default", {
          // The default row also carries what signed-out visitors may do — one
          // shared ceiling and a per-feature guest policy — and this form edits
          // neither. Both are sent back as they came rather than being blanked
          // by omission, which for guestFeatures would be worse than losing a
          // number: an entry there is how an admin says "guests MAY use this",
          // so dropping it silently revokes a permission.
          body: {
            ...body,
            guestTotal: fallback?.guestTotal || {},
            guestFeatures: fallback?.guestFeatures || {},
          },
          ok: "Saved. This is what an account gets unless it has its own.",
        });
    if (done) setOpen(null);
  }

  async function saveTopUp() {
    const errs = checkFields(TOPUP_FIELDS, open.values);
    if (Object.keys(errs).length) {
      setOpen((o) => ({ ...o, errors: errs }));
      return;
    }
    const v = open.values;
    const who = open.row?.name || open.row?.email || "They";
    const done = await write(`/admin/ai-usage/allocations/user/${open.row.userId}/top-up`, {
      method: "POST",
      body: {
        calls: Number(v.calls) || 0,
        tokens: Number(v.tokens) || 0,
        costUsd: Number(v.costUsd) || 0,
        why: v.why,
      },
      ok: (r) => {
        const skipped = (r?.untouched || []).length;
        return (
          `${who} has more.` +
          (skipped
            ? ` ${r.untouched.join(" and ")} were already unlimited, so they were left alone.`
            : "")
        );
      },
    });
    if (done) setOpen(null);
  }

  async function saveCredit() {
    const errs = checkFields(CREDIT_FIELDS, open.values);
    if (Object.keys(errs).length) {
      setOpen((o) => ({ ...o, errors: errs }));
      return;
    }
    const v = open.values;
    const done = await write("/admin/ai-usage/credit", {
      body: {
        label: v.label || "AWS credit",
        totalUsd: Number(v.totalUsd) || 0,
        openingSpendUsd: Number(v.openingSpendUsd) || 0,
        startAt: v.startAt || null,
        expiresAt: v.expiresAt || null,
      },
      ok: "Saved. The burn-down runs against that from now on.",
    });
    if (done) setOpen(null);
  }

  async function dropOverride(row) {
    await write(`/admin/ai-usage/allocations/user/${row.userId}`, {
      method: "DELETE",
      ok: `${row.name || row.email} is back on the platform default.`,
    });
  }

  if (failed) {
    return <p className="adm-note">AI usage could not be loaded just now. Please refresh.</p>;
  }

  const t = ov?.totals;
  const featureName = namesFrom(ov?.features);

  // What we built, minus what anybody used. A feature nobody touched has no row
  // in the tables — and "no row" reads as "nothing to see" when it is the most
  // decision-useful fact on the page.
  const usedKeys = new Set((ov?.byFeature || []).map((f) => f.feature));
  const unused = (ov?.features || []).filter((f) => !usedKeys.has(f.key));

  const featureRows = (ov?.byFeature || []).map((f) => ({
    id: f.feature || "unattributed",
    k: featureName(f.feature),
    sub: f.estimatedCalls ? `${num(f.estimatedCalls)} priced from an estimate` : "",
    calls: f.calls,
    errors: f.errors,
    tokens: f.tokens,
    cost: f.costUsd,
  }));

  const modelRows = (ov?.byModel || []).map((m) => ({
    id: `${m.model}·${m.provider}`,
    k: m.model,
    sub: m.provider,
    calls: m.calls,
    errors: m.errors,
    tokens: m.tokens,
    cost: m.costUsd,
  }));

  const counts = acc?.counts || {};
  const accountRows = (acc?.rows || []).filter((r) => {
    if (holding === "using") return r.usage.calls > 0;
    if (holding === "idle") return r.access === "active" && !r.usage.calls;
    if (holding === "lapsed") return r.access === "lapsed";
    if (holding === "capped")
      return (
        r.percentUsed &&
        [r.percentUsed.calls, r.percentUsed.tokens, r.percentUsed.costUsd].some(
          (v) => v != null && v >= 80,
        )
      );
    return true;
  });

  const accountCols = [
    {
      h: "Account",
      w: "24%",
      cell: (r) => <AdmTwo top={r.name || r.email} under={r.firm || r.email} />,
    },
    {
      // The column his data cannot have: what they are entitled to run. An
      // account with a live licence and no calls is the finding.
      //
      // Three chips and a count, not all six: somebody holding the whole
      // catalogue would otherwise make their row four times the height of
      // everybody else's, and the full list is in the record behind the row.
      h: "Holds",
      w: "22%",
      cell: (r) =>
        r.holds.length ? (
          <span className="adm-holds">
            {r.holds.slice(0, 3).map((h) => (
              <AdmChip key={h.key} tone={toneFor(h.status)}>
                {h.short || h.label}
              </AdmChip>
            ))}
            {r.holds.length > 3 ? <AdmDim>+{r.holds.length - 3} more</AdmDim> : null}
          </span>
        ) : (
          <AdmDim>no licence</AdmDim>
        ),
    },
    {
      h: "Calls",
      num: true,
      cell: (r) =>
        r.usage.errors ? (
          <AdmTwo top={num(r.usage.calls)} under={`${num(r.usage.errors)} failed`} />
        ) : (
          num(r.usage.calls)
        ),
    },
    { h: "Tokens", num: true, cell: (r) => compact(r.usage.tokens) },
    {
      h: "Cost",
      num: true,
      cell: (r) => (r.usage.costUsd ? usd(r.usage.costUsd) : <AdmDim>—</AdmDim>),
    },
    { h: "Last used", num: true, cell: (r) => day(r.usage.lastAt) || <AdmDim>never</AdmDim> },
    {
      h: "Allowed",
      cell: (r) => {
        const l = r.allocation?.total;
        return (
          <span className="adm-allow">
            <AdmChip
              tone={
                r.allocation?.enabled === false
                  ? "bad"
                  : r.allocationScope === "user"
                    ? "ok"
                    : "calm"
              }
            >
              {r.allocation?.enabled === false
                ? "blocked"
                : r.allocationScope === "user"
                  ? "own limits"
                  : "the default"}
            </AdmChip>
            {l ? (
              <span>
                {cap(l.calls, "calls")}, {l.costUsd > 0 ? usd(l.costUsd) : "unlimited spend"} a{" "}
                {l.window}
              </span>
            ) : null}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">AI usage</h1>
          <p className="adm-lede">
            The AI is the only thing in the studio that costs money per use, so it is the only line
            that can quietly run away. This leads with the credit rather than the spend, because the
            question is which runs out first — the money or the clock.
          </p>
        </div>
        <div id="adm-page-acts">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              onClick={() => setDays(p)}
            >
              {`Last ${p} days${days === p ? " ✓" : ""}`}
            </button>
          ))}
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            onClick={() => editLimits(null)}
            disabled={!fallback}
          >
            Set the default allowance
          </button>
        </div>
      </div>

      <AdmFilters options={VIEWS} current={view} onPick={setView} />

      {!ov ? (
        <p className="adm-note">Reading…</p>
      ) : view === "overview" ? (
        <>
          <Panel title="Credit" note="Every call billed to the pool since metering started">
            <BurnDown
              credit={ov.credit}
              onEdit={() =>
                setOpen({
                  mode: "credit",
                  errors: {},
                  values: {
                    label: ov.credit?.label || "AWS credit",
                    totalUsd: ov.credit?.totalUsd || 0,
                    openingSpendUsd: ov.credit?.openingSpendUsd || 0,
                    startAt: ov.credit?.startAt ? String(ov.credit.startAt).slice(0, 10) : "",
                    expiresAt: ov.credit?.expiresAt ? String(ov.credit.expiresAt).slice(0, 10) : "",
                  },
                })
              }
            />
          </Panel>

          <Facts
            items={[
              [usd(t.costUsd), "spent in the window"],
              [num(t.calls), "calls"],
              [
                compact(t.tokens),
                `tokens · ${compact(t.inputTokens)} in, ${compact(t.outputTokens)} out`,
              ],
              [
                usd(t.calls ? t.costUsd / t.calls : 0),
                `average call · ${num(t.avgMs)}ms`,
              ],
              [
                `${t.calls ? ((t.errors / t.calls) * 100).toFixed(1) : "0.0"}%`,
                `${num(t.errors)} failed calls`,
                t.errors > 0,
              ],
              [
                t.cacheReadTokens + t.cacheWriteTokens
                  ? `${Math.round(
                      (t.cacheReadTokens / (t.cacheReadTokens + t.cacheWriteTokens)) * 100,
                    )}%`
                  : "—",
                t.cacheReadTokens + t.cacheWriteTokens
                  ? `of cache tokens were reads · ${compact(t.cacheReadTokens)} read, ${compact(
                      t.cacheWriteTokens,
                    )} written`
                  : "nothing cached",
                t.cacheWriteTokens > t.cacheReadTokens,
              ],
            ]}
          />

          <Panel title="Daily spend" note={`Last ${days} days`}>
            <DailySpend daily={ov.daily} days={days} />
          </Panel>

          <div className="adm-cols2">
            <div>
              <Panel title="Where it goes" note="By feature">
                <Breakdown
                  rows={featureRows}
                  head="Feature"
                  empty={["Nothing spent", "No AI call has been made in this period."]}
                />
              </Panel>
            </div>
            <div>
              <Panel title="What it runs on" note="By model">
                <Breakdown
                  rows={modelRows}
                  head="Model"
                  empty={["Nothing spent", "No AI call has been made in this period."]}
                />
              </Panel>
            </div>
          </div>
        </>
      ) : view === "feature" ? (
        <>
          <Panel title="By feature" note="Where the spend goes">
            <Breakdown
              rows={featureRows}
              head="Feature"
              empty={["Nothing spent", "No AI call has been made in this period."]}
            />
          </Panel>

          {unused.length ? (
            <div className="adm-merge">
              <b>Nobody reached for these.</b>
              <span>
                {unused.map((f) => f.label).join(", ")} — not one call in {days} days. A feature
                that costs nothing because nobody uses it is not a saving.
              </span>
            </div>
          ) : null}
        </>
      ) : view === "model" ? (
        <Panel title="By model" note="What each call actually ran on">
          <Breakdown
            rows={modelRows}
            head="Model"
            empty={["Nothing spent", "No AI call has been made in this period."]}
          />
        </Panel>
      ) : view === "account" ? (
        <>
          <Panel
            title="By account"
            note="Everybody who holds a licence or has spent something. A row opens the account beside you"
          >
            <AdmFilters
              options={HOLDING.map(([v, l]) => [v, l, counts[v] ?? (v === "all" ? counts.all : undefined)])}
              current={holding}
              onPick={setHolding}
            />

            {!acc ? (
              <p className="adm-note">Reading…</p>
            ) : acc.failed ? (
              <p className="adm-note">The account list could not be read just now.</p>
            ) : (
              <>
                <AdmTable
                  cols={accountCols}
                  rows={accountRows}
                  rowKey={(r) => r.userId}
                  onRow={(r) => setOpen({ mode: "peek", row: r })}
                  empty={[
                    "Nobody",
                    holding === "idle"
                      ? "Everybody holding a licence has used the AI in it."
                      : "No account matches this filter.",
                  ]}
                />

                {acc.truncated ? (
                  <p className="adm-foot-note">
                    {num(acc.truncated)} more accounts are not shown. Narrow the list to see them.
                  </p>
                ) : null}

                {acc.guests ? (
                  <div className="adm-merge">
                    <b>Signed-out visitors: {num(acc.guests.calls)} calls, {usd(acc.guests.costUsd)}.</b>
                    <span>
                      Ada answers people who have no account, so they cannot be a row in a list of
                      accounts. They share one ceiling, set with the default allowance.
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </Panel>
        </>
      ) : (
        <>
          <Panel title="Call log" note="The most recent calls">
            {!log ? (
              <p className="adm-note">Reading…</p>
            ) : log.failed ? (
              // An empty table and a failed request look identical, and they
              // are opposite facts — "nobody asked the AI anything" is a
              // finding, "we could not read the log" is a fault.
              <p className="adm-note">The call log could not be read just now.</p>
            ) : (
              <AdmTable
                cols={[
                  {
                    // His two lines: the day over the time. One line wraps into
                    // three in a column this narrow, which is how "10 Sept,
                    // 15:13" became a paragraph.
                    h: "When",
                    w: "16%",
                    cell: (c) => (
                      <AdmTwo
                        top={day(c.at)}
                        under={new Date(c.at).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      />
                    ),
                  },
                  {
                    h: "Who",
                    w: "18%",
                    cell: (c) => (
                      <AdmTwo
                        top={c.name || c.email || "Signed out"}
                        under={featureName(c.feature)}
                      />
                    ),
                  },
                  {
                    h: "Model",
                    cell: (c) => (
                      <AdmTwo
                        top={
                          c.model
                            ? // "eu.anthropic.claude-haiku-4-5-20251001-v1:0" is a
                              // deployment id, not a model name. The name is the
                              // part anybody reads; the rest is region and build.
                              c.model.replace(/^[a-z]{2}\./, "").replace(/-\d{8}-v\d+:\d+$/, "")
                            : c.provider === "none"
                              ? "no model call"
                              : "(unreported)"
                        }
                        under={c.provider && c.provider !== "none" ? c.provider : c.product || ""}
                      />
                    ),
                  },
                  {
                    h: "Tokens",
                    num: true,
                    cell: (c) =>
                      c.totalTokens ? (
                        <AdmTwo top={num(c.totalTokens)} under={`${num(c.inputTokens)} in`} />
                      ) : (
                        <AdmDim>—</AdmDim>
                      ),
                  },
                  { h: "Took", num: true, cell: (c) => (c.ms ? `${num(c.ms)}ms` : <AdmDim>—</AdmDim>) },
                  {
                    h: "Cost",
                    num: true,
                    cell: (c) =>
                      c.ok === false || !c.costUsd ? <AdmDim>—</AdmDim> : usd(c.costUsd),
                  },
                  {
                    h: "",
                    cell: (c) =>
                      c.ok === false ? (
                        <AdmChip tone="bad">{c.errorCode || "failed"}</AdmChip>
                      ) : c.cacheReadTokens ? (
                        <AdmChip tone="calm">cached</AdmChip>
                      ) : c.tokenSource === "estimated" ? (
                        <AdmChip tone="">estimated</AdmChip>
                      ) : (
                        ""
                      ),
                  },
                ]}
                rows={log.events || []}
                rowKey={(c) => c._id}
                empty={["No calls", `Nothing has been asked of the AI in ${days} days.`]}
              />
            )}
          </Panel>

          <p className="adm-foot-note">
            A failed call costs nothing and still counts against the allowance. A cached one costs a
            fraction — a cache read is billed at a tenth of a fresh token, which is why the average
            call is {usd(t.calls ? t.costUsd / t.calls : 0)} rather than several times that.
          </p>
        </>
      )}

      {open?.mode === "peek" ? (
        <AccountPeek
          row={open.row}
          days={days}
          token={accessToken}
          label={featureName}
          busy={busy}
          onClose={() => setOpen(null)}
          // Straight from looking at an account to deciding about it, without
          // closing the record and hunting for the row again.
          onLimits={() => editLimits(open.row)}
          onTopUp={() =>
            setOpen({
              mode: "topup",
              row: open.row,
              errors: {},
              values: { calls: 0, tokens: 0, costUsd: 0, why: "" },
            })
          }
          onDefault={() => {
            dropOverride(open.row);
            setOpen(null);
          }}
        />
      ) : null}

      {open?.mode === "limits" ? (
        <AdmDrawer
          title={
            open.row ? `What ${open.row.name || open.row.email} may use` : "The default allowance"
          }
          intro={
            open.row
              ? "This account only. Removing it later puts them back on the platform default."
              : "What every account gets unless it has its own. The shared ceiling for signed-out visitors is kept as it is."
          }
          note="A limit of 0 is unlimited, not blocked."
          onClose={() => setOpen(null)}
          foot={
            <>
              <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setOpen(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ds-btn btn-p ds-btn-sm"
                disabled={busy}
                onClick={saveLimits}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <AdmFields
            fields={LIMIT_FIELDS}
            values={open.values}
            errors={open.errors}
            onChange={(values) => setOpen((o) => ({ ...o, values }))}
          />

          <FeatureLimits
            catalogue={ov?.features}
            value={open.features || {}}
            forEveryone={!open.row}
            onChange={(features) => setOpen((o) => ({ ...o, features }))}
          />
        </AdmDrawer>
      ) : null}

      {open?.mode === "topup" ? (
        <AdmDrawer
          title={`${open.row.name || open.row.email} paid for more`}
          intro="Added to what they already have, rather than replacing it — so two people topping the same account up in the same minute cannot undo each other."
          note="A dimension that is already unlimited is left alone: adding to unlimited would impose a ceiling on somebody who just paid to avoid one."
          onClose={() => setOpen(null)}
          foot={
            <>
              <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setOpen(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ds-btn btn-p ds-btn-sm"
                disabled={busy}
                onClick={saveTopUp}
              >
                {busy ? "Adding…" : "Add it"}
              </button>
            </>
          }
        >
          <AdmFields
            fields={TOPUP_FIELDS}
            values={open.values}
            errors={open.errors}
            onChange={(values) => setOpen((o) => ({ ...o, values }))}
          />
        </AdmDrawer>
      ) : null}

      {open?.mode === "credit" ? (
        <AdmDrawer
          title="The credit pool"
          intro="What was granted, what was burnt before this dashboard existed, and when the rest is lost."
          note="Nothing here changes a bill. It is what the burn-down is drawn against."
          onClose={() => setOpen(null)}
          foot={
            <>
              <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setOpen(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ds-btn btn-p ds-btn-sm"
                disabled={busy}
                onClick={saveCredit}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <AdmFields
            fields={CREDIT_FIELDS}
            values={open.values}
            errors={open.errors}
            onChange={(values) => setOpen((o) => ({ ...o, values }))}
          />
        </AdmDrawer>
      ) : null}

      {toast}
    </>
  );
}
