// Richard's certificate sheet (cert.js sheet(), 17 Sep 2026): his light or
// dark artwork with the holder's details written on it. Every position and
// type size is a percentage of the sheet (his cert.css, container units), so
// it is the same composition on a phone, in the preview and on A4.
//
// The QR code opens the public check at /certificate?ref=…, on this site.

import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { nameSize, verifyUrl } from "../../lib/certName.js";
import "../../styles/ds-cert.css";

function longDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * @param {object} p
 * @param {{ ref: string, title: string, length?: string, issuedAt?: string }} p.cert
 * @param {string} p.name
 * @param {"dark"|"light"} p.finish
 * @param {boolean} [p.noQr]
 */
export default function CertSheet({ cert, name, finish = "dark", noQr = false }) {
  const style = finish === "light" ? "light" : "dark";
  return (
    <div className={`cx-sheet ${style}`}>
      <img className="tpl" src={`/ds/cert-${style}.jpg`} alt="ADLM Studio certificate of completion" />
      <div className="ov">
        <b className="nm" style={{ fontSize: `${nameSize(name)}cqw` }}>
          {name || " "}
        </b>
        <p className="for">
          for the {cert.length || "ADLM"} training programme on <b>{cert.title}</b> for quantity surveying
          workflow.
        </p>
        <span className="dt">{longDate(cert.issuedAt)}</span>
        <img className="sg" src="/ds/sig-dolapo.png" alt="Signed, Adedolapo Quasim" />
        <span className="rf">{cert.ref}</span>
        <span className="qrbox">
          {noQr || !cert.ref ? null : (
            <QRCodeSVG
              className="qr"
              value={verifyUrl(cert.ref)}
              level="M"
              bgColor="#ffffff"
              fgColor="#061423"
              marginSize={2}
              role="img"
              aria-label="QR code to verify this certificate"
            />
          )}
        </span>
      </div>
    </div>
  );
}
