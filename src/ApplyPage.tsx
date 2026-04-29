// src/ApplyPage.tsx — Public ambassador application form

import { useState, useEffect } from "react";

const C = {
  yellow:"#fbdb21", yellowDark:"#E0B846",
  green:"#12827c",  greenDark:"#0D5753",
  white:"#ffffff",  milk:"#FFF9ED",     milkDark:"#F0EBD8",
  red:"#ef4444",    redLight:"#fef2f2",  gray:"#f8f8f8",
};

type Step   = 1 | 2 | 3;
type Status = "idle" | "loading" | "success" | "error";

interface FormData {
  slotId:         string;
  fullName:       string;
  universityFull: string;
  universityAbbr: string;
  email:          string;
  phone:          string;
  bankName:       string;
  accountNumber:  string;
  accountName:    string;
  agreedToTerms:  boolean;
}

const NIGERIAN_BANKS = [
  "Access Bank",
  "Citibank Nigeria",
  "Coronation Merchant Bank",
  "Ecobank Nigeria",
  "FBNQuest Merchant Bank",
  "Fidelity Bank",
  "First Bank of Nigeria",
  "First City Monument Bank (FCMB)",
  "Globus Bank",
  "Greenwich Merchant Bank",
  "Guaranty Trust Bank (GTBank)",
  "Jaiz Bank",
  "Keystone Bank",
  "Kuda Bank",
  "Moniepoint Microfinance Bank",
  "Nova Merchant Bank",
  "Opay",
  "PalmPay",
  "Parallex Bank",
  "Polaris Bank",
  "PremiumTrust Bank",
  "Providus Bank",
  "Rand Merchant Bank",
  "Rubies Microfinance Bank",
  "Stanbic IBTC Bank",
  "Standard Chartered Bank Nigeria",
  "Sterling Bank",
  "SunTrust Bank Nigeria",
  "TAJ Bank",
  "Titan Trust Bank",
  "Union Bank of Nigeria",
  "United Bank for Africa (UBA)",
  "Unity Bank",
  "VFD Microfinance Bank",
  "Wema Bank",
  "Zenith Bank",
].sort();

