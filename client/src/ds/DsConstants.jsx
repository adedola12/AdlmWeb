// The Material Constants library, in his design.
//
// WHAT IT IS
//
// The factors that turn a measured bill quantity into the materials and labour
// behind it — "1 m³ of 1:2:4 concrete = 6.65 bags of cement". Changing one here
// changes every Material & Labour schedule generated afterwards, and any project
// can be rebuilt against the new figures from its Budget tab. The same keys back
// QUIV's and HERON's own constants stores, so a firm's standards mean the same
// thing on the desktop and on the web.
//
// WHY IT WAS REBUILT RATHER THAN RE-SKINNED
//
// pages/MaterialConstants.jsx is written in the classic utility classes — card,
// input, btn, text-slate-500 — and /work/constants simply wrapped it in
// DsAppShell. The frame was his and everything inside it was not, which is the
// join showing. Behaviour is carried over exactly: same endpoints, same drafts,
// same min/max validation, same reset-one and reset-all.
//
// HIS COMPONENTS, NOT NEW ONES
//
// .wk-head / .wk-acts for the title row, .wk-bar + .wk-find for the search,
// .wk-panel + .wk-ph per group, and .wk-tbl with .wk-hd / .wk-row for the table
// — the same five-column shape DsWorkLibrary uses for rates, because this is the
// same kind of list: a named thing, a unit, a number, a reference number and a
// row action.
//
// The one thing his sheet has no pattern for is an EDITABLE number sitting in a
// table row; every input he styles is a form field with a label above it. So
// .wk-val goes in ds-local.css, the hand-authored companion, and nowhere near a
// generated sheet.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { EN_DASH } from "../features/workProject/workProjectFormat.js";

