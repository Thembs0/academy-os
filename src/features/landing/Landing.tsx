import { Link } from "react-router-dom";
import { BarChart3, ClipboardCheck, FileLock2, FolderKanban, FileText, FileSpreadsheet, ScrollText, ShieldCheck } from "lucide-react";

const cards = [
  { icon: FolderKanban, title: "Project management", text: "Projects, teams and schools with full assignment history." },
  { icon: ClipboardCheck, title: "Field monitoring", text: "Classroom observations captured on a phone, even offline, then reviewed and approved." },
  { icon: FileLock2, title: "Document management", text: "Teacher IDs, Registers, MOAs and learner's  reports in private, verified storage." },
  { icon: BarChart3, title: "Data & reporting", text: "Monthly reports built from approved records, not chased by email." },
];

// Decorative floating "documents" - purely visual, aria-hidden.
const floatingDocs = [
  { Icon: FileText, top: "12%", left: "6%", size: 28, delay: "0s", dur: "18s", rot: "-8deg" },
  { Icon: FileSpreadsheet, top: "26%", left: "88%", size: 32, delay: "2.5s", dur: "22s", rot: "6deg" },
  { Icon: ScrollText, top: "58%", left: "10%", size: 26, delay: "1.2s", dur: "20s", rot: "4deg" },
  { Icon: ShieldCheck, top: "72%", left: "82%", size: 30, delay: "3.5s", dur: "24s", rot: "-5deg" },
  { Icon: FileText, top: "84%", left: "24%", size: 22, delay: "0.8s", dur: "19s", rot: "10deg" },
  { Icon: FileSpreadsheet, top: "44%", left: "48%", size: 24, delay: "4.2s", dur: "26s", rot: "-12deg" },
  { Icon: ScrollText, top: "8%", left: "70%", size: 20, delay: "1.8s", dur: "21s", rot: "8deg" },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      {/* ── Animated aurora background (the "fainted flowing sheet") ───────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-50/60 via-white to-slate-50/80" />

        {/* Soft, slowly drifting color blobs */}
        <div
          className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full opacity-50 blur-3xl"
          style={{
            background: "radial-gradient(circle at 30% 30%, rgba(56,189,248,0.55), rgba(56,189,248,0) 70%)",
            animation: "auroraDrift 22s ease-in-out infinite alternate",
          }}
        />
        <div
          className="absolute top-20 right-[-160px] h-[560px] w-[560px] rounded-full opacity-40 blur-3xl"
          style={{
            background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
            animation: "auroraDrift2 26s ease-in-out infinite alternate",
          }}
        />
        <div
          className="absolute bottom-[-200px] left-1/3 h-[600px] w-[600px] rounded-full opacity-35 blur-3xl"
          style={{
            background: "radial-gradient(circle at 50% 50%, rgba(14,165,233,0.5), rgba(14,165,233,0) 70%)",
            animation: "auroraDrift3 30s ease-in-out infinite alternate",
          }}
        />

        {/* Faint flowing "sheet" wave - a couple of soft SVG bands */}
        <svg
          className="absolute inset-x-0 top-0 h-[60%] w-full opacity-[0.18]"
          viewBox="0 0 1440 800"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="wave1" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="wave2" x1="0" x2="1" y1="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <path fill="url(#wave1)">
            <animate
              attributeName="d"
              dur="18s"
              repeatCount="indefinite"
              values="
                M0,300 C300,200 600,400 900,300 C1200,200 1350,350 1440,300 L1440,0 L0,0 Z;
                M0,340 C300,260 600,420 900,320 C1200,240 1350,380 1440,340 L1440,0 L0,0 Z;
                M0,300 C300,200 600,400 900,300 C1200,200 1350,350 1440,300 L1440,0 L0,0 Z
              "
            />
          </path>
          <path fill="url(#wave2)">
            <animate
              attributeName="d"
              dur="24s"
              repeatCount="indefinite"
              values="
                M0,500 C300,600 600,420 900,520 C1200,620 1350,480 1440,520 L1440,800 L0,800 Z;
                M0,540 C300,620 600,440 900,540 C1200,640 1350,500 1440,540 L1440,800 L0,800 Z;
                M0,500 C300,600 600,420 900,520 C1200,620 1350,480 1440,520 L1440,800 L0,800 Z
              "
            />
          </path>
        </svg>

        {/* Floating "documents / papers" drifting slowly */}
        {floatingDocs.map(({ Icon, top, left, size, delay, dur, rot }, i) => (
          <div
            key={i}
            className="absolute text-brand/25"
            style={{
              top,
              left,
              transform: `rotate(${rot})`,
              animation: `floatDoc ${dur} ease-in-out ${delay} infinite`,
            }}
          >
            <Icon width={size} height={size} strokeWidth={1.4} />
          </div>
        ))}

        {/* Fine grain / paper texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.035] mix-blend-multiply"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
          }}
        />
      </div>

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden bg-brand text-white">
  {/* Inner mesh gradient for depth */}
  <div
    aria-hidden
    className="pointer-events-none absolute inset-0 opacity-70"
    style={{
      background:
        "radial-gradient(120% 80% at 15% 10%, rgba(56,189,248,0.35), rgba(56,189,248,0) 55%), radial-gradient(100% 80% at 100% 100%, rgba(99,102,241,0.35), rgba(99,102,241,0) 60%)",
    }}
  />
  {/* Bottom fade into page */}
  <div
    aria-hidden
    className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-black/10"
  />

  <div className="relative mx-auto max-w-5xl px-5 py-20 sm:py-28">
    <div className="inline-flex items-center gap-3 rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 backdrop-blur">
      <img
        src="/ortsa-logo.png"
        alt="ORT SA — Educating for Life"
        className="h-8 w-auto sm:h-9"
      />
      <span className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-50 sm:inline">
        Departmental Platform
      </span>
    </div>

    <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
      STEM <span className="text-sky-300">&amp;</span> IT ACADEMY
    </h1>
    <p className="mt-3 text-lg font-medium text-sky-100 sm:text-xl">
      Departmental Management Platform
    </p>
    <p className="mt-6 max-w-xl text-base leading-relaxed text-sky-50/90">
      Manage projects. Capture field activity. Monitor progress. Protect documentation. Generate reports.
    </p>
    <p className="mt-3 max-w-xl text-sm leading-relaxed text-sky-100/80">
      Built to replace paper-based field reporting. Facilitators submit attendance, observations and
      evidence directly from the field - reviewed the moment they land, not chased at the end of the week.
    </p>

    <div className="mt-9 flex flex-wrap gap-3">
      <Link
        to="/login"
        className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand shadow-[0_10px_30px_-10px_rgba(255,255,255,0.6)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-12px_rgba(255,255,255,0.75)] hover:bg-sky-50 active:translate-y-0 active:scale-[0.98]"
      >
        Login
        <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
      </Link>
      <Link
        to="/request-access"
        className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-white hover:bg-white/15 active:translate-y-0 active:scale-[0.98]"
      >
        Request access
      </Link>
    </div>
  </div>

  {/* Soft curved bottom edge */}
  <div aria-hidden className="relative h-10">
    <svg viewBox="0 0 1440 60" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
      <path d="M0,60 C360,10 1080,10 1440,60 Z" fill="white" />
    </svg>
  </div>
</header>
{/* ── Value band: why this exists ───────────────────────────────────── */}
<section className="relative mx-auto max-w-5xl px-5 pt-14">
  <div className="mb-8 text-center">
    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">
      Why this platform
    </div>
    <h2 className="mx-auto mt-2 max-w-2xl text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
      Paperless where it matters, efficient everywhere.
    </h2>
    <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
      Every register, observation, document and report lives in one system. Nothing to lose,
      nothing to reconcile later, nothing waiting until Friday.
    </p>
  </div>

  <div className="grid gap-3 sm:grid-cols-3">
    {[
      {
        title: "Paperless in the field",
        text: "Attendance and observations are captured on a phone - online or offline - and synced the moment there is signal.",
      },
      {
        title: "Review without chasing",
        text: "Managers see submissions as they arrive, query them in place, and approve in one tap. No more week-end paperwork rounds.",
      },
      {
        title: "Evidence that holds up",
        text: "Every register signed and photo is stored, timestamped and traceable. Nothing gets lost.",
      },
    ].map((v) => (
      <div
        key={v.title}
        className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.2)] backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-300/60 hover:shadow-[0_18px_40px_-22px_rgba(14,165,233,0.35)]"
      >
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_2px_rgba(30,69,137,0.35)]" />
          <h3 className="text-sm font-bold tracking-tight text-slate-900">{v.title}</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{v.text}</p>
      </div>
    ))}
  </div>
