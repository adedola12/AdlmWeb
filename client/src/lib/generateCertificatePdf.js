import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Generate a certificate PDF by loading the template via a server proxy
 * (bypasses CORS), then overlaying the user's verified name and date.
 *
 * @param {object} opts
 * @param {string} opts.proxyUrl - Server proxy URL e.g. "/me/courses/sku/certificate-template"
 * @param {string} opts.accessToken - Bearer token for authenticated fetch
 * @param {string} opts.fullName - User's verified full name
 * @param {string} opts.courseDescription - e.g. "for the BIM Course on Building Works"
 * @param {string} opts.dateString - e.g. "4 April 2026"
 * @param {string} [opts.filename] - Download filename
 */
export async function generateCertificatePdf({
  proxyUrl,
  accessToken,
  fullName,
  courseDescription,
  dateString,
  filename = "ADLM_Certificate.pdf",
}) {
  if (!proxyUrl) throw new Error("Certificate proxy URL is required");
  if (!fullName?.trim()) throw new Error("Name is required");

  // Fetch via server proxy (no CORS issues)
  const API_BASE = import.meta.env.VITE_API_BASE || "";
  const url = `${API_BASE}${proxyUrl}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to fetch certificate template");
  }
  const templateBytes = await response.arrayBuffer();

  // Load the existing PDF
  const pdfDoc = await PDFDocument.load(templateBytes);

  // Embed fonts
  const nameFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
  const textFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  // Get the first page (the certificate)
  const page = pdfDoc.getPages()[0];
  const { width, height } = page.getSize();

  // --- Overlay the user's name ---
  const nameFontSize = 36;
  const nameWidth = nameFont.widthOfTextAtSize(fullName.trim(), nameFontSize);
  const nameX = (width - nameWidth) / 2;
  const nameY = height * 0.38;

  page.drawText(fullName.trim(), {
    x: nameX,
    y: nameY,
    size: nameFontSize,
    font: nameFont,
    color: rgb(0.12, 0.12, 0.12),
  });

  // --- Overlay the course description ---
  if (courseDescription) {
    const descFontSize = 10;
    const descWidth = textFont.widthOfTextAtSize(courseDescription, descFontSize);
    const descX = (width - descWidth) / 2;
    const descY = nameY - 50;

    page.drawText(courseDescription, {
      x: Math.max(descX, 50),
      y: descY,
      size: descFontSize,
      font: textFont,
      color: rgb(0.25, 0.25, 0.25),
    });
  }

  // --- Overlay the date ---
  if (dateString) {
    const dateFontSize = 10;
    const dateWidth = textFont.widthOfTextAtSize(dateString, dateFontSize);
    const dateX = width * 0.35 - dateWidth / 2;
    const dateY = height * 0.13;

    page.drawText(dateString, {
      x: dateX,
      y: dateY,
      size: dateFontSize,
      font: textFont,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  // Serialize and download
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}
