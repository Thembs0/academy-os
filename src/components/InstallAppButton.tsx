import { useEffect, useState } from "react";
import { Download, Share, Plus, X, Smartphone } from "lucide-react";

/* The browser fires this event when the PWA is installable.
   It's non-standard but widely supported (Chrome, Edge, Samsung Internet).
   Safari does NOT fire it — which is why iPhone needs a manual fallback. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Mode = "installable" | "ios" | "hidden";

function detectMode(): Mode {
  if (typeof window === "undefined") return "hidden";

  // Already installed? Then hide.
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;
  if (standalone) return "hidden";

  // iPhone / iPad Safari (no `beforeinstallprompt` on these).
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
  if (isIos && isSafari) return "ios";

  // Everything else — we'll decide later based on the install prompt event.
  return "hidden";
}

export function InstallAppButton({ className = "" }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<Mode>("hidden");
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  useEffect(() => {
    setMode(detectMode());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("installable");
    };

    const onInstalled = () => {
      setDeferred(null);
      setMode("hidden");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleClick = async () => {
    if (mode === "ios") {
      setIosHelpOpen(true);
      return;
    }
    if (mode === "installable" && deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setMode("hidden");
      setDeferred(null);
    }
  };

  if (mode === "hidden") return null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          "group inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-white hover:bg-white/15 active:translate-y-0 active:scale-[0.98] " +
          className
        }
      >
        <Download className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5" />
        Install app
      </button>

      {iosHelpOpen && (
        <IOSInstallHelp onClose={() => setIosHelpOpen(false)} />
      )}
    </>
  );
}

/* ── iPhone install helper (Safari only) ───────────────────────────── */
function IOSInstallHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How to install on iPhone"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl border border-slate-200/70 bg-white shadow-[0_25px_60px_-25px_rgba(15,23,42,0.55)] sm:rounded-3xl"
      >
        <div aria-hidden className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-brand" />
            <h2 className="text-base font-bold tracking-tight text-slate-900">Install on iPhone</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 hover:text-slate-700 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 text-sm text-slate-700">
          <p>
            iPhone installs apps through Safari. It takes three taps:
          </p>

          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                1
              </span>
              <div>
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  Tap the <Share className="inline h-4 w-4" /> Share icon
                </div>
                <p className="mt-0.5 text-slate-600">
                  It's at the bottom of Safari, in the middle.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                2
              </span>
              <div>
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  Choose <Plus className="inline h-4 w-4" /> Add to Home Screen
                </div>
                <p className="mt-0.5 text-slate-600">
                  Scroll down in the menu if you don't see it right away.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                3
              </span>
              <div>
                <div className="font-semibold text-slate-900">Tap <strong>Add</strong> in the top-right</div>
                <p className="mt-0.5 text-slate-600">
                  The STEM OS icon appears on your home screen.
                </p>
              </div>
            </li>
          </ol>

          <button
            onClick={onClose}
            className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-b from-brand to-brand-700 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_25px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 transition-all hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.985]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}