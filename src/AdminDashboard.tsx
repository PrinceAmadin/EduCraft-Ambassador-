// src/AdminDashboard.tsx
import { useState, useMemo, useEffect } from "react";
import ambassadors from "./ambassadors";
import type { AmbassadorSlot, CoreAmbassador, SubAmbassador } from "./ambassadors";
import logoImage from "../public/logo.png";

const C = {
  yellow:     "#fbdb21",
  yellowDark: "#E0B846",
  green:      "#12827c",
  greenDark:  "#0D5753",
  white:      "#ffffff",
  milk:       "#FFF9ED",
  milkDark:   "#F0EBD8",
};

type TabType = "ambassadors" | "schools" | "core" | "sub" | "manage";
type FilterType = "all" | "active" | "vacant";
interface SlotRow { id: string; slot: AmbassadorSlot; }

// ── School full names ──────────────────────────────────────────────────────────
const SCHOOL_NAMES: Record<string, string> = {
  "EUI":    "Edo State University",
  "UNIBEN": "University of Benin",
  "AAU":    "Ambrose Aliu University",
  "DELSU":  "Delta State University",
  "ECU":    "Edwin Clark University",
  "SDU":    "University of Southern Denmark",
  "UNILAG": "University of Lagos",
  "PG":     "Postgraduate",
  "Admin":  "Administration",
};

// ── Local-storage key for manage edits ────────────────────────────────────────
const LS_KEY = "educraft_manage_slots";

type EditableSlots = Record<string, { name: string; school: string; status: "active" | "vacant" }>;

function loadEdits(): EditableSlots | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveEdits(data: EditableSlots) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* noop */ }
}

