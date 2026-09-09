// src/features/admin/SeatsEditor.jsx
//
// Set the seat count on one entitlement — one account, one software — from
// the old Admin Hub's Active Subscriptions table. Self-contained: it keeps
// its own draft so the 4,000-line page it sits in gains no state.
//
// POST /admin/users/entitlement/seats is exact ("this is now 5"), unlike the
// grant route which can only raise. Two things the server refuses, surfaced
// here before the round trip so the message reads as guidance rather than an
// error: more than one seat on a personal licence needs an organisation name
// (the box appears when it is needed), and the count cannot drop below the
// machines currently bound.

import React from "react";
import { useAuth } from "../../store.jsx";
import { apiAuthed } from "../../http.js";

export default function SeatsEditor({ row, onSaved, onMessage }) {
  const { accessToken } = useAuth();
  const [seats, setSeats] = React.useState(String(row.seats || 1));
  const [org, setOrg] = React.useState(row.organizationName || "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setSeats(String(row.seats || 1));
    setOrg(row.organizationName || "");
  }, [row.seats, row.organizationName, row.email, row.productKey]);

  const n = Math.floor(Number(seats));
  const valid = Number.isFinite(n) && n >= 1 && n <= 500;
  const changed = valid && n !== Number(row.seats || 1);
  const needsOrg = n > 1 && !String(org).trim();
  const belowBound = valid && n < Number(row.seatsUsed || 0);

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const r = await apiAuthed("/admin/users/entitlement/seats", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: row.email,
          productKey: row.productKey,
          seats: n,
          organizationName: String(org).trim(),
        }),
      });
      onMessage?.(
        `${row.productKey}: ${r?.before?.seats ?? row.seats} → ${r?.after?.seats ?? n} seat${(r?.after?.seats ?? n) === 1 ? "" : "s"} for ${row.email}${
          r?.after?.organizationName ? ` (${r.after.organizationName})` : ""
        }`,
      );
      onSaved?.();
    } catch (e) {
      onMessage?.(e?.message || "Could not change the seats.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="btn btn-sm px-2"
          title="One seat fewer"
          disabled={busy || !valid || n <= 1}
          onClick={() => setSeats(String(Math.max(1, n - 1)))}
        >
          −
        </button>
        <input
          className="input w-16 text-center"
          type="number"
          min={1}
          max={500}
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
          aria-label={`Seats for ${row.productKey} on ${row.email}`}
        />
        <button
          type="button"
          className="btn btn-sm px-2"
          title="One seat more"
          disabled={busy || !valid || n >= 500}
          onClick={() => setSeats(String(Math.min(500, n + 1)))}
        >
          +
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy || !changed || needsOrg || belowBound}
          title={
            belowBound
              ? `${row.seatsUsed} machines are bound — revoke devices first`
              : needsOrg
                ? "More than one seat needs an organisation name"
                : "Set the seat count"
          }
          onClick={save}
        >
          {busy ? "Saving…" : "Set seats"}
        </button>
      </div>
      {n > 1 && row.licenseType !== "organization" ? (
        <input
          className="input mt-1.5 w-full max-w-[220px]"
          placeholder="Organisation name (required above 1 seat)"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
        />
      ) : null}
      {belowBound ? (
        <div className="text-[11px] text-red-700 mt-1">
          {row.seatsUsed} machine{row.seatsUsed === 1 ? " is" : "s are"} bound. Revoke devices before going lower.
        </div>
      ) : null}
    </div>
  );
}
