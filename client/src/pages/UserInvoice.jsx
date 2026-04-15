// src/pages/UserInvoice.jsx
// Full invoice preview page for authenticated users — same layout as admin preview.
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { API_BASE } from "../config";
import InvoicePreviewPage from "../components/InvoicePreview.jsx";

export default function UserInvoice() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [invoice, setInvoice] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const previewRef = React.useRef(null);

  React.useEffect(() => {
    if (!id || !accessToken) return;
    setLoading(true);
    apiAuthed(`/me/invoices/${id}`, { token: accessToken })
      .then((data) => {
        if (data?._error) throw new Error(data._error);
        setInvoice(data?.invoice || data);
      })
      .catch((e) => setError(e?.message || "Failed to load invoice"))
      .finally(() => setLoading(false));
  }, [id, accessToken]);

  // Compute totals from the invoice data (same logic the admin uses)
  const subtotal = Number(invoice?.subtotal || 0);
  const discPct = Number(invoice?.discountPercent || 0);
  const discountAmount = Number(invoice?.discountAmount || 0);
  const taxPct = Number(invoice?.taxPercent || 0);
  const taxAmount = Number(invoice?.taxAmount || 0);
  const total = Number(invoice?.total || 0);

  async function handleDownloadPdf() {
    if (!previewRef.current) return;
    setPdfBusy(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const el = previewRef.current;
      const origW = el.style.width;
      el.style.width = "595px";

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        width: 595,
        windowWidth: 595,
      });

      el.style.width = origW;

      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let yOff = 0;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, yOff, imgW, imgH);
      let remaining = imgH - pageH;
      while (remaining > 0) {
        pdf.addPage();
        yOff -= pageH;
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, yOff, imgW, imgH);
        remaining -= pageH;
      }

      pdf.save(`${invoice?.invoiceNumber || "invoice"}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("PDF download failed. Use Print → Save as PDF instead.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-slate-500">
        Loading invoice…
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <div className="text-rose-600 mb-4">{error || "Invoice not found"}</div>
        <button
          className="text-sm px-4 py-2 rounded-md border border-slate-200 hover:bg-slate-50"
          onClick={() => navigate("/dashboard")}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, html { background: white !important; margin: 0 !important; padding: 0 !important; }
          .inv-page { box-shadow: none !important; }
        }
      `}</style>

      {/* Action bar */}
      <div className="no-print flex items-center justify-between gap-2 flex-wrap mb-4">
        <button
          className="text-sm px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
          onClick={() => navigate("/dashboard")}
        >
          Back to Dashboard
        </button>
        <div className="flex gap-2">
          <button
            className="text-sm px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={() => window.print()}
          >
            Print
          </button>
          <button
            className="text-sm px-3 py-1.5 rounded-md font-medium text-white"
            style={{ backgroundColor: "#091E39" }}
            onClick={handleDownloadPdf}
            disabled={pdfBusy}
          >
            {pdfBusy ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </div>

      {/* Invoice preview — identical to admin */}
      <InvoicePreviewPage
        form={invoice}
        subtotal={subtotal}
        discountAmount={discountAmount}
        discPct={discPct}
        taxAmount={taxAmount}
        taxPct={taxPct}
        total={total}
        previewRef={previewRef}
      />
    </div>
  );
}
