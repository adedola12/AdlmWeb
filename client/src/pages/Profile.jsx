// src/pages/Profile.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { isAdmin, isStaff } from "../utils/roles.js";

export default function Profile() {
  const navigate = useNavigate();
  const { user, setAuth, accessToken } = useAuth();

  const staff = isStaff(user); // admin + mini_admin
  const admin = isAdmin(user); // admin only

  const [username, setUsername] = React.useState(user?.username || "");
  const [avatarUrl, setAvatarUrl] = React.useState(user?.avatarUrl || "");
  const [msg, setMsg] = React.useState("");
  const [imgErr, setImgErr] = React.useState(false);

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
        setZone(res?.zone || "");
        setZones(Array.isArray(res?.zones) ? res.zones : []);
      } catch (e) {
        setMsg(e?.message || "Failed to load profile.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function saveProfile(next = {}) {
    const body = { username, avatarUrl, zone, ...next };

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

  const placeholder = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    user?.email || "A",
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
    <div className="max-w-xl mx-auto space-y-6">
      {/* PROFILE CARD */}
      <div className="card">
        <h1 className="text-xl font-semibold mb-4">Profile</h1>

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
                      className="h-2 bg-blue-600 transition-all"
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

      {/* SECURITY + ADMIN CARD */}
      <div className="card">
        <h2 className="font-semibold mb-3">Security & Admin</h2>

        <div className="flex gap-2 flex-wrap">
          <Link to="/change-password" className="btn">
            Change password
          </Link>

          <Link to="/login?reset=1" className="btn">
            Forgot password
          </Link>

          {/* Full admin only */}
          {admin && (
            <>
              <Link to="/admin" className="btn">
                Admin dashboard
              </Link>

              <Link to="/admin/learn" className="btn">
                Video upload / courses
              </Link>

              <Link to="/admin/courses" className="btn">
                Admin · Courses
              </Link>
            </>
          )}

          {/* Staff tools (admin + mini_admin) */}
          {staff && (
            <>
              <Link to="/admin/trainings" className="btn">
                Add / manage trainings & events
              </Link>

              <Link to="/admin/rategen/add-rate" className="btn">
                Build / Add rates (Rate Library)
              </Link>

              <Link to="/admin/rategen" className="btn">
                Update material & labour prices
              </Link>

              <Link to="/admin/showcase" className="btn">
                Add / manage testimonials
              </Link>

              {/* ✅ NEW BUTTON: Mini-admin Users View */}
              <Link to="/admin/users-lite" className="btn">
                Users (Mini Admin View)
              </Link>
            </>
          )}
        </div>

        {/* Optional quick tools panel */}
        {staff && (
          <div className="mt-4 rounded-xl border bg-white p-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">Admin Tools</div>
                <div className="text-xs text-slate-500">
                  Quick access to admin management pages
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => navigate("/admin/freebies")}
                >
                  Add Freebies
                </button>

                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => navigate("/admin/coupons")}
                >
                  Coupons
                </button>

                {/* ✅ ALSO add it here if you want it grouped */}
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => navigate("/admin/users-lite")}
                >
                  Users Lite
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
