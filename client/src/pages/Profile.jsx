// src/pages/Profile.jsx
import React from "react";
import { useAuth } from "../store.js";
import { api } from "../api.js";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.js";

export default function Profile() {
  const { user, setAuth, accessToken } = useAuth();
  const [username, setUsername] = React.useState(user?.username || "");
  const [avatarUrl, setAvatarUrl] = React.useState(user?.avatarUrl || "");
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const res = await apiAuthed("/me/profile", { token: accessToken });
        setUsername(res.username || "");
        setAvatarUrl(res.avatarUrl || "");
      } catch {}
    })();
  }, []);

  async function save(e) {
    e.preventDefault();
    setMsg("");
    try {
      const res = await apiAuthed("/me/profile", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, avatarUrl }),
      });
      // persist the updated user in the auth store
      setAuth((prev) => ({ ...prev, user: { ...prev.user, ...res.user } }));
      setMsg("Profile updated.");
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold mb-4">Profile</h1>

        <div className="flex items-center gap-4 mb-4">
          <img
            src={
              avatarUrl ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                user?.email || "A"
              )}`
            }
            className="w-16 h-16 rounded-full border object-cover"
            alt=""
          />
          <div className="text-sm text-slate-600">{user?.email}</div>
        </div>

        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="form-label">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Profile image URL</label>
            <input
              className="input"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">
              (Optional) Paste a link to an image hosted online.
            </p>
          </div>
          {msg && <div className="text-sm">{msg}</div>}
          {!accessToken && (
            <div className="text-sm text-red-600">Missing access token</div>
          )}

          <button className="btn w-full">Save</button>
        </form>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Security</h2>
        <div className="flex gap-2">
          <a href="/change-password" className="btn">
            Change password
          </a>
          <a href="/login?reset=1" className="btn">
            Forgot password
          </a>
          {/* hook this to a real reset flow later */}
        </div>
      </div>
    </div>
  );
}
