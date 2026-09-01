// Products — what a subscription is sold against.
//
// His columns and his three row actions: Add release, Edit, Price. They are
// three because they are three different acts with three different blast
// radii — renaming a product changes a web page, changing its price changes
// what every new customer pays, and publishing a release tells everybody who
// already has it.
//
// TWO PLACES THIS DIVERGES FROM HIM, BOTH BECAUSE OF WHAT WE HAVE
//
// 1. "Latest release" is the release NOTE, not the installer file. They are
//    different things here: a build can be uploaded without anybody being
//    told, and this screen is where that gap should be visible. The installer
//    version is shown underneath when the two disagree.
//
// 2. "Storage" is not a per-product number on this system. The allowance is a
//    personal figure and an organisation figure set in the environment, plus
//    whatever extra slots an account has been granted — so the column shows
//    those two, and products with no project bucket at all (RateGen, the
//    courses) show a dash rather than a number that governs nothing.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip, AdmFilters } from "./adminUi.jsx";
import { useAdmToast, checkFields } from "./adminKit.jsx";
import { AdmDrawer, AdmFields } from "./adminForm.jsx";

const money = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

/** Today, as the date input wants it. */
const todayISO = () => new Date().toISOString().slice(0, 10);

const STATE_WORD = { active: "Live", pending: "Coming", disabled: "Retired" };

const PRODUCT_FIELDS = [
  { k: "name", label: "Name", type: "text", required: true },
  {
    k: "state",
    label: "Status",
    type: "select",
    options: [["Live", "Live"], ["Coming", "Coming"], ["Retired", "Retired"]],
  },
  {
    k: "tag",
    label: "Tagline",
    type: "text",
    wide: true,
    required: true,
    hint: "The line under the name on the product page.",
  },
  {
    k: "key",
    label: "Key",
    type: "text",
    when: (v) => v.isNew,
    required: true,
    placeholder: "revit",
    hint:
      "What orders, entitlements and the desktop plugins point at. It cannot be changed later " +
      "without stranding everything that already refers to it.",
  },
];

const PRICE_FIELDS = [
  { k: "monthly", label: "Monthly", type: "number", prefix: "₦", required: true },
  {
    k: "yearly",
    label: "Yearly",
    type: "number",
    prefix: "₦",
    required: true,
    hint: "Ten months is the two-months-free rule.",
    check: (v, all) => {
      const mo = Number(all.monthly) || 0;
      const yr = Number(v) || 0;
      if (!mo) return null;
      if (yr >= mo * 12) return "Yearly should be less than twelve monthly payments.";
      if (yr < mo * 8) return "That is more than four months free. Deliberate?";
      return null;
    },
  },
  {
    k: "why",
    label: "Why",
    type: "textarea",
    wide: true,
    rows: 2,
    required: true,
    reqMsg: "Say why. A price change with no reason cannot be explained later.",
    hint: "Goes in the audit log beside the old and new figures.",
  },
];

const RELEASE_FIELDS = [
  { k: "version", label: "Version", type: "text", required: true, placeholder: "3.3" },
  { k: "on", label: "Released on", type: "text", required: true, placeholder: "2026-09-01" },
  {
    k: "note",
    label: "What changed",
    type: "textarea",
    wide: true,
    rows: 3,
    required: true,
    reqMsg: "A release note nobody can read is worse than no release note.",
    placeholder: "Revit 2027 support, faster model load on large files.",
    hint: "Written for a quantity surveyor, not a developer.",
  },
];

