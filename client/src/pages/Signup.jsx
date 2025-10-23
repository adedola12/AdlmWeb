import React from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../store.jsx";

export default function Signup() {
  const nav = useNavigate();
  const { setAuth } = useAuth();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function normalizeWhatsApp(v) {
    // Strip spaces/dashes; keep + and digits
    let s = (v || "").replace(/[^\d+]/g, "");
    // If it starts with 0 and you want NG default, you could convert to +234 here.
    // Example (optional):
    // if (s.startsWith("0")) s = "+234" + s.slice(1);
    return s;
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await api("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          whatsapp: normalizeWhatsApp(whatsapp),
        }),
      });
      setAuth({
        user: res.user, // now includes firstName, lastName, whatsapp
        accessToken: res.accessToken,
        licenseToken: res.licenseToken, // if your API returns this
      });
      nav("/");
    } catch (e) {
      setErr(e.message || "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto card">
      <h1 className="text-xl font-semibold mb-4">Create account</h1>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input"
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>

        <input
          className="input"
          placeholder="WhatsApp number (e.g. +2348012345678)"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          required
        />

        <input
          className="input"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button className="btn w-full" disabled={busy}>
          {busy ? "Creating…" : "Sign up"}
        </button>
      </form>
    </div>
  );
}
