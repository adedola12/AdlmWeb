// src/components/InvoicePreview.jsx
// Shared invoice preview component used by both Admin and User dashboards.
import React from "react";
import dayjs from "dayjs";
import { QRCodeSVG } from "qrcode.react";
import invoiceLogo from "../assets/logo/invoiceLogo.png";

/* Decorative dot grid (Figma design element) */
function DotGrid({ top, right }) {
  const dots = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 5; c++)
      dots.push(
        <circle
          key={`${r}-${c}`}
          cx={c * 12 + 6}
          cy={r * 12 + 6}
          r={3}
          fill="#d0d5dd"
        />,
      );
  return (
    <svg
      width={60}
      height={36}
      style={{ position: "absolute", top, right, opacity: 0.5 }}
    >
      {dots}
    </svg>
  );
}

/* Decorative vertical bars (Figma has 5 small bars on the right) */
function DecoBars({ top, right }) {
  return (
    <div style={{ position: "absolute", top, right, display: "flex", gap: 8 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            width: 5,
            height: 26,
            borderRadius: 2,
            backgroundColor: "#091E39",
            opacity: 0.12,
          }}
        />
      ))}
    </div>
  );
}

/* ── Inline styles matching the Figma file exactly ── */
const S = {
  page: {
    width: 595,
    minHeight: 842,
    margin: "0 auto",
    backgroundColor: "#fff",
    position: "relative",
    overflow: "hidden",
    fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif",
    color: "#262626",
    fontSize: 11,
    lineHeight: 1.45,
    padding: "40px 36px 36px",
  },
  circle1: {
    position: "absolute", top: -80, left: 260,
    width: 170, height: 170, borderRadius: "50%",
    border: "2px solid #ccc", opacity: 0.18,
  },
  circle2: {
    position: "absolute", bottom: -30, right: -25,
    width: 100, height: 100, borderRadius: "50%",
    border: "2px solid #ccc", opacity: 0.15,
  },
  grayBar: {
    position: "absolute", top: 72, left: 0,
    width: 155, height: 28, backgroundColor: "#fbfbfb",
    borderTopRightRadius: 16, borderBottomRightRadius: 16,
  },
  header: {
    display: "flex", justifyContent: "space-between",
    alignItems: "flex-start", position: "relative", zIndex: 1,
  },
  logo: { height: 28, objectFit: "contain" },
  invoiceTitle: {
    fontSize: 30, fontWeight: 700, color: "#091E39",
    letterSpacing: -2, lineHeight: 1, textAlign: "right",
  },
  invoiceNo: {
    fontSize: 10, color: "#3e3e3e", marginTop: 3, textAlign: "right",
  },
  invoiceTo: {
    marginTop: 20, display: "flex", gap: 8, fontSize: 10.5,
    position: "relative", zIndex: 1,
  },
  separator: {
    border: "none", height: 1.5,
    background: "linear-gradient(90deg, #091E39 60%, #d0d0d0 100%)",
    margin: "16px 0",
  },
  thRow: {
    backgroundColor: "#091E39", color: "#fff",
  },
  th: {
    padding: "9px 10px", fontWeight: 600, fontSize: 10, letterSpacing: -0.5,
  },
  td: { padding: "9px 10px", fontSize: 10 },
  summaryBar: {
    backgroundColor: "#091E39", color: "#fff", borderRadius: 4,
    padding: "7px 18px", display: "inline-flex", gap: 30,
    fontSize: 10.5, fontWeight: 600, marginTop: 8,
  },
  paymentSection: {
    display: "flex", justifyContent: "space-between",
    alignItems: "flex-start", gap: 20, marginTop: 0,
  },
  terms: {
    marginTop: 16, fontSize: 11, color: "#091E39", lineHeight: 1.5,
  },
};

/**
 * Renders the pixel-perfect invoice page that matches the admin preview.
 *
 * Props:
 *   form        – invoice data (invoiceNumber, clientName, items, etc.)
 *   subtotal, discountAmount, discPct, taxAmount, taxPct, total – computed totals
 *   previewRef  – optional ref to attach to the page div (for html2canvas PDF)
 */
