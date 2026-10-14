"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SEED } from "@/lib/seed";
import { bootState, useDashboard } from "@/lib/dashboard-data";
import type { DashboardState, Note } from "@/lib/types";

function newId() {
  return `n${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function Editor({
  note,
  onSave,
  onDelete,
  onClose,
}: {
  note: Note;
  onSave: (title: string, body: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0a1416] sm:max-w-xl sm:rounded-3xl"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="border-b border-white/[0.07] bg-transparent px-5 pb-3 pt-5 text-lg font-semibold text-[#eef6f4] placeholder:text-white/30 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Take a note…"
          rows={10}
          autoFocus
          className="flex-1 resize-none bg-transparent px-5 py-4 text-[15px] leading-relaxed text-[#eef6f4] placeholder:text-white/30 focus:outline-none"
        />
        <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-white/30">
              Edited {fmtDate(note.updatedAt)}
            </span>
            <button
              onClick={onDelete}
              className="text-xs text-red-400/80 hover:text-red-300"
            >
              Delete
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm text-white/60 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(title.trim() || "Untitled", body)}
              className="rounded-xl bg-[#e8b96a] px-5 py-2 text-sm font-semibold text-[#1a1206] hover:bg-[#f0c67e]"
            >
              Save
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function NotesApp({ initial }: { initial: DashboardState }) {
  const dash = useDashboard(initial);
  const notes = useMemo(
    () =>
      (dash.state.notes ?? [])
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [dash.state.notes]
  );
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = query.trim()
    ? notes.filter((n) =>
        `${n.title} ${n.body}`.toLowerCase().includes(query.trim().toLowerCase())
      )
    : notes;

  const editing = editingId ? notes.find((n) => n.id === editingId) ?? null : null;

  const addNote = () => {
    const id = newId();
    dash.push((s) => ({
      ...s,
      notes: [
        ...(s.notes ?? []),
        { id, title: "", body: "", updatedAt: new Date().toISOString() },
      ],
    }));
    setEditingId(id);
  };

  const saveNote = (id: string, title: string, body: string) => {
    dash.push((s) => ({
      ...s,
      notes: (s.notes ?? []).map((n) =>
        n.id === id ? { ...n, title, body, updatedAt: new Date().toISOString() } : n
      ),
    }));
    setEditingId(null);
  };

  const deleteNote = (id: string) => {
    if (!confirm("Delete this note?")) return;
    dash.push((s) => ({
      ...s,
      notes: (s.notes ?? []).filter((n) => n.id !== id),
    }));
    setEditingId(null);
  };

  return (
    <div className="min-h-dvh bg-[#05090b] text-[#eef6f4]">
      {/* header */}
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#05090b]/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <a
            href="/"
            aria-label="Back to constellation"
            title="Back to constellation"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-teal-100/70 transition hover:bg-white/10"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <h1 className="text-lg font-semibold tracking-wide">Notes</h1>
          <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-teal-100/70">
            {notes.length}
          </span>
          <div className="flex-1" />
          <div className="relative w-40 sm:w-64">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-full rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm placeholder:text-white/30 focus:border-[#e8b96a]/60 focus:outline-none"
            />
          </div>
        </div>
      </header>

      {/* take-a-note bar */}
      <div className="mx-auto max-w-5xl px-4 pt-5">
        <button
          onClick={addNote}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left text-white/40 transition hover:border-[#e8b96a]/40 hover:text-white/60"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8b96a] text-[#1a1206]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-[15px]">Take a note…</span>
        </button>
      </div>

      {/* grid */}
      <main className="mx-auto max-w-5xl px-4 py-5">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-white/35">
            {query ? "No notes match your search." : "No notes yet. Tap above to write one — works offline."}
          </p>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
            {filtered.map((n) => (
              <button
                key={n.id}
                onClick={() => setEditingId(n.id)}
                className="block w-full break-inside-avoid rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-[#e8b96a]/35 hover:bg-white/[0.05]"
              >
                {n.title ? (
                  <p className="font-semibold text-[#eef6f4]">{n.title}</p>
                ) : (
                  <p className="font-semibold text-white/30">Untitled</p>
                )}
                {n.body && (
                  <p className="mt-1.5 line-clamp-6 whitespace-pre-wrap text-sm leading-relaxed text-white/55">
                    {n.body}
                  </p>
                )}
                <p className="mt-3 font-mono text-[10px] text-white/30">{fmtDate(n.updatedAt)}</p>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* floating new-note button (phone) */}
      <button
        onClick={addNote}
        aria-label="New note"
        className="fixed bottom-6 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[#e8b96a] text-[#1a1206] shadow-xl transition hover:bg-[#f0c67e] sm:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>

      <AnimatePresence>
        {editing && (
          <Editor
            key={editing.id}
            note={editing}
            onSave={(t, b) => saveNote(editing.id, t, b)}
            onDelete={() => deleteNote(editing.id)}
            onClose={() => setEditingId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function NotesPage() {
  const [boot, setBoot] = useState<DashboardState | null>(null);
  useEffect(() => {
    setBoot(bootState());
  }, []);
  if (!boot)
    return (
      <div className="flex h-dvh items-center justify-center bg-[#05090b] text-white/50 text-sm">
        Loading notes…
      </div>
    );
  return <NotesApp initial={boot} />;
}
