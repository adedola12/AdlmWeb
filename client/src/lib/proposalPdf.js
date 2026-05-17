// src/lib/proposalPdf.js
// Pixel-perfect client-side PDF for a rendered ProposalPreview: captures each
// `.page` element with html2canvas and writes one A4 page per proposal page.

export async function downloadProposalPdf(previewRef, filename = "proposal") {
  if (!previewRef?.current) return;
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* fonts may already be ready */
    }
  }
  const pages = previewRef.current.querySelectorAll(".page");
  const pdf = new jsPDF("p", "mm", "a4");
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
    });
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pw, ph);
  }
  pdf.save(`${filename}.pdf`);
}
