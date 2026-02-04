import React from "react";
import dayjs from "dayjs";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import adlmLogo from "../assets/logo/adlmLogo.png";

export default function Receipt() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  const [order, setOrder] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  const receiptRef = React.useRef(null);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        // You need a backend endpoint for this (see section 3 below)
        const data = await apiAuthed(`/me/orders/${orderId}`, {
          token: accessToken,
        });
        setOrder(data);
      } catch (e) {
        setErr(e?.message || "Failed to load receipt");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, accessToken]);

  const approved = (() => {
    const st = String(order?.status || "").toLowerCase();
    return st === "approved" || order?.paid === true;
  })();

  const receiptNo = order?._id
    ? `ADLM-${String(order._id).slice(-8).toUpperCase()}`
    : "ADLM-—";
  const receiptDate =
    order?.decidedAt || order?.createdAt || new Date().toISOString();

  async function downloadPdf() {
    if (!receiptRef.current) return;

    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        pdf.addPage();
        position = heightLeft - imgHeight;
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${receiptNo}.pdf`);
    } catch (e) {
      // fallback: user can still use Print -> Save as PDF
      alert(
        "PDF download needs html2canvas + jspdf installed. You can still print and save as PDF.",
      );
    }
  }

  function printReceipt() {
    window.print();
  }

  if (loading)
    return <div className="p-6 text-sm text-slate-600">Loading receipt…</div>;
  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!order)
    return <div className="p-6 text-sm text-slate-600">Receipt not found.</div>;

  if (!approved) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-white ring-1 ring-slate-200 p-4">
          <div className="font-semibold text-slate-900">
            Receipt not available yet
          </div>
          <div className="text-sm text-slate-600 mt-1">
            This order has not been approved by admin, so receipt cannot be
            generated.
          </div>
          <button
            className="mt-4 px-3 py-2 rounded-md border text-sm hover:bg-slate-50"
            onClick={() => navigate("/dashboard")}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currency = order.currency || "NGN";
  const customerName =
    [order?.firstName, order?.lastName].filter(Boolean).join(" ") ||
    order?.email ||
    "—";

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-wrap { padding: 0 !important; }
          .print-card { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto print-wrap">
        {/* Action bar */}
        <div className="no-print flex items-center justify-between gap-2 mb-4">
          <button
            className="px-3 py-2 rounded-md border text-sm hover:bg-white"
            onClick={() => window.close()}
          >
            Close
          </button>

          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded-md border text-sm hover:bg-white"
              onClick={printReceipt}
            >
              Print
            </button>
            <button
              className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
              onClick={downloadPdf}
            >
              Download PDF
            </button>
          </div>
        </div>

        {/* Receipt */}
        <div
          ref={receiptRef}
          className="print-card bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Put your logo in /public/adlm-logo.png */}
              <img
                src={adlmLogo}
                crossOrigin="anonymous"
                alt="ADLM Logo"
                className="w-12 h-12 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />

              <div>
                <div className="text-lg font-bold text-slate-900">
                  ADLM Studio
                </div>
                <div className="text-xs text-slate-500">
                  Receipt / Invoice Confirmation
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-semibold text-slate-900">
                {receiptNo}
              </div>
              <div className="text-xs text-slate-500">
                Date: {dayjs(receiptDate).format("YYYY-MM-DD HH:mm")}
              </div>
              {order?.paystackRef ? (
                <div className="text-xs text-slate-500">
                  Ref: {order.paystackRef}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-4">
              <div className="text-xs text-slate-500">Billed To</div>
              <div className="mt-1 font-semibold text-slate-900">
                {customerName}
              </div>
              <div className="text-sm text-slate-600">
                {order?.email || "—"}
              </div>
              {order?.organization?.name ? (
                <div className="text-sm text-slate-600 mt-1">
                  Org: {order.organization.name}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-4">
              <div className="text-xs text-slate-500">Order Summary</div>
              <div className="mt-1 text-sm text-slate-700">
                Status: <b className="text-slate-900">Approved</b>
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Total:{" "}
                <b className="text-slate-900">
                  {currency} {Number(order?.totalAmount || 0).toLocaleString()}
                </b>
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-600">
                <tr className="border-b">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Billing</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  <th className="py-2 pr-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(order?.lines || []).map((ln, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-900">
                        {ln?.name || ln?.productKey || "—"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {ln?.productKey || ""}
                        {ln?.install
                          ? ` • Install: ${currency} ${Number(ln.install).toLocaleString()}`
                          : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-3 capitalize">
                      {ln?.billingInterval || "-"} • periods {ln?.periods || 1}
                    </td>
                    <td className="py-2 pr-3 text-right">{ln?.qty || 1}</td>
                    <td className="py-2 pr-3 text-right font-medium text-slate-900">
                      {currency} {Number(ln?.subtotal || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}

                {(!order?.lines || order.lines.length === 0) && (
                  <tr>
                    <td className="py-3 text-slate-600" colSpan={4}>
                      No line items found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-start justify-between gap-4">
            <div className="text-xs text-slate-500 max-w-md">
              This receipt confirms an approved purchase on ADLM Studio. If you
              need help, contact support.
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Total</div>
              <div className="text-lg font-bold text-slate-900">
                {currency} {Number(order?.totalAmount || 0).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t text-xs text-slate-500">
            © {new Date().getFullYear()} ADLM Studio — All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}
