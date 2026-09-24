import React from "react";
import { FaArrowRight, FaBug, FaExclamationTriangle, FaFileImport, FaLayerGroup, FaListUl, FaMagic, FaPlus, FaSyncAlt, FaTimes } from "../../../components/icons.jsx";
import PmBoqHeatmap from "./PmBoqHeatmap.jsx";

// The PM dashboard, in Richard's work-surface pieces: .dsh-stat tiles,
// .wk-panel cards with .wk-ph heads, his .dsh-meter tracks for every bar,
// .mk-note for nudges, .wk-useline rows for offender lists and ds-btn for
// actions. He has no donut, gradient tile or red/green, so:
//   • the tasks donut became meters (as on the project Dashboard),
//   • tones map onto his palettes: good → his light blue ("pal-on"),
//     warning / danger → his orange ("warn"), neutral → plain,
//   • chart series use his tokens (SERIES below).
// Every figure, rule and message is unchanged.

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtMoney(v) {
  return safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtMoneyDec(v) {
  return safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Chart series in his tokens.
const SERIES = {
  done: "var(--action)",
  active: "var(--pal-deep-key)",
  alert: "var(--pal-orange-key)",
  soft: "var(--pal-orange-line)",
  idle: "var(--ink-3)",
  empty: "var(--line-2)",
};

function palChip(pal) {
  return {
    background: `var(--pal-${pal}-wash)`,
    color: `var(--pal-${pal}-key)`,
    borderColor: `var(--pal-${pal}-line)`,
  };
}

const STACK = { display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" };
// His tiles are four fixed columns; money needs room to breathe.
const FIT_TILES = { marginBottom: 0, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" };
const SHORT_TILES = { marginBottom: 0, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" };
const NO_MB = { marginBottom: 0 };
const BODY = { padding: "18px 20px 20px" };
const NOTE_WARN = { background: "var(--pal-orange-wash)", color: "var(--pal-orange-key)", borderColor: "var(--pal-orange-line)" };
const NOTE_GOOD = { background: "var(--pal-light-wash)", color: "var(--pal-light-key)", borderColor: "var(--pal-light-line)" };
const EYEBROW = { padding: 0, margin: "0 0 4px" };
const LINK_BTN = {
  background: "none",
  border: 0,
  padding: 0,
  cursor: "pointer",
  font: "inherit",
  color: "var(--action)",
};

// good / warn / neutral → his tile tone class.
function tileTone(t) {
  return t === "good" ? "pal-on" : t === "warn" ? "warn" : "";
}
// good / warn / neutral → his chip palette.
function chipTone(t) {
  return t === "good" ? palChip("light") : t === "warn" ? palChip("orange") : undefined;
}

function Tile({ label, value, sub, tone, title }) {
  return (
    <div className={`dsh-stat${tileTone(tone) ? ` ${tileTone(tone)}` : ""}`} title={title}>
      <span className="k">{label}</span>
      <b>{value}</b>
      {sub ? <span className="ds-sub">{sub}</span> : null}
    </div>
  );
}

function Swatch({ color }) {
  return (
    <i
      aria-hidden="true"
      style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: color, flex: "none" }}
    />
  );
}

// One of his meter rows. `fill` defaults to his action colour.
function MeterRow({ label, value, pct, fill, title }) {
  const w = Math.max(0, Math.min(100, safeNum(pct)));
  return (
    <div className="row" title={title}>
      <div className="lab">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <div className="track">
        <i style={{ width: `${w}%`, ...(fill ? { background: fill } : null) }} />
      </div>
    </div>
  );
}

// A card: his panel with a head, the eyebrow in his group title.
function Panel({ eyebrow, title, note, aside, children, style }) {
  return (
    <section className="wk-panel" style={{ ...NO_MB, ...style }}>
      <div className="wk-ph" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          {eyebrow ? (
            <p className="wk-grp" style={EYEBROW}>
              {eyebrow}
            </p>
          ) : null}
          <h2>{title}</h2>
          {note ? (
            <div className="wk-locnote" style={{ marginTop: 4 }}>
              {note}
            </div>
          ) : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Tasks by status, as his meters (he has no donut).
// ─────────────────────────────────────────────────────────────────────
function TasksDonut({ buckets, totalTasks }) {
  const completed = safeNum(buckets?.completed);
  const inProgress = safeNum(buckets?.inProgress);
  const blocked = safeNum(buckets?.blocked);
  const notStarted = safeNum(buckets?.notStarted);
  const total = totalTasks || completed + inProgress + blocked + notStarted;

  if (total === 0) {
    // Item 13: "No tasks yet" on its own leaves a new project with nothing to
    // do about it. The panel is small, so the action is a sentence, not a row
    // of buttons — those are on the onboarding panel above.
    return (
      <div className="wk-empty" style={{ fontSize: 13 }}>
        No tasks yet. Generate one per bill item, import an MS Project file, or add a task by
        hand, and this counts them by status.
      </div>
    );
  }
  const pct = (n) => (n / total) * 100;
  return (
    <div className="dsh-meter">
      <MeterRow
        label="Completed"
        value={`${completed} · ${Math.round(pct(completed))}% done`}
        pct={pct(completed)}
        fill={SERIES.done}
      />
      <MeterRow label="In progress" value={inProgress} pct={pct(inProgress)} fill={SERIES.active} />
      <MeterRow label="Blocked" value={blocked} pct={pct(blocked)} fill={SERIES.alert} />
      <MeterRow label="Not started" value={notStarted} pct={pct(notStarted)} fill={SERIES.idle} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Budget bars (BAC / EV / AC)
// ─────────────────────────────────────────────────────────────────────
function BudgetBars({ BAC, EV, AC }) {
  const max = Math.max(BAC, EV, AC, 1);
  const rows = [
    { label: "Budget (BAC)", value: BAC, fill: SERIES.active },
    { label: "Earned (EV)", value: EV, fill: SERIES.done },
    { label: "Actual (AC)", value: AC, fill: SERIES.alert },
  ];
  return (
    <div className="dsh-meter">
      {rows.map((row) => (
        <MeterRow
          key={row.label}
          label={row.label}
          value={`₦${fmtMoney(row.value)}`}
          pct={(row.value / max) * 100}
          fill={row.fill}
        />
      ))}
    </div>
  );
}

// Priority breakdown — shows TOTAL count per priority (filled bar) with
// the overdue count overlaid (deeper colour). Lets the user see "I have
// 18 medium-priority tasks total, 3 of which are overdue" in one row,
// rather than the old single-purpose overdue-only chart that read 0
// across the board until tasks slipped.
function OverdueBars({ overdueByPriority, tasksByPriority }) {
  const labels = ["critical", "high", "medium", "low"];
  const max = Math.max(
    1,
    ...labels.map((k) => safeNum(tasksByPriority?.[k])),
    ...labels.map((k) => safeNum(overdueByPriority?.[k])),
  );
  const hasAnyTask = labels.some((k) => safeNum(tasksByPriority?.[k]) > 0)
    || safeNum(tasksByPriority?.none) > 0;
  const noneCount = safeNum(tasksByPriority?.none);
  return (
    <div className="dsh-meter">
      {labels.map((k) => {
        const total = safeNum(tasksByPriority?.[k]);
        const overdue = safeNum(overdueByPriority?.[k]);
        return (
          <div className="row" key={k}>
            <div className="lab">
              <span style={{ textTransform: "capitalize" }}>{k}</span>
              <b>
                {total}
                {overdue > 0 ? (
                  <span style={{ marginLeft: 4, color: SERIES.alert, fontWeight: 400 }}>
                    ({overdue} overdue)
                  </span>
                ) : null}
              </b>
            </div>
            {/* Total in his light line, overdue drawn on top in orange. */}
            <div className="track" style={{ position: "relative" }}>
              <i
                style={{
                  position: "absolute",
                  inset: "0 auto 0 0",
                  width: `${(total / max) * 100}%`,
                  background: "var(--pal-light-line)",
                }}
              />
              {overdue > 0 ? (
                <i
                  style={{
                    position: "absolute",
                    inset: "0 auto 0 0",
                    width: `${(overdue / max) * 100}%`,
                    background: SERIES.alert,
                  }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
      {noneCount > 0 ? (
        <div className="wk-locnote" style={{ paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          + <strong style={{ color: "var(--ink-2)" }}>{noneCount}</strong> task
          {noneCount === 1 ? "" : "s"} with no priority assigned
        </div>
      ) : null}
      {!hasAnyTask ? (
        <div className="wk-locnote" style={{ textAlign: "center" }}>
          No tasks yet. Add one to populate priority breakdown.
        </div>
      ) : null}
    </div>
  );
}

function BurndownChart({ burndown, BAC, burndownStatus }) {
  if (!Array.isArray(burndown) || burndown.length === 0) {
    // Pick a specific message based on what's actually missing — the
    // generic "set dates" prompt was misleading when dates ARE set but
    // finish < start, or when no tasks exist yet.
    const strong = { display: "block", color: "var(--ink)", fontWeight: 500 };
    const message = (
      {
        "invalid-dates": (
          <>
            <strong style={{ ...strong, color: SERIES.alert }}>Project dates are invalid.</strong>
            Project finish must be after project start. Edit them in the
            Project header to enable the burndown.
          </>
        ),
        "no-tasks": (
          <>
            <strong style={strong}>No tasks yet.</strong>
            Generate tasks from BoQ or import an MS Project file to see
            the burndown.
          </>
        ),
        "no-baseline": (
          <>
            <strong style={strong}>No baseline cost.</strong>
            Link tasks to BoQ items (or enter manual baseline cost) so
            the burndown has a value to track against.
          </>
        ),
      }[burndownStatus]
    ) || (
      <>
        Set project start &amp; finish dates to enable burndown.
      </>
    );
    return <div className="wk-empty" style={{ fontSize: 13 }}>{message}</div>;
  }
  const W = 360;
  const H = 160;
  const max = Math.max(BAC, ...burndown.map((p) => safeNum(p.plannedRemaining)));
  const stepX = burndown.length > 1 ? W / (burndown.length - 1) : 0;
  const toY = (val) => H - (safeNum(val) / Math.max(max, 1)) * (H - 16) - 8;

  const plannedPath = burndown
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${toY(p.plannedRemaining)}`)
    .join(" ");
  const actualPoints = burndown.filter((p) => p.actualRemaining != null);
  const actualPath = actualPoints
    .map((p, _i, arr) => {
      const idx = burndown.indexOf(p);
      return `${arr.indexOf(p) === 0 ? "M" : "L"} ${idx * stepX} ${toY(p.actualRemaining)}`;
    })
    .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: 176 }}>
        <defs>
          <linearGradient id="plannedFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" style={{ stopColor: SERIES.done, stopOpacity: 0.25 }} />
            <stop offset="100%" style={{ stopColor: SERIES.done, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={`${plannedPath} L ${W} ${H} L 0 ${H} Z`} fill="url(#plannedFill)" />
        <path d={plannedPath} fill="none" style={{ stroke: SERIES.done }} strokeWidth="2.5" strokeDasharray="5 3" />
        {actualPoints.length > 1 ? (
          <path d={actualPath} fill="none" style={{ stroke: SERIES.alert }} strokeWidth="2.5" />
        ) : null}
      </svg>
      <div className="wk-locnote" style={{ marginTop: 6, display: "flex", justifyContent: "center", gap: 16 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i style={{ display: "inline-block", width: 16, borderTop: `2px dashed ${SERIES.done}` }} />
          Planned
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i style={{ display: "inline-block", width: 16, borderTop: `2px solid ${SERIES.alert}` }} />
          Actual
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Balance indicator: linked baseline + manual baseline vs contract sum
// ─────────────────────────────────────────────────────────────────────
function BalanceIndicator({ balance }) {
  const status = balance?.status || "no-data";
  const total = safeNum(balance?.totalBaseline);
  const linked = safeNum(balance?.linkedBaseline);
  const manual = safeNum(balance?.manualBaseline);
  const ref = safeNum(balance?.budgetReference);
  const diff = safeNum(balance?.varianceAmount);
  const pct = safeNum(balance?.variancePercent);

  const config = {
    balanced: {
      title: "Plan balanced",
      detail: "PM baseline total equals the contract sum.",
      tone: "good",
      chip: "Balanced",
    },
    over: {
      title: "Plan exceeds contract",
      // Genuine warning — the WBS has been priced higher than the
      // contract value. Variations are the proper channel for any
      // legitimate over-allocation.
      detail: `PM baseline exceeds ${balance?.contractLocked ? "contract sum" : "BoQ total"} by ₦${fmtMoneyDec(diff)} (${pct.toFixed(1)}%). Review weighted links or move excess scope to variations.`,
      tone: "warn",
      chip: "Over",
    },
    under: {
      // PM baseline below contract sum used to read as a warning
      // ("Under budget") which confused users. Re-framed as a
      // POSITIVE cost-saving signal: the WBS is forecast to cost
      // less than the agreed contract → that's a saving, not a gap.
      title: "Forecast saving",
      detail: `PM baseline is ₦${fmtMoneyDec(Math.abs(diff))} (${Math.abs(pct).toFixed(1)}%) below ${balance?.contractLocked ? "contract sum" : "BoQ total"}, project is forecast to come in under contract.`,
      tone: "good",
      chip: "Saving",
    },
    empty: {
      title: "No baseline cost yet",
      detail: "Add tasks and link them to BoQ items, or enter manual cost. The dashboard will then track project books.",
      tone: "",
      chip: "No baseline",
    },
    "no-data": {
      title: "Add tasks and BoQ items to balance the project books",
      detail: "Generate tasks from BoQ, import a schedule, or add tasks manually to start tracking.",
      tone: "",
      chip: "No data",
    },
  };

  const c = config[status] || config["no-data"];

  return (
    <Panel
      eyebrow="Project books"
      title={c.title}
      note={c.detail}
      aside={
        <span className="wk-src sm" style={chipTone(c.tone)}>
          {c.chip}
        </span>
      }
    >
      {/* When every task is BoQ-linked, the manual baseline tile just
          shows ₦0 and adds noise, so it is hidden. */}
      <div style={BODY}>
        <div className="dsh-stats" style={FIT_TILES}>
          <Tile label="Linked baseline" value={`₦${fmtMoney(linked)}`} />
          {manual > 0 ? <Tile label="Manual baseline" value={`₦${fmtMoney(manual)}`} /> : null}
          <Tile label="PM total" value={`₦${fmtMoney(total)}`} tone={c.tone} />
          <Tile
            label={balance?.contractLocked ? "Contract sum" : "Planned total"}
            value={`₦${fmtMoney(ref)}`}
          />
        </div>
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Quick action, as his button. The old card subtitle is the tooltip.
// ─────────────────────────────────────────────────────────────────────
function ActionCard({ label, icon: Icon, onClick, disabled, primary = false, subtitle }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={subtitle}
      className={`ds-btn ds-btn-sm ${primary ? "btn-p" : "btn-o"}`}
    >
      {Icon ? <Icon size={14} /> : null}
      {label}
    </button>
  );
}

function ImportProgress({ importStatus, importProgress }) {
  return (
    <div className="dsh-meter">
      <MeterRow
        label={importStatus || "Importing…"}
        value={`${importProgress}%`}
        pct={importProgress}
        fill={importProgress === 100 ? "var(--ok)" : undefined}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main dashboard view
// ─────────────────────────────────────────────────────────────────────
export default function PmDashboardView({
  dashboard,
  saving = false,
  importing = false,
  generating = false,
  importError = "",
  importProgress = 0,
  importStatus = "",
  onAddTask,
  onAddRisk,
  onAddIssue,
  onGenerateFromBoq,
  // S18 PR2-18: plan the bill lines that are in no task, one task per element.
  onPlanUnlinked,
  onImportFile,
  onClearImports,
  onViewDetails,
  onOpenHeaderSettings,
  onSave,
  dirty,
}) {
  // Count how many tasks came from an MS Project import — drives the
  // visibility of the "Clear imports" button + the count badge.
  const importedTaskCount = React.useMemo(() => {
    if (!Array.isArray(dashboard?.tasks)) return 0;
    return dashboard.tasks.filter((t) =>
      String(t?.source || "").startsWith("msproject"),
    ).length;
  }, [dashboard?.tasks]);
  // Count of tasks that have at least one BoQ link — drives the
  // "Generate from BoQ" button visibility and the import-button label.
  // Once the user has wired their schedule to the BoQ, they don't need
  // "Generate" (it'd just create duplicates), and any subsequent MS
  // Project import is functionally an UPDATE (smart-merge preserves
  // their work — see #81).
  const linkedTaskCount = React.useMemo(() => {
    if (!Array.isArray(dashboard?.tasks)) return 0;
    return dashboard.tasks.filter(
      (t) => Array.isArray(t?.linkedBoqIdentities) && t.linkedBoqIdentities.length > 0,
    ).length;
  }, [dashboard?.tasks]);
  const hasBoqLinks = linkedTaskCount > 0;
  const hasAnyTasks = Array.isArray(dashboard?.tasks) && dashboard.tasks.length > 0;
  const headline = dashboard?.headline || {};
  const totals = dashboard?.totals || {};
  const buckets = dashboard?.buckets || {};
  const overdueByPriority = dashboard?.overdueByPriority || {};
  const tasksByPriority = dashboard?.tasksByPriority || {};
  const tasksByStatus = dashboard?.tasksByStatus || {};
  const burndown = dashboard?.burndown || [];
  const balance = dashboard?.balance || { status: "no-data" };

  const fileRef = React.useRef(null);
  function pickFile() {
    fileRef.current?.click();
  }
  function onFile(e) {
    const file = e.target.files?.[0];
    if (file) onImportFile?.(file);
    e.target.value = "";
  }

  const cpi = safeNum(headline.CPI);
  const spi = safeNum(headline.SPI);
  const indexTone = (v) => (v >= 1 ? "good" : v >= 0.9 ? "" : "warn");

  // Onboarding signals — drive the empty-state banner and the "project
  // start not set" callout. Both are non-blocking — the user can still see
  // every chart underneath.
  const totalTasks = safeNum(totals.totalTasks);
  const hasNoTasks = totalTasks === 0;
  const hasNoProjectStart = !dashboard?.projectStart;

  return (
    <div style={STACK}>
      {/* Header */}
      <Panel
        eyebrow="Project management"
        title="All-in-One PM Dashboard"
        note={
          dashboard?.projectStart || dashboard?.projectFinish
            ? `${
                dashboard?.projectStart
                  ? new Date(dashboard.projectStart).toLocaleDateString()
                  : "–"
              } → ${
                dashboard?.projectFinish
                  ? new Date(dashboard.projectFinish).toLocaleDateString()
                  : "–"
              }`
            : null
        }
        aside={
          <div className="wk-acts" style={{ alignItems: "center" }}>
            {dirty ? (
              <span className="wk-dirty" style={{ marginRight: 4 }}>
                Unsaved
              </span>
            ) : null}
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !dirty}
              className="ds-btn ds-btn-sm btn-p"
            >
              <FaSyncAlt size={14} className={saving ? "animate-spin" : ""} />
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={onViewDetails} className="ds-btn ds-btn-sm btn-o">
              <FaListUl size={14} />
              View Details
              <FaArrowRight size={12} />
            </button>
          </div>
        }
      />

      {/* Empty-state onboarding, shown when there are no tasks at all.
          Replaces the silent "0 / 0 / ₦0" tiles below with an actual
          first-time-user prompt. Dismissed implicitly by adding any task. */}
      {hasNoTasks ? (
        <section className="wk-panel" style={NO_MB}>
          <div className="wk-empty">
            <b style={{ display: "block", fontSize: 16, fontWeight: 500, color: "var(--ink)" }}>
              Your PM dashboard is empty
            </b>
            <span style={{ display: "block", maxWidth: 460, margin: "6px auto 0" }}>
              Add tasks manually, generate one task per item from your BoQ, or
              import an MS Project file. The dashboard tiles, charts, and
              burndown will populate automatically.
            </span>
            <div className="wk-acts" style={{ justifyContent: "center", marginTop: 18 }}>
              <ActionCard label="Add first task" icon={FaPlus} primary onClick={onAddTask} />
              <ActionCard
                label={generating ? "Generating…" : "Generate from BoQ"}
                icon={FaMagic}
                onClick={onGenerateFromBoq}
                disabled={generating}
              />
              <ActionCard
                label={importing ? "Importing…" : "Import MS Project"}
                icon={FaFileImport}
                onClick={pickFile}
                disabled={importing}
              />
            </div>
            {importing && importProgress > 0 ? (
              <div style={{ maxWidth: 460, margin: "18px auto 0", textAlign: "left" }}>
                <ImportProgress importStatus={importStatus} importProgress={importProgress} />
              </div>
            ) : null}
            {importError ? (
              <p className="mk-note" role="alert" style={{ ...NOTE_WARN, maxWidth: 460, margin: "14px auto 0" }}>
                {importError}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Project-start nudge, non-blocking when tasks exist but the
          project's start date hasn't been set. Without a start the Burndown
          can't render and the Reschedule action errors out. */}
      {!hasNoTasks && hasNoProjectStart ? (
        <div
          className="mk-note"
          style={{ ...NOTE_WARN, margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}
        >
          <span>
            <strong>Set a project start date</strong> to enable the burndown
            chart and the task-reschedule cascade.
          </span>
          <button type="button" onClick={onOpenHeaderSettings} className="ds-btn ds-btn-sm btn-o">
            Set start date
          </button>
        </div>
      ) : null}

      {/* Action strip, adapts to WBS state. Once tasks have been
          linked to BoQ items, hide "Generate from BoQ" (it'd just
          create duplicates), and rename "Import MS Project" →
          "Update MS Project" so the user understands re-imports are
          smart-merge (preserve their progress, refresh schedule). */}
      <div className="wk-bar" style={NO_MB}>
        <ActionCard label="Add Task" subtitle="Schedule a work item" icon={FaPlus} primary onClick={onAddTask} />
        <ActionCard label="Add Risk" subtitle="Log a risk" icon={FaExclamationTriangle} onClick={onAddRisk} />
        <ActionCard label="Add Issue" subtitle="Log an issue" icon={FaBug} onClick={onAddIssue} />
        {!hasBoqLinks ? (
          <ActionCard
            label="Generate from BoQ"
            subtitle="One task per item"
            icon={FaMagic}
            onClick={onGenerateFromBoq}
            disabled={generating}
          />
        ) : null}
        <ActionCard
          label={
            importing
              ? hasAnyTasks
                ? "Updating…"
                : "Importing…"
              : hasAnyTasks
                ? "Update MS Project"
                : "Import MS Project"
          }
          subtitle={
            hasAnyTasks
              ? "Refresh schedule (keeps progress + links)"
              : ".xml or .mpp"
          }
          icon={FaFileImport}
          onClick={pickFile}
          disabled={importing}
        />
        <input ref={fileRef} type="file" accept=".xml,.mpp" className="hidden" onChange={onFile} />
      </div>

      {/* Import progress, shown while an upload is in flight */}
      {importing && importProgress > 0 ? (
        <ImportProgress importStatus={importStatus} importProgress={importProgress} />
      ) : null}

      {/* Clear-imports row, hidden once tasks are linked to BoQ so
          users can't accidentally nuke their wired-up WBS. They can
          still reset via the Reset PM data button if they really
          need to start over. */}
      {importedTaskCount > 0 && !hasBoqLinks ? (
        <div
          className="mk-note"
          style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}
        >
          <span>
            <strong style={{ color: "var(--ink)" }}>{importedTaskCount}</strong>{" "}
            task{importedTaskCount === 1 ? "" : "s"} came from MS Project import.
          </span>
          <button
            type="button"
            onClick={onClearImports}
            className="ds-btn ds-btn-sm btn-o"
            title="Remove all MS Project imported tasks. Manual & BoQ-linked tasks are preserved."
          >
            <FaTimes size={12} />
            Delete imported tasks
          </button>
        </div>
      ) : importedTaskCount > 0 ? (
        // Linked-tasks-present variant: show the count as info but
        // remove the destructive button.
        <p className="mk-note" style={{ ...NOTE_GOOD, margin: 0 }}>
          <strong>{importedTaskCount}</strong> task{importedTaskCount === 1 ? "" : "s"}{" "}
          imported from MS Project ·{" "}
          <strong>{linkedTaskCount}</strong> linked to BoQ. Future re-imports will refresh the schedule and preserve your work.
        </p>
      ) : null}

      {importError ? (
        <p className="mk-note" role="alert" style={{ ...NOTE_WARN, margin: 0 }}>
          {importError}
        </p>
      ) : null}

      {/* Headline tiles */}
      <div className="dsh-stats" style={SHORT_TILES}>
        <Tile label="Progress" value={`${safeNum(headline.progressPercent).toFixed(0)}%`} sub="Avg % complete" />
        <Tile label="Budget Used" value={`${safeNum(headline.budgetUsedPercent).toFixed(0)}%`} sub="AC / BAC" />
        <Tile
          label="Overdue"
          value={safeNum(headline.overdueCount)}
          sub="Tasks past end date"
          tone={safeNum(headline.overdueCount) > 0 ? "warn" : ""}
        />
        <Tile
          label="CPI"
          value={cpi ? cpi.toFixed(2) : "–"}
          sub={cpi >= 1 ? "Under budget" : cpi > 0 ? "Over budget" : "No data"}
          tone={cpi ? indexTone(cpi) : ""}
        />
        <Tile
          label="SPI"
          value={spi ? spi.toFixed(2) : "–"}
          sub={spi >= 1 ? "On/ahead" : spi > 0 ? "Behind" : "No data"}
          tone={spi ? indexTone(spi) : ""}
        />
        <Tile
          label="Tasks Done"
          value={`${safeNum(headline.tasksDonePercent).toFixed(0)}%`}
          sub={`${totals.completedTasks || 0} of ${totals.totalTasks || 0}`}
        />
      </div>

      {/* Balance indicator */}
      <BalanceIndicator balance={balance} />

      {/* WBS status & priority strip, compact at-a-glance row showing
          how the work is distributed across status + priority buckets. */}
      <WbsHealthStrip
        tasksByStatus={tasksByStatus}
        tasksByPriority={tasksByPriority}
        overdueByPriority={overdueByPriority}
        totalTasks={safeNum(totals.totalTasks)}
        // Critical-path counts from the MS Project importer. Falls
        // through to 0 for projects that haven't been re-imported
        // since the feature shipped.
        criticalPathTotal={safeNum(dashboard?.criticalPathTotal)}
        criticalPathPending={safeNum(dashboard?.criticalPathPending)}
      />

      {/* Contract movement: variations + provisional flow, with
          execution status and forecast impact. */}
      <ContractMovementPanel dashboard={dashboard} />

      {/* Charts grid */}
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <ChartCard title="Tasks">
          <TasksDonut buckets={buckets} totalTasks={totals.totalTasks} />
        </ChartCard>
        <ChartCard title="Budget">
          <BudgetBars BAC={totals.BAC} EV={totals.EV} AC={totals.AC} />
        </ChartCard>
        <ChartCard title="Tasks by priority">
          <OverdueBars
            overdueByPriority={overdueByPriority}
            tasksByPriority={tasksByPriority}
          />
        </ChartCard>
        <ChartCard title="Burndown">
          <BurndownChart
            burndown={burndown}
            BAC={totals.BAC}
            burndownStatus={dashboard?.burndownStatus}
          />
        </ChartCard>
      </div>

      {/* BoQ progress heatmap, full-width to give it room */}
      <PmBoqHeatmap boqItems={dashboard?.boqItems || []} />

      {/* BoQ ↔ WBS coverage reconciliation, surfaces unlinked /
          under-allocated / double-counted BoQ entries so the user knows
          immediately whether the WBS faithfully executes the BoQ. */}
      <BoqCoveragePanel
        coverage={dashboard?.boqCoverage}
        onViewDetails={onViewDetails}
        onPlanUnlinked={onPlanUnlinked}
        planning={generating}
      />

      {/* EVM summary */}
      <Panel
        title="Earned Value Summary"
        aside={
          <button type="button" onClick={onOpenHeaderSettings} className="ds-btn ds-btn-sm btn-o">
            Edit project dates &amp; budget
          </button>
        }
      >
        <div style={BODY}>
          <div className="dsh-stats" style={FIT_TILES}>
            <Tile label="BAC" value={`₦${fmtMoney(totals.BAC)}`} sub="Budget at completion" />
            <Tile label="PV" value={`₦${fmtMoney(totals.PV)}`} sub="Planned value to date" />
            <Tile label="EV" value={`₦${fmtMoney(totals.EV)}`} sub="Earned value" />
            <Tile label="AC" value={`₦${fmtMoney(totals.AC)}`} sub="Actual cost" />
            <Tile label="EAC" value={`₦${fmtMoney(totals.EAC)}`} sub="Estimate at completion" />
            <Tile
              label="VAC"
              value={`₦${fmtMoney(totals.VAC)}`}
              sub={safeNum(totals.VAC) >= 0 ? "Forecast savings" : "Forecast over-run"}
              tone={safeNum(totals.VAC) >= 0 ? "good" : "warn"}
            />
          </div>
        </div>
      </Panel>

      {dashboard?.asOf ? (
        <div className="wk-locnote" style={{ textAlign: "right" }}>
          As of {new Date(dashboard.asOf).toLocaleString()}
        </div>
      ) : null}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <Panel title={title}>
      <div style={BODY}>{children}</div>
    </Panel>
  );
}

// ────────────────────────────────────────────────────────────────────
// Contract Movement panel — variation + provisional tracker.
//
// Surfaces three things the user asked for:
//   1. How much extra scope has been instructed (variations declared).
//   2. How much of that scope has actually been executed (earned).
//   3. The net impact on contract sum + forecast — savings or overrun.
//
// Data source: dashboard.scope.{variations,provisional} from the server
// (computeProjectScope). All numbers respect the new completed-flag
// semantics, so declared-but-not-done shows in BAC but not EV.
// ────────────────────────────────────────────────────────────────────
function ContractMovementPanel({ dashboard }) {
  const scope = dashboard?.scope || {};
  const variations = scope.variations || { total: 0, earned: 0, count: 0, completedCount: 0 };
  const provisional = scope.provisional || { total: 0, earned: 0, count: 0, completedCount: 0 };
  const totals = dashboard?.totals || {};

  const variationsOpen = Math.max(0, safeNum(variations.total) - safeNum(variations.earned));
  const provisionalOpen = Math.max(0, safeNum(provisional.total) - safeNum(provisional.earned));

  // Forecast savings/overrun. Negative VAC = over-run, positive = savings.
  const vac = safeNum(totals.VAC);
  const eac = safeNum(totals.EAC);
  const bac = safeNum(totals.BAC);
  const variancePct = bac > 0 ? (vac / bac) * 100 : 0;

  let healthTone = "";
  let healthLabel = "Tracking";
  let healthMsg = "Awaiting actuals.";
  if (bac > 0 && eac > 0) {
    if (vac >= 0) {
      healthTone = "good";
      healthLabel = `Forecast savings ₦${fmtMoney(Math.abs(vac))}`;
      healthMsg = `Project is forecast to come in ${Math.abs(variancePct).toFixed(1)}% under contract.`;
    } else {
      const overrun = Math.abs(variancePct);
      healthTone = "warn";
      healthLabel = `Forecast over-run ₦${fmtMoney(Math.abs(vac))}`;
      healthMsg = `Project is forecast to exceed contract by ${overrun.toFixed(1)}%. Review variation execution and actuals.`;
    }
  }

  // Nothing to show if both streams are empty — keep the dashboard
  // uncluttered when the project hasn't issued any variations or PC yet.
  if (
    safeNum(variations.total) === 0 &&
    safeNum(provisional.total) === 0 &&
    Math.abs(vac) < 1
  ) {
    return null;
  }

  const eacPct = bac > 0 ? Math.min(130, (eac / bac) * 100) : 0;

  return (
    <Panel
      eyebrow="Contract movement"
      title={healthLabel}
      note={healthMsg}
      aside={
        healthTone ? (
          <span className="wk-src sm" style={chipTone(healthTone)}>
            {healthTone === "good" ? "Within budget" : "Over budget"}
          </span>
        ) : null
      }
    >
      <div style={BODY}>
        <div className="dsh-stats" style={FIT_TILES}>
          <Tile
            label="Variations declared"
            value={`₦${fmtMoney(variations.total)}`}
            sub={`${variations.count || 0} instruction${variations.count === 1 ? "" : "s"}`}
          />
          <Tile
            label="Variations executed"
            value={`₦${fmtMoney(variations.earned)}`}
            sub={`${variations.completedCount || 0} of ${variations.count || 0} done · ₦${fmtMoney(variationsOpen)} open`}
            tone={variations.earned > 0 ? "good" : ""}
          />
          <Tile
            label="PC sums released"
            value={`₦${fmtMoney(provisional.earned)}`}
            sub={`${provisional.completedCount || 0} of ${provisional.count || 0} drawn · ₦${fmtMoney(provisionalOpen)} held`}
          />
          <Tile
            label="Forecast at completion"
            value={`₦${fmtMoney(eac)}`}
            sub={vac >= 0 ? "Within budget" : "Over budget"}
            tone={vac >= 0 ? "good" : "warn"}
          />
        </div>

        {/* Variance, as his meter: the forecast against the contract
            baseline (capped at 130% so large over-runs stay readable),
            with a marker where the baseline ends. */}
        {bac > 0 ? (
          <div className="dsh-meter" style={{ marginTop: 18 }}>
            <div className="row">
              <div className="lab">
                <span>Contract baseline ₦{fmtMoney(bac)}</span>
                <b style={{ color: vac >= 0 ? "var(--pal-light-key)" : SERIES.alert }}>
                  Forecast ₦{fmtMoney(eac)} ({vac >= 0 ? "−" : "+"}{Math.abs(variancePct).toFixed(1)}%)
                </b>
              </div>
              <div className="track" style={{ position: "relative" }}>
                <i
                  style={{
                    width: `${Math.min(100, (eacPct / Math.max(100, eacPct)) * 100)}%`,
                    background: vac >= 0 ? SERIES.done : SERIES.alert,
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: "var(--ink)",
                    left: `${Math.min(100, (100 * bac) / Math.max(bac, eac))}%`,
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

// ────────────────────────────────────────────────────────────────────
// BoQ ↔ WBS coverage panel.
//
// Answers the single question users ask after building a WBS:
// "Does my schedule actually execute the priced scope, or have I left
//  bits unallocated / accidentally counted lines twice?"
//
// Surfaces four categories from the server's boqCoverage payload:
//   1. Fully allocated → good tile, count only (the healthy bucket).
//   2. Unlinked        → neutral tile, ₦ value at risk + top offenders.
//   3. Under-allocated → warning tile, shortfall amount + top rows.
//   4. Over-allocated  → warning tile, double-count amount + top rows.
//
// Each problem category has a collapsible list of the top 8 offending
// BoQ rows so the user can jump from "your books don't balance" to the
// specific row they need to fix. The segmented bar shows the same
// proportions in one glance.
// ────────────────────────────────────────────────────────────────────
function BoqCoveragePanel({ coverage, onViewDetails, onPlanUnlinked, planning = false }) {
  if (!coverage || !coverage.totalCount) {
    return null;
  }

  const total = safeNum(coverage.totalAmount);
  const linked = safeNum(coverage.linkedAmount);
  const unlinked = safeNum(coverage.unlinkedAmount);
  const under = safeNum(coverage.underAllocatedAmount);
  const over = safeNum(coverage.overAllocatedAmount);
  const coveragePct = safeNum(coverage.coveragePercent);

  // Tone reflects the worst issue. Over-allocation outweighs under-
  // allocation because over-counts directly inflate EV (CPI/SPI lie),
  // whereas under-counts only depress them (a milder distortion).
  let headerTone = "good";
  let headerLabel = "BoQ fully covered";
  let headerMsg = `${coverage.fullyAllocatedCount} BoQ entries are tracked end-to-end by the WBS.`;
  if (over > 0) {
    headerTone = "warn";
    headerLabel = `Possible double-count: ₦${fmtMoney(over)}`;
    headerMsg = `${coverage.overAllocatedCount} BoQ entries have task weights summing to > 100%. EV and CPI/SPI may be over-stated.`;
  } else if (unlinked > 0 || under > 0) {
    headerTone = "warn";
    const gap = unlinked + under;
    headerLabel = `Coverage gap: ₦${fmtMoney(gap)}`;
    const parts = [];
    if (coverage.unlinkedCount > 0) {
      parts.push(`${coverage.unlinkedCount} unlinked`);
    }
    if (coverage.underAllocatedCount > 0) {
      parts.push(`${coverage.underAllocatedCount} under-allocated`);
    }
    headerMsg = `${parts.join(" + ")}. WBS does not yet execute the full BoQ, EV and SPI will under-state.`;
  }

  // Segmented coverage bar widths (% of total amount).
  const linkedPct = total > 0 ? (Math.min(linked, total) / total) * 100 : 0;
  const underPct = total > 0 ? (under / total) * 100 : 0;
  const unlinkedPct = total > 0 ? (unlinked / total) * 100 : 0;
  // Over-allocation isn't part of the 100% bar — it's an overflow
  // marker rendered under the bar instead.
  const overPct = total > 0 ? Math.min(40, (over / total) * 100) : 0;

  const legend = { display: "inline-flex", alignItems: "center", gap: 6 };

  return (
    <Panel
      eyebrow="BoQ ↔ WBS coverage"
      title={headerLabel}
      note={headerMsg}
      aside={
        <span className="wk-src sm" style={chipTone(headerTone)}>
          {coveragePct.toFixed(1)}% linked
        </span>
      }
    >
      <div style={BODY}>
        {/* One tile per coverage bucket */}
        <div className="dsh-stats" style={SHORT_TILES}>
          <CoverageStat
            label="Fully covered"
            value={`${coverage.fullyAllocatedCount}`}
            hint="entries balanced at 100%"
            tone="good"
          />
          {/* S18 PR2-18: the bill lines that are in no task, with what they
              are worth, and a way to plan them without leaving the tile. */}
          <CoverageStat
            label="Bill not in any task"
            value={`${coverage.unlinkedCount}`}
            hint={`₦${fmtMoney(unlinked)} in no task`}
            tone={coverage.unlinkedCount > 0 ? "warn" : ""}
            action={
              onPlanUnlinked && coverage.unlinkedCount > 0 ? (
                <button
                  type="button"
                  className="pj-lnk"
                  disabled={planning}
                  onClick={onPlanUnlinked}
                  title="Add one task per element for the bill lines that are in no task, after the current programme"
                >
                  {planning ? "Planning…" : "Plan them"}
                </button>
              ) : null
            }
            // Hover reveals every unlinked BoQ row — including the
            // zero-cost ones. Answers the user's "show me what I missed"
            // question without forcing them to scroll into the offender
            // panel below.
            details={coverage.topUnlinked}
            detailsLabel="Unlinked BoQ items"
          />
          <CoverageStat
            label="Under-allocated"
            value={`${coverage.underAllocatedCount}`}
            hint={`₦${fmtMoney(under)} short`}
            tone={under > 0 ? "warn" : ""}
            details={coverage.topUnder}
            detailsLabel="Under-allocated BoQ items"
          />
          <CoverageStat
            label="Over-allocated"
            value={`${coverage.overAllocatedCount}`}
            hint={`₦${fmtMoney(over)} excess`}
            tone={over > 0 ? "warn" : ""}
            details={coverage.topOver}
            detailsLabel="Over-allocated BoQ items"
          />
        </div>

        {/* Segmented coverage bar, in his meter */}
        <div className="dsh-meter" style={{ marginTop: 18 }}>
          <div className="row">
            <div className="lab">
              <span>
                <b>{coveragePct.toFixed(1)}%</b> of ₦{fmtMoney(total)} BoQ value is linked to the WBS
              </span>
              {over > 0 ? (
                <b style={{ color: SERIES.alert }}>+ ₦{fmtMoney(over)} double-counted</b>
              ) : null}
            </div>
            <div className="track" style={{ display: "flex" }}>
              <i style={{ width: `${linkedPct}%`, borderRadius: 0, background: SERIES.done }} title={`Linked: ₦${fmtMoney(linked)}`} />
              <i style={{ width: `${underPct}%`, borderRadius: 0, background: SERIES.soft }} title={`Under-allocated shortfall: ₦${fmtMoney(under)}`} />
              <i style={{ width: `${unlinkedPct}%`, borderRadius: 0, background: SERIES.empty }} title={`Unlinked: ₦${fmtMoney(unlinked)}`} />
            </div>
            {over > 0 ? (
              <div className="track" style={{ background: "transparent" }}>
                <i style={{ width: `${overPct}%`, background: SERIES.alert }} title="double-counted" />
              </div>
            ) : null}
          </div>
        </div>
        <div className="wk-locnote" style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
          <span style={legend}><Swatch color={SERIES.done} /> Linked ₦{fmtMoney(linked)}</span>
          {under > 0 ? <span style={legend}><Swatch color={SERIES.soft} /> Shortfall ₦{fmtMoney(under)}</span> : null}
          {unlinked > 0 ? <span style={legend}><Swatch color={SERIES.empty} /> Unlinked ₦{fmtMoney(unlinked)}</span> : null}
          {over > 0 ? <span style={legend}><Swatch color={SERIES.alert} /> Excess ₦{fmtMoney(over)}</span> : null}
        </div>
      </div>

      {/* Offender lists, only render the sections with actual issues so
          a healthy project shows just the tiles + bar. */}
      {(coverage.topOver?.length > 0 ||
        coverage.topUnlinked?.length > 0 ||
        coverage.topUnder?.length > 0 ||
        coverage.staleLinkTasks?.length > 0) ? (
        <div style={{ borderTop: "1px solid var(--line)", padding: "16px 20px 20px", display: "grid", gap: 12 }}>
          {/* Stale links, highest priority because the task's baseline
              silently drops to ₦0 until the user re-links. */}
          {coverage.staleLinkTasks?.length > 0 ? (
            <StaleLinksPanel tasks={coverage.staleLinkTasks} />
          ) : null}
          {coverage.topOver?.length > 0 ? (
            <CoverageOffenders
              title="Over-allocated (double-count risk)"
              tone="warn"
              rows={coverage.topOver}
              measureLabel="excess"
              measureKey="excess"
              note="Lower the weight on one of the tasks below so weights sum to 100%."
            />
          ) : null}
          {coverage.topUnder?.length > 0 ? (
            <CoverageOffenders
              title="Under-allocated (WBS gap)"
              tone="warn"
              rows={coverage.topUnder}
              measureLabel="shortfall"
              measureKey="shortfall"
              note="Add another task to cover the rest, or raise an existing task's weight."
            />
          ) : null}
          {coverage.topUnlinked?.length > 0 ? (
            <CoverageOffenders
              title="Unlinked BoQ entries"
              tone=""
              rows={coverage.topUnlinked}
              measureLabel="value"
              measureKey="amount"
              note="Add a task for each, or link it to an existing one."
            />
          ) : null}
          {onViewDetails ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={onViewDetails} className="ds-btn ds-btn-sm btn-o">
                <FaLayerGroup size={13} />
                Open WBS to fix
                <FaArrowRight size={12} />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

// A collapsible list inside the coverage panel: his panel, his group title
// and a count chip in the head, his use-lines below.
function Collapsible({ title, count, tone, note, children }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div
      className="wk-panel"
      style={{ ...NO_MB, ...(tone === "warn" ? { borderColor: "var(--pal-orange-line)" } : null) }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          ...LINK_BTN,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "12px 16px",
          color: "var(--ink)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, textAlign: "left" }}>
          <span className="wk-grp" style={{ padding: 0, color: tone === "warn" ? SERIES.alert : undefined }}>
            {title}
          </span>
          <span className="wk-src sm" style={chipTone(tone)}>
            {count}
          </span>
        </span>
        <span className="wk-locnote">{open ? "Hide ▾" : "Show ▸"}</span>
      </button>
      {open ? (
        <div style={{ borderTop: "1px solid var(--line)" }}>
          {note ? (
            <p className="wk-locnote" style={{ margin: 0, padding: "10px 16px 0" }}>
              {note}
            </p>
          ) : null}
          <div className="wk-use">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

// Tasks whose linkedBoqIdentities point at BoQ rows that no longer
// exist in the current scope. This is the silent cause of "Task shows
// ₦0 baseline even though I linked 5 items" — the items were renamed
// or re-ordered, breaking the identity hash.
function StaleLinksPanel({ tasks }) {
  return (
    <Collapsible
      title="Tasks with stale BoQ links"
      count={tasks.length}
      tone="warn"
      note="These tasks are linked to BoQ rows that no longer exist (renamed, deleted, or re-ordered). Their baseline cost has silently dropped to ₦0. Open the task and re-link to the current BoQ rows to fix."
    >
      {tasks.map((t) => (
        <div className="wk-useline" key={t.taskId || t.wbs || t.name}>
          <span className="p" title={t.name}>
            {t.name}
            {t.wbs ? <em>WBS {t.wbs}</em> : null}
          </span>
          <span className="q" />
          <span className="v" style={{ color: SERIES.alert }}>
            {t.staleCount} of {t.totalLinks} link{t.totalLinks === 1 ? "" : "s"} broken
          </span>
        </div>
      ))}
    </Collapsible>
  );
}

// CoverageStat — one of the four tiles inside the BoQ↔WBS coverage
// panel. When `details` is provided AND non-empty, the tile becomes
// hover-popover-able: hovering the value reveals the full list of
// offending BoQ rows under that bucket. Useful for the Unlinked tile
// where users explicitly asked "show me which items aren't covered".
function CoverageStat({
  label,
  value,
  hint,
  tone = "",
  details = null, // optional array of { description, kind, amount }
  detailsLabel = "Items",
  // S18: an optional link under the figure, e.g. "Plan them".
  action = null,
}) {
  const [open, setOpen] = React.useState(false);
  const hasDetails = Array.isArray(details) && details.length > 0;
  // Hover state is debounced so the popover doesn't flicker when the
  // user crosses the gap between the tile and the floating panel.
  const hideTimer = React.useRef(null);
  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setOpen(false), 250);
  };

  return (
    <div
      className={`dsh-stat${tileTone(tone) ? ` ${tileTone(tone)}` : ""}`}
      style={{ overflow: "visible", zIndex: open ? 30 : undefined, cursor: hasDetails ? "help" : undefined }}
      onMouseEnter={hasDetails ? () => { cancelHide(); setOpen(true); } : undefined}
      onMouseLeave={hasDetails ? scheduleHide : undefined}
      onFocus={hasDetails ? () => setOpen(true) : undefined}
      onBlur={hasDetails ? scheduleHide : undefined}
      tabIndex={hasDetails ? 0 : -1}
    >
      <span className="k">{label}</span>
      <b>{value}</b>
      {hint ? <span className="ds-sub" title={hint}>{hint}</span> : null}
      {hasDetails ? (
        <span className="ds-sub" style={{ color: "var(--action)" }}>Hover for list ▾</span>
      ) : null}
      {action ? <span className="ds-sub">{action}</span> : null}

      {/* Floating list of the offender rows, in his dropdown surface.
          Positioned below the tile so it doesn't get clipped on narrow
          viewports. */}
      {hasDetails && open ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(100% + 6px)",
            zIndex: 30,
            minWidth: 260,
            borderRadius: 14,
            border: "1px solid var(--line)",
            background: "var(--bg)",
            boxShadow: "0 3px 10px rgba(var(--shadow-c),.08), 0 20px 46px rgba(var(--shadow-c),.20)",
            overflow: "hidden",
          }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              padding: "10px 14px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <span className="wk-grp" style={{ padding: 0 }}>
              {detailsLabel} · {details.length}
            </span>
            <span className="wk-locnote">{details.length >= 20 ? "showing top 20" : ""}</span>
          </div>
          <div className="wk-use" style={{ maxHeight: 288, overflow: "auto", padding: "2px 14px" }}>
            {details.map((d, idx) => {
              const badge = COVERAGE_KIND_BADGE[d.kind] || COVERAGE_KIND_BADGE.measured;
              return (
                <div className="wk-useline" key={d.identity || idx}>
                  <span className="p" title={d.description}>
                    {d.description || `Item ${d.identity}`}
                  </span>
                  <span className="q">
                    <span className="wk-src sm" style={badge.style}>{badge.label}</span>
                  </span>
                  <span className="v">
                    {safeNum(d.amount) > 0 ? `₦${fmtMoney(d.amount)}` : "₦0"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const COVERAGE_KIND_BADGE = {
  measured: { label: "BoQ", style: undefined },
  preliminary: { label: "Prelim", style: palChip("deep") },
  provisional: { label: "PC sum", style: palChip("grad") },
  variation: { label: "Variation", style: palChip("orange") },
};

function CoverageOffenders({ title, tone, rows, measureLabel, measureKey, note }) {
  return (
    <Collapsible title={title} count={rows.length} tone={tone} note={note}>
      {rows.map((row) => {
        const badge = COVERAGE_KIND_BADGE[row.kind] || COVERAGE_KIND_BADGE.measured;
        const measure = safeNum(row[measureKey]);
        const linkedTasks = Array.isArray(row.taskNames) ? row.taskNames : [];
        return (
          <div className="wk-useline" key={row.identity}>
            <span className="p" style={{ overflowWrap: "anywhere" }}>
              {row.description || `Item #${row.identity}`}
              {linkedTasks.length > 0 ? (
                <em>
                  Linked from: {linkedTasks.slice(0, 3).join(", ")}
                  {linkedTasks.length > 3 ? ` +${linkedTasks.length - 3} more` : ""}
                  {row.totalWeight != null
                    ? ` (total weight ${Math.round(safeNum(row.totalWeight))}%)`
                    : ""}
                </em>
              ) : null}
            </span>
            <span className="q">
              <span className="wk-src sm" style={badge.style}>{badge.label}</span>
            </span>
            <span className="v">
              ₦{fmtMoney(measure)}
              <em style={{ display: "block", fontStyle: "normal", fontSize: 11.5, fontWeight: 300, color: "var(--ink-3)" }}>
                {measureLabel} of ₦{fmtMoney(row.amount)}
              </em>
            </span>
          </div>
        );
      })}
    </Collapsible>
  );
}

// ────────────────────────────────────────────────────────────────────
// WbsHealthStrip — single panel summarising the WBS by STATUS
// (not-started / in-progress / blocked / completed) and PRIORITY
// (critical / high / medium / low / none).
//
// Why this exists: the Tasks chart shows status %, but priority was
// only surfaced through "Overdue by priority" which reads zero on
// healthy projects. Users couldn't see "how many critical tasks do
// I have" without drilling into the WBS itself.
// ────────────────────────────────────────────────────────────────────
function WbsHealthStrip({
  tasksByStatus,
  tasksByPriority,
  overdueByPriority,
  totalTasks,
  // Critical-path counters from the MS Project import. `total` is the
  // whole count; `pending` is total minus already-completed (the live
  // exposure to schedule slip).
  criticalPathTotal = 0,
  criticalPathPending = 0,
}) {
  if (!totalTasks) return null;

  const statusItems = [
    { key: "completed", label: "Completed", color: SERIES.done },
    { key: "in-progress", label: "In progress", color: SERIES.active },
    { key: "blocked", label: "Blocked", color: SERIES.alert },
    { key: "not-started", label: "Not started", color: SERIES.idle },
  ];

  const priorityItems = [
    { key: "critical", label: "Critical", color: SERIES.alert },
    { key: "high", label: "High", color: SERIES.soft },
    { key: "medium", label: "Medium", color: SERIES.done },
    { key: "low", label: "Low", color: SERIES.idle },
    { key: "none", label: "Unset", color: SERIES.empty },
  ];

  const overdueTotal = priorityItems.reduce(
    (acc, p) => acc + safeNum(overdueByPriority?.[p.key]),
    0,
  );

  const bar = (items, source, titleFor) => (
    <div className="dsh-meter">
      <div className="track" style={{ display: "flex", height: 10 }}>
        {items.map((it) => {
          const c = safeNum(source?.[it.key]);
          const w = totalTasks > 0 ? (c / totalTasks) * 100 : 0;
          if (w === 0) return null;
          return (
            <i
              key={it.key}
              style={{ width: `${w}%`, borderRadius: 0, background: it.color }}
              title={titleFor(it, c)}
            />
          );
        })}
      </div>
    </div>
  );

  const chips = { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 };

  return (
    <Panel eyebrow="Work breakdown" title="WBS health" note={`${totalTasks} task${totalTasks === 1 ? "" : "s"} total · ${overdueTotal} overdue`}>
      <div style={{ ...BODY, display: "grid", gap: 18 }}>
        {/* Critical-path note, only shown when MS Project import flagged
            at least one task. */}
        {safeNum(criticalPathTotal) > 0 ? (
          <div
            className="mk-note"
            style={{ ...NOTE_WARN, margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}
          >
            <span>
              <strong>
                Critical path · {criticalPathTotal} task{criticalPathTotal === 1 ? "" : "s"}
              </strong>
              <br />
              {criticalPathPending > 0
                ? `${criticalPathPending} still pending, any delay slips the project finish date`
                : "All critical-path tasks complete, schedule risk has cleared"}
            </span>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Imported from MS Project</span>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 22, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {/* Status */}
          <div>
            <p className="wk-grp" style={{ padding: "0 0 10px", margin: 0 }}>WBS status</p>
            {bar(statusItems, tasksByStatus, (s, c) => `${s.label}: ${c}`)}
            <div style={chips}>
              {statusItems.map((s) => (
                <span className="wk-src sm" key={s.key}>
                  <Swatch color={s.color} />
                  {s.label}
                  <b style={{ fontWeight: 500, color: "var(--ink)" }}>{safeNum(tasksByStatus?.[s.key])}</b>
                </span>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <p className="wk-grp" style={{ padding: "0 0 10px", margin: 0 }}>WBS priority</p>
            {bar(priorityItems, tasksByPriority, (p, c) =>
              `${p.label}: ${c}${
                safeNum(overdueByPriority?.[p.key]) > 0
                  ? ` (${overdueByPriority[p.key]} overdue)`
                  : ""
              }`,
            )}
            <div style={chips}>
              {priorityItems.map((p) => {
                const c = safeNum(tasksByPriority?.[p.key]);
                const od = safeNum(overdueByPriority?.[p.key]);
                return (
                  <span className="wk-src sm" key={p.key} style={od > 0 ? palChip("orange") : undefined}>
                    <Swatch color={p.color} />
                    {p.label}
                    <b style={{ fontWeight: 500 }}>
                      {c}
                      {od > 0 ? ` (${od}!)` : ""}
                    </b>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
