/**
 * Live check of the WhatsApp -> Notion CRM path.
 *
 * Creates a clearly-marked test contact in the real CRM, proves that a second
 * sync updates it rather than duplicating it, then archives the page and
 * removes the Lead. Archiving happens in a finally block so a failure part-way
 * still cleans up.
 *
 * The duplicate case is the whole point: it is the bug this work exists to
 * fix, and it can only be proven against the real database because it depends
 * on how Notion stores phone numbers.
 *
 *   node server/scripts/test-whatsapp-lead-sync.js
 */
import "dotenv/config";
import mongoose from "mongoose";
import fetch from "node-fetch";
import { connectDB } from "../db.js";
import { Lead } from "../models/Lead.js";
import { syncLeadToNotion, notionEnabled } from "../util/notion.js";

const TEST_PHONE = "+000000000001";
const CRM_DB = process.env.NOTION_CRM_DB_ID || "a8c37afbd5ec472bb24067181dbcb4dd";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`); }
};

async function notion(path, opts = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

/** Every CRM page carrying the test phone, however it is formatted. */
async function findTestPages() {
  const q = await notion(`/databases/${CRM_DB}/query`, {
    method: "POST",
    body: {
      page_size: 50,
      filter: { property: "Phone / WhatsApp", phone_number: { contains: "0000000" } },
    },
  });
  return (q.results || []).filter(
    (p) => (p.properties?.["Phone / WhatsApp"]?.phone_number || "").includes("000000000001")
  );
}

async function main() {
  if (!notionEnabled()) {
    console.error("NOTION_API_KEY not set - nothing to test");
    process.exit(1);
  }
  await connectDB(process.env.MONGO_URI);
  console.log("mongo + notion: connected\n");

  const created = [];
  try {
    await Lead.deleteMany({ phone: TEST_PHONE });
    for (const p of await findTestPages()) {
      await notion(`/pages/${p.id}`, { method: "PATCH", body: { archived: true } });
    }

    // ---- first sync: a hot lead ----
    const lead1 = await Lead.create({
      phone: TEST_PHONE, name: "TEST - delete me", firm: "Test QS Ltd",
      source: "whatsapp", interest: "Intent: i-Pricing. Stage: 03-Hot.",
      productKeys: ["revit"], note: "automated test",
    });
    const r1 = await syncLeadToNotion({
      ...lead1.toObject(), crmStage: "Negotiating", outcome: "Interested",
      category: "Lead", followUpDate: "2026-08-20",
    });
    if (r1.contactPageId) created.push(r1.contactPageId);

    check("first sync creates a contact", !!r1.contactPageId, r1.lastError);
    check("no error on create", !r1.lastError, r1.lastError);

    const page1 = await notion(`/pages/${r1.contactPageId}`);
    const props = page1.properties || {};
    check("Stage mapped to Negotiating",
      props.Stage?.select?.name === "Negotiating", props.Stage?.select?.name);
    check("Outcome set to Interested",
      props.Outcome?.select?.name === "Interested", props.Outcome?.select?.name);
    check("Company carries the firm",
      (props.Company?.rich_text?.[0]?.plain_text || "") === "Test QS Ltd");
    check("Follow-Up Channel is WhatsApp",
      props["Follow-Up Channel"]?.select?.name === "WhatsApp");
    check("Next Follow-Up Date set",
      props["Next Follow-Up Date"]?.date?.start === "2026-08-20");
    check("Notes say WhatsApp, not website",
      (props.Notes?.rich_text?.[0]?.plain_text || "").startsWith("WhatsApp lead"));

    // ---- second sync: THE duplicate test ----
    // Fresh object with no contactPageId, exactly as a later conversation
    // would arrive: it must find the existing contact by phone alone.
    const r2 = await syncLeadToNotion({
      phone: TEST_PHONE, name: "TEST - delete me", firm: "Test QS Ltd",
      email: "", source: "whatsapp", productKeys: ["revit"],
      note: "automated test second pass", notion: {},
      crmStage: "Closed Won", outcome: "Converted", category: "Client",
    });
    if (r2.contactPageId && !created.includes(r2.contactPageId)) created.push(r2.contactPageId);

    check("second sync reuses the same page", r2.contactPageId === r1.contactPageId,
      `${r1.contactPageId} vs ${r2.contactPageId}`);

    const all = await findTestPages();
    check("exactly one contact exists, not two", all.length === 1, `found ${all.length}`);

    const page2 = await notion(`/pages/${r1.contactPageId}`);
    check("stage advanced to Closed Won",
      page2.properties?.Stage?.select?.name === "Closed Won",
      page2.properties?.Stage?.select?.name);

    // ---- third sync: no stage supplied must not clobber ----
    await syncLeadToNotion({
      phone: TEST_PHONE, name: "TEST - delete me", email: "",
      source: "whatsapp", productKeys: [], notion: {},
    });
    const page3 = await notion(`/pages/${r1.contactPageId}`);
    check("a stageless sync leaves Stage alone",
      page3.properties?.Stage?.select?.name === "Closed Won",
      page3.properties?.Stage?.select?.name);
  } finally {
    for (const id of created) {
      await notion(`/pages/${id}`, { method: "PATCH", body: { archived: true } });
    }
    for (const p of await findTestPages()) {
      await notion(`/pages/${p.id}`, { method: "PATCH", body: { archived: true } });
    }
    await Lead.deleteMany({ phone: TEST_PHONE });
    console.log("\ncleaned up: test pages archived, test lead removed");
    await mongoose.disconnect();
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
