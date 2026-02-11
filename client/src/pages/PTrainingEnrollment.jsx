// src/pages/PTrainingEnrollment.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiAuthed } from "../http.js";

function fmtDate(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "";
  }
}

function gcalLink({ title, details, location, startAt, endAt }) {
  const s =
    new Date(startAt).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const e =
    new Date(endAt).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", title || "ADLM Training");
  u.searchParams.set("details", details || "");
  u.searchParams.set("location", location || "");
  u.searchParams.set("dates", `${s}/${e}`);
  return u.toString();
}

export default function PTrainingEnrollment() {
  const { enrollmentId } = useParams();

  const [loading, setLoading] = useState(true);
  const [e, setE] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({});

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const { data } = await apiAuthed.get(`/me/ptrainings/${enrollmentId}`);
      setE(data);
    } catch (x) {
      setErr(x?.response?.data?.error || x.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [enrollmentId]);

  useEffect(() => {
    if (e?.formData && Object.keys(e.formData).length) setForm(e.formData);
  }, [e?.formData]);

  const training = e?.training;

  const address = useMemo(() => {
    const loc = training?.location || {};
    return [loc.name, loc.address, loc.city, loc.state]
      .filter(Boolean)
      .join(", ");
  }, [training]);

  const raw = e?.payment?.raw || {};
  const manualSubmitted =
    raw?.method === "manual_transfer" && raw?.state === "submitted";
  const paidConfirmed = !!e?.payment?.paid;

  const formUnlocked =
    paidConfirmed || manualSubmitted || Number(training?.priceNGN || 0) <= 0;

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function submitForm() {
    setBusy(true);
    setErr("");
    try {
      await apiAuthed.post(`/me/ptrainings/${enrollmentId}/form`, form);
      await load();
    } catch (x) {
      setErr(x?.response?.data?.error || x.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitManualPayment() {
    setBusy(true);
    setErr("");
    try {
      await apiAuthed.post(
        `/ptrainings/enrollments/${enrollmentId}/payment-submitted`,
        {
          note: "Submitted from portal",
        },
      );
      await load();
    } catch (x) {
      setErr(x?.response?.data?.error || x.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!e || !training) return <div className="p-6">Not found</div>;

  const paymentInstructions = e.paymentInstructions || null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{training.title}</h1>
          <p className="text-gray-600 mt-1">
            {fmtDate(training.startAt)} — {fmtDate(training.endAt)}
          </p>
        </div>
        <Link
          to={`/ptrainings/${training._id}`}
          className="text-blue-600 hover:underline font-semibold"
        >
          View Training Page →
        </Link>
      </div>

      {/* Status */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border bg-white">
          <div className="text-sm text-gray-500">Payment</div>
          <div className="mt-1 font-bold">
            {paidConfirmed
              ? "Confirmed"
              : manualSubmitted
                ? "Submitted (Awaiting confirmation)"
                : "Pending"}
          </div>

          {!paidConfirmed && (
            <div className="text-sm text-gray-600 mt-2 space-y-2">
              {paymentInstructions ? (
                <div className="p-3 rounded-xl border bg-gray-50">
                  <div>
                    Amount:{" "}
                    <b>
                      ₦
                      {Number(
                        paymentInstructions.amountNGN || 0,
                      ).toLocaleString()}
                    </b>
                  </div>
                  <div className="mt-2">
                    <b>{paymentInstructions.bankName}</b>
                    <div>{paymentInstructions.accountName}</div>
                    <div className="font-semibold">
                      {paymentInstructions.accountNumber}
                    </div>
                  </div>
                  {paymentInstructions.note ? (
                    <div className="mt-2 text-xs text-gray-600">
                      {paymentInstructions.note}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!manualSubmitted ? (
                <button
                  onClick={submitManualPayment}
                  disabled={busy}
                  className="px-3 py-2 rounded-xl border hover:bg-gray-50 font-semibold"
                >
                  {busy ? "Submitting…" : "I’ve Paid / Continue"}
                </button>
              ) : (
                <button
                  onClick={load}
                  className="px-3 py-2 rounded-xl border hover:bg-gray-50 font-semibold"
                >
                  Refresh Status
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-4 rounded-2xl border bg-white">
          <div className="text-sm text-gray-500">Form</div>
          <div className="mt-1 font-bold">
            {e.formSubmittedAt
              ? "Submitted"
              : formUnlocked
                ? "Pending"
                : "Locked"}
          </div>
          <div className="text-sm text-gray-600 mt-2">
            {e.formSubmittedAt
              ? "Your form has been received."
              : formUnlocked
                ? "Please complete your registration form."
                : "Pay and submit transfer first to unlock."}
          </div>
        </div>

        <div className="p-4 rounded-2xl border bg-white">
          <div className="text-sm text-gray-500">Installation</div>
          <div className="mt-1 font-bold">
            {e.installation?.status === "complete"
              ? "Complete"
              : e.installation?.status === "pending"
                ? "Pending"
                : "Not Started"}
          </div>
          <div className="text-sm text-gray-600 mt-2">
            {e.installation?.status === "complete"
              ? "Admin has completed installation and access has been granted."
              : "You will see pending status until admin marks installation complete."}
          </div>
        </div>
      </div>

      {/* FORM */}
      {formUnlocked && !e.formSubmittedAt && (
        <div className="mt-8 bg-white border rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold">Participant Registration Form</h2>
          <p className="text-gray-600 mt-2">
            Fill this to confirm your training slot and logistics.
          </p>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {(training.formFields || []).map((f) => {
              const v = form[f.key] ?? (f.type === "multi" ? [] : "");
              const common =
                "w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200";

              return (
                <div key={f.key} className="flex flex-col gap-2">
                  <label className="font-semibold text-sm">
                    {f.label}{" "}
                    {f.required ? (
                      <span className="text-red-600">*</span>
                    ) : null}
                  </label>

                  {f.type === "paragraph" ? (
                    <textarea
                      className={common}
                      rows={4}
                      placeholder={f.placeholder || ""}
                      value={String(v)}
                      onChange={(e) => setField(f.key, e.target.value)}
                    />
                  ) : f.type === "select" ? (
                    <select
                      className={common}
                      value={String(v)}
                      onChange={(e) => setField(f.key, e.target.value)}
                    >
                      <option value="">Select…</option>
                      {(f.options || []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "multi" ? (
                    <div className="border rounded-xl p-3 space-y-2">
                      {(f.options || []).map((o) => {
                        const arr = Array.isArray(v) ? v : [];
                        const checked = arr.includes(o);
                        return (
                          <label
                            key={o}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(ev) => {
                                const next = ev.target.checked
                                  ? [...arr, o]
                                  : arr.filter((x) => x !== o);
                                setField(f.key, next);
                              }}
                            />
                            {o}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      className={common}
                      type={
                        f.type === "email"
                          ? "email"
                          : f.type === "date"
                            ? "date"
                            : "text"
                      }
                      placeholder={f.placeholder || ""}
                      value={String(v)}
                      onChange={(e) => setField(f.key, e.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {err ? <div className="text-red-600 mt-4">{err}</div> : null}

          <div className="mt-6 flex gap-2">
            <button
              onClick={submitForm}
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
            >
              {busy ? "Submitting…" : "Submit Form"}
            </button>
            <button
              onClick={() => setForm({})}
              className="px-4 py-2 rounded-xl border font-semibold hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* AFTER FORM SUBMISSION */}
      {e.formSubmittedAt && (
        <div className="mt-8 bg-white border rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold">Your Training Dashboard</h2>

          <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-gray-700">
              <div>
                <span className="font-semibold">Training Date:</span>{" "}
                {fmtDate(training.startAt)} — {fmtDate(training.endAt)}
              </div>
              <div className="mt-1">
                <span className="font-semibold">Location:</span>{" "}
                {address || "—"}
              </div>
            </div>

            <div className="flex gap-2">
              <a
                className="px-4 py-2 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700"
                href={gcalLink({
                  title: training.title,
                  details:
                    training.description || training.fullDescription || "",
                  location: address,
                  startAt: training.startAt,
                  endAt: training.endAt,
                })}
                target="_blank"
                rel="noreferrer"
              >
                Add Reminder (Google Calendar)
              </a>

              <a
                className="px-4 py-2 rounded-xl border font-semibold hover:bg-gray-50"
                href={`/me/ptrainings/${enrollmentId}/ics`}
              >
                Download .ICS
              </a>
            </div>
          </div>

          {/* Installation checklist */}
          <div className="mt-6">
            <h3 className="font-bold text-lg">
              Software & Plugin Installation Checklist
            </h3>
            <div className="mt-3 space-y-2">
              {(training.installationChecklist || []).length ? (
                training.installationChecklist.map((c) => (
                  <div
                    key={c.key}
                    className="flex items-center justify-between p-3 rounded-xl border bg-gray-50"
                  >
                    <div className="font-semibold text-gray-800">{c.label}</div>
                    {c.helpUrl ? (
                      <a
                        className="text-blue-600 hover:underline text-sm font-semibold"
                        href={c.helpUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Guide
                      </a>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="text-gray-600 text-sm">
                  Checklist will appear here once admin sets it for this
                  training.
                </div>
              )}
            </div>
          </div>

          {/* Installation status */}
          <div className="mt-6 p-4 rounded-2xl border">
            <div className="font-bold">Installation Status</div>
            <div className="mt-1 text-gray-700">
              {e.installation?.status === "complete"
                ? "✅ Installation complete. Your access has been activated."
                : "⏳ Pending installation. You will gain full tool access once admin marks installation complete."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
