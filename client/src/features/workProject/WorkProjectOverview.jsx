// Richard's Overview tab (work-proj.js:586-681), on real data.
//
// His markup, class for class, because the 59 .pj-* rules that came across
// with his stylesheet expect exactly this structure — .pj-stages > .sg,
// .pj-ov > .pj-card2.prog/.tot/.att, then .pj-ov.b > .secs/.src/.ppl. Change
// the shape and the CSS stops describing it.
//
// The arithmetic is in overviewModel.js; the money comes from the same
// projectTotals() the Bill screen reads, so the two cannot disagree.

import React from "react";
import {
  STAGES,
  stageIndex,
  nextStage,
  pricedSplit,
  pricedPercent,
  completePercent,
  valueBySection,
  decisions,
  totalsFor,
} from "./overviewModel.js";
import { EN_DASH, safeNum } from "../projects/lib/projectTotals.js";
// Shared with the Bill tab. Two copies of a money formatter is how two tabs
// print the same figure differently, which on a bill is not cosmetic.
import { compact, initials, money } from "./workProjectFormat.js";
import { Bar, Donut } from "./workProjectBits.jsx";

export default function WorkProjectOverview({
  project,
  toolName,
  canEdit = false,
  onGo,
  onTender,
}) {
  const p = project || {};
  const si = stageIndex(p);
  const next = nextStage(p);
  // What actually moves this project on, and the tab where it is done.
  //
  // Keyed on the stage the project is AT, not the one it is going to. A stage with
  // no entry simply shows no link, which is honest — the strip still says where
  // the project has got to.
  //
  // "Mark as tendered" used to be absent on the grounds that the new build had
  // nowhere to do it. It does now: the route records a date and moves no money, so
  // it carries no step-up, and it is the thing standing in front of the lock —
  // lockChecklist wants a tender date and nothing here could set one, so a project
  // that had only ever been opened in this build could never reach the stage where
  // locking is offered at all. It is an ACT rather than a destination, so it runs
  // here instead of sending the reader to a tab.
  const NEXT_STEP = {
    takeoff: { label: "Price the bill", tab: "rates" },
    priced: { label: "Mark as tendered", act: "tender" },
    tendered: { label: "Lock the contract", tab: "valuations" },
    locked: { label: "Issue a valuation", tab: "valuations" },
    valuing: { label: "Agree the final account", tab: "valuations" },
  };
  const nextStep = NEXT_STEP[STAGES[si]?.id];
  const [tendering, setTendering] = React.useState(false);
  const [tenderFailed, setTenderFailed] = React.useState("");
  const runTender = async () => {
    if (tendering) return;
    setTendering(true);
    setTenderFailed("");
    try {
      await onTender?.(true);
    } catch (err) {
      // The server's own sentence. "This contract is already locked, which is past
      // the tender stage." is the one that matters, and it means the copy on screen
      // is behind — so it is said rather than swallowed.
      setTenderFailed(String(err?.message || "The tender mark could not be recorded."));
    } finally {
      setTendering(false);
    }
  };
  const split = pricedSplit(p.items);
  const t = totalsFor(p);
  const sections = valueBySection(p.items);
  const att = decisions(p);
  const actual = safeNum(p.certifiedToDate ?? p.actualToDate);
  const people = Array.isArray(p.collaborators) ? p.collaborators : [];

  return (
    <>
      <section className="pj-stages" aria-label="Stage">
        {STAGES.map((s, i) => (
          <div key={s.id} className={`sg ${i < si ? "done" : i === si ? "now" : ""}`.trim()}>
            <i>{i < si ? "✓" : i + 1}</i>
            <span>{s.name}</span>
          </div>
        ))}
        {/* THERE IS NO "MOVE TO NEXT STAGE", AND THERE SHOULD NOT BE.
            This was a button reading "Move to <stage>" with no onClick at all —
            it did nothing when pressed, which is worse than not being there,
            because somebody clicks it and concludes the product is broken
            rather than that the action is elsewhere.
            It could not have been wired either: nothing in the codebase writes
            project.stage. No server route accepts it and no client sets it,
            because, as valuationsModel.js puts it, the stage is a label and the
            lock is the fact. A project reaches "Contract locked" by the
            contract being locked, not by somebody announcing it.
            So the dead button is replaced by the thing that actually moves it
            on, pointing at the tab where that is done. */}
        {next && canEdit && nextStep ? (
          nextStep.act === "tender" ? (
            onTender ? (
              <button
                type="button"
                className="pj-lnk"
                disabled={tendering}
                onClick={runTender}
              >
                {tendering ? "Recording…" : `${nextStep.label} ${EN_DASH} reaches ${next.name}`}
              </button>
            ) : null
          ) : (
            <button type="button" className="pj-lnk" onClick={() => onGo?.(nextStep.tab)}>
              {nextStep.label} {EN_DASH} reaches {next.name}
            </button>
          )
        ) : null}
        {tenderFailed ? (
          <p className="pn-bad" role="status">
            {tenderFailed}
          </p>
        ) : null}
      </section>

      <div className="pj-ov">
        <section className="pj-card2 prog">
          <h3>Progress</h3>
          <div className="dn">
            <Donut
              percent={pricedPercent(p.items)}
              label="Priced"
              sub={`${split.priced.length} of ${split.total} items`}
            />
            <Donut
              percent={completePercent(p)}
              label="Complete"
              tone="ok"
              sub={si >= 3 ? "Weighted by value" : "Starts at contract"}
            />
          </div>
        </section>

        <section className="pj-card2 tot">
          <h3>Estimated and actual</h3>
          <div className="big">
            <div>
              <span>Estimated total</span>
              <b>{money(t.total)}</b>
            </div>
            <div>
              <span>{p.stage === "final" ? "Final account" : "Actual to date"}</span>
              <b>{actual ? money(actual) : EN_DASH}</b>
            </div>
          </div>
          <div className="cmp">
            <Bar percent={100} tone="est" />
            <Bar percent={t.total ? (actual / t.total) * 100 : 0} tone="act" />
          </div>
          <dl className="brk">
            <div>
              <dt>Measured work</dt>
              <dd>{money(t.measured)}</dd>
            </div>
            {t.prelims ? (
              <div>
                <dt>Preliminaries{p.preliminaryPercent ? ` · ${p.preliminaryPercent}%` : ""}</dt>
                <dd>{money(t.prelims)}</dd>
              </div>
            ) : null}
            {t.pc ? (
              <div>
                <dt>PC sums</dt>
                <dd>{money(t.pc)}</dd>
              </div>
            ) : null}
            {t.provisional ? (
              <div>
                <dt>Provisional sums</dt>
                <dd>{money(t.provisional)}</dd>
              </div>
            ) : null}
            {t.linked ? (
              <div>
                <dt>Linked services</dt>
                <dd>{money(t.linked)}</dd>
              </div>
            ) : null}
            {t.contingency ? (
              <div>
                <dt>Contingency{p.contingencyPercent ? ` · ${p.contingencyPercent}%` : ""}</dt>
                <dd>{money(t.contingency)}</dd>
              </div>
            ) : null}
            {t.variations ? (
              <div>
                <dt>Approved variations</dt>
                <dd>{money(t.variations)}</dd>
              </div>
            ) : null}
            {t.tax ? (
              <div>
                <dt>VAT{p.taxPercent ? ` · ${p.taxPercent}%` : ""}</dt>
                <dd>{money(t.tax)}</dd>
              </div>
            ) : null}
          </dl>
          {actual ? null : (
            <p className="hint">
              {si >= 3
                ? "Actual comes from approved valuations."
                : "Actual starts once the contract is locked and the first valuation is approved."}
            </p>
          )}
        </section>

        <section className="pj-card2 att">
          <h3>Needs a decision</h3>
          {att.length ? (
            <div className="ls">
              {att.map((a) => (
                <button
                  key={`${a.tab}:${a.text}`}
                  type="button"
                  className={`it ${a.tone}`.trim()}
                  onClick={() => onGo?.(a.tab)}
                >
                  <span>{a.text}</span>
                  <em>{a.action} ›</em>
                </button>
              ))}
            </div>
          ) : (
            <p className="calm">Nothing is waiting on you.</p>
          )}
          <button type="button" className="pj-resume" onClick={() => onGo?.("bill")}>
            Continue: Bill ›
          </button>
        </section>
      </div>

      <div className="pj-ov b">
        <section className="pj-card2 secs">
          <h3>Value by section</h3>
          <div className="hb">
            {sections.length ? (
              sections.map((s) => (
                <div className="r" key={s.name}>
                  <span className="t">{s.name}</span>
                  <span className="tr">
                    <i className="v" style={{ width: `${s.valuePercent}%` }} />
                    <i className="d" style={{ width: `${s.donePercent}%` }} />
                  </span>
                  <b>{s.value ? compact(s.value) : "Unpriced"}</b>
                </div>
              ))
            ) : (
              <p className="hint">No bill lines yet.</p>
            )}
          </div>
          <p className="lg">
            <i className="v" />
            Estimated <i className="d" />
            Work done
          </p>
        </section>

        <section className="pj-card2 src">
          <h3>Source</h3>
          <div className="o">
            <div>
              <b>{toolName || p.productKey}</b>
              <span>{p.fileName || p.file || EN_DASH}</span>
            </div>
          </div>
          <p className="hint">
            {split.total
              ? `${split.total} bill line${split.total > 1 ? "s" : ""} measured from this source.`
              : "Nothing measured yet."}
          </p>
        </section>

        <section className="pj-card2 ppl">
          <h3>People</h3>
          <div className="avs">
            {people.map((c, i) => (
              <span key={c?.email || i} className="av" title={`${c?.name || c?.email || ""}`}>
                {initials(c?.name || c?.email)}
              </span>
            ))}
          </div>
          <p className="hint">
            {people.length} {people.length === 1 ? "person" : "people"} ·{" "}
            {people.filter((c) => String(c?.accessLevel || c?.role || "").includes("approve")).length}{" "}
            can approve valuations
          </p>
        </section>
      </div>
    </>
  );
}
