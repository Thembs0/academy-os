import { supabase, BUCKET } from "@/lib/supabase/client";
import { DOC_ALLOWED_EXT, DOC_ALLOWED_MIME, MAX_UPLOAD_MB } from "@/lib/constants";
import { uuid } from "@/utils/format";

export function validateFile(file: { name: string; type: string; size: number }, maxMb = MAX_UPLOAD_MB): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!DOC_ALLOWED_EXT.includes(ext)) return `".${ext}" files are not allowed. Allowed: ${DOC_ALLOWED_EXT.join(", ")}.`;
  if (!DOC_ALLOWED_MIME.includes(file.type)) return "This file's type is not allowed.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > maxMb * 1024 * 1024) return `File is larger than ${maxMb} MB.`;
  return null;
}

/** Resize large photos before upload (saves mobile data). Non-images / failures return the original. */
export async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 300 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const out: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
    return out && out.size < file.size ? out : file;
  } catch { return file; }
}

export const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);

/** Upload to private storage with real progress (XHR), using the signed-in user's token. */
export async function uploadWithProgress(path: string, blob: Blob, contentType: string, onProgress?: (pct: number) => void): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You are signed out.");
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_ANON_KEY as string);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(parseErr(xhr.responseText) || `Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(blob);
  });
}
const parseErr = (t: string) => { try { return JSON.parse(t).message as string; } catch { return ""; } };

export interface UploadArgs {
  projectId: string; file: Blob; filename: string; mime: string; title: string; typeId?: string | null;
  schoolId?: string | null; teacherId?: string | null; observationId?: string | null; onProgress?: (p: number) => void;
}
export async function uploadDocument(a: UploadArgs): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("You are signed out.");
  const folder = a.observationId ? `observations/${a.observationId}` : a.schoolId ? `schools/${a.schoolId}` : "general";
  const path = `${a.projectId}/${folder}/${uuid()}-${safeName(a.filename)}`;
  await uploadWithProgress(path, a.file, a.mime, a.onProgress);
  const { data, error } = await supabase.from("documents").insert({
    project_id: a.projectId, document_type_id: a.typeId ?? null, uploaded_by: u.user.id, school_id: a.schoolId ?? null,
    teacher_id: a.teacherId ?? null, observation_id: a.observationId ?? null, title: a.title, original_filename: a.filename,
    storage_path: path, mime_type: a.mime, file_size_bytes: a.file.size,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}
