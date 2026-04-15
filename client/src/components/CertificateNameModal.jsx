import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { generateCertificatePdf } from "../lib/generateCertificatePdf.js";

/**
 * Modal that prompts the user to verify their name before downloading
 * a certificate PDF generated client-side from the course template.
 *
 * On first certificate download the name is LOCKED server-side and
 * cannot be changed afterwards. Subsequent downloads reuse the locked name.
 *
 * Props:
 *   open              - boolean
 *   onClose           - () => void
 *   courseSku         - course SKU (used to build the proxy URL)
 *   courseTitle        - used for the filename
 *   courseDescription  - text placed on the certificate
 *   completionDate    - ISO date string or Date
 */
export default function CertificateNameModal({
  open,
  onClose,
  courseSku,
  courseTitle,
  courseDescription,
  completionDate,
}) {
  const { user, accessToken, setAuth } = useAuth();
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [locked, setLocked] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState("");

  // Fetch certificate-name lock status when modal opens
  React.useEffect(() => {
    if (!open || !accessToken) return;
    setError("");
    setLoading(true);

    apiAuthed("/me/certificate-name", { token: accessToken })
      .then((data) => {
        if (data?.locked) {
          // Name is already locked — use it and prevent editing
          setFirstName(data.certificateFirstName || "");
          setLastName(data.certificateLastName || "");
          setLocked(true);
        } else {
          // Not locked yet — prefill from profile
          setFirstName(user?.firstName || "");
          setLastName(user?.lastName || "");
          setLocked(false);
        }
      })
      .catch(() => {
        // Fallback to profile name if endpoint fails
        setFirstName(user?.firstName || "");
        setLastName(user?.lastName || "");
        setLocked(false);
      })
      .finally(() => setLoading(false));
  }, [open, accessToken, user]);

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
    if (!courseSku) {
      setError("Course information is missing.");
      return;
    }
    setError("");
    setGenerating(true);

    try {
      // If not yet locked, lock the name on the server first
      if (!locked) {
        const lockRes = await apiAuthed("/me/certificate-name", {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName: fn, lastName: ln }),
        });

        if (lockRes?.error) {
          // If the server says it's already locked, use the locked name
          if (lockRes.locked) {
            setFirstName(lockRes.certificateFirstName || fn);
            setLastName(lockRes.certificateLastName || ln);
            setLocked(true);
            setError("Your certificate name was already locked. Using your registered name.");
            setGenerating(false);
            return;
          }
          throw new Error(lockRes.error);
        }

        setLocked(true);

        // Update local auth state so profile reflects the new name
        if (lockRes?.user) {
          setAuth((prev) => ({
            ...prev,
            user: { ...(prev?.user || {}), ...lockRes.user },
          }));
        }
      }

      await generateCertificatePdf({
        proxyUrl: `/me/courses/${encodeURIComponent(courseSku)}/certificate-template`,
        accessToken,
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
          <h3 className="font-semibold text-base">
            {locked ? "Certificate Name" : "Set Your Certificate Name"}
          </h3>
          <button
            className="text-slate-400 hover:text-slate-700 text-xl leading-none"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="text-sm text-slate-500 text-center py-4">Loading…</div>
          ) : (
            <>
              {locked ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  Your certificate name has been permanently set and cannot be changed.
                  All certificates will use this name.
                </div>
              ) : (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                  <strong>Important:</strong> The name you enter below will be permanently
                  locked to your account. All future certificates will use this name, and
                  it will also update your profile. Please double-check before proceeding.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <div className="mb-1 font-medium">First Name</div>
                  <input
                    className="input w-full disabled:bg-slate-100 disabled:cursor-not-allowed"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    disabled={locked}
                  />
                </label>
                <label className="text-sm">
                  <div className="mb-1 font-medium">Last Name</div>
                  <input
                    className="input w-full disabled:bg-slate-100 disabled:cursor-not-allowed"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    disabled={locked}
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
            </>
          )}
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
            disabled={generating || loading}
          >
            {generating ? "Generating..." : "Download Certificate"}
          </button>
        </div>
      </div>
    </div>
  );
}
