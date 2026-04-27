// src/AdminDashboard.tsx
import { useState, useMemo, useEffect } from "react";
import ambassadors from "./ambassadors";
import type { AmbassadorSlot } from "./ambassadors";
import logoImage from "../public/logo.png"
const C = {
  yellow:     "#fbdb21",
  yellowDark: "#E0B846",
  green:      "#12827c",
  greenDark:  "#0D5753",
  white:      "#ffffff",
  milk:       "#FFF9ED",
  milkDark:   "#F0EBD8",
};

type TabType = "ambassadors" | "schools" | "core" | "sub";
type FilterType = "all" | "active" | "vacant";
interface SlotRow { id: string; slot: AmbassadorSlot; }

// ── School full names ─────────────────────────────────────────────────────────
const SCHOOL_NAMES: Record<string, string> = {
  "EUI":    "Edo State University",
  "UNIBEN": "University of Benin",
  "AAU":    "Ambrose Aliu University",
  "DELSU":  "Delta State University",
  "ECU":    "Edwin Clark University",
  "SDU":    "University of Southern Denmark",
  "UNILAG": "University of Lagos",
  "PG":     "Postgraduate",
  "JVS":    "Other Brands / JVS",
};

export default function AdminDashboard() {
  const [tab, setTab]         = useState<TabType>("ambassadors");
  const [filter, setFilter]   = useState<FilterType>("all");
  const [search, setSearch]   = useState("");
  const [copied, setCopied]   = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const baseURL = typeof window !== "undefined" ? window.location.origin : "";

  // ── Slot filtering ──────────────────────────────────────────────────────────
  const slots: SlotRow[] = useMemo(() =>
    Object.entries(ambassadors.slots)
      .filter(([id, slot]) => {
        const matchesFilter = filter === "all" || slot.status === filter;
        const matchesSearch =
          id.includes(search) ||
          slot.name.toLowerCase().includes(search.toLowerCase()) ||
          slot.school.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
      })
      .map(([id, slot]) => ({ id, slot })),
  [filter, search]);

  const totalActive = Object.values(ambassadors.slots).filter(s => s.status === "active").length;
  const totalVacant = Object.values(ambassadors.slots).filter(s => s.status === "vacant").length;
  const total       = Object.keys(ambassadors.slots).length;

  // ── School stats ────────────────────────────────────────────────────────────
  const schoolStats = useMemo(() => {
    const map: Record<string, { active: number; vacant: number }> = {};
    Object.values(ambassadors.slots).forEach(slot => {
      const key = slot.school || "—";
      if (!map[key]) map[key] = { active: 0, vacant: 0 };
      if (slot.status === "active") map[key].active++;
      else map[key].vacant++;
    });
    return Object.entries(map).sort((a, b) => (b[1].active + b[1].vacant) - (a[1].active + a[1].vacant));
  }, []);

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${baseURL}/EduCraftA/${id}`);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const navTabs: { key: TabType; label: string; icon: string }[] = [
    { key: "ambassadors", label: "Ambassadors", icon: "" },
    { key: "schools",     label: "Schools",     icon: "" },
    { key: "core",        label: "Core",        icon: "" },
    { key: "sub",         label: "Sub",         icon: "🔗" },
  ];

  return (
    <div style={s.page}>

      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.logo}>
          <img src= {logoImage} alt="EduCraft" style={s.logoImg} />
          <div>
            <div style={s.logoTitle}>EduCraft</div>
            <div style={s.logoSub}>Ambassador Panel</div>
          </div>
        </div>

        {/* Desktop nav */}
        <nav style={{ ...s.desktopNav, display: isMobile ? "none" : "flex" }}>
          {navTabs.map(t => (
            <button key={t.key}
              style={{ ...s.navBtn, ...(tab === t.key ? s.navBtnActive : {}) }}
              onClick={() => setTab(t.key)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button style={{ ...s.hamburger, display: isMobile ? "flex" : "none" }} onClick={() => setMenuOpen(o => !o)}>
          {menuOpen ? "✕" : "☰"}
        </button>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={s.mobileMenu}>
          {navTabs.map(t => (
            <button key={t.key}
              style={{ ...s.mobileMenuItem, ...(tab === t.key ? s.mobileMenuItemActive : {}) }}
              onClick={() => { setTab(t.key); setMenuOpen(false); }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}

      <div style={s.accentBar} />

      <main style={s.main}>

        {/* ════════════════════════════════════════════════════
            TAB: AMBASSADORS
        ════════════════════════════════════════════════════ */}
        {tab === "ambassadors" && (<>
          <div style={s.statsRow}>
            <StatCard label="Total Slots" value={total}       color={C.green}     bg={C.milk} />
            <StatCard label="Active"      value={totalActive} color={C.white}     bg={C.green} />
            <StatCard label="Vacant"      value={totalVacant} color={C.greenDark} bg={C.yellow} />
            <StatCard label="Fill Rate"   value={`${Math.round((totalActive / total) * 100)}%`} color={C.white} bg={C.greenDark} />
          </div>

          <div style={s.sectionLabel}>Ambassador Slots</div>

          <div style={s.controls}>
            <input
              style={s.searchInput}
              placeholder="Search by name, slot ID, or school…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div style={s.filterGroup}>
              {(["all", "active", "vacant"] as FilterType[]).map(f => (
                <button key={f}
                  style={{ ...s.filterBtn, ...(filter === f ? s.filterBtnActive : {}) }}
                  onClick={() => setFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div style={s.tableWrapper}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  {["No.", "Slot ID", "Name", "School", "Status", "Link", "Copy"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map(({ id, slot }, i) => (
                  <tr key={id} style={{ ...s.tr, background: i % 2 === 0 ? C.white : C.milk }}>
                    <td style={s.td}><span style={s.rowNum}>{parseInt(id)}.</span></td>
                    <td style={s.td}><span style={s.slotId}>EduCraftA-{id}</span></td>
                    <td style={s.td}>
                      {slot.status === "active" && slot.name
                        ? <span style={{ color: C.greenDark, fontWeight: 600 }}>{slot.name}</span>
                        : <span style={{ color: "#bbb", fontStyle: "italic" }}>— Unassigned —</span>}
                    </td>
                    <td style={s.td}><span style={s.schoolTag}>{slot.school || "—"}</span></td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: slot.status === "active" ? C.green : C.yellowDark, color: slot.status === "active" ? C.white : C.greenDark }}>
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
                        {copied === id ? "✓" : "Copy"}
                      </button>
                    </td>
                  </tr>
                ))}
                {slots.length === 0 && (
                  <tr><td colSpan={7} style={s.emptyRow}>No slots match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ════════════════════════════════════════════════════
            TAB: SCHOOLS
        ════════════════════════════════════════════════════ */}
        {tab === "schools" && (<>
          <div style={s.sectionLabel}>School Coverage</div>
          <div style={s.schoolGrid}>
            {schoolStats.map(([abbr, stats]) => {
              const total = stats.active + stats.vacant;
              const pct   = Math.round((stats.active / total) * 100);
              return (
                <div key={abbr} style={s.schoolCard}>
                  <div style={s.schoolCardHeader}>
                    <div>
                      <div style={s.schoolAbbr}>{abbr}</div>
                      <div style={s.schoolName}>{SCHOOL_NAMES[abbr] || abbr}</div>
                    </div>
                    <div style={s.schoolTotal}>{total}</div>
                  </div>
                  <div style={s.progressBg}>
                    <div style={{ ...s.progressFill, width: `${pct}%` }} />
                  </div>
                  <div style={s.schoolFooter}>
                    <span style={{ color: C.green, fontWeight: 700 }}>● {stats.active} Active</span>
                    <span style={{ color: C.yellowDark, fontWeight: 600 }}>○ {stats.vacant} Vacant</span>
                    <span style={{ color: "#aaa" }}>{pct}% filled</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>)}

        {/* ════════════════════════════════════════════════════
            TAB: CORE AMBASSADORS
        ════════════════════════════════════════════════════ */}
        {tab === "core" && (<>
          <div style={s.sectionLabel}>Core Ambassadors — Senior Partners</div>
          <div style={s.infoBox}>
            <span style={s.infoIcon}>⭐</span>
            <span>Core Ambassadors earn <strong>10%</strong> per job they bring. They can recruit Sub-Ambassadors who earn <strong>7%</strong> per job — while the Core Ambassador earns an additional <strong>3%</strong> per Sub-Ambassador job.</span>
          </div>
          <div style={s.tableWrapper}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  {["No.", "Name", "School", "%", "Sub-Ambassadors", "Total Earning %"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ambassadors.coreAmbassadors.map((a, i) => {
                  const subCount    = ambassadors.subAmbassadors.filter(s => s.coreId === a.id).length;
                  const totalEarning = a.percentage + (subCount * 3);
                  return (
                    <tr key={a.id} style={{ ...s.tr, background: i % 2 === 0 ? C.white : C.milk }}>
                      <td style={s.td}><span style={s.rowNum}>{i + 1}.</span></td>
                      <td style={s.td}><span style={{ color: C.greenDark, fontWeight: 700 }}>{a.name}</span></td>
                      <td style={s.td}><span style={s.schoolTag}>{a.school}</span></td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: C.green, color: C.white }}>{a.percentage}%</span>
                      </td>
                      <td style={s.td}>
                        <span style={{ color: subCount > 0 ? C.green : "#bbb", fontWeight: subCount > 0 ? 700 : 400 }}>
                          {subCount > 0 ? `${subCount} sub${subCount > 1 ? "s" : ""}` : "—"}
                        </span>
                      </td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: C.yellow, color: C.greenDark, fontWeight: 800 }}>
                          {totalEarning}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ════════════════════════════════════════════════════
            TAB: SUB AMBASSADORS
        ════════════════════════════════════════════════════ */}
        {tab === "sub" && (<>
          <div style={s.sectionLabel}>Sub-Ambassadors — Under Core Partners</div>
          <div style={s.infoBox}>
            <span style={s.infoIcon}>🔗</span>
            <span>Sub-Ambassadors earn <strong>7%</strong> per job they bring. Their Core Ambassador earns an additional <strong>3%</strong> on every job a Sub brings in.</span>
          </div>
          <div style={s.tableWrapper}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  {["No.", "Name", "School", "%", "Under (Core Ambassador)"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ambassadors.subAmbassadors.map((a, i) => {
                  const core = ambassadors.coreAmbassadors.find(c => c.id === a.coreId);
                  return (
                    <tr key={a.id} style={{ ...s.tr, background: i % 2 === 0 ? C.white : C.milk }}>
                      <td style={s.td}><span style={s.rowNum}>{i + 1}.</span></td>
                      <td style={s.td}><span style={{ color: C.greenDark, fontWeight: 700 }}>{a.name}</span></td>
                      <td style={s.td}><span style={s.schoolTag}>{a.school}</span></td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: C.yellowDark, color: C.greenDark }}>{a.percentage}%</span>
                      </td>
                      <td style={s.td}>
                        {core
                          ? <span style={{ color: C.green, fontWeight: 600 }}>⭐ {core.name} <span style={{ color: "#aaa", fontWeight: 400 }}>({core.school})</span></span>
                          : <span style={{ color: "#bbb" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>)}

        <p style={s.footerNote}>
          Edit <code style={s.code}>src/ambassadors.ts</code> & <code style={s.code}>api/redirect.ts</code> → push to GitHub → Vercel redeploys in ~30s
        </p>
      </main>
    </div>
  );
}

function StatCard({ label, value, color, bg }: { label: string; value: number | string; color: string; bg: string }) {
  return (
    <div style={{ borderRadius: 14, padding: "20px 22px", background: bg, border: `1.5px solid ${bg === "#FFF9ED" ? "#E0B846" : bg}`, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
      <div style={{ fontSize: "2rem", fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "0.72rem", color, opacity: 0.85, marginTop: 6, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:        { minHeight: "100vh", background: C.milk, color: C.greenDark, fontFamily: "'Segoe UI', system-ui, sans-serif" },
  header:      { background: C.greenDark, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const },
  logo:        { display: "flex", alignItems: "center", gap: 12 },
  logoImg:     { width: 44, height: 44, objectFit: "contain" as const },
  logoTitle:   { fontSize: "1.1rem", fontWeight: 800, color: C.yellow },
  logoSub:     { fontSize: "0.68rem", color: C.white, opacity: 0.75 },
  desktopNav:  { display: "flex", gap: 6, flexWrap: "wrap" as const },
  navBtn:      { background: "transparent", border: `1.5px solid rgba(255,255,255,0.2)`, color: C.white, borderRadius: 8, padding: "8px 14px", fontSize: "0.82rem", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" as const },
  navBtnActive: { background: C.yellow, border: `1.5px solid ${C.yellow}`, color: C.greenDark },
  hamburger:   { display: "flex", background: "transparent", border: `1.5px solid rgba(255,255,255,0.3)`, color: C.white, borderRadius: 8, padding: "8px 12px", fontSize: "1.1rem", cursor: "pointer" },
  mobileMenu:  { background: C.greenDark, borderBottom: `3px solid ${C.yellow}`, display: "flex", flexDirection: "column" as const, padding: "8px 16px 16px" },
  mobileMenuItem: { background: "transparent", border: "none", borderBottom: `1px solid rgba(255,255,255,0.1)`, color: C.white, padding: "14px 8px", fontSize: "0.95rem", cursor: "pointer", textAlign: "left" as const, fontWeight: 600 },
  mobileMenuItemActive: { color: C.yellow },
  accentBar:   { height: 4, background: `linear-gradient(90deg, ${C.yellow}, ${C.yellowDark}, ${C.green})` },
  main:        { padding: "24px 16px", maxWidth: 1200, margin: "0 auto" },
  statsRow:    { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 28 },
  sectionLabel: { fontSize: "0.68rem", fontWeight: 700, color: C.green, textTransform: "uppercase" as const, letterSpacing: "0.12em", marginBottom: 12 },
  controls:    { display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" as const, alignItems: "center" },
  searchInput: { flex: 1, minWidth: 180, background: C.white, border: `1.5px solid ${C.yellowDark}`, borderRadius: 8, padding: "10px 14px", color: C.greenDark, fontSize: "0.88rem", outline: "none" },
  filterGroup: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  filterBtn:   { background: C.white, border: `1.5px solid ${C.green}`, color: C.green, borderRadius: 8, padding: "9px 16px", fontSize: "0.82rem", cursor: "pointer", fontWeight: 600 },
  filterBtnActive: { background: C.green, border: `1.5px solid ${C.green}`, color: C.white },
  tableWrapper: { background: C.white, border: `1.5px solid ${C.milkDark}`, borderRadius: 14, overflowX: "auto" as const, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", WebkitOverflowScrolling: "touch" as const },
  table:       { width: "100%", borderCollapse: "collapse" as const, minWidth: 500 },
  thead:       { background: C.greenDark },
  th:          { padding: "12px 14px", textAlign: "left" as const, fontSize: "0.68rem", fontWeight: 700, color: C.yellow, textTransform: "uppercase" as const, letterSpacing: "0.08em", whiteSpace: "nowrap" as const },
  tr:          { borderBottom: `1px solid ${C.milkDark}` },
  td:          { padding: "11px 14px", fontSize: "0.85rem", verticalAlign: "middle" as const },
  rowNum:      { color: "#bbb", fontSize: "0.78rem" },
  slotId:      { fontFamily: "monospace", color: C.green, fontWeight: 700, fontSize: "0.82rem" },
  schoolTag:   { background: C.milk, border: `1px solid ${C.milkDark}`, color: C.green, padding: "2px 8px", borderRadius: 6, fontSize: "0.78rem", fontWeight: 600 },
  badge:       { fontSize: "0.72rem", fontWeight: 700, padding: "4px 10px", borderRadius: 999, display: "inline-block", whiteSpace: "nowrap" as const },
  linkText:    { fontFamily: "monospace", color: C.yellowDark, fontSize: "0.78rem", fontWeight: 600 },
  copyBtn:     { background: C.milk, border: `1.5px solid ${C.green}`, color: C.green, borderRadius: 6, padding: "5px 12px", fontSize: "0.78rem", cursor: "pointer", fontWeight: 700 },
  copyBtnDone: { background: C.green, border: `1.5px solid ${C.green}`, color: C.white },
  emptyRow:    { padding: 40, textAlign: "center" as const, color: "#bbb" },
  // Schools tab
  schoolGrid:  { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 },
  schoolCard:  { background: C.white, border: `1.5px solid ${C.milkDark}`, borderRadius: 14, padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  schoolCardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  schoolAbbr:  { fontSize: "1.2rem", fontWeight: 900, color: C.greenDark },
  schoolName:  { fontSize: "0.75rem", color: "#888", marginTop: 2 },
  schoolTotal: { fontSize: "2rem", fontWeight: 900, color: C.green },
  progressBg:  { height: 8, background: C.milk, borderRadius: 999, overflow: "hidden" as const, marginBottom: 10 },
  progressFill: { height: "100%", background: `${C.green}`, borderRadius: 999, transition: "width 0.4s ease" },
  schoolFooter: { display: "flex", justifyContent: "space-between", fontSize: "0.75rem", flexWrap: "wrap" as const, gap: 4 },
  // Info box
  infoBox:     { background: C.white, border: `1.5px solid ${C.yellowDark}`, borderRadius: 10, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start", fontSize: "0.88rem", color: C.greenDark, lineHeight: 1.6 },
  infoIcon:    { fontSize: "1.3rem", flexShrink: 0 },
  footerNote:  { marginTop: 28, color: "#aaa", fontSize: "0.76rem", textAlign: "center" as const },
  code:        { background: C.milk, border: `1px solid ${C.yellowDark}`, padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", color: C.green, fontSize: "0.76rem" },
};
