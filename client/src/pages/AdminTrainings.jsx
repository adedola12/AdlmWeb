// src/pages/AdminTrainings.jsx
import React, { useEffect, useRef, useState } from "react";
import { API_BASE, CLOUD_NAME, UPLOAD_PRESET } from "../config";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

console.log("AdminTrainings config:", { CLOUD_NAME, UPLOAD_PRESET, API_BASE });

async function uploadToCloudinary(file) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UNSIGNED_PRESET in Vercel and redeploy."
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!res.ok) {
    let msg = "Failed to upload image";
    try {
      const data = await res.json();
      msg = data?.error?.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data?.secure_url)
    throw new Error("Upload succeeded but no URL returned");
  return data.secure_url;
}

export default function AdminTrainings() {
  const { accessToken } = useAuth();

  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    mode: "online",
    date: "",
    city: "",
    country: "",
    venue: "",
    attendees: "",
    tags: "",
    imageFile: null,
  });
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Prevent double-fetch in React StrictMode (DEV) without changing UI
  const didLoadRef = useRef(false);

  useEffect(() => {
    if (!API_BASE) {
      setError(
        "API_BASE is missing. Set VITE_API_BASE and redeploy the frontend."
      );
    }
  }, []);

  /* ---------------------------------- */
  /* Load trainings                     */
  /* ---------------------------------- */
  useEffect(() => {
    if (!API_BASE) return;
    if (!accessToken) return;

    // DEV strict-mode guard
    if (didLoadRef.current) return;
    didLoadRef.current = true;

    let mounted = true;

    async function load() {
      try {
        setError("");
        setLoadingList(true);

        // IMPORTANT: use apiAuthed so Authorization header is sent
        const data = await apiAuthed("/admin/trainings", {
          token: accessToken,
          method: "GET",
        });

        if (!mounted) return;
        setItems(data.items || []);
      } catch (err) {
        console.error(err);
        if (!mounted) return;

        const msg = String(err?.message || "");

        // make Unauthorized clearer
        if (/401|unauthorized/i.test(msg)) {
          setError(
            "Unauthorized. Please sign in again with an admin account (session may have expired)."
          );
        } else {
          setError(msg || "Failed to load trainings");
        }
      } finally {
        if (mounted) setLoadingList(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [accessToken]);

  function handleChange(e) {
    const { name, value, files } = e.target;
    if (name === "imageFile") {
      setForm((f) => ({ ...f, imageFile: files[0] || null }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!accessToken) {
      setError("Missing access token. Please sign in again.");
      return;
    }

    if (!form.imageFile) {
      setError("Please select an image");
      return;
    }
    if (!form.title || !form.date) {
      setError("Title and date are required");
      return;
    }

    try {
      setSaving(true);

      const imageUrl = await uploadToCloudinary(form.imageFile);

      // IMPORTANT: use apiAuthed so Authorization header is sent
      const data = await apiAuthed("/admin/trainings", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          mode: form.mode,
          date: form.date,
          city: form.city,
          country: form.country,
          venue: form.venue,
          attendees: form.attendees ? Number(form.attendees) : 0,
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          imageUrl,
        }),
      });

      setItems((prev) => [data.item, ...prev]);
      setSuccessMsg("Training created successfully");

      setForm((f) => ({
        ...f,
        title: "",
        description: "",
        date: "",
        city: "",
        country: "",
        venue: "",
        attendees: "",
        tags: "",
        imageFile: null,
      }));
      e.target.reset();
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || "");
      if (/401|unauthorized/i.test(msg)) {
        setError(
          "Unauthorized. Please sign in again with an admin account (session may have expired)."
        );
      } else {
        setError(msg || "Error creating training");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this training?")) return;

    if (!accessToken) {
      setError("Missing access token. Please sign in again.");
      return;
    }

    try {
      // IMPORTANT: use apiAuthed so Authorization header is sent
      await apiAuthed(`/admin/trainings/${id}`, {
        token: accessToken,
        method: "DELETE",
      });

      setItems((prev) => prev.filter((i) => i._id !== id));
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || "");
      if (/401|unauthorized/i.test(msg)) {
        setError(
          "Unauthorized. Please sign in again with an admin account (session may have expired)."
        );
      } else {
        setError(msg || "Error deleting training");
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 md:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Manage Trainings &amp; Events
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Add new training programs and manage the gallery shown on the
              public Trainings page.
            </p>
          </div>
        </header>

        {/* Form */}
        <section className="bg-white rounded-xl shadow-sm p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Add Training</h2>

          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          {successMsg && (
            <p className="text-sm text-green-600 mb-2">{successMsg}</p>
          )}

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"
          >
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mode *
              </label>
              <select
                name="mode"
                value={form.mode}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="online">Online</option>
                <option value="office">Office / Physical</option>
                <option value="conference">Conference / Seminar</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Country
              </label>
              <input
                type="text"
                name="country"
                value={form.country}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Venue / Platform
              </label>
              <input
                type="text"
                name="venue"
                value={form.venue}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. ADLM Studio HQ, Zoom, Radisson Blu"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Attendees (approx.)
              </label>
              <input
                type="number"
                name="attendees"
                value={form.attendees}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                min={0}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags (comma separated)
              </label>
              <input
                type="text"
                name="tags"
                value={form.tags}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. Revit, BIM 360, QS Digital"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cover Image *
              </label>
              <input
                type="file"
                name="imageFile"
                accept="image/*"
                onChange={handleChange}
                className="w-full text-sm"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                This will be uploaded to Cloudinary and used on the public
                Trainings page.
              </p>
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Training"}
              </button>
            </div>
          </form>
        </section>

        {/* Existing trainings list */}
        <section className="bg-white rounded-xl shadow-sm p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-4">
            Existing Trainings ({items.length})
          </h2>

          {loadingList && <p className="text-sm text-gray-600">Loading…</p>}

          {!loadingList && items.length === 0 && (
            <p className="text-sm text-gray-600">No trainings added yet.</p>
          )}

          <div className="space-y-3">
            {items.map((t) => (
              <div
                key={t._id}
                className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={t.imageUrl}
                    alt={t.title}
                    className="h-12 w-12 rounded object-cover"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {t.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t.mode} •{" "}
                      {t.date && new Date(t.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(t._id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
