import { useState, useEffect, useCallback } from "react";
import { apiAuthed } from "../../http.js";

export function useTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiAuthed.get("/api/tasks");
      setTasks(res.data?.tasks ?? []);
    } catch (e) {
      setError(e?.message ?? "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function createTask(body) {
    const res = await apiAuthed.post("/api/tasks", body);
    const task = res.data?.task;
    if (task) setTasks(prev => [task, ...prev]);
    return task;
  }

  async function updateTask(taskKey, body) {
    const res = await apiAuthed.patch(`/api/tasks/${taskKey}`, body);
    const task = res.data?.task;
    if (task) {
      setTasks(prev => prev.map(t => (t.taskKey === taskKey ? task : t)));
    }
    return task;
  }

  async function deleteTask(taskKey) {
    await apiAuthed.delete(`/api/tasks/${taskKey}`);
    setTasks(prev => prev.filter(t => t.taskKey !== taskKey));
  }

  return { tasks, loading, error, refresh, createTask, updateTask, deleteTask };
}
