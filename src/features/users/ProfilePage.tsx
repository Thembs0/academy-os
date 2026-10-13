import { useEffect, useState } from "react";
import {
  UserRound, ShieldCheck, KeyRound, Smartphone, CheckCircle2, Building2, Mail,
} from "lucide-react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Alert, LabeledInput } from "@/components/ui";
import { globalRoleLabel, roleLabel } from "@/lib/constants";

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/50 via-white to-slate-50/70" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.45), rgba(56,189,248,0) 70%)",
          animation: "ppDrift 24s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes ppDrift { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(60px,40px,0) scale(1.08);} 100%{transform:translate3d(-30px,20px,0) scale(1.03);} }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
    </div>
  );
}

function Initials({ name }: { name: string }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/20 to-brand/5 text-lg font-extrabold text-brand ring-1 ring-inset ring-brand/20 shadow-sm">
      {initials || "?"}
    </span>
  );
}

function SectionLabel({ icon: Icon, children }: { icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-3">
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 ring-1 ring-inset ring-brand/15">
          <Icon className="h-4 w-4 text-brand" aria-hidden />
        </span>
      )}
      <h2 className="text-sm font-bold tracking-tight text-slate-900">{children}</h2>
    </div>
  );
}

export default function ProfilePage() {
  const a = useAuth();
  const [name, setName] = useState(a.profile?.full_name ?? "");
  const [phone, setPhone] = useState(a.profile?.phone ?? "");
  const [msg, setMsg] = useState<{ t: "green" | "red"; m: string } | null>(null);
  const [pw, setPw] = useState("");
  const [factor, setFactor] = useState<{ id: string; qr?: string; secret?: string; verified: boolean } | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const f = data?.totp.find((x) => x.status === "verified");
      if (f) setFactor({ id: f.id, verified: true });
    });
  }, []);

  const save = async () => {
    const { error } = await supabase.from("profiles").update({ full_name: name.trim(), phone: phone.trim() || null }).eq("id", a.profile!.id);
    setMsg(error ? { t: "red", m: errMsg(error) } : { t: "green", m: "Profile saved." });
    if (!error) a.refresh();
  };

  const changePw = async () => {
    if (pw.length < 10 || !/\d/.test(pw) || !/[A-Za-z]/.test(pw)) {
      return setMsg({ t: "red", m: "Use at least 10 characters with a letter and a number." });
    }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? { t: "red", m: errMsg(error) } : { t: "green", m: "Password updated." });
    setPw("");
  };

  const enrol = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) return setMsg({ t: "red", m: errMsg(error) });
    setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret, verified: false });
  };

  const verify = async () => {
    if (!factor) return;
    const ch = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (ch.error) return setMsg({ t: "red", m: errMsg(ch.error) });
    const v = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.data.id, code });
    if (v.error) return setMsg({ t: "red", m: "Incorrect code." });
    setFactor({ id: factor.id, verified: true });
    setMsg({ t: "green", m: "Two-step verification enabled." });
    a.refresh();
  };

  return (
    <>
      <Ambient />
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">

        {/* Hero */}
        <div className="relative mb-6 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 p-5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 right-0 h-56 w-[60%] rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(56,189,248,0.30), transparent 65%)" }}
          />
          <div className="relative flex items-start gap-4">
            <Initials name={a.profile?.full_name ?? "?"} />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-extrabold tracking-tight text-slate-900">
                {a.profile?.full_name ?? "Your profile"}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200/70">
                  <Mail className="h-3 w-3" /> {a.profile?.email}
                </span>
                {a.roles.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-200/70">
                    <ShieldCheck className="h-3 w-3" /> {globalRoleLabel(r)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {msg && <div className="mb-4"><Alert tone={msg.t}>{msg.m}</Alert></div>}

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Details */}
          <section className="rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur">
            <SectionLabel icon={UserRound}>Details</SectionLabel>
            <LabeledInput label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <LabeledInput label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <LabeledInput label="Email" value={a.profile?.email ?? ""} disabled readOnly />

            {a.memberships.length > 0 && (
              <div className="mt-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <Building2 className="h-3 w-3" /> Projects
                </div>
                <ul className="space-y-1.5">
                  {a.memberships.map((m) => (
                    <li key={m.id} className="flex items-center justify-between rounded-2xl border border-slate-200/60 bg-slate-50/70 px-3 py-2 text-sm">
                      <span className="truncate font-medium text-slate-800">{m.project?.name}</span>
                      <span className="ml-2 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">{roleLabel(m.project_role)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985]"
              onClick={save}
            >
              Save changes
            </button>
          </section>

          {/* Security */}
          <section className="rounded-3xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur">
            <SectionLabel icon={KeyRound}>Password</SectionLabel>
            <LabeledInput
              label="New password"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              hint="At least 10 characters with a letter and a number."
            />
            <button
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50 active:translate-y-0 active:scale-[0.98] disabled:opacity-60"
              disabled={!pw}
              onClick={changePw}
            >
              Change password
            </button>

            <div className="mt-6">
              <SectionLabel icon={Smartphone}>Two-step verification</SectionLabel>
              {factor?.verified ? (
                <div className="flex items-start gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-3 text-sm text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <div className="font-semibold">Enabled</div>
                    <div className="mt-0.5 text-xs text-emerald-800">
                      Your account is protected with an authenticator app.
                    </div>
                  </div>
                </div>
              ) : factor?.qr ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">Scan the QR code with an authenticator app (Google Authenticator, Authy, 1Password).</p>
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200/60 bg-white p-4">
                    <img src={factor.qr} alt="QR code for your authenticator app" className="h-40 w-40" />
                    <code className="block w-full break-all text-center text-xs text-slate-500">{factor.secret}</code>
                  </div>
                  <LabeledInput
                    label="6-digit code"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                  <button
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985] disabled:opacity-60"
                    disabled={code.length !== 6}
                    onClick={verify}
                  >
                    Verify & enable
                  </button>
                </div>
              ) : (
                <button
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50 active:translate-y-0 active:scale-[0.98]"
                  onClick={enrol}
                >
                  Set up authenticator app
                </button>
              )}
              <p className="mt-3 text-xs text-slate-500">
                {a.hasRole("super_admin", "hod") ? "Required for your role." : "Optional but recommended."}
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}