export default function ApplyPage() {
  const [step,   setStep]   = useState<Step>(1);
  const [status, setStatus] = useState<Status>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [form,   setForm]   = useState<FormData>({
    slotId:"", fullName:"", universityFull:"", universityAbbr:"",
    email:"", phone:"", bankName:"", accountNumber:"", accountName:"",
    agreedToTerms: false,
  });

  useEffect(() => {
    fetch("/api/admin?action=get-next-slot")
      .then(r => r.json())
      .then(d => { if (d.slotId) setForm(p => ({ ...p, slotId: d.slotId })); })
      .catch(() => {});
  }, []);

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setCheck = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.checked }));

  const validateStep = (s: Step): string | null => {
    if (s === 1) {
      if (!form.fullName.trim())       return "Please enter your full name.";
      if (!form.universityFull.trim()) return "Please enter your university's full name.";
      if (!form.universityAbbr.trim()) return "Please enter your university abbreviation.";
      if (!form.email.trim())          return "Please enter your email address.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Please enter a valid email address.";
      if (!form.phone.trim())          return "Please enter your phone number.";
      if (form.phone.replace(/\D/g,"").length < 10) return "Please enter a valid phone number (at least 10 digits).";
    }
    if (s === 2) {
      if (!form.bankName.trim())       return "Please select your bank.";
      if (!form.accountNumber.trim())  return "Please enter your account number.";
      if (form.accountNumber.replace(/\D/g,"").length < 10) return "Account number must be at least 10 digits.";
      if (!form.accountName.trim())    return "Please enter your account name.";
    }
    if (s === 3) {
      if (!form.agreedToTerms) return "You must agree to the terms to submit your application.";
    }
    return null;
  };

  const nextStep = () => {
    const err = validateStep(step);
    if (err) { setErrMsg(err); return; }
    setErrMsg("");
    setStep(p => (p + 1) as Step);
  };

  const submit = async () => {
    const err = validateStep(3);
    if (err) { setErrMsg(err); return; }
    setStatus("loading"); setErrMsg("");
    try {
      const res  = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, agreedToTerms: form.agreedToTerms ? "true" : "false" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed. Please try again.");
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setErrMsg((e as Error).message);
    }
  };

  // ── SUCCESS ────────────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div style={pg}>
        <div style={{ ...formCard, textAlign: "center" as const }}>
          <div style={successIcon}>✓</div>
          <h2 style={{ color: C.greenDark, fontSize: "1.4rem", fontWeight: 700, margin: "0 0 14px" }}>
            Application Submitted
          </h2>
          <p style={{ color: "#555", lineHeight: 1.7, fontSize: "0.92rem", marginBottom: 20 }}>
            Your application for <strong>Slot EduCraftA-{form.slotId}</strong> has been received.
            The EduCraft admin team will review your details and respond within 24 hours.
          </p>
          <div style={{ background: C.milk, borderRadius: 8, padding: "16px 18px", fontSize: "0.84rem", color: C.greenDark, lineHeight: 1.9, textAlign: "left" as const }}>
            <strong>What happens next:</strong><br/>
            1. Admin reviews your application (within 24 hours)<br/>
            2. If approved — you receive a welcome email with your referral link<br/>
            3. If rejected — you will be notified with the reason
          </div>
          <div style={brandFooter}>EDUCRAFT — Academic &amp; Technical Documentation Experts</div>
        </div>
      </div>
    );
  }

  // ── FORM ───────────────────────────────────────────────────────────────────
  return (
    <div style={pg}>
      <div style={formCard}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: C.green, letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 6 }}>
            EduCraft Ambassador Programme
          </div>
          <h1 style={{ color: C.greenDark, fontSize: "1.4rem", fontWeight: 700, margin: "0 0 8px", lineHeight: 1.2 }}>
            Ambassador Application Form
          </h1>
          <p style={{ color: "#666", fontSize: "0.87rem", lineHeight: 1.6, margin: 0 }}>
            Earn 10% commission on every client you refer to EduCraft. Fill in this form accurately — your details will be used for payment processing and account setup.
          </p>
        </div>

        {/* Slot ID pill */}
        <div style={{ background: C.milk, border: `1.5px solid ${C.yellowDark}`, borderRadius: 8, padding: "10px 16px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 8 }}>
          <span style={{ fontSize: "0.78rem", color: C.green, fontWeight: 600 }}>Auto-assigned Slot ID</span>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: C.greenDark, fontSize: "1rem" }}>
            EduCraftA-{form.slotId || "…"}
          </span>
        </div>

        {/* Step indicators */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28 }}>
          {([1, 2, 3] as Step[]).map(n => (
            <div key={n} style={{ flex: 1, height: 4, borderRadius: 999, background: n <= step ? C.green : C.milkDark, transition: "background 0.3s" }}/>
          ))}
        </div>
        <div style={{ fontSize: "0.75rem", color: "#888", marginBottom: 20, fontWeight: 600 }}>
          Step {step} of 3 — {step===1?"Personal Details":step===2?"Payment Information":"Review & Agree"}
        </div>

        {/* ── STEP 1: Personal Details ── */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
            <Field label="Full Name *" placeholder="As it appears on your ID" value={form.fullName} onChange={set("fullName")}/>
            <Field label="Full University Name *" placeholder="e.g. University of Benin" value={form.universityFull} onChange={set("universityFull")}/>
            <Field label="University Abbreviation *" placeholder="e.g. UNIBEN" value={form.universityAbbr} onChange={set("universityAbbr")} hint="Short form used on your ambassador link"/>
            <Field label="Email Address *" type="email" placeholder="your@email.com" value={form.email} onChange={set("email")} hint="Commission notifications and account updates will be sent here"/>
            <Field label="Phone Number *" type="tel" placeholder="e.g. 08012345678" value={form.phone} onChange={set("phone")}/>
          </div>
        )}

        {/* ── STEP 2: Payment Details ── */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
            <div style={{ background: C.milk, border: `1px solid ${C.milkDark}`, borderLeft: `3px solid ${C.yellowDark}`, borderRadius: 4, padding: "12px 16px", fontSize: "0.84rem", color: C.greenDark, lineHeight: 1.7 }}>
              <strong>Important:</strong> These details will be used to pay your commission. Ensure they are accurate and match your bank records exactly.
            </div>
            <BankSelect value={form.bankName} onChange={v=>setForm(p=>({...p,bankName:v}))}/>
            <Field label="Account Number *" placeholder="10-digit account number" value={form.accountNumber} onChange={set("accountNumber")} maxLength={10}/>
            <Field label="Account Name *" placeholder="Exact name on your bank account" value={form.accountName} onChange={set("accountName")} hint="Must match your bank records exactly"/>
          </div>
        )}

        {/* ── STEP 3: Terms & Review ── */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
            {/* Summary */}
            <div style={{ background: C.gray, border: `1px solid ${C.milkDark}`, borderRadius: 8, padding: "18px 20px" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: C.green, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 12 }}>Application Summary</div>
              <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: "0.86rem" }}>
                {[
                  ["Slot ID",       `EduCraftA-${form.slotId}`],
                  ["Full Name",     form.fullName],
                  ["University",    `${form.universityFull} (${form.universityAbbr})`],
                  ["Email",         form.email],
                  ["Phone",         form.phone],
                  ["Bank",          form.bankName],
                  ["Account No.",   form.accountNumber],
                  ["Account Name",  form.accountName],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: `1px solid ${C.milkDark}` }}>
                    <td style={{ padding: "7px 0", color: "#888", width: "120px", fontSize: "0.82rem" }}>{k}</td>
                    <td style={{ padding: "7px 0", color: C.greenDark, fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </table>
            </div>

            {/* Terms */}
            <div style={{ background: C.milk, border: `1.5px solid ${C.yellowDark}`, borderRadius: 8, padding: "18px 20px", fontSize: "0.84rem", color: C.greenDark, lineHeight: 1.8 }}>
              <strong style={{ display: "block", marginBottom: 10, fontSize: "0.88rem" }}>EduCraft Ambassador Terms &amp; Conditions</strong>
              By joining the EduCraft Ambassador Programme, you agree to:<br/>
              1. Represent EduCraft professionally and accurately to all potential clients.<br/>
              2. Earn a <strong>10% commission</strong> on every confirmed order placed through your referral link.<br/>
              3. Commission is paid after the client's order is completed and payment is received by EduCraft.<br/>
              4. You must not misrepresent EduCraft services or pricing to clients.<br/>
              5. EduCraft reserves the right to deactivate your ambassador account if these terms are violated.<br/>
              6. Payment will be made to the bank account provided in this application.<br/>
              7. You confirm that all details provided are accurate and belong to you.
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", padding: "14px 16px", background: form.agreedToTerms ? "#f0faf9" : C.white, border: `2px solid ${form.agreedToTerms ? C.green : C.milkDark}`, borderRadius: 8, transition: "all 0.2s" }}>
              <input type="checkbox" checked={form.agreedToTerms} onChange={setCheck("agreedToTerms")}
                style={{ width: 18, height: 18, marginTop: 2, cursor: "pointer", accentColor: C.green, flexShrink: 0 }}/>
              <span style={{ color: C.greenDark, fontSize: "0.88rem", lineHeight: 1.6, fontWeight: form.agreedToTerms ? 600 : 400 }}>
                I have read and agree to the EduCraft Ambassador Terms &amp; Conditions. I confirm that all information provided is accurate and I understand the commission structure.
              </span>
            </label>
          </div>
        )}

        {/* Error */}
        {errMsg && (
          <div style={{ marginTop: 16, background: C.redLight, border: `1.5px solid ${C.red}`, borderRadius: 6, padding: "11px 14px", color: C.red, fontSize: "0.85rem", fontWeight: 600 }}>
            {errMsg}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          {step > 1 && (
            <button style={{ ...navBtn, background: C.milk, color: C.greenDark, border: `1.5px solid ${C.milkDark}` }}
              onClick={() => { setErrMsg(""); setStep(p => (p - 1) as Step); }}>
              ← Back
            </button>
          )}
          {step < 3 && (
            <button style={{ ...navBtn, background: C.yellow, color: C.greenDark, flex: 1 }} onClick={nextStep}>
              Next →
            </button>
          )}
          {step === 3 && (
            <button
              style={{ ...navBtn, background: status==="loading" ? C.yellowDark : form.agreedToTerms ? C.green : "#ccc", color: form.agreedToTerms ? C.white : "#aaa", flex: 1, cursor: form.agreedToTerms && status!=="loading" ? "pointer" : "not-allowed", opacity: status==="loading" ? 0.7 : 1 }}
              onClick={submit} disabled={status==="loading" || !form.agreedToTerms}>
              {status==="loading" ? "Submitting…" : "Submit Application"}
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={brandFooter}>EDUCRAFT — Academic &amp; Technical Documentation Experts</div>
      </div>
    </div>
  );
}

// ── Small components ─────────────────────────────────────────────────────────
function BankSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query,     setQuery]     = useState("");
  const [open,      setOpen]      = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const filtered = query.length > 0
    ? NIGERIAN_BANKS.filter(b => b.toLowerCase().includes(query.toLowerCase()))
    : NIGERIAN_BANKS;

  const selectBank = (bank: string) => {
    onChange(bank);
    setOpen(false);
    setQuery("");
    setShowCustom(false);
  };

  return (
    <div style={{ position: "relative" as const }}>
      <label style={lbl}>Bank Name *</label>
      <div style={{ position: "relative" as const }}>
        <input
          style={{ ...inp, cursor: "pointer" }}
          placeholder="Search or select your bank…"
          value={open ? query : value}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          autoComplete="off"
        />
        <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", color:"#aaa", fontSize:"0.8rem", pointerEvents:"none" }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {open && (
        <div style={{
          position:"absolute" as const, zIndex:1000, top:"calc(100% + 4px)", left:0, right:0,
          background:"#fff", border:"1.5px solid #E0B846", borderRadius:8,
          boxShadow:"0 8px 24px rgba(0,0,0,.12)", maxHeight:220, overflowY:"auto" as const,
        }}>
          {filtered.length === 0 && (
            <div style={{ padding:"12px 14px", color:"#aaa", fontSize:"0.85rem" }}>
              No bank found.
              {!showCustom && (
                <button
                  style={{ marginLeft:8, background:"none", border:"none", color:"#12827c", cursor:"pointer", fontWeight:700, fontSize:"0.85rem", textDecoration:"underline" }}
                  onMouseDown={e => { e.preventDefault(); setShowCustom(true); }}>
                  Type bank name manually
                </button>
              )}
            </div>
          )}
          {showCustom && (
            <div style={{ padding:"10px 14px", borderBottom:"1px solid #f0f0f0" }}>
              <input
                style={{ ...inp, fontSize:"0.85rem", padding:"7px 10px" }}
                placeholder="Type your bank name…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && query.trim()) selectBank(query.trim()); }}
                autoFocus
              />
              <button
                style={{ marginTop:6, background:"#12827c", color:"#fff", border:"none", borderRadius:6, padding:"6px 14px", fontSize:"0.82rem", cursor:"pointer", fontWeight:700 }}
                onMouseDown={e => { e.preventDefault(); if (query.trim()) selectBank(query.trim()); }}>
                Use "{query}"
              </button>
            </div>
          )}
          {filtered.map(b => (
            <div
              key={b}
              style={{ padding:"10px 14px", cursor:"pointer", fontSize:"0.88rem", color:"#0D5753", background: b===value?"#FFF9ED":"transparent", fontWeight:b===value?700:400 }}
              onMouseDown={e => { e.preventDefault(); selectBank(b); }}>
              {b}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, placeholder, value, onChange, hint, type="text", maxLength }: {
  label: string; placeholder: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: string; type?: string; maxLength?: number;
}) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <input style={inp} type={type} placeholder={placeholder} value={value} onChange={onChange} maxLength={maxLength} autoComplete="off"/>
      {hint && <p style={{ fontSize: "0.74rem", color: "#aaa", marginTop: 5, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pg: React.CSSProperties = {
  minHeight: "100vh", background: C.milk,
  display: "flex", alignItems: "flex-start", justifyContent: "center",
  padding: "32px 16px 64px", fontFamily: "'Segoe UI', system-ui, sans-serif",
};
const formCard: React.CSSProperties = {
  background: C.white, border: "1px solid #e0e0e0",
  borderTop: `4px solid ${C.green}`, borderRadius: 4,
  padding: "40px 36px", maxWidth: 560, width: "100%",
  boxShadow: "0 2px 16px rgba(0,0,0,.08)",
};
const successIcon: React.CSSProperties = {
  width: 56, height: 56, background: C.green, borderRadius: "50%",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: C.white, fontSize: "1.6rem", fontWeight: 700, margin: "0 auto 20px",
};
const brandFooter: React.CSSProperties = {
  marginTop: 28, paddingTop: 16, borderTop: `1px solid ${C.milkDark}`,
  textAlign: "center", fontSize: "0.68rem", color: C.green,
  fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
};
const navBtn: React.CSSProperties = {
  padding: "13px 20px", borderRadius: 6, border: "none",
  cursor: "pointer", fontWeight: 700, fontSize: "0.95rem",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: "0.72rem", fontWeight: 700, color: "#555",
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
};
const inp: React.CSSProperties = {
  width: "100%", background: C.milk, border: "1.5px solid #ddd",
  borderRadius: 6, padding: "11px 14px", color: C.greenDark,
  fontSize: "0.88rem", outline: "none", boxSizing: "border-box",
};
