// Controlled external teacher upload. No account needed; token is random, hashed at rest, expiring, revocable, use-limited.
// POST JSON {action:"context", token}             -> minimal context (project / school / teacher names only)
// POST multipart {action:"submit", token, file, name, email, comment}
import { cors, json, serviceClient, sha256Hex } from "../_shared/common.ts";

const MAX_BYTES = 20 * 1024 * 1024;
const TYPES: Record<string, { mimes: string[]; magic: number[][] }> = {
  pdf: { mimes: ["application/pdf"], magic: [[0x25, 0x50, 0x44, 0x46]] },
  jpg: { mimes: ["image/jpeg"], magic: [[0xff, 0xd8, 0xff]] },
  jpeg: { mimes: ["image/jpeg"], magic: [[0xff, 0xd8, 0xff]] },
  png: { mimes: ["image/png"], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  docx: { mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], magic: [[0x50, 0x4b, 0x03, 0x04]] },
  xlsx: { mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], magic: [[0x50, 0x4b, 0x03, 0x04]] },
  doc: { mimes: ["application/msword"], magic: [[0xd0, 0xcf, 0x11, 0xe0]] },
  xls: { mimes: ["application/vnd.ms-excel"], magic: [[0xd0, 0xcf, 0x11, 0xe0]] },
};

const GENERIC = "This link is invalid, expired or no longer active.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const db = serviceClient();
  const ctype = req.headers.get("content-type") ?? "";

  let action = ""; let token = ""; let form: FormData | null = null;
  if (ctype.includes("multipart/form-data")) {
    form = await req.formData(); action = String(form.get("action") ?? ""); token = String(form.get("token") ?? "");
  } else {
    try { const b = await req.json(); action = String(b.action ?? ""); token = String(b.token ?? ""); }
    catch { return json(req, { error: "Invalid request" }, 400); }
  }
  if (!/^[0-9a-f]{64}$/.test(token)) return json(req, { error: GENERIC }, 404);
  const hash = await sha256Hex(token);

  const { data: link } = await db.from("external_upload_links")
    .select("id,project_id,school_id,teacher_id,purpose,label,expires_at,max_uses,use_count,is_active")
    .eq("token_hash", hash).maybeSingle();
  const valid = link && link.is_active && (!link.expires_at || new Date(link.expires_at) > new Date())
    && (link.max_uses == null || link.use_count < link.max_uses);
  if (!valid) return json(req, { error: GENERIC }, 404);

  if (action === "context") {
    const [p, s, t] = await Promise.all([
      db.from("projects").select("name").eq("id", link.project_id).single(),
      link.school_id ? db.from("schools").select("name").eq("id", link.school_id).single() : Promise.resolve({ data: null }),
      link.teacher_id ? db.from("teachers").select("full_name").eq("id", link.teacher_id).single() : Promise.resolve({ data: null }),
    ]);
    return json(req, {
      project: p.data?.name ?? null, school: (s.data as any)?.name ?? null, teacher: (t.data as any)?.full_name ?? null,
      purpose: link.purpose, expires_at: link.expires_at,
      allowed_types: Object.keys(TYPES), max_mb: MAX_BYTES / 1024 / 1024,
    });
  }

  if (action !== "submit" || !form) return json(req, { error: "Unknown action" }, 400);
  const file = form.get("file");
  if (!(file instanceof File)) return json(req, { error: "Please choose a file." }, 400);
  if (file.size === 0 || file.size > MAX_BYTES) return json(req, { error: "File must be between 1 byte and 20 MB." }, 400);
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const rule = TYPES[ext];
  if (!rule || !rule.mimes.includes(file.type)) return json(req, { error: "This file type is not allowed." }, 400);
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!rule.magic.some((m) => m.every((b, i) => head[i] === b))) return json(req, { error: "The file content does not match its type." }, 400);

  const name = String(form.get("name") ?? "").trim().slice(0, 120) || null;
  const email = String(form.get("email") ?? "").trim().slice(0, 254) || null;
  const comment = String(form.get("comment") ?? "").trim().slice(0, 1000) || null;

  // Atomically claim one use (guards against races / over-use).
  const { data: claimed } = await db.from("external_upload_links")
    .update({ use_count: link.use_count + 1 }).eq("id", link.id).eq("use_count", link.use_count).eq("is_active", true).select("id");
  if (!claimed?.length) return json(req, { error: "Please try again." }, 409);

  const { data: sub, error: se } = await db.from("external_submissions").insert({
    upload_link_id: link.id, project_id: link.project_id, school_id: link.school_id, teacher_id: link.teacher_id,
    submitter_name: name, submitter_email: email, comment,
  }).select("id").single();
  if (se || !sub) { await db.from("external_upload_links").update({ use_count: link.use_count }).eq("id", link.id); return json(req, { error: "Could not save your submission." }, 500); }

  const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  const path = `${link.project_id}/external/${sub.id}/${crypto.randomUUID()}-${safe}`;
  const { error: ue } = await db.storage.from("project-files").upload(path, file, { contentType: file.type, upsert: false });
  if (ue) { await db.from("external_submissions").delete().eq("id", sub.id); return json(req, { error: "Upload failed. Please try again." }, 500); }

  let typeId: string | null = null;
  const { data: dt } = await db.from("document_types").select("id").is("project_id", null)
    .ilike("name", link.purpose ?? "Supporting Document").maybeSingle();
  typeId = dt?.id ?? (await db.from("document_types").select("id").is("project_id", null).eq("name", "Supporting Document").maybeSingle()).data?.id ?? null;

  const title = `${link.purpose ?? "External document"} - ${file.name}`.slice(0, 200);
  await db.from("documents").insert({
    project_id: link.project_id, school_id: link.school_id, teacher_id: link.teacher_id, document_type_id: typeId,
    uploaded_by: null, title, original_filename: file.name, storage_path: path, mime_type: file.type,
    file_size_bytes: file.size, external_submission_id: sub.id, status: "uploaded",
  });
  await db.rpc("external_notify_received", { p_project: link.project_id, p_submission: sub.id, p_doc_title: title });
  return json(req, { ok: true });
});
