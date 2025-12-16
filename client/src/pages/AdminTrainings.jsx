// src/pages/AdminTrainings.jsx
import React, { useEffect, useRef, useState } from "react";
import { API_BASE, CLOUD_NAME, UPLOAD_PRESET } from "../config";
import { apiAuthed } from "../http.js";
import { useAuth } from "../store.jsx";

// console.log("AdminTrainings config:", { CLOUD_NAME, UPLOAD_PRESET, API_BASE });
// console.log("UPLOAD_PRESET being used:", UPLOAD_PRESET);
// console.log("CLOUD_NAME being used:", CLOUD_NAME);

function uploadToCloudinaryWithProgress(file, onProgress) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    return Promise.reject(
      new Error(
        "Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UNSIGNED_PRESET in Vercel and redeploy."
      )
    );
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

    xhr.open("POST", url);

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      onProgress?.(pct);
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) {
          if (!data?.secure_url || !data?.public_id) {
            return reject(new Error("Upload OK but missing url/public_id"));
          }
          return resolve({
            secure_url: data.secure_url,
            public_id: data.public_id,
          });
        }
        const msg = data?.error?.message || "Failed to upload image";
        reject(new Error(msg));
      } catch {
        reject(new Error("Failed to upload image"));
      }
    };

    xhr.onerror = () =>
      reject(new Error("Network error while uploading image"));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    xhr.send(formData);
  });
}

