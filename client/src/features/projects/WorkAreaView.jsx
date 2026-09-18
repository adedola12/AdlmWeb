// src/features/projects/WorkAreaView.jsx
//
// The Work area: one screen with the model, the priced bill and the schedule,
// joined — pick a bill line and its elements light up; pick a task and the
// lines it builds (and their elements) light up; click an element and the
// lines and tasks behind it are found. Ada sits beside it with the project's
// AI checks.
//
// Built only from Richard's pieces: .wk-panel/.wk-ph, his bill rows
// (.wk-qt/.wk-qhd/.wk-qr), his programme bars (.wk-gantt/.wk-ghd/.wk-gr), his
// Ada panel (.ada-h/.ada-log/.ada-m/.ada-sug/.ada-f/.ada-foot), .dsh-stat
// tiles and .wk-src chips.
//
// Everything shown is read from data the page already holds: the bill rows,
// the PM dashboard (tasks, EVM totals), the material & labour lines and the
// attached models. The health check is computed here, the same way his Ada
// computes her answers — nothing is scripted. The three AI checks call the
// /ai routes with the user's own token; Ada is /agent/chat.

import React from "react";
import { API_BASE } from "../../config";
import { apiAuthed } from "../../http.js";
import ChatMarkdown from "../../lib/chatMarkdown.jsx";
import { FaMagic } from "../../components/icons.jsx";

const ModelViewer = React.lazy(() => import("./ModelViewer.jsx"));

// ─────────────────────────────────────────────────────────────── helpers ──
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function naira(v) {
  return "₦" + safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function money(v) {
  return safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function qtyText(v) {
  return safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function toDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function shortDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }) : "–";
}
const DAY = 86400000;

// Mirror of the server's itemIdentity (server/services/pmCompute.js). It
// hashes the RAW bill item and its index; PM task links store this string.
function itemIdentity(item, index) {
  const sn = safeNum(item?.sn) || index + 1;
  return [
    sn,
    String(item?.code || "").trim().toLowerCase(),
    String(item?.description || "").trim().toLowerCase(),
    String(item?.takeoffLine || "").trim().toLowerCase(),
    String(item?.materialName || "").trim().toLowerCase(),
    String(item?.unit || "").trim().toLowerCase(),
  ].join("::");
}

function palChip(pal) {
  return {
    background: `var(--pal-${pal}-wash)`,
    color: `var(--pal-${pal}-key)`,
    borderColor: `var(--pal-${pal}-line)`,
  };
}
const NO_MB = { marginBottom: 0 };
const TRUNC = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

// AI verdict / flag → his chip.
function verdictChip(v) {
  if (!v) return null;
  const label = String(v.verdict || "").replace(/_/g, " ");
  const style = v.verdict === "in_range" ? palChip("light") : palChip("orange");
  const pct = Number.isFinite(Number(v.deviationPercent))
    ? ` ${Number(v.deviationPercent) > 0 ? "+" : ""}${Math.round(Number(v.deviationPercent))}%`
    : "";
  return { label: label + (v.verdict === "in_range" ? "" : pct), style, title: v.reason || "" };
}

const MAX_AI_ITEMS = 250; // the /ai routes cap a call at 250 lines
const ADA_MAX = 1000; // /agent/chat rejects longer messages

