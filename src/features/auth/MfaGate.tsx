import { useEffect, useState, useRef } from "react";
import { supabase, errMsg } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";
import { Alert, LabeledInput, Spinner } from "@/components/ui";

/** TOTP MFA for privileged users (Super Admin, HOD). Enrol on first use, challenge afterwards. */
export default function MfaGate() {
  const { refresh, signOut } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null); 
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState(""); 
  const [err, setErr] = useState<string | null>(null); 
  const [busy, setBusy] = useState(false); 
  const [ready, setReady] = useState(false);

  // This ref prevents double-enrollment in React Strict Mode
  const started = useRef(false);

  useEffect(() => {
    // Guard clause to prevent running twice
    if (started.current) return;
    started.current = true;

    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) { 
        setErr(errMsg(error)); 
        setReady(true); 
        return; 
      }
      
      const verified = data.totp.find((f) => f.status === "verified");
      
      if (verified) {
        setFactorId(verified.id);
      } else {
        // Clear abandoned enrolments
        for (const f of data.all ?? []) {
          if (f.factor_type === "totp" && f.status !== "verified") {
            await supabase.auth.mfa.unenroll({ factorId: f.id });
          }
        }
        
        // Start a new enrollment
        const en = await supabase.auth.mfa.enroll({ 
          factorType: "totp", 
          friendlyName: `Authenticator ${Date.now()}` 
        });
        
        if (en.error) {
          setErr(errMsg(en.error));
        } else { 
          setFactorId(en.data.id); 
          setQr(en.data.totp.qr_code); 
          setSecret(en.data.totp.secret); 
        }
      }
      setReady(true);
    })();
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!factorId) return; 
    
    setBusy(true); 
    setErr(null);
    
    const ch = await supabase.auth.mfa.challenge({ factorId });
    if (ch.error) { 
      setErr(errMsg(ch.error)); 
      setBusy(false); 
      return; 
    }
    
    const v = await supabase.auth.mfa.verify({ 
      factorId, 
      challengeId: ch.data.id, 
      code: code.trim() 
    });
    
    if (v.error) { 
      setErr("That code didn't work. Check the 6-digit code and try again."); 
      setBusy(false); 
      return; 
    }
    
    await refresh(); 
    setBusy(false);
  };

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form onSubmit={verify} className="card w-full max-w-sm p-6">
        <h1 className="text-lg font-bold">Two-step verification</h1>
        <p className="mt-1 text-sm text-slate-600">
          {qr 
            ? "Your role requires an authenticator app. Scan this code, then enter the 6-digit code." 
            : "Enter the 6-digit code from your authenticator app."}
        </p>
        
        {!ready && <div className="mt-4"><Spinner /></div>}
        
        {qr && (
          <div className="my-4 flex flex-col items-center gap-2">
            <img src={qr} alt="QR code to add this account to your authenticator app" className="h-44 w-44" />
            <code className="break-all text-xs">{secret}</code>
          </div>
        )}
        
        {ready && factorId && (
          <div className="mt-4">
            <LabeledInput 
              label="6-digit code" 
              inputMode="numeric" 
              autoComplete="one-time-code" 
              maxLength={6} 
              value={code} 
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} 
            />
          </div>
        )}
        
        {err && <Alert tone="red">{err}</Alert>}
        
        <button className="btn-primary mt-4 w-full" disabled={busy || code.length !== 6}>
          {busy ? "Verifying…" : "Verify"}
        </button>
        
        <button type="button" onClick={signOut} className="btn-ghost mt-2 w-full">
          Sign out
        </button>
      </form>
    </div>
  );
}