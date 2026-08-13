import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import { connectDB } from "./db.js";
import { WhatsAppChat } from "./models/WhatsAppChat.js";
import { User } from "./models/User.js";
import { signAccess } from "./middleware/auth.js";
import { loadRoleCache } from "./util/rbac.js";
import adminWhatsapp from "./routes/admin.whatsapp.js";

let pass=0, fail=0;
const check=(l,ok,d="")=>{ if(ok){pass++;console.log(`  ok   ${l}`);} else {fail++;console.log(`  FAIL ${l}${d?" - "+d:""}`);} };

await connectDB(process.env.MONGO_URI);
await loadRoleCache();
const admin = await User.findOne({ role: "admin" }).select("_id").lean();
const token = signAccess({ sub: String(admin._id), _id: String(admin._id), role: "admin" });

const app = express();
app.use(express.json());
app.use("/admin/whatsapp", adminWhatsapp);
const server = app.listen(4997);
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const get = (p,h=H) => fetch(`http://localhost:4997${p}`,{headers:h}).then(async r=>({status:r.status, body:await r.json().catch(()=>({}))}));
const patch = (p,b) => fetch(`http://localhost:4997${p}`,{method:"PATCH",headers:H,body:JSON.stringify(b)}).then(async r=>({status:r.status, body:await r.json().catch(()=>({}))}));

