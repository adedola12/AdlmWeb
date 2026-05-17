// src/pages/PublicProposal.jsx
// Public, no-auth client-facing view of a proposal, reached via /proposal/:token.
import React from "react";
import { useParams } from "react-router-dom";
import { api } from "../http.js";
import ProposalPreview from "../components/ProposalPreview.jsx";
import { downloadProposalPdf } from "../lib/proposalPdf.js";

export default function PublicProposal() {
  const { token } = useParams();
  const [proposal, setProposal] = React.useState(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const previewRef = React.useRef(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api(`/proposals/${token}`);
        if (!alive) return;
        if (data?.proposal) setProposal(data.proposal);
        else setError("Proposal not found.");
      } catch (e) {
        if (alive) setError(e?.message || "Proposal not found.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  async function handleDownload() {
    setPdfBusy(true);
    try {
      await downloadProposalPdf(
        previewRef,
        proposal?.proposalNumber || "proposal",
      );
    } catch {
      alert("PDF download failed. Use Print → Save as PDF instead.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading)
    return (
      <div className="p-10 text-center text-slate-500">Loading proposal…</div>
    );

  if (error || !proposal)
    return (
      <div className="p-10 text-center">
        <h1 className="text-lg font-semibold text-slate-700">
          Proposal unavailable
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {error || "This proposal link is invalid or has expired."}
        </p>
      </div>
    );

  return (
    <div>
      <div className="no-print flex justify-end gap-2 mb-3 max-w-[210mm] mx-auto">
        <button className="btn btn-sm" onClick={() => window.print()}>
          Print
        </button>
        <button
          className="btn btn-sm"
          onClick={handleDownload}
          disabled={pdfBusy}
        >
          {pdfBusy ? "Generating…" : "Download PDF"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <ProposalPreview proposal={proposal} previewRef={previewRef} />
      </div>
    </div>
  );
}
