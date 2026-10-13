import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft, FileSpreadsheet, FileText, KeyRound, Eye, EyeOff,
  ScrollText, ShieldCheck, Sparkles,
} from "lucide-react";
import { supabase, errMsg, isConfigured } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";
import { Alert, LabeledInput, LabeledText } from "@/components/ui";

/* ─────────────────────────────────────────────────────────────────────────
   Decorative background used on every auth page. Matches the Landing page.
   ───────────────────────────────────────────────────────────────────────── */
const floatingDocs = [
  { Icon: FileText, top: "14%", left: "12%", size: 26, delay: "0s", dur: "18s", rot: "-8deg" },
  { Icon: FileSpreadsheet, top: "32%", left: "78%", size: 30, delay: "2.5s", dur: "22s", rot: "6deg" },
  { Icon: ScrollText, top: "58%", left: "18%", size: 24, delay: "1.2s", dur: "20s", rot: "4deg" },
  { Icon: ShieldCheck, top: "74%", left: "72%", size: 28, delay: "3.5s", dur: "24s", rot: "-5deg" },
  { Icon: FileText, top: "86%", left: "30%", size: 20, delay: "0.8s", dur: "19s", rot: "10deg" },
];

function AuroraBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/70 via-white to-slate-50/80" />
      <div
        className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-50 blur-3xl"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.55), rgba(56,189,248,0) 70%)",
          animation: "auroraDrift 22s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full opacity-40 blur-3xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          animation: "auroraDrift2 26s ease-in-out infinite alternate",
        }}
      />
      {floatingDocs.map(({ Icon, top, left, size, delay, dur, rot }, i) => (
        <div
          key={i}
          className="absolute text-brand/20"
          style={{
            top, left,
            transform: `rotate(${rot})`,
            animation: `floatDoc ${dur} ease-in-out ${delay} infinite`,
          }}
        >
          <Icon width={size} height={size} strokeWidth={1.4} />
        </div>
      ))}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Password input with a reveal toggle. Same LabeledInput API, plus an eye.
   ───────────────────────────────────────────────────────────────────────── */
