// ADLM's plant library, for the admin's Rate data screen.
//
// Unlike materials and labour, plant has no Rate Gen desktop store to be
// published from, so ADLM keeps it here: each machine costed for a working
// day from its parts and priced per hour at a stated working day
// (server/util/plantCosting.js). Customers see it on their Plant tab and pick
// from it in the custom rate builder.
//
// A machine is never deleted, only disabled: a rate already built names the
// machine that priced it. A change reaches a rate when that rate is next built
// or re-priced; nothing re-prices a stored rate.
//
// His `wk-` library markup, as the rest of the page. The Admin plant library's
// final design is Richard's (work board r2-plant-library-per-hour).

import React from "react";
import { apiAuthed } from "../../api.js";
import { useFeedback } from "../feedback/feedbackContext.js";
import PlantEditor from "./PlantEditor.jsx";
import { plantDraftProblem } from "./plantMath.js";

const DASH = "–";
const money = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(
    Number(n) || 0,
  );

export default function AdminPlantLibrary({ accessToken, term = "" }) {
  const fb = useFeedback();
  const [items, setItems] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(() => {
    if (!accessToken) return;
    apiAuthed("/admin/rategen-v2/plant", { token: accessToken })
      .then((d) => {
        setItems(Array.isArray(d.items) ? d.items : []);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function edit(p = null) {
    const draftRef = { current: null };
    const answer = await fb.card({
      tone: "info",
      noIcon: true,
      title: p ? p.name : "Add a machine",
      msg: "Cost a working day from its parts. Every customer's Plant tab and rate builder read it; rates already built keep the price they were built at.",
      body: <PlantEditor draftRef={draftRef} initial={p} />,
      secondary: "Cancel",
      primary: p ? "Save machine" : "Add machine",
      validate: () => {
        const problem = plantDraftProblem(draftRef.current || {});
        if (problem) {
          fb.toast({ tone: "error", title: problem });
          return false;
        }
        return true;
      },
    });
    if (answer !== "primary") return;
    try {
      await apiAuthed(p ? `/admin/rategen-v2/plant/${p.sn}` : "/admin/rategen-v2/plant", {
        method: p ? "PUT" : "POST",
        token: accessToken,
        body: draftRef.current,
      });
      load();
      fb.toast({ title: p ? "Machine saved" : "Machine added" });
    } catch (e) {
      fb.toast({ tone: "error", title: "That did not save", msg: String(e?.message || "Nothing was written.") });
    }
  }

  async function toggle(p) {
    try {
      await apiAuthed(`/admin/rategen-v2/plant/${p.sn}`, {
        method: "PUT",
        token: accessToken,
        body: { ...p, enabled: !p.enabled },
      });
      load();
    } catch (e) {
      fb.toast({ tone: "error", title: "That did not change", msg: String(e?.message || "") });
    }
  }

  if (failed) {
    return (
      <div className="adm-none">
        <b>Could not be read</b>
        <span>The plant library did not answer. Please refresh.</span>
      </div>
    );
  }
  if (!items) return <p className="wk-count">Reading the plant library…</p>;

  const t = term.trim().toLowerCase();
  const shown = t ? items.filter((p) => p.name.toLowerCase().includes(t)) : items;

  return (
    <>
      <div className="rg-op">
        <b>Plant</b>
        <em>
          Each machine is costed for a working day from its hire, fuel, operator, maintenance and
          transport, then priced per hour. Rates use it by the hour.
        </em>
        <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => edit(null)}>
          Add a machine
        </button>
      </div>
      {shown.length ? (
        <div className="wk-tbl wk-tbl-mat" role="table">
          <div className="wk-hd" role="row">
            <span>Machine</span>
            <span>Unit</span>
            <span>Per hour</span>
            <span>Shown to customers</span>
          </div>
          {shown.map((p) => (
            <div className="wk-row" role="row" key={p.sn}>
              <span className="wk-nm">
                <b>
                  <a
                    href={`#plant-${p.sn}`}
                    onClick={(e) => {
                      e.preventDefault();
                      edit(p);
                    }}
                  >
                    {p.name}
                  </a>
                </b>
                <span>
                  {money(p.dayCost)} a day
                  {p.hoursPerDay ? ` · ${p.hoursPerDay}-hour day` : ""}
                  {p.category ? ` · ${p.category}` : ""}
                </span>
              </span>
              <span className="wk-u">hr</span>
              <span className="wk-r">
                {p.hourlyRate === null ? DASH : money(p.hourlyRate)}
                <i>{p.hourlyRate === null ? p.problems?.[0] || "not priced" : "per hr"}</i>
              </span>
              <span className="wk-w">
                <button type="button" className="pj-lnk" onClick={() => toggle(p)}>
                  {p.enabled === false ? "Hidden · show it" : "Shown · hide it"}
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="adm-none">
          <b>{t ? "Nothing matches" : "No machines yet"}</b>
          <span>
            {t
              ? "Try part of a name."
              : "Add the first one: a mixer, a poker vibrator, an excavator, a tipper."}
          </span>
        </div>
      )}
    </>
  );
}
