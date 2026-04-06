import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Generate a certificate PDF by loading an admin-uploaded PDF template
 * and overlaying the user's verified name and completion date.
 *
 * @param {object} opts
 * @param {string} opts.templateImageUrl - Cloudinary URL of the certificate PDF template
 * @param {string} opts.fullName - User's verified full name
 * @param {string} opts.courseDescription - e.g. "for the BIM Course on Building Works"
 * @param {string} opts.dateString - e.g. "4th of April, 2026"
 * @param {string} [opts.filename] - Download filename (default: ADLM_Certificate.pdf)
 */
export async function generateCertificatePdf({
  templateImageUrl,
  fullName,
  courseDescription,
  dateString,
  filename = "ADLM_Certificate.pdf",
}) {
  if (!templateImageUrl) throw new Error("Certificate template URL is required");
  if (!fullName?.trim()) throw new Error("Name is required");

  // Fetch the PDF template
  const templateBytes = await fetch(templateImageUrl).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch certificate template");
    return res.arrayBuffer();
  });

  // Load the existing PDF
  const pdfDoc = await PDFDocument.load(templateBytes);

  // Embed fonts
  const nameFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
  const textFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  // Get the first page (the certificate)
  const page = pdfDoc.getPages()[0];
  const { width, height } = page.getSize();

  // --- Overlay the user's name ---
  // Centered horizontally, positioned at roughly 38% from bottom
  // (matches "Babajide Akande" position in the Figma design)
  const nameFontSize = 36;
  const nameWidth = nameFont.widthOfTextAtSize(fullName.trim(), nameFontSize);
  const nameX = (width - nameWidth) / 2;
  const nameY = height * 0.38; // ~38% from bottom of the page

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
    const descY = nameY - 50; // below the name

    page.drawText(courseDescription, {
      x: Math.max(descX, 50), // keep within page margins
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
    // Position in the DATE area (bottom-left region of the certificate)
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

  // Serialize the modified PDF
  const pdfBytes = await pdfDoc.save();

  // Trigger browser download
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
