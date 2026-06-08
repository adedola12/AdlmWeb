import React from "react";
import dayjs from "dayjs";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { API_BASE } from "../config";
import ProposalPreview from "../components/ProposalPreview.jsx";
import { downloadProposalPdf } from "../lib/proposalPdf.js";

const fmt = (n, currency = "NGN") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    n || 0,
  );

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
};

const CATEGORIES = ["Lead", "Client", "Partner", "University", "NIQS", "Trainer"];

// Fallback tiers — used only if the catalog endpoint fails to load.
const FALLBACK_TIERS = [
  {
    name: "Starter",
    audience: "Small QS teams · ~5–10 surveyors",
    price: "₦1.5M / year",
    features: [
      "Core suite seats (HERON + RateGen)",
      "Team onboarding training",
      "Standard BOQ templates",
      "Email & remote support",
      "Quarterly rate updates",
    ],
    recommended: false,
  },
  {
    name: "Growth",
    audience: "Established firms · ~10–25 surveyors",
    price: "₦3M / year",
    features: [
      "Full suite (QUIV + HERON + MEP + RateGen)",
      "Onboarding + annual refresh + new-staff training",
      "Firm-wide standardisation layer",
      "Priority support with SLA",
      "Quarterly rate updates",
    ],
    recommended: true,
  },
  {
    name: "Enterprise",
    audience: "Large firms / multi-office · 25+ surveyors",
    price: "₦5M+ / year",
    features: [
      "Unlimited-team suite deployment",
      "Bespoke training calendar",
      "Custom standards & rate libraries",
      "Dedicated account support",
      "Roadmap input & early access",
    ],
    recommended: false,
  },
];

function guessPlatform(name = "") {
  const n = String(name).toLowerCase();
  if (n.includes("revit") || n.includes("quiv") || n.includes("mep"))
    return "Autodesk Revit";
  if (n.includes("planswift") || n.includes("heron")) return "PlanSwift";
  if (n.includes("civil")) return "Autodesk Civil 3D";
  if (n.includes("rate")) return "Desktop";
  return "";
}

function formatYearly(p, currency = "NGN") {
  const yr =
    currency === "USD"
      ? Number(p.price?.yearlyUSD || 0) ||
        Number(p.price?.monthlyUSD || 0) * 12
      : Number(p.price?.yearlyNGN || 0) ||
        Number(p.price?.monthlyNGN || 0) * 12;
  if (!yr) return "";
  return `${currency === "USD" ? "$" : "₦"}${Number(yr).toLocaleString()}`;
}

// Parse a tier price string ("₦1.5M / year", "₦5M+ / year") into a number.
function parseTierPrice(s) {
  const str = String(s || "");
  const m = str.match(/([\d.]+)\s*M/i);
  if (m) return Math.round(parseFloat(m[1]) * 1_000_000);
  const k = str.match(/([\d.]+)\s*K/i);
  if (k) return Math.round(parseFloat(k[1]) * 1_000);
  const digits = str.replace(/[^\d.]/g, "");
  return digits ? Math.round(parseFloat(digits)) : 0;
}

const DEFAULT_EXEC_SUMMARY =
  "Across the Nigerian built environment, an estimated 95% of QS and construction practice is still carried out manually. The firms that move first to a structured digital workflow win on tender speed, pricing accuracy, and client confidence.\n\n" +
  "ADLM Studio proposes a single annual partnership that takes your firm's entire quantity surveying function digital and keeps it there — combining purpose-built QS software, structured team training, a firm-wide standardisation layer, and continuous support and market-rate updates. This is a managed transformation programme designed to compound in value every year.";

const DEFAULT_TERMS =
  "This proposal is valid until the date stated above. Programmes may be invoiced annually or quarterly by agreement. Final tier and seat count are confirmed after the workflow audit. Payment by bank transfer to ADLM Studio · Access Bank · 1634998770.";

// Min/max physical-training investment, computed from active training locations.
function computeTrainingRange(locations) {
  const ngn = (locations || [])
    .map((l) => Number(l.trainingCostNGN || 0))
    .filter((n) => n > 0);
  const usd = (locations || [])
    .map((l) => Number(l.trainingCostUSD || 0))
    .filter((n) => n > 0);
  return {
    minNGN: ngn.length ? Math.min(...ngn) : 0,
    maxNGN: ngn.length ? Math.max(...ngn) : 0,
    minUSD: usd.length ? Math.min(...usd) : 0,
    maxUSD: usd.length ? Math.max(...usd) : 0,
    locationsCount: (locations || []).length,
  };
}

// Build a software-suite row from a live product (auto-fills description + price).
function suiteRowFromProduct(p, currency = "NGN") {
  return {
    productKey: p.key || p._id || "",
    name: p.name || "",
    whatItDoes: p.blurb || p.description || "",
    platform: guessPlatform(p.name),
    listPrice: formatYearly(p, currency),
  };
}

