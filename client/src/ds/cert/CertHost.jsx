// Opens the right certificate dialog for a card's button (R14): an unclaimed
// certificate always goes through the claim first, as in his learn.js.
// After a claim, the certificate opens in the viewer.

import React from "react";
import { CertClaim, CertView, PrintSheet } from "./CertDialogs.jsx";

/**
 * @param {object} p
 * @param {{ row: object, action: "claim"|"view"|"download" } | null} p.open
 * @param {{ locked: boolean, name: string, lock: (name: string) => void }} p.cn  useCertName()
 * @param {(sku: string, finish: string) => void} p.onFinish
 */
export default function CertHost({ open, cn, token, onFinish, onClose }) {
  const [mode, setMode] = React.useState(null);
  React.useEffect(() => {
    setMode(open ? (open.action === "claim" || !cn.locked ? "claim" : open.action) : null);
    // Only a new request resets the mode; a claim finishing moves it on itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !mode) return null;
  const { row } = open;
  const cert = {
    sku: row.sku,
    ref: row.certificateRef,
    title: row.title,
    issuedAt: row.issuedAt,
    finish: row.finish,
  };

  if (mode === "claim") {
    return (
      <CertClaim
        cert={cert}
        name={cn.name}
        locked={cn.locked}
        token={token}
        onDone={({ name, finish }) => {
          cn.lock(name);
          onFinish(row.sku, finish);
          setMode("view");
        }}
        onClose={onClose}
      />
    );
  }
  if (mode === "download") {
    return <PrintSheet cert={cert} name={cn.name} finish={row.finish} onDone={onClose} />;
  }
  return (
    <CertView cert={cert} name={cn.name} token={token} onFinish={(k) => onFinish(row.sku, k)} onClose={onClose} />
  );
}
