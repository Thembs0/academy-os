import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthProvider";
import { listLocalDrafts, saveLocalDraft } from "@/lib/offline";
import { syncDraft } from "@/services/observations";

type SyncState = "idle" | "syncing" | "complete" | "error";
interface Ctx { online: boolean; state: SyncState; pending: number; error: string | null; syncNow: () => Promise<void>; refreshPending: () => Promise<void> }
const SyncCtx = createContext<Ctx>({ online: true, state: "idle", pending: 0, error: null, syncNow: async () => {}, refreshPending: async () => {} });
export const useSync = () => useContext(SyncCtx);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const [state, setState] = useState<SyncState>("idle");
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const uid = profile?.id;

  const refreshPending = useCallback(async () => {
    if (!uid) return setPending(0);
    setPending((await listLocalDrafts(uid)).filter((d) => d.dirty || d.submitRequested).length);
  }, [uid]);

  const syncNow = useCallback(async () => {
    if (!uid || running.current || !navigator.onLine) return;
    const todo = (await listLocalDrafts(uid)).filter((d) => d.dirty || d.submitRequested);
    if (!todo.length) { setPending(0); return; }
    running.current = true; setState("syncing"); setError(null);
    let failed: string | null = null;
    for (const d of todo) {
      try { await syncDraft(d); }
      catch (e) { failed = (e as Error).message; await saveLocalDraft({ ...d, lastError: failed }); }
    }
    running.current = false;
    await refreshPending();
    qc.invalidateQueries({ queryKey: ["observations"] }); qc.invalidateQueries({ queryKey: ["dashboard"] });
    if (failed) { setState("error"); setError(failed); } else { setState("complete"); setTimeout(() => setState("idle"), 4000); }
  }, [uid, qc, refreshPending]);

  useEffect(() => {
    const on = () => { setOnline(true); syncNow(); }; const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [syncNow]);
  useEffect(() => { refreshPending(); syncNow(); const t = setInterval(syncNow, 60000); return () => clearInterval(t); }, [syncNow, refreshPending]);

  return <SyncCtx.Provider value={{ online, state, pending, error, syncNow, refreshPending }}>{children}</SyncCtx.Provider>;
}

export function ConnectivityBanner() {
  const { online, state, pending, error, syncNow } = useSync();
  if (online && state === "idle" && pending === 0) return null;
  let tone = "bg-slate-800 text-white", msg = "";
  if (!online) { tone = "bg-amber-500 text-slate-900"; msg = "You're offline. Your work has been saved on this device and will sync when connection is restored."; }
  else if (state === "syncing") msg = "SYNCING…";
  else if (state === "complete") { tone = "bg-emerald-600 text-white"; msg = "SYNC COMPLETE"; }
  else if (state === "error") { tone = "bg-red-600 text-white"; msg = `Sync problem: ${error}`; }
  else if (pending > 0) msg = `${pending} item${pending > 1 ? "s" : ""} waiting to sync.`;
  return (
    <div role="status" aria-live="polite" className={`${tone} px-4 py-2 text-center text-sm font-medium no-print`}>
      {msg} {online && (state === "error" || pending > 0) && state !== "syncing" && <button className="ml-2 underline" onClick={syncNow}>Sync now</button>}
    </div>
  );
}