const TEST = ["+000000000101","+000000000102","+000000000103","+000000000104"];
const day = 86400000;
try {
  await WhatsAppChat.deleteMany({ phone: { $in: TEST } });
  await WhatsAppChat.insertMany([
    { phone: TEST[0], name:"Hot Lead", stage:"03-Hot", intent:"i-Pricing", products:["p-HERON"], ops:[],
      priority:"P2", lists:["Hot Leads"], next_action:"Send pricing", owner:"bot",
      last_message:new Date(Date.now()-3*day), first_seen:new Date(Date.now()-4*day),
      transcript:[{role:"user",text:"How much is HERON?",at:new Date()}], context:[{role:"user",content:"x"}] },
    { phone: TEST[1], name:"Blocked", stage:"04-Customer", intent:"i-Support", products:["p-QUIV"],
      ops:["x-NeedsHuman","x-PaymentIssue"], priority:"P1", lists:["Awaiting Human","Payment Problems"],
      owner:"bot", last_message:new Date(Date.now()-1*day), first_seen:new Date(Date.now()-1*day) },
    { phone: TEST[2], name:"Roads", stage:"05-Waitlist", intent:"i-Enterprise", products:["p-CIVIQ"], ops:[],
      priority:"P2", lists:["Waitlist - CIVIQ","Enterprise"], owner:"bot",
      last_message:new Date(Date.now()-10*day), first_seen:new Date(Date.now()-10*day) },
    { phone: TEST[3], name:"Overdue", stage:"02-Enquiry", intent:"i-Training", products:[], ops:[],
      priority:"P3", lists:["Training Pipeline"], owner:"bot", follow_up_on:new Date(Date.now()-2*day),
      last_message:new Date(Date.now()-2*day), first_seen:new Date(Date.now()-2*day) },
  ]);

  check("401 without a token", (await get("/admin/whatsapp/queues", {})).status===401);

  const q = await get("/admin/whatsapp/queues");
  const n = Object.fromEntries((q.body.queues||[]).map(x=>[x.name,x.count]));
  check("admin reaches the board without a role change", q.status===200);
  check("nine queues", (q.body.queues||[]).length===9);
  check("Hot Leads = 1", n["Hot Leads"]===1, `${n["Hot Leads"]}`);
  check("Awaiting Human = 1", n["Awaiting Human"]===1, `${n["Awaiting Human"]}`);
  check("Payment Problems = 1", n["Payment Problems"]===1, `${n["Payment Problems"]}`);
  check("Waitlist - CIVIQ = 1", n["Waitlist - CIVIQ"]===1, `${n["Waitlist - CIVIQ"]}`);
  check("Waitlist - ArchiCAD = 0", n["Waitlist - ArchiCAD"]===0, `${n["Waitlist - ArchiCAD"]}`);
  check("Enterprise = 1", n["Enterprise"]===1, `${n["Enterprise"]}`);
  check("Training Pipeline = 1", n["Training Pipeline"]===1, `${n["Training Pipeline"]}`);
  check("Follow-up Due = 1", n["Follow-up Due"]===1, `${n["Follow-up Due"]}`);
  check("Dormant = 0", n["Dormant - Re-engage"]===0, `${n["Dormant - Re-engage"]}`);

  const hot = await get("/admin/whatsapp/chats?list=Hot%20Leads");
  check("Hot Leads list has exactly the hot chat",
    (hot.body.items||[]).length===1 && hot.body.items[0].phone===TEST[0], `${(hot.body.items||[]).length}`);
  check("transcripts excluded from list view", hot.body.items[0].transcript===undefined);

  const all = await get("/admin/whatsapp/chats?limit=50");
  const idx=(p)=>(all.body.items||[]).findIndex(i=>i.phone===p);
  check("oldest first", idx(TEST[2])<idx(TEST[3]) && idx(TEST[3])<idx(TEST[1]),
    `roads@${idx(TEST[2])} overdue@${idx(TEST[3])} blocked@${idx(TEST[1])}`);

  const d = await get(`/admin/whatsapp/chats/${encodeURIComponent(TEST[0])}`);
  check("detail is the right chat", d.body.phone===TEST[0]);
  check("detail includes transcript", (d.body.transcript||[]).length===1);
  check("detail excludes claude context", d.body.context===undefined);

  const s1 = await get("/admin/whatsapp/chats?q=Roads");
  check("search matches only Roads", (s1.body.items||[]).length===1 && s1.body.items[0].phone===TEST[2],
    `${(s1.body.items||[]).length}`);

  const own = await patch(`/admin/whatsapp/chats/${encodeURIComponent(TEST[0])}`, { owner:"Dolapo" });
  check("assign owner hits the right chat", own.body.phone===TEST[0] && own.body.owner==="Dolapo");

  const cl = await patch(`/admin/whatsapp/chats/${encodeURIComponent(TEST[1])}`, { clearOps:["x-NeedsHuman"] });
  check("clear ops hits the right chat", cl.body.phone===TEST[1], cl.body.phone);
  check("ops flag removed", !(cl.body.ops||[]).includes("x-NeedsHuman"), JSON.stringify(cl.body.ops));
  check("dropped out of Awaiting Human", !(cl.body.lists||[]).includes("Awaiting Human"), JSON.stringify(cl.body.lists));
  check("still in Payment Problems", (cl.body.lists||[]).includes("Payment Problems"), JSON.stringify(cl.body.lists));

  check("rejects invalid stage", (await patch(`/admin/whatsapp/chats/${encodeURIComponent(TEST[0])}`,{stage:"99-X"})).status===400);
  check("404 for unknown phone", (await patch("/admin/whatsapp/chats/%2B000000000999",{owner:"x"})).status===404);

  const s = await get("/admin/whatsapp/summary");
  check("summary: open P1", s.body.attention?.openP1===1, JSON.stringify(s.body.attention));
  check("summary: follow-ups due", s.body.attention?.followUpsDue===1);
  check("summary: awaiting human now 0", s.body.attention?.awaitingHuman===0);
  check("summary: stage breakdown", (s.body.breakdown?.byStage||[]).length===4);
  check("summary: product counts", (s.body.breakdown?.products||[]).length===2);
} finally {
  await WhatsAppChat.deleteMany({ phone: { $in: TEST } });
  server.close(); await mongoose.disconnect();
  console.log("\ncleaned up");
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail===0?0:1);
