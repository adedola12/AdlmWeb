// Training sign-up — the enrolment path, in his design, on the real API.
//
// WHAT THIS REPLACES
// The classic route was three screens and a modal: /ptrainings/:key
// (pages/PTrainingDetail.jsx) carried a "Register" button that opened a bank
// transfer modal, then redirected to /ptrainings/enrollment/:id
// (pages/PTrainingEnrollment.jsx) for the participant form. All of it was raw
// Tailwind — white cards, blue-700 buttons, `alert()` on failure — and none of
// it reads in his dark theme. This is the same flow as one page in his
// vocabulary, with the three server steps shown as his .flowsteps.
//
// HIS DESIGN
// The nearest page of his is ds/pages/DsBeyondBimRegister.jsx: form left,
// sticky summary right, numbered legends, one full-width primary button, a
// confirmation state in place of the form. That page's own classes (.bb-reg,
// .bb-form, .bb-sum, .bb-ok, and the .ds-field.bad/.err validation pair) live
// in styles/ds-beyondbim.css, which is code-split and loaded only on
// /beyondbim — and importing it here is NOT safe: it also carries the only
// .art-l/.art-d rules in the build, and Press, Cart and the free library use
// those classes, so loading it on this route would hide one of their images
// for the rest of the session. ds-local.css records the same trap where /fit
// needed one rule out of that sheet.
//
// So the layout is built from the equivalent vocabulary his checkout already
// publishes in ds.css, which every page loads: .chk for the form/summary
// split, .panel for the cards, .flowsteps for where you are, .sumrow/.sumtot
// for the summary, .bankbox/.bankrow for the transfer details, .two-up and
// .ds-field for the fields, .chk-msg for the status line. Same shapes, same
// tokens, no new stylesheet, nothing taken off another page.
//
// REAL DATA ONLY
// Every figure comes from the event. The fee is computed by the same rule as
// server/routes/ptrainings.js computePricing() — early-bird price while
// pricing.earlyBird.endsAt is in the future, otherwise pricing.normalNGN
// falling back to the legacy priceNGN — and once the enrolment exists the
// amount shown is the server's own paymentInstructions.amountNGN rather than
// ours. Places left is capacityApproved (default 14, as the server defaults)
// minus the approvedCount the detail endpoint returns. Bank details are the
// server's, from the environment; nothing is hardcoded here.
//
// THE THREE SERVER STEPS
//   1  POST /ptrainings/:key/enroll                       (creates the place)
//   2  POST /ptrainings/enrollments/:id/payment-submitted  (manual transfer)
//   3  POST /me/ptrainings/:id/form                        (the event's own
//                                                           formFields)
// Nothing else is posted, and no field is sent that those three do not
// accept. Each step only advances after the server has answered, so the page
// cannot tell someone their place is booked when it is not.

import React from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../store.jsx";
import { apiAuthed } from "../../http.js";
import { API_BASE } from "../../config.js";
import { upcomingTrainings } from "../../lib/upcomingTrainings.js";

const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});
const money = (n) => NGN.format(Number(n) || 0);

const DAY = { weekday: "short", day: "numeric", month: "short", year: "numeric" };
const TIME = { hour: "2-digit", minute: "2-digit" };

function day(d) {
  const t = new Date(d ?? NaN);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString("en-GB", DAY) : "";
}

function clock(d) {
  const t = new Date(d ?? NaN);
  return Number.isFinite(t.getTime()) ? t.toLocaleTimeString("en-GB", TIME) : "";
}

// "Tue 6 Oct 2026, 09:00" for a single day, "Tue 6 Oct 2026 – Fri 9 Oct 2026"
// across days. endAt is required on the model but a stored value Date cannot
// read must not blank the row, so startAt stands in for it.
function when(ev) {
  const a = day(ev?.startAt);
  const b = day(ev?.endAt);
  if (!a) return "–";
  if (!b || b === a) {
    const t = clock(ev?.startAt);
    return t ? `${a}, ${t}` : a;
  }
  return `${a} – ${b}`;
}

function where(ev) {
  const l = ev?.location || {};
  return (
    [l.name, l.address, l.city, l.state].filter(Boolean).join(", ") ||
    "Venue to be confirmed"
  );
}