</section>
      {/* ── Feature cards ────────────────────────────────────────────────── */}
      <section className="relative mx-auto grid max-w-5xl gap-5 px-5 py-16 sm:grid-cols-2">
        {cards.map((c) => (
          <div
            key={c.title}
            className="group relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/75 p-6 shadow-[0_10px_30px_-15px_rgba(15,23,42,0.15)] backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-1 hover:border-sky-300/70 hover:shadow-[0_24px_50px_-20px_rgba(14,165,233,0.35)]"
          >
            {/* Hover glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(400px circle at var(--x,30%) var(--y,0%), rgba(56,189,248,0.12), transparent 60%)",
              }}
            />

            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-sky-50 ring-1 ring-inset ring-sky-200/70 shadow-sm transition-transform duration-300 group-hover:scale-110">
              <c.icon className="h-6 w-6 text-brand" aria-hidden />
            </div>

            <h2 className="relative mt-4 text-sm font-bold uppercase tracking-[0.08em] text-slate-900">
              {c.title}
            </h2>
            <p className="relative mt-2 text-sm leading-relaxed text-slate-600">{c.text}</p>

            <div
              aria-hidden
              className="absolute bottom-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
          </div>
        ))}
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="relative border-t border-slate-200/70 bg-white/60 py-8 text-center text-xs text-slate-500 backdrop-blur">
        Internal departmental system - authorised users only.
      </footer>

      {/* ── Keyframes (scoped to this component) ─────────────────────────── */}
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
        @keyframes auroraDrift3 {
          0%   { transform: translate3d(0,0,0) scale(1); }
          50%  { transform: translate3d(50px,-60px,0) scale(1.07); }
          100% { transform: translate3d(-40px,30px,0) scale(1.02); }
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