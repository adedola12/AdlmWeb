// src/ds/docPdf.js
// A real A4 PDF of the composer's sheets, made in the browser.
//
// Why this exists: on a phone, window.print() does not give the document.
// iOS and Android print ignore @page { size: A4 }, put the 210 x 297mm sheet
// on US Letter, and cut it — the right edge was lost and every sheet ran onto
// a second page (a 10-sheet proposal came out as 20 clipped pages). The
// composer is used mostly from a phone, so the phone path captures each
// .doc-sheet exactly as drawn and writes one A4 page per sheet, the same
// html2canvas + jsPDF pattern as lib/proposalPdf.js and the project reports.
// Desktop keeps window.print(), which gives selectable text.

/** Phones and tablets: where the browser's own print cannot be trusted. */
export function printIsUnreliable() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(max-width: 1100px), (pointer: coarse)").matches;
}

export function docFilename(title) {
  const slug = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "adlm-document";
}

// html2canvas 1.4 cannot parse color-mix(), or the color(srgb …) a browser
// computes it to, and one unparseable colour aborts the whole capture. The
// sheet uses it once, for the outlined totals bar, as the ink at 22%; redraw
// that border from the computed ink so the capture survives.
function softenModernColours(root) {
  const win = root.ownerDocument.defaultView;
  root.querySelectorAll("*").forEach((el) => {
    const cs = win.getComputedStyle(el);
    if (!/color\(|color-mix/.test(cs.borderTopColor)) return;
    const m = cs.color.match(/rgba?\(([^)]+)\)/);
    const [r, g, b] = m ? m[1].split(",").map((v) => v.trim()) : [9, 30, 57];
    el.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.22)`;
  });
}

/**
 * Capture every .doc-sheet under `host` and save them as one A4 PDF.
 * The on-screen fit (a CSS zoom set through --doc-fit) is lifted for the
 * capture, so the sheets are drawn at full size rather than phone size.
 */
export async function downloadDocPdf(host, filename = "adlm-document") {
  if (!host) return;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* fonts may already be ready */
    }
  }

  const fit = host.style.getPropertyValue("--doc-fit");
  host.style.setProperty("--doc-fit", "1");
  host.classList.add("doc-capturing");
  try {
    // Let the un-zoomed layout settle before measuring it. A timeout, not
    // requestAnimationFrame: rAF never fires in a backgrounded tab, and a PDF
    // that hangs because the phone screen locked is worse than a short pause.
    await new Promise((r) => setTimeout(r, 60));

    const sheets = host.querySelectorAll(".doc-sheet");
    if (!sheets.length) throw new Error("There is nothing on the page to save yet.");

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i];
      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: sheet.offsetWidth,
        height: sheet.offsetHeight,
        windowWidth: Math.max(document.documentElement.clientWidth, sheet.offsetWidth + 48),
        onclone: (doc) => {
          const twin = doc.querySelectorAll(".doc-sheet")[i];
          if (!twin) return;
          softenModernColours(twin);
          // html2canvas draws a native list marker hard against the text, and
          // ignores a ::before put in to replace it. So the capture copy (only)
          // gets a real bullet in each item, hung in the same indent.
          twin.querySelectorAll(".doc-ul").forEach((ul) => {
            ul.style.listStyle = "none";
          });
          twin.querySelectorAll(".doc-ul > li").forEach((li) => {
            const dot = doc.createElement("span");
            dot.textContent = "•";
            dot.style.cssText = "display:inline-block;width:11pt;margin-left:-11pt";
            li.prepend(dot);
          });
        },
      });
      if (i > 0) pdf.addPage();
      // JPEG, not PNG: a ten-sheet proposal is a few MB instead of twenty-odd.
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, ph);
    }
    pdf.save(`${filename}.pdf`);
  } finally {
    host.classList.remove("doc-capturing");
    if (fit) host.style.setProperty("--doc-fit", fit);
    else host.style.removeProperty("--doc-fit");
  }
}