// The same rule as computePricing() in server/routes/ptrainings.js. If this
// ever disagrees with the server the server wins: once the enrolment exists we
// show its paymentInstructions.amountNGN instead.
function feeOf(ev) {
  const p = ev?.pricing || {};
  const normal = Number(p.normalNGN ?? ev?.priceNGN ?? 0) || 0;
  const groupOf3 = Number(p.groupOf3NGN ?? 0) || 0;
  const ebPrice = Number(p.earlyBird?.priceNGN ?? 0) || 0;
  const ebEndsAt = p.earlyBird?.endsAt ? new Date(p.earlyBird.endsAt) : null;
  const ebActive =
    ebPrice > 0 &&
    ebEndsAt &&
    Number.isFinite(ebEndsAt.getTime()) &&
    Date.now() < ebEndsAt.getTime();
  return {
    normal,
    groupOf3,
    ebPrice,
    ebEndsAt,
    ebActive,
    payable: ebActive ? ebPrice : normal,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// His receipt upload, unchanged: the classic enrolment pages push the image
// straight to Cloudinary with an unsigned preset and send the URL on. If the
// build has no preset the control is not offered at all, rather than offered
// and then failing — the reference field is enough for the team to match a
// transfer.
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";
const CLOUD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UNSIGNED_PRESET_RECEIPT ||
  import.meta.env.VITE_CLOUDINARY_UNSIGNED_UPLOAD_PRESET ||
  "";
const CAN_UPLOAD = !!(CLOUD_NAME && CLOUD_PRESET);

async function uploadReceipt(file) {
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", CLOUD_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: "POST", body },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "The receipt could not be uploaded.");
  if (!data?.secure_url) throw new Error("The receipt uploaded but no address came back.");
  return data.secure_url;
}

const STEPS = ["Your place", "Payment", "Your details", "Confirmed"];

const Tick = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <use href="#i-check" />
  </svg>
);

export default function DsTrainingSignup() {
  // Mounted either under a session (/ptrainings/:key/register) or on its own,
  // where ?event= picks one and anything else offers the open sessions.
  const params = useParams();
  const [search] = useSearchParams();
  const location = useLocation();
  const { user, accessToken } = useAuth();

  const key = String(params.key || search.get("event") || "").trim();
  const signInHref = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  const [event, setEvent] = React.useState(null);
  const [loadFailed, setLoadFailed] = React.useState("");
  const [options, setOptions] = React.useState(null);

  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null); // { kind: "ok" | "err", text }

  // The enrolment the server made, and how far it has got.
  const [enrolment, setEnrolment] = React.useState(null);
  const [settled, setSettled] = React.useState(false); // payment recorded
  const [finished, setFinished] = React.useState(false); // form received

  const [pay, setPay] = React.useState({
    payerName: "",
    bankName: "",
    reference: "",
    note: "",
  });
  const [receiptUrl, setReceiptUrl] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef(null);

  const [form, setForm] = React.useState({});
  const [bad, setBad] = React.useState({});

  React.useEffect(() => {
    const was = typeof document === "undefined" ? "" : document.title;
    if (typeof document !== "undefined") {
      document.title = "Training sign-up | ADLM Studio";
    }
    return () => {
      if (typeof document !== "undefined") document.title = was;
    };
  }, []);

  // One session, by slug or id. Public: the fee, the dates and how many places
  // are left are all readable before anyone signs in.
  React.useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    setEvent(null);
    setLoadFailed("");
    fetch(`${API_BASE}/ptrainings/events/${encodeURIComponent(key)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data;
      })
      .then((ev) => alive && setEvent(ev))
      .catch((e) => alive && setLoadFailed(e.message || "Failed"));
    return () => {
      alive = false;
    };
  }, [key]);

  // No session named: offer the ones still ahead, by the shared rule.
  React.useEffect(() => {
    if (key) return undefined;
    let alive = true;
    fetch(`${API_BASE}/ptrainings/events`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((list) => alive && setOptions(upcomingTrainings(list)))
      .catch(() => alive && setOptions([]));
    return () => {
      alive = false;
    };
  }, [key]);

  // Prefill the fields the account already answers, where the event asks for
  // them by name. Typing your own email again on a page you are signed into is
  // the sort of thing his registration page does not do.
  React.useEffect(() => {
    if (!event || !user) return;
    const fields = Array.isArray(event.formFields) ? event.formFields : [];
    setForm((f) => {
      const next = { ...f };
      for (const fd of fields) {
        if (next[fd.key]) continue;
        const k = `${fd.key} ${fd.label || ""}`.toLowerCase();
        if (fd.type === "email" || /\bemail\b/.test(k)) next[fd.key] = user.email || "";
        else if (/full ?name|\bname\b/.test(k)) next[fd.key] = user.name || "";
        else if (fd.type === "phone" || /phone|whatsapp|mobile/.test(k))
          next[fd.key] = user.phone || "";
      }
      return next;
    });
  }, [event, user]);

  const fee = React.useMemo(() => feeOf(event), [event]);
  const cap = Number(event?.capacityApproved || 14);
  const taken = Number(event?.approvedCount || 0);
  const left = Math.max(cap - taken, 0);
  const closed = !!event && taken >= cap && !enrolment;

  // What the server says is owed, once it has said anything.
  const instructions = enrolment?.paymentInstructions || null;
  const owed = instructions ? Number(instructions.amountNGN || 0) : fee.payable;

  const fields = React.useMemo(
    () => (Array.isArray(event?.formFields) ? event.formFields : []),
    [event],
  );

  const step = !enrolment ? 1 : !settled ? 2 : !finished ? 3 : 4;

  // One place for the failures worth explaining differently.
  const explain = (e, fallback) => {
    if (e?.status === 401) {
      return "Your sign-in has expired. Sign in again — nothing you have entered is lost.";
    }
    if (e?.status === 409) {
      return "This session filled up while this page was open. Nothing has been charged. Ask us about the next date.";
    }
    if (e?.status === 403) {
      return "The server has not recorded your transfer yet, so your details cannot be saved. Submit the transfer above first.";
    }
    return e?.message || fallback;
  };

  // ── 1 · take the place ───────────────────────────────────────────────────
  const takePlace = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const out = await apiAuthed(`/ptrainings/${encodeURIComponent(key)}/enroll`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!out?.enrollmentId) {
        throw new Error("The server did not return an enrolment, so nothing is booked.");
      }
      setEnrolment(out);
      // Free session, or a transfer already submitted on an earlier visit:
      // the server has nothing more to take, so go straight to the details.
      const already =
        !out.manualPayment ||
        out.paymentSubmitted ||
        String(out.paymentState || "").toLowerCase() === "submitted";
      setSettled(already);
      setMsg(
        already
          ? {
              kind: "ok",
              text: "Your place is held. Fill in the details below and it is done.",
            }
          : {
              kind: "ok",
              text: "Your place is held. Transfer the fee below, then tell us you have — it is not confirmed until a transfer is recorded.",
            },
      );
    } catch (e) {
      setMsg({ kind: "err", text: explain(e, "Your place could not be taken: please try again.") });
    } finally {
      setBusy(false);
    }
  };

  // ── 2 · say the transfer has gone ────────────────────────────────────────
  const submitTransfer = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await apiAuthed(`/ptrainings/enrollments/${enrolment.enrollmentId}/payment-submitted`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payerName: pay.payerName.trim(),
          bankName: pay.bankName.trim(),
          reference: pay.reference.trim(),
          note: pay.note.trim(),
          receiptUrl,
        }),
      });
      setSettled(true);
      setMsg({
        kind: "ok",
        text: "Transfer recorded. It is checked by hand, usually the same working day. Your details next.",
      });
    } catch (e) {
      setMsg({
        kind: "err",
        text: explain(e, "That could not be recorded. Nothing is lost — try again, or send us the reference."),
      });
    } finally {
      setBusy(false);
    }
  };

  const pickReceipt = async (file) => {
    if (!file) return;
    setMsg(null);
    setUploading(true);
    try {
      setReceiptUrl(await uploadReceipt(file));
    } catch (e) {
      setMsg({ kind: "err", text: e.message || "The receipt could not be uploaded." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── 3 · the event's own questions ────────────────────────────────────────
  const setField = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setBad((b) => (b[k] ? { ...b, [k]: "" } : b));
  };

  const submitForm = async () => {
    setMsg(null);
    const problems = {};
    for (const f of fields) {
      const v = form[f.key];
      const empty = f.type === "multi" ? !(Array.isArray(v) && v.length) : !String(v ?? "").trim();
      if (f.required && empty) problems[f.key] = "This one is needed.";
      else if (f.type === "email" && !empty && !EMAIL.test(String(v).trim())) {
        problems[f.key] = "That does not look like an email address.";
      }
    }
    if (Object.keys(problems).length) {
      setBad(problems);
      setMsg({
        kind: "err",
        text: "A few answers are missing. They are marked below — nothing has been sent.",
      });
      return;
    }

    setBusy(true);
    try {
      await apiAuthed(`/me/ptrainings/${enrolment.enrollmentId}/form`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setFinished(true);
      setMsg(null);
    } catch (e) {
      setMsg({ kind: "err", text: explain(e, "Your details could not be saved: please try again.") });
    } finally {
      setBusy(false);
    }
  };

  // ── the summary beside the form ──────────────────────────────────────────
  const summary = (
    <aside className="panel">
      <h3>{event?.title || "Training sign-up"}</h3>
      {event?.subtitle ? <p className="ds-sub">{event.subtitle}</p> : null}

      {event ? (
        <>
          <div className="sumrow">
            <span>When</span>
            <b>{when(event)}</b>
          </div>
          <div className="sumrow">
            <span>Where</span>
            <b>{where(event)}</b>
          </div>
          {fee.ebActive ? (
            <>
              <div className="sumrow">
                <span>Standard fee</span>
                <b>{fee.normal ? money(fee.normal) : "Free"}</b>
              </div>
              <div className="sumrow">
                <span>Early bird, until {day(fee.ebEndsAt)}</span>
                <b>{money(fee.ebPrice)}</b>
              </div>
            </>
          ) : null}
          <div className="sumrow">
            <span>Places left</span>
            <b>{left ? `${left} of ${cap}` : "None"}</b>
          </div>
          <div className="sumtot">
            <span>{instructions ? "To transfer" : "Your place"}</span>
            <b>{owed > 0 ? money(owed) : "Free"}</b>
          </div>
          {fee.ebActive ? (
            <p className="small" style={{ marginTop: "10px" }}>
              <span className="pill pill-a">Early bird</span> This page books one place at the
              fee above.
            </p>
          ) : null}
          {fee.groupOf3 > 0 ? (
            <p className="small">
              A group rate of {money(fee.groupOf3)} each is set for three or more. This page
              books one place, so ask us to arrange a group.
            </p>
          ) : null}
          <p className="small">
            Nothing is charged on this page. {owed > 0 ? "You transfer the fee to the account shown once your place is held, and it is checked by hand." : "This session is free."}
          </p>
        </>
      ) : (
        <p className="small">The session details load here.</p>
      )}

      {Array.isArray(event?.whatYouGet) && event.whatYouGet.length ? (
        <>
          <div className="sumrow" style={{ borderBottom: 0, paddingBottom: 0 }}>
            <span>What you get</span>
          </div>
          <p className="trust" style={{ display: "grid", gap: "8px" }}>
            {event.whatYouGet.map((g) => (
              <span key={g}>
                <Tick /> {g}
              </span>
            ))}
          </p>
        </>
      ) : null}

      {Array.isArray(event?.requirements) && event.requirements.length ? (
        <p className="small">
          Bring with you: {event.requirements.join(", ")}.
        </p>
      ) : null}
    </aside>
  );

  // ── the states that are not the form ─────────────────────────────────────
  if (!key) {
    return (
      <section className="sec" id="signup" style={{ paddingTop: 150 }}>
        <div className="shell">
          <div className="sec-head rise">
            <span className="eyebrow">Training sign-up</span>
            <h2>
              Which session are you <span className="grad">joining</span>?
            </h2>
            <p className="ds-lede">
              Pick a session and its sign-up opens here. Every one is a scheduled ADLM training
              with its own dates, fee and places.
            </p>
          </div>
          {options === null ? (
            <p className="ds-lede">Loading the sessions…</p>
          ) : !options.length ? (
            <div className="panel">
              <h3>No sessions are open just now</h3>
              <p className="small">
                Nothing is scheduled at the moment. A firm can book an in-office programme at
                any time, and the calendar lists each session as it opens.
              </p>
              <div className="hero-cta" style={{ justifyContent: "flex-start" }}>
                <Link className="ds-btn btn-p ds-btn-sm" to="/support">
                  Ask about a programme
                </Link>
                <Link className="ds-btn btn-o ds-btn-sm" to="/learn">
                  Browse free lessons
                </Link>
              </div>
            </div>
          ) : (
            <div className="panel">
              {options.map((ev) => {
                const f = feeOf(ev);
                return (
                  <div className="line" key={ev._id} style={{ gridTemplateColumns: "1fr auto" }}>
                    <div>
                      <b>{ev.title}</b>
                      <span>
                        {when(ev)} · {where(ev)}
                      </span>
                    </div>
                    <div className="amt2">
                      {f.payable > 0 ? money(f.payable) : "Free"}
                      <small>
                        <Link to={`/ptrainings/${encodeURIComponent(ev.slug || ev._id)}`}>
                          Read it first
                        </Link>
                      </small>
                    </div>
                  </div>
                );
              })}
              <p className="small">
                Open a session above to read what it covers, then sign up from there.
              </p>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (loadFailed) {
    return (
      <section className="sec" id="signup" style={{ paddingTop: 150 }}>
        <div className="shell">
          <div className="sec-head rise">
            <span className="eyebrow">Training sign-up</span>
            <h2>
              This sign-up could not be <span className="tone">opened</span>
            </h2>
            <p className="ds-lede">
              {loadFailed === "Not found"
                ? "That session is not open for registration. It may have run already, or the link may be out of date."
                : "The session could not be loaded just now. Nothing is wrong with your place — please try again shortly."}
            </p>
          </div>
          <div className="hero-cta" style={{ justifyContent: "flex-start" }}>
            <Link className="ds-btn btn-p" to="/learn/calendar">
              See the training calendar
            </Link>
            <Link className="ds-btn btn-o" to="/support">
              Ask us
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="sec" id="signup" style={{ paddingTop: 150 }}>
      <div className="shell">
        <div className="sec-head rise" style={{ marginBottom: "40px" }}>
          <span className="eyebrow">
            Training sign-up{event?.startAt ? ` · ${day(event.startAt)}` : ""}
          </span>
          <h2>
            {finished ? (
              <>
                You are <span className="grad">on the list</span>
              </>
            ) : closed ? (
              <>
                This session is <span className="tone">full</span>
              </>
            ) : (
              <>
                Take your place on{" "}
                <span className="grad">{event?.title || "this session"}</span>
              </>
            )}
          </h2>
          <p className="ds-lede">
            {finished
              ? "Your place is recorded and your details are with us. Everything below is yours to keep."
              : closed
                ? `All ${cap} places are taken. Nothing has been charged, and the next date is worth asking about.`
                : "Three short steps. Nothing is charged on this page — your place is held, you transfer the fee, and we confirm it by hand."}
          </p>
        </div>

        {closed ? (
          <div className="chk">
            <div className="panel">
              <h3>Ask about the next one</h3>
              <p className="small">
                Places are capped at {cap} so the room stays workable. Tell us you wanted this
                session and we will hold you a place on the next date.
              </p>
              <div className="hero-cta" style={{ justifyContent: "flex-start" }}>
                <Link className="ds-btn btn-p ds-btn-sm" to="/support">
                  Ask about the next date
                </Link>
                <Link className="ds-btn btn-o ds-btn-sm" to="/learn/calendar">
                  See the calendar
                </Link>
              </div>
            </div>
            {summary}
          </div>
        ) : (
          <>
            <div className="flowsteps" aria-label="Where you are in signing up">
              {STEPS.map((label, i) => {
                const n = i + 1;
                return (
                  <React.Fragment key={label}>
                    {i > 0 ? <s /> : null}
                    <div className={step > n ? "done" : step === n ? "on" : ""}>
                      <i>{step > n ? "✓" : n}</i>
                      {label}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            <div className="chk">
              <div>
                {/* ── 1 · your place ─────────────────────────────────────── */}
                {step === 1 ? (
                  <div className="panel">
                    <h3>Your place</h3>
                    <p className="ds-sub">
                      {owed > 0
                        ? `${money(owed)} for one place. Taking it holds you a seat and shows you where to transfer — it charges nothing.`
                        : "This session is free. Taking a place holds you a seat."}
                    </p>

                    {!accessToken ? (
                      <>
                        <p className="small">
                          A place belongs to an account, so the certificate, the recording and
                          any software that comes with the session land in the right one. Signing
                          in brings you straight back to this page. Creating an account does not
                          — come back here afterwards and your place is still open.
                        </p>
                        <div className="hero-cta" style={{ justifyContent: "flex-start" }}>
                          <Link className="ds-btn btn-p" to={signInHref}>
                            Sign in to take your place
                          </Link>
                          <Link className="ds-btn btn-o" to="/signup">
                            Create an account
                          </Link>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bankbox">
                          <div className="bankrow">
                            <span>Name on the place</span>
                            <b>{user?.name || "Your account"}</b>
                          </div>
                          <div className="bankrow">
                            <span>Confirmation goes to</span>
                            <b>{user?.email || "your account email"}</b>
                          </div>
                          <div className="bankrow">
                            <span>Fee</span>
                            <b>{owed > 0 ? money(owed) : "Free"}</b>
                          </div>
                        </div>
                        <p className="small">
                          Not the right details? They come from your account — change them in
                          your profile and they follow you here.
                        </p>
                        {msg ? (
                          <p className={msg.kind === "err" ? "chk-msg is-err" : "chk-msg is-ok"} role="status">
                            {msg.text}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          className="ds-btn btn-p btn-full"
                          style={{ marginTop: "22px" }}
                          disabled={busy || !event}
                          onClick={takePlace}
                        >
                          {busy ? "One moment…" : "Hold my place"}
                        </button>
                        <p className="sform-note">
                          Still nothing charged. The next step shows you where to transfer.
                        </p>
                      </>
                    )}
                  </div>
                ) : null}

                {/* ── 2 · payment ────────────────────────────────────────── */}
                {step === 2 ? (
                  <div className="panel">
                    <h3>Transfer the fee</h3>
                    <p className="ds-sub">
                      Your place is held. Transfer {money(owed)} to the account below, then tell
                      us you have so it can be checked off.
                    </p>

                    {instructions ? (
                      <div className="bankbox">
                        <div className="bankrow">
                          <span>Bank</span>
                          <b>{instructions.bankName}</b>
                        </div>
                        <div className="bankrow">
                          <span>Account name</span>
                          <b>{instructions.accountName}</b>
                        </div>
                        <div className="bankrow">
                          <span>Account number</span>
                          <b>{instructions.accountNumber}</b>
                        </div>
                        <div className="bankrow">
                          <span>Amount</span>
                          <b>{money(owed)}</b>
                        </div>
                        <div className="bankrow">
                          <span>Quote this reference</span>
                          <b>{String(enrolment.enrollmentId).slice(-8).toUpperCase()}</b>
                        </div>
                      </div>
                    ) : (
                      <p className="small">
                        The account to transfer to has not come back from the server. Please
                        refresh this page rather than guessing — do not send money to an account
                        you were not shown here.
                      </p>
                    )}

                    {instructions?.note ? <p className="small">{instructions.note}</p> : null}

                    <div className="two-up" style={{ marginTop: "22px" }}>
                      <div className="ds-field">
                        <label htmlFor="ts-payer">
                          Name the transfer was sent from <span className="opt">optional</span>
                        </label>
                        <input
                          id="ts-payer"
                          type="text"
                          autoComplete="name"
                          value={pay.payerName}
                          placeholder="If it is not your own name"
                          onChange={(e) => setPay({ ...pay, payerName: e.target.value })}
                        />
                      </div>
                      <div className="ds-field">
                        <label htmlFor="ts-bank">
                          Bank you sent it from <span className="opt">optional</span>
                        </label>
                        <input
                          id="ts-bank"
                          type="text"
                          value={pay.bankName}
                          placeholder="GTBank, Zenith, Kuda…"
                          onChange={(e) => setPay({ ...pay, bankName: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="ds-field">
                      <label htmlFor="ts-ref">
                        Your bank&apos;s reference for it <span className="opt">optional</span>
                      </label>
                      <input
                        id="ts-ref"
                        type="text"
                        value={pay.reference}
                        placeholder="Whatever your bank put on the transfer"
                        onChange={(e) => setPay({ ...pay, reference: e.target.value })}
                      />
                      <span className="hint">
                        It is how a transfer gets matched to your place without anyone having to
                        ask you for it.
                      </span>
                    </div>

                    <div className="ds-field">
                      <label htmlFor="ts-note">
                        Anything we should know <span className="opt">optional</span>
                      </label>
                      <textarea
                        id="ts-note"
                        rows={3}
                        value={pay.note}
                        placeholder="e.g. paid for two of us, the second name is…"
                        onChange={(e) => setPay({ ...pay, note: e.target.value })}
                      />
                    </div>

                    {CAN_UPLOAD ? (
                      <div className="chk-receipt">
                        <label className="ds-btn btn-o ds-btn-sm" htmlFor="ts-receipt">
                          {uploading
                            ? "Uploading…"
                            : receiptUrl
                              ? "Attach a different receipt"
                              : "Attach your receipt"}
                        </label>
                        <input
                          id="ts-receipt"
                          ref={fileRef}
                          type="file"
                          accept="image/*"
                          hidden
                          disabled={uploading}
                          onChange={(e) => pickReceipt(e.target.files?.[0])}
                        />
                        <span className="small">
                          {receiptUrl ? (
                            <a href={receiptUrl} target="_blank" rel="noreferrer">
                              Receipt attached, view it
                            </a>
                          ) : (
                            "A photo or screenshot. Optional, but it gets checked off faster."
                          )}
                        </span>
                      </div>
                    ) : null}

                    {msg ? (
                      <p className={msg.kind === "err" ? "chk-msg is-err" : "chk-msg is-ok"} role="status">
                        {msg.text}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      className="ds-btn btn-p btn-full"
                      style={{ marginTop: "22px" }}
                      disabled={busy || uploading}
                      onClick={submitTransfer}
                    >
                      {busy ? "Recording…" : "I have transferred it"}
                    </button>
                    <p className="sform-note">
                      This tells us to look for your transfer. It does not confirm it — a person
                      does that, usually the same working day.
                    </p>
                  </div>
                ) : null}

                {/* ── 3 · your details ──────────────────────────────────── */}
                {step === 3 ? (
                  <div className="panel">
                    <h3>Your details</h3>
                    <p className="ds-sub">
                      {fields.length
                        ? "What the trainers need to set the room up for you. It takes a minute."
                        : "Nothing else is needed for this session. Finish and your place is recorded."}
                    </p>

                    {fields.length ? (
                      <div className="two-up">
                        {fields.map((f) => {
                          const v = form[f.key] ?? (f.type === "multi" ? [] : "");
                          const wrong = bad[f.key];
                          const wide = f.type === "paragraph" || f.type === "multi";
                          const label = (
                            <label htmlFor={`ts-f-${f.key}`}>
                              {f.label}
                              {f.required ? null : <span className="opt"> optional</span>}
                            </label>
                          );
                          const edge = wrong ? { borderColor: "var(--accent)" } : undefined;

                          return (
                            <div
                              className="ds-field"
                              key={f.key}
                              style={wide ? { gridColumn: "1 / -1" } : undefined}
                            >
                              {label}

                              {f.type === "paragraph" ? (
                                <textarea
                                  id={`ts-f-${f.key}`}
                                  rows={4}
                                  style={edge}
                                  placeholder={f.placeholder || ""}
                                  value={String(v)}
                                  aria-invalid={wrong ? "true" : undefined}
                                  onChange={(e) => setField(f.key, e.target.value)}
                                />
                              ) : f.type === "select" ? (
                                <select
                                  id={`ts-f-${f.key}`}
                                  style={edge}
                                  value={String(v)}
                                  aria-invalid={wrong ? "true" : undefined}
                                  onChange={(e) => setField(f.key, e.target.value)}
                                >
                                  <option value="">Select one</option>
                                  {(f.options || []).map((o) => (
                                    <option key={o} value={o}>
                                      {o}
                                    </option>
                                  ))}
                                </select>
                              ) : f.type === "multi" ? (
                                <div
                                  style={{
                                    border: `1px solid ${wrong ? "var(--accent)" : "var(--line-2)"}`,
                                    borderRadius: "10px",
                                    padding: "12px 14px",
                                    background: "var(--bg)",
                                  }}
                                >
                                  {(f.options || []).map((o) => {
                                    const arr = Array.isArray(v) ? v : [];
                                    return (
                                      <label
                                        key={o}
                                        style={{
                                          display: "flex",
                                          gap: "10px",
                                          alignItems: "flex-start",
                                          marginBottom: "8px",
                                          fontSize: "13.5px",
                                          fontWeight: 300,
                                          color: "var(--ink-2)",
                                          cursor: "pointer",
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={arr.includes(o)}
                                          style={{
                                            width: "15px",
                                            height: "15px",
                                            flex: "none",
                                            marginTop: "2px",
                                            accentColor: "var(--action)",
                                          }}
                                          onChange={(e) =>
                                            setField(
                                              f.key,
                                              e.target.checked
                                                ? [...arr, o]
                                                : arr.filter((x) => x !== o),
                                            )
                                          }
                                        />
                                        <span>{o}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : (
                                <input
                                  id={`ts-f-${f.key}`}
                                  type={
                                    f.type === "email"
                                      ? "email"
                                      : f.type === "date"
                                        ? "date"
                                        : f.type === "phone"
                                          ? "tel"
                                          : "text"
                                  }
                                  style={edge}
                                  placeholder={f.placeholder || ""}
                                  value={String(v)}
                                  aria-invalid={wrong ? "true" : undefined}
                                  onChange={(e) => setField(f.key, e.target.value)}
                                />
                              )}

                              {wrong ? (
                                <span className="hint" style={{ color: "var(--accent)" }}>
                                  {wrong}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    <p className="small">
                      These answers go to the trainers for this session only. What we do with
                      them is in the <Link to="/privacy">privacy notice</Link>.
                    </p>

                    {msg ? (
                      <p className={msg.kind === "err" ? "chk-msg is-err" : "chk-msg is-ok"} role="status">
                        {msg.text}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      className="ds-btn btn-p btn-full"
                      style={{ marginTop: "22px" }}
                      disabled={busy}
                      onClick={submitForm}
                    >
                      {busy ? "Sending…" : fields.length ? "Send my details" : "Finish signing up"}
                    </button>
                  </div>
                ) : null}

                {/* ── 4 · confirmed ─────────────────────────────────────── */}
                {step === 4 ? (
                  <div className="panel">
                    <h3>That is everything</h3>
                    <p className="ds-sub">
                      Your place on {event?.title} is recorded and your details are with the
                      trainers.
                    </p>
                    <p className="trust" style={{ display: "grid", gap: "8px" }}>
                      <span>
                        <Tick /> Place held for {when(event)}
                      </span>
                      <span>
                        <Tick /> {owed > 0 ? "Transfer recorded, being checked by hand" : "Nothing to pay"}
                      </span>
                      <span>
                        <Tick /> Details received
                      </span>
                    </p>
                    <p className="small">
                      Confirmation goes to {user?.email || "your account email"}. Your enrolment
                      page carries the joining instructions, the calendar reminder and the
                      install checklist as they are added — and it is where the team's
                      confirmation of your transfer will show.
                    </p>
                    <div className="hero-cta" style={{ justifyContent: "flex-start" }}>
                      <Link
                        className="ds-btn btn-p"
                        to={`/ptrainings/enrollment/${enrolment.enrollmentId}`}
                      >
                        Open my enrolment
                      </Link>
                      <Link className="ds-btn btn-o" to="/manage">
                        Go to my dashboard
                      </Link>
                    </div>
                    <p className="sform-note">
                      Reference {String(enrolment.enrollmentId).slice(-8).toUpperCase()} · quote
                      it if you write to us.
                    </p>
                  </div>
                ) : null}
              </div>

              {summary}
            </div>
          </>
        )}

        <p className="small" style={{ marginTop: "26px" }}>
          <Link to={`/ptrainings/${encodeURIComponent(key)}`}>
            Read what this session covers
          </Link>{" "}
          · <Link to="/learn/calendar">every scheduled session</Link> ·{" "}
          <Link to="/support">ask us a question</Link>
        </p>
      </div>
    </section>
  );
}