function emptyProposal(catalog) {
  const currency = "NGN";
  return {
    proposalDate: dayjs().format("YYYY-MM-DD"),
    validUntil: dayjs().add(30, "day").format("YYYY-MM-DD"),
    clientFirm: "",
    clientContact: "",
    clientTitle: "",
    clientEmail: "",
    clientPhone: "",
    clientAddress: "",
    clientCategory: "Lead",
    currency,
    preparedBy: "Adedolapo Quasim · Founder, ADLM Studio",
    // pre-populated live from the website's published products
    suite: (catalog?.products || []).map((p) =>
      suiteRowFromProduct(p, currency),
    ),
    tiers: JSON.parse(JSON.stringify(FALLBACK_TIERS)),
    trainingRange: catalog?.trainingRange
      ? { ...catalog.trainingRange }
      : { minNGN: 0, maxNGN: 0, minUSD: 0, maxUSD: 0, locationsCount: 0 },
    items: [
      { source: "", description: "", term: "", qty: 1, unitPrice: 0, total: 0 },
    ],
    discountPercent: 0,
    taxPercent: 7.5,
    execSummary: DEFAULT_EXEC_SUMMARY,
    terms: DEFAULT_TERMS,
    notes: "",
    status: "draft",
  };
}

export default function AdminProposals() {
  const { accessToken } = useAuth();

  const [proposals, setProposals] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");

  const [mode, setMode] = React.useState("list"); // list | form | preview
  const [form, setForm] = React.useState(null);
  const [editId, setEditId] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const [catalog, setCatalog] = React.useState(null);
  const [catalogError, setCatalogError] = React.useState("");

  // client autocomplete
  const [userSuggestions, setUserSuggestions] = React.useState([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const suggestTimer = React.useRef(null);

  /* -------- catalog: products + training locations (public endpoints) --------
     These are the same endpoints the storefront and invoice builder use, so
     they work without admin auth and stay reliable. */
  React.useEffect(() => {
    (async () => {
      try {
        const [pRes, tRes] = await Promise.all([
          fetch(`${API_BASE}/products?page=1&pageSize=200`, {
            credentials: "include",
          }).then((r) => r.json()),
          fetch(`${API_BASE}/training-locations`, {
            credentials: "include",
          }).then((r) => r.json()),
        ]);
        const products = Array.isArray(pRes?.items) ? pRes.items : [];
        const locations = Array.isArray(tRes?.locations) ? tRes.locations : [];
        setCatalog({
          products,
          locations,
          trainingRange: computeTrainingRange(locations),
        });
        setCatalogError(
          products.length
            ? ""
            : "No published products were returned by the website.",
        );
      } catch {
        setCatalogError(
          "Could not load products / training locations from the website.",
        );
      }
    })();
  }, []);

  // If the catalog arrives after a new-proposal form is already open,
  // back-fill the suite + training range that were empty at that point.
  React.useEffect(() => {
    if (!catalog) return;
    setForm((f) => {
      if (!f || editId) return f;
      let next = f;
      const tr = f.trainingRange || {};
      if (
        !tr.minNGN &&
        !tr.maxNGN &&
        !tr.minUSD &&
        !tr.maxUSD &&
        catalog.trainingRange
      ) {
        next = { ...next, trainingRange: { ...catalog.trainingRange } };
      }
      if ((!f.suite || f.suite.length === 0) && catalog.products?.length) {
        next = {
          ...next,
          suite: catalog.products.map((p) =>
            suiteRowFromProduct(p, f.currency),
          ),
        };
      }
      return next;
    });
  }, [catalog, editId]);

  async function load() {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const data = await apiAuthed(`/admin/proposals${qs}`, {
        token: accessToken,
      });
      setProposals(Array.isArray(data?.proposals) ? data.proposals : []);
    } catch (e) {
      setMsg(e.message || "Failed to load proposals");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (accessToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, statusFilter]);

  /* -------- catalog-derived line-item options -------- */
  const lineItemOptions = React.useMemo(() => {
    const opts = [];
    for (const t of form?.tiers || []) {
      if (!t.name) continue;
      opts.push({
        value: `tier:${t.name}`,
        label: `Programme — ${t.name} Tier`,
        group: "Programme Tiers",
        priceNGN: parseTierPrice(t.price),
        priceUSD: 0,
        description: `ADLM Digital Transformation — ${t.name} Tier`,
        term: "Annual",
      });
    }
    for (const p of catalog?.products || []) {
      const key = p.key || p._id;
      const yrNGN =
        Number(p.price?.yearlyNGN || 0) ||
        Number(p.price?.monthlyNGN || 0) * 12;
      const yrUSD =
        Number(p.price?.yearlyUSD || 0) ||
        Number(p.price?.monthlyUSD || 0) * 12;
      if (yrNGN > 0 || yrUSD > 0)
        opts.push({
          value: `product-yr:${key}`,
          label: `${p.name} (Yearly / seat)`,
          group: "Software Products",
          priceNGN: yrNGN,
          priceUSD: yrUSD,
          description: `${p.name} — annual licence (per seat)`,
          term: "Annual",
        });
      const moNGN = Number(p.price?.monthlyNGN || 0);
      const moUSD = Number(p.price?.monthlyUSD || 0);
      if (moNGN > 0 || moUSD > 0)
        opts.push({
          value: `product-mo:${key}`,
          label: `${p.name} (Monthly / seat)`,
          group: "Software Products",
          priceNGN: moNGN,
          priceUSD: moUSD,
          description: `${p.name} — monthly licence (per seat)`,
          term: "Monthly",
        });
    }
    for (const loc of catalog?.locations || []) {
      opts.push({
        value: `training:${loc._id}`,
        label: `Physical Training — ${loc.name}${loc.city ? ` (${loc.city})` : ""}`,
        group: "Physical Training",
        priceNGN: Number(loc.trainingCostNGN || 0),
        priceUSD: Number(loc.trainingCostUSD || 0),
        description: `Physical Training — ${loc.name}`,
        term: "One-off",
      });
      if (
        Number(loc.bimInstallCostNGN || 0) > 0 ||
        Number(loc.bimInstallCostUSD || 0) > 0
      )
        opts.push({
          value: `bim:${loc._id}`,
          label: `BIM Software Install — ${loc.name}`,
          group: "Physical Training",
          priceNGN: Number(loc.bimInstallCostNGN || 0),
          priceUSD: Number(loc.bimInstallCostUSD || 0),
          description: `BIM Software Installation — ${loc.name}`,
          term: "One-off",
        });
    }
    return opts;
  }, [form?.tiers, catalog]);

  /* -------- form helpers -------- */
  function startNew() {
    setForm(emptyProposal(catalog));
    setEditId(null);
    setMsg("");
    setMode("form");
  }

  function startEdit(p) {
    setForm({
      ...p,
      proposalDate: p.proposalDate
        ? dayjs(p.proposalDate).format("YYYY-MM-DD")
        : "",
      validUntil: p.validUntil
        ? dayjs(p.validUntil).format("YYYY-MM-DD")
        : "",
      tiers: p.tiers?.length ? p.tiers : FALLBACK_TIERS,
      suite: p.suite || [],
      items: p.items?.length
        ? p.items
        : [
            {
              source: "",
              description: "",
              term: "",
              qty: 1,
              unitPrice: 0,
              total: 0,
            },
          ],
      trainingRange: p.trainingRange || {
        minNGN: 0,
        maxNGN: 0,
        minUSD: 0,
        maxUSD: 0,
        locationsCount: 0,
      },
    });
    setEditId(p._id);
    setMsg("");
    setMode("form");
  }

  function patch(updater) {
    setForm((f) => ({ ...f, ...updater(f) }));
  }

  function handleClientField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (field === "clientEmail" || field === "clientContact") {
      clearTimeout(suggestTimer.current);
      if (value.trim().length >= 2) {
        suggestTimer.current = setTimeout(async () => {
          try {
            const data = await apiAuthed(
              `/admin/proposals/user-suggest?q=${encodeURIComponent(value.trim())}`,
              { token: accessToken },
            );
            setUserSuggestions(data?.users || []);
            setShowSuggestions(true);
          } catch {
            setUserSuggestions([]);
          }
        }, 300);
      } else {
        setUserSuggestions([]);
        setShowSuggestions(false);
      }
    }
  }

  function pickSuggestion(u) {
    setForm((f) => ({
      ...f,
      clientEmail: u.email || f.clientEmail,
      clientContact: u.name || f.clientContact,
      clientPhone: u.phone || f.clientPhone,
    }));
    setShowSuggestions(false);
    setUserSuggestions([]);
  }

  /* ---- software suite ---- */
  // Pick a live product for a suite row — auto-fills name, description & price.
  function selectSuiteProduct(idx, productKey) {
    if (!productKey) {
      updateSuiteRow(idx, { productKey: "" });
      return;
    }
    const p = (catalog?.products || []).find(
      (x) => (x.key || x._id) === productKey,
    );
    if (!p) return;
    updateSuiteRow(idx, suiteRowFromProduct(p, form?.currency || "NGN"));
  }
  function addCustomSuiteRow() {
    setForm((f) => ({
      ...f,
      suite: [
        ...f.suite,
        { productKey: "", name: "", whatItDoes: "", platform: "", listPrice: "" },
      ],
    }));
  }
  function updateSuiteRow(idx, p) {
    setForm((f) => {
      const suite = [...f.suite];
      suite[idx] = { ...suite[idx], ...p };
      return { ...f, suite };
    });
  }
  function removeSuiteRow(idx) {
    setForm((f) => ({ ...f, suite: f.suite.filter((_, i) => i !== idx) }));
  }

  /* ---- tiers ---- */
  function updateTier(idx, p) {
    setForm((f) => {
      const tiers = [...f.tiers];
      tiers[idx] = { ...tiers[idx], ...p };
      return { ...f, tiers };
    });
  }
  function setRecommended(idx) {
    setForm((f) => ({
      ...f,
      tiers: f.tiers.map((t, i) => ({ ...t, recommended: i === idx })),
    }));
  }

  /* ---- line items ---- */
  function updateItem(idx, p) {
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], ...p };
      items[idx].total =
        Number(items[idx].qty || 0) * Number(items[idx].unitPrice || 0);
      return { ...f, items };
    });
  }
  function selectLineSource(idx, value) {
    const opt = lineItemOptions.find((o) => o.value === value);
    if (!opt || !value) {
      updateItem(idx, { source: "" });
      return;
    }
    const price =
      form.currency === "USD"
        ? Number(opt.priceUSD || 0)
        : Number(opt.priceNGN || 0);
    updateItem(idx, {
      source: value,
      description: opt.description || opt.label,
      term: opt.term || "",
      unitPrice: price,
      qty: 1,
      total: price,
    });
  }
  function addItem() {
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { source: "", description: "", term: "", qty: 1, unitPrice: 0, total: 0 },
      ],
    }));
  }
  function removeItem(idx) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  // re-price catalog-sourced line items when the currency changes
  React.useEffect(() => {
    if (!form?.items?.length) return;
    let changed = false;
    const items = form.items.map((it) => {
      if (!it.source) return it;
      const opt = lineItemOptions.find((o) => o.value === it.source);
      if (!opt) return it;
      const price =
        form.currency === "USD"
          ? Number(opt.priceUSD || 0)
          : Number(opt.priceNGN || 0);
      if (price !== it.unitPrice) {
        changed = true;
        return { ...it, unitPrice: price, total: Number(it.qty || 1) * price };
      }
      return it;
    });
    if (changed) setForm((f) => ({ ...f, items }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.currency]);

  /* -------- totals -------- */
  const subtotal = (form?.items || []).reduce(
    (s, it) => s + Number(it.total || 0),
    0,
  );
  const discPct = Math.min(Math.max(Number(form?.discountPercent || 0), 0), 100);
  const taxPct = Math.min(Math.max(Number(form?.taxPercent || 0), 0), 100);
  const discountAmount = Math.round((subtotal * discPct) / 100 * 100) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = Math.round((afterDiscount * taxPct) / 100 * 100) / 100;
  const total = Math.max(afterDiscount + taxAmount, 0);

  /* -------- save / delete / send -------- */
  async function saveProposal({ thenPreview = false } = {}) {
    if (!form) return;
    setBusy(true);
    setMsg("");
    try {
      const payload = {
        ...form,
        items: form.items.map((it) => ({
          source: it.source || "",
          description: it.description || "",
          term: it.term || "",
          qty: Number(it.qty || 1),
          unitPrice: Number(it.unitPrice || 0),
          total: Number(it.total || 0),
        })),
        discountPercent: Number(form.discountPercent || 0),
        taxPercent: Number(form.taxPercent || 0),
      };
      const res = editId
        ? await apiAuthed(`/admin/proposals/${editId}`, {
            token: accessToken,
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiAuthed(`/admin/proposals`, {
            token: accessToken,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const saved = res?.proposal;
      load();
      const note =
        saved?.notion?.lastError
          ? " (Notion sync issue — check NOTION_API_KEY)"
          : saved?.notion?.lastSyncedAt
            ? " · synced to Notion CRM"
            : "";
      setMsg((editId ? "Proposal updated" : "Proposal created") + note);

      if (saved) {
        setEditId(saved._id);
        setForm({
          ...saved,
          proposalDate: saved.proposalDate
            ? dayjs(saved.proposalDate).format("YYYY-MM-DD")
            : "",
          validUntil: saved.validUntil
            ? dayjs(saved.validUntil).format("YYYY-MM-DD")
            : "",
          tiers: saved.tiers?.length ? saved.tiers : form.tiers,
          items: saved.items?.length ? saved.items : form.items,
        });
        if (thenPreview) setMode("preview");
      }
    } catch (e) {
      setMsg(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProposal(id) {
    if (
      !confirm(
        "Delete this proposal? This cannot be undone. (The Notion CRM record is not removed.)",
      )
    )
      return;
    try {
      await apiAuthed(`/admin/proposals/${id}`, {
        token: accessToken,
        method: "DELETE",
      });
      load();
    } catch (e) {
      setMsg(e.message || "Delete failed");
    }
  }

  async function sendProposal(id) {
    setBusy(true);
    setMsg("");
    try {
      const res = await apiAuthed(`/admin/proposals/${id}/send`, {
        token: accessToken,
        method: "POST",
      });
      load();
      setMsg(res?.message || "Proposal sent to client");
    } catch (e) {
      setMsg(e.message || "Send failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadServerPdf(id) {
    window.open(
      `${API_BASE}/admin/proposals/${id}/pdf?token=${accessToken}`,
      "_blank",
    );
  }

  /* ===================== LIST MODE ===================== */
  if (mode === "list") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight"><span aria-hidden="true" className="h-6 w-1.5 rounded-full bg-gradient-to-b from-adlm-orange to-amber-400" />Digital Transformation Proposals</h1>
            <p className="text-sm text-slate-500">
              Build, download, and send client proposals — auto-logged to the
              ADLM Notion CRM.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </select>
            <button className="btn btn-sm" onClick={startNew}>
              + New Proposal
            </button>
          </div>
        </div>

        {msg && <div className="text-sm text-emerald-700">{msg}</div>}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-600">
              <tr className="border-b">
                <th className="py-2 pr-3">Proposal #</th>
                <th className="py-2 pr-3">Client</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Notion</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p._id} className="border-b hover:bg-slate-50">
                  <td className="py-2 pr-3 font-medium">{p.proposalNumber}</td>
                  <td className="py-2 pr-3">
                    {p.clientFirm || p.clientContact || p.clientEmail || "—"}
                  </td>
                  <td className="py-2 pr-3 text-slate-500">
                    {dayjs(p.proposalDate).format("MMM D, YYYY")}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium">
                    {fmt(p.total, p.currency)}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status] || ""}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {p.notion?.lastError ? (
                      <span
                        className="text-xs text-amber-600"
                        title={p.notion.lastError}
                      >
                        ⚠ error
                      </span>
                    ) : p.notion?.lastSyncedAt ? (
                      <span className="text-xs text-emerald-600">✓ synced</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2 text-xs">
                      <button
                        className="text-adlm-blue-700 hover:underline"
                        onClick={() => startEdit(p)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-adlm-blue-700 hover:underline"
                        onClick={() => {
                          startEdit(p);
                          setTimeout(() => setMode("preview"), 50);
                        }}
                      >
                        Preview
                      </button>
                      <button
                        className="text-adlm-blue-700 hover:underline"
                        onClick={() => downloadServerPdf(p._id)}
                      >
                        PDF
                      </button>
                      {p.clientEmail && (
                        <button
                          className="text-adlm-blue-700 hover:underline"
                          onClick={() => sendProposal(p._id)}
                        >
                          Send
                        </button>
                      )}
                      <button
                        className="text-rose-600 hover:underline"
                        onClick={() => deleteProposal(p._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {proposals.length === 0 && (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={7}>
                    {loading ? "Loading…" : "No proposals yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ===================== PREVIEW MODE ===================== */
  if (mode === "preview" && form) {
    return (
      <PreviewMode
        form={form}
        editId={editId}
        busy={busy}
        onBack={() => setMode("form")}
        onSend={() => editId && sendProposal(editId)}
        onServerPdf={() => editId && downloadServerPdf(editId)}
      />
    );
  }

  /* ===================== FORM MODE ===================== */
  if (!form) return null;
  const sym = form.currency === "USD" ? "$" : "₦";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          {editId ? "Edit Proposal" : "New Proposal"}
        </h1>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setMode("list");
            setForm(null);
            setEditId(null);
          }}
        >
          Back to list
        </button>
      </div>

      {msg && <div className="text-sm text-emerald-700">{msg}</div>}

      <div className="card space-y-5">
        {/* -------- proposal meta -------- */}
        <div className="grid sm:grid-cols-4 gap-3 text-sm">
          <label>
            Proposal Date
            <input
              type="date"
              className="input mt-1"
              value={form.proposalDate || ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, proposalDate: e.target.value }))
              }
            />
          </label>
          <label>
            Valid Until
            <input
              type="date"
              className="input mt-1"
              value={form.validUntil || ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, validUntil: e.target.value }))
              }
            />
          </label>
          <label>
            Currency
            <select
              className="input mt-1"
              value={form.currency || "NGN"}
              onChange={(e) =>
                setForm((f) => ({ ...f, currency: e.target.value }))
              }
            >
              <option value="NGN">NGN</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label>
            Status
            <select
              className="input mt-1"
              value={form.status || "draft"}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value }))
              }
            >
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </select>
          </label>
        </div>

        {/* -------- client -------- */}
        <div className="border-t pt-4">
          <div className="text-sm font-semibold mb-2">Prepared For</div>
          <div className="text-xs text-slate-500 mb-2">
            Start typing a contact name or email to search registered users.
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <label>
              Firm / Company
              <input
                className="input mt-1"
                value={form.clientFirm || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientFirm: e.target.value }))
                }
              />
            </label>
            <div className="relative">
              <label>
                Contact Name
                <input
                  className="input mt-1"
                  value={form.clientContact || ""}
                  onChange={(e) =>
                    handleClientField("clientContact", e.target.value)
                  }
                  onFocus={() =>
                    userSuggestions.length > 0 && setShowSuggestions(true)
                  }
                  onBlur={() =>
                    setTimeout(() => setShowSuggestions(false), 200)
                  }
                  autoComplete="off"
                />
              </label>
              {showSuggestions && userSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full bg-white rounded-md shadow-lg ring-1 ring-slate-200 max-h-48 overflow-y-auto">
                  {userSuggestions.map((u) => (
                    <button
                      key={u._id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-0"
                      onMouseDown={() => pickSuggestion(u)}
                    >
                      <div className="font-medium">{u.name || u.email}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label>
              Contact Title
              <input
                className="input mt-1"
                value={form.clientTitle || ""}
                placeholder="e.g. Managing Partner"
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientTitle: e.target.value }))
                }
              />
            </label>
            <div className="relative">
              <label>
                Email
                <input
                  type="email"
                  className="input mt-1"
                  value={form.clientEmail || ""}
                  onChange={(e) =>
                    handleClientField("clientEmail", e.target.value)
                  }
                  onFocus={() =>
                    userSuggestions.length > 0 && setShowSuggestions(true)
                  }
                  onBlur={() =>
                    setTimeout(() => setShowSuggestions(false), 200)
                  }
                  autoComplete="off"
                />
              </label>
            </div>
            <label>
              Phone
              <input
                className="input mt-1"
                value={form.clientPhone || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientPhone: e.target.value }))
                }
              />
            </label>
            <label>
              CRM Category
              <select
                className="input mt-1"
                value={form.clientCategory || "Lead"}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientCategory: e.target.value }))
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              Address
              <input
                className="input mt-1"
                value={form.clientAddress || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientAddress: e.target.value }))
                }
              />
            </label>
            <label className="sm:col-span-2">
              Prepared By
              <input
                className="input mt-1"
                value={form.preparedBy || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, preparedBy: e.target.value }))
                }
              />
            </label>
          </div>
        </div>

        {/* -------- software suite (live products) -------- */}
        <div className="border-t pt-4">
          <div className="text-sm font-semibold mb-1">
            ADLM Software Suite{" "}
            <span className="text-xs font-normal text-slate-500">
              — pulled live from website products
            </span>
          </div>
          {catalogError && (
            <div className="text-xs text-amber-600 mb-2">{catalogError}</div>
          )}
          <div className="text-xs text-slate-500 mb-2">
            Pick a product to auto-fill its description and price, or edit any
            field. Use “Add suite row” for a custom entry.
          </div>

          <div className="space-y-2">
            {form.suite.map((row, idx) => (
              <div
                key={idx}
                className="bg-slate-50 ring-1 ring-slate-200 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <select
                    className="input text-sm flex-1"
                    value={row.productKey || ""}
                    onChange={(e) => selectSuiteProduct(idx, e.target.value)}
                  >
                    <option value="">— Custom row —</option>
                    {(catalog?.products || []).map((p) => (
                      <option key={p.key || p._id} value={p.key || p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="text-rose-500 text-xs hover:underline shrink-0"
                    onClick={() => removeSuiteRow(idx)}
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-12 gap-2 text-sm">
                  <input
                    className="input col-span-3"
                    placeholder="Product"
                    value={row.name || ""}
                    onChange={(e) =>
                      updateSuiteRow(idx, { name: e.target.value })
                    }
                  />
                  <input
                    className="input col-span-4"
                    placeholder="What it does"
                    value={row.whatItDoes || ""}
                    onChange={(e) =>
                      updateSuiteRow(idx, { whatItDoes: e.target.value })
                    }
                  />
                  <input
                    className="input col-span-2"
                    placeholder="Platform"
                    value={row.platform || ""}
                    onChange={(e) =>
                      updateSuiteRow(idx, { platform: e.target.value })
                    }
                  />
                  <input
                    className="input col-span-3"
                    placeholder="List price"
                    value={row.listPrice || ""}
                    onChange={(e) =>
                      updateSuiteRow(idx, { listPrice: e.target.value })
                    }
                  />
                </div>
              </div>
            ))}
            {form.suite.length === 0 && (
              <div className="text-xs text-slate-400">
                No suite rows yet — add one below.
              </div>
            )}
          </div>
          <button
            type="button"
            className="text-sm text-adlm-blue-700 hover:underline mt-2"
            onClick={addCustomSuiteRow}
          >
            + Add suite row
          </button>
        </div>

        {/* -------- programme tiers -------- */}
        <div className="border-t pt-4">
          <div className="text-sm font-semibold mb-2">
            Annual Partnership Tiers
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {(form.tiers || []).map((t, idx) => (
              <div
                key={idx}
                className="rounded-lg ring-1 ring-slate-200 p-3 space-y-2 text-sm"
              >
                <input
                  className="input"
                  placeholder="Tier name"
                  value={t.name || ""}
                  onChange={(e) => updateTier(idx, { name: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Audience"
                  value={t.audience || ""}
                  onChange={(e) =>
                    updateTier(idx, { audience: e.target.value })
                  }
                />
                <input
                  className="input"
                  placeholder="Price (e.g. ₦3M / year)"
                  value={t.price || ""}
                  onChange={(e) => updateTier(idx, { price: e.target.value })}
                />
                <textarea
                  className="input"
                  rows={5}
                  placeholder="One feature per line"
                  value={(t.features || []).join("\n")}
                  onChange={(e) =>
                    updateTier(idx, {
                      features: e.target.value.split("\n"),
                    })
                  }
                />
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="recommendedTier"
                    checked={!!t.recommended}
                    onChange={() => setRecommended(idx)}
                  />
                  Recommended tier
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* -------- physical training range -------- */}
        <div className="border-t pt-4">
          <div className="text-sm font-semibold mb-1">
            Physical Training Price Range
          </div>
          <div className="text-xs text-slate-500 mb-2">
            Auto-computed from active training locations
            {catalog?.trainingRange?.locationsCount
              ? ` (${catalog.trainingRange.locationsCount} location(s))`
              : ""}
            . Adjust if needed.
          </div>
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <label>
              Minimum (NGN)
              <input
                type="number"
                className="input mt-1"
                value={form.trainingRange?.minNGN || 0}
                onChange={(e) =>
                  patch((f) => ({
                    trainingRange: {
                      ...f.trainingRange,
                      minNGN: Number(e.target.value || 0),
                    },
                  }))
                }
              />
            </label>
            <label>
              Maximum (NGN)
              <input
                type="number"
                className="input mt-1"
                value={form.trainingRange?.maxNGN || 0}
                onChange={(e) =>
                  patch((f) => ({
                    trainingRange: {
                      ...f.trainingRange,
                      maxNGN: Number(e.target.value || 0),
                    },
                  }))
                }
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!catalog?.trainingRange}
                onClick={() =>
                  catalog?.trainingRange &&
                  setForm((f) => ({
                    ...f,
                    trainingRange: { ...catalog.trainingRange },
                  }))
                }
              >
                Reset to live values
              </button>
            </div>
          </div>
        </div>

        {/* -------- quotation line items -------- */}
        <div className="border-t pt-4">
          <div className="text-sm font-semibold mb-2">Quotation Line Items</div>
          <div className="space-y-3">
            {form.items.map((item, idx) => (
              <div
                key={idx}
                className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-xs font-medium text-slate-500">
                    Item {idx + 1}
                  </div>
                  {form.items.length > 1 && (
                    <button
                      className="text-rose-500 text-xs hover:underline"
                      onClick={() => removeItem(idx)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <label className="block text-sm mb-2">
                  Pick from catalog
                  <select
                    className="input mt-1"
                    value={item.source || ""}
                    onChange={(e) => selectLineSource(idx, e.target.value)}
                  >
                    <option value="">— Custom item —</option>
                    {["Programme Tiers", "Software Products", "Physical Training"].map(
                      (g) => {
                        const inGroup = lineItemOptions.filter(
                          (o) => o.group === g,
                        );
                        if (!inGroup.length) return null;
                        return (
                          <optgroup key={g} label={g}>
                            {inGroup.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </optgroup>
                        );
                      },
                    )}
                  </select>
                </label>
                <div className="grid grid-cols-12 gap-2 text-sm">
                  <div className="col-span-4">
                    <label className="text-xs text-slate-500">
                      Description
                    </label>
                    <input
                      className="input mt-0.5"
                      value={item.description || ""}
                      onChange={(e) =>
                        updateItem(idx, { description: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500">Term</label>
                    <input
                      className="input mt-0.5"
                      placeholder="Annual"
                      value={item.term || ""}
                      onChange={(e) =>
                        updateItem(idx, { term: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs text-slate-500">Qty</label>
                    <input
                      type="number"
                      min="1"
                      className="input mt-0.5"
                      value={item.qty || ""}
                      onChange={(e) =>
                        updateItem(idx, { qty: Number(e.target.value || 0) })
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500">
                      Unit Price
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="input mt-0.5"
                      value={item.unitPrice || ""}
                      onChange={(e) =>
                        updateItem(idx, {
                          unitPrice: Number(e.target.value || 0),
                        })
                      }
                    />
                  </div>
                  <div className="col-span-3 text-right">
                    <label className="text-xs text-slate-500">Total</label>
                    <div className="font-semibold mt-1.5">
                      {fmt(item.total, form.currency)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            className="text-sm text-adlm-blue-700 hover:underline mt-3"
            onClick={addItem}
          >
            + Add line item
          </button>
        </div>

        {/* -------- totals -------- */}
        <div className="border-t pt-4 grid sm:grid-cols-2 gap-4">
          <div className="space-y-3 text-sm">
            <label>
              Discount (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                className="input mt-1"
                value={form.discountPercent || 0}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    discountPercent: Number(e.target.value || 0),
                  }))
                }
              />
            </label>
            <label>
              VAT / Tax (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                className="input mt-1"
                value={form.taxPercent || 0}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    taxPercent: Number(e.target.value || 0),
                  }))
                }
              />
            </label>
          </div>
          <div className="text-right space-y-1 text-sm">
            <div>
              Subtotal:{" "}
              <span className="font-medium">{fmt(subtotal, form.currency)}</span>
            </div>
            {discPct > 0 && (
              <div>
                Discount ({discPct}%):{" "}
                <span className="font-medium text-rose-600">
                  - {fmt(discountAmount, form.currency)}
                </span>
              </div>
            )}
            {taxPct > 0 && (
              <div>
                VAT ({taxPct}%):{" "}
                <span className="font-medium">
                  + {fmt(taxAmount, form.currency)}
                </span>
              </div>
            )}
            <div className="text-lg font-semibold border-t pt-2 mt-2">
              Total: {fmt(total, form.currency)}{" "}
              <span className="text-xs font-normal text-slate-400">
                ({sym})
              </span>
            </div>
          </div>
        </div>

        {/* -------- narrative -------- */}
        <div className="border-t pt-4 space-y-3 text-sm">
          <label className="block">
            Executive Summary
            <textarea
              className="input mt-1"
              rows={5}
              value={form.execSummary || ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, execSummary: e.target.value }))
              }
            />
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label>
              Notes (optional)
              <textarea
                className="input mt-1"
                rows={3}
                value={form.notes || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </label>
            <label>
              Terms / Validity
              <textarea
                className="input mt-1"
                rows={3}
                value={form.terms || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, terms: e.target.value }))
                }
              />
            </label>
          </div>
        </div>

        {/* -------- actions -------- */}
        <div className="flex gap-2 pt-2 border-t">
          <button
            className="btn"
            onClick={() => saveProposal()}
            disabled={busy}
          >
            {busy ? "Saving…" : editId ? "Update Proposal" : "Create Proposal"}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => saveProposal({ thenPreview: true })}
            disabled={busy}
          >
            Save &amp; Preview
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setMode("list");
              setForm(null);
              setEditId(null);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================== PREVIEW MODE COMPONENT ===================== */
function PreviewMode({ form, editId, busy, onBack, onSend, onServerPdf }) {
  const previewRef = React.useRef(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);

  async function downloadPixelPdf() {
    setPdfBusy(true);
    try {
      await downloadProposalPdf(previewRef, form?.proposalNumber || "proposal");
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("PDF download failed. Use Print → Save as PDF instead.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div>
      <div className="no-print flex items-center justify-between gap-2 flex-wrap mb-4">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          Back to Editor
        </button>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-sm" onClick={() => window.print()}>
            Print
          </button>
          <button
            className="btn btn-sm"
            onClick={downloadPixelPdf}
            disabled={pdfBusy}
          >
            {pdfBusy ? "Generating…" : "Download PDF"}
          </button>
          {editId && (
            <button className="btn btn-sm" onClick={onServerPdf}>
              Server PDF
            </button>
          )}
          {editId && form?.clientEmail && (
            <button
              className="btn btn-sm text-white"
              style={{ backgroundColor: "#0D2240" }}
              onClick={onSend}
              disabled={busy}
            >
              {busy ? "Sending…" : "Send to Client"}
            </button>
          )}
        </div>
      </div>

      {!editId && (
        <div className="no-print text-xs text-amber-600 mb-3">
          Save the proposal first to enable Server PDF and Send to Client.
        </div>
      )}

      <div className="overflow-x-auto">
        <ProposalPreview proposal={form} previewRef={previewRef} />
      </div>
    </div>
  );
}