// ── Code generator ─────────────────────────────────────────────────────────────
function generateAmbassadorsCode(slots: EditableSlots, core: CoreAmbassador[], sub: SubAmbassador[], phone: string): string {
  const slotLines = Object.entries(slots).map(([id, s]) => {
    const name   = s.name   ? `"${s.name}"` : `""`;
    const school = s.school ? `"${s.school}"` : `""`;
    const status = `"${s.status}"`;
    const pad    = (str: string, len: number) => str.padEnd(len);
    return `    "${id}": { name: ${pad(name + ",", 22)} school: ${pad(school + ",", 14)} status: ${status} },`;
  }).join("\n");

  const coreLines = core.map(c =>
    `    { id: "${c.id}", name: "${c.name}", school: "${c.school}", percentage: ${c.percentage} },`
  ).join("\n");

  const subLines = sub.map(s =>
    `    { id: "${s.id}", name: "${s.name}", school: "${s.school}", percentage: ${s.percentage}, coreId: "${s.coreId}" },`
  ).join("\n");

  return `// src/ambassadors.ts
// ✏️ THE FILE YOU EDIT to manage all ambassador data

export interface AmbassadorSlot {
  name: string;
  school: string;
  status: "active" | "vacant";
}

export interface CoreAmbassador {
  id: string;
  name: string;
  school: string;
  percentage: number;
}

export interface SubAmbassador {
  id: string;
  name: string;
  school: string;
  percentage: number;
  coreId: string;
}

export interface AmbassadorData {
  educraft_whatsapp: string;
  slots: Record<string, AmbassadorSlot>;
  coreAmbassadors: CoreAmbassador[];
  subAmbassadors: SubAmbassador[];
}

const ambassadors: AmbassadorData = {
  educraft_whatsapp: "${phone}",

  slots: {
${slotLines}
  },

  coreAmbassadors: [
${coreLines}
  ],

  subAmbassadors: [
${subLines}
  ],
};

export default ambassadors;
`;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [tab,       setTab]       = useState<TabType>("ambassadors");
  const [filter,    setFilter]    = useState<FilterType>("all");
  const [search,    setSearch]    = useState("");
  const [copied,    setCopied]    = useState<string | null>(null);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [isMobile,  setIsMobile]  = useState(window.innerWidth <= 640);

  // Manage tab state
  const [editSlots,  setEditSlots]  = useState<EditableSlots>(() => {
    const saved = loadEdits();
    if (saved) return saved;
    // seed from ambassadors.ts
    const seed: EditableSlots = {};
    Object.entries(ambassadors.slots).forEach(([id, s]) => {
      seed[id] = { name: s.name, school: s.school, status: s.status };
    });
    return seed;
  });
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editName,    setEditName]    = useState("");
  const [editSchool,  setEditSchool]  = useState("");
  const [editStatus,  setEditStatus]  = useState<"active" | "vacant">("active");
  const [showCode,    setShowCode]    = useState(false);
  const [codeCopied,  setCodeCopied]  = useState(false);
  const [manageSearch, setManageSearch] = useState("");
  const [unsaved,     setUnsaved]     = useState(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const baseURL = typeof window !== "undefined" ? window.location.origin : "";

  // ── Slot filtering ────────────────────────────────────────────────────────
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

  // ── School stats ──────────────────────────────────────────────────────────
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

  // ── Copy helpers ──────────────────────────────────────────────────────────
  const copyLink = (id: string, prefix = "EduCraftA") => {
    const key = `${prefix}-${id}`;
    navigator.clipboard.writeText(`${baseURL}/${prefix}/${id}`);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Manage tab helpers ────────────────────────────────────────────────────
  const startEdit = (id: string) => {
    const s = editSlots[id];
    setEditingId(id);
    setEditName(s.name);
    setEditSchool(s.school);
    setEditStatus(s.status);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const updated = { ...editSlots, [editingId]: { name: editName, school: editSchool, status: editStatus } };
    setEditSlots(updated);
    saveEdits(updated);
    setEditingId(null);
    setUnsaved(true);
  };

  const cancelEdit = () => setEditingId(null);

  const generatedCode = useMemo(() =>
    generateAmbassadorsCode(
      editSlots,
      ambassadors.coreAmbassadors,
      ambassadors.subAmbassadors,
      ambassadors.educraft_whatsapp
    ),
  [editSlots]);

  const copyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  };

  const manageRows = useMemo(() =>
    Object.entries(editSlots).filter(([id, s]) => {
      const q = manageSearch.toLowerCase();
      return !q || id.includes(q) || s.name.toLowerCase().includes(q) || s.school.toLowerCase().includes(q);
    }),
  [editSlots, manageSearch]);

  const navTabs: { key: TabType; label: string; icon: string }[] = [
    { key: "ambassadors", label: "Ambassadors", icon: "👥" },
    { key: "schools",     label: "Schools",     icon: "🏫" },
    { key: "core",        label: "Core (ECCA)",  icon: "⭐" },
    { key: "sub",         label: "Sub (ECSA)",   icon: "🔗" },
    { key: "manage",      label: "Manage",       icon: "⚙️" },
  ];

  return (
    <div style={s.page}>

      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.logo}>
          <img src={logoImage} alt="EduCraft" style={s.logoImg} />
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
              {t.key === "manage" && unsaved && <span style={s.unsavedDot} />}
            </button>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button
          style={{ ...s.hamburger, display: isMobile ? "flex" : "none" }}
          onClick={() => setMenuOpen(o => !o)}
        >
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
              {t.key === "manage" && unsaved && " 🟡"}
            </button>
          ))}
        </div>
      )}

      <div style={s.accentBar} />

      <main style={s.main}>

        {/* ══════════════════════════════════════════════════════
            TAB: AMBASSADORS
        ══════════════════════════════════════════════════════ */}
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
                        style={{ ...s.copyBtn, ...(copied === `EduCraftA-${id}` ? s.copyBtnDone : {}) }}
                        onClick={() => copyLink(id)}
                        disabled={slot.status === "vacant"}
                      >
                        {copied === `EduCraftA-${id}` ? "✓" : "Copy"}
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

        {/* ══════════════════════════════════════════════════════
            TAB: SCHOOLS
        ══════════════════════════════════════════════════════ */}
        {tab === "schools" && (<>
          <div style={s.sectionLabel}>School Coverage</div>
          <div style={s.schoolGrid}>
            {schoolStats.map(([abbr, stats]) => {
              const tot = stats.active + stats.vacant;
              const pct = Math.round((stats.active / tot) * 100);
              return (
                <div key={abbr} style={s.schoolCard}>
                  <div style={s.schoolCardHeader}>
                    <div>
                      <div style={s.schoolAbbr}>{abbr || "—"}</div>
                      <div style={s.schoolName}>{SCHOOL_NAMES[abbr] || abbr}</div>
                    </div>
                    <div style={s.schoolTotal}>{tot}</div>
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

        {/* ══════════════════════════════════════════════════════
            TAB: CORE AMBASSADORS
        ══════════════════════════════════════════════════════ */}
        {tab === "core" && (<>
          <div style={s.sectionLabel}>Core Ambassadors (ECCA) — Senior Partners</div>
          <div style={s.infoBox}>
            <span style={s.infoIcon}>⭐</span>
            <div>
              <p>Core Ambassadors earn their base % per job they bring. They can recruit Sub-Ambassadors who earn <strong>7%</strong> per job — while the Core earns an extra <strong>3%</strong> per Sub job.</p>
              <p style={{ marginTop: 8 }}>Each Core has a unique <strong>Recruitment Link (ECCA)</strong> — share this with potential Sub-Ambassadors to join under them.</p>
            </div>
          </div>
          <div style={s.tableWrapper}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  {["No.", "ID", "Name", "School", "Base %", "Subs", "Total %", "Recruit Link", "Copy"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ambassadors.coreAmbassadors.map((a, i) => {
                  const subCount     = ambassadors.subAmbassadors.filter(s => s.coreId === a.id).length;
                  const totalEarning = a.percentage + (subCount * 3);
                  const copyKey      = `ecca-${a.id}`;
                  return (
                    <tr key={a.id} style={{ ...s.tr, background: i % 2 === 0 ? C.white : C.milk }}>
                      <td style={s.td}><span style={s.rowNum}>{i + 1}.</span></td>
                      <td style={s.td}><span style={s.slotId}>{a.id}</span></td>
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
                      <td style={s.td}><span style={s.linkText}>/ECCA/{a.id}</span></td>
                      <td style={s.td}>
                        <button
                          style={{ ...s.copyBtn, ...(copied === copyKey ? s.copyBtnDone : {}) }}
                          onClick={() => {
                            navigator.clipboard.writeText(`${baseURL}/ECCA/${a.id}`);
                            setCopied(copyKey);
                            setTimeout(() => setCopied(null), 2000);
                          }}
                        >
                          {copied === copyKey ? "✓" : "Copy"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ══════════════════════════════════════════════════════
            TAB: SUB AMBASSADORS
        ══════════════════════════════════════════════════════ */}
        {tab === "sub" && (<>
          <div style={s.sectionLabel}>Sub-Ambassadors (ECSA) — Under Core Partners</div>
          <div style={s.infoBox}>
            <span style={s.infoIcon}>🔗</span>
            <div>
              <p>Sub-Ambassadors earn <strong>7%</strong> per job they bring. Their Core Ambassador earns an additional <strong>3%</strong> on every job a Sub brings in.</p>
              <p style={{ marginTop: 8 }}>Each Sub has a unique <strong>Client Referral Link (ECSA)</strong> — share with potential clients.</p>
            </div>
          </div>
          <div style={s.tableWrapper}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  {["No.", "ID", "Name", "School", "%", "Under (Core)", "Client Link", "Copy"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ambassadors.subAmbassadors.map((a, i) => {
                  const core    = ambassadors.coreAmbassadors.find(c => c.id === a.coreId);
                  const copyKey = `ecsa-${a.id}`;
                  return (
                    <tr key={a.id} style={{ ...s.tr, background: i % 2 === 0 ? C.white : C.milk }}>
                      <td style={s.td}><span style={s.rowNum}>{i + 1}.</span></td>
                      <td style={s.td}><span style={s.slotId}>{a.id}</span></td>
                      <td style={s.td}><span style={{ color: C.greenDark, fontWeight: 700 }}>{a.name}</span></td>
                      <td style={s.td}><span style={s.schoolTag}>{a.school}</span></td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: C.yellowDark, color: C.greenDark }}>{a.percentage}%</span>
                      </td>
                      <td style={s.td}>
                        {core
                          ? <span style={{ color: C.green, fontWeight: 600 }}>⭐ {core.name}</span>
                          : <span style={{ color: "#bbb" }}>—</span>}
                      </td>
                      <td style={s.td}><span style={s.linkText}>/ECSA/{a.id}</span></td>
                      <td style={s.td}>
                        <button
                          style={{ ...s.copyBtn, ...(copied === copyKey ? s.copyBtnDone : {}) }}
                          onClick={() => {
                            navigator.clipboard.writeText(`${baseURL}/ECSA/${a.id}`);
                            setCopied(copyKey);
                            setTimeout(() => setCopied(null), 2000);
                          }}
                        >
                          {copied === copyKey ? "✓" : "Copy"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {ambassadors.subAmbassadors.length === 0 && (
                  <tr><td colSpan={8} style={s.emptyRow}>No sub-ambassadors yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ══════════════════════════════════════════════════════
            TAB: MANAGE
        ══════════════════════════════════════════════════════ */}
        {tab === "manage" && (<>
          <div style={s.sectionLabel}>⚙️ Manage Ambassador Slots</div>

          <div style={s.infoBox}>
            <span style={s.infoIcon}>💡</span>
            <div style={{ fontSize: "0.85rem", lineHeight: 1.7 }}>
              Edit any slot below. Changes are saved <strong>locally</strong> in your browser. When done, click <strong>Generate Code</strong> → copy the code → paste into <code style={s.code}>src/ambassadors.ts</code> and <code style={s.code}>api/redirect.ts</code> → push to GitHub → Vercel redeploys in ~30s.
            </div>
          </div>

          {/* Action bar */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" as const, alignItems: "center" }}>
            <input
              style={{ ...s.searchInput, maxWidth: 300 }}
              placeholder="Search slots…"
              value={manageSearch}
              onChange={e => setManageSearch(e.target.value)}
            />
            <button
              style={{ ...s.actionBtn, background: C.green, color: C.white, marginLeft: "auto" }}
              onClick={() => setShowCode(c => !c)}
            >
              {showCode ? "Hide Code" : "📋 Generate Code"}
            </button>
            {unsaved && (
              <span style={{ fontSize: "0.78rem", color: C.yellowDark, fontWeight: 700 }}>
                ● Unsaved changes — generate code to apply
              </span>
            )}
          </div>

          {/* Code output panel */}
          {showCode && (
            <div style={s.codePanel}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, color: C.yellow, fontSize: "0.85rem" }}>
                  📄 Generated ambassadors.ts — copy & paste into your project
                </span>
                <button
                  style={{ ...s.actionBtn, background: codeCopied ? C.green : C.yellow, color: C.greenDark, padding: "6px 16px" }}
                  onClick={copyCode}
                >
                  {codeCopied ? "✓ Copied!" : "Copy All"}
                </button>
              </div>
              <pre style={s.codeBlock}>{generatedCode}</pre>
            </div>
          )}

          {/* Edit form modal (inline) */}
          {editingId && (
            <div style={s.editCard}>
              <div style={{ fontWeight: 800, color: C.greenDark, marginBottom: 12, fontSize: "0.95rem" }}>
                Editing Slot <span style={{ color: C.green }}>EduCraftA-{editingId}</span>
              </div>
              <div style={s.formRow}>
                <label style={s.formLabel}>Name</label>
                <input
                  style={s.formInput}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Ambassador name"
                />
              </div>
              <div style={s.formRow}>
                <label style={s.formLabel}>School</label>
                <input
                  style={s.formInput}
                  value={editSchool}
                  onChange={e => setEditSchool(e.target.value)}
                  placeholder="EUI, UNIBEN, DELSU…"
                />
              </div>
              <div style={s.formRow}>
                <label style={s.formLabel}>Status</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["active", "vacant"] as const).map(st => (
                    <button
                      key={st}
                      style={{
                        ...s.filterBtn,
                        ...(editStatus === st ? { background: st === "active" ? C.green : C.yellowDark, color: st === "active" ? C.white : C.greenDark, border: "none" } : {})
                      }}
                      onClick={() => setEditStatus(st)}
                    >
                      {st === "active" ? "● Active" : "○ Vacant"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button style={{ ...s.actionBtn, background: C.green, color: C.white }} onClick={saveEdit}>
                  ✓ Save
                </button>
                <button style={{ ...s.actionBtn, background: C.milk, color: C.greenDark, border: `1.5px solid ${C.milkDark}` }} onClick={cancelEdit}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Slots table */}
          <div style={s.tableWrapper}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  {["Slot", "Name", "School", "Status", ""].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {manageRows.map(([id, slot], i) => (
                  <tr key={id} style={{ ...s.tr, background: i % 2 === 0 ? C.white : C.milk, ...(editingId === id ? { outline: `2px solid ${C.green}` } : {}) }}>
                    <td style={s.td}><span style={s.slotId}>EduCraftA-{id}</span></td>
                    <td style={s.td}>
                      {slot.name
                        ? <span style={{ color: C.greenDark, fontWeight: 600 }}>{slot.name}</span>
                        : <span style={{ color: "#bbb", fontStyle: "italic" }}>— Vacant —</span>}
                    </td>
                    <td style={s.td}><span style={s.schoolTag}>{slot.school || "—"}</span></td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: slot.status === "active" ? C.green : C.yellowDark, color: slot.status === "active" ? C.white : C.greenDark }}>
                        {slot.status === "active" ? "● Active" : "○ Vacant"}
                      </span>
                    </td>
                    <td style={s.td}>
                      <button
                        style={{ ...s.copyBtn, ...(editingId === id ? { background: C.yellow, color: C.greenDark } : {}) }}
                        onClick={() => editingId === id ? cancelEdit() : startEdit(id)}
                      >
                        {editingId === id ? "Editing…" : "✏️ Edit"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ ...s.footerNote, marginTop: 16 }}>
            Changes are stored locally. Use <strong>Generate Code</strong> → copy → paste into <code style={s.code}>src/ambassadors.ts</code> → push to GitHub.
          </p>
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
  header:      { background: C.greenDark, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  logo:        { display: "flex", alignItems: "center", gap: 12 },
  logoImg:     { width: 44, height: 44, objectFit: "contain" },
  logoTitle:   { fontSize: "1.1rem", fontWeight: 800, color: C.yellow },
  logoSub:     { fontSize: "0.68rem", color: C.white, opacity: 0.75 },
  desktopNav:  { display: "flex", gap: 6, flexWrap: "wrap" },
  navBtn:      { background: "transparent", border: `1.5px solid rgba(255,255,255,0.2)`, color: C.white, borderRadius: 8, padding: "8px 14px", fontSize: "0.82rem", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap", position: "relative" },
  navBtnActive: { background: C.yellow, border: `1.5px solid ${C.yellow}`, color: C.greenDark },
  unsavedDot:  { position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: "50%", background: C.yellow },
  hamburger:   { display: "flex", background: "transparent", border: `1.5px solid rgba(255,255,255,0.3)`, color: C.white, borderRadius: 8, padding: "8px 12px", fontSize: "1.1rem", cursor: "pointer" },
  mobileMenu:  { background: C.greenDark, borderBottom: `3px solid ${C.yellow}`, display: "flex", flexDirection: "column", padding: "8px 16px 16px" },
  mobileMenuItem: { background: "transparent", border: "none", borderBottom: `1px solid rgba(255,255,255,0.1)`, color: C.white, padding: "14px 8px", fontSize: "0.95rem", cursor: "pointer", textAlign: "left", fontWeight: 600 },
  mobileMenuItemActive: { color: C.yellow },
  accentBar:   { height: 4, background: `linear-gradient(90deg, ${C.yellow}, ${C.yellowDark}, ${C.green})` },
  main:        { padding: "24px 16px", maxWidth: 1200, margin: "0 auto" },
  statsRow:    { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 28 },
  sectionLabel: { fontSize: "0.68rem", fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 },
  controls:    { display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" },
  searchInput: { flex: 1, minWidth: 180, background: C.white, border: `1.5px solid ${C.yellowDark}`, borderRadius: 8, padding: "10px 14px", color: C.greenDark, fontSize: "0.88rem", outline: "none" },
  filterGroup: { display: "flex", gap: 6, flexWrap: "wrap" },
  filterBtn:   { background: C.white, border: `1.5px solid ${C.green}`, color: C.green, borderRadius: 8, padding: "9px 16px", fontSize: "0.82rem", cursor: "pointer", fontWeight: 600 },
  filterBtnActive: { background: C.green, border: `1.5px solid ${C.green}`, color: C.white },
  tableWrapper: { background: C.white, border: `1.5px solid ${C.milkDark}`, borderRadius: 14, overflowX: "auto", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", WebkitOverflowScrolling: "touch" },
  table:       { width: "100%", borderCollapse: "collapse", minWidth: 500 },
  thead:       { background: C.greenDark },
  th:          { padding: "12px 14px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: C.yellow, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" },
  tr:          { borderBottom: `1px solid ${C.milkDark}` },
  td:          { padding: "11px 14px", fontSize: "0.85rem", verticalAlign: "middle" },
  rowNum:      { color: "#bbb", fontSize: "0.78rem" },
  slotId:      { fontFamily: "monospace", color: C.green, fontWeight: 700, fontSize: "0.82rem" },
  schoolTag:   { background: C.milk, border: `1px solid ${C.milkDark}`, color: C.green, padding: "2px 8px", borderRadius: 6, fontSize: "0.78rem", fontWeight: 600 },
  badge:       { fontSize: "0.72rem", fontWeight: 700, padding: "4px 10px", borderRadius: 999, display: "inline-block", whiteSpace: "nowrap" },
  linkText:    { fontFamily: "monospace", color: C.yellowDark, fontSize: "0.78rem", fontWeight: 600 },
  copyBtn:     { background: C.milk, border: `1.5px solid ${C.green}`, color: C.green, borderRadius: 6, padding: "5px 12px", fontSize: "0.78rem", cursor: "pointer", fontWeight: 700 },
  copyBtnDone: { background: C.green, border: `1.5px solid ${C.green}`, color: C.white },
  emptyRow:    { padding: 40, textAlign: "center", color: "#bbb" },
  schoolGrid:  { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 },
  schoolCard:  { background: C.white, border: `1.5px solid ${C.milkDark}`, borderRadius: 14, padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  schoolCardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  schoolAbbr:  { fontSize: "1.2rem", fontWeight: 900, color: C.greenDark },
  schoolName:  { fontSize: "0.75rem", color: "#888", marginTop: 2 },
  schoolTotal: { fontSize: "2rem", fontWeight: 900, color: C.green },
  progressBg:  { height: 8, background: C.milk, borderRadius: 999, overflow: "hidden", marginBottom: 10 },
  progressFill: { height: "100%", background: C.green, borderRadius: 999, transition: "width 0.4s ease" },
  schoolFooter: { display: "flex", justifyContent: "space-between", fontSize: "0.75rem", flexWrap: "wrap", gap: 4 },
  infoBox:     { background: C.white, border: `1.5px solid ${C.yellowDark}`, borderRadius: 10, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start", fontSize: "0.88rem", color: C.greenDark, lineHeight: 1.6 },
  infoIcon:    { fontSize: "1.3rem", flexShrink: 0 },
  footerNote:  { marginTop: 28, color: "#aaa", fontSize: "0.76rem", textAlign: "center" },
  code:        { background: C.milk, border: `1px solid ${C.yellowDark}`, padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", color: C.green, fontSize: "0.76rem" },
  // Manage tab
  actionBtn:   { padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem" },
  editCard:    { background: C.white, border: `2px solid ${C.green}`, borderRadius: 14, padding: "20px 24px", marginBottom: 20, boxShadow: "0 4px 16px rgba(18,130,124,0.12)" },
  formRow:     { marginBottom: 12 },
  formLabel:   { display: "block", fontSize: "0.72rem", fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 },
  formInput:   { width: "100%", maxWidth: 400, background: C.milk, border: `1.5px solid ${C.yellowDark}`, borderRadius: 8, padding: "9px 14px", color: C.greenDark, fontSize: "0.88rem", outline: "none" },
  codePanel:   { background: C.greenDark, border: `2px solid ${C.yellow}`, borderRadius: 14, padding: "20px", marginBottom: 20 },
  codeBlock:   { fontFamily: "monospace", fontSize: "0.75rem", color: "#a8f0ec", overflowX: "auto", whiteSpace: "pre", maxHeight: 320, overflowY: "auto", lineHeight: 1.6 },
};
