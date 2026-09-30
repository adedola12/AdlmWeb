// Referrals, and whether the person referred actually subscribed.
//
// WHY THIS IS A SCREEN OF ITS OWN
//
// The Purchases queue already prints "referred by" on a row, and that answered
// the question while the question was "was this order referred?". It cannot
// answer the one the owner asked — did the referred user subscribe? — because
// somebody who signed up on a link and never bought has no order, so they never
// appear on a purchases screen at all. That absence reads as "no referrals",
// when it is the half a referrer is actually waiting on.
//
// Everything here comes from the Referral documents, never recomputed from
// purchases: conversion is claimed atomically by four separate paths (card, the
// Paystack webhook, the renewal cron, an admin approving a transfer) and
// convertedAt is the single record of it. Counting orders instead would disagree
// with what was credited.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmFilters, AdmChip } from "./adminUi.jsx";

const money = (n, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const when = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";

const EMPTY = {
  all: [
    "No referrals yet",
    "When somebody signs up on another account's link, they appear here — whether or not they go on to subscribe.",
  ],
  yes: [
    "Nobody has subscribed on a referral yet",
    "A referral converts the first time the person it belongs to pays for anything.",
  ],
  no: [
    "Every referral has converted",
    "Nobody is sitting on a link without having subscribed.",
  ],
};

// How the conversion was credited. The stored value is the audit trail; this is
// what a person reads.
const VIA = {
  card: "paid by card",
  webhook: "confirmed by the gateway",
  "admin-approval": "transfer approved here",
  renewal: "credited on a renewal",
};

// The screen's filter, and what the server wants for it. Kept as one table so
// the two cannot drift.
const CONVERTED_PARAM = { all: "", yes: "1", no: "0" };

export default function DsAdminReferrals() {
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("all");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let live = true;
    setD(null);
    setFailed(false);
    const converted = CONVERTED_PARAM[view] || "";
    apiAuthed("/admin/referrals", {
      token: accessToken,
      // An empty value means "no filter". Sending it would be a filter FOR "".
      params: converted ? { converted } : {},
    })
      .then((r) => {
        if (live) setD(r);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [accessToken, view]);

  const items = Array.isArray(d?.items) ? d.items : [];
  const totals = d?.totals || {};

  const cols = [
    {
      h: "Referred",
      w: "26%",
      cell: (r) => (
        <AdmTwo
          top={r.referred || "No email recorded"}
          under={
            r.signupMethod === "social"
              ? "signed up with a social account"
              : r.signupMethod === "password"
                ? "signed up with a password"
                : "sign-up method not recorded"
          }
        />
      ),
    },
    {
      h: "Referred by",
      w: "24%",
      cell: (r) =>
        r.referrer ? (
          <AdmTwo top={r.referrer} under={r.code ? `code ${r.code}` : "no code recorded"} />
        ) : (
          <AdmDim>Referrer not recorded</AdmDim>
        ),
    },
    {
      h: "Signed up",
      w: "14%",
      cell: (r) => when(r.signedUpAt) || <AdmDim>&ndash;</AdmDim>,
    },
    {
      h: "Subscribed",
      cell: (r) =>
        r.subscribed ? (
          <AdmTwo
            top={when(r.convertedAt) || "Yes"}
            under={
              [
                r.amount ? money(r.amount, r.currency) : "",
                r.products.length ? r.products.join(", ") : "",
                VIA[r.convertedVia] || "",
              ]
                .filter(Boolean)
                .join(" · ") || "credited"
            }
          />
        ) : (
          // Not a failure: a referral that has not converted yet is the normal
          // state of a new one, which is why it is a plain chip and not a
          // warning.
          <AdmChip>Not yet</AdmChip>
        ),
    },
  ];

  if (failed) {
    return <p className="adm-note">The referrals could not be read just now. Please refresh.</p>;
  }

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Referrals</h1>
          <p className="adm-lede">
            Who arrived on whose link, and whether they have subscribed. A referral converts once,
            the first time that person pays for anything &mdash; a renewal does not convert them
            again, so nobody is credited twice for the same customer.
            {totals.total
              ? ` ${totals.converted} of ${totals.total} have subscribed, worth ${money(
                  totals.revenue,
                )}.`
              : ""}
          </p>
        </div>
      </div>

      <AdmFilters
        options={[
          ["all", "All", totals.total],
          ["yes", "Subscribed", totals.converted],
          ["no", "Not yet", totals.waiting],
        ]}
        current={view}
        onPick={setView}
      />

      {!d ? (
        <p className="adm-note">Reading the referrals&hellip;</p>
      ) : (
        <>
          <AdmTable cols={cols} rows={items} empty={EMPTY[view]} />
          {d.truncated ? (
            <p className="adm-foot-note">
              The newest {d.limit} are shown. Filter by Subscribed or Not yet to see further back.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
