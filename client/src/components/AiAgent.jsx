import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { API_BASE } from "../config";
import { FaRegCommentDots, FaTimes, FaPaperPlane } from "react-icons/fa";

/**
 * ADLM AI Agent ("Ada") — a conversion-focused conversational assistant that
 * is grounded in the live catalog (server: /agent/chat) and drives visitors to
 * sign up or purchase. Replaces the old keyword HelpBot.
 */

const SUPPORT_WHATSAPP = "2348106503524";
const SESSION_KEY = "adlm_agent_session";
const GREETING =
  "Hi 👋 I'm Ada, ADLM's product specialist. Tell me what you do — estimating, take-off, BIM, training — and I'll point you to the right tool and price. What are you working on?";
const SUGGESTIONS = [
  "I do rate build-ups / BOQs",
  "Take-off from Revit drawings",
  "Show me your trainings",
  "What does RateGen cost?",
];

/* -------------------- cart helper (mirrors Products.jsx) -------------------- */
function addToCart(productKey, months = 1) {
  let items = [];
  try {
    const arr = JSON.parse(localStorage.getItem("cartItems") || "[]");
    if (Array.isArray(arr)) items = arr;
  } catch {
    items = [];
  }
  const i = items.findIndex((it) => String(it.productKey) === String(productKey));
  const qty = Math.max(parseInt(months, 10) || 1, 1);
  if (i >= 0) items[i].qty = Math.max(parseInt(items[i].qty || 0, 10), 0) + qty;
  else items.push({ productKey, qty, firstTime: false });

  localStorage.setItem("cartItems", JSON.stringify(items));
  const total = items.reduce((s, it) => s + Number(it.qty || 0), 0);
  localStorage.setItem("cartCount", String(total));
}

function waLink(number, text) {
  const msg = encodeURIComponent(
    text || "Hi ADLM, I'd like to talk to someone about your products.",
  );
  return `https://wa.me/${number || SUPPORT_WHATSAPP}?text=${msg}`;
}

