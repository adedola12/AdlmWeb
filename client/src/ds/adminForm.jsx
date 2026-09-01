// His drawer, his fields — as React.
//
// Every admin screen that creates or edits something needs the same two
// things: a panel that slides in over the page, and a set of fields inside it.
// He built both in assets/js/admin-form.js and, more usefully, his stylesheet
// already carries every class they need — adm-drawer, adm-fs, adm-f, adm-f-l,
// adm-f-h, adm-f-e, adm-f-pre, adm-file. So this is a translation of his DOM,
// not a new design: same elements, same class names, same order, so the ported
// CSS dresses it without a single hand-written rule.
//
// WHAT A FIELD'S `when` HAS TO DO
//
// A field that only applies sometimes must appear the moment it applies. His
// first version read `when` once, when the drawer opened, so choosing "Paid"
// left the SKU and price hidden and the form then refused to save on fields
// nobody could see. Here `when` is evaluated on every render against the
// current values, which is the React-shaped answer to the same bug.
//
// FILES TRAVEL AS NAMES
//
// A file field stores the chosen file's NAME, not its bytes. Uploading is a
// separate piece of work; until it exists this lets a course be set up
// completely and the media attached in one pass later, which is what his own
// note on the form says.

import React from "react";

/* ─────────────────────────────────────────────────────────────── drawer ── */

/**
 * The panel itself. Closes on Escape and on the veil, because a modal that can
 * only be dismissed by finding a small × is a modal people feel trapped in.
 */
export function AdmDrawer({ title, intro, note, children, foot, onClose, peek = false }) {
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while a drawer is open, or a flick of
    // the wheel moves the list the drawer is about to act on.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="adm-drawer-wrap">
      <div className="adm-drawer-veil" onClick={onClose} />
      <section
        className={`adm-drawer${peek ? " peek" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="adm-drawer-h">
          <div>
            <h2>{title}</h2>
            {intro ? <p>{intro}</p> : null}
          </div>
          <button type="button" className="adm-drawer-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="adm-drawer-b adm-scroll">
          {children}
          {note ? <p className="adm-drawer-note">{note}</p> : null}
        </div>

        {foot ? <footer className="adm-drawer-f">{foot}</footer> : null}
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── fields ── */

function Field({ f, value, error, onChange }) {
  const id = `f-${f.k}`;
  const cls = ["adm-f", f.wide ? "wide" : "", f.type === "check" ? "check" : "",
    f.type === "file" ? "media" : "", error ? "bad" : ""].filter(Boolean).join(" ");

  const label = (
    <span className="adm-f-l">
      {f.label}
      {f.required ? " *" : ""}
    </span>
  );
  const hint = f.hint ? <span className="adm-f-h">{f.hint}</span> : null;
  const err = error ? <span className="adm-f-e">{error}</span> : null;

  if (f.type === "file") {
    const isVid = String(f.accept || "").startsWith("video");
    return (
      <label className={cls} htmlFor={id}>
        {label}
        <span className="adm-file">
          <input
            id={id}
            type="file"
            accept={f.accept || "image/*"}
            onChange={(e) => onChange(f.k, e.target.files?.[0]?.name || "")}
          />
          {/* What was picked, shown back. A file field that forgets what you
              chose is indistinguishable from one that did not take it. */}
          <span>{value || (isVid ? "Choose a video" : "Choose an image")}</span>
        </span>
        {hint}
        {err}
      </label>
    );
  }

  let input;
  if (f.type === "textarea") {
    input = (
      <textarea
        id={id}
        rows={f.rows || 3}
        value={value ?? ""}
        placeholder={f.placeholder}
        onChange={(e) => onChange(f.k, e.target.value)}
      />
    );
  } else if (f.type === "select") {
    input = (
      <select id={id} value={value ?? ""} onChange={(e) => onChange(f.k, e.target.value)}>
        {(f.options || []).map((o) => {
          const [v, t] = Array.isArray(o) ? o : [o, o];
          return (
            <option key={v} value={v}>
              {t}
            </option>
          );
        })}
      </select>
    );
  } else if (f.type === "check") {
    input = (
      <input
        id={id}
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(f.k, e.target.checked)}
      />
    );
  } else {
    input = (
      <input
        id={id}
        type={f.type === "number" ? "number" : "text"}
        value={value ?? ""}
        placeholder={f.placeholder}
        min={f.type === "number" ? f.min ?? 0 : undefined}
        onChange={(e) =>
          onChange(f.k, f.type === "number" ? e.target.value : e.target.value)
        }
      />
    );
  }

  return (
    <label className={cls} htmlFor={id}>
      {label}
      {/* A prefix belongs beside the box, not inside the placeholder where it
          vanishes the moment somebody types. */}
      {f.prefix ? (
        <span className="adm-f-pre">
          <span className="pre">{f.prefix}</span>
          {input}
        </span>
      ) : (
        input
      )}
      {hint}
      {err}
    </label>
  );
}

/**
 * A set of fields over one values object.
 *
 * `fields` is his shape: { k, label, type, wide, rows, options, hint, prefix,
 * placeholder, required, reqMsg, accept, when, check }.
 */
export function AdmFields({ fields, values, errors = {}, onChange }) {
  const on = (k, v) => onChange({ ...values, [k]: v });
  return (
    <div className="adm-fs">
      {fields
        .filter((f) => !f.when || f.when(values))
        .map((f) => (
          // Keyed by field AND by the value that gates it: two fields share the
          // key "psrc" (a file when uploaded, a text box for a YouTube link),
          // and without this React reuses one input for the other and carries
          // the wrong value across.
          <Field
            key={`${f.k}-${f.type}`}
            f={f}
            value={values[f.k]}
            error={errors[f.k]}
            onChange={on}
          />
        ))}
    </div>
  );
}
