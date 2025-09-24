// src/pages/FreeVideoDetail.jsx
import React from "react";
import { useParams, Link } from "react-router-dom";
import { API_BASE } from "../config";

export default function FreeVideoDetail() {
  const { id } = useParams(); // Mongo _id
  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        // fetch single page (first page big) then find by _id
        const res = await fetch(`${API_BASE}/learn/free?page=1&pageSize=50`, {
          credentials: "include",
        });
        const data = await res.json();
        setItem((data.items || []).find((v) => v._id === id) || null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="card">Loading…</div>;
  if (!item) return <div className="card">Video not found.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card">
        <h1 className="text-2xl font-semibold mb-3">{item.title}</h1>
        <div className="rounded-xl overflow-hidden border">
          <iframe
            className="w-full aspect-video"
            src={`https://www.youtube.com/embed/${item.youtubeId}?autoplay=0&mute=0&controls=1&rel=0&modestbranding=1`}
            title={item.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        <div className="mt-5 flex gap-3">
          <a
            className="btn"
            href={`https://www.youtube.com/watch?v=${item.youtubeId}`}
            target="_blank"
            rel="noreferrer"
          >
            Watch on YouTube
          </a>
          <Link to="/learn" className="btn btn-ghost">
            Back to Learn
          </Link>
        </div>
      </div>
    </div>
  );
}
