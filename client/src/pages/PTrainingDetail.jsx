// src/pages/PTrainingDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

function fmtDate(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "";
  }
}

function mapsDirLink(address) {
  const dest = encodeURIComponent(address || "");
  return `https://www.google.com/maps/dir/?api=1&origin=Current+Location&destination=${dest}`;
}

function CopyRow({ label, value }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(value || ""));
      alert("Copied!");
    } catch {
      alert("Copy failed (browser permissions).");
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-gray-50">
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="font-semibold break-all">{value || "—"}</div>
      </div>
      <button
        onClick={copy}
        className="px-3 py-2 rounded-xl border font-semibold hover:bg-white"
      >
        Copy
      </button>
    </div>
  );
}

export default function PTrainingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [t, setT] = useState(null);
  const [err, setErr] = useState("");

  const [busy, setBusy] = useState(false);

  // modal state
  const [payOpen, setPayOpen] = useState(false);
  const [payInfo, setPayInfo] = useState(null);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payerName, setPayerName] = useState("");
  const [bankName, setBankName] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    let ok = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(`/ptrainings/${id}`, { credentials: "include" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed");
        if (ok) setT(j);
      } catch (e) {
        if (ok) setErr(e.message || "Failed");
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => (ok = false);
  }, [id]);

  const address = useMemo(() => {
    const loc = t?.location || {};
    return [loc.name, loc.address, loc.city, loc.state]
      .filter(Boolean)
      .join(", ");
  }, [t]);

  async function onRegister() {
    if (!user) return nav("/login");

    setBusy(true);
    setErr("");
    try {
      const { data } = await apiAuthed.post(`/ptrainings/${id}/enroll`, {});
      if (!data?.enrollmentId) throw new Error("No enrollmentId returned");

      // FREE training -> go straight to portal
      if (!data?.manualPayment) {
        return nav(`/ptrainings/enrollment/${data.enrollmentId}`);
      }

      // PAID -> show manual payment popup
      setEnrollmentId(data.enrollmentId);
      setPayInfo(data.paymentInstructions || null);
      setPayOpen(true);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPaymentSubmission() {
    if (!enrollmentId) return;
    try {
      await apiAuthed.post(
        `/ptrainings/enrollments/${enrollmentId}/payment-submitted`,
        { note: payNote, payerName, bankName, reference },
      );
      setPayOpen(false);
      nav(`/ptrainings/enrollment/${enrollmentId}`);
    } catch (e) {
      alert(e?.response?.data?.error || e.message || "Failed");
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!t) return <div className="p-6">Not found</div>;

  const cap = t.capacityApproved || 14;
  const approved = t.approvedCount || 0;
  const closed = approved >= cap;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t.title}</h1>
          {t.subtitle ? (
            <p className="text-gray-600 mt-1">{t.subtitle}</p>
          ) : null}

          <div className="mt-3 text-sm text-gray-700 space-y-1">
            <div>
              <span className="font-semibold">Date:</span> {fmtDate(t.startAt)}{" "}
              — {fmtDate(t.endAt)}
            </div>
            <div>
              <span className="font-semibold">Capacity:</span> {approved}/{cap}{" "}
              approved{" "}
              {closed ? (
                <span className="ml-2 inline-flex px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">
                  Enrollment Closed
                </span>
              ) : (
                <span className="ml-2 inline-flex px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">
                  Open
                </span>
              )}
            </div>
            <div>
              <span className="font-semibold">Fee:</span>{" "}
              {Number(t.priceNGN || 0) <= 0
                ? "Free"
                : `₦${Number(t.priceNGN).toLocaleString()}`}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onRegister}
            disabled={busy || closed}
            className={`px-4 py-2 rounded-xl font-semibold shadow-sm ${
              closed
                ? "bg-gray-200 text-gray-500"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {busy ? "Processing…" : "Register Now"}
          </button>

          <a
            href="#location"
            className="px-4 py-2 rounded-xl font-semibold border border-gray-300 hover:bg-gray-50"
          >
            View Location
          </a>
        </div>
      </div>

      {/* Description */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border p-6">
          <h2 className="text-xl font-bold">Program Overview</h2>
          <p className="mt-3 text-gray-700 whitespace-pre-wrap">
            {t.fullDescription || t.description || "—"}
          </p>

          {!!(t.whatYouGet || []).length && (
            <>
              <h3 className="text-lg font-bold mt-6">What You Get</h3>
              <ul className="mt-3 space-y-2">
                {t.whatYouGet.map((x, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-blue-600" />
                    <span className="text-gray-700">{x}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!!(t.requirements || []).length && (
            <>
              <h3 className="text-lg font-bold mt-6">Requirements</h3>
              <ul className="mt-3 space-y-2">
                {t.requirements.map((x, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-gray-500" />
                    <span className="text-gray-700">{x}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h3 className="text-lg font-bold">Next Steps</h3>
          <div className="mt-3 text-gray-700 text-sm space-y-3">
            <div className="p-3 rounded-xl bg-gray-50 border">
              <div className="font-semibold">1) Make Payment</div>
              <div>Click “Register Now” to see ADLM account details.</div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border">
              <div className="font-semibold">2) Fill Registration Form</div>
              <div>
                After you confirm transfer, complete your participant form.
              </div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border">
              <div className="font-semibold">
                3) Admin Approval & Installation
              </div>
              <div>
                Admin confirms your payment, approves your slot, and completes
                installation.
              </div>
            </div>

            <div className="pt-2">
              <Link
                to="/dashboard"
                className="text-blue-600 hover:underline font-semibold"
              >
                Go to Dashboard →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Location */}
      <div
        id="location"
        className="mt-10 bg-white rounded-2xl shadow-sm border p-6"
      >
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Training Location</h2>
            <p className="mt-2 text-gray-700">{address || "—"}</p>

            {!!(t.location?.amenities || []).length && (
              <div className="mt-4">
                <div className="font-semibold">Amenities</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.location.amenities.map((a, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-full text-sm bg-gray-100 border"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <a
              href={t.location?.googleMapsPlaceUrl || mapsDirLink(address)}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700"
            >
              Open in Google Maps
            </a>
            <a
              href={mapsDirLink(address)}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl font-semibold border border-gray-300 hover:bg-gray-50"
            >
              Directions
            </a>
          </div>
        </div>
      </div>

      {/* ✅ Manual payment popup */}
      {payOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-lg border p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-bold">ADLM Payment Details</div>
                <div className="text-sm text-gray-600 mt-1">
                  Make a transfer and click <b>I’ve Paid / Continue</b>.
                </div>
              </div>
              <button
                onClick={() => setPayOpen(false)}
                className="px-3 py-2 rounded-xl border font-semibold hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                <div className="text-sm text-blue-700">
                  Amount:{" "}
                  <b>
                    ₦
                    {Number(
                      payInfo?.amountNGN || t.priceNGN || 0,
                    ).toLocaleString()}
                  </b>
                </div>
              </div>

              <CopyRow label="Bank Name" value={payInfo?.bankName} />
              <CopyRow label="Account Name" value={payInfo?.accountName} />
              <CopyRow label="Account Number" value={payInfo?.accountNumber} />

              {payInfo?.note ? (
                <div className="p-3 rounded-xl border bg-gray-50 text-sm text-gray-700">
                  {payInfo.note}
                  {payInfo.whatsapp ? (
                    <div className="mt-2">
                      WhatsApp: <b>{payInfo.whatsapp}</b>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  className="border rounded-xl px-3 py-2"
                  placeholder="Payer Name (optional)"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                />
                <input
                  className="border rounded-xl px-3 py-2"
                  placeholder="Your Bank (optional)"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
                <input
                  className="border rounded-xl px-3 py-2 md:col-span-2"
                  placeholder="Transfer Reference / Narration (optional)"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
                <textarea
                  className="border rounded-xl px-3 py-2 md:col-span-2"
                  rows={3}
                  placeholder="Note to admin (optional)"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                />
              </div>

              <button
                onClick={confirmPaymentSubmission}
                className="w-full px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
              >
                I’ve Paid / Continue
              </button>

              <button
                onClick={() => nav(`/ptrainings/enrollment/${enrollmentId}`)}
                className="w-full px-4 py-3 rounded-xl border font-semibold hover:bg-gray-50"
              >
                Continue Without Submitting Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
