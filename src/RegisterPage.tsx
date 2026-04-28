// src/RegisterPage.tsx — Public ambassador self-registration form
// Submissions go to a pending queue; admin must approve before link is activated.

import { useState } from "react";

const C = { yellow:"#fbdb21",yellowDark:"#E0B846",green:"#12827c",greenDark:"#0D5753",white:"#ffffff",milk:"#FFF9ED",milkDark:"#F0EBD8",red:"#ef4444",redLight:"#fef2f2" };

type State = "idle" | "loading" | "pending" | "error";

export default function RegisterPage() {
  const [form, setForm] = useState({ slotId:"", name:"", school:"", email:"" });
  const [state, setState] = useState<State>("idle");
  const [err,   setErr]   = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    if (!form.slotId.trim()) { setState("error"); setErr("Please enter your Slot ID."); return; }
    if (!form.name.trim())   { setState("error"); setErr("Please enter your full name."); return; }
    if (!form.email.trim())  { setState("error"); setErr("Please enter your email address."); return; }
    setState("loading"); setErr("");
    try {
      const res  = await fetch("/api/register", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed. Please try again.");
      setState("pending");
    } catch(e) { setState("error"); setErr((e as Error).message); }
  };

  if (state === "pending") return (
    <div style={pg}>
      <div style={{ ...card, textAlign:"center" as const }}>
        <div style={{ fontSize:"3rem", marginBottom:16 }}>⏳</div>
        <h2 style={{ color:C.greenDark, fontSize:"1.4rem", fontWeight:900, margin:"0 0 14px" }}>Registration Submitted!</h2>
        <p style={{ color:C.green, lineHeight:1.7, fontSize:"0.9rem", marginBottom:18 }}>
          Your details have been sent to the EduCraft admin team for verification.
          Once approved, you'll receive a <strong>welcome email</strong> with your active ambassador link.
        </p>
        <div style={{ background:C.milk, borderRadius:10, padding:"14px 18px", fontSize:"0.83rem", color:C.greenDark, lineHeight:1.9, textAlign:"left" as const }}>
          <strong>What happens next:</strong><br/>
          1. Admin reviews your details (within 24 hrs)<br/>
          2. If approved → you get a welcome email with your link ✅<br/>
          3. If not verified → you'll be notified ❌
        </div>
        <div style={{ marginTop:24, paddingTop:16, borderTop:`1px solid ${C.milkDark}`, fontSize:"0.68rem", color:C.green, fontWeight:700, letterSpacing:"0.08em" }}>
          EDUCRAFT — Academic &amp; Technical Documentation Experts
        </div>
      </div>
    </div>
  );

  return (
    <div style={pg}>
      <div style={card}>
        <div style={{ textAlign:"center" as const, marginBottom:28 }}>
          <div style={{ fontSize:"2.6rem", marginBottom:10 }}>🎓</div>
          <h1 style={{ color:C.greenDark, fontSize:"1.5rem", fontWeight:900, margin:"0 0 10px" }}>Activate Your Ambassador Link</h1>
          <p style={{ color:C.green, fontSize:"0.88rem", lineHeight:1.7, margin:0 }}>
            Submit once. After admin verification your link goes live and you start earning commissions.
          </p>
        </div>

        <div style={{ display:"flex", flexDirection:"column" as const, gap:16 }}>
          {([
            { k:"slotId", label:"Your Slot ID *",          placeholder:"e.g. 007  or  ECCA-001",     hint:"Your position number — ask your coordinator if unsure." },
            { k:"name",   label:"Full Name *",              placeholder:"Your full name",              hint:"" },
            { k:"school", label:"School / University",      placeholder:"e.g. EUI, UNIBEN…",          hint:"" },
            { k:"email",  label:"Email Address *",          placeholder:"you@example.com",            hint:"Approval and commission notifications will be sent here.", type:"email" },
          ] as const).map(f => (
            <div key={f.k}>
              <label style={lbl}>{f.label}</label>
              <input style={inp} type={(f as { type?: string }).type || "text"} placeholder={f.placeholder}
                value={form[f.k]} onChange={set(f.k)} autoComplete="off"/>
              {f.hint && <p style={{ fontSize:"0.74rem", color:"#aaa", marginTop:5, lineHeight:1.5 }}>{f.hint}</p>}
            </div>
          ))}

          {state === "error" && (
            <div style={{ background:C.redLight, border:`1.5px solid ${C.red}`, borderRadius:8, padding:"11px 14px", color:C.red, fontSize:"0.85rem", fontWeight:600 }}>
              ⚠️ {err}
            </div>
          )}

          <button
            style={{ background:state==="loading"?C.yellowDark:C.yellow, color:C.greenDark, border:"none", borderRadius:10, padding:14, fontSize:"1rem", fontWeight:800, cursor:state==="loading"?"not-allowed":"pointer", opacity:state==="loading"?0.7:1, marginTop:4 }}
            onClick={submit} disabled={state==="loading"}>
            {state==="loading" ? "Submitting…" : "Submit for Approval →"}
          </button>
        </div>

        <p style={{ marginTop:18, fontSize:"0.73rem", color:"#bbb", textAlign:"center" as const, lineHeight:1.6 }}>
          Your information is only used to verify your identity and notify you about commissions.
        </p>
        <div style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${C.milkDark}`, textAlign:"center" as const, fontSize:"0.68rem", color:C.green, fontWeight:700, letterSpacing:"0.08em" }}>
          EDUCRAFT — Academic &amp; Technical Documentation Experts
        </div>
      </div>
    </div>
  );
}

const pg  : React.CSSProperties = { minHeight:"100vh", background:C.milk, display:"flex", alignItems:"center", justifyContent:"center", padding:"32px 16px", fontFamily:"'Segoe UI',system-ui,sans-serif" };
const card: React.CSSProperties = { background:C.white, border:`2px solid #E0B846`, borderRadius:20, padding:"40px 36px", maxWidth:480, width:"100%", boxShadow:"0 4px 28px rgba(13,87,83,.12)" };
const lbl : React.CSSProperties = { display:"block", fontSize:"0.72rem", fontWeight:700, color:C.green, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 };
const inp : React.CSSProperties = { width:"100%", background:C.milk, border:`1.5px solid #E0B846`, borderRadius:8, padding:"11px 14px", color:C.greenDark, fontSize:"0.88rem", outline:"none", boxSizing:"border-box" };