export default function InvoicePreviewPage({
  form, subtotal, discountAmount, discPct, taxAmount, taxPct, total,
  previewRef,
}) {
  const currency = form?.currency || "NGN";
  const curr = currency === "USD" ? "$" : "N";
  const fmtN = (n) => `${curr}${Number(n || 0).toLocaleString()}`;

  return (
    <div ref={previewRef} className="inv-page" style={{
      ...S.page,
      boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
    }}>
      {/* Decorative elements */}
      <div style={S.circle1} />
      <div style={S.circle2} />
      <div style={S.grayBar} />
      <DecoBars top={105} right={30} />
      <DotGrid top={160} right={28} />

      {/* ── Header ── */}
      <div style={S.header}>
        <img
          src={invoiceLogo}
          alt="ADLM Studio"
          crossOrigin="anonymous"
          style={S.logo}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <div>
          <div style={S.invoiceTitle}>Invoice</div>
          <div style={S.invoiceNo}>NO: {form?.invoiceNumber || "—"}</div>
        </div>
      </div>

      {/* ── Invoice To ── */}
      <div style={S.invoiceTo}>
        <span style={{ fontWeight: 600, color: "#3e3e3e", whiteSpace: "nowrap" }}>
          INVOICE TO:
        </span>
        <div style={{ color: "#3e3e3e", fontWeight: 500, lineHeight: 1.5 }}>
          {form?.clientName && <div>{form.clientName}</div>}
          {form?.clientOrganization && <div>{form.clientOrganization}</div>}
          {form?.clientAddress && <div>{form.clientAddress}</div>}
        </div>
      </div>

      {/* Date row */}
      {(form?.invoiceDate || form?.dueDate) && (
        <div style={{ fontSize: 10, color: "#3e3e3e", marginTop: 6 }}>
          {form.invoiceDate && (
            <span>Date: {dayjs(form.invoiceDate).format("MMMM D, YYYY")}</span>
          )}
          {form.dueDate && (
            <span style={{ marginLeft: 24 }}>
              Due: {dayjs(form.dueDate).format("MMMM D, YYYY")}
            </span>
          )}
        </div>
      )}

      {/* ── Separator ── */}
      <hr style={S.separator} />

      {/* ── Line items table ── */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={S.thRow}>
            <th style={{ ...S.th, width: 36, textAlign: "center", borderTopLeftRadius: 5 }}>S/N</th>
            <th style={{ ...S.th, textAlign: "left" }}>DESCRIPTION</th>
            <th style={{ ...S.th, width: 38, textAlign: "center" }}>QTY.</th>
            <th style={{ ...S.th, width: 42, textAlign: "center" }}>UNIT</th>
            <th style={{ ...S.th, width: 72, textAlign: "right" }}>RATE</th>
            <th style={{ ...S.th, width: 78, textAlign: "right", borderTopRightRadius: 5 }}>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {(form?.items || []).map((item, idx) => {
            const isGray = idx % 2 === 1;
            return (
              <tr
                key={idx}
                style={{
                  backgroundColor: isGray ? "#e5e5e5" : "#fff",
                  color: isGray ? "#091E39" : "#262626",
                }}
              >
                <td style={{ ...S.td, textAlign: "center" }}>{idx + 1}.</td>
                <td style={S.td}>{item.description || "—"}</td>
                <td style={{ ...S.td, textAlign: "center" }}>{item.qty || 1}</td>
                <td style={{ ...S.td, textAlign: "center" }}>Nr</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtN(item.unitPrice)}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 500 }}>{fmtN(item.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Summary bar ── */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={S.summaryBar}>
          <span>Summary{discPct > 0 || taxPct > 0 ? "" : " Total"}:</span>
          <span>{fmtN(total)}</span>
        </div>
      </div>

      {/* discount / tax breakdown */}
      {(discPct > 0 || taxPct > 0) && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
          <div style={{ fontSize: 10, textAlign: "right", lineHeight: 1.7 }}>
            <div>Subtotal: <b>{fmtN(subtotal)}</b></div>
            {discPct > 0 && (
              <div style={{ color: "#c0392b" }}>
                Discount ({discPct}%): -{fmtN(discountAmount)}
              </div>
            )}
            {taxPct > 0 && (
              <div>Tax ({taxPct}%): +{fmtN(taxAmount)}</div>
            )}
          </div>
        </div>
      )}

      {/* ── Separator ── */}
      <hr style={S.separator} />

      {/* ── Payment details + QR code ── */}
      <div style={S.paymentSection}>
        <div style={{ fontSize: 11, color: "#091E39", lineHeight: 1.6, flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Payment details:</div>
          <div>Account no: 1634998770</div>
          <div>Name: ADLM Studio</div>
          <div>Bank: Access Bank</div>
        </div>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <QRCodeSVG
            value="https://www.adlmstudio.net"
            size={80}
            level="M"
            fgColor="#091E39"
            style={{ display: "block" }}
          />
          <div style={{ fontSize: 7, color: "#666", marginTop: 4, fontStyle: "italic" }}>
            Authorized &middot; Scan to verify
          </div>
        </div>
      </div>

      {/* ── Terms ── */}
      {form?.terms && (
        <div style={S.terms}>
          <div style={{ fontWeight: 700 }}>Terms:</div>
          <div style={{ whiteSpace: "pre-line" }}>{form.terms}</div>
        </div>
      )}

      {/* ── Notes ── */}
      {form?.notes && (
        <div style={{ ...S.terms, marginTop: 10 }}>
          <div style={{ fontWeight: 700 }}>Notes:</div>
          <div style={{ whiteSpace: "pre-line" }}>{form.notes}</div>
        </div>
      )}
    </div>
  );
}