export default function DsAdminProducts() {
  const { accessToken } = useAuth();
  const [say, toast] = useAdmToast();

  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [view, setView] = React.useState("all");
  const [reload, setReload] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  // { kind: "product"|"price"|"release", row, values, errors }
  const [form, setForm] = React.useState(null);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    apiAuthed("/admin/catalogue/products", { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, reload]);

  async function write(path, { method = "POST", body, ok } = {}) {
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
      return true;
    } catch (err) {
      say(err?.message || "That could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const FIELDS =
    form?.kind === "price" ? PRICE_FIELDS : form?.kind === "release" ? RELEASE_FIELDS : PRODUCT_FIELDS;

  async function save() {
    const errs = checkFields(FIELDS, form.values);
    if (Object.keys(errs).length) {
      setForm((f) => ({ ...f, errors: errs }));
      return;
    }
    const v = form.values;
    const row = form.row;
    let done = false;

    if (form.kind === "price") {
      done = await write(`/admin/catalogue/products/${row.id}/price`, {
        body: { monthly: v.monthly, yearly: v.yearly, why: v.why },
        ok: (r) =>
          `${row.name} is now ${money(v.yearly)} a year.` +
          (r?.seats
            ? ` The ${r.seats} seat${r.seats === 1 ? "" : "s"} already on it keep what they renew at.`
            : " Nobody holds it yet, so nothing was disturbed."),
      });
    } else if (form.kind === "release") {
      done = await write(`/admin/catalogue/products/${row.id}/release`, {
        body: { version: v.version, on: v.on, note: v.note },
        ok: `${row.name} v${v.version} published. It is on What's New now.`,
      });
    } else if (row) {
      done = await write(`/admin/catalogue/products/${row.id}`, {
        method: "PUT",
        body: { name: v.name, tag: v.tag, state: v.state },
        ok: `${v.name} was saved.`,
      });
    } else {
      done = await write("/admin/catalogue/products", {
        body: { name: v.name, key: v.key, tag: v.tag },
        ok: `${v.name} was created as Coming. It is not on sale until you set it Live.`,
      });
    }
    if (done) setForm(null);
  }

  if (failed) {
    return <p className="adm-note">Products could not be loaded just now. Please refresh.</p>;
  }

  const items = (d?.items || []).filter((p) => view === "all" || p.state === view);
  const counts = d?.counts || {};

  const cols = [
    { h: "Product", w: "24%", cell: (p) => <AdmTwo top={p.name} under={p.tag} /> },
    { h: "Monthly", num: true, cell: (p) => (p.monthly ? money(p.monthly) : <AdmDim>—</AdmDim>) },
    { h: "Yearly", num: true, cell: (p) => (p.yearly ? money(p.yearly) : <AdmDim>—</AdmDim>) },
    {
      h: "Storage",
      num: true,
      cell: (p) =>
        p.projects ? (
          <AdmTwo top={`${p.projects.personal} projects`} under={`${p.projects.org} on an org licence`} />
        ) : (
          // Not zero: RateGen and the courses hold no projects at all, which is
          // different from holding none.
          <AdmDim>no projects</AdmDim>
        ),
    },
    {
      h: "Latest release",
      cell: (p) => {
        if (!p.note) {
          return p.release ? (
            <span className="adm-two">
              <b>{p.release.version || p.release.name}</b>
              <span className="adm-warn">installer only — nobody has been told</span>
            </span>
          ) : (
            <AdmDim>none yet</AdmDim>
          );
        }
        return <AdmTwo top={`v${p.note.version} · ${p.note.on}`} under={p.note.note} />;
      },
    },
    {
      h: "State",
      cell: (p) => (
        <AdmChip tone={p.state === "active" ? "ok" : "calm"}>
          {STATE_WORD[p.state] || p.state}
        </AdmChip>
      ),
    },
    {
      h: "",
      cell: (p) => (
        <span className="adm-rowacts">
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={() =>
              setForm({
                kind: "release",
                row: p,
                errors: {},
                values: { version: "", on: todayISO(), note: "" },
              })
            }
          >
            Add release
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={() =>
              setForm({
                kind: "product",
                row: p,
                errors: {},
                values: { name: p.name, tag: p.tag, state: STATE_WORD[p.state] || "Coming" },
              })
            }
          >
            Edit
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={() =>
              setForm({
                kind: "price",
                row: p,
                errors: {},
                values: { monthly: p.monthly || "", yearly: p.yearly || "", why: "" },
              })
            }
          >
            Price
          </button>
        </span>
      ),
    },
  ];

  const title =
    form?.kind === "price"
      ? `Price ${form.row.name}`
      : form?.kind === "release"
        ? "New release"
        : form?.row
          ? `Edit ${form.row.name}`
          : "New product";

  const intro =
    form?.kind === "price"
      ? "Existing customers keep the price they renew at until their term ends — this changes " +
        "what a new customer pays."
      : form?.kind === "release"
        ? "This is what puts an entry on the public What's New page and tells the customers on " +
          "that product."
        : form?.row
          ? "What the website says about it, and whether it is on sale."
          : "A product is what a subscription is sold against. Adding one puts it in the price " +
            "book, the quotation builder and on the website — so it starts as Coming, not Live.";

  return (
    <>
      {toast}

      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Products</h1>
          <p className="adm-lede">
            What a subscription is sold against — what it costs, how much room it comes with, and
            what its customers were last told.
          </p>
        </div>
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            onClick={() =>
              setForm({
                kind: "product",
                row: null,
                errors: {},
                values: { name: "", key: "", tag: "", state: "Coming", isNew: true },
              })
            }
          >
            + New product
          </button>
        </div>
      </div>

      <AdmFilters
        current={view}
        onPick={setView}
        options={[
          ["all", "Everything", counts.all],
          ["active", "On sale", counts.active],
          ["pending", "Coming soon", counts.pending],
          ["disabled", "Retired", counts.disabled],
        ]}
      />

      {!d ? (
        <p className="adm-note">Reading the catalogue…</p>
      ) : (
        <>
          <AdmTable
            cols={cols}
            rows={items}
            rowKey={(p) => p.id}
            empty={["No products", "Nothing is on sale, which should not be possible."]}
          />

          <div className="adm-merge">
            <b>Yearly is ten months.</b>
            <span>
              The two-months-free rule the pricing page states, kept as data so the website, the
              quotation builder and an invoice cannot drift apart. Project allowances are not per
              product on this system — they are a personal figure and an organisation figure, plus
              whatever extra slots an account has been granted, and they are set in the
              environment rather than here.
            </span>
          </div>
        </>
      )}

      {form ? (
        <AdmDrawer
          title={title}
          intro={intro}
          note={
            form.kind === "price"
              ? "Zone prices follow automatically — the price book holds one figure per product " +
                "and a factor per zone, so no zone can drift out of step."
              : null
          }
          onClose={() => setForm(null)}
          foot={
            <>
              <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button type="button" className="ds-btn btn-p ds-btn-sm" disabled={busy} onClick={save}>
                {busy
                  ? "Saving…"
                  : form.kind === "price"
                    ? "Change the price"
                    : form.kind === "release"
                      ? "Publish the release"
                      : form.row
                        ? "Save the product"
                        : "Create the product"}
              </button>
            </>
          }
        >
          <AdmFields
            fields={FIELDS}
            values={form.values}
            errors={form.errors}
            onChange={(values) => setForm((f) => ({ ...f, values }))}
          />
        </AdmDrawer>
      ) : null}
    </>
  );
}
