// src/App.tsx
import { useState, useEffect, useCallback } from "react";
import AdminDashboard from "./AdminDashboard";
import RegisterPage   from "./RegisterPage";
import ApplyPage      from "./ApplyPage";

// ── Constants ────────────────────────────────────────────────────────────────
const SESSION_KEY  = "ec_admin_verified";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 15 * 60 * 1000;
const LOCKOUT_KEY  = "ec_lockout_until";
const ATTEMPTS_KEY = "ec_login_attempts";

const C = {
  green:     "#12827c",
  greenDark: "#0D5753",
  milk:      "#FFF9ED",
  milkDark:  "#F0EBD8",
  white:     "#ffffff",
  red:       "#ef4444",
  redLight:  "#fef2f2",
  grey:      "#6b7280",
};

// ── Login Gate ───────────────────────────────────────────────────────────────
function AdminLoginGate({ onSuccess }: { onSuccess: (pw: string) => void }) {
  const [password,    setPassword]    = useState("");
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [showPw,      setShowPw]      = useState(false);
  const [attempts,    setAttempts]    = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  const [countdown,   setCountdown]   = useState(0);

  useEffect(() => {
    const until = parseInt(localStorage.getItem(LOCKOUT_KEY) ?? "0", 10);
    const att   = parseInt(localStorage.getItem(ATTEMPTS_KEY) ?? "0", 10);
    if (until > Date.now()) setLockedUntil(until);
    setAttempts(att);
  }, []);

  useEffect(() => {
    if (lockedUntil <= Date.now()) { setCountdown(0); return; }
    const tick = () => {
      const rem = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setCountdown(rem);
      if (rem === 0) {
        localStorage.removeItem(LOCKOUT_KEY);
        localStorage.removeItem(ATTEMPTS_KEY);
        setAttempts(0);
        setLockedUntil(0);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const isLocked = lockedUntil > Date.now();

  const handleSubmit = useCallback(async () => {
    if (isLocked || loading || !password.trim()) return;
    setLoading(true);
    setError("");

    // ── FAIL CLOSED: any outcome that is not an explicit 200 OK from our
    //    API is treated as a wrong password.  A missing route, a network
    //    error, a 404, a 500 — all of them count as a failed attempt and
    //    never open the dashboard.
    let succeeded = false;

    try {
      const res = await fetch("/api/admin?action=check-env", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ adminSecret: password.trim() }),
      });

      // Only accept an explicit HTTP 200.  401 = wrong password.
      // Anything else (404 route missing, 500 crash, 302 redirect, …) is
      // also treated as failure — we never grant access on ambiguity.
      if (res.status === 200) {
        // Double-check the body so a misconfigured CDN can't spoof a 200.
        const json = await res.json().catch(() => null);
        if (json && json.ok === true) {
          succeeded = true;
        }
      }
    } catch {
      // Network failure, CORS error, JSON parse error — all denied.
      succeeded = false;
    }

    if (succeeded) {
      localStorage.removeItem(ATTEMPTS_KEY);
      localStorage.removeItem(LOCKOUT_KEY);
      setAttempts(0);
      sessionStorage.setItem(SESSION_KEY, "1");
      onSuccess(password.trim());
    } else {
      const next = attempts + 1;
      setAttempts(next);
      localStorage.setItem(ATTEMPTS_KEY, String(next));
      if (next >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        localStorage.setItem(LOCKOUT_KEY, String(until));
        setLockedUntil(until);
        setError("Too many incorrect attempts. Locked for 15 minutes.");
      } else {
        const left = MAX_ATTEMPTS - next;
        setError(`Incorrect password. ${left} attempt${left === 1 ? "" : "s"} remaining.`);
      }
      setPassword("");
    }

    setLoading(false);
  }, [password, isLocked, loading, attempts, onSuccess]);

  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleSubmit(); };

  const mins = Math.floor(countdown / 60);
  const secs = String(countdown % 60).padStart(2, "0");

  return (
    <div style={pg}>
      <div style={card}>

        {/* Brand header */}
        <div style={{ textAlign:"center" as const, marginBottom:32 }}>
          <div style={{ fontSize:"2.4rem", marginBottom:10 }}>🔒</div>
          <div style={{ fontSize:"0.72rem", fontWeight:700, color:C.green, letterSpacing:"0.1em", textTransform:"uppercase" as const, marginBottom:8 }}>
            EduCraft Ambassador
          </div>
          <h1 style={{ color:C.greenDark, fontSize:"1.5rem", fontWeight:700, margin:"0 0 10px", lineHeight:1.2 }}>
            Admin Access
          </h1>
          <p style={{ color:C.grey, fontSize:"0.87rem", lineHeight:1.6, margin:0 }}>
            This area is restricted to authorised administrators only.
          </p>
        </div>

        {/* Lockout banner */}
        {isLocked && (
          <div style={{ display:"flex", alignItems:"flex-start", gap:12, background:C.redLight, border:`1.5px solid ${C.red}`, borderRadius:8, padding:"14px 16px", color:C.red, fontSize:"0.87rem", marginBottom:20, lineHeight:1.5 }}>
            <span style={{ fontSize:"1.3rem" }}>🔐</span>
            <div>
              <strong>Account temporarily locked</strong>
              <div style={{ fontSize:"0.81rem", marginTop:4, opacity:0.9 }}>
                Too many failed attempts. Try again in <strong>{mins}:{secs}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Password input */}
        {!isLocked && (
          <div style={{ marginBottom:error ? 8 : 20 }}>
            <label style={lbl}>Admin Password</label>
            <div style={{ position:"relative" as const }}>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                onKeyDown={onKey}
                placeholder="Enter admin password"
                autoComplete="current-password"
                autoFocus
                disabled={loading}
                style={{ ...inp, borderColor: error ? C.red : "#ddd", paddingRight:48 }}
              />
              <button
                onClick={() => setShowPw(v => !v)}
                tabIndex={-1}
                style={{ position:"absolute" as const, right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:"1rem", padding:4, lineHeight:1 }}
                title={showPw ? "Hide" : "Show"}
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && !isLocked && (
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:16, background:C.redLight, border:`1.5px solid ${C.red}`, borderRadius:6, padding:"9px 12px", color:C.red, fontSize:"0.83rem", fontWeight:600 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Attempt dots */}
        {!isLocked && attempts > 0 && attempts < MAX_ATTEMPTS && (
          <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:16 }}>
            {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
              <div key={i} style={{ width:10, height:10, borderRadius:"50%", background: i < attempts ? C.red : "#e5e7eb", transition:"background 0.2s" }} />
            ))}
            <span style={{ fontSize:"0.71rem", color:C.grey, marginLeft:6 }}>{attempts}/{MAX_ATTEMPTS} attempts</span>
          </div>
        )}

        {/* Submit */}
        {!isLocked && (
          <button
            onClick={handleSubmit}
            disabled={loading || !password.trim()}
            style={{ width:"100%", background:C.green, color:C.white, border:"none", borderRadius:6, padding:"13px", fontSize:"0.97rem", fontWeight:700, letterSpacing:"0.02em", cursor: loading || !password.trim() ? "not-allowed" : "pointer", opacity: loading || !password.trim() ? 0.6 : 1 }}
          >
            {loading ? "Verifying…" : "Access Dashboard"}
          </button>
        )}

        {/* Public links */}
        <div style={{ marginTop:24, textAlign:"center" as const, fontSize:"0.82rem", color:C.grey, lineHeight:1.8 }}>
          Are you an ambassador?{" "}
          <a href="/register" style={{ color:C.green, fontWeight:600, textDecoration:"none" }}>Register here</a>
          {" · "}
          <a href="/apply" style={{ color:C.green, fontWeight:600, textDecoration:"none" }}>Apply here</a>
        </div>

        <div style={{ marginTop:20, paddingTop:16, borderTop:`1px solid ${C.milkDark}`, textAlign:"center" as const, fontSize:"0.68rem", color:C.green, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase" as const }}>
          EDUCRAFT — Academic &amp; Technical Documentation Experts
        </div>
      </div>
    </div>
  );
}

// ── App root ─────────────────────────────────────────────────────────────────
export default function App() {
  const path = window.location.pathname;

  if (path === "/register" || path.startsWith("/register/")) return <RegisterPage />;
  if (path === "/apply"    || path.startsWith("/apply/"))    return <ApplyPage />;

  const [authed, setAuthed] = useState<boolean>(() =>
    sessionStorage.getItem(SESSION_KEY) === "1"
  );
  // Store login password in sessionStorage so AdminDashboard can use it
  // without requiring the admin to type it a second time.
  const [loginPassword, setLoginPassword] = useState<string>(() =>
    sessionStorage.getItem("ec_admin_pw") ?? ""
  );

  const handleSuccess = (pw: string) => {
    sessionStorage.setItem("ec_admin_pw", pw);
    setLoginPassword(pw);
    setAuthed(true);
  };

  if (!authed) return <AdminLoginGate onSuccess={handleSuccess} />;
  return <AdminDashboard initialSecret={loginPassword} />;
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const pg  : React.CSSProperties = { minHeight:"100vh", background:C.milk, display:"flex", alignItems:"center", justifyContent:"center", padding:"32px 16px", fontFamily:"'Segoe UI',system-ui,sans-serif" };
const card: React.CSSProperties = { background:C.white, border:`1px solid #e0e0e0`, borderTop:`4px solid ${C.green}`, borderRadius:4, padding:"40px 36px", maxWidth:420, width:"100%", boxShadow:"0 2px 20px rgba(0,0,0,.09)" };
const lbl : React.CSSProperties = { display:"block", fontSize:"0.72rem", fontWeight:700, color:"#555", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 };
const inp : React.CSSProperties = { width:"100%", background:C.milk, border:"1.5px solid #ddd", borderRadius:6, padding:"12px 14px", color:C.greenDark, fontSize:"0.95rem", outline:"none", boxSizing:"border-box" };