// ────────────────────────────────────────────────────────── health check ──
// Duration, time, cost and material, computed from what the page holds.
// Each finding carries a tone: "warn" (over-run / behind), "good" (under-run
// / ahead) or "" (neutral).
function computeHealth({ pmDashboard, rows, budgetLines, now = Date.now() }) {
  const totals = pmDashboard?.totals || {};
  const headline = pmDashboard?.headline || {};
  const tasks = Array.isArray(pmDashboard?.tasks) ? pmDashboard.tasks : [];
  const leaves = tasks.filter((t) => !(t?.isSummary || t?.rollup));

  // Time
  const start = toDate(pmDashboard?.projectStart);
  const finish = toDate(pmDashboard?.projectFinish);
  const latestEnd = leaves.reduce((acc, t) => {
    const e = toDate(t?.endDate);
    return e && (!acc || e > acc) ? e : acc;
  }, null);
  const slipDays = finish && latestEnd ? Math.round((latestEnd - finish) / DAY) : null;
  const overdue = safeNum(headline.overdueCount);
  const spi = safeNum(headline.SPI);
  const elapsedPct =
    start && finish && finish > start
      ? Math.max(0, Math.min(100, ((now - start) / (finish - start)) * 100))
      : null;
  const donePct = safeNum(headline.progressPercent);

  // Duration: tasks whose recorded actual days differ from planned
  let longer = 0;
  let shorter = 0;
  let extraDays = 0;
  let savedDays = 0;
  for (const t of leaves) {
    const v = safeNum(t?.computed?.scheduleVarianceDays);
    const actual = safeNum(t?.computed?.actualDuration ?? t?.actualDurationDays);
    if (!actual) continue;
    if (v > 0) {
      longer += 1;
      extraDays += v;
    } else if (v < 0) {
      shorter += 1;
      savedDays += -v;
    }
  }

  // Cost
  const bac = safeNum(totals.BAC);
  const eac = safeNum(totals.EAC);
  const vac = safeNum(totals.VAC);
  const cpi = safeNum(headline.CPI);
  const actualRows = rows.filter((r) => r.actualHasData);
  const actualVar = actualRows.reduce((a, r) => a + safeNum(r.actualVarianceAmount), 0);
  const unpriced = rows.filter((r) => safeNum(r.qty) > 0 && !safeNum(r.rate)).length;

  // Material: the Budget view's material & labour lines, materials only.
  const mats = (budgetLines || []).filter((m) => {
    const k = String(m?.componentKind || "material").toLowerCase();
    return k === "material";
  });
  const matDone = (m) =>
    Boolean(m?.procured || m?.purchased || m?.completed) ||
    safeNum(m?.procuredPercent) >= 100 ||
    safeNum(m?.percentComplete) >= 100;
  const matValue = (m) => safeNum(m?.qty) * safeNum(m?.rate);
  const matTotal = mats.reduce((a, m) => a + matValue(m), 0);
  const matBought = mats.filter(matDone).reduce((a, m) => a + matValue(m), 0);
  const matOpen = mats.filter((m) => !matDone(m)).length;
  const matUnpriced = mats.filter((m) => safeNum(m?.qty) > 0 && !safeNum(m?.rate)).length;

  const tiles = [
    {
      label: "Time",
      value: slipDays == null ? (spi ? `SPI ${spi.toFixed(2)}` : "–") : slipDays > 0 ? `+${slipDays}d` : slipDays < 0 ? `${slipDays}d` : "On date",
      sub:
        slipDays == null
          ? "Set the project finish date to forecast a slip"
          : slipDays > 0
            ? "Schedule runs past the project finish"
            : slipDays < 0
              ? "Schedule finishes before the project finish"
              : "Schedule ends on the project finish",
      tone: slipDays > 0 || (spi && spi < 0.9) ? "warn" : slipDays < 0 || spi >= 1 ? "good" : "",
    },
    {
      label: "Duration",
      value: longer || shorter ? `${longer} longer · ${shorter} shorter` : "–",
      sub: longer || shorter
        ? `${extraDays}d over, ${savedDays}d saved on recorded tasks`
        : "No actual durations recorded yet",
      tone: extraDays > savedDays ? "warn" : savedDays > extraDays ? "good" : "",
    },
    {
      label: "Cost",
      value: bac && eac
        ? vac > 0 ? `Under ${naira(vac)}` : vac < 0 ? `Over ${naira(-vac)}` : "On budget"
        : actualRows.length
          ? actualVar > 0 ? `Over ${naira(actualVar)}` : actualVar < 0 ? `Under ${naira(-actualVar)}` : "On plan"
          : "–",
      sub: bac && eac
        ? `Forecast ${naira(eac)} against ${naira(bac)}${cpi ? ` · CPI ${cpi.toFixed(2)}` : ""}`
        : actualRows.length
          ? `Actuals on ${actualRows.length} bill line${actualRows.length === 1 ? "" : "s"} against their planned amounts`
          : "No actual cost recorded yet",
      tone: (bac && eac ? vac < 0 : actualVar > 0) ? "warn" : (bac && eac ? vac > 0 : actualVar < 0) ? "good" : "",
    },
    {
      label: "Material",
      value: matTotal ? `${Math.round((matBought / matTotal) * 100)}% bought` : mats.length ? `${mats.length} lines` : "–",
      sub: mats.length
        ? `${naira(matBought)} of ${naira(matTotal)} · ${matOpen} line${matOpen === 1 ? "" : "s"} still to buy`
        : "No material breakdown on this project",
      tone: matUnpriced ? "warn" : "",
    },
  ];

  const findings = [];
  if (slipDays > 0) findings.push({ tone: "warn", text: `Time over-run: the last task ends ${slipDays} day(s) after the project finish (${shortDate(finish)}).` });
  if (slipDays < 0) findings.push({ tone: "good", text: `Time under-run: the schedule finishes ${-slipDays} day(s) before the project finish.` });
  if (overdue) findings.push({ tone: "warn", text: `${overdue} task(s) are past their end date and not complete.` });
  if (elapsedPct != null && leaves.length) {
    const gap = Math.round(elapsedPct - donePct);
    if (gap > 5) findings.push({ tone: "warn", text: `Behind: ${Math.round(elapsedPct)}% of the project time has passed, ${Math.round(donePct)}% of the work is done.` });
    else if (gap < -5) findings.push({ tone: "good", text: `Ahead: ${Math.round(donePct)}% done with ${Math.round(elapsedPct)}% of the time gone.` });
  }
  if (longer) findings.push({ tone: "warn", text: `Duration over-run on ${longer} task(s), ${extraDays} day(s) in total.` });
  if (shorter) findings.push({ tone: "good", text: `Duration under-run on ${shorter} task(s), ${savedDays} day(s) saved.` });
  if (bac && eac && vac < 0) findings.push({ tone: "warn", text: `Cost over-run: forecast ${naira(eac)} exceeds the budget ${naira(bac)} by ${naira(-vac)}.` });
  if (bac && eac && vac > 0) findings.push({ tone: "good", text: `Cost under-run: forecast ${naira(eac)} is ${naira(vac)} below the budget.` });
  if (actualRows.length) {
    const over = actualRows.filter((r) => safeNum(r.actualVarianceAmount) > 0).length;
    const under = actualRows.filter((r) => safeNum(r.actualVarianceAmount) < 0).length;
    if (over) findings.push({ tone: "warn", text: `${over} bill line(s) have actual cost above plan.` });
    if (under) findings.push({ tone: "good", text: `${under} bill line(s) have actual cost below plan.` });
  }
  if (unpriced) findings.push({ tone: "warn", text: `${unpriced} bill line(s) have a quantity but no rate.` });
  if (matUnpriced) findings.push({ tone: "warn", text: `${matUnpriced} material line(s) have no price, so the material budget is understated.` });
  if (matOpen && mats.length) findings.push({ tone: "", text: `${matOpen} material line(s) are still to be bought.` });
  if (!findings.length) findings.push({ tone: "", text: "Nothing to flag from the data on this project yet." });

  return { tiles, findings };
}

