import React from "react";
import { useAuth } from "../store.jsx";
import { generateCertificatePdf } from "../lib/generateCertificatePdf.js";

/**
 * Modal that prompts the user to verify their name before downloading
 * a certificate PDF generated client-side from the course template.
 *
 * Props:
 *   open                  - boolean
 *   onClose               - () => void
 *   certificateTemplateUrl - Cloudinary URL of the certificate background PNG
 *   courseTitle            - used for the filename
 *   courseDescription      - text placed on the certificate (e.g. "for the BIM Course on Building Works")
 *   completionDate        - ISO date string or Date
 */
export default function CertificateNameModal({
  open,
  onClose,
  certificateTemplateUrl,
  courseTitle,
  courseDescription,
  completionDate,
}) {
  const { user } = useAuth();
  const [firstName, setFirstName] = React.useState(user?.firstName || "");
  const [lastName, setLastName] = React.useState(user?.lastName || "");
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState("");

  // Reset fields when modal opens
  React.useEffect(() => {
    if (open) {
      setFirstName(user?.firstName || "");
      setLastName(user?.lastName || "");
      setError("");
    }
  }, [open, user]);

  if (!open) return null;

  function formatDate(d) {
    if (!d) return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  async function handleDownload() {
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) {
      setError("Please enter both your first name and last name.");
      return;
    }
    setError("");
    setGenerating(true);
    try {
      await generateCertificatePdf({
        templateImageUrl: certificateTemplateUrl,
        fullName: `${fn} ${ln}`,
        courseDescription: courseDescription || "",
        dateString: formatDate(completionDate),
        filename: `ADLM_Certificate_${(courseTitle || "Course").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
      });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to generate certificate. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-base">Verify Your Name</h3>
          <button
            className="text-slate-400 hover:text-slate-700 text-xl leading-none"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-slate-600">
            Your name will appear on the certificate exactly as entered below.
            Please verify it is correct before downloading.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <div className="mb-1 font-medium">First Name</div>
              <input
                className="input w-full"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1 font-medium">Last Name</div>
              <input
                className="input w-full"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </label>
          </div>

          {firstName.trim() && lastName.trim() ? (
            <div className="text-sm text-slate-500">
              Name on certificate:{" "}
              <span className="font-semibold text-slate-800">
                {firstName.trim()} {lastName.trim()}
              </span>
            </div>
          ) : null}

          {error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-slate-50">
          <button
            className="px-4 py-2 rounded-md border text-sm hover:bg-slate-100 transition"
            onClick={onClose}
            disabled={generating}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-md bg-adlm-blue-700 text-white text-sm hover:bg-[#0050c8] transition disabled:opacity-60"
            onClick={handleDownload}
            disabled={generating}
          >
            {generating ? "Generating..." : "Download Certificate"}
          </button>
        </div>
      </div>
    </div>
  );
}
