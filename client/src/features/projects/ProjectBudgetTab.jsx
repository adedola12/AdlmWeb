import React from "react";
import { FaWallet, FaListUl, FaProjectDiagram, FaArrowRight } from "react-icons/fa";

// ─────────────────────────────────────────────────────────────────────
// Project Budget tab (Phase 1 — derived, read-only)
//
// The budget is the internal cost plan that sits between the priced Bill
// of Quantity (what the client is billed) and the WBS work items (how the
// work is scheduled & costed). For this first phase it is *derived* from
// the bill so the surface and the Bill → Budget → WBS chain are visible;
// Phase 2 adds an editable, persisted budgetItems[] with its own cost
// rates, and Phase 3 layers procurement tracking on top.
// ─────────────────────────────────────────────────────────────────────

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function itemName(it) {
  const name = (
    it?.takeoffLine ||
    it?.materialName ||
    it?.description ||
    ""
  )
    .toString()
    .trim();
  return name || `Item ${it?.sn ?? ""}`.trim();
}

function ChainStep({ icon: Icon, label, sublabel, tone = "blue" }) {
  const toneCls =
    tone === "orange"
      ? "from-adlm-orange to-amber-400"
      : tone === "slate"
        ? "from-slate-500 to-slate-400"
        : "from-adlm-blue-700 to-adlm-blue-600";
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${toneCls} text-white shadow-glow-blue`}
      >
        <Icon className="text-sm" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">
          {label}
        </div>
        <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted">
          {sublabel}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, helper, tone = "default" }) {
  const valueCls =
    tone === "budget"
      ? "text-adlm-orange"
      : tone === "wbs"
        ? "text-adlm-blue-700 dark:text-adlm-blue-300"
        : "text-slate-900 dark:text-white";
  return (
    <div className="group relative spotlight rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth p-4 transition-shadow hover:shadow-depth-lg">
      <div className="text-xs text-slate-500 dark:text-adlm-dark-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold ${valueCls}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-adlm-dark-dim">{helper}</div>
    </div>
  );
}

export default function ProjectBudgetTab({
  items = [],
  grossAmount = 0,
  pmDashboard = null,
  statusLabel = "Completed",
}) {
  const rows = React.useMemo(
    () =>
      (items || []).map((it, i) => {
        const qty = safeNum(it?.qty);
        const rate = safeNum(it?.rate);
        return {
          key: `${it?.sn ?? i}-${i}`,
          name: itemName(it),
          category: (it?.category || "Uncategorised").toString(),
          unit: it?.unit || "",
          qty,
          rate,
          amount: qty * rate,
        };
      }),
    [items],
  );

  const budgetTotal = React.useMemo(
    () => rows.reduce((a, r) => a + r.amount, 0),
    [rows],
  );

  const byCategory = React.useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const cur = m.get(r.category) || { amount: 0, count: 0 };
      cur.amount += r.amount;
      cur.count += 1;
      m.set(r.category, cur);
    }
    return [...m.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const tasks = pmDashboard?.tasks || [];
  const linkedTasks = tasks.filter(
    (t) => (t?.linkedBoqIdentities?.length || 0) > 0,
  );
  const wbsBaseline = tasks.reduce((a, t) => a + safeNum(t?.baselineCost), 0);

  const billValue = grossAmount || budgetTotal;

  return (
    <div className="space-y-4">
      {/* Intro + the Bill → Budget → WBS chain this tab sits in. */}
      <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-adlm-orange to-amber-400 text-white shadow-glow-blue">
            <FaWallet />
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold text-slate-900 dark:text-white">
              Project budget
            </div>
            <div className="mt-0.5 text-sm text-slate-600 dark:text-adlm-dark-muted">
              The internal cost plan linking the priced bill to the work
              breakdown. Bill quantities flow into the budget automatically, and
              the budget feeds the WBS work items and procurement.
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <ChainStep
            icon={FaListUl}
            label="Bill of Quantity"
            sublabel="Priced to the client"
            tone="slate"
          />
          <FaArrowRight className="hidden shrink-0 text-slate-300 dark:text-adlm-dark-dim sm:block" />
          <ChainStep
            icon={FaWallet}
            label="Budget"
            sublabel="Internal cost plan"
            tone="orange"
          />
          <FaArrowRight className="hidden shrink-0 text-slate-300 dark:text-adlm-dark-dim sm:block" />
          <ChainStep
            icon={FaProjectDiagram}
            label="WBS work items"
            sublabel="Scheduled & costed"
            tone="blue"
          />
        </div>

        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <b>Phase 1 — derived view.</b> The budget currently mirrors the bill
          baseline. Editable cost rates, persistence and per-line procurement
          marking are coming next.
        </div>
      </div>

      {/* Summary cards: bill value vs budget baseline vs WBS coverage. */}
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          label="Bill value (to client)"
          value={`₦${money(billValue)}`}
          helper={`${rows.length} bill line${rows.length === 1 ? "" : "s"} measured`}
        />
        <SummaryCard
          label="Budget baseline (cost plan)"
          value={`₦${money(budgetTotal)}`}
          helper="Mirrors the bill until cost rates are entered"
          tone="budget"
        />
        <SummaryCard
          label="WBS linked"
          value={`${linkedTasks.length} task${linkedTasks.length === 1 ? "" : "s"}`}
          helper={
            wbsBaseline > 0
              ? `₦${money(wbsBaseline)} baseline scheduled`
              : "Link bill lines on the PM Dashboard"
          }
          tone="wbs"
        />
      </div>

      {/* Category subtotals — quick read on where the budget sits. */}
      {byCategory.length > 1 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth p-5">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            Budget by category
          </div>
          <div className="mt-3 space-y-2">
            {byCategory.map((c) => {
              const pct = budgetTotal ? (c.amount / budgetTotal) * 100 : 0;
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium text-slate-700 dark:text-adlm-dark-text">
                      {c.name}
                      <span className="ml-1.5 text-slate-400 dark:text-adlm-dark-dim">
                        · {c.count} line{c.count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      &#8358;{money(c.amount)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-adlm-orange to-amber-400 transition-[width] duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Derived budget lines. */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-adlm-dark-border px-4 py-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            Budget lines
          </div>
          <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted">
            Derived from the bill · auto-synced
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-white/5 text-left text-slate-600 dark:text-adlm-dark-muted">
              <tr>
                <th className="w-12 px-3 py-2">#</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Budget rate</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-slate-500 dark:text-adlm-dark-muted"
                  >
                    No bill items yet — measure quantities in the Bill of
                    Quantity tab and they’ll appear here.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={r.key}
                    className="border-t border-slate-100 dark:border-adlm-dark-border"
                  >
                    <td className="px-3 py-2 text-slate-500 dark:text-adlm-dark-dim">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-adlm-dark-text">
                      <span className="line-clamp-2" title={r.name}>
                        {r.name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-adlm-dark-muted">
                      {r.category}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-adlm-dark-muted">
                      {r.unit}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700 dark:text-adlm-dark-text">
                      {money(r.qty)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700 dark:text-adlm-dark-text">
                      {money(r.rate)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-white">
                      {money(r.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 ? (
              <tfoot className="bg-slate-50 dark:bg-white/5 font-semibold text-slate-900 dark:text-white">
                <tr className="border-t border-slate-200 dark:border-adlm-dark-border">
                  <td colSpan={6} className="px-3 py-2 text-right">
                    Budget total
                  </td>
                  <td className="px-3 py-2 text-right text-adlm-orange">
                    &#8358;{money(budgetTotal)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  );
}
