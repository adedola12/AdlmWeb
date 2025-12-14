// src/pages/AdminShowcase.jsx
import React from "react";

import { API_BASE } from "../config"; // adjust path

function AdminShowcase() {
  const [activeTab, setActiveTab] = React.useState("testimonials"); // 'testimonials' | 'companies' | 'leaders'
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  // upload state (shared for companies + leaders)
  const [uploading, setUploading] = React.useState(false);
  const [uploadPct, setUploadPct] = React.useState(0);
  const companyFileRef = React.useRef(null);
  const leaderFileRef = React.useRef(null);

  // ---- Testimonials ----
  const [testimonials, setTestimonials] = React.useState([]);
  const [tForm, setTForm] = React.useState({
    name: "",
    role: "",
    company: "",
    location: "",
    category: "Commercial",
    rating: 5,
    text: "",
    avatarUrl: "",
    linkedinUrl: "",
    featured: true,
  });

  // ---- Companies Trained ----
  const [companies, setCompanies] = React.useState([]);
  const [cForm, setCForm] = React.useState({
    name: "",
    code: "",
    location: "",
    logoUrl: "",
    website: "",
    featured: true,
  });

  // ---- Industry Leaders ----
  const [leaders, setLeaders] = React.useState([]);
  const [lForm, setLForm] = React.useState({
    name: "",
    code: "",
    logoUrl: "",
    website: "",
    featured: true,
  });

  /* ---------- Cloudinary upload helper ---------- */

  async function uploadImageToCloudinary(folder, file) {
    if (!file) return null;
    setUploading(true);
    setUploadPct(0);
    setError("");

    try {
      // admin signer – similar to your profile signer but under admin
      const sigRes = await fetch(`${API_BASE}/admin/media/sign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_type: "image",
          folder,
        }),
      });

      const sig = await sigRes.json();
      if (!sigRes.ok) {
        throw new Error(sig.error || "Failed to get upload signature");
      }

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
            setUploadPct(Math.round((ev.loaded / ev.total) * 100));
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
                  json?.error?.message || `Upload failed (${xhr.status})`
                )
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
      setTimeout(() => setUploadPct(0), 600);
      setUploading(false);
    }
  }

  async function onCompanyLogoPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImageToCloudinary(
        "adlm/showcase/companies",
        file
      );
      if (url) {
        setCForm((prev) => ({ ...prev, logoUrl: url }));
      }
    } catch (err) {
      setError(err.message || "Error uploading company logo");
    } finally {
      if (companyFileRef.current) companyFileRef.current.value = "";
    }
  }

  async function onLeaderLogoPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImageToCloudinary("adlm/showcase/leaders", file);
      if (url) {
        setLForm((prev) => ({ ...prev, logoUrl: url }));
      }
    } catch (err) {
      setError(err.message || "Error uploading leader logo");
    } finally {
      if (leaderFileRef.current) leaderFileRef.current.value = "";
    }
  }

  /* ---------- Loaders ---------- */

  async function loadTestimonials() {
    try {
      setError("");
      const res = await fetch(`${API_BASE}/showcase/testimonials`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load testimonials");
      const data = await res.json();
      setTestimonials(data.items || []);
    } catch (e) {
      console.error(e);
      setError(e.message || "Error loading testimonials");
    }
  }

  async function loadCompanies() {
    try {
      setError("");
      const res = await fetch(`${API_BASE}/showcase/companies`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load companies");
      const data = await res.json();
      setCompanies(data.items || []);
    } catch (e) {
      console.error(e);
      setError(e.message || "Error loading companies");
    }
  }

  async function loadLeaders() {
    try {
      setError("");
      const res = await fetch(`${API_BASE}/showcase/industry-leaders`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load industry leaders");
      const data = await res.json();
      setLeaders(data.items || []);
    } catch (e) {
      console.error(e);
      setError(e.message || "Error loading industry leaders");
    }
  }

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadTestimonials(), loadCompanies(), loadLeaders()]);
      setLoading(false);
    })();
  }, []);

  /* ---------- Change handlers ---------- */

  function handleTChange(e) {
    const { name, value, type, checked } = e.target;
    setTForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleCChange(e) {
    const { name, value, type, checked } = e.target;
    setCForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleLChange(e) {
    const { name, value, type, checked } = e.target;
    setLForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  /* ---------- Submit handlers ---------- */

  async function handleTestimonialSubmit(e) {
    e.preventDefault();
    setError("");

    if (
      !tForm.name ||
      !tForm.role ||
      !tForm.company ||
      !tForm.location ||
      !tForm.text
    ) {
      setError("Please fill in all required testimonial fields (*)");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/showcase/testimonials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...tForm,
          rating: Number(tForm.rating) || 5,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to create testimonial");
      }

      setTestimonials((prev) => [data.item, ...prev]);
      setTForm({
        name: "",
        role: "",
        company: "",
        location: "",
        category: "Commercial",
        rating: 5,
        text: "",
        avatarUrl: "",
        linkedinUrl: "",
        featured: true,
      });
    } catch (e) {
      console.error(e);
      setError(e.message || "Error creating testimonial");
    } finally {
      setLoading(false);
    }
  }

  async function handleCompanySubmit(e) {
    e.preventDefault();
    setError("");

    if (!cForm.name) {
      setError("Please provide at least a company name (*)");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/showcase/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(cForm),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to create company");
      }

      setCompanies((prev) => [data.item, ...prev]);
      setCForm({
        name: "",
        code: "",
        location: "",
        logoUrl: "",
        website: "",
        featured: true,
      });
    } catch (e) {
      console.error(e);
      setError(e.message || "Error creating company");
    } finally {
      setLoading(false);
    }
  }

  async function handleLeaderSubmit(e) {
    e.preventDefault();
    setError("");

    if (!lForm.name) {
      setError("Please provide industry leader name (*)");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/showcase/industry-leaders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(lForm),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to create industry leader");
      }

      setLeaders((prev) => [data.item, ...prev]);
      setLForm({
        name: "",
        code: "",
        logoUrl: "",
        website: "",
        featured: true,
      });
    } catch (e) {
      console.error(e);
      setError(e.message || "Error creating industry leader");
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Delete handlers ---------- */

  async function handleDeleteTestimonial(id) {
    if (!window.confirm("Delete this testimonial?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/showcase/testimonials/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete testimonial");
      setTestimonials((prev) => prev.filter((t) => t._id !== id));
    } catch (e) {
      console.error(e);
      setError(e.message || "Error deleting testimonial");
    }
  }

  async function handleDeleteCompany(id) {
    if (!window.confirm("Delete this company?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/showcase/companies/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete company");
      setCompanies((prev) => prev.filter((c) => c._id !== id));
    } catch (e) {
      console.error(e);
      setError(e.message || "Error deleting company");
    }
  }

  async function handleDeleteLeader(id) {
    if (!window.confirm("Delete this industry leader?")) return;
    try {
      const res = await fetch(
        `${API_BASE}/admin/showcase/industry-leaders/${id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error("Failed to delete industry leader");
      setLeaders((prev) => prev.filter((l) => l._id !== id));
    } catch (e) {
      console.error(e);
      setError(e.message || "Error deleting industry leader");
    }
  }

  /* ---------- UI helpers ---------- */

  const tabButtonClass = (tab) =>
    `px-3 py-1.5 rounded-full text-xs md:text-sm border ${
      activeTab === tab
        ? "bg-blue-600 text-white border-blue-600"
        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
    }`;

  return (
    <div className="min-h-screen bg-gray-50 px-4 md:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Showcase Management
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage customer testimonials, companies trained, and industry
              leaders displayed on the public site.
            </p>
          </div>
        </header>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm p-2 flex gap-2 w-full md:w-auto">
          <button
            type="button"
            className={tabButtonClass("testimonials")}
            onClick={() => setActiveTab("testimonials")}
          >
            Customer Testimonials
          </button>
          <button
            type="button"
            className={tabButtonClass("companies")}
            onClick={() => setActiveTab("companies")}
          >
            Companies Trained
          </button>
          <button
            type="button"
            className={tabButtonClass("leaders")}
            onClick={() => setActiveTab("leaders")}
          >
            Industry Leaders
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-white rounded-md px-3 py-2 shadow-sm">
            {error}
          </p>
        )}

        {uploading && (
          <div className="text-xs text-gray-600 flex items-center gap-2">
            <span>Uploading logo…</span>
            <div className="flex-1 h-2 bg-gray-200 rounded overflow-hidden max-w-[200px]">
              <div
                className="h-2 bg-blue-600 transition-all"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
            <span>{uploadPct}%</span>
          </div>
        )}

        {loading && (
          <p className="text-sm text-gray-500">Working... please wait.</p>
        )}

        {/* ---------- TAB: TESTIMONIALS ---------- */}

        {/* ---------- TAB: TESTIMONIALS ---------- */}
        {activeTab === "testimonials" && (
          <>
            <section className="bg-white rounded-xl shadow-sm p-4 md:p-6">
              <h2 className="text-lg font-semibold mb-4">Add Testimonial</h2>

              <form
                onSubmit={handleTestimonialSubmit}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    name="name"
                    value={tForm.name}
                    onChange={handleTChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role / Title *
                  </label>
                  <input
                    name="role"
                    value={tForm.role}
                    onChange={handleTChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company *
                  </label>
                  <input
                    name="company"
                    value={tForm.company}
                    onChange={handleTChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location *
                  </label>
                  <input
                    name="location"
                    value={tForm.location}
                    onChange={handleTChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. Lagos, Nigeria"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    name="category"
                    value={tForm.category}
                    onChange={handleTChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option>Commercial</option>
                    <option>Residential</option>
                    <option>Infrastructure</option>
                    <option>Sustainable</option>
                    <option>Industrial</option>
                    <option>Mixed-Use</option>
                    <option>Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rating (1–5)
                  </label>
                  <input
                    type="number"
                    name="rating"
                    min={1}
                    max={5}
                    value={tForm.rating}
                    onChange={handleTChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Testimonial Text *
                  </label>
                  <textarea
                    name="text"
                    value={tForm.text}
                    onChange={handleTChange}
                    rows={4}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Avatar Image URL
                  </label>
                  <input
                    name="avatarUrl"
                    value={tForm.avatarUrl}
                    onChange={handleTChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Paste direct image URL (e.g. LinkedIn photo URL)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    LinkedIn Profile URL
                  </label>
                  <input
                    name="linkedinUrl"
                    value={tForm.linkedinUrl}
                    onChange={handleTChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="https://www.linkedin.com/in/username"
                  />
                </div>

                <div className="flex items-center gap-2 md:col-span-2">
                  <input
                    id="featured"
                    type="checkbox"
                    name="featured"
                    checked={tForm.featured}
                    onChange={handleTChange}
                    className="h-4 w-4"
                  />
                  <label
                    htmlFor="featured"
                    className="text-sm text-gray-700 select-none"
                  >
                    Show on public testimonials section
                  </label>
                </div>

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {loading ? "Saving..." : "Save Testimonial"}
                  </button>
                </div>
              </form>
            </section>

            {/* existing testimonials */}
            <section className="bg-white rounded-xl shadow-sm p-4 md:p-6">
              <h2 className="text-lg font-semibold mb-4">
                Existing Testimonials ({testimonials.length})
              </h2>
              <div className="space-y-3">
                {testimonials.map((t) => (
                  <div
                    key={t._id}
                    className="flex items-start justify-between gap-3 border border-slate-100 rounded-lg px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {t.name} – {t.role}
                      </div>
                      <div className="text-xs text-gray-500">
                        {t.company} • {t.location} • {t.category}
                      </div>
                      <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {t.text}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteTestimonial(t._id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {testimonials.length === 0 && !loading && (
                  <p className="text-sm text-gray-500">No testimonials yet.</p>
                )}
              </div>
            </section>
          </>
        )}

        {/* ---------- TAB: COMPANIES TRAINED ---------- */}
        {activeTab === "companies" && (
          <>
            <section className="bg-white rounded-xl shadow-sm p-4 md:p-6">
              <h2 className="text-lg font-semibold mb-4">Add Company</h2>
              <form
                onSubmit={handleCompanySubmit}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name *
                  </label>
                  <input
                    name="name"
                    value={cForm.name}
                    onChange={handleCChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Short Code
                  </label>
                  <input
                    name="code"
                    value={cForm.code}
                    onChange={handleCChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. SC, A&S"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    name="location"
                    value={cForm.location}
                    onChange={handleCChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. Lagos, Nigeria"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Logo URL
                  </label>
                  <input
                    name="logoUrl"
                    value={cForm.logoUrl}
                    onChange={handleCChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Paste direct image URL or use upload button"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-200"
                      onClick={() => companyFileRef.current?.click()}
                      disabled={uploading}
                    >
                      Upload Logo
                    </button>
                    <input
                      ref={companyFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onCompanyLogoPick}
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website (optional)
                  </label>
                  <input
                    name="website"
                    value={cForm.website}
                    onChange={handleCChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="https://company.com"
                  />
                </div>

                <div className="md:col-span-2 flex items-center gap-2">
                  <input
                    id="company-featured"
                    type="checkbox"
                    name="featured"
                    checked={cForm.featured}
                    onChange={handleCChange}
                    className="h-4 w-4"
                  />
                  <label
                    htmlFor="company-featured"
                    className="text-sm text-gray-700 select-none"
                  >
                    Show on public companies section
                  </label>
                </div>

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {loading ? "Saving..." : "Save Company"}
                  </button>
                </div>
              </form>
            </section>

            <section className="bg-white rounded-xl shadow-sm p-4 md:p-6">
              <h2 className="text-lg font-semibold mb-4">
                Companies Trained ({companies.length})
              </h2>
              <div className="space-y-3">
                {companies.map((c) => (
                  <div
                    key={c._id}
                    className="flex items-start justify-between gap-3 border border-slate-100 rounded-lg px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {c.name} {c.code ? `(${c.code})` : ""}
                      </div>
                      {c.location && (
                        <div className="text-xs text-gray-500">
                          {c.location}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {c.website}
                      </div>
                      <div className="text-[10px] mt-1">
                        {c.featured
                          ? "Visible on public"
                          : "Hidden from public"}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteCompany(c._id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {companies.length === 0 && !loading && (
                  <p className="text-sm text-gray-500">No companies yet.</p>
                )}
              </div>
            </section>
          </>
        )}

        {/* ---------- TAB: INDUSTRY LEADERS ---------- */}
        {activeTab === "leaders" && (
          <>
            <section className="bg-white rounded-xl shadow-sm p-4 md:p-6">
              <h2 className="text-lg font-semibold mb-4">
                Add Industry Leader
              </h2>
              <form
                onSubmit={handleLeaderSubmit}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name / Organization *
                  </label>
                  <input
                    name="name"
                    value={lForm.name}
                    onChange={handleLChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. Skyline Construction"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Short Code
                  </label>
                  <input
                    name="code"
                    value={lForm.code}
                    onChange={handleLChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. SC"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Logo URL
                  </label>
                  <input
                    name="logoUrl"
                    value={lForm.logoUrl}
                    onChange={handleLChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Paste direct image URL or use upload button"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-200"
                      onClick={() => leaderFileRef.current?.click()}
                      disabled={uploading}
                    >
                      Upload Logo
                    </button>
                    <input
                      ref={leaderFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onLeaderLogoPick}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website (optional)
                  </label>
                  <input
                    name="website"
                    value={lForm.website}
                    onChange={handleLChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="https://organization.com"
                  />
                </div>

                <div className="md:col-span-2 flex items-center gap-2">
                  <input
                    id="leader-featured"
                    type="checkbox"
                    name="featured"
                    checked={lForm.featured}
                    onChange={handleLChange}
                    className="h-4 w-4"
                  />
                  <label
                    htmlFor="leader-featured"
                    className="text-sm text-gray-700 select-none"
                  >
                    Show on public industry leaders section
                  </label>
                </div>

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {loading ? "Saving..." : "Save Industry Leader"}
                  </button>
                </div>
              </form>
            </section>

            <section className="bg-white rounded-xl shadow-sm p-4 md:p-6">
              <h2 className="text-lg font-semibold mb-4">
                Industry Leaders ({leaders.length})
              </h2>
              <div className="space-y-3">
                {leaders.map((l) => (
                  <div
                    key={l._id}
                    className="flex items-start justify-between gap-3 border border-slate-100 rounded-lg px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {l.name} {l.code ? `(${l.code})` : ""}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {l.website}
                      </div>
                      <div className="text-[10px] mt-1">
                        {l.featured
                          ? "Visible on public"
                          : "Hidden from public"}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteLeader(l._id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {leaders.length === 0 && !loading && (
                  <p className="text-sm text-gray-500">
                    No industry leaders yet.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminShowcase;
