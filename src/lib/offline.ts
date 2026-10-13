import { createStore, del, get, keys, set } from "idb-keyval";

/** Local drafts live in IndexedDB so a half-finished observation survives lost signal, tab close and phone restarts. */
const store = createStore("stem-academy", "observation-drafts");

export interface ObsFormData {
  school_id: string | null; teacher_id: string | null; observed_at: string | null; subject: string; grade: string; caps_topic: string;
  technology_tools: string; samr_level: "S" | "A" | "M" | "R" | null; learning_outcomes: string; evidence: string;
  strength_1: string; strength_2: string; strength_3: string; development_area: string; practical_suggestion: string;
  post_observation_conversation: string; agreed_action: string; next_observation_date: string | null;
  teacher_acknowledged: boolean; acknowledgement_method: string | null; acknowledgement_note: string;
  extra: Record<string, string>; // answers for any additional template fields (observation_answers)
}
export const emptyForm = (): ObsFormData => ({
  school_id: null, teacher_id: null, observed_at: null, subject: "", grade: "", caps_topic: "", technology_tools: "", samr_level: null,
  learning_outcomes: "", evidence: "", strength_1: "", strength_2: "", strength_3: "", development_area: "", practical_suggestion: "",
  post_observation_conversation: "", agreed_action: "", next_observation_date: null, teacher_acknowledged: false,
  acknowledgement_method: null, acknowledgement_note: "", extra: {},
});

export interface LocalFile { id: string; name: string; type: string; size: number; blob: Blob; docTypeName: string; uploadedDocId?: string }
export interface LocalDraft {
  clientRef: string; userId: string; projectId: string; serverId?: string; data: ObsFormData; files: LocalFile[];
  dirty: boolean; submitRequested: boolean; updatedAt: number; step: number; lastError?: string;
}

export const saveLocalDraft = (d: LocalDraft) => set(d.clientRef, { ...d, updatedAt: Date.now() }, store);
export const getLocalDraft = (ref: string) => get<LocalDraft>(ref, store);
export const deleteLocalDraft = (ref: string) => del(ref, store);
export async function listLocalDrafts(userId: string): Promise<LocalDraft[]> {
  const ks = await keys(store);
  const all = await Promise.all(ks.map((k) => get<LocalDraft>(k, store)));
  return (all.filter((d): d is LocalDraft => !!d && d.userId === userId)).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function findLocalByServerId(userId: string, serverId: string) {
  return (await listLocalDrafts(userId)).find((d) => d.serverId === serverId);
}

/** Reference data (schools/teachers) cached for offline use in the field. */
export interface RefData { schools: { id: string; name: string }[]; teachers: { id: string; full_name: string; school_id: string }[]; assigned: string[]; at: number }
export const cacheRef = (userId: string, projectId: string, r: RefData) => set(`ref:${userId}:${projectId}`, r, store);
export const getRef = (userId: string, projectId: string) => get<RefData>(`ref:${userId}:${projectId}`, store);
