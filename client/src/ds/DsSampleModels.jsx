// The sample models a reader may take: course files and software demos.
//
// WHY THIS EXISTS
//
// The whole reader half of the sample-model library was unreachable. An admin
// could upload a Revit model, attach it to a course and publish it; the row went
// `published: true`; and nothing in the app ever called GET /me/demo-models. No
// course page, no product page, no downloads screen. A student enrolled on the
// course found nothing, because there was nowhere for it to appear.
//
// LISTING IS NOT THE GATE, DOWNLOADING IS
//
// The endpoint lists everything published, including models this reader cannot
// take, and says why on each row — a student should be able to SEE that a course
// ships a Revit model before deciding to enrol, and somebody evaluating QUIV
// should see that a sample exists. So a row that cannot be downloaded is shown
// with its reason rather than hidden; hiding it would answer a question nobody
// asked and lose a sale.
//
// The download is a short-lived signed link minted per request. Nothing here
// ever holds a storage key.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";

const MB = 1024 * 1024;

const size = (n) => {
  const b = Number(n) || 0;
  if (!b) return "";
  if (b >= 1024 * MB) return `${(b / (1024 * MB)).toFixed(1)} GB`;
  if (b >= MB) return `${Math.round(b / MB)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
};

const PRODUCT_NAME = {
  revit: "QUIV",
  planswift: "HERON",
  mep: "SERVIQ",
  rategen: "Rate Gen",
  "qs-takeoff": "Time Pro",
  civil3d: "CIVIQ",
};

/**
 * @param {object}  props
 * @param {string}  [props.courseSku]  only this course's models
 * @param {string}  [props.productKey] only this product's demos
 * @param {string}  [props.title]
 * @param {boolean} [props.quiet]      render nothing at all when there are none
 */
export default function DsSampleModels({
  courseSku = "",
  productKey = "",
  title = "Sample models",
  quiet = false,
}) {
  const { accessToken } = useAuth();
  const [items, setItems] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [said, setSaid] = React.useState("");

  React.useEffect(() => {
    let live = true;
    const params = {};
    if (courseSku) params.courseSku = courseSku;
    if (productKey) params.productKey = productKey;
    // Open to visitors: the list is public on purpose, and asking somebody to
    // sign in to SEE a model is friction for nothing. The token is sent when
    // there is one, because it decides what each row says about itself.
    apiAuthed("/me/demo-models", { token: accessToken || undefined, params })
      .then((d) => {
        if (live) setItems(Array.isArray(d?.items) ? d.items : []);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [accessToken, courseSku, productKey]);

  async function take(m) {
    setBusy(m.id);
    setSaid("");
    try {
      const r = await apiAuthed(`/me/demo-models/${m.id}/download`, { token: accessToken });
      if (r?.url) window.open(r.url, "_blank", "noopener");
      else setSaid("No link came back for that model.");
    } catch (e) {
      // The server's 403 carries the reason the row already shows; repeat what
      // it says rather than inventing something.
      setSaid(String(e?.message || "That model could not be fetched just now."));
    } finally {
      setBusy("");
    }
  }

  // A failed read is NOT an empty library, and must not render as one.
  if (failed) {
    return (
      <section className="dsh-panel">
        <div className="dsh-ph">
          <h2>{title}</h2>
        </div>
        <div className="dsh-body">
          <p className="sm-none">The sample models could not be read just now. Please refresh.</p>
        </div>
      </section>
    );
  }

  if (items === null) {
    if (quiet) return null;
    return (
      <section className="dsh-panel">
        <div className="dsh-ph">
          <h2>{title}</h2>
        </div>
        <div className="dsh-body">
          <p className="sm-none">Reading the sample models&hellip;</p>
        </div>
      </section>
    );
  }

  if (!items.length && quiet) return null;

  return (
    <section className="dsh-panel">
      <div className="dsh-ph">
        <h2>{title}</h2>
      </div>
      <div className="dsh-body">
        {!items.length ? (
          <p className="sm-none">
            {courseSku
              ? "This course does not ship a model file."
              : "No sample models yet."}
          </p>
        ) : (
          <ul className="sm-list">
            {items.map((m) => (
              <li key={m.id} className={m.canDownload ? "sm-row" : "sm-row locked"}>
                <div className="sm-what">
                  <b>{m.title}</b>
                  <span>
                    {[
                      m.description,
                      m.purpose === "course"
                        ? m.courseTitle || "Course file"
                        : PRODUCT_NAME[m.productKey] || "",
                      (m.format || "").toUpperCase(),
                      size(m.sizeBytes),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {m.canDownload ? (
                  <button
                    type="button"
                    className="ds-btn btn-o ds-btn-sm"
                    disabled={busy === m.id}
                    onClick={() => take(m)}
                  >
                    {busy === m.id ? "Fetching…" : "Download"}
                  </button>
                ) : (
                  // Shown, not hidden — and it says why. A student deciding
                  // whether to enrol should know the course ships a model.
                  <span className="sm-why">{m.reason || "Not available on your account"}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {said ? <p className="sm-said">{said}</p> : null}
      </div>
    </section>
  );
}