function healthSummaryText(projectName, health) {
  const lines = health.findings.map((f) => `- ${f.text}`).join("\n");
  return `My project "${projectName}" health check found:\n${lines}\nExplain what this means and what I should do first.`.slice(0, ADA_MAX);
}

// ──────────────────────────────────────────────────────────────── view ──
export default function WorkAreaView({
  projectName = "Project",
  productKey = "",
  projectId = "",
  accessToken = "",
  items = [],
  rows = [],
  projectModels = {},
  materialItems = [],
  budgetItems = [],
  pmDashboard = null,
  canSeeRates = true,
}) {
  const [billQuery, setBillQuery] = React.useState("");
  const [selectedKeys, setSelectedKeys] = React.useState(() => new Set());
  const [taskId, setTaskId] = React.useState(null);
  const [pickedId, setPickedId] = React.useState(0);
  const [taskFilter, setTaskFilter] = React.useState("all");
  const [verdicts, setVerdicts] = React.useState({}); // row key → chip
  const [flags, setFlags] = React.useState({}); // row key → chip

  const hasModel = ["architectural", "structural", "mep"].some((d) => projectModels?.[d]?.url);

  // Row ↔ identity ↔ elements, built once per bill.
  const index = React.useMemo(() => {
    const byIdentity = new Map();
    const byKey = new Map();
    for (const row of rows) {
      const item = items[row.i] || {};
      const id = itemIdentity(item, row.i);
      const elementIds = (item.elementIds || []).map(Number).filter((n) => n > 0);
      const entry = { row, item, identity: id, elementIds };
      byIdentity.set(id, entry);
      byKey.set(row.key, entry);
    }
    return { byIdentity, byKey };
  }, [rows, items]);

  const tasks = React.useMemo(
    () => (Array.isArray(pmDashboard?.tasks) ? pmDashboard.tasks : []),
    [pmDashboard?.tasks],
  );
  const selectedTask = tasks.find((t) => t.taskId === taskId) || null;

  // Keys of the lines the current task builds.
  const taskKeys = React.useMemo(() => {
    if (!selectedTask) return null;
    const keys = new Set();
    for (const id of selectedTask.linkedBoqIdentities || []) {
      const e = index.byIdentity.get(id);
      if (e) keys.add(e.row.key);
    }
    return keys;
  }, [selectedTask, index]);

  // Keys of the lines the clicked element belongs to.
  const pickKeys = React.useMemo(() => {
    if (!pickedId) return null;
    const keys = new Set();
    for (const [k, e] of index.byKey) if (e.elementIds.includes(pickedId)) keys.add(k);
    return keys;
  }, [pickedId, index]);

  // What the model lights up: the explicit selection, else the task's lines.
  const highlightIds = React.useMemo(() => {
    const keys = selectedKeys.size ? selectedKeys : taskKeys || pickKeys || new Set();
    const ids = new Set();
    for (const k of keys) for (const n of index.byKey.get(k)?.elementIds || []) ids.add(n);
    return [...ids];
  }, [selectedKeys, taskKeys, pickKeys, index]);

  // Tasks that build the picked/selected lines, for the schedule marker.
  const relatedTaskIds = React.useMemo(() => {
    const keys = pickKeys || (selectedKeys.size ? selectedKeys : null);
    if (!keys) return null;
    const ids = new Set([...keys].map((k) => index.byKey.get(k)?.identity).filter(Boolean));
    return new Set(
      tasks.filter((t) => (t.linkedBoqIdentities || []).some((i) => ids.has(i))).map((t) => t.taskId),
    );
  }, [pickKeys, selectedKeys, tasks, index]);

  // Bill rows shown: a task or pick narrows them; search narrows further.
  const shownRows = React.useMemo(() => {
    const scope = taskKeys || pickKeys;
    const q = billQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope && !scope.has(r.key)) return false;
      if (!q) return true;
      return (
        String(r.description || "").toLowerCase().includes(q) ||
        String(r.category || "").toLowerCase().includes(q) ||
        String(r.trade || "").toLowerCase().includes(q)
      );
    });
  }, [rows, taskKeys, pickKeys, billQuery]);

  const toggleRow = (key) => {
    setPickedId(0);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const clearAll = () => {
    setSelectedKeys(new Set());
    setTaskId(null);
    setPickedId(0);
  };

  // ── AI ───────────────────────────────────────────────────────────────
  const [log, setLog] = React.useState([]); // {who:'you'|'ada', text, big?, card?}
  const [aiBusy, setAiBusy] = React.useState("");
  const [input, setInput] = React.useState("");
  const logRef = React.useRef(null);
  const sessionRef = React.useRef(`work-${projectId}-${Date.now().toString(36)}`);
  React.useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log, aiBusy]);

  const say = (entry) => setLog((prev) => [...prev, entry]);

  const aiItems = (keys) => {
    const list = (keys ? rows.filter((r) => keys.has(r.key)) : rows)
      .filter((r) => safeNum(r.qty) > 0)
      .sort((a, b) => safeNum(b.fullAmount) - safeNum(a.fullAmount));
    return {
      items: list.slice(0, MAX_AI_ITEMS).map((r) => ({
        ref: r.key,
        description: r.description,
        unit: r.unit,
        quantity: safeNum(r.qty),
        rate: safeNum(r.rate),
      })),
      skipped: Math.max(0, list.length - MAX_AI_ITEMS),
    };
  };

  const selectionContext = () => {
    const picked = rows.filter((r) => selectedKeys.has(r.key)).slice(0, 5);
    const parts = [];
    if (picked.length) {
      parts.push(
        `Selected lines: ${picked
          .map((r) => `${r.description.slice(0, 60)} (${qtyText(r.qty)} ${r.unit}${canSeeRates ? ` @ ${money(r.rate)}` : ""})`)
          .join("; ")}`,
      );
    }
    if (selectedTask) parts.push(`Selected task: ${selectedTask.wbs || ""} ${selectedTask.name || ""}`.trim());
    return parts.join(". ");
  };

  async function askAda(text) {
    const q = String(text || "").trim();
    if (!q || aiBusy) return;
    setInput("");
    say({ who: "you", text: q });
    setAiBusy("ada");
    const ctx = selectionContext();
    const message = `About my project "${projectName}": ${q}${ctx ? `\n(${ctx})` : ""}`.slice(0, ADA_MAX);
    const history = log
      .filter((m) => m.who === "you" || m.who === "ada")
      .slice(-10)
      .map((m) => ({ role: m.who === "you" ? "user" : "assistant", text: m.text }));
    try {
      const headers = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const res = await fetch(`${API_BASE}/agent/chat`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ message, history, sessionId: sessionRef.current }),
      });
      const json = await res.json().catch(() => ({}));
      say({ who: "ada", text: json?.reply || json?.error || "I couldn't answer that just now. Please try again." });
    } catch {
      say({ who: "ada", text: "I can't reach the server right now. Please try again in a moment." });
    } finally {
      setAiBusy("");
    }
  }

  async function checkLines() {
    if (aiBusy) return;
    const keys = selectedKeys.size ? selectedKeys : null;
    const { items: list, skipped } = aiItems(keys);
    const priced = list.filter((i) => i.rate > 0);
    say({ who: "you", text: keys ? `Check the ${selectedKeys.size} selected line(s) against the market` : "Check my bill against the market" });
    if (!priced.length) {
      say({ who: "ada", text: "There are no priced lines to check. A line needs a rate before it can be compared with the market; I can build one up for a selected line." });
      return;
    }
    setAiBusy("check");
    try {
      const res = await apiAuthed("/ai/boq-check", { method: "POST", token: accessToken, data: { items: priced } });
      const list2 = Array.isArray(res?.verdicts) ? res.verdicts : [];
      const next = {};
      for (const v of list2) next[String(v.ref)] = verdictChip(v);
      setVerdicts((prev) => ({ ...prev, ...next }));
      const s = res?.summary || {};
      say({
        who: "ada",
        big: `${s.overMarket ?? 0} above · ${s.underMarket ?? 0} below`,
        text: `${s.items ?? list2.length} line(s) checked: ${s.inRange ?? 0} in range${s.mismatches ? `, ${s.mismatches} unit mismatch(es)` : ""}. Each line now carries its verdict in the bill.${skipped ? ` ${skipped} smaller line(s) were not checked (250 per run).` : ""} These verdicts are advisory.`,
      });
    } catch (e) {
      say({ who: "ada", text: e?.message || "The market check is unavailable right now." });
    } finally {
      setAiBusy("");
    }
  }

  async function scanBill() {
    if (aiBusy) return;
    const { items: list, skipped } = aiItems(null);
    say({ who: "you", text: "Scan the bill for errors" });
    if (!list.length) {
      say({ who: "ada", text: "This bill has no lines with quantities to scan." });
      return;
    }
    setAiBusy("scan");
    try {
      const res = await apiAuthed("/ai/outliers", { method: "POST", token: accessToken, data: { items: list } });
      const found = Array.isArray(res?.flags) ? res.flags : [];
      const next = {};
      for (const f of found) {
        next[String(f.ref)] = {
          label: String(f.type || "issue").replace(/_/g, " "),
          style: palChip("orange"),
          title: f.reason || "",
        };
      }
      setFlags(next);
      say({
        who: "ada",
        big: `${res?.flagCount ?? found.length} issue${(res?.flagCount ?? found.length) === 1 ? "" : "s"}`,
        text: found.length
          ? `Found in ${res?.itemsChecked ?? list.length} line(s). Flagged lines are marked in the bill; hover a flag for the reason.${skipped ? ` ${skipped} smaller line(s) were not scanned.` : ""}`
          : `${res?.itemsChecked ?? list.length} line(s) checked: no duplicates, unit errors or odd quantities.`,
      });
    } catch (e) {
      say({ who: "ada", text: e?.message || "The error scan is unavailable right now." });
    } finally {
      setAiBusy("");
    }
  }

  async function buildRate() {
    if (aiBusy) return;
    const picked = rows.filter((r) => selectedKeys.has(r.key));
    if (picked.length !== 1) {
      say({ who: "ada", text: "Select exactly one bill line and I'll build its rate up from materials, labour and plant." });
      return;
    }
    const r = picked[0];
    say({ who: "you", text: `Build up a rate for "${r.description.slice(0, 80)}"` });
    setAiBusy("rate");
    try {
      const res = await apiAuthed("/ai/rate-buildup", {
        method: "POST",
        token: accessToken,
        data: { description: r.description, unit: r.unit || undefined },
      });
      const comps = Array.isArray(res?.components) ? res.components : [];
      say({
        who: "ada",
        big: res?.rateNgn != null ? `${naira(res.rateNgn)}${res.unit || r.unit ? ` / ${res.unit || r.unit}` : ""}` : undefined,
        text: `Net ${naira(res?.netCostNgn)} + overhead ${res?.overheadPercent ?? 0}% + profit ${res?.profitPercent ?? 0}%. A proposal: nothing in the bill has changed.`,
        card: comps.slice(0, 12).map((c) => ({
          title: `${c.name || "Component"} · ${c.kind || "material"}`,
          sub: `${c.quantity ?? "?"} ${c.unit || ""} @ ${naira(c.unitPriceNgn)}${c.source === "library" ? " · library" : " · inferred"}`,
          value: naira(c.totalNgn),
        })),
      });
    } catch (e) {
      say({ who: "ada", text: e?.message || "The rate build-up is unavailable right now." });
    } finally {
      setAiBusy("");
    }
  }

  const health = React.useMemo(
    () =>
      computeHealth({
        pmDashboard,
        rows,
        budgetLines: budgetItems?.length ? budgetItems : materialItems,
      }),
    [pmDashboard, rows, budgetItems, materialItems],
  );
  const [showHealth, setShowHealth] = React.useState(false);
  function runHealth() {
    say({ who: "you", text: "Check duration, time, cost and material" });
    setShowHealth(true);
    say({
      who: "ada",
      text: health.findings.map((f) => f.text).join(" "),
      big: `${health.findings.filter((f) => f.tone === "warn").length} to watch`,
    });
  }

  // ── schedule geometry ────────────────────────────────────────────────
  const schedule = React.useMemo(() => {
    const dated = tasks.filter((t) => toDate(t.startDate) && toDate(t.endDate));
    if (!dated.length) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const t of dated) {
      min = Math.min(min, toDate(t.startDate).getTime());
      max = Math.max(max, toDate(t.endDate).getTime());
    }
    const span = Math.max(DAY, max - min);
    // Month ticks for the ruler.
    const ticks = [];
    const d = new Date(min);
    d.setDate(1);
    while (d.getTime() <= max) {
      const at = ((d.getTime() - min) / span) * 100;
      if (at >= 0) ticks.push({ at, label: d.toLocaleDateString(undefined, { month: "short" }) });
      d.setMonth(d.getMonth() + 1);
    }
    return { min, span, ticks, now: ((Date.now() - min) / span) * 100 };
  }, [tasks]);

  const shownTasks = React.useMemo(() => {
    return tasks.filter((t) => {
      if (taskFilter === "overdue") return Boolean(t?.computed?.isOverdue);
      if (taskFilter === "critical") return Boolean(t?.criticalPath);
      if (taskFilter === "linked") return (t.linkedBoqIdentities || []).length > 0;
      return true;
    });
  }, [tasks, taskFilter]);

  const totalShown = shownRows.reduce((a, r) => a + safeNum(r.fullAmount), 0);
  const filteredByBill = rows.length < items.length;

  const SUGGEST = [
    { label: "Check duration, time, cost & material", run: runHealth },
    { label: selectedKeys.size ? `Check ${selectedKeys.size} selected line(s)` : "Check my rates against the market", run: checkLines },
    { label: "Scan the bill for errors", run: scanBill },
    { label: "Build up a rate for the selected line", run: buildRate },
    { label: "What is this project worth?", run: () => askAda("What is this project worth, and how much work is done?") },
  ];

  // ── render ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {/* Selection bar */}
      <div className="wk-bar" style={NO_MB}>
        <span className="wk-locnote" style={{ marginRight: "auto" }}>
          {selectedKeys.size
            ? `${selectedKeys.size} line${selectedKeys.size === 1 ? "" : "s"} selected`
            : selectedTask
              ? `Task ${selectedTask.wbs || ""} ${selectedTask.name || ""}: ${taskKeys?.size || 0} linked line(s)`
              : pickedId
                ? `Element ${pickedId}: ${pickKeys?.size || 0} bill line(s)`
                : "Pick a bill line, a task or an element to see how they join up."}
        </span>
        {selectedKeys.size || selectedTask || pickedId ? (
          <button type="button" className="ds-btn ds-btn-sm btn-o" onClick={clearAll}>
            Clear selection
          </button>
        ) : null}
      </div>

      <div className="wa-top" style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", alignItems: "start" }}>
        {/* Model */}
        <div style={{ minWidth: 0 }}>
          {hasModel ? (
            <React.Suspense fallback={<div className="wk-panel wk-empty" style={NO_MB}>Loading 3D viewer…</div>}>
              <ModelViewer
                compact
                height={430}
                projectModels={projectModels}
                items={items}
                materialItems={materialItems}
                productKey={productKey}
                projectId={projectId}
                accessToken={accessToken}
                highlightIds={highlightIds}
                onPickElement={(id) => {
                  setSelectedKeys(new Set());
                  setTaskId(null);
                  setPickedId(id);
                }}
              />
            </React.Suspense>
          ) : (
            <section className="wk-panel" style={NO_MB}>
              <div className="wk-ph">
                <h2>Model</h2>
              </div>
              <div className="wk-empty">
                No model is attached to this project. Save it from QUIV to see the
                building here; the bill, schedule and Ada still work.
              </div>
            </section>
          )}
        </div>

        {/* Ada */}
        <aside className="wk-panel" aria-label="Ada" style={{ ...NO_MB, display: "flex", flexDirection: "column", height: 520 }}>
          <header className="ada-h" style={{ borderBottom: "1px solid var(--line)" }}>
            <span className="ada-av" style={{ background: "var(--action-grad)" }}>
              <FaMagic size={18} />
            </span>
            <span className="ada-t">
              <b>Ada</b>
              <em>Answering from {projectName}</em>
            </span>
          </header>
          <div className="ada-log" ref={logRef}>
            {log.length === 0 ? (
              <div className="ada-m ada-ada">
                <p>
                  Ask about this project, or pick a check. Select bill lines or a task
                  first and I&apos;ll work on those.
                </p>
              </div>
            ) : null}
            {log.map((m, i) => (
              <div key={i} className={`ada-m ada-${m.who}`}>
                {m.big ? <span className="ada-big">{m.big}</span> : null}
                {m.who === "ada" ? (
                  <ChatMarkdown text={m.text} />
                ) : (
                  <p style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
                )}
                {m.card?.length ? (
                  <div className="ada-card">
                    {m.card.map((c, j) => (
                      <div key={j} style={{ padding: "10px 14px", borderTop: j ? "1px solid var(--line)" : 0 }}>
                        <b>{c.title}</b>
                        <span>{c.sub}</span>
                        <em style={{ padding: 0, marginTop: 2 }}>{c.value}</em>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {aiBusy ? (
              <div className="ada-m ada-ada" aria-live="polite">
                <span className="ada-dots" aria-label="Working">
                  <i /><i /><i />
                </span>
              </div>
            ) : null}
            <div className="ada-sug">
              {SUGGEST.map((s) => (
                <button key={s.label} type="button" onClick={s.run} disabled={Boolean(aiBusy)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <form
            className="ada-f"
            onSubmit={(e) => {
              e.preventDefault();
              askAda(input);
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this project"
              aria-label="Ask Ada"
              autoComplete="off"
              maxLength={600}
            />
            <button type="submit" aria-label="Send" disabled={!input.trim() || Boolean(aiBusy)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-right" />
              </svg>
            </button>
          </form>
          <p className="ada-foot">Ada only uses items that exist in this account. She proposes; you decide.</p>
        </aside>
      </div>

      {/* Health check */}
      {showHealth ? (
        <section className="wk-panel" style={NO_MB}>
          <div className="wk-ph">
            <h2>Duration, time, cost &amp; material</h2>
            <button type="button" className="ds-btn ds-btn-sm btn-o" onClick={() => askAda(healthSummaryText(projectName, health))} disabled={Boolean(aiBusy)}>
              Ask Ada to explain
            </button>
          </div>
          <div style={{ padding: "18px 20px 6px" }}>
            <div className="dsh-stats" style={{ marginBottom: 0, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
              {health.tiles.map((t) => (
                <div key={t.label} className={`dsh-stat${t.tone === "warn" ? " warn" : t.tone === "good" ? " pal-on" : ""}`}>
                  <span className="k">{t.label}</span>
                  <b style={{ fontSize: 22 }}>{t.value}</b>
                  <span className="ds-sub">{t.sub}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="wk-use">
            {health.findings.map((f, i) => (
              <div className="wk-useline" key={i} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                <span className="p" style={{ gridColumn: 1, gridRow: 1 }}>{f.text}</span>
                <span className="v" style={{ gridColumn: 2, gridRow: 1 }}>
                  <span className="wk-src sm" style={f.tone === "warn" ? palChip("orange") : f.tone === "good" ? palChip("light") : undefined}>
                    {f.tone === "warn" ? "Watch" : f.tone === "good" ? "Good" : "Note"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Bill */}
      <section className="wk-panel" style={NO_MB}>
        <div className="wk-ph" style={{ flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h2>Bill of Quantities</h2>
            <div className="wk-locnote" style={{ marginTop: 4 }}>
              {shownRows.length} line{shownRows.length === 1 ? "" : "s"}
              {canSeeRates ? ` · ${naira(totalShown)}` : ""}
              {taskKeys ? " · lines this task builds" : pickKeys ? " · lines on this element" : ""}
              {filteredByBill ? " · filtered by the bill search" : ""}
            </div>
          </div>
          <label className="wk-find" style={{ flex: "0 1 280px" }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href="#hi-search" />
            </svg>
            <input
              type="search"
              value={billQuery}
              onChange={(e) => setBillQuery(e.target.value)}
              placeholder="Filter lines…"
              aria-label="Filter bill lines"
              autoComplete="off"
            />
          </label>
        </div>
        <div style={{ maxHeight: 420, overflow: "auto" }}>
          {shownRows.length === 0 ? (
            <div className="wk-empty">
              {rows.length ? "No lines match." : "This project has no bill lines yet."}
            </div>
          ) : (
            <div className="wk-qt">
              <div className="wk-qhd">
                <span>Description</span>
                <span>Check</span>
                <span>Qty</span>
                <span>Rate</span>
                <span>Amount</span>
              </div>
              {shownRows.slice(0, 400).map((r) => {
                const on = selectedKeys.has(r.key);
                const e = index.byKey.get(r.key);
                const chip = flags[r.key] || verdicts[r.key];
                return (
                  <div
                    key={r.key}
                    className="wk-qr"
                    role="button"
                    tabIndex={0}
                    aria-pressed={on}
                    onClick={() => toggleRow(r.key)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        toggleRow(r.key);
                      }
                    }}
                    style={{
                      cursor: "pointer",
                      background: on ? "var(--pal-light-wash)" : undefined,
                      boxShadow: on ? "inset 3px 0 0 var(--action)" : undefined,
                    }}
                  >
                    <span className="d">
                      <b style={{ display: "block", fontSize: 13.5, fontWeight: 400, color: "var(--ink)" }}>
                        {r.description}
                      </b>
                      <em>
                        {r.category || "Uncategorised"}
                        {e?.elementIds.length ? ` · ${e.elementIds.length} element${e.elementIds.length === 1 ? "" : "s"}` : ""}
                      </em>
                    </span>
                    <span className="s">
                      {chip ? (
                        <span className="wk-src sm" style={chip.style} title={chip.title}>
                          {chip.label}
                        </span>
                      ) : null}
                    </span>
                    <span className="q">
                      {qtyText(r.qty)}
                      <i>{r.unit}</i>
                    </span>
                    <span className="r">{canSeeRates ? money(r.rate) : "–"}</span>
                    <span className="ds-a">{canSeeRates ? money(r.fullAmount) : "–"}</span>
                  </div>
                );
              })}
              {shownRows.length > 400 ? (
                <p className="wk-locnote" style={{ margin: 0, padding: "12px 0" }}>
                  Showing the first 400 of {shownRows.length}. Filter to narrow the list.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {/* Schedule */}
      <section className="wk-panel" style={NO_MB}>
        <div className="wk-ph" style={{ flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h2>Construction schedule</h2>
            <div className="wk-locnote" style={{ marginTop: 4 }}>
              {tasks.length
                ? "Pick a task to see the bill lines and elements it builds."
                : "No tasks yet. Add or import them on the PM Dashboard."}
            </div>
          </div>
          {tasks.length ? (
            <div className="wk-loc-sw" role="tablist" aria-label="Filter tasks">
              {[
                ["all", "All"],
                ["linked", "Linked"],
                ["overdue", "Overdue"],
                ["critical", "Critical"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={taskFilter === id}
                  className={taskFilter === id ? "on" : ""}
                  onClick={() => setTaskFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {tasks.length && schedule ? (
          <div className="wk-gantt" style={{ maxHeight: 420, overflow: "auto" }}>
            <div className="wk-ghd">
              <span>Task</span>
              <span className="rl" style={{ position: "relative", height: 14 }}>
                {schedule.ticks.map((t, i) => (
                  <span key={i} style={{ position: "absolute", left: `${t.at}%` }}>
                    {t.label}
                  </span>
                ))}
              </span>
              <span>Done</span>
              <span>Dates</span>
              <span style={{ textAlign: "right" }}>Baseline</span>
            </div>
            {shownTasks.slice(0, 500).map((t) => {
              const s = toDate(t.startDate);
              const e = toDate(t.endDate);
              const isSummary = Boolean(t.isSummary || t.rollup);
              const pct = isSummary && t.rollup ? safeNum(t.rollup.percentComplete) : safeNum(t.percentComplete);
              const left = s && schedule ? ((s.getTime() - schedule.min) / schedule.span) * 100 : 0;
              const width = s && e ? Math.max(0.8, ((e.getTime() - s.getTime()) / schedule.span) * 100) : 0;
              const overdue = Boolean(t?.computed?.isOverdue);
              const slip = safeNum(t?.computed?.scheduleVarianceDays);
              const on = t.taskId === taskId;
              const related = relatedTaskIds?.has(t.taskId);
              const linked = (t.linkedBoqIdentities || []).length;
              const depth = Math.max(0, Math.min(4, safeNum(t.wbsDepth)));
              const baseline = isSummary && t.rollup ? t.rollup.baselineCost : t.computed?.baselineCost ?? t.baselineCost;
              return (
                <div
                  key={t.taskId}
                  className="wk-gr"
                  role="button"
                  tabIndex={0}
                  aria-pressed={on}
                  onClick={() => {
                    setSelectedKeys(new Set());
                    setPickedId(0);
                    setTaskId(on ? null : t.taskId);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setSelectedKeys(new Set());
                      setPickedId(0);
                      setTaskId(on ? null : t.taskId);
                    }
                  }}
                  style={{
                    cursor: "pointer",
                    padding: "8px 0",
                    background: on ? "var(--pal-light-wash)" : related ? "var(--bg-alt)" : undefined,
                    boxShadow: on || related ? "inset 3px 0 0 var(--action)" : undefined,
                  }}
                  title={linked ? `${linked} linked bill line(s)` : "No bill lines linked"}
                >
                  <span className="t" style={{ ...TRUNC, paddingLeft: depth * 10, fontWeight: isSummary ? 500 : 400 }}>
                    {t.wbs ? <span style={{ color: "var(--ink-3)", marginRight: 6 }}>{t.wbs}</span> : null}
                    {t.name || "(no name)"}
                  </span>
                  <span className="g">
                    {s && e ? (
                      <span
                        className="b"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          ...(overdue ? { backgroundImage: "none", background: "var(--pal-orange-wash)", borderColor: "var(--pal-orange-line)" } : null),
                        }}
                      >
                        {/* Done share, drawn inside the planned bar. */}
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${Math.max(0, Math.min(100, pct))}%`,
                            background: overdue ? "var(--pal-orange-line)" : "var(--pal-light-line)",
                            borderRadius: 5,
                          }}
                        />
                      </span>
                    ) : null}
                    {schedule.now >= 0 && schedule.now <= 100 ? (
                      <span
                        aria-hidden="true"
                        style={{ position: "absolute", top: 0, bottom: 0, width: 1, left: `${schedule.now}%`, background: "var(--accent)" }}
                      />
                    ) : null}
                  </span>
                  {/* Not .d: his phone layout stacks every .d in one cell. */}
                  <span
                    style={{
                      fontSize: 12,
                      fontVariantNumeric: "tabular-nums",
                      color: overdue ? "var(--pal-orange-key)" : "var(--ink-3)",
                    }}
                  >
                    {Math.round(pct)}%
                    {slip > 0 ? ` · +${slip}d` : slip < 0 ? ` · ${slip}d` : ""}
                  </span>
                  <span className="d">
                    {shortDate(s)} – {shortDate(e)}
                  </span>
                  <span className="v">{canSeeRates ? naira(baseline) : "–"}</span>
                </div>
              );
            })}
          </div>
        ) : tasks.length ? (
          <div className="wk-empty">These tasks have no dates yet, so there is nothing to draw.</div>
        ) : null}
      </section>
    </div>
  );
}
