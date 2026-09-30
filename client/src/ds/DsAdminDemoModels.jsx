// Admin → sample models. The Revit and IFC files courses and demos are built on.
//
// WHY THE UPLOAD IS ITS OWN THING HERE
//
// A Revit model is hundreds of megabytes, so the API never touches the bytes:
// the browser is handed a signed PUT and uploads straight to storage, then tells
// the server it landed (routes/admin.demoModels.js spells the three steps out).
// That means this screen cannot use adminForm's `file` field, which keeps only
// the file NAME — there would be nothing to upload. It holds the real File.
//
// AND WHY IT USES XMLHttpRequest FOR THAT ONE REQUEST
//
// fetch() cannot report upload progress. On a 700 MB model that leaves somebody
// staring at a spinner for ten minutes with no way to tell a slow upload from a
// dead one, and the reasonable thing to do with a dead upload — reload — is the
// one thing that loses it. XHR reports bytes sent, so the screen can say so.
//
// The row exists between "create" and "done", unpublished, so a half-finished
// upload is visible and can be cleared rather than vanishing. Publishing is
// refused server-side until the file is really in storage — a published model
// whose file never arrived is a broken download inside a course.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmFilters, AdmChip } from "./adminUi.jsx";
import { AdmDrawer, AdmFields } from "./adminForm.jsx";
import { useAdmToast, checkFields } from "./adminKit.jsx";

const MB = 1024 * 1024;

