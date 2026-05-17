// src/components/ProposalPreview.jsx
// Pixel-faithful render of the ADLM Digital Transformation Proposal template,
// driven by live proposal data. Shared by AdminProposals and PublicProposal.
import React from "react";
import dayjs from "dayjs";

/* The proposal template's CSS, scoped under .adlm-proposal so it cannot leak
   into the rest of the app. Print rules hide the app chrome so only the
   proposal prints. */
const PROPOSAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700;800&display=swap');

.adlm-proposal{
  --navy:#0D2240; --blue:#1E6BCC; --orange:#F07020; --sky:#40B0E0;
  --ink:#0D2240; --muted:#5b6b80; --line:#e3e8ef; --paper:#ffffff; --wash:#f6f8fb;
  font-family:'Lexend',sans-serif;color:var(--ink);line-height:1.6;font-weight:400;
  background:#eef1f5;padding:1px 0;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.adlm-proposal *{box-sizing:border-box;margin:0;padding:0}
.adlm-proposal .page{width:210mm;min-height:297mm;margin:18px auto;background:var(--paper);
  box-shadow:0 10px 40px rgba(13,34,64,.14);position:relative;overflow:hidden}
.adlm-proposal .pad{padding:22mm 20mm}

.adlm-proposal .mark{display:flex;align-items:center;gap:12px}
.adlm-proposal .glyph{width:44px;height:44px;border-radius:11px;background:var(--navy);position:relative;flex:0 0 auto}
.adlm-proposal .glyph::before{content:"";position:absolute;left:9px;bottom:9px;width:13px;height:20px;background:var(--sky)}
.adlm-proposal .glyph::after{content:"";position:absolute;right:8px;bottom:9px;width:8px;height:26px;
  background:#fff;clip-path:polygon(0 35%,55% 35%,55% 0,100% 0,100% 100%,0 100%)}
.adlm-proposal .word{font-weight:800;font-size:25px;letter-spacing:-.5px;line-height:1}
.adlm-proposal .word .a{color:var(--navy)} .adlm-proposal .word .s{color:var(--orange)}
.adlm-proposal .word small{display:block;font-weight:500;font-size:9.5px;letter-spacing:3px;color:var(--muted);margin-top:3px}

.adlm-proposal .cover{background:var(--navy);color:#fff;padding:20mm 20mm 16mm}
.adlm-proposal .cover .word .a{color:#fff}
.adlm-proposal .cover .glyph{background:#fff}
.adlm-proposal .cover .glyph::before{background:var(--sky)}
.adlm-proposal .cover .glyph::after{background:var(--navy)}
.adlm-proposal .kicker{display:inline-block;margin-top:34px;font-size:11px;font-weight:600;letter-spacing:3.5px;
  color:var(--sky);text-transform:uppercase}
.adlm-proposal h1{font-size:40px;font-weight:800;line-height:1.12;letter-spacing:-1px;margin:14px 0 8px}
.adlm-proposal h1 .accent{color:var(--orange)}
.adlm-proposal .cover .lede{color:#aebfd6;font-size:15px;max-width:135mm;margin-top:6px}
.adlm-proposal .client-card{margin-top:30px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);
  border-radius:14px;padding:20px 22px;display:grid;grid-template-columns:1fr 1fr;gap:14px 28px}
.adlm-proposal .client-card .lbl{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--sky);font-weight:600}
.adlm-proposal .client-card .val{font-size:15px;font-weight:600;margin-top:3px;color:#fff}
.adlm-proposal .cover-foot{margin-top:26px;display:flex;justify-content:space-between;font-size:11.5px;color:#8fa4c4;
  border-top:1px solid rgba(255,255,255,.13);padding-top:14px}

.adlm-proposal h2{font-size:21px;font-weight:700;letter-spacing:-.4px;margin:0 0 4px;color:var(--navy);
  display:flex;align-items:center;gap:11px}
.adlm-proposal h2::before{content:"";width:7px;height:24px;background:var(--orange);border-radius:2px;flex:0 0 auto}
.adlm-proposal .sec-k{font-size:10.5px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--blue);margin-bottom:18px}
.adlm-proposal h3{font-size:14px;font-weight:700;color:var(--navy);margin:0 0 4px}
.adlm-proposal p{font-size:13px;color:#33445c;margin-bottom:11px}
.adlm-proposal .lead{font-size:14.5px;color:var(--navy);font-weight:500}
.adlm-proposal section{margin-bottom:30px}
.adlm-proposal .section-block{page-break-inside:avoid}

.adlm-proposal .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.adlm-proposal .card{border:1px solid var(--line);border-radius:12px;padding:16px 17px;background:var(--wash)}
.adlm-proposal .card .n{font-size:12px;font-weight:800;color:var(--orange);letter-spacing:1px}
.adlm-proposal .card p{font-size:12px;margin:5px 0 0;color:var(--muted)}

.adlm-proposal table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
.adlm-proposal th{background:var(--navy);color:#fff;text-align:left;padding:11px 13px;font-weight:600;font-size:11px;
  letter-spacing:.4px}
.adlm-proposal th:last-child,.adlm-proposal td:last-child{text-align:right}
.adlm-proposal td{padding:11px 13px;border-bottom:1px solid var(--line);color:#33445c;vertical-align:top}
.adlm-proposal tr:nth-child(even) td{background:#fafbfd}
.adlm-proposal td strong{color:var(--navy)}

.adlm-proposal .tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}
.adlm-proposal .tier{border:1px solid var(--line);border-radius:14px;padding:18px 16px;background:#fff}
.adlm-proposal .tier.feature{border:1.5px solid var(--orange);background:linear-gradient(180deg,#fff,#fff7f1)}
.adlm-proposal .tier .tname{font-size:13px;font-weight:800;color:var(--navy);letter-spacing:.3px}
.adlm-proposal .tier .tfor{font-size:10.5px;color:var(--muted);margin:3px 0 12px}
.adlm-proposal .tier .tprice{font-size:22px;font-weight:800;color:var(--blue)}
.adlm-proposal .tier.feature .tprice{color:var(--orange)}
.adlm-proposal .tier .tprice small{font-size:11px;font-weight:500;color:var(--muted)}
.adlm-proposal .tier ul{list-style:none;margin-top:13px;font-size:11px;color:#445}
.adlm-proposal .tier li{padding:5px 0 5px 18px;position:relative}
.adlm-proposal .tier li::before{content:"";position:absolute;left:0;top:10px;width:7px;height:7px;border-radius:50%;background:var(--sky)}
.adlm-proposal .badge{display:inline-block;background:var(--orange);color:#fff;font-size:9px;font-weight:700;
  letter-spacing:1.5px;padding:3px 9px;border-radius:20px;margin-bottom:9px}

.adlm-proposal .road{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;counter-reset:s}
.adlm-proposal .step{position:relative;padding:14px 11px;border:1px solid var(--line);border-radius:11px;background:var(--wash)}
.adlm-proposal .step::before{counter-increment:s;content:counter(s);display:flex;align-items:center;justify-content:center;
  width:24px;height:24px;border-radius:50%;background:var(--navy);color:#fff;font-size:12px;font-weight:700;margin-bottom:8px}
.adlm-proposal .step h3{font-size:11.5px}
.adlm-proposal .step p{font-size:10.5px;color:var(--muted);margin:0}

.adlm-proposal .train{margin-top:14px;border:1px solid var(--line);border-left:4px solid var(--sky);
  border-radius:12px;padding:15px 17px;background:var(--wash)}
.adlm-proposal .train .n{font-size:12px;font-weight:800;color:var(--blue);letter-spacing:1px}
.adlm-proposal .train p{font-size:12px;margin:5px 0 0;color:var(--muted)}

.adlm-proposal .inv-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px 28px;margin:14px 0 18px;font-size:12px}
.adlm-proposal .inv-meta .lbl{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);font-weight:600}
.adlm-proposal .inv-meta .val{font-weight:600;color:var(--navy);margin-top:2px}
.adlm-proposal .totals{margin-top:0}
.adlm-proposal .totals td{border:none;padding:7px 13px;font-size:13px}
.adlm-proposal .totals tr:last-child td{background:var(--navy);color:#fff;font-weight:800;font-size:15px;
  border-radius:0 0 8px 8px}
.adlm-proposal .totals tr:last-child td:first-child{border-radius:0 0 0 8px}
.adlm-proposal .totals tr:nth-child(even) td{background:transparent}
.adlm-proposal .paybox{margin-top:16px;border:1px dashed var(--blue);border-radius:11px;padding:14px 16px;
  background:#f2f7fd;font-size:12px}
.adlm-proposal .paybox b{color:var(--navy)}
.adlm-proposal .notebox{margin-top:14px;font-size:12px;color:var(--muted)}
.adlm-proposal .notebox b{color:var(--navy)}

.adlm-proposal .accept{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:18px}
.adlm-proposal .sign{border-top:1.5px solid var(--navy);padding-top:8px;font-size:11px;color:var(--muted);margin-top:46px}

.adlm-proposal footer{background:var(--navy);color:#9fb3d0;padding:18px 20mm;font-size:11px;
  display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
.adlm-proposal footer b{color:#fff}
.adlm-proposal footer .s{color:var(--orange);font-weight:700}

@page{size:A4;margin:0}
@media print{
  body{background:#fff !important}
  body * { visibility:hidden !important; }
  .adlm-proposal, .adlm-proposal * { visibility:visible !important; }
  .adlm-proposal{position:absolute;left:0;top:0;width:100%;background:#fff;padding:0}
  .adlm-proposal .page{margin:0;box-shadow:none;width:auto;min-height:auto}
  .adlm-proposal section{page-break-inside:avoid}
}
`;

const clamp = (n) => Math.min(Math.max(Number(n || 0), 0), 100);
const round2 = (x) =>
  Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;

function ADLMMark() {
  return (
    <div className="mark">
      <div className="glyph" />
      <div className="word">
        <span className="a">ADLM</span> <span className="s">Studio</span>
        <small>ACADEMY FOR DIGITAL LEARNING &amp; MASTERY</small>
      </div>
    </div>
  );
}

/**
 * Renders the 5-page proposal.
 * Props:
 *   proposal   – proposal data (form state or a saved/public proposal)
 *   previewRef – optional ref attached to the .adlm-proposal wrapper (for PDF capture)
 */
export default function ProposalPreview({ proposal = {}, previewRef }) {
  const currency = proposal.currency === "USD" ? "USD" : "NGN";
  const sym = currency === "USD" ? "$" : "₦";
  const fmt = (n) => `${sym}${Number(n || 0).toLocaleString()}`;
  const fmtDate = (d) =>
    d && dayjs(d).isValid() ? dayjs(d).format("MMMM D, YYYY") : "—";

  const firm = proposal.clientFirm || "{ Client Firm }";
  const items = Array.isArray(proposal.items) ? proposal.items : [];
  const suite = Array.isArray(proposal.suite) ? proposal.suite : [];
  const tiers = Array.isArray(proposal.tiers) ? proposal.tiers : [];

  // totals (always derived so form-preview and saved proposals agree)
  const subtotal = items.reduce((s, it) => s + Number(it.total || 0), 0);
  const discPct = clamp(proposal.discountPercent);
  const taxPct = clamp(proposal.taxPercent);
  const discountAmount = round2((subtotal * discPct) / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = round2((afterDiscount * taxPct) / 100);
  const total = Math.max(afterDiscount + taxAmount, 0);

  // executive summary → paragraphs (first is the lead paragraph)
  const execParas = String(proposal.execSummary || "")
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // physical-training price range line
  const tr = proposal.trainingRange || {};
  const minV = currency === "USD" ? tr.minUSD : tr.minNGN;
  const maxV = currency === "USD" ? tr.maxUSD : tr.maxNGN;
  let trainingLine;
  if (Number(minV) > 0 && Number(maxV) > 0) {
    trainingLine =
      Number(minV) === Number(maxV)
        ? `Hands-on training and BIM software installation are delivered at our regional centres at ${fmt(minV)} per location.`
        : `Hands-on training and BIM software installation are delivered at our regional centres; per-location investment ranges from ${fmt(minV)} to ${fmt(maxV)}${tr.locationsCount ? ` across ${tr.locationsCount} training location${tr.locationsCount === 1 ? "" : "s"}` : ""}.`;
  } else {
    trainingLine =
      "Hands-on training and BIM software installation are delivered at ADLM regional centres; per-location pricing is confirmed on scheduling.";
  }

  return (
    <div className="adlm-proposal" ref={previewRef}>
      <style>{PROPOSAL_CSS}</style>

      {/* ============ PAGE 1 — COVER ============ */}
      <div className="page">
        <div className="cover">
          <ADLMMark />
          <div className="kicker">QS &amp; BIM Digital Transformation</div>
          <h1>
            Transforming How <span className="accent">{firm}</span>
            <br />
            Delivers Quantity Surveying
          </h1>
          <p className="lede">
            A proposal to move your QS team from manual practice to a
            standardised, always-current digital workflow — powered by ADLM's
            QS software suite, training, and ongoing support.
          </p>

          <div className="client-card">
            <div>
              <div className="lbl">Prepared For</div>
              <div className="val">{firm}</div>
            </div>
            <div>
              <div className="lbl">Attention</div>
              <div className="val">
                {[proposal.clientContact, proposal.clientTitle]
                  .filter(Boolean)
                  .join(" — ") || "—"}
              </div>
            </div>
            <div>
              <div className="lbl">Prepared By</div>
              <div className="val">
                {proposal.preparedBy ||
                  "Adedolapo Quasim · Founder, ADLM Studio"}
              </div>
            </div>
            <div>
              <div className="lbl">Proposal No.</div>
              <div className="val">
                {(proposal.proposalNumber || "Draft") +
                  "  ·  " +
                  fmtDate(proposal.proposalDate)}
              </div>
            </div>
          </div>

          <div className="cover-foot">
            <span>
              Academy for Digital Learning &amp; Mastery Studios &nbsp;·&nbsp;
              RC 7440343
            </span>
            <span>Lagos, Nigeria &nbsp;·&nbsp; adlmstudio.net</span>
          </div>
        </div>
      </div>

      {/* ============ PAGE 2 — SUMMARY + WHO + CHALLENGE ============ */}
      <div className="page">
        <div className="pad">
          <section className="section-block">
            <div className="sec-k">01 — Executive Summary</div>
            <h2>Why this matters now</h2>
            {execParas.length ? (
              execParas.map((para, i) => (
                <p key={i} className={i === 0 ? "lead" : undefined}>
                  {para}
                </p>
              ))
            ) : (
              <p className="lead">
                ADLM Studio proposes a single annual partnership that takes
                {" "}
                {firm}'s entire quantity surveying function digital and keeps
                it there.
              </p>
            )}
          </section>

          <section className="section-block">
            <div className="sec-k">02 — Who We Are</div>
            <h2>ADLM Studio</h2>
            <p>
              ADLM Studio (Academy for Digital Learning &amp; Mastery Studios,
              RC 7440343) is a Nigerian ConTech and BIM company building
              proprietary quantity surveying and BIM software for the African
              AEC market. We bridge the gap between traditional construction
              practice and digital project delivery — through software
              engineered around Nigerian QS standards (BESMM 4R, NRM, CESMM4),
              and hands-on training trusted by leading construction firms,
              consultancies and institutions including NIQS and the Young QS
              Forum.
            </p>
            <div className="grid2" style={{ marginTop: 6 }}>
              <div className="card">
                <div className="n">BUILT FOR NIGERIA</div>
                <p>
                  Software aligned to BESMM 4R / NRM / CESMM4 — not adapted
                  foreign tools.
                </p>
              </div>
              <div className="card">
                <div className="n">PROVEN DELIVERY</div>
                <p>
                  Active deployments and training programmes across Nigerian
                  construction firms.
                </p>
              </div>
            </div>
          </section>

          <section className="section-block">
            <div className="sec-k">03 — The Challenge</div>
            <h2>What manual QS practice costs a firm</h2>
            <div className="grid2">
              <div className="card">
                <div className="n">SLOW TENDERS</div>
                <p>
                  Manual take-offs and BOQ preparation stretch tender
                  turnaround from days into weeks.
                </p>
              </div>
              <div className="card">
                <div className="n">INCONSISTENT OUTPUT</div>
                <p>
                  Every QS works differently — no firm-wide standard, formats
                  or rate basis.
                </p>
              </div>
              <div className="card">
                <div className="n">PRICING RISK</div>
                <p>
                  Rates fall out of date in months; one mispriced tender can
                  erase a project's margin.
                </p>
              </div>
              <div className="card">
                <div className="n">KEY-PERSON RISK</div>
                <p>
                  Knowledge lives in individuals, not systems — exposure when
                  staff turn over.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ============ PAGE 3 — SOLUTION + SUITE + TRAINING ============ */}
      <div className="page">
        <div className="pad">
          <section className="section-block">
            <div className="sec-k">04 — The ADLM Solution</div>
            <h2>One integrated QS digital backbone</h2>
            <p>
              Our software suite shares a single live rate engine, so every
              take-off across your firm prices from the same, continuously
              updated basis.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>What it does</th>
                  <th>Platform</th>
                  <th>List (per seat / yr)</th>
                </tr>
              </thead>
              <tbody>
                {suite.length ? (
                  suite.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <strong>{row.name || "—"}</strong>
                      </td>
                      <td>{row.whatItDoes || "—"}</td>
                      <td>{row.platform || "—"}</td>
                      <td>{row.listPrice || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--muted)" }}>
                      Select products to include the ADLM software suite.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="train">
              <div className="n">PHYSICAL TRAINING &amp; ON-SITE DEPLOYMENT</div>
              <p>{trainingLine}</p>
            </div>
          </section>

          <section className="section-block">
            <div className="sec-k">05 — Implementation</div>
            <h2>How the transformation runs</h2>
            <div className="road">
              <div className="step">
                <h3>Audit</h3>
                <p>Review current QS workflow &amp; standards</p>
              </div>
              <div className="step">
                <h3>Deploy</h3>
                <p>Licensed seats &amp; cloud setup across the team</p>
              </div>
              <div className="step">
                <h3>Train</h3>
                <p>Hands-on onboarding for every QS</p>
              </div>
              <div className="step">
                <h3>Standardise</h3>
                <p>Firm templates, rate basis &amp; BOQ formats</p>
              </div>
              <div className="step">
                <h3>Sustain</h3>
                <p>Support, quarterly rates, annual refresh</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ============ PAGE 4 — PROGRAMME TIERS ============ */}
      <div className="page">
        <div className="pad">
          <section>
            <div className="sec-k">06 — The Transformation Programme</div>
            <h2>Annual partnership tiers</h2>
            <p>
              Every tier is a single annual programme — software seats, team
              training and new-staff onboarding, the firm standardisation
              layer, priority support, and quarterly market-rate updates.
            </p>
            <div className="tiers" style={{ marginTop: 14 }}>
              {(tiers.length ? tiers : [{}, {}, {}]).slice(0, 3).map((t, i) => {
                const [price, per] = String(t.price || "").split("/");
                return (
                  <div
                    key={i}
                    className={t.recommended ? "tier feature" : "tier"}
                  >
                    {t.recommended && (
                      <div className="badge">RECOMMENDED</div>
                    )}
                    <div className="tname">
                      {(t.name || "—").toUpperCase()}
                    </div>
                    <div className="tfor">{t.audience || ""}</div>
                    <div className="tprice">
                      {price ? price.trim() : "—"}
                      {per ? <small> / {per.trim()}</small> : null}
                    </div>
                    <ul>
                      {(t.features || []).map((f, j) => (
                        <li key={j}>{f}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p
              style={{
                fontSize: 11,
                color: "var(--muted)",
                marginTop: 14,
              }}
            >
              Programmes may be invoiced annually or quarterly by agreement.
              Tier and seat count confirmed after the workflow audit.
            </p>
          </section>
        </div>
      </div>

      {/* ============ PAGE 5 — QUOTATION ============ */}
      <div className="page">
        <div className="pad">
          <section>
            <div className="sec-k">07 — Investment &amp; Quotation</div>
            <h2>Quotation</h2>

            <div className="inv-meta">
              <div>
                <div className="lbl">Billed To</div>
                <div className="val">{firm}</div>
              </div>
              <div>
                <div className="lbl">Proposal No.</div>
                <div className="val">{proposal.proposalNumber || "Draft"}</div>
              </div>
              <div>
                <div className="lbl">Date Issued</div>
                <div className="val">{fmtDate(proposal.proposalDate)}</div>
              </div>
              <div>
                <div className="lbl">Valid Until</div>
                <div className="val">{fmtDate(proposal.validUntil)}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Term</th>
                  <th>Qty</th>
                  <th>Amount ({currency})</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((it, i) => (
                    <tr key={i}>
                      <td>
                        <strong>{it.description || "—"}</strong>
                      </td>
                      <td>{it.term || "—"}</td>
                      <td>{it.qty || 1}</td>
                      <td>{fmt(it.total)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--muted)" }}>
                      Add line items to build the quotation.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <table
              className="totals"
              style={{ width: "55%", marginLeft: "45%" }}
            >
              <tbody>
                <tr>
                  <td>Subtotal</td>
                  <td>{fmt(subtotal)}</td>
                </tr>
                {discPct > 0 && (
                  <tr>
                    <td>Discount ({discPct}%)</td>
                    <td>- {fmt(discountAmount)}</td>
                  </tr>
                )}
                {taxPct > 0 && (
                  <tr>
                    <td>VAT ({taxPct}%)</td>
                    <td>{fmt(taxAmount)}</td>
                  </tr>
                )}
                <tr>
                  <td>Total Due</td>
                  <td>{fmt(total)}</td>
                </tr>
              </tbody>
            </table>

            <div className="paybox">
              <b>Payment</b> — Bank transfer to: <b>ADLM STUDIO</b> · Access
              Bank · <b>1634998770</b>
              <br />
              Please use{" "}
              <b>{proposal.proposalNumber || "the proposal number"}</b> as the
              payment reference. A formal receipt is issued on confirmation.
            </div>

            {proposal.notes && proposal.notes.trim() ? (
              <div className="notebox">
                <b>Notes</b>
                <br />
                {proposal.notes}
              </div>
            ) : null}

            <div className="sec-k" style={{ marginTop: 30 }}>
              08 — Acceptance &amp; Next Steps
            </div>
            <h2>To proceed</h2>
            <p>
              On acceptance we schedule the workflow audit within five working
              days, confirm the final tier and seat count, issue the formal
              invoice, and begin deployment and training the same week.
            </p>
            <div className="accept">
              <div>
                <div className="sign">
                  Authorised for {firm} — name, signature &amp; date
                </div>
              </div>
              <div>
                <div className="sign">
                  {proposal.preparedBy ||
                    "Adedolapo Quasim — Founder, ADLM Studio"}
                </div>
              </div>
            </div>

            {proposal.terms && proposal.terms.trim() ? (
              <p
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  marginTop: 22,
                }}
              >
                {proposal.terms}
              </p>
            ) : null}
          </section>
        </div>

        <footer>
          <span>
            <b>ADLM Studio</b> · Academy for Digital Learning &amp; Mastery
            Studios · RC 7440343
          </span>
          <span>
            adlmstudio.net · Lagos, Nigeria · <span className="s">Studio</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
