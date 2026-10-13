// Public "Request access" endpoint. Writes through the service role with validation + rate limiting.
import { cors, isEmail, json, serviceClient, sha256Hex } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(req, { error: "Invalid request" }, 400); }

  const full_name = String(b.full_name ?? "").trim().slice(0, 120);
  const email = String(b.email ?? "").trim().toLowerCase();
  const phone = String(b.phone ?? "").trim().slice(0, 30) || null;
  const reason = String(b.reason ?? "").trim().slice(0, 1000) || null;
  if (full_name.length < 2 || !isEmail(email)) return json(req, { error: "Please enter your name and a valid email." }, 400);

  const db = serviceClient();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const ip_hash = await sha256Hex(`${ip}:${Deno.env.get("IP_SALT") ?? "ortsa"}`);
  const since24 = new Date(Date.now() - 24 * 3600e3).toISOString();
  const since1h = new Date(Date.now() - 3600e3).toISOString();

  const [{ count: byEmail }, { count: byIp }] = await Promise.all([
    db.from("access_requests").select("id", { count: "exact", head: true }).ilike("email", email).gte("created_at", since24),
    db.from("access_requests").select("id", { count: "exact", head: true }).eq("ip_hash", ip_hash).gte("created_at", since1h),
  ]);
  if ((byEmail ?? 0) >= 2 || (byIp ?? 0) >= 5) return json(req, { error: "Too many requests. Please try again later." }, 429);

  const { error } = await db.from("access_requests").insert({ full_name, email, phone, requested_reason: reason, ip_hash });
  if (error) return json(req, { error: "Could not record your request." }, 500);

  const { data: admins } = await db.from("user_roles").select("user_id, roles!inner(name)").eq("roles.name", "super_admin");
  if (admins?.length) {
    await db.from("notifications").insert(admins.map((a: any) => ({
      user_id: a.user_id, title: "New access request", message: `${full_name} (${email}) requested access.`,
      notification_type: "access_request",
    })));
  }
  // Same response whether or not the email already exists (no account enumeration).
  return json(req, { ok: true });
});