export default function AdminTrainings() {
  const { accessToken } = useAuth();

  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);

  // ✅ keep your form fields (do not remove)
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
    imageFile: [], // keep as requested (not used directly)
  });

  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // imageEntries: local selected images + upload progress + uploaded ids
  // { id, file, previewUrl, progress, status, errorMsg, uploadedUrl, uploadedPublicId }
  const [imageEntries, setImageEntries] = useState([]);

  // Prevent double-fetch in React StrictMode (DEV)
  const didLoadRef = useRef(false);

  // Keep latest imageEntries for cleanup on unmount
  const imageEntriesRef = useRef([]);
  useEffect(() => {
    imageEntriesRef.current = imageEntries;
  }, [imageEntries]);

  useEffect(() => {
    if (!API_BASE) {
      setError(
        "API_BASE is missing. Set VITE_API_BASE and redeploy the frontend."
      );
    }
  }, []);

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      imageEntriesRef.current.forEach((x) => {
        if (x.previewUrl) URL.revokeObjectURL(x.previewUrl);
      });
    };
  }, []);

  /* ------------------------------- */
  /* Load trainings                  */
  /* ------------------------------- */
  useEffect(() => {
    if (!API_BASE) return;
    if (!accessToken) return;

    if (didLoadRef.current) return;
    didLoadRef.current = true;

    let mounted = true;

    async function load() {
      try {
        setError("");
        setLoadingList(true);

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

  /* ------------------------------- */
  /* Form Change                     */
  /* ------------------------------- */
  function handleChange(e) {
    const { name, value, files } = e.target;

    // ✅ handle image multi-select
    if (name === "imageFiles") {
      const picked = files ? Array.from(files) : [];

      const newEntries = picked.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()
          .toString(16)
          .slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: "pending", // pending | uploading | done | error
        errorMsg: "",
        uploadedUrl: "",
        uploadedPublicId: "",
      }));

      setImageEntries((prev) => [...prev, ...newEntries]);

      // allow selecting same file again later
      e.target.value = "";
      return;
    }

    // normal form fields
    setForm((f) => ({ ...f, [name]: value }));
  }

  function removeImageEntryLocalOnly(id) {
    setImageEntries((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  }

  // ✅ Delete after upload (Cloudinary) — only works if image is already uploaded (status done)
  async function deleteUploadedImage(entry) {
    if (!accessToken) {
      setError("Missing access token. Please sign in again.");
      return;
    }
    if (!entry?.uploadedPublicId) {
      // fallback: just remove locally
      removeImageEntryLocalOnly(entry.id);
      return;
    }

    const confirmMsg =
      "This image has already been uploaded. Delete it from Cloudinary?";
    if (!window.confirm(confirmMsg)) return;

    try {
      setError("");

      // mark as uploading to block double actions
      setImageEntries((prev) =>
        prev.map((x) =>
          x.id === entry.id ? { ...x, status: "uploading", errorMsg: "" } : x
        )
      );

      await apiAuthed("/admin/trainings/cloudinary/delete", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: entry.uploadedPublicId }),
      });

      // remove entry
      removeImageEntryLocalOnly(entry.id);
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || "Failed to delete image");
      setImageEntries((prev) =>
        prev.map((x) =>
          x.id === entry.id ? { ...x, status: "error", errorMsg: msg } : x
        )
      );
      setError(msg);
    }
  }

  /* ------------------------------- */
  /* Submit                          */
  /* ------------------------------- */
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!accessToken) {
      setError("Missing access token. Please sign in again.");
      return;
    }

    if (!form.title || !form.date) {
      setError("Title and date are required");
      return;
    }

    if (!imageEntries.length) {
      setError("Please select at least one image");
      return;
    }

    try {
      setSaving(true);

      // mark all as uploading
      setImageEntries((prev) =>
        prev.map((x) => ({
          ...x,
          status: x.status === "done" ? "done" : "uploading",
          progress: x.status === "done" ? 100 : 0,
          errorMsg: "",
        }))
      );

      const imageUrls = [];
      const imagePublicIds = [];

      // upload sequentially (stable). If you want parallel later, I’ll adjust it.
      for (const entry of imageEntries) {
        // skip already-uploaded images (if admin saved earlier then changed mind)
        if (
          entry.status === "done" &&
          entry.uploadedUrl &&
          entry.uploadedPublicId
        ) {
          imageUrls.push(entry.uploadedUrl);
          imagePublicIds.push(entry.uploadedPublicId);
          continue;
        }

        try {
          const result = await uploadToCloudinaryWithProgress(
            entry.file,
            (pct) => {
              setImageEntries((prev) =>
                prev.map((x) =>
                  x.id === entry.id ? { ...x, progress: pct } : x
                )
              );
            }
          );

          setImageEntries((prev) =>
            prev.map((x) =>
              x.id === entry.id
                ? {
                    ...x,
                    status: "done",
                    progress: 100,
                    uploadedUrl: result.secure_url,
                    uploadedPublicId: result.public_id,
                  }
                : x
            )
          );

          imageUrls.push(result.secure_url);
          imagePublicIds.push(result.public_id);
        } catch (err) {
          const msg = String(err?.message || "Upload failed");
          setImageEntries((prev) =>
            prev.map((x) =>
              x.id === entry.id ? { ...x, status: "error", errorMsg: msg } : x
            )
          );
          throw new Error(msg);
        }
      }

      // save training to DB
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
          imageUrls,
          imagePublicIds, // ✅ store public ids for deletion later
        }),
      });

      setItems((prev) => [data.item, ...prev]);
      setSuccessMsg("Training created successfully");

      // cleanup previews
      imageEntries.forEach(
        (x) => x.previewUrl && URL.revokeObjectURL(x.previewUrl)
      );
      setImageEntries([]);

      // reset form fields (keep keys)
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
        imageFile: [],
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

  /* ------------------------------- */
  /* Delete training + images         */
  /* ------------------------------- */
  async function handleDelete(id) {
    if (
      !window.confirm("Delete this training (and its images from Cloudinary)?")
    )
      return;

    if (!accessToken) {
      setError("Missing access token. Please sign in again.");
      return;
    }

    try {
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

            {/* Images */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Images *
              </label>

              <input
                type="file"
                name="imageFiles"
                accept="image/*"
                multiple
                onChange={handleChange}
                className="w-full text-sm"
              />

              <p className="mt-1 text-xs text-gray-500">
                Select multiple images. You can remove any image before saving.
                Upload progress will show when you click “Save Training”. If you
                mistakenly uploaded an image, you can delete it from Cloudinary
                too.
              </p>

              {imageEntries.length > 0 && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {imageEntries.map((img) => (
                    <div
                      key={img.id}
                      className="border rounded-lg p-2 bg-gray-50"
                    >
                      <div className="relative">
                        <img
                          src={img.previewUrl}
                          alt="preview"
                          className="h-24 w-full object-cover rounded"
                        />

                        {/* Remove (before upload) OR Delete from Cloudinary (after upload) */}
                        {img.status === "done" ? (
                          <button
                            type="button"
                            onClick={() => deleteUploadedImage(img)}
                            disabled={saving}
                            className="absolute top-1 right-1 bg-white/90 text-red-600 text-xs px-2 py-1 rounded shadow hover:bg-white disabled:opacity-50"
                            title="Delete from Cloudinary"
                          >
                            Delete
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeImageEntryLocalOnly(img.id)}
                            disabled={saving && img.status === "uploading"}
                            className="absolute top-1 right-1 bg-white/90 text-red-600 text-xs px-2 py-1 rounded shadow hover:bg-white disabled:opacity-50"
                            title="Remove"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Progress */}
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[11px] text-gray-600">
                          <span>
                            {img.status === "pending" && "Ready"}
                            {img.status === "uploading" && "Uploading..."}
                            {img.status === "done" && "Uploaded"}
                            {img.status === "error" && "Failed"}
                          </span>
                          <span>{img.progress}%</span>
                        </div>

                        <div className="h-2 w-full bg-gray-200 rounded mt-1 overflow-hidden">
                          <div
                            className="h-2 bg-blue-600"
                            style={{ width: `${img.progress}%` }}
                          />
                        </div>

                        {img.status === "error" && (
                          <p className="text-[11px] text-red-600 mt-1">
                            {img.errorMsg}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                    src={(t.imageUrls && t.imageUrls[0]) || t.imageUrl}
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
