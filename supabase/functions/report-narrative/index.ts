// AI-assisted narrative. The model only ever sees the verified data_snapshot stored in the report row.
// It is an enhancement: the numbers in the report remain the source of truth. Requires ANTHROPIC_API_KEY.
import { callerClient, cors, json } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json(req, { error: "AI summaries are not configured on this server (ANTHROPIC_API_KEY missing)." }, 501);

  const db = callerClient(req);           // RLS applies: caller must be able to see + manage the report
  const { data: u } = await db.auth.getUser();
  if (!u?.user) return json(req, { error: "Not authenticated" }, 401);
  const { report_id } = await req.json().catch(() => ({}));
  const { data: report } = await db.from("project_reports").select("id,title,data_snapshot").eq("id", report_id).maybeSingle();
  if (!report) return json(req, { error: "Report not found" }, 404);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5",
      max_tokens: 1200,
      system: "You write professional monthly management summaries for an education department. Use ONLY the JSON data supplied. " +
        "Never introduce facts, numbers, names, dates or achievements that are not in the data. If a field is empty or null, say the data is not available. " +
        "Quote numbers exactly. Neutral, concise tone. Use short paragraphs, no markdown headings.",
      messages: [{ role: "user", content: "Generate a monthly management summary from this verified data. Do not introduce facts that are not present in the data.\n\n" + JSON.stringify(report.data_snapshot) }],
    }),
  });
  if (!res.ok) return json(req, { error: "The AI service returned an error." }, 502);
  const out = await res.json();
  const text = (out.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
  const { error } = await db.from("project_reports").update({ narrative: text }).eq("id", report.id);
  if (error) return json(req, { error: "Could not save the narrative (permission?)." }, 403);
  return json(req, { ok: true, narrative: text });
});
