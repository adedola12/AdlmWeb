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
 * Upsert a warm lead captured by the AI Agent into the same CRM database.
 * Idempotent by email. Never throws — returns a `notion` sub-document to
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
    const summary =
      `AI Agent lead${lead.name ? ` — ${lead.name}` : ""}. ` +
      (summaryParts.join(" ") || "Captured from website chat.");

    let contactId = result.contactPageId;
    if (!contactId && lead.email) {
      const q = await notionApi(`/databases/${crmDbId()}/query`, {
        method: "POST",
        body: {
          page_size: 1,
          filter: { property: "Email", email: { equals: lead.email } },
        },
      });
      contactId = q?.results?.[0]?.id || "";
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
        Name: title(lead.name || lead.email || "AI Agent Lead"),
        Stage: select("Lead"),
        "Activity Type": select("Chat"),
        "Follow-Up Status": select("Scheduled"),
        "Follow-Up Channel": select(lead.phone ? "WhatsApp" : "Email"),
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
