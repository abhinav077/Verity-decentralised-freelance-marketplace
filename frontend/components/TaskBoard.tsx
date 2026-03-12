"use client";
import { useState, useEffect, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";
import { Input } from "@/components/reactbits/Input";
import { ClipboardList, Hammer, CheckCircle2 } from "lucide-react";

interface Task { id: string; title: string; column: "todo" | "progress" | "done"; createdAt: number; }

const COLUMNS = [
  { key: "todo" as const, label: "To Do", icon: ClipboardList },
  { key: "progress" as const, label: "In Progress", icon: Hammer },
  { key: "done" as const, label: "Done", icon: CheckCircle2 },
];

function storageKey(jobId: string) { return `verity:tasks:${jobId}`; }

export default function TaskBoard({ jobId, onClose, readOnly = false }: { jobId: string; onClose: () => void; readOnly?: boolean }) {
  const { colors } = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  // Load
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const raw = localStorage.getItem(storageKey(jobId));
      if (raw) {
        const parsed = JSON.parse(raw) as Task[];
        timer = setTimeout(() => setTasks(parsed), 0);
      } else {
        timer = setTimeout(() => setTasks([]), 0);
      }
    } catch {}
    return () => { if (timer) clearTimeout(timer); };
  }, [jobId]);

  // Save
  const persist = useCallback((t: Task[]) => {
    setTasks(t);
    try { localStorage.setItem(storageKey(jobId), JSON.stringify(t)); } catch {}
  }, [jobId]);

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const addTask = () => {
    if (!newTask.trim()) return;
    persist([...tasks, { id: Date.now().toString(), title: newTask.trim(), column: "todo", createdAt: Date.now() }]);
    setNewTask("");
  };

  const moveTask = (id: string, to: Task["column"]) => {
    persist(tasks.map(t => t.id === id ? { ...t, column: to } : t));
  };

  const removeTask = (id: string) => {
    if (!confirm("Delete this task?")) return;
    persist(tasks.filter(t => t.id !== id));
  };

  // Drag & Drop
  const onDragStart = (id: string) => setDragId(id);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (col: Task["column"]) => {
    if (dragId) { moveTask(dragId, col); setDragId(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="rounded-2xl w-full max-w-4xl shadow-2xl max-h-[90vh] flex flex-col" style={{ background: colors.cardBg }}>
        {/* Header */}
        <div className="flex items-center justify-between p-5" style={{ borderBottom: `1px solid ${colors.cardBorder}` }}>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: colors.pageFg }}><ClipboardList size={20} /> Task Board — Job #{jobId}</h2>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: colors.mutedFg }}>&times;</button>
        </div>

        {/* Add task */}
        {!readOnly && (
        <div className="p-4 flex gap-2" style={{ borderBottom: `1px solid ${colors.cardBorder}` }}>
          <Input value={newTask} onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addTask(); }}
            placeholder="Add a new task…"
            containerClassName="flex-1" />
          <button onClick={addTask} disabled={!newTask.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: colors.primary, color: colors.primaryText }}>Add</button>
        </div>
        )}

        {/* Columns */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-3 gap-4 min-h-[300px]">
            {COLUMNS.map(col => (
              <div key={col.key}
                onDragOver={onDragOver}
                onDrop={() => onDrop(col.key)}
                className="rounded-xl p-3 border flex flex-col"
                style={{ background: colors.inputBg, borderColor: colors.cardBorder }}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: colors.pageFg }}>
                  <col.icon size={14} /> {col.label}
                  <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full" style={{ background: colors.primaryLight, color: colors.primaryFg }}>
                    {tasks.filter(t => t.column === col.key).length}
                  </span>
                </h3>
                <div className="space-y-2 flex-1">
                  {tasks.filter(t => t.column === col.key).map(task => (
                    <div key={task.id} draggable={!readOnly} onDragStart={() => !readOnly && onDragStart(task.id)}
                      className={`rounded-lg p-3 border ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'} group`}
                      style={{ background: colors.cardBg, borderColor: colors.cardBorder }}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm leading-snug" style={{ color: colors.pageFg,
                          textDecoration: col.key === "done" ? "line-through" : "none",
                          opacity: col.key === "done" ? 0.7 : 1 }}>
                          {task.title}
                        </p>
                        {!readOnly && <button onClick={() => removeTask(task.id)}
                          className="text-xs shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: colors.dangerText }}>✕</button>}
                      </div>
                      {!readOnly && <div className="flex gap-1 mt-2">
                        {col.key !== "todo" && (
                          <button onClick={() => moveTask(task.id, col.key === "done" ? "progress" : "todo")}
                            className="text-[10px] px-1.5 py-0.5 rounded border"
                            style={{ borderColor: colors.cardBorder, color: colors.mutedFg }}>← Back</button>
                        )}
                        {col.key !== "done" && (
                          <button onClick={() => moveTask(task.id, col.key === "todo" ? "progress" : "done")}
                            className="text-[10px] px-1.5 py-0.5 rounded border"
                            style={{ borderColor: colors.primary + "55", color: colors.primaryFg }}>Next →</button>
                        )}
                      </div>}
                    </div>
                  ))}
                  {tasks.filter(t => t.column === col.key).length === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: colors.mutedFg }}>
                      {col.key === "todo" ? "No tasks yet" : col.key === "progress" ? "Drag tasks here" : "Complete tasks appear here"}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