export default function DsConstants() {
  const { accessToken } = useAuth();
  const [groups, setGroups] = React.useState([]);
  const [constants, setConstants] = React.useState([]);
  const [drafts, setDrafts] = React.useState({}); // key → the string being typed
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [query, setQuery] = React.useState("");

  const apply = React.useCallback((res) => {
    setGroups(res?.groups || []);
    setConstants(res?.constants || []);
    setDrafts({});
  }, []);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    (async () => {
      try {
        const res = await apiAuthed("/me/material-constants", { token: accessToken });
        if (alive) apply(res);
      } catch (e) {
        // A failed read is NOT an empty library. Rendering "nothing here" would
        // tell a firm their standards are gone.
        if (alive) setFailed(e?.message || "The constants library could not be read just now.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken, apply]);

  const dirty = Object.keys(drafts).length > 0;
  const yours = constants.filter((c) => !c.isDefault).length;

  const valueOf = (c) => (drafts[c.key] !== undefined ? drafts[c.key] : String(c.value));

  function outOfRange(c) {
    const raw = drafts[c.key];
    if (raw === undefined || raw === "") return false;
    const n = Number(raw);
    return !Number.isFinite(n) || n < c.min || n > c.max;
  }
  const invalid = constants.some(outOfRange);

  async function save() {
    if (invalid || !dirty) return;
    setSaving(true);
    setMsg("");
    try {
      const values = {};
      for (const [key, raw] of Object.entries(drafts)) {
        if (raw === "") continue;
        values[key] = Number(raw);
      }
      apply(
        await apiAuthed("/me/material-constants", {
          token: accessToken,
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values }),
        }),
      );
      // Says what to do next. A saved constant changes nothing anybody can see
      // until a project is rebuilt against it, and somebody who does not know
      // that reads the screen as having done nothing.
      setMsg("Saved. Open a project's Budget tab and choose Rebuild schedule to apply them.");
    } catch (e) {
      setMsg(e?.message || "That could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function reset(key) {
    setSaving(true);
    setMsg("");
    try {
      apply(
        await apiAuthed(
          key ? `/me/material-constants/${encodeURIComponent(key)}` : "/me/material-constants",
          { token: accessToken, method: "DELETE" },
        ),
      );
      setMsg(key ? "Back to the ADLM default." : "Everything is back to the ADLM defaults.");
    } catch (e) {
      setMsg(e?.message || "That could not be reset.");
    } finally {
      setSaving(false);
    }
  }

  const q = query.trim().toLowerCase();
  const matches = (c) =>
    !q || c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q);

  const shown = React.useMemo(
    () =>
      groups
        .map((name) => ({ name, rows: constants.filter((c) => c.group === name && matches(c)) }))
        .filter((g) => g.rows.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, constants, q],
  );
  const shownCount = shown.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          <h1>Material constants</h1>
          <p>
            What a measured quantity is made of — the mixes, the waste factors, the formwork re-use
            and the labour and plant outputs behind every budget. Yours to set: ADLM&rsquo;s figures
            are a starting point, and the ones you change are used for every schedule you generate
            afterwards. Rate Gen, QUIV and HERON read the same library through this account.
          </p>
        </div>
        <div className="wk-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={!dirty || invalid || saving}
            onClick={save}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={saving || !yours}
            onClick={() => reset()}
          >
            Reset all to ADLM
          </button>
        </div>
      </div>

      <div className="wk-bar">
        <label className="wk-find">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <use href="#hi-search" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a constant, or its key"
            aria-label="Search constants"
          />
        </label>
        <span className="wk-count">
          {q ? `${shownCount} of ${constants.length}` : `${constants.length} constants`}
          {yours ? ` · ${yours} yours` : ""}
        </span>
      </div>

      {/* The one figure that explains the whole screen: how much of this library
          is actually the firm's, as opposed to ADLM's starting point. */}
      {invalid ? (
        <div className="pj-note warn">
          <div>
            <b>One of these is outside its range.</b> The row says what it will accept. Saving is
            held until it is fixed, because a constant out of range produces a schedule nobody can
            explain.
          </div>
        </div>
      ) : null}

      {msg ? (
        <div className="pj-note">
          <div>{msg}</div>
        </div>
      ) : null}

      {failed ? (
        <div className="pj-empty">
          <b>Could not be read</b>
          <p>{failed}</p>
        </div>
      ) : loading ? (
        <div className="pj-empty" role="status" aria-live="polite">
          <b>Loading{"…"}</b>
          <p>Reading your constants library.</p>
        </div>
      ) : !shown.length ? (
        <div className="pj-empty">
          <b>Nothing matches{q ? ` “${query.trim()}”` : ""}</b>
          <p>Try a shorter word, or part of the key.</p>
        </div>
      ) : (
        shown.map((g) => (
          <section className="wk-panel" key={g.name}>
            <div className="wk-ph">
              <h2>{g.name}</h2>
              <span className="wk-locnote">
                {g.rows.length} {g.rows.length === 1 ? "constant" : "constants"}
              </span>
            </div>

            <div className="wk-tbl" role="table">
              <div className="wk-hd" role="row">
                <span>Constant</span>
                <span>Unit</span>
                <span>Your value</span>
                <span>ADLM default</span>
                <span />
              </div>

              {g.rows.map((c) => {
                const bad = outOfRange(c);
                return (
                  <div className="wk-row" role="row" key={c.key}>
                    <span className="wk-nm">
                      <b>{c.label}</b>
                      <span>
                        {c.key}
                        {!c.isDefault ? (
                          <>
                            {" · "}
                            <em className="wk-own">yours</em>
                          </>
                        ) : null}
                      </span>
                    </span>

                    <span className="wk-u">{c.unit || EN_DASH}</span>

                    <span className="wk-n">
                      <input
                        className={`wk-val${bad ? " bad" : ""}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={c.min}
                        max={c.max}
                        value={valueOf(c)}
                        aria-label={c.label}
                        aria-invalid={bad || undefined}
                        onChange={(e) => setDrafts((d) => ({ ...d, [c.key]: e.target.value }))}
                      />
                      {bad ? (
                        <i className="wk-val-err">
                          {c.min} to {c.max}
                        </i>
                      ) : null}
                    </span>

                    <span className="wk-n">{c.def}</span>

                    <span className="wk-go">
                      {/* Only where there is something to undo. A reset on a row
                          that is already the default does nothing and reads as
                          an action that failed. */}
                      {!c.isDefault ? (
                        <button
                          type="button"
                          className="wk-undo"
                          disabled={saving}
                          title={`Back to the ADLM default, ${c.def}`}
                          aria-label={`Reset ${c.label} to the ADLM default`}
                          onClick={() => reset(c.key)}
                        >
                          {/* hi-close, not an undo arrow: there is no undo in
                              his sprite (chrome/DsAppSprite.jsx), and inventing
                              one would be a hand-drawn icon in a system that
                              has a sprite. Close is also the truer verb — this
                              removes YOUR override and lets the ADLM figure
                              show through again. */}
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <use href="#hi-close" />
                          </svg>
                        </button>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
