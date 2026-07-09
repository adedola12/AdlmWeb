// features/reports/reportPdf.js
// PDF export for the report documents — same html2canvas + jsPDF pattern as
// lib/proposalPdf.js: capture each `.page` element and write one A4 page per
// report page. Report pages are fixed at exactly A4 (210×297mm), so the
// stretch-to-page addImage keeps its aspect ratio.

export async function downloadReportPdf(previewRef, filename = "report") {
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

export function reportFilename(prefix, name) {
  const slug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  return [prefix, slug, date].filter(Boolean).join("-");
}
