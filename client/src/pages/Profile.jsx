// src/pages/Profile.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { isAdmin, isStaff } from "../utils/roles.js";
import AccountActivity from "../features/account/AccountActivity.jsx";
import AdminLauncher from "../features/admin/AdminLauncher.jsx";

export default function Profile() {
  const navigate = useNavigate();
  const { user, setAuth, accessToken } = useAuth();

  const staff = isStaff(user); // admin + mini_admin
  const admin = isAdmin(user); // admin only

  const [username, setUsername] = React.useState(user?.username || "");
  const [avatarUrl, setAvatarUrl] = React.useState(user?.avatarUrl || "");
  const [firstName, setFirstName] = React.useState(user?.firstName || "");
  const [lastName, setLastName] = React.useState(user?.lastName || "");
  const [nameLocked, setNameLocked] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [imgErr, setImgErr] = React.useState(false);

  // Step-up (email-OTP) preference for sensitive actions.
  const [stepUpEnabled, setStepUpEnabled] = React.useState(!!user?.stepUpEnabled);
  const [savingStepUp, setSavingStepUp] = React.useState(false);

  const [zone, setZone] = React.useState("");
  const [zones, setZones] = React.useState([]); // from server labels

  // upload state
  const [uploading, setUploading] = React.useState(false);
  const [pct, setPct] = React.useState(0);
  const fileRef = React.useRef(null);

  React.useEffect(() => {
    setImgErr(false);
  }, [avatarUrl]);

  React.useEffect(() => {
    if (!accessToken) return;

    (async () => {
      try {
        const res = await apiAuthed("/me/profile", { token: accessToken });

        setUsername(res?.username || user?.username || "");
        setAvatarUrl(res?.avatarUrl || user?.avatarUrl || "");
        setFirstName(res?.firstName || user?.firstName || "");
        setLastName(res?.lastName || user?.lastName || "");
        setNameLocked(!!res?.nameLockedForCertificate);
        setZone(res?.zone || "");
        setZones(Array.isArray(res?.zones) ? res.zones : []);
        setStepUpEnabled(!!res?.stepUpEnabled);
      } catch (e) {
        setMsg(e?.message || "Failed to load profile.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function saveProfile(next = {}) {
    const body = { username, avatarUrl, zone, firstName, lastName, ...next };

    const res = await apiAuthed("/me/profile", {
      token: accessToken,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const updatedUser = res?.user || res;

    setAuth((prev) => ({
      ...prev,
      user: { ...(prev?.user || {}), ...(updatedUser || {}) },
    }));

    // If zone changed, force a token refresh so the new JWT includes the updated zone
    // This ensures RateGen API calls immediately use the new zone
    if (body.zone && body.zone !== user?.zone) {
      try {
        const refreshRes = await fetch("/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData?.accessToken) {
            setAuth((prev) => ({ ...prev, accessToken: refreshData.accessToken }));
            window.dispatchEvent(new CustomEvent("auth:refreshed", { detail: refreshData }));
          }
        }
      } catch {
        // Non-critical — token will refresh naturally within 15 min
      }
    }

    return updatedUser;
  }

  async function uploadToCloudinary(file) {
    if (!file) return null;

    setUploading(true);
    setPct(0);
    setMsg("Requesting upload ticket…");

    try {
      const sig = await apiAuthed(`/me/media/sign`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_type: "image",
          folder: "adlm/avatars",
        }),
      });

      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature);
      if (sig.folder) fd.append("folder", sig.folder);
      if (sig.public_id) fd.append("public_id", sig.public_id);
      if (sig.eager) fd.append("eager", sig.eager);

      const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${sig.resource_type}/upload`;

      const secureUrl = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setPct(Math.round((ev.loaded / ev.total) * 100));
          }
        };

        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText || "{}");
            if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) {
              resolve(json.secure_url);
            } else {
              reject(
                new Error(
                  json?.error?.message || `Upload failed (${xhr.status})`,
                ),
              );
            }
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(fd);
      });

      return secureUrl;
    } finally {
      setTimeout(() => setPct(0), 600);
      setUploading(false);
    }
  }

  async function onPickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;

    setMsg(`Uploading ${f.name}…`);
    setImgErr(false);

    try {
      const url = await uploadToCloudinary(f);
      if (!url) throw new Error("No URL returned");

      const withBust = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;

      setAvatarUrl(withBust);
      await saveProfile({ avatarUrl: url });

      setMsg("✅ Profile image updated.");
    } catch (err) {
      setMsg(`❌ ${err?.message || "Upload error"}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save(e) {
    e.preventDefault();
    setMsg("");
    setImgErr(false);

    if (!accessToken) {
      setMsg("Missing access token.");
      return;
    }

    try {
      await saveProfile();
      setMsg("Profile updated.");
    } catch (e2) {
      setMsg(e2?.message || "Failed to update profile.");
    }
  }

  async function toggleStepUp(next) {
    setSavingStepUp(true);
    setMsg("");
    try {
      await saveProfile({ stepUpEnabled: next });
      setStepUpEnabled(next);
      setMsg(
        next
          ? "Email verification is now required for deleting projects and locking contracts."
          : "Email verification turned off.",
      );
    } catch (e) {
      setMsg(e?.message || "Couldn't update the security setting.");
    } finally {
      setSavingStepUp(false);
    }
  }

  const placeholder = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    user?.username || user?.email || "A",
  )}`;

  const imgSrc = (avatarUrl || "").trim() || placeholder;
  const finalImgSrc = imgErr ? placeholder : imgSrc;

  const zoneOptions = (Array.isArray(zones) ? zones : []).map((z) => {
    const key =
      (z && typeof z === "object" ? z.key || z.value || z.id : z) ?? "";
    const label =
      (z && typeof z === "object" ? z.label || z.name || z.key : z) ?? "";
    return { key: String(key), label: String(label) };
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* IDENTITY HERO */}
      <div className="relative overflow-hidden rounded-2xl bg-adlm-navy text-white shadow-depth">
        <div aria-hidden="true" className="absolute inset-0 grid-overlay opacity-50 mask-radial" />
        <div aria-hidden="true" className="absolute -top-16 right-8 w-64 h-64 rounded-full bg-adlm-blue-600/20 blur-3xl animate-float" />
        <div aria-hidden="true" className="absolute -bottom-16 left-1/4 w-56 h-56 rounded-full bg-adlm-orange/15 blur-3xl animate-float-slow" />
        <div className="relative p-5 md:p-7 flex items-center gap-4">
          <img
            key={`hero-${finalImgSrc}`}
            src={finalImgSrc}
            onError={() => setImgErr(true)}
            className="w-20 h-20 rounded-2xl object-cover ring-2 ring-white/20 bg-slate-100 shadow-depth flex-shrink-0"
            alt="Profile"
          />
          <div className="min-w-0">
            <div className="text-xl md:text-2xl font-bold tracking-tight truncate">
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : (username || "Your profile")}
            </div>
            <div className="text-sm text-blue-100/80 truncate">{user?.email}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 ring-1 ring-white/20 capitalize">
                {user?.role || "member"}
              </span>
              {zone ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-adlm-orange/20 text-amber-200 ring-1 ring-adlm-orange/30">
                  {zone}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* PROFILE CARD */}
      <div className="card">
        <h1 className="text-xl font-semibold mb-4">Account details</h1>

        <div className="flex items-center gap-4 mb-4">
          <img
            key={finalImgSrc}
            src={finalImgSrc}
            onError={() => setImgErr(true)}
            className="w-16 h-16 rounded-full border object-cover bg-slate-100"
            alt="Profile"
          />

          <div className="flex-1">
            <div className="text-sm text-slate-600">{user?.email}</div>

            <div className="mt-2 flex items-center gap-3">
              <label
                className={`btn btn-sm ${
                  uploading ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                Upload new photo
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickFile}
                  disabled={!accessToken || uploading}
                />
              </label>

              {uploading && (
                <div className="flex items-center gap-2 text-xs text-slate-600 w-full max-w-[220px]">
                  <div className="flex-1 h-2 bg-slate-200 rounded overflow-hidden">
                    <div
                      className="h-2 bg-adlm-blue-700 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-right">{pct}%</span>
                </div>
              )}
            </div>

            {imgErr && (
              <div className="mt-2 text-xs text-red-600">
                Couldn’t load the image. Showing fallback avatar.
              </div>
            )}
          </div>
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="form-label">First Name</label>
              <input
                className="input disabled:bg-slate-100 disabled:cursor-not-allowed"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={nameLocked}
              />
            </div>
            <div>
              <label className="form-label">Last Name</label>
              <input
                className="input disabled:bg-slate-100 disabled:cursor-not-allowed"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={nameLocked}
              />
            </div>
          </div>

          {nameLocked && (
            <p className="text-xs text-amber-600">
              Your name is locked because it was used on a certificate. Contact
              support if you need a correction.
            </p>
          )}

          <div>
            <label className="form-label">Location (Geopolitical Zone)</label>
            <select
              className="input"
              value={zone || ""}
              onChange={(e) => setZone(e.target.value)}
            >
              <option value="">— Select zone —</option>
              {zoneOptions.map((z) => (
                <option key={z.key} value={z.key}>
                  {z.label}
                </option>
              ))}
            </select>

            <p className="text-xs text-slate-500 mt-1">
              Your RateGen prices will default to this zone when you sign in.{" "}
              <Link to="/rategen" className="underline">
                View Prices
              </Link>
            </p>
          </div>

          {msg && <div className="text-sm">{msg}</div>}
          {!accessToken && (
            <div className="text-sm text-red-600">Missing access token</div>
          )}

          <button className="btn w-full" disabled={!accessToken || uploading}>
            Save
          </button>
        </form>
      </div>

      {/* ORDERS · INVOICES · INSTALLATIONS (moved here from the dashboard) */}
      <AccountActivity />

      {/* SECURITY + ADMIN CARD */}
      <div className="card">
        <h2 className="font-semibold mb-3">Security & Admin</h2>

        {/* Two-factor (email OTP) for destructive actions */}
        <div className="mb-4 rounded-xl border bg-white dark:bg-adlm-dark-card p-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-adlm-blue-700"
              checked={stepUpEnabled}
              onChange={(e) => toggleStepUp(e.target.checked)}
              disabled={savingStepUp || !accessToken}
            />
            <span className="min-w-0">
              <span className="font-medium">
                Require an email code for destructive actions
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                When on, we email a 6-digit code to{" "}
                <span className="font-medium">{user?.email}</span> before you can
                delete projects or lock/unlock a contract. One code stays valid
                for about 10 minutes.{savingStepUp ? " Saving…" : ""}
              </span>
            </span>
          </label>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link to="/change-password" className="btn">
            Change password
          </Link>

          <Link to="/login?reset=1" className="btn">
            Forgot password
          </Link>
        </div>
      </div>

      {/* ADMIN TOOLS — permission-aware launcher (replaces the old flat list).
          Each card is gated by the user's role permissions via can(). */}
      {staff && (
        <div className="card">
          <AdminLauncher title="Admin tools" />
        </div>
      )}
    </div>
  );
}
