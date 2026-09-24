// server/util/notion.js
// Thin Notion REST client for syncing proposals into the ADLM Notion CRM.
// Stays completely dormant (no-ops) until NOTION_API_KEY is configured.
import fetch from "node-fetch";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const TIMEOUT_MS = 9000;

// Database IDs default to the live ADLM "CRM & Operations" workspace and can be
// overridden via env. Notion accepts IDs with or without dashes.
function crmDbId() {
  return String(
    process.env.NOTION_CRM_DB_ID || "a8c37afbd5ec472bb24067181dbcb4dd"
  ).trim();
}
function activityDbId() {
  return String(
    process.env.NOTION_ACTIVITY_DB_ID || "ad656155458043079dbb17262bf26465"
  ).trim();
}

export function notionEnabled() {
  return !!String(process.env.NOTION_API_KEY || "").trim();
}

async function notionApi(path, { method = "GET", body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${NOTION_API}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${String(process.env.NOTION_API_KEY || "").trim()}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Notion API ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ---- Notion property builders ---- */
const title = (s) => ({
  title: [{ text: { content: String(s || "").slice(0, 1900) } }],
});
const richText = (s) => ({
  rich_text: [{ text: { content: String(s || "").slice(0, 1900) } }],
});
const select = (name) => (name ? { select: { name: String(name) } } : { select: null });
const dateOnly = (d) => {
  if (!d) return { date: null };
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return { date: null };
  return { date: { start: dt.toISOString().slice(0, 10) } };
};

/**
 * Create or update the CRM contact + Activity Log entry for a proposal.
 * Idempotent: re-running updates the same Notion pages instead of duplicating.
 * Never throws — returns a `notion` sub-document to persist on the Proposal,
 * with `lastError` populated when something went wrong.
 */
export async function syncProposalToNotion(proposal) {
  const result = {
    contactPageId: proposal?.notion?.contactPageId || "",
    activityPageId: proposal?.notion?.activityPageId || "",
    lastSyncedAt: proposal?.notion?.lastSyncedAt || null,
    lastError: "",
  };

  if (!notionEnabled()) return result; // dormant — Notion not configured

  try {
    const curr = proposal.currency === "USD" ? "$" : "₦";
    const totalStr = `${curr}${Number(proposal.total || 0).toLocaleString()}`;
    const firm = proposal.clientFirm || proposal.clientContact || "Client";
    const validStr = proposal.validUntil
      ? new Date(proposal.validUntil).toISOString().slice(0, 10)
      : "";
    const summary =
      `${proposal.proposalNumber} — Digital Transformation proposal for ${firm} (${totalStr}).` +
      (validStr ? ` Valid until ${validStr}.` : "");

    /* ---- CRM — Contacts & Pipeline (upsert) ---- */
    let contactId = result.contactPageId;
    if (!contactId && proposal.clientEmail) {
      const q = await notionApi(`/databases/${crmDbId()}/query`, {
        method: "POST",
        body: {
          page_size: 1,
          filter: { property: "Email", email: { equals: proposal.clientEmail } },
        },
      });
      contactId = q?.results?.[0]?.id || "";
    }
    if (!contactId && proposal.clientFirm) {
      const q = await notionApi(`/databases/${crmDbId()}/query`, {
        method: "POST",
        body: {
          page_size: 1,
          filter: { property: "Company", rich_text: { equals: proposal.clientFirm } },
        },
      });
      contactId = q?.results?.[0]?.id || "";
    }

    if (contactId) {
      // Non-destructive: only advance the pipeline fields, leave notes intact.
      await notionApi(`/pages/${contactId}`, {
        method: "PATCH",
        body: {
          properties: {
            Stage: select("Proposal Sent"),
            "Activity Type": select("Proposal"),
            "Last Contacted": dateOnly(new Date()),
          },
        },
      });
    } else {
      const props = {
        Name: title(proposal.clientContact || proposal.clientFirm || "New Contact"),
        Stage: select("Proposal Sent"),
        "Activity Type": select("Proposal"),
        "Follow-Up Status": select("Scheduled"),
        "Follow-Up Channel": select("Email"),
        "Last Contacted": dateOnly(new Date()),
        Notes: richText(summary),
      };
      if (proposal.clientFirm) props.Company = richText(proposal.clientFirm);
      if (proposal.clientEmail) props.Email = { email: proposal.clientEmail };
      if (proposal.clientPhone)
        props["Phone / WhatsApp"] = { phone_number: proposal.clientPhone };
      if (proposal.clientCategory) props.Category = select(proposal.clientCategory);
      if (proposal.validUntil)
        props["Next Follow-Up Date"] = dateOnly(proposal.validUntil);

      const created = await notionApi(`/pages`, {
        method: "POST",
        body: { parent: { database_id: crmDbId() }, properties: props },
      });
      contactId = created?.id || "";
    }
    result.contactPageId = contactId;

    /* ---- Activity Log (upsert) ---- */
    const activityProps = {
      Title: title(`${proposal.proposalNumber} — ${firm}`),
      Type: select("Email"),
      Date: dateOnly(proposal.proposalDate || new Date()),
      Summary: richText(summary),
      "Next Action": richText("Follow up on proposal"),
    };
    if (proposal.validUntil)
      activityProps["Next Action Date"] = dateOnly(proposal.validUntil);

    if (result.activityPageId) {
      await notionApi(`/pages/${result.activityPageId}`, {
        method: "PATCH",
        body: { properties: activityProps },
      });
    } else {
      const created = await notionApi(`/pages`, {
        method: "POST",
        body: { parent: { database_id: activityDbId() }, properties: activityProps },
      });
      result.activityPageId = created?.id || "";
    }

    result.lastSyncedAt = new Date();
    result.lastError = "";
  } catch (e) {
    result.lastError = String(e?.message || e).slice(0, 500);
    console.error("[notion] proposal sync failed:", result.lastError);
  }

  return result;
}

/**
 * Comparable core of a phone number: digits only, with the Nigerian country
 * code and any trunk zero stripped, so every way of writing the same number
 * reduces to the same string.
 *
 *   +234 801 234 5678 → 8012345678
 *   08012345678       → 8012345678
 *   2348012345678     → 8012345678
 *
 * Falls back to the last 10 digits for international numbers, which is enough
 * to tell two real contacts apart without pretending to be libphonenumber.
 */
function phoneCore(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) digits = digits.slice(3);
  digits = digits.replace(/^0+/, "");
  return digits.slice(-10);
}

/**
 * Find an existing CRM contact for this lead, by email when there is one and
 * by phone otherwise.
 *
 * The phone side needs three attempts because Notion stores `phone_number` as
 * free text: `equals` only matches contacts written in exactly the same format
 * we write, so a manually-added "+234 801 234 5678" would be missed and
 * duplicated. The last-4 `contains` scan catches those, and the normalised
 * comparison is what actually decides.
 */
async function findCrmContact({ email, phone }) {
  if (email) {
    const q = await notionApi(`/databases/${crmDbId()}/query`, {
      method: "POST",
      body: {
        page_size: 1,
        filter: { property: "Email", email: { equals: email } },
      },
    });
    const hit = q?.results?.[0]?.id;
    if (hit) return hit;
  }

  const core = phoneCore(phone);
  if (!core) return "";

  const exact = await notionApi(`/databases/${crmDbId()}/query`, {
    method: "POST",
    body: {
      page_size: 1,
      filter: { property: "Phone / WhatsApp", phone_number: { equals: phone } },
    },
  });
  if (exact?.results?.[0]?.id) return exact.results[0].id;

  // Last 4 digits stay contiguous under every common formatting, so this is a
  // cheap way to narrow to a handful of candidates before comparing properly.
  const scan = await notionApi(`/databases/${crmDbId()}/query`, {
    method: "POST",
    body: {
      page_size: 25,
      filter: {
        property: "Phone / WhatsApp",
        phone_number: { contains: core.slice(-4) },
      },
    },
  });

  for (const page of scan?.results || []) {
    const stored = page?.properties?.["Phone / WhatsApp"]?.phone_number;
    if (stored && phoneCore(stored) === core) return page.id;
  }

  return "";
}

/**
 * Upsert a warm lead captured by the AI Agent into the same CRM database.
 * Idempotent by email, or by phone when there is no email — WhatsApp leads
 * arrive phone-only, and matching on email alone created a fresh contact on
 * every conversation. Never throws — returns a `notion` sub-document to
 * persist on the Lead, with `lastError` populated on failure. Dormant until
 * NOTION_API_KEY is configured.
 */
export async function syncLeadToNotion(lead) {
  const result = {
    contactPageId: lead?.notion?.contactPageId || "",
    lastSyncedAt: lead?.notion?.lastSyncedAt || null,
    lastError: "",
  };

  if (!notionEnabled()) return result; // dormant

  try {
    const summaryParts = [
      lead.interest ? `Interested in: ${lead.interest}.` : "",
      lead.productKeys?.length ? `Products: ${lead.productKeys.join(", ")}.` : "",
      lead.note || "",
    ].filter(Boolean);
    // The channel has to come from the lead, not be assumed: WhatsApp leads
    // sync through here too, and labelling them "website chat" misdirects
    // whoever picks up the follow-up.
    const isWhatsApp = String(lead.source || "").toLowerCase().includes("whatsapp");
    const channel = isWhatsApp ? "WhatsApp" : "AI Agent";
    const summary =
      `${channel} lead${lead.name ? ` — ${lead.name}` : ""}. ` +
      (summaryParts.join(" ") ||
        `Captured from ${isWhatsApp ? "WhatsApp" : "website"} chat.`);

    let contactId = result.contactPageId;
    if (!contactId) {
      contactId = await findCrmContact({ email: lead.email, phone: lead.phone });
    }

    if (contactId) {
      await notionApi(`/pages/${contactId}`, {
        method: "PATCH",
        body: {
          properties: {
            Stage: select("Lead"),
            "Activity Type": select("Chat"),
            "Last Contacted": dateOnly(new Date()),
          },
        },
      });
    } else {
      const props = {
        // Phone-only leads used to land as a wall of identical "AI Agent Lead"
        // rows, which is unusable in a CRM list; fall back to the number.
        Name: title(lead.name || lead.email || lead.phone || "AI Agent Lead"),
        Stage: select("Lead"),
        "Activity Type": select("Chat"),
        "Follow-Up Status": select("Scheduled"),
        "Follow-Up Channel": select(isWhatsApp || lead.phone ? "WhatsApp" : "Email"),
        "Last Contacted": dateOnly(new Date()),
        Notes: richText(summary),
      };
      if (lead.email) props.Email = { email: lead.email };
      if (lead.phone) props["Phone / WhatsApp"] = { phone_number: lead.phone };

      const created = await notionApi(`/pages`, {
        method: "POST",
        body: { parent: { database_id: crmDbId() }, properties: props },
      });
      contactId = created?.id || "";
    }

    result.contactPageId = contactId;
    result.lastSyncedAt = new Date();
    result.lastError = "";
  } catch (e) {
    result.lastError = String(e?.message || e).slice(0, 500);
    console.error("[notion] lead sync failed:", result.lastError);
  }

  return result;
}

/* ────────────────────────── renewal follow-up calls ─────────────────────── */

// Where a follow-up sits in the pipeline, by why they are being called.
function followUpStage(followUp) {
  const reasons = Array.isArray(followUp?.reasons) ? followUp.reasons : [];
  if (reasons.includes("pending")) return "Payment Pending";
  return "Renewal Due";
}

// What the CRM should say about the follow-up after a given call outcome.
// Notion creates a select option it has not seen before, so these names do not
// have to be pre-configured in the database.
const OUTCOME_TO_STATUS = {
  reached: "Contacted",
  renewed: "Closed - Won",
  callback: "Scheduled",
  not_interested: "Closed - Lost",
  no_answer: "Attempted",
  voicemail: "Attempted",
  wrong_number: "Unreachable",
  unreachable: "Unreachable",
};

// One-line description of what the person has outstanding, used as the CRM
// note so whoever opens the contact in Notion sees the reason without having
// to come back to the admin screen.
function followUpSummary(followUp) {
  const bits = [];

  for (const p of followUp?.products || []) {
    const when = p?.expiresAt
      ? new Date(p.expiresAt).toISOString().slice(0, 10)
      : "";
    bits.push(
      `${p?.productName || p?.productKey} expired${when ? ` ${when}` : ""}` +
        (p?.daysOverdue ? ` (${p.daysOverdue} days ago)` : ""),
    );
  }

  for (const q of followUp?.purchases || []) {
    const amount = q?.total
      ? `${q.currency === "USD" ? "$" : "₦"}${Number(q.total).toLocaleString()}`
      : "";
    bits.push(
      `Unpaid order: ${q?.items || "—"}${amount ? ` — ${amount}` : ""}` +
        (q?.ageDays ? `, ${q.ageDays} days old` : "") +
        (q?.hasReceipt ? ", receipt uploaded" : ""),
    );
  }

  return bits.join(". ") || "Renewal follow-up.";
}

/**
 * Upsert the CRM contact for someone on the renewal call list.
 *
 * Reuses findCrmContact so a person who is already in the CRM as a proposal
 * client or an AI-agent lead gets their existing page advanced, not a second
 * row created — the whole point of pushing this list to Notion is that the
 * sales team works ONE contact record per human.
 *
 * Never throws — returns the `notion` sub-document to persist on the FollowUp.
 * Dormant until NOTION_API_KEY is configured.
 */
export async function syncFollowUpToNotion(followUp) {
  const result = {
    contactPageId: followUp?.notion?.contactPageId || "",
    lastSyncedAt: followUp?.notion?.lastSyncedAt || null,
    lastError: "",
  };

  if (!notionEnabled()) return result; // dormant

  try {
    const name =
      [followUp.firstName, followUp.lastName]
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .join(" ") ||
      followUp.email ||
      "ADLM customer";

    let contactId = result.contactPageId;
    if (!contactId) {
      contactId = await findCrmContact({
        email: followUp.email,
        phone: followUp.phone,
      });
    }

    // Only the pipeline fields move on an existing contact. Notes there may
    // have been written by a human and are not ours to overwrite.
    const shared = {
      Stage: select(followUpStage(followUp)),
      "Activity Type": select("Call"),
      "Follow-Up Status": select(
        OUTCOME_TO_STATUS[followUp.lastOutcome] || "Scheduled",
      ),
      "Follow-Up Channel": select(followUp.phone ? "Phone" : "Email"),
    };
    if (followUp.nextFollowUpAt) {
      shared["Next Follow-Up Date"] = dateOnly(followUp.nextFollowUpAt);
    }
    if (followUp.lastCalledAt) {
      shared["Last Contacted"] = dateOnly(followUp.lastCalledAt);
    }

    if (contactId) {
      await notionApi(`/pages/${contactId}`, {
        method: "PATCH",
        body: { properties: shared },
      });
    } else {
      const props = {
        ...shared,
        Name: title(name),
        Notes: richText(followUpSummary(followUp)),
      };
      if (followUp.email) props.Email = { email: followUp.email };
      if (followUp.phone)
        props["Phone / WhatsApp"] = { phone_number: followUp.phone };
      if (followUp.firmName) props.Company = richText(followUp.firmName);
      props.Category = select("Customer");

      const created = await notionApi(`/pages`, {
        method: "POST",
        body: { parent: { database_id: crmDbId() }, properties: props },
      });
      contactId = created?.id || "";
    }

    result.contactPageId = contactId;
    result.lastSyncedAt = new Date();
    result.lastError = "";
  } catch (e) {
    result.lastError = String(e?.message || e).slice(0, 500);
    console.error("[notion] follow-up sync failed:", result.lastError);
  }

  return result;
}

/**
 * Append one logged call to the Notion Activity Log.
 *
 * A new page per call, never an update: the value of this database is that it
 * is a chronological record of attempts, so the third "no answer" must not
 * silently replace the first two.
 *
 * Returns the created page id, or "" when Notion is off or the push failed.
 * Never throws — a CRM outage must not lose the call the person just logged.
 */
export async function logFollowUpCallToNotion(followUp, call) {
  if (!notionEnabled()) return "";

  try {
    const who =
      [followUp.firstName, followUp.lastName]
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .join(" ") ||
      followUp.email ||
      "Customer";

    const outcomeLabel = String(call?.outcome || "")
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase());

    const summary =
      `${outcomeLabel}${call?.byName ? ` — called by ${call.byName}` : ""}. ` +
      `${followUpSummary(followUp)}` +
      (call?.note ? ` Notes: ${call.note}` : "");

    const props = {
      Title: title(`Follow-up call — ${who}`),
      Type: select(call?.channel === "whatsapp" ? "WhatsApp" : "Call"),
      Date: dateOnly(call?.at || new Date()),
      Summary: richText(summary),
      "Next Action": richText(
        call?.outcome === "renewed"
          ? "Renewed — confirm the entitlement was applied"
          : call?.outcome === "not_interested"
            ? "Closed — no further calls"
            : "Call again",
      ),
    };
    if (call?.nextFollowUpAt) {
      props["Next Action Date"] = dateOnly(call.nextFollowUpAt);
    }

    const created = await notionApi(`/pages`, {
      method: "POST",
      body: { parent: { database_id: activityDbId() }, properties: props },
    });
    return created?.id || "";
  } catch (e) {
    console.error(
      "[notion] follow-up call log failed:",
      String(e?.message || e).slice(0, 500),
    );
    return "";
  }
}
