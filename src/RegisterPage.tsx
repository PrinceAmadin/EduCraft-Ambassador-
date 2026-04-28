// src/RegisterPage.tsx
// Public page: ambassadors fill this in once to link their email to their slot ID.
// URL: yourapp.vercel.app/register

import { useState } from "react";

const C = {
  yellow:     "#fbdb21",
  yellowDark: "#E0B846",
  green:      "#12827c",
  greenDark:  "#0D5753",
  white:      "#ffffff",
  milk:       "#FFF9ED",
  milkDark:   "#F0EBD8",
  red:        "#ef4444",
  redLight:   "#fef2f2",
};

type Status = "idle" | "loading" | "success" | "error";

export default function RegisterPage() {
  const [form, setForm] = useState({ slotId: "", name: "", school: "", email: "" });
  const [status,  setStatus]  = useState<Status>("idle");
  const [errMsg,  setErrMsg]  = useState("");

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async () => {
    const { slotId, name, school, email } = form;

    if (!slotId.trim()) { setStatus("error"); setErrMsg("Please enter your Slot ID."); return; }
    if (!name.trim())   { setStatus("error"); setErrMsg("Please enter your full name."); return; }
    if (!email.trim())  { setStatus("error"); setErrMsg("Please enter your email address."); return; }

    setStatus("loading");
    setErrMsg("");

    try {
      const resp = await fetch("/api/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ slotId: slotId.trim(), name: name.trim(), school: school.trim(), email: email.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Registration failed. Please try again.");
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrMsg((err as Error).message);
    }
  };

  // ── Success state ──────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: "center" as const }}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>🎉</div>
          <h2 style={successTitle}>You're registered!</h2>
          <p style={successBody}>
            Your EduCraft ambassador link is now fully tracked. Every time a client
            uses your link and places an order, you'll receive an email notification
            with your commission details.
          </p>
          <div style={divider} />
          <p style={brandTag}>EDUCRAFT — Academic &amp; Technical Documentation Experts</p>
        </div>
      </div>
    );
  }

  // ── Form state ─────────────────────────────────────────────────────────────
  return (
    <div style={page}>
      <div style={card}>

        {/* Header */}
        <div style={{ textAlign: "center" as const, marginBottom: 32 }}>
          <div style={{ fontSize: "2.6rem", marginBottom: 10 }}>🎓</div>
          <h1 style={cardTitle}>Activate Your Ambassador Link</h1>
          <p style={cardSubtitle}>
            Register once to start tracking your referrals and receive automatic
            commission notifications straight to your email.
          </p>
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 18 }}>

          {/* Slot ID */}
          <div>
            <label style={label}>Your Slot ID *</label>
            <input
              style={input}
              placeholder="e.g. 007  or  ECCA-001  or  ECSA-001-001"
              value={form.slotId}
              onChange={set("slotId")}
              autoComplete="off"
            />
            <p style={hint}>This is your position number — ask your EduCraft coordinator if unsure.</p>
          </div>

          {/* Full name */}
          <div>
            <label style={label}>Full Name *</label>
            <input style={input} placeholder="Your full name" value={form.name} onChange={set("name")} />
          </div>

          {/* School */}
          <div>
            <label style={label}>School / University</label>
            <input style={input} placeholder="e.g. EUI, UNIBEN, DELSU…" value={form.school} onChange={set("school")} />
          </div>

          {/* Email */}
          <div>
            <label style={label}>Email Address *</label>
            <input
              style={input}
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={set("email")}
            />
            <p style={hint}>You'll receive a notification every time you earn a commission.</p>
          </div>

          {/* Error banner */}
          {status === "error" && (
            <div style={errorBox}>⚠️ {errMsg}</div>
          )}

          {/* Submit */}
          <button
            style={{
              ...submitBtn,
              opacity:   status === "loading" ? 0.7 : 1,
              cursor:    status === "loading" ? "not-allowed" : "pointer",
              marginTop: 4,
            }}
            onClick={handleSubmit}
            disabled={status === "loading"}
          >
            {status === "loading" ? "Activating…" : "Activate My Link →"}
          </button>
        </div>

        <p style={privacyNote}>
          Your information is only used to send you commission notifications. We never share your data.
        </p>

        <div style={divider} />
        <p style={brandTag}>EDUCRAFT — Academic &amp; Technical Documentation Experts</p>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const page: React.CSSProperties = {
  minHeight:      "100vh",
  background:     C.milk,
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
  padding:        "32px 16px",
  fontFamily:     "'Segoe UI', system-ui, sans-serif",
};

const card: React.CSSProperties = {
  background:   C.white,
  border:       `2px solid ${C.yellowDark}`,
  borderRadius: 20,
  padding:      "40px 36px",
  maxWidth:     480,
  width:        "100%",
  boxShadow:    "0 4px 28px rgba(13,87,83,.12)",
};

const cardTitle: React.CSSProperties = {
  color:      C.greenDark,
  fontSize:   "1.5rem",
  fontWeight: 900,
  margin:     "0 0 10px",
  lineHeight: 1.2,
};

const cardSubtitle: React.CSSProperties = {
  color:      C.green,
  fontSize:   "0.88rem",
  lineHeight: 1.7,
  margin:     0,
};

const label: React.CSSProperties = {
  display:       "block",
  fontSize:      "0.72rem",
  fontWeight:    700,
  color:         C.green,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom:  6,
};

const input: React.CSSProperties = {
  width:        "100%",
  background:   C.milk,
  border:       `1.5px solid ${C.yellowDark}`,
  borderRadius: 8,
  padding:      "11px 14px",
  color:        C.greenDark,
  fontSize:     "0.88rem",
  outline:      "none",
  boxSizing:    "border-box",
};

const hint: React.CSSProperties = {
  fontSize:   "0.74rem",
  color:      "#aaa",
  marginTop:  5,
  lineHeight: 1.5,
};

const errorBox: React.CSSProperties = {
  background:   C.redLight,
  border:       `1.5px solid ${C.red}`,
  borderRadius: 8,
  padding:      "11px 14px",
  color:        C.red,
  fontSize:     "0.85rem",
  fontWeight:   600,
};

const submitBtn: React.CSSProperties = {
  background:    C.yellow,
  color:         C.greenDark,
  border:        "none",
  borderRadius:  10,
  padding:       "14px",
  fontSize:      "1rem",
  fontWeight:    800,
  width:         "100%",
  letterSpacing: "0.02em",
};

const privacyNote: React.CSSProperties = {
  marginTop:  20,
  fontSize:   "0.73rem",
  color:      "#bbb",
  textAlign:  "center",
  lineHeight: 1.6,
};

const divider: React.CSSProperties = {
  margin:     "20px 0 16px",
  borderTop:  `1px solid ${C.milkDark}`,
};

const brandTag: React.CSSProperties = {
  textAlign:     "center",
  fontSize:      "0.68rem",
  color:         C.green,
  fontWeight:    700,
  letterSpacing: "0.08em",
  margin:        0,
};

const successTitle: React.CSSProperties = {
  color:      C.greenDark,
  fontSize:   "1.5rem",
  fontWeight: 900,
  margin:     "0 0 14px",
};

const successBody: React.CSSProperties = {
  color:      C.green,
  lineHeight: 1.7,
  fontSize:   "0.92rem",
  margin:     "0 0 8px",
};