function PasswordInput({
  label, value, onChange, hint, required, autoComplete,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="mb-4">
      <label className="label">
        {label}
        {required && <span className="text-red-600" aria-hidden> *</span>}
      </label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          value={value}
          onChange={onChange}
          className="input pr-12"
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-95"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Shell - split layout on desktop, stacked on mobile.
   ───────────────────────────────────────────────────────────────────────── */
function Shell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AuroraBackdrop />

      <div className="relative mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-2">
        {/* Left brand panel (hidden on small screens) */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-white lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              background:
                "radial-gradient(120% 80% at 15% 10%, rgba(56,189,248,0.35), rgba(56,189,248,0) 55%), radial-gradient(100% 80% at 100% 100%, rgba(99,102,241,0.4), rgba(99,102,241,0) 60%)",
            }}
          />
          <Link to="/" className="relative flex items-center gap-3">
            <img
              src="/ortsa-logo.png"
              alt="ORT SA - Educating for Life"
              className="h-10 w-auto sm:h-11"
            />
          </Link>

          <div className="relative max-w-md">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-sky-50 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_10px_2px_rgba(125,211,252,0.8)]" />
              INTERNAL PLATFORM
            </div>
            <h2 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight">
              Manage projects. Capture the field. Protect the record.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-sky-50/80">
              One secure workspace for observations, documents and reporting across the department.
            </p>
          </div>

          <div className="relative text-[11px] text-sky-100/70">
            © {new Date().getFullYear()} ORT SA · Authorised users only
          </div>
        </aside>

        {/* Right form panel */}
        <main className="relative flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-sm">
            {/* Mobile brand header */}
            <Link to="/" className="mb-6 flex items-center justify-center gap-3 lg:hidden">
              <img
                src="/ortsa-logo.png"
                alt="ORT SA - Educating for Life"
                className="h-9 w-auto"
              />
            </Link>

            <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_20px_50px_-25px_rgba(15,23,42,0.25)] backdrop-blur-xl sm:p-7">
              {/* Top sheen */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[140%] -translate-x-1/2 rounded-full opacity-40 blur-2xl"
                style={{ background: "radial-gradient(circle, rgba(56,189,248,0.25), transparent 60%)" }}
              />

              <div className="relative">
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{title}</h1>
                {sub && <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{sub}</p>}
                <div className="mt-6">{children}</div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <style>{`
        @keyframes auroraDrift {
          0%   { transform: translate3d(0,0,0) scale(1); }
          50%  { transform: translate3d(60px,40px,0) scale(1.08); }
          100% { transform: translate3d(-30px,20px,0) scale(1.03); }
        }
        @keyframes auroraDrift2 {
          0%   { transform: translate3d(0,0,0) scale(1); }
          50%  { transform: translate3d(-70px,50px,0) scale(1.1); }
          100% { transform: translate3d(40px,-30px,0) scale(1.05); }
        }
        @keyframes floatDoc {
          0%   { transform: translateY(0) rotate(var(--rot, 0deg)); opacity: 0; }
          10%  { opacity: 1; }
          50%  { transform: translateY(-28px) rotate(calc(var(--rot, 0deg) + 3deg)); }
          90%  { opacity: 1; }
          100% { transform: translateY(-60px) rotate(var(--rot, 0deg)); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Small presentation helpers (no logic changes)
   ───────────────────────────────────────────────────────────────────────── */
function FormStack({ children }: { children: ReactNode }) {
  return <div className="space-y-4 [&_input]:rounded-2xl [&_input]:border-slate-200 [&_input]:bg-white/70 [&_input]:px-4 [&_input]:py-3 [&_input]:text-sm [&_input]:shadow-sm [&_input]:transition-all [&_input]:duration-200 [&_input]:focus:border-brand [&_input]:focus:bg-white [&_input]:focus:outline-none [&_input]:focus:ring-4 [&_input]:focus:ring-brand/15 [&_textarea]:rounded-2xl [&_textarea]:border-slate-200 [&_textarea]:bg-white/70 [&_textarea]:px-4 [&_textarea]:py-3 [&_textarea]:text-sm [&_textarea]:shadow-sm [&_textarea]:transition-all [&_textarea]:duration-200 [&_textarea]:focus:border-brand [&_textarea]:focus:bg-white [&_textarea]:focus:outline-none [&_textarea]:focus:ring-4 [&_textarea]:focus:ring-brand/15">{children}</div>;
}

function PrimaryButton({ children, busy, disabled }: { children: ReactNode; busy?: boolean; disabled?: boolean }) {
  return (
    <button
      className="group relative mt-5 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-5 py-3.5 text-sm font-bold tracking-wide text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:brightness-[1.05] hover:shadow-[0_16px_32px_-14px_rgba(15,23,42,0.55)] active:translate-y-0 active:scale-[0.985] active:brightness-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:brightness-100"
      disabled={disabled || busy}
    >
      {busy && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
      )}
      {children}
    </button>
  );
}

function SoftLink({ to, icon: Icon, children }: { to: string; icon?: React.ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium text-sky-700 transition-colors duration-200 hover:bg-sky-50 hover:text-sky-800"
    >
      {Icon && <Icon className="h-3.5 w-3.5 opacity-70 transition-transform duration-200 group-hover:-translate-x-0.5" />}
      {children}
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   LoginPage - unchanged logic
   ───────────────────────────────────────────────────────────────────────── */
export function LoginPage() {
  const { session, loading } = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const from = (loc.state as { from?: string } | null)?.from ?? "/dashboard";
  if (!loading && session) return <Navigate to={from} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(error.message.toLowerCase().includes("rate") ? "Too many attempts. Please wait a few minutes and try again." : "Incorrect email or password.");
    else nav(from, { replace: true });
  };
  return (
    <Shell title="Log in" sub="Internal staff only.">
      {!isConfigured && <Alert tone="amber">The app is not configured (missing Supabase environment variables).</Alert>}
      <form onSubmit={submit} noValidate className="mt-1">
        <FormStack>
          <LabeledInput label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordInput label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormStack>
        {err && <div className="mt-4"><Alert tone="red">{err}</Alert></div>}
        <PrimaryButton busy={busy} disabled={!email || !password}>
          {busy ? "Signing in…" : "Log in"}
        </PrimaryButton>
      </form>
      <div className="mt-5 flex items-center justify-between text-sm">
        <SoftLink to="/reset-password" icon={KeyRound}>Forgot password?</SoftLink>
        <SoftLink to="/request-access" icon={Sparkles}>Request access</SoftLink>
      </div>
    </Shell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ResetPasswordPage - unchanged logic
   ───────────────────────────────────────────────────────────────────────── */
export function ResetPasswordPage() {
  const [email, setEmail] = useState(""); const [done, setDone] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/set-password` });
    setBusy(false); if (error && !/not found/i.test(error.message)) setErr(errMsg(error)); else setDone(true);
  };
  return (
    <Shell title="Reset password" sub="We'll email you a link if the address belongs to an account.">
      {done ? (
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 shadow-sm">
          <Alert tone="green">If that email has an account, a reset link is on its way.</Alert>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-1">
          <FormStack>
            <LabeledInput label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormStack>
          {err && <div className="mt-4"><Alert tone="red">{err}</Alert></div>}
          <PrimaryButton busy={busy} disabled={!email}>
            {busy ? "Sending…" : "Send reset link"}
          </PrimaryButton>
        </form>
      )}
      <div className="mt-5">
        <SoftLink to="/login" icon={ArrowLeft}>Back to login</SoftLink>
      </div>
    </Shell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SetPasswordPage - unchanged logic
   ───────────────────────────────────────────────────────────────────────── */
export function SetPasswordPage() {
  const { session, loading, refresh } = useAuth(); const nav = useNavigate();
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (session?.user) setName((session.user.user_metadata?.full_name as string) ?? ""); }, [session]);
  const strong = pw.length >= 10 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!strong) return setErr("Use at least 10 characters including a letter and a number.");
    if (pw !== pw2) return setErr("Passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw, data: { full_name: name } });
    if (error) { setErr(errMsg(error)); setBusy(false); return; }
    if (session?.user) await supabase.from("profiles").update({ full_name: name.trim() || undefined, phone: phone.trim() || null }).eq("id", session.user.id);
    await refresh(); nav("/dashboard", { replace: true });
  };
  if (!loading && !session) return (
    <Shell title="Link expired">
      <Alert tone="amber">This link is invalid or has expired. Ask for a new invitation or use "Forgot password".</Alert>
      <div className="mt-5">
        <SoftLink to="/login" icon={ArrowLeft}>Go to login</SoftLink>
      </div>
    </Shell>
  );
  return (
    <Shell title="Set your password" sub="Choose a password and confirm your details to finish setting up your account.">
      <form onSubmit={submit} className="mt-1">
        <FormStack>
          <LabeledInput label="Full name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <LabeledInput label="Phone (optional)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            hint="At least 10 characters, with a letter and a number."
          />
          <PasswordInput
            label="Confirm password"
            autoComplete="new-password"
            required
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
        </FormStack>
        {err && <div className="mt-4"><Alert tone="red">{err}</Alert></div>}
        <PrimaryButton busy={busy}>{busy ? "Saving…" : "Save and continue"}</PrimaryButton>
      </form>
    </Shell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   RequestAccessPage - unchanged logic
   ───────────────────────────────────────────────────────────────────────── */
export function RequestAccessPage() {
  const [f, setF] = useState({ full_name: "", email: "", phone: "", reason: "" }); const [done, setDone] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke("request-access", { body: f });
    setBusy(false);
    if (error || data?.error) {
      let m = data?.error as string | undefined;
      try { if (!m && (error as any)?.context?.json) m = (await (error as any).context.json()).error; } catch { /* ignore */ }
      setErr(m ?? "Could not send your request. Please try again.");
    } else setDone(true);
  };
  return (
    <Shell title="Request access" sub="Accounts are created by the Super Admin. Tell us who you are and why you need access.">
      {done ? (
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 shadow-sm">
          <Alert tone="green">Request received. You'll get an email invitation if it is approved.</Alert>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-1">
          <FormStack>
            <LabeledInput label="Full name" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} maxLength={120} />
            <LabeledInput label="Work email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <LabeledInput label="Phone (optional)" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <LabeledText label="Role / project you need access to" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={1000} />
          </FormStack>
          {err && <div className="mt-4"><Alert tone="red">{err}</Alert></div>}
          <PrimaryButton busy={busy} disabled={!f.full_name || !f.email}>
            {busy ? "Sending…" : "Send request"}
          </PrimaryButton>
        </form>
      )}
      <div className="mt-5">
        <SoftLink to="/login" icon={ArrowLeft}>Back to login</SoftLink>
      </div>
    </Shell>
  );
}