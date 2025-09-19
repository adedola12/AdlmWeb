import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../store.jsx";

export default function Login() {
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const next = qs.get("next") || "/";

  const { setAuth } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    setErr("");
    setLoading(true);
    try {
      // server accepts identifier OR email; identifier also allows username logins
      const res = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: email.trim(), password }),
      });
      setAuth({
        user: res.user,
        accessToken: res.accessToken,
        licenseToken: res.licenseToken,
      });
      nav(next, { replace: true });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto card">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          className="input"
          placeholder="Email or username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />
        <input
          className="input"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button className="btn w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
