// Privileged user administration. The service-role key lives ONLY here.
// Actions: invite | set_active | reject_request
import { callerClient, cors, isEmail, json, serviceClient } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const caller = callerClient(req);
  const { data: auth } = await caller.auth.getUser();
  if (!auth?.user) return json(req, { error: "Not authenticated" }, 401);
  const { data: canManage } = await caller.rpc("has_permission", { p_code: "users.manage" });
  if (!canManage) return json(req, { error: "You are not permitted to manage users." }, 403);

  const admin = serviceClient();
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid JSON" }, 400); }

  try {
    if (body.action === "invite") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = String(body.full_name ?? "").trim();
      const roles: string[] = Array.isArray(body.roles) ? body.roles : [];
      const assignments: { project_id: string; project_role: string }[] = Array.isArray(body.assignments) ? body.assignments : [];
      if (!isEmail(email) || fullName.length < 2) return json(req, { error: "A valid email and full name are required." }, 400);
      if (roles.length === 0) return json(req, { error: "Assign at least one role." }, 400);

      const { data: roleRows, error: re } = await admin.from("roles").select("id,name").in("name", roles);
      if (re || !roleRows || roleRows.length !== roles.length) return json(req, { error: "Unknown role supplied." }, 400);

      const redirectTo = `${Deno.env.get("SITE_URL") ?? ""}/set-password`;
      const { data: invited, error: ie } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName }, redirectTo,
      });
      if (ie || !invited?.user) return json(req, { error: ie?.message ?? "Invitation failed" }, 400);
      const uid = invited.user.id;

      await admin.from("profiles").upsert({ id: uid, full_name: fullName, email }, { onConflict: "id" });
      await admin.from("user_roles").upsert(roleRows.map((r) => ({ user_id: uid, role_id: r.id, assigned_by: auth.user.id })));
      for (const a of assignments) {
        await admin.from("project_members").insert({
          project_id: a.project_id, user_id: uid, project_role: a.project_role, assigned_by: auth.user.id,
        });
      }
      if (body.access_request_id) {
        await admin.from("access_requests").update({ status: "approved", reviewed_by: auth.user.id, reviewed_at: new Date().toISOString() })
          .eq("id", body.access_request_id);
      }
      await admin.from("audit_logs").insert({
        actor_id: auth.user.id, action: "user.invited", entity_type: "profiles", entity_id: uid,
        new_values: { email, roles, assignments },
      });
      return json(req, { ok: true, user_id: uid });
    }

    if (body.action === "set_active") {
      const uid = String(body.user_id ?? ""); const active = Boolean(body.active);
      if (uid === auth.user.id) return json(req, { error: "You cannot deactivate yourself." }, 400);
      const { error: be } = await admin.auth.admin.updateUserById(uid, { ban_duration: active ? "none" : "876000h" });
      if (be) return json(req, { error: be.message }, 400);
      await admin.from("profiles").update({ is_active: active }).eq("id", uid);
      if (!active) {
        // History is preserved: end (never delete) active assignments.
        await admin.from("project_members").update({ is_active: false, end_date: new Date().toISOString().slice(0, 10) })
          .eq("user_id", uid).eq("is_active", true);
      }
      await admin.from("audit_logs").insert({
        actor_id: auth.user.id, action: active ? "user.reactivated" : "user.deactivated", entity_type: "profiles", entity_id: uid,
      });
      return json(req, { ok: true });
    }

    if (body.action === "reject_request") {
      await admin.from("access_requests").update({ status: "rejected", reviewed_by: auth.user.id, reviewed_at: new Date().toISOString() })
        .eq("id", String(body.access_request_id ?? ""));
      return json(req, { ok: true });
    }
    return json(req, { error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json(req, { error: "Unexpected error" }, 500);
  }
});
