import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { API_BASE } from "../config";

/**
 * ADLM AI Agent ("Ada") — a conversion-focused conversational assistant that
 * is grounded in the live catalog (server: /agent/chat) and drives visitors to
 * sign up or purchase. Replaces the old keyword HelpBot.
 */

// His mark. One glyph at two sizes: 26px on the launcher, 32px in the header.
const MARK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3l2.2 5.1L19.5 10l-5.3 1.9L12 17l-2.2-5.1L4.5 10l5.3-1.9L12 3z" />
  </svg>
);

const SUPPORT_WHATSAPP = "2348106503524";
const SESSION_KEY = "adlm_agent_session";
// His greeting and his chips, word for word. The claim in the second sentence
// is one we can actually keep: /agent/chat is grounded in the catalogue and
// says so when it does not know.
const GREETING =
  "I am Ada. Ask me what a product does, what it costs, or which one your drawings need. " +
  "I answer from what ADLM publishes: if I do not know, I will say so.";
const SUGGESTIONS = [
  "What does it cost?",
  "Which tool do I need?",
  "Build me a quotation",
  "Do you do training?",
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
        "Sorry, I couldn't process that. Please try again or reach us on WhatsApp.";
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
        // firstName/lastName, not `name` — buildAuthPayload has never sent a
        // joined one, so this always fell through to the anonymous wording
        // even for somebody signed in.
        waLink(
          a.number,
          `Hi ADLM, ${
            [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim()
              ? `${[user.firstName, user.lastName].filter(Boolean).join(" ").trim()} here. `
              : ""
          }I need help.`,
        ),
        "_blank",
        "noopener,noreferrer",
      );
    }
  }

  return (
    // Richard's Ada, on our answers.
    //
    // His markup and his classes throughout — .ada-w / .ada-btn / .ada-mk /
    // .ada-p / .ada-h / .ada-log / .ada-m / .ada-chips / .ada-f / .ada-go /
    // .ada-foot — all of which the CSS porter already brought across into
    // ds.css. The .ds wrapper is what scopes them; without it this renders
    // unstyled.
    //
    // What is NOT his is everything behind it. His Ada scores keywords against
    // published copy and picks a canned answer. This one posts to /agent/chat,
    // which is Claude with the live catalogue and the caller's own entitlements
    // in front of it, and can return actions — add to cart, sign up, open
    // WhatsApp — that his cannot. His .ada-links styling is what those actions
    // wear, because he drew a place for them and it fits.
    <div className="ds">
      <div className={open ? "ada-w on" : "ada-w"}>
        <button
          type="button"
          className="ada-btn"
          aria-expanded={open}
          aria-controls="ada-panel"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="ada-mk">{MARK}</span>
          <span className="ada-lb">Ask Ada</span>
        </button>

        <section className="ada-p" id="ada-panel" hidden={!open} aria-label="Ask Ada">
          <header className="ada-h">
            <span className="ada-mk sm">{MARK}</span>
            <div>
              <b>Ada</b>
              <span>Answers from ADLM, not the internet</span>
            </div>
            <button
              type="button"
              className="ada-x"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          <div className="ada-log" ref={scrollRef} role="log" aria-live="polite">
            {messages.map((m, i2) => (
              <div
                key={m._id ?? i2}
                className={`ada-m ${m.role === "user" ? "ada-q" : "ada-a"}`}
              >
                <div style={{ whiteSpace: "pre-line" }}>{m.text}</div>

                {m.role === "assistant" &&
                  Array.isArray(m.actions) &&
                  m.actions.length > 0 && (
                    <div className="ada-links">
                      {m.actions.map((a, idx) => (
                        <a
                          key={idx}
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            runAction(a);
                          }}
                        >
                          {a.label}
                        </a>
                      ))}
                    </div>
                  )}
              </div>
            ))}

            {busy && (
              <div className="ada-m ada-a" aria-label="Ada is typing">
                <span className="ada-dots">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>

          {messages.length === 1 && !busy && (
            <div className="ada-chips">
              {SUGGESTIONS.map((sug) => (
                <button type="button" key={sug} onClick={() => send(sug)}>
                  {sug}
                </button>
              ))}
            </div>
          )}

          <form
            className="ada-f"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a product, a price, training…"
              aria-label="Ask Ada a question"
              disabled={busy}
            />
            <button
              type="submit"
              className="ada-go"
              aria-label="Send"
              disabled={busy || !input.trim()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 12h15M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>

          <p className="ada-foot">
            Ada is part of the studio, not a product. Nothing here is a quote until you{" "}
            <a
              href="/quote"
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
                navigate("/quote");
              }}
            >
              build one
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
