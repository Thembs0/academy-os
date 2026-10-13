import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anon);

// Single Supabase client for the whole app. Only the anon key is ever used in the browser.
export const supabase = createClient(url ?? "http://localhost:54321", anon ?? "missing-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const BUCKET = "project-files";

/** Short-lived signed URL for a private file. Never store or share the result. */
export async function signedUrl(path: string, seconds = 120, bucket = BUCKET): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  if (error || !data) throw new Error(error?.message ?? "Could not open file");
  return data.signedUrl;
}

export function errMsg(e: unknown): string {
  if (!e) return "Something went wrong";
  if (typeof e === "string") return e;
  return (e as { message?: string }).message ?? "Something went wrong";
}
