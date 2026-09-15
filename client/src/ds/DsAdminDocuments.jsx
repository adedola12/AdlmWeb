// The read-only registers in his Documents group.
//
// WHAT THIS FILE IS NOW
//
// It began as every screen in the group, driven by one SCREENS map. Three of
// them have since grown buttons and left: Templates can be asked for a
// template it does not have, Issued opens and re-sends what it lists, and AI
// usage sets what each account is allowed to spend. A screen that can be acted
// on wants its own state, its own drawer and its own toast, and threading all
// of that through a shared renderer made the shared renderer the hard part.
//
// So the map keeps the ones that genuinely only read:
//
//   produced  quotations, from before his Composer/Saved split — no longer in
//             the rail (it offered "Saved" twice) but still routed
//   saved     what the composer kept
//   system    what the site is set to
//
// The three that left are DsAdminTemplates.jsx, DsAdminIssued.jsx and
// DsAdminAiUsage.jsx. If a screen here ever needs a button, it should follow
// them out rather than growing a flag in the map.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip } from "./adminUi.jsx";
import { toneFor } from "./adminKit.jsx";

const money = (n, cur = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: cur || "NGN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);


const num = (n) => new Intl.NumberFormat("en-NG").format(Number(n) || 0);

const when = (d) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";


const SCREENS = {
  produced: {
    // "Saved documents" in his rail, and the same words here — the composer is
    // its own entry now, so two screens called Documents would be two things
    // with one name.
    title: "Saved documents",
    lede:
      "What the composer has made and kept. Quotations are the only document this system stores " +
      "as a record — invoices have their own register, and certificates and receipts are generated " +
      "on demand with nothing written down about it.",
    path: "/admin/docs/produced",
    editHref: "/admin/documents/compose",
    editLabel: "Open the composer",
    empty: ["Nothing produced", "No quotation has been built."],
    cols: () => [
      { h: "Reference", cell: (p) => <AdmTwo top={p.ref} under={p.kind} /> },
      { h: "For", w: "24%", cell: (p) => <AdmTwo top={p.who} under={p.org} /> },
      { h: "Prepared by", cell: (p) => p.by || <AdmDim>—</AdmDim> },
      { h: "Value", num: true, cell: (p) => money(p.total, p.currency) },
      { h: "Built", cell: (p) => when(p.at) },
      { h: "State", cell: (p) => <AdmChip tone={toneFor(p.state)}>{p.state}</AdmChip> },
    ],
  },


  saved: {
    title: "Saved documents",
    lede:
      "What the composer has made and kept. Each one opens back into the composer exactly as it " +
      "was — still editable, block by block — because what is stored is the source, not a picture " +
      "of the finished page.",
    path: "/admin/docs/saved",
    editHref: "/admin/documents/compose",
    editLabel: "Open the composer",
    empty: [
      "Nothing saved yet",
      "Documents written in the composer used to live in one browser. They are kept on the server now, so anything saved from here on appears in this list.",
    ],
    cols: () => [
      { h: "Document", w: "30%", cell: (r) => <AdmTwo top={r.title} under={r.number || r.templateName} /> },
      { h: "To", cell: (r) => r.to || <AdmDim>nobody yet</AdmDim> },
      { h: "On", cell: (r) => r.templateName },
      { h: "Blocks", num: true, cell: (r) => num(r.blocks) },
      { h: "Kept", cell: (r) => <AdmTwo top={when(r.at)} under={r.by} /> },
      {
        h: "",
        cell: (r) =>
          r.sentAt ? (
            <AdmChip tone="ok">sent {when(r.sentAt)}</AdmChip>
          ) : (
            <AdmChip tone="calm">not sent</AdmChip>
          ),
      },
    ],
  },

  system: {
    title: "System",
    lede:
      "What the site is set to. Each row says what the setting does, because a number with no " +
      "explanation beside it is a number nobody dares change.",
    path: "/admin/docs/system",
    editHref: "/admin/settings",
    editLabel: "Open the settings editor",
    empty: ["No settings", "Nothing is configured."],
    cols: () => [
      { h: "Setting", w: "24%", cell: (s) => s.name },
      { h: "Set to", w: "26%", cell: (s) => <b>{s.value}</b> },
      { h: "What it does", cell: (s) => s.note },
      { h: "", cell: (s) => <AdmChip tone={toneFor(s.state)}>{s.state}</AdmChip> },
    ],
  },
};

export default function DsAdminDocuments({ screen }) {
  const S = SCREENS[screen];
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken || !S) return undefined;
    let alive = true;
    setD(null);
    apiAuthed(S.path, { token: accessToken })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, S]);

  if (!S) return <p className="adm-note">No such screen.</p>;
  if (failed) {
    return <p className="adm-note">{S.title} could not be loaded just now. Please refresh.</p>;
  }

  const items = d?.items || [];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">{S.title}</h1>
          <p className="adm-lede">{S.lede}</p>
        </div>
        {S.editHref ? (
          <div className="adm-acts">
            <Link className="ds-btn btn-p ds-btn-sm" to={S.editHref}>
              {S.editLabel}
            </Link>
          </div>
        ) : null}
      </div>



      {!d ? (
        <p className="adm-note">Reading…</p>
      ) : (
        <AdmTable cols={S.cols()} rows={items} rowKey={(r) => r.id} empty={S.empty} />
      )}

    </>
  );
}
