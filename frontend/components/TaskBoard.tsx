"use client";

import { useState, useEffect } from "react";
import { LiveblocksProvider, RoomProvider, useStorage, useMutation, useRoom } from "@liveblocks/react";
import { useTheme } from "@/context/ThemeContext";
import { useWallet } from "@/context/WalletContext";
import { Input } from "@/components/reactbits/Input";
import { ClipboardList, Hammer, CheckCircle2 } from "lucide-react";

interface Task {
  [key: string]: string | number;
  id: string;
  title: string;
  column: "todo" | "progress" | "done";
  createdAt: number;
}

const COLUMNS = [
  { key: "todo" as const, label: "To Do", icon: ClipboardList },
  { key: "progress" as const, label: "In Progress", icon: Hammer },
  { key: "done" as const, label: "Done", icon: CheckCircle2 },
];

function buildBoardRoomId(jobId: string) {
  const isSub = jobId.startsWith("sc-");
  const scopedId = isSub ? jobId.slice(3) : jobId;
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID || "0";
  const contractAddress = (isSub
    ? process.env.NEXT_PUBLIC_SUB_CONTRACTING
    : process.env.NEXT_PUBLIC_JOB_MARKET) || "0x0";
  return `board-${chainId}-${contractAddress.toLowerCase()}-${isSub ? "sc" : "job"}-${scopedId}`;
}

type ColumnKey = "todo" | "progress" | "done";

function InnerBoard({ jobId, onClose, readOnly }: { jobId: string; onClose: () => void; readOnly?: boolean }) {
  const { colors } = useTheme();
  const room = useRoom();
  const tasks = (useStorage((root) => root.tasks as Task[] | undefined) ?? []);
  const [storageReady, setStorageReady] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const persist = useMutation(
    ({ storage }, next: Task[]) => {
      storage.set("tasks", next);
    },
    [],
  );

  useEffect(() => {
    let mounted = true;
    room.waitUntilStorageReady().then(() => {
      if (mounted) setStorageReady(true);
    }).catch(() => {
      if (mounted) setStorageReady(false);
    });
    return () => {
      mounted = false;
    };
  }, [room]);

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const addTask = () => {
    if (!storageReady || !newTask.trim() || readOnly) return;
    persist([
      ...tasks,
      { id: Date.now().toString(), title: newTask.trim(), column: "todo", createdAt: Date.now() },
    ]);
    setNewTask("");
  };

  const moveTask = (id: string, to: ColumnKey) => {
    if (!storageReady || readOnly) return;
    persist(tasks.map(t => t.id === id ? { ...t, column: to } : t));
  };

  const removeTask = (id: string) => {
    if (!storageReady || readOnly) return;
    if (!confirm("Delete this task?")) return;
    persist(tasks.filter(t => t.id !== id));
  };

  const onDragStart = (id: string) => setDragId(id);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (col: ColumnKey) => {
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
          <button onClick={addTask} disabled={!storageReady || !newTask.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: colors.primary, color: colors.primaryText }}>Add</button>
        </div>
        )}

        {!storageReady && (
          <div className="px-4 py-2 text-xs" style={{ color: colors.mutedFg, borderBottom: `1px solid ${colors.cardBorder}` }}>
            Syncing board storage...
          </div>
        )}

        {/* Columns */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-3 gap-4 min-h-75">
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
                    <div key={task.id} draggable={!readOnly && storageReady} onDragStart={() => !readOnly && storageReady && onDragStart(task.id)}
                      className={`rounded-lg p-3 border ${readOnly || !storageReady ? "" : "cursor-grab active:cursor-grabbing"} group`}
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

export default function TaskBoard({ jobId, onClose, readOnly = false }: { jobId: string; onClose: () => void; readOnly?: boolean }) {
  const { address } = useWallet();
  const roomId = buildBoardRoomId(jobId);

  if (!address) {
    return null;
  }

  return (
    <LiveblocksProvider
      authEndpoint={async () => {
        const res = await fetch(`/api/board/token?jobId=${encodeURIComponent(jobId)}`, {
          headers: {
            "x-wallet-address": address,
          },
        });

        if (!res.ok) {
          throw new Error("Failed to authorize task board session.");
        }

        return await res.json();
      }}
    >
      <RoomProvider
        id={roomId}
        initialStorage={{ tasks: [] }}
      >
        <InnerBoard jobId={jobId} onClose={onClose} readOnly={readOnly} />
      </RoomProvider>
    </LiveblocksProvider>
  );
}