const size = (n) => {
  const b = Number(n) || 0;
  if (!b) return "";
  if (b >= 1024 * MB) return `${(b / (1024 * MB)).toFixed(1)} GB`;
  if (b >= MB) return `${Math.round(b / MB)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
};

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

// The products a demo model can belong to. The keys are the LEGACY catalogue
// ones — QUIV is the Revit plugin, so "revit" — because that is what
// /product/:key and the entitlement checks use. Taking the product's own name
// would produce a key nothing matches. See lib/dsRoutes.js PRODUCT_KEY.
const PRODUCTS = [
  ["", "Not tied to a product"],
  ["revit", "QUIV (Revit)"],
  ["planswift", "HERON (PlanSwift)"],
  ["mep", "SERVIQ (Revit MEP)"],
  ["rategen", "Rate Gen"],
  ["qs-takeoff", "Time Pro"],
  ["civil3d", "CIVIQ (Civil 3D)"],
];

const ACCESS_LABEL = {
  public: "Anyone",
  "signed-in": "Signed in",
  entitled: "Holds the product",
  course: "Enrolled on the course",
};

const ACCESS_HINT = {
  public: "Anybody with the link, signed in or not.",
  "signed-in": "Any account. The usual choice for a software demo.",
  entitled: "Only accounts that hold a live subscription to the product above.",
  course: "Only learners enrolled on the course. Set automatically for a course model.",
};

const PURPOSE_LABEL = { course: "Course file", demo: "Software demo" };

const FILTERS = [
  ["all", "All"],
  ["course", "Course files"],
  ["demo", "Software demos"],
  ["draft", "Not published"],
];

// The accepted extensions, for the file picker. The server is the authority
// (util/demoModelFile.js MODEL_FORMATS) and refuses anything else; this is the
// hint, so the picker does not offer a file that will be rejected.
const FALLBACK_ACCEPT = ".rvt,.ifc,.ifczip,.frag,.zip,.dwg,.pln";

const FIELDS = [
  { k: "title", label: "Name", required: true, wide: true, hint: "What a learner sees in the list." },
  {
    k: "description",
    label: "What it is",
    type: "textarea",
    wide: true,
    hint: "One or two lines. What the model shows, and what to do with it.",
  },
  {
    k: "purpose",
    label: "What it is for",
    type: "select",
    options: [
      ["course", "A course file"],
      ["demo", "A software demo"],
    ],
    required: true,
  },
  {
    k: "courseSku",
    label: "Course",
    type: "select",
    required: true,
    reqMsg: "Choose the course this model belongs to.",
    when: (v) => v.purpose === "course",
    hint: "Only learners enrolled on it can download the model.",
  },
  {
    k: "productKey",
    label: "Product",
    type: "select",
    options: PRODUCTS,
    when: (v) => v.purpose === "demo",
  },
  {
    k: "access",
    label: "Who may download it",
    type: "select",
    options: [
      ["signed-in", ACCESS_LABEL["signed-in"]],
      ["public", ACCESS_LABEL.public],
      ["entitled", ACCESS_LABEL.entitled],
    ],
    when: (v) => v.purpose === "demo",
    hint: (v) => ACCESS_HINT[v.access] || "",
  },
  {
    k: "discipline",
    label: "Discipline",
    type: "select",
    options: [
      ["", "Not set"],
      ["architectural", "Architectural"],
      ["structural", "Structural"],
      ["mep", "MEP"],
    ],
    when: (v) => v.purpose === "demo",
  },
];

const BLANK = {
  title: "",
  description: "",
  purpose: "demo",
  courseSku: "",
  productKey: "",
  access: "signed-in",
  discipline: "",
};

export default function DsAdminDemoModels() {
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState("all");
  const [open, setOpen] = React.useState(null);
  const [courses, setCourses] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  // Where an upload has got to, in words. "" when nothing is uploading.
  const [stage, setStage] = React.useState("");
  const [file, setFile] = React.useState(null);
  const [say, toastNode] = useAdmToast();

  const load = React.useCallback(() => {
    if (!accessToken) return Promise.resolve();
    return apiAuthed("/admin/demo-models", { token: accessToken })
      .then(setD)
      .catch(() => setFailed(true));
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  // The course list is only needed by the form, so it is fetched when that
  // opens rather than on every visit.
  const loadCourses = React.useCallback(async () => {
    if (courses.length) return courses;
    try {
      const r = await apiAuthed("/admin/courses", { token: accessToken });
      const list = (r?.items || r?.courses || r || [])
        .filter((c) => c?.sku)
        .map((c) => [String(c.sku), `${c.title || c.sku}`]);
      setCourses(list);
      return list;
    } catch {
      // A course list that cannot be read must not stop a demo model being
      // added; the form says so when the Course field is reached.
      return [];
    }
  }, [accessToken, courses]);

  const items = React.useMemo(() => {
    const all = Array.isArray(d?.items) ? d.items : [];
    if (view === "draft") return all.filter((m) => !m.published);
    if (view === "all") return all;
    return all.filter((m) => m.purpose === view);
  }, [d, view]);

  const accept = React.useMemo(() => {
    const exts = (d?.formats || []).map((f) => f.ext).filter(Boolean);
    return exts.length ? exts.join(",") : FALLBACK_ACCEPT;
  }, [d]);

  function startAdd() {
    setFile(null);
    setStage("");
    setOpen({ mode: "add", values: { ...BLANK }, errors: {} });
    loadCourses();
  }

  /**
   * Create, upload, confirm.
   *
   * Each step is reported, because on a 700 MB model the difference between
   * "still going" and "stopped" is the whole question. If the PUT fails the row
   * is left in place, unpublished — it shows in "Not published" so it can be
   * retried or removed, rather than leaving an orphan nobody can see.
   */
  async function saveNew() {
    const values = open.values;
    const errors = checkFields(FIELDS, values);
    if (!file) errors.file = "Choose the model file.";
    if (Object.keys(errors).length) {
      setOpen((o) => ({ ...o, errors }));
      return;
    }

    setBusy(true);
    let id = "";
    try {
      setStage("Making the row…");
      const created = await apiAuthed("/admin/demo-models", {
        token: accessToken,
        method: "POST",
        body: {
          title: values.title,
          description: values.description,
          purpose: values.purpose,
          courseSku: values.purpose === "course" ? values.courseSku : "",
          productKey: values.purpose === "demo" ? values.productKey : "",
          access: values.purpose === "demo" ? values.access : "course",
          discipline: values.purpose === "demo" ? values.discipline : "",
          fileName: file.name,
          size: file.size,
        },
      });
      id = String(created?.id || "");
      if (!created?.uploadUrl) throw new Error("No upload address came back.");

      await putWithProgress(created.uploadUrl, file, created.contentType, (sent) => {
        setStage(`Uploading — ${size(sent)} of ${size(file.size)}`);
      });

      setStage("Checking it arrived…");
      // The server asks storage rather than believing the browser, so this can
      // legitimately refuse after a PUT that looked fine.
      await apiAuthed(`/admin/demo-models/${id}/done`, { token: accessToken, method: "POST" });

      setOpen(null);
      setFile(null);
      say(`${values.title} is uploaded. Publish it when you are ready.`);
      await load();
    } catch (e) {
      const why = String(e?.message || "").trim();
      say(
        id
          ? `The upload did not finish: ${why || "unknown error"}. The row is under Not published — remove it or try again.`
          : `Could not start: ${why || "unknown error"}`,
      );
      if (id) await load();
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  async function patch(m, body, ok) {
    setBusy(true);
    try {
      await apiAuthed(`/admin/demo-models/${m.id}`, { token: accessToken, method: "PATCH", body });
      say(ok);
      await load();
    } catch (e) {
      say(String(e?.message || "That change could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(m) {
    setBusy(true);
    try {
      const r = await apiAuthed(`/admin/demo-models/${m.id}`, {
        token: accessToken,
        method: "DELETE",
      });
      // The server leaves the stored object alone on purpose, and says so.
      // Repeating it here rather than claiming the file is gone.
      say(r?.note || "Removed.");
      await load();
    } catch (e) {
      say(String(e?.message || "It could not be removed."));
    } finally {
      setBusy(false);
    }
  }

  async function openFile(m) {
    try {
      const r = await apiAuthed(`/admin/demo-models/${m.id}/link`, { token: accessToken });
      if (r?.url) window.open(r.url, "_blank", "noopener");
      else say("No link came back for that model.");
    } catch (e) {
      say(String(e?.message || "No download link could be made."));
    }
  }

  const cols = [
    {
      h: "Model",
      w: "30%",
      cell: (m) => <AdmTwo top={m.title} under={m.description || m.fileName} />,
    },
    {
      h: "For",
      w: "22%",
      cell: (m) =>
        m.purpose === "course" ? (
          <AdmTwo top="Course file" under={m.courseTitle || m.courseSku || "course not named"} />
        ) : (
          <AdmTwo
            top="Software demo"
            under={
              PRODUCTS.find(([k]) => k === m.productKey)?.[1] ||
              (m.productKey ? m.productKey : "no product")
            }
          />
        ),
    },
    {
      h: "File",
      w: "16%",
      cell: (m) =>
        m.ready ? (
          <AdmTwo
            top={size(m.sizeBytes) || (m.format || "").toUpperCase() || "uploaded"}
            under={m.fileName}
          />
        ) : (
          // A row with no file is the visible half of a failed upload, which is
          // exactly why the row is created before the bytes are sent.
          <AdmChip tone="bad">No file</AdmChip>
        ),
    },
    {
      h: "Who may take it",
      w: "16%",
      cell: (m) => (
        <AdmTwo top={ACCESS_LABEL[m.access] || m.access} under={when(m.uploadedAt)} />
      ),
    },
    {
      h: "",
      num: true,
      cell: (m) => (
        <span className="adm-rowacts">
          {m.ready ? (
            <button
              type="button"
              className="ds-btn btn-o ds-btn-sm"
              disabled={busy}
              onClick={() => openFile(m)}
            >
              Download
            </button>
          ) : null}
          <button
            type="button"
            className={`ds-btn ds-btn-sm ${m.published ? "btn-o" : "btn-p"}`}
            disabled={busy || (!m.published && !m.ready)}
            title={!m.ready && !m.published ? "The file has not finished uploading." : undefined}
            onClick={() =>
              patch(
                m,
                { published: !m.published },
                m.published ? `${m.title} is hidden again.` : `${m.title} is live.`,
              )
            }
          >
            {m.published ? "Unpublish" : "Publish"}
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy}
            onClick={() => remove(m)}
          >
            Remove
          </button>
        </span>
      ),
    },
  ];

  if (failed) {
    return <p className="adm-note">The sample models could not be read just now. Please refresh.</p>;
  }

  const all = Array.isArray(d?.items) ? d.items : [];

  return (
    <>
      {toastNode}

      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Sample models</h1>
          <p className="adm-lede">
            The Revit, IFC and take-off files a course works through, and the demo models somebody
            evaluating a product can open. A course file goes only to learners enrolled on that
            course; a demo can go to anyone, to any account, or only to accounts that hold the
            product. Nothing is visible to a reader until it is published.
          </p>
        </div>
        <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={startAdd}>
          Add a model
        </button>
      </div>

      <AdmFilters
        options={FILTERS.map(([k, label]) => [
          k,
          label,
          k === "all"
            ? all.length
            : k === "draft"
              ? all.filter((m) => !m.published).length
              : all.filter((m) => m.purpose === k).length,
        ])}
        current={view}
        onPick={setView}
      />

      {!d ? (
        <p className="adm-note">Reading the library&hellip;</p>
      ) : (
        <AdmTable
          cols={cols}
          rows={items}
          empty={
            view === "draft"
              ? ["Nothing half-finished", "An upload that stopped part-way would show here."]
              : [
                  "No sample models yet",
                  "Add the Revit or IFC file a course works through, or a demo model for somebody evaluating a product.",
                ]
          }
        />
      )}

      {open?.mode === "add" ? (
        <AdmDrawer
          title="Add a sample model"
          intro="The file goes straight to storage from this browser, so a big model does not pass through the API. Do not close this tab until it finishes."
          note="Up to 2 GB. Accepted: .rvt, .ifc, .ifczip, .frag, .zip, .dwg, .pln."
          onClose={() => (busy ? null : setOpen(null))}
          foot={
            <>
              <button
                type="button"
                className="ds-btn btn-o ds-btn-sm"
                disabled={busy}
                onClick={() => setOpen(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ds-btn btn-p ds-btn-sm"
                disabled={busy}
                onClick={saveNew}
              >
                {busy ? stage || "Working…" : "Upload"}
              </button>
            </>
          }
        >
          <AdmFields
            fields={FIELDS.map((f) =>
              f.k === "courseSku"
                ? {
                    ...f,
                    options: courses.length
                      ? [["", "Choose a course"], ...courses]
                      : [["", "No courses could be read — refresh and try again"]],
                  }
                : f,
            )}
            values={open.values}
            errors={open.errors}
            onChange={(values) => setOpen((o) => ({ ...o, values }))}
          />

          {/* Held here rather than in AdmFields, which keeps only the file name
              — and a name cannot be uploaded. */}
          <label className={`adm-f media${open.errors?.file ? " bad" : ""}`} htmlFor="f-model">
            <span className="adm-f-l">The model file *</span>
            <span className="adm-file">
              <input
                id="f-model"
                type="file"
                accept={accept}
                disabled={busy}
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setOpen((o) => ({ ...o, errors: { ...o.errors, file: "" } }));
                }}
              />
              <span>
                {file ? `${file.name} · ${size(file.size)}` : "Choose the model file"}
              </span>
            </span>
            <span className="adm-f-h">
              {stage || "It uploads straight to storage when you press Upload."}
            </span>
            {open.errors?.file ? <span className="adm-f-e">{open.errors.file}</span> : null}
          </label>
        </AdmDrawer>
      ) : null}
    </>
  );
}

/**
 * PUT a file to a signed URL, reporting bytes sent.
 *
 * XMLHttpRequest rather than fetch because fetch cannot report upload progress,
 * and on a several-hundred-megabyte model an unmoving spinner is
 * indistinguishable from a dead upload — at which point the reasonable thing to
 * try, reloading, is the one thing that loses the whole upload.
 */
function putWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    // The signature was made for this exact content type; sending another makes
    // the request fail its own signature.
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      // Storage answers with XML on a refusal; the status is the useful part.
      else reject(new Error(`storage refused it (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("the connection dropped"));
    xhr.onabort = () => reject(new Error("the upload was stopped"));
    xhr.send(file);
  });
}
