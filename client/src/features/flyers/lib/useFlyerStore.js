// Server-backed flyer store. Replaces the NIQS engine's localStorage hook with
// CRUD against /admin/flyers (see server/routes/admin.flyers.js). The list
// holds raw server docs ({ _id, title, template, data, thumbnailUrl, ... });
// callers normalise `data` into a full flyer with normalizeFlyer() on load.
import { useCallback, useEffect, useState } from "react";
import { apiAuthed } from "../../../http.js";

export function useFlyerStore(accessToken) {
  const [flyers, setFlyers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiAuthed("/admin/flyers", { token: accessToken });
      setFlyers(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setError(e?.message || "Failed to load flyers");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Create (no id) or update (id present). Returns the saved server doc.
  const saveFlyer = useCallback(
    async ({ id, title, template, data, thumbnailUrl }) => {
      const body = { title, template, data, thumbnailUrl };
      const res = id
        ? await apiAuthed(`/admin/flyers/${id}`, {
            token: accessToken,
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiAuthed("/admin/flyers", {
            token: accessToken,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res?.ok) throw new Error(res?.error || "Save failed");
      await reload();
      return res.item;
    },
    [accessToken, reload],
  );

  const deleteFlyer = useCallback(
    async (id) => {
      const res = await apiAuthed(`/admin/flyers/${id}`, {
        token: accessToken,
        method: "DELETE",
      });
      if (!res?.ok) throw new Error(res?.error || "Delete failed");
      await reload();
    },
    [accessToken, reload],
  );

  return { flyers, loading, error, reload, saveFlyer, deleteFlyer };
}