function getSessionId() {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        (crypto?.randomUUID && crypto.randomUUID()) ||
        `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `s_${Date.now()}`;
  }
}

export default function AiAgent() {
  const navigate = useNavigate();
  const { user, accessToken } = useAuth();

  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [messages, setMessages] = React.useState(() => [
    { role: "assistant", text: GREETING, actions: [] },
  ]);

  const sessionRef = React.useRef(getSessionId());
  const scrollRef = React.useRef(null);
  const idRef = React.useRef(0);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy, open]);

  function push(msg) {
    setMessages((prev) => {
      const next = [...prev, { _id: ++idRef.current, ...msg }];
      return next.length > 60 ? next.slice(-50) : next;
    });
  }

  async function send(textArg) {
    const text = String(textArg ?? input).trim();
    if (!text || busy) return;

    push({ role: "user", text });
    setInput("");
    setBusy(true);

    // History = prior turns (exclude the greeting), text only.
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-12)
      .map((m) => ({ role: m.role, text: m.text }));

    try {
      const headers = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE}/agent/chat`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          message: text,
          history,
          sessionId: sessionRef.current,
        }),
      });

      const json = await res.json().catch(() => ({}));
      const reply =
        json?.reply ||
        "Sorry — I couldn't process that. Please try again or reach us on WhatsApp.";
      push({ role: "assistant", text: reply, actions: json?.actions || [] });
    } catch {
      push({
        role: "assistant",
        text:
          "I'm having trouble reaching the server. You can browse products or reach us on WhatsApp and we'll help right away.",
        actions: [
          { type: "nav", label: "Browse products", to: "/products" },
          { type: "whatsapp", label: "Chat on WhatsApp", number: SUPPORT_WHATSAPP },
        ],
      });
    } finally {
      setBusy(false);
    }
  }

  function runAction(a) {
    if (!a) return;
    if (a.type === "buy" && a.productKey) {
      addToCart(a.productKey, a.months || 1);
      setOpen(false);
      navigate("/purchase");
    } else if (a.type === "signup") {
      setOpen(false);
      navigate("/signup");
    } else if (a.type === "nav" && a.to) {
      setOpen(false);
      navigate(a.to);
    } else if (a.type === "whatsapp") {
      window.open(
        waLink(a.number, `Hi ADLM, ${user?.name ? `${user.name} here. ` : ""}I need help.`),
        "_blank",
        "noopener,noreferrer",
      );
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed right-5 bottom-5 z-50 flex items-center gap-2 rounded-full pl-4 pr-5 py-3 shadow-xl
          bg-gradient-to-br from-adlm-blue-700 to-adlm-navy text-white hover:brightness-110
          active:scale-95 transition-transform ring-1 ring-white/15"
        aria-label={open ? "Close ADLM assistant" : "Open ADLM assistant"}
        title={open ? "Close assistant" : "Ask Ada — ADLM assistant"}
      >
        {open ? <FaTimes className="text-lg" /> : <FaRegCommentDots className="text-lg" />}
        {!open && <span className="text-sm font-semibold">Ask Ada</span>}
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-5 z-50 w-[390px] max-w-[94vw] rounded-2xl overflow-hidden
            bg-white dark:bg-adlm-dark-panel shadow-2xl ring-1 ring-black/10 dark:ring-white/10 flex flex-col"
          style={{ height: "min(70vh, 620px)" }}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-adlm-navy to-adlm-blue-700 text-white flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-white/15 grid place-items-center ring-1 ring-white/25">
              <FaRegCommentDots />
            </div>
            <div className="leading-tight">
              <div className="font-semibold">Ada · ADLM Assistant</div>
              <div className="text-[11px] opacity-80">
                Products, pricing, trainings — ask anything
              </div>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto p-3 space-y-3 bg-slate-50 dark:bg-adlm-dark-bg"
          >
            {messages.map((m, i) => (
              <div
                key={m._id ?? i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ring-1 ${
                    m.role === "user"
                      ? "bg-adlm-blue-700 text-white ring-adlm-blue-700/20"
                      : "bg-white dark:bg-adlm-dark-panel text-slate-900 dark:text-adlm-dark-text ring-black/5 dark:ring-white/10"
                  }`}
                >
                  <div>{m.text}</div>

                  {m.role === "assistant" &&
                    Array.isArray(m.actions) &&
                    m.actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.actions.map((a, idx) => {
                          const primary = a.type === "buy" || a.type === "signup";
                          return (
                            <button
                              key={idx}
                              onClick={() => runAction(a)}
                              className={`text-xs px-3 py-1.5 rounded-full font-medium transition active:scale-95 ${
                                primary
                                  ? "bg-adlm-orange text-white hover:brightness-110 shadow"
                                  : "bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-adlm-dark-text ring-1 ring-black/10 dark:ring-white/10 hover:bg-slate-200 dark:hover:bg-white/15"
                              }`}
                            >
                              {a.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                </div>
              </div>
            ))}

            {/* First-run suggestion chips */}
            {messages.length === 1 && !busy && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-white/10 text-slate-700 dark:text-adlm-dark-text ring-1 ring-black/10 dark:ring-white/10 hover:bg-slate-100 dark:hover:bg-white/15"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 bg-white dark:bg-adlm-dark-panel ring-1 ring-black/5 dark:ring-white/10">
                  <span className="inline-flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-black/5 dark:border-white/10 bg-white dark:bg-adlm-dark-panel flex gap-2">
            <input
              className="flex-1 rounded-xl px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-adlm-dark-text ring-1 ring-black/10 dark:ring-white/10 outline-none focus:ring-2 focus:ring-adlm-blue-700"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about products, pricing, trainings…"
              disabled={busy}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button
              className="rounded-xl px-3 py-2 text-sm bg-adlm-blue-700 text-white hover:brightness-110 disabled:opacity-50"
              onClick={() => send()}
              disabled={busy || !input.trim()}
              aria-label="Send"
            >
              <FaPaperPlane />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
