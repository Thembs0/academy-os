import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { Alert, LabeledInput } from "@/components/ui";
import { fmtDate } from "@/utils/format";

interface Info {
  ok: boolean;
  expired?: boolean;
  project_name?: string;
  school_name?: string | null;
  facilitator_name?: string | null;
  register_type?: string;
  session_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  topic?: string | null;
  reason?: string;
}

export default function ExternalSigninPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  const info = useQuery({
    queryKey: ["external-signin-info", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_external_register_info", { p_token: token });
      if (error) throw error;
      return data as Info;
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("submit_external_signin", {
        p_token: token,
        p_full_name: fullName.trim(),
        p_phone: phone.trim() || null,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => setDone(true),
  });

  const fmtTime = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";

  if (info.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (info.error || !info.data?.ok) {
    return <ErrorScreen title="Sign-in link not found" text="Ask your facilitator to share a fresh link." />;
  }

if (info.data.expired) {
  const who = info.data.facilitator_name
    ? ` Contact your Facilitator, ${info.data.facilitator_name}.`
    : " Contact your facilitator.";
  return (
    <ErrorScreen
      title="Sign-in is closed"
      text={`This session's sign-in window has passed.${who}`}
    />
  );
}

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-md">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-100/70">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="mt-4 text-xl font-extrabold tracking-tight">You're signed in</h1>
            <p className="mt-2 text-sm text-slate-600">
              Your attendance has been recorded for <strong>{info.data.project_name}</strong> on {fmtDate(info.data.session_date ?? "")}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Attendance sign-in</div>
          <h1 className="mt-1 text-xl font-extrabold tracking-tight">{info.data.project_name}</h1>
          <div className="mt-1 text-sm text-slate-600">
            {info.data.school_name ? `${info.data.school_name} · ` : ""}
            {fmtDate(info.data.session_date ?? "")} · {fmtTime(info.data.start_time)} - {fmtTime(info.data.end_time)}
          </div>
          {info.data.topic && <div className="mt-1 text-sm text-slate-600">Topic: {info.data.topic}</div>}

          <div className="mt-5 space-y-3">
            <LabeledInput
              label="Your full name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Thabo Mokoena"
            />
            <LabeledInput
              label="Cell phone number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 082 123 4567"
            />
            <LabeledInput
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything you want to add"
            />
          </div>

          {submit.error && (
            <div className="mt-3">
              <Alert tone="red">{errMsg(submit.error)}</Alert>
            </div>
          )}

          <button
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-5 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submit.isPending || fullName.trim().length < 2}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? "Signing you in…" : "Sign in"}
          </button>

          <p className="mt-4 text-center text-xs text-slate-500">
            Your name and number will be shared with the facilitator for attendance only.
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({ title, text }: { title: string; text: string }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 ring-8 ring-amber-50">
            <AlertTriangle className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="mt-4 text-lg font-extrabold tracking-tight text-amber-900">{title}</h1>
          <p className="mt-2 text-sm text-amber-800">{text}</p>
        </div>
      </div>
    </div>
  );
}