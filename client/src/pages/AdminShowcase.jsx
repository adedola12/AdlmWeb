// src/pages/AdminShowcase.jsx
import React from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

function AdminShowcase() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

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

  async function loadTestimonials() {
    try {
      setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadTestimonials();
  }, []);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setTForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (
      !tForm.name ||
      !tForm.role ||
      !tForm.company ||
      !tForm.location ||
      !tForm.text
    ) {
      setError("Please fill in all required fields (*)");
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

  async function handleDelete(id) {
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

  return (
    <div className="min-h-screen bg-gray-50 px-4 md:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Customer Testimonials
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Add and manage testimonials used on the public testimonials
              section.
            </p>
          </div>
        </header>

        <section className="bg-white rounded-xl shadow-sm p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Add Testimonial</h2>

          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                name="name"
                value={tForm.name}
                onChange={handleChange}
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
                onChange={handleChange}
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
                onChange={handleChange}
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
                onChange={handleChange}
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
                onChange={handleChange}
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
                onChange={handleChange}
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
                onChange={handleChange}
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
                onChange={handleChange}
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
                onChange={handleChange}
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
                onChange={handleChange}
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
          {loading && <p className="text-sm text-gray-500 mb-2">Loading...</p>}
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
                  onClick={() => handleDelete(t._id)}
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
      </div>
    </div>
  );
}

export default AdminShowcase;
