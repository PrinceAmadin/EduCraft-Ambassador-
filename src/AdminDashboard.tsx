// src/AdminDashboard.tsx
import { useState, useMemo } from "react";
import ambassadors from "./ambassadors";
import type { AmbassadorSlot } from "./ambassadors";

type FilterType = "all" | "active" | "vacant";
interface SlotRow { id: string; slot: AmbassadorSlot; }

export default function AdminDashboard() {
  const [filter, setFilter]   = useState<FilterType>("all");
  const [search, setSearch]   = useState("");
  const [copied, setCopied]   = useState<string | null>(null);

  const baseURL = typeof window !== "undefined" ? window.location.origin : "";

  const slots: SlotRow[] = useMemo(() =>
    Object.entries(ambassadors.slots)
      .filter(([id, slot]) => {
        const matchesFilter = filter === "all" || slot.status === filter;
        const matchesSearch = id.includes(search) || slot.name.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
      })
      .map(([id, slot]) => ({ id, slot })),
  [filter, search]);

  const totalActive = Object.values(ambassadors.slots).filter(s => s.status === "active").length;
  const totalVacant = Object.values(ambassadors.slots).filter(s => s.status === "vacant").length;
  const total       = Object.keys(ambassadors.slots).length;

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${baseURL}/EduCraftA/${id}`);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.logo}>
          <span style={{ fontSize: 32 }}>🎓</span>
          <div>
            <div style={s.logoTitle}>EduCraft</div>
            <div style={s.logoSub}>Ambassador Control Panel</div>
          </div>
        </div>
        <span style={s.badge}>v1.0</span>
      </header>

      <main style={s.main}>
        <div style={s.statsRow}>
          <StatCard label="Total Slots" value={total}       color="#6366f1" />
          <StatCard label="Active"      value={totalActive} color="#22c55e" />
          <StatCard label="Vacant"      value={totalVacant} color="#f59e0b" />
          <StatCard label="Fill Rate"   value={`${Math.round((totalActive / total) * 100)}%`} color="#38bdf8" />
        </div>

        <div style={s.controls}>
          <input
            style={s.searchInput}
            placeholder="Search by ID or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            {(["all", "active", "vacant"] as FilterType[]).map(f => (
              <button key={f} style={{ ...s.filterBtn, ...(filter === f ? s.filterBtnActive : {}) }} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={s.tableWrapper}>
          <table style={s.table}>
            <thead>
              <tr>{["Slot","Ambassador","Status","Link","Copy"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {slots.map(({ id, slot }) => (
                <tr key={id} style={s.tr}>
                  <td style={s.td}><span style={s.slotId}>EduCraftA-{id}</span></td>
                  <td style={s.td}>
                    {slot.status === "active"
                      ? <span style={{ color: "#f1f5f9" }}>{slot.name}</span>
                      : <span style={{ color: "#475569", fontStyle: "italic" }}>— Unassigned —</span>}
                  </td>
                  <td style={s.td}>
                    <span style={{ ...s.statusBadge, background: slot.status === "active" ? "#14532d" : "#431407", color: slot.status === "active" ? "#4ade80" : "#fb923c" }}>
                      {slot.status === "active" ? "● Active" : "○ Vacant"}
                    </span>
                  </td>
                  <td style={s.td}><span style={s.linkText}>/EduCraftA/{id}</span></td>
                  <td style={s.td}>
                    <button
                      style={{ ...s.copyBtn, ...(copied === id ? s.copyBtnDone : {}) }}
                      onClick={() => copyLink(id)}
                      disabled={slot.status === "vacant"}
                    >
                      {copied === id ? "✓ Copied" : "Copy Link"}
                    </button>
                  </td>
                </tr>
              ))}
              {slots.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#475569" }}>No slots match.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p style={s.footerNote}>
          To update ambassadors, edit <code style={s.code}>src/ambassadors.ts</code> and push to GitHub. Vercel redeploys in ~30s.
        </p>
      </main>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ ...s.statCard, borderTop: `3px solid ${color}` }}>
      <div style={{ ...s.statValue, color }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:          { minHeight: "100vh", background: "#0a0f1e", color: "#e2e8f0", fontFamily: "'Segoe UI', system-ui, sans-serif" },
  header:        { background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo:          { display: "flex", alignItems: "center", gap: 14 },
  logoTitle:     { fontSize: "1.2rem", fontWeight: 700, color: "#f1f5f9" },
  logoSub:       { fontSize: "0.75rem", color: "#64748b", marginTop: 2 },
  badge:         { background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", fontSize: "0.7rem", padding: "4px 10px", borderRadius: 999 },
  main:          { padding: "32px", maxWidth: 1100, margin: "0 auto" },
  statsRow:      { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 28 },
  statCard:      { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "20px 24px" },
  statValue:     { fontSize: "2rem", fontWeight: 800, lineHeight: 1 },
  statLabel:     { color: "#64748b", fontSize: "0.8rem", marginTop: 6 },
  controls:      { display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" },
  searchInput:   { flex: 1, minWidth: 200, background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 16px", color: "#e2e8f0", fontSize: "0.9rem", outline: "none" },
  filterBtn:     { background: "#0f172a", border: "1px solid #334155", color: "#94a3b8", borderRadius: 8, padding: "10px 18px", fontSize: "0.85rem", cursor: "pointer" },
  filterBtnActive: { background: "#6366f1", border: "1px solid #6366f1", color: "#fff" },
  tableWrapper:  { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, overflow: "auto" },
  table:         { width: "100%", borderCollapse: "collapse" },
  th:            { padding: "14px 20px", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #1e293b" },
  tr:            { borderBottom: "1px solid #1e293b" },
  td:            { padding: "14px 20px", fontSize: "0.9rem", verticalAlign: "middle" },
  slotId:        { fontFamily: "monospace", color: "#818cf8", fontWeight: 600 },
  statusBadge:   { fontSize: "0.75rem", fontWeight: 600, padding: "4px 10px", borderRadius: 999, display: "inline-block" },
  linkText:      { fontFamily: "monospace", color: "#38bdf8", fontSize: "0.85rem" },
  copyBtn:       { background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0", borderRadius: 6, padding: "6px 14px", fontSize: "0.8rem", cursor: "pointer" },
  copyBtnDone:   { background: "#14532d", border: "1px solid #22c55e", color: "#4ade80" },
  footerNote:    { marginTop: 20, color: "#475569", fontSize: "0.82rem", textAlign: "center" },
  code:          { background: "#1e293b", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", color: "#818cf8" },
};
