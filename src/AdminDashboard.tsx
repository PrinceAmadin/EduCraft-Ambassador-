// src/AdminDashboard.tsx
// Full EduCraft admin panel.
// - All tabs share one liveData state (localStorage-backed).
// - Tracking tab: pending approvals, live leaderboard, log-order with commission calc.
// - Conv% = orders ÷ clicks × 100 (only meaningful when clicks > 0).
// - Manage tab: add/edit slots, GitHub deploy.

import { useState, useMemo, useEffect, useCallback } from "react";
import seedAmbassadors from "./ambassadors";
import type { AmbassadorData, AmbassadorSlot } from "./ambassadors";
import logoImage from "../public/logo.png";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const C = {
  yellow:    "#fbdb21",  yellowDark: "#E0B846",
  green:     "#12827c",  greenDark:  "#0D5753",
  white:     "#ffffff",  milk:       "#FFF9ED",  milkDark: "#F0EBD8",
  red:       "#ef4444",  redLight:   "#fef2f2",
};

// ── Types ─────────────────────────────────────────────────────────────────────
type TabId    = "ambassadors" | "schools" | "core" | "sub" | "tracking" | "manage";
type Filter   = "all" | "active" | "vacant";
type Deploy   = "idle" | "busy" | "ok" | "fail";

interface Stat     { clicks: number; orders: number; email: string|null; registeredName: string|null; }
interface TRow     { id: string; name: string; school: string; kind: "general"|"core"|"sub"; stat: Stat; }
interface Pending  { slotId: string; name: string; school: string; email: string; registeredAt: string; }

const SCHOOL: Record<string,string> = {
  EUI:"Edo State University",UNIBEN:"University of Benin",DELSU:"Delta State University",
  AAU:"Ambrose Alli University",ECU:"Edwin Clark University",SDU:"Univ. of Southern Denmark",
  UNILAG:"University of Lagos",PG:"Postgraduate",Admin:"Administration",
};

// ── LocalStorage ──────────────────────────────────────────────────────────────
const LS_D="ec_data_v5",LS_G="ec_gh",LS_S="ec_secret";
const lsGet=(k:string)=>{try{const r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch{return null;}};
const lsSet=(k:string,v:unknown)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{/**/}};

// ── Code generators (for GitHub deploy) ──────────────────────────────────────
function genAmbTS(d:AmbassadorData):string{
  const sl=Object.entries(d.slots).map(([id,s])=>`    "${id}": { name: ${JSON.stringify(s.name).padEnd(22)}, school: ${JSON.stringify(s.school).padEnd(14)}, status: "${s.status}" },`).join("\n");
  const cl=d.coreAmbassadors.map(c=>`    { id:"${c.id}", name:"${c.name}", school:"${c.school}", percentage:${c.percentage} },`).join("\n");
  const sb=d.subAmbassadors.map(s=>`    { id:"${s.id}", name:"${s.name}", school:"${s.school}", percentage:${s.percentage}, coreId:"${s.coreId}" },`).join("\n");
  return `// src/ambassadors.ts\nexport interface AmbassadorSlot{name:string;school:string;status:"active"|"vacant";}\nexport interface CoreAmbassador{id:string;name:string;school:string;percentage:number;}\nexport interface SubAmbassador{id:string;name:string;school:string;percentage:number;coreId:string;}\nexport interface AmbassadorData{educraft_whatsapp:string;slots:Record<string,AmbassadorSlot>;coreAmbassadors:CoreAmbassador[];subAmbassadors:SubAmbassador[];}\nconst ambassadors:AmbassadorData={\n  educraft_whatsapp:"${d.educraft_whatsapp}",\n  slots:{\n${sl}\n  },\n  coreAmbassadors:[\n${cl}\n  ],\n  subAmbassadors:[\n${sb}\n  ],\n};\nexport default ambassadors;\n`;
}

async function deploy(owner:string,repo:string,token:string,data:AmbassadorData,log:(m:string)=>void):Promise<void>{
  const h={"Authorization":`token ${token}`,"Accept":"application/vnd.github.v3+json","Content-Type":"application/json"};
  const base=`https://api.github.com/repos/${owner}/${repo}/contents`;
  const b64=(s:string)=>btoa(unescape(encodeURIComponent(s)));
  const sha=async(p:string)=>{const r=await fetch(`${base}/${p}`,{headers:h});if(!r.ok)throw new Error(`Cannot find ${p} in repo`);return(await r.json()).sha as string;};
  const put=async(p:string,c:string,s:string)=>{const r=await fetch(`${base}/${p}`,{method:"PUT",headers:h,body:JSON.stringify({message:"🤖 EduCraft Admin deploy",content:b64(c),sha:s})});if(!r.ok){const e=await r.json();throw new Error(e.message||`Failed ${p}`);}};
  log("📡 Connecting to GitHub…");
  const aS=await sha("src/ambassadors.ts");
  log("📝 Updating ambassadors.ts…");
  await put("src/ambassadors.ts",genAmbTS(data),aS);
  log("✅ Done! Vercel is rebuilding (~30s)…");
}

function nextId(slots:Record<string,AmbassadorSlot>):string{
  const ns=Object.keys(slots).map(k=>parseInt(k,10)).filter(n=>!isNaN(n));
  return String((ns.length?Math.max(...ns):0)+1).padStart(3,"0");
}

function naira(n:number):string{
  return"₦"+n.toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});
}

// ══════════════════════════════════════════════════════════════════════════════
export default function AdminDashboard(){
  // ── Shared state ────────────────────────────────────────────────────────────
  const[data,setDataRaw]=useState<AmbassadorData>(()=>lsGet(LS_D)??{...seedAmbassadors});
  const setData=useCallback((d:AmbassadorData)=>{setDataRaw(d);lsSet(LS_D,d);},[]);

  // ── UI ───────────────────────────────────────────────────────────────────────
  const[tab,setTab]=useState<TabId>("ambassadors");
  const[filter,setFilter]=useState<Filter>("all");
  const[search,setSearch]=useState("");
  const[copied,setCopied]=useState<string|null>(null);
  const[menu,setMenu]=useState(false);
  const[mob,setMob]=useState(window.innerWidth<=640);
  useEffect(()=>{const h=()=>setMob(window.innerWidth<=640);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);

  // ── Manage ───────────────────────────────────────────────────────────────────
  const[editId,setEditId]=useState<string|null>(null);
  const[editName,setEditName]=useState("");const[editSchool,setEditSchool]=useState("");const[editSt,setEditSt]=useState<"active"|"vacant">("active");
  const[mSearch,setMSearch]=useState("");
  const[addOpen,setAddOpen]=useState(false);
  const[newId,setNewId]=useState("");const[newName,setNewName]=useState("");const[newSchool,setNewSchool]=useState("");const[newSt,setNewSt]=useState<"active"|"vacant">("active");const[addErr,setAddErr]=useState("");
  const[gh,setGhRaw]=useState<{owner:string;repo:string;token:string}>(()=>lsGet(LS_G)??{owner:"",repo:"",token:""});
  const setGh=(v:typeof gh)=>{setGhRaw(v);lsSet(LS_G,v);};
  const[dep,setDep]=useState<Deploy>("idle");const[depMsg,setDepMsg]=useState("");const[ghOpen,setGhOpen]=useState(false);

  // ── Tracking ─────────────────────────────────────────────────────────────────
  const[stats,setStats]=useState<Record<string,Stat>>({});
  const[sLoad,setSLoad]=useState(false);const[sErr,setSErr]=useState("");
  const[secret,setSecretRaw]=useState<string>(()=>lsGet(LS_S)??"");
  const setSecret=(v:string)=>{setSecretRaw(v);lsSet(LS_S,v);};
  const[settOpen,setSettOpen]=useState(false);
  const[tSearch,setTSearch]=useState("");

  // Pending
  const[pending,setPending]=useState<Pending[]>([]);
  const[pLoad,setPLoad]=useState(false);
  const[rejId,setRejId]=useState<string|null>(null);const[rejReason,setRejReason]=useState("");
  const[appMsg,setAppMsg]=useState("");

  // Log order
  const[logId,setLogId]=useState<string|null>(null);const[logName,setLogName]=useState("");
  const[logDesc,setLogDesc]=useState("");const[logAmt,setLogAmt]=useState("");const[logPct,setLogPct]=useState("10");
  const[logSt,setLogSt]=useState<"idle"|"busy"|"ok"|"fail">("idle");const[logMsg,setLogMsg]=useState("");

  // Auto-fetch when Tracking tab opens
  useEffect(()=>{if(tab==="tracking"){loadStats();loadPending();}},[tab]); // eslint-disable-line

  const base=window.location.origin;

  // ── Computed ─────────────────────────────────────────────────────────────────
  const totalActive=Object.values(data.slots).filter(s=>s.status==="active").length;
  const totalVacant=Object.values(data.slots).filter(s=>s.status==="vacant").length;
  const total=Object.keys(data.slots).length;

  const filteredSlots=useMemo(()=>
    Object.entries(data.slots).filter(([id,sl])=>{
      const ok=filter==="all"||sl.status===filter;
      const q=search.toLowerCase();
      return ok&&(!q||id.includes(q)||sl.name.toLowerCase().includes(q)||sl.school.toLowerCase().includes(q));
    }).map(([id,slot])=>({id,slot})),
  [data.slots,filter,search]);

  const schoolStats=useMemo(()=>{
    const m:Record<string,{active:number;vacant:number}>={};
    Object.values(data.slots).forEach(sl=>{const k=sl.school||"—";if(!m[k])m[k]={active:0,vacant:0};sl.status==="active"?m[k].active++:m[k].vacant++;});
    return Object.entries(m).sort((a,b)=>(b[1].active+b[1].vacant)-(a[1].active+a[1].vacant));
  },[data.slots]);

  const mRows=useMemo(()=>Object.entries(data.slots).filter(([id,sl])=>{const q=mSearch.toLowerCase();return!q||id.includes(q)||sl.name.toLowerCase().includes(q)||sl.school.toLowerCase().includes(q);}),[data.slots,mSearch]);

  const tRows:TRow[]=useMemo(()=>{
    const blank=():Stat=>({clicks:0,orders:0,email:null,registeredName:null});
    const rows:TRow[]=[];
    Object.entries(data.slots).filter(([,s])=>s.status==="active"&&s.name).forEach(([id,s])=>rows.push({id,name:s.name,school:s.school,kind:"general",stat:stats[id]??blank()}));
    data.coreAmbassadors.forEach(c=>rows.push({id:c.id,name:c.name,school:c.school,kind:"core",stat:stats[c.id]??blank()}));
    data.subAmbassadors.forEach(s=>rows.push({id:s.id,name:s.name,school:s.school,kind:"sub",stat:stats[s.id]??blank()}));
    const q=tSearch.toLowerCase();
    return(q?rows.filter(r=>r.id.toLowerCase().includes(q)||r.name.toLowerCase().includes(q)):rows)
      .sort((a,b)=>(b.stat.clicks*1+b.stat.orders*5)-(a.stat.clicks*1+a.stat.orders*5));
  },[data,stats,tSearch]);

  const totClicks=tRows.reduce((n,r)=>n+r.stat.clicks,0);
  const totOrders=tRows.reduce((n,r)=>n+r.stat.orders,0);
  const totReg   =tRows.filter(r=>r.stat.email!==null).length;

  // Commission preview
  const amtNum =parseFloat(logAmt.replace(/,/g,""))||0;
  const pctNum =parseFloat(logPct)||10;
  const commission=amtNum>0?amtNum*(pctNum/100):0;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const copy=(text:string,key:string)=>{navigator.clipboard.writeText(text);setCopied(key);setTimeout(()=>setCopied(null),2000);};

  const loadStats=async()=>{
    setSLoad(true);setSErr("");
    try{
      const qs=secret?`?secret=${encodeURIComponent(secret)}`:"";
      const r=await fetch(`/api/stats${qs}`);
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed to load stats.");
      setStats(d);
    }catch(e){setSErr((e as Error).message);}
    finally{setSLoad(false);}
  };

  const loadPending=async()=>{
    setPLoad(true);
    try{
      const qs=secret?`?secret=${encodeURIComponent(secret)}`:"";
      const r=await fetch(`/api/pending${qs}`);
      if(r.ok)setPending(await r.json());
    }catch{/**/}
    finally{setPLoad(false);}
  };

  const approve=async(slotId:string)=>{
    setAppMsg("");
    try{
      const r=await fetch("/api/approve",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slotId,action:"approve",adminSecret:secret,baseUrl:base})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed");
      setPending(p=>p.filter(x=>x.slotId!==slotId));
      setStats(p=>({...p,[slotId]:{...(p[slotId]??{clicks:0,orders:0}),email:d.email||null,registeredName:d.name||null}}));
      setAppMsg(d.emailSent?`✅ ${slotId} approved — welcome email sent to ${d.email}.`:`✅ ${slotId} approved. (Add GMAIL_APP_PASSWORD in Vercel to send welcome emails.)`);
    }catch(e){setAppMsg(`❌ ${(e as Error).message}`);}
  };

  const reject=async(slotId:string)=>{
    setAppMsg("");
    try{
      const r=await fetch("/api/approve",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slotId,action:"reject",adminSecret:secret,reason:rejReason})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed");
      setPending(p=>p.filter(x=>x.slotId!==slotId));
      setRejId(null);setRejReason("");
      setAppMsg(`Slot ${slotId} rejected.${d.emailSent?" Rejection email sent.":""}`);
    }catch(e){setAppMsg(`❌ ${(e as Error).message}`);}
  };

  const openLog=(id:string,name:string)=>{setLogId(id);setLogName(name);setLogDesc("");setLogAmt("");setLogPct("10");setLogSt("idle");setLogMsg("");};

  const logOrder=async()=>{
    if(!logId)return;
    setLogSt("busy");
    try{
      const r=await fetch("/api/track-order",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slotId:logId,jobDesc:logDesc,jobAmount:logAmt,commissionPercent:logPct,adminSecret:secret})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed");
      setLogSt("ok");
      // Clear, precise message based on emailReason from server
      const msgs:Record<string,string>={
        sent:           `✅ Order logged! Commission email sent to ${d.emailTo}`,
        no_profile:     "✅ Order logged. This ambassador is not yet approved — no email sent.",
        no_email:       "✅ Order logged. Ambassador profile has no email address.",
        no_gmail_password: "✅ Order logged. Add GMAIL_APP_PASSWORD to Vercel to enable emails.",
        send_failed:    "✅ Order logged. Email failed to send — check GMAIL_APP_PASSWORD in Vercel.",
      };
      setLogMsg(msgs[d.emailReason]??`✅ Order logged.`);
      setStats(p=>({...p,[logId]:{...(p[logId]??{clicks:0,email:null,registeredName:null}),orders:(p[logId]?.orders??0)+1}}));
      setTimeout(()=>{setLogId(null);setLogSt("idle");setLogMsg("");},5000);
    }catch(e){setLogSt("fail");setLogMsg(`❌ ${(e as Error).message}`);}
  };

  const startEdit=(id:string)=>{const sl=data.slots[id];setEditId(id);setEditName(sl.name);setEditSchool(sl.school);setEditSt(sl.status);};
  const saveEdit=()=>{if(!editId)return;setData({...data,slots:{...data.slots,[editId]:{name:editName,school:editSchool,status:editSt}}});setEditId(null);};
  const saveNew=()=>{const id=newId.trim().padStart(3,"0");if(!id){setAddErr("Slot ID required.");return;}if(!newName.trim()){setAddErr("Name required.");return;}if(data.slots[id]){setAddErr(`Slot ${id} already exists.`);return;}setData({...data,slots:{...data.slots,[id]:{name:newName.trim(),school:newSchool.trim(),status:newSt}}});setAddOpen(false);setAddErr("");};
  const doDeploy=async()=>{if(!gh.owner||!gh.repo||!gh.token){setGhOpen(true);setDepMsg("⚠️ Fill in GitHub settings first.");return;}setDep("busy");setDepMsg("Starting…");try{await deploy(gh.owner,gh.repo,gh.token,data,setDepMsg);setDep("ok");}catch(e){setDep("fail");setDepMsg(`❌ ${(e as Error).message}`);}};

  // Nav tabs
  const navTabs:{key:TabId;label:string;icon:string}[]=[
    {key:"ambassadors",label:"Ambassadors",icon:"👥"},
    {key:"schools",    label:"Schools",    icon:"🏫"},
    {key:"core",       label:"Core (ECCA)",icon:"⭐"},
    {key:"sub",        label:"Sub (ECSA)", icon:"🔗"},
    {key:"tracking",   label:pending.length>0?`Tracking (${pending.length})`:"Tracking",icon:"📊"},
    {key:"manage",     label:"Manage",     icon:"⚙️"},
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  return(
    <div style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.logo}>
          <img src={logoImage} alt="EduCraft" style={s.logoImg}/>
          <div><div style={s.logoTitle}>EduCraft</div><div style={s.logoSub}>Ambassador Panel</div></div>
        </div>
        <nav style={{...s.desktopNav,display:mob?"none":"flex"}}>
          {navTabs.map(t=>(
            <button key={t.key}
              style={{...s.navBtn,...(tab===t.key?s.navBtnActive:{}),...(t.key==="tracking"&&pending.length>0&&tab!=="tracking"?{borderColor:C.yellow,color:C.yellow}:{})}}
              onClick={()=>setTab(t.key)}>{t.icon} {t.label}</button>
          ))}
        </nav>
        <button style={{...s.hamburger,display:mob?"flex":"none"}} onClick={()=>setMenu(o=>!o)}>{menu?"✕":"☰"}</button>
      </header>
      {menu&&(
        <div style={s.mobileMenu}>
          {navTabs.map(t=>(
            <button key={t.key} style={{...s.mobileItem,...(tab===t.key?s.mobileActive:{})}} onClick={()=>{setTab(t.key);setMenu(false);}}>
              {t.icon} {t.label}{t.key==="tracking"&&pending.length>0?` (${pending.length})`:""}
            </button>
          ))}
        </div>
      )}
      <div style={s.bar}/>

      <main style={s.main}>

        {/* ════ AMBASSADORS ════ */}
        {tab==="ambassadors"&&(<>
          <div style={s.statsRow}>
            <SC label="Total Slots" v={total}       clr={C.green}     bg={C.milk}/>
            <SC label="Active"      v={totalActive} clr={C.white}     bg={C.green}/>
            <SC label="Vacant"      v={totalVacant} clr={C.greenDark} bg={C.yellow}/>
            <SC label="Fill Rate"   v={`${Math.round((totalActive/total)*100)}%`} clr={C.white} bg={C.greenDark}/>
          </div>
          <div style={s.secLabel}>Ambassador Slots</div>
          <div style={s.controls}>
            <input style={s.search} placeholder="Search name, slot ID, school…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <div style={s.filterRow}>
              {(["all","active","vacant"] as Filter[]).map(f=><button key={f} style={{...s.fBtn,...(filter===f?s.fBtnA:{})}} onClick={()=>setFilter(f)}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>)}
            </div>
          </div>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr style={s.thead}>{["No.","Slot ID","Name","School","Status","Link","Copy"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filteredSlots.map(({id,slot},i)=>(
                  <tr key={id} style={{...s.tr,background:i%2===0?C.white:C.milk}}>
                    <td style={s.td}><span style={s.num}>{parseInt(id)}.</span></td>
                    <td style={s.td}><span style={s.slotId}>EduCraftA-{id}</span></td>
                    <td style={s.td}>{slot.status==="active"&&slot.name?<strong style={{color:C.greenDark}}>{slot.name}</strong>:<em style={{color:"#bbb"}}>— Unassigned —</em>}</td>
                    <td style={s.td}><span style={s.schoolTag}>{slot.school||"—"}</span></td>
                    <td style={s.td}><span style={{...s.badge,background:slot.status==="active"?C.green:C.yellowDark,color:slot.status==="active"?C.white:C.greenDark}}>{slot.status==="active"?"● Active":"○ Vacant"}</span></td>
                    <td style={s.td}><span style={s.link}>/EduCraftA/{id}</span></td>
                    <td style={s.td}><button style={{...s.cpBtn,...(copied===`a-${id}`?s.cpDone:{})}} onClick={()=>copy(`${base}/EduCraftA/${id}`,`a-${id}`)} disabled={slot.status==="vacant"}>{copied===`a-${id}`?"✓":"Copy"}</button></td>
                  </tr>
                ))}
                {filteredSlots.length===0&&<tr><td colSpan={7} style={s.empty}>No slots match your search.</td></tr>}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ════ SCHOOLS ════ */}
        {tab==="schools"&&(<>
          <div style={s.secLabel}>School Coverage</div>
          <div style={s.schoolGrid}>
            {schoolStats.map(([abbr,st])=>{const tot=st.active+st.vacant;const pct=Math.round((st.active/tot)*100);return(
              <div key={abbr} style={s.schoolCard}>
                <div style={s.schoolHead}><div><div style={s.schoolAbbr}>{abbr||"—"}</div><div style={s.schoolName}>{SCHOOL[abbr]||abbr}</div></div><div style={s.schoolTot}>{tot}</div></div>
                <div style={s.prog}><div style={{...s.progFill,width:`${pct}%`}}/></div>
                <div style={s.schoolFoot}><span style={{color:C.green,fontWeight:700}}>● {st.active} Active</span><span style={{color:C.yellowDark,fontWeight:600}}>○ {st.vacant} Vacant</span><span style={{color:"#aaa"}}>{pct}% filled</span></div>
              </div>
            );})}
          </div>
        </>)}

        {/* ════ CORE ════ */}
        {tab==="core"&&(<>
          <div style={s.secLabel}>Core Ambassadors (ECCA) — Senior Partners</div>
          <div style={s.info}><span style={s.infoIcon}>⭐</span><p>Core Ambassadors earn base % + <strong>3%</strong> per Sub job. Share Recruit Link with potential Sub-Ambassadors.</p></div>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr style={s.thead}>{["No.","ID","Name","School","Base %","Subs","Total %","Recruit Link",""].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{data.coreAmbassadors.map((a,i)=>{const subs=data.subAmbassadors.filter(sb=>sb.coreId===a.id).length;const tot=a.percentage+subs*3;const ck=`ec-${a.id}`;return(
                <tr key={a.id} style={{...s.tr,background:i%2===0?C.white:C.milk}}>
                  <td style={s.td}><span style={s.num}>{i+1}.</span></td><td style={s.td}><span style={s.slotId}>{a.id}</span></td>
                  <td style={s.td}><strong style={{color:C.greenDark}}>{a.name}</strong></td><td style={s.td}><span style={s.schoolTag}>{a.school}</span></td>
                  <td style={s.td}><span style={{...s.badge,background:C.green,color:C.white}}>{a.percentage}%</span></td>
                  <td style={s.td}><span style={{color:subs>0?C.green:"#bbb",fontWeight:subs>0?700:400}}>{subs>0?subs:"—"}</span></td>
                  <td style={s.td}><span style={{...s.badge,background:C.yellow,color:C.greenDark,fontWeight:800}}>{tot}%</span></td>
                  <td style={s.td}><span style={s.link}>/ECCA/{a.id}</span></td>
                  <td style={s.td}><button style={{...s.cpBtn,...(copied===ck?s.cpDone:{})}} onClick={()=>copy(`${base}/ECCA/${a.id}`,ck)}>{copied===ck?"✓":"Copy"}</button></td>
                </tr>
              );})}</tbody>
            </table>
          </div>
        </>)}

        {/* ════ SUB ════ */}
        {tab==="sub"&&(<>
          <div style={s.secLabel}>Sub-Ambassadors (ECSA)</div>
          <div style={s.info}><span style={s.infoIcon}>🔗</span><p>Sub-Ambassadors earn <strong>7%</strong> per job. Their Core earns <strong>3%</strong> per Sub job.</p></div>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr style={s.thead}>{["No.","ID","Name","School","%","Under (Core)","Client Link",""].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{data.subAmbassadors.map((a,i)=>{const core=data.coreAmbassadors.find(c=>c.id===a.coreId);const ck=`es-${a.id}`;return(
                <tr key={a.id} style={{...s.tr,background:i%2===0?C.white:C.milk}}>
                  <td style={s.td}><span style={s.num}>{i+1}.</span></td><td style={s.td}><span style={s.slotId}>{a.id}</span></td>
                  <td style={s.td}><strong style={{color:C.greenDark}}>{a.name}</strong></td><td style={s.td}><span style={s.schoolTag}>{a.school}</span></td>
                  <td style={s.td}><span style={{...s.badge,background:C.yellowDark,color:C.greenDark}}>{a.percentage}%</span></td>
                  <td style={s.td}>{core?<span style={{color:C.green,fontWeight:600}}>⭐ {core.name}</span>:<span style={{color:"#bbb"}}>—</span>}</td>
                  <td style={s.td}><span style={s.link}>/ECSA/{a.id}</span></td>
                  <td style={s.td}><button style={{...s.cpBtn,...(copied===ck?s.cpDone:{})}} onClick={()=>copy(`${base}/ECSA/${a.id}`,ck)}>{copied===ck?"✓":"Copy"}</button></td>
                </tr>
              );})}</tbody>
            </table>
          </div>
        </>)}

        {/* ════ TRACKING ════ */}
        {tab==="tracking"&&(<>
          <div style={s.secLabel}>📊 Referral Tracking — Live Leaderboard</div>

          {/* Pending approvals */}
          {pending.length>0&&(
            <div style={{background:C.white,border:`2px solid ${C.yellow}`,borderRadius:12,marginBottom:20,overflow:"hidden"}}>
              <div style={{background:C.yellow,padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap" as const,gap:8}}>
                <span style={{fontWeight:800,color:C.greenDark}}>🔔 {pending.length} Registration{pending.length>1?"s":""} Awaiting Approval</span>
                <span style={{fontSize:"0.78rem",color:C.greenDark,opacity:0.75}}>Verify each applicant before approving</span>
              </div>
              <div style={{overflowX:"auto" as const}}>
                <table style={{...s.table,minWidth:620}}>
                  <thead><tr style={{background:C.greenDark}}>{["Slot ID","Name","School","Email","Applied","Action"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {pending.map((p,i)=>(
                      <tr key={p.slotId} style={{...s.tr,background:i%2===0?C.white:C.milk}}>
                        <td style={s.td}><span style={s.slotId}>{p.slotId}</span></td>
                        <td style={s.td}><strong style={{color:C.greenDark}}>{p.name}</strong></td>
                        <td style={s.td}><span style={s.schoolTag}>{p.school||"—"}</span></td>
                        <td style={s.td}><span style={{color:C.green,fontSize:"0.82rem"}}>{p.email}</span></td>
                        <td style={s.td}><span style={{color:"#aaa",fontSize:"0.78rem"}}>{new Date(p.registeredAt).toLocaleDateString()}</span></td>
                        <td style={s.td}>
                          {rejId===p.slotId?(
                            <div style={{display:"flex",gap:6,flexWrap:"wrap" as const,alignItems:"center"}}>
                              <input style={{...s.fInp,width:130,padding:"5px 8px",fontSize:"0.78rem"}} placeholder="Reason (optional)" value={rejReason} onChange={e=>setRejReason(e.target.value)}/>
                              <button style={{...s.actBtn,background:C.red,color:C.white,padding:"5px 12px",fontSize:"0.78rem"}} onClick={()=>reject(p.slotId)}>Confirm Reject</button>
                              <button style={{...s.cpBtn}} onClick={()=>setRejId(null)}>Cancel</button>
                            </div>
                          ):(
                            <div style={{display:"flex",gap:6}}>
                              <button style={{...s.actBtn,background:C.green,color:C.white,padding:"6px 14px",fontSize:"0.78rem"}} onClick={()=>approve(p.slotId)}>✓ Approve</button>
                              <button style={{...s.actBtn,background:C.red,color:C.white,padding:"6px 14px",fontSize:"0.78rem"}} onClick={()=>{setRejId(p.slotId);setRejReason("");}}>✗ Reject</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {appMsg&&<div style={{...s.banner,borderColor:appMsg.startsWith("❌")?C.red:C.green,background:appMsg.startsWith("❌")?C.redLight:C.white,color:appMsg.startsWith("❌")?C.red:C.greenDark,marginBottom:16}}>{appMsg}</div>}

          {/* Stat cards */}
          <div style={s.statsRow}>
            <SC label="Total Clicks"      v={totClicks} clr={C.white}     bg={C.green}/>
            <SC label="Orders Logged"     v={totOrders} clr={C.greenDark} bg={C.yellow}/>
            <SC label="Ambassadors Reg."  v={totReg}    clr={C.white}     bg={C.greenDark}/>
          </div>

          {/* Registration link banner */}
          <div style={{...s.info,marginBottom:16}}>
            <span style={s.infoIcon}>🔗</span>
            <div style={{flex:1}}>
              <p style={{fontWeight:700,marginBottom:4}}>Ambassador Registration Link</p>
              <p style={{fontSize:"0.82rem"}}>Share this so ambassadors can submit for verification and approval.</p>
              <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center",flexWrap:"wrap" as const}}>
                <span style={{...s.link,fontSize:"0.85rem"}}>{base}/register</span>
                <button style={{...s.cpBtn,...(copied==="rl"?s.cpDone:{})}} onClick={()=>copy(`${base}/register`,"rl")}>{copied==="rl"?"✓ Copied":"Copy Link"}</button>
              </div>
            </div>
          </div>

          {/* Log order panel */}
          {logId&&(
            <div style={s.editCard}>
              <div style={{fontWeight:800,color:C.greenDark,marginBottom:14,fontSize:"1rem"}}>
                📝 Log Order — <span style={{color:C.green}}>{logName}</span>
                <span style={{marginLeft:8,fontSize:"0.74rem",color:"#aaa",fontWeight:400}}>({logId})</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:14}}>
                <div>
                  <label style={s.fLabel}>Job Amount ₦ (optional)</label>
                  <input style={s.fInp} placeholder="e.g. 5000" value={logAmt} onChange={e=>setLogAmt(e.target.value)}/>
                </div>
                <div>
                  <label style={s.fLabel}>Commission %</label>
                  <input style={s.fInp} type="number" min="1" max="100" value={logPct} onChange={e=>setLogPct(e.target.value)}/>
                </div>
              </div>
              {amtNum>0&&(
                <div style={{background:C.milk,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:"0.88rem",color:C.greenDark,fontWeight:600}}>
                  💰 Commission: <strong style={{color:C.green}}>{naira(commission)}</strong>
                  <span style={{color:"#aaa",marginLeft:6,fontWeight:400}}>({pctNum}% of {naira(amtNum)})</span>
                </div>
              )}
              <label style={s.fLabel}>Job Description (optional)</label>
              <input style={{...s.fInp,marginBottom:14}} placeholder="e.g. Final year project, Seminar paper…" value={logDesc} onChange={e=>setLogDesc(e.target.value)}/>
              {logMsg&&<div style={{...s.banner,marginBottom:14,borderColor:logSt==="fail"?C.red:C.green,background:logSt==="fail"?C.redLight:C.white,color:logSt==="fail"?C.red:C.greenDark}}>{logMsg}</div>}
              <div style={{display:"flex",gap:8}}>
                <button style={{...s.actBtn,background:logSt==="ok"?C.green:C.greenDark,color:C.yellow,opacity:logSt==="busy"?0.7:1}} onClick={logOrder} disabled={logSt==="busy"||logSt==="ok"}>
                  {logSt==="busy"?"Logging…":logSt==="ok"?"✓ Logged!":"Confirm Order"}
                </button>
                <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>setLogId(null)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Tracking settings */}
          <div style={{...s.settBox,marginBottom:16}}>
            <button style={s.settToggle} onClick={()=>setSettOpen(o=>!o)}>🔐 Tracking Settings {settOpen?"▲":"▼"}</button>
            {settOpen&&(
              <div style={{padding:"20px 18px"}}>
                <div style={{marginBottom:12}}>
                  <label style={s.fLabel}>Admin Secret</label>
                  <input style={s.fInp} type="password" placeholder="Must match ADMIN_SECRET in Vercel" value={secret} onChange={e=>setSecret(e.target.value)}/>
                </div>
                <div style={{background:C.milk,borderRadius:8,padding:"12px 14px",fontSize:"0.8rem",color:C.greenDark,lineHeight:2,marginBottom:12}}>
                  <strong>Required Vercel env vars:</strong><br/>
                  <code>REDIS_URL</code> — from Vercel → Storage → your Redis DB → .env.local tab<br/>
                  <code>ADMIN_SECRET</code> — any password you choose<br/>
                  <code>GMAIL_APP_PASSWORD</code> — 16-char Google App Password<br/>
                  <br/>
                  <strong>How to get GMAIL_APP_PASSWORD:</strong><br/>
                  1. Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{color:C.green}}>myaccount.google.com/apppasswords</a><br/>
                  2. Enable 2-Step Verification first if not done<br/>
                  3. Click "Create" → name it "EduCraft" → copy the 16-char code<br/>
                  4. Add it as <code>GMAIL_APP_PASSWORD</code> in Vercel env vars
                </div>
                <button style={{...s.actBtn,background:C.green,color:C.white}} onClick={()=>{setSettOpen(false);loadStats();loadPending();}}>Save &amp; Refresh</button>
              </div>
            )}
          </div>

          {sLoad&&<div style={{...s.banner,borderColor:C.yellowDark,color:C.greenDark,marginBottom:16}}>⏳ Loading tracking data…</div>}
          {sErr&&!sLoad&&<div style={{...s.banner,borderColor:C.red,background:C.redLight,color:C.red,marginBottom:16}}>❌ {sErr} <button style={{marginLeft:12,background:"none",border:`1px solid ${C.red}`,color:C.red,borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:"0.8rem"}} onClick={loadStats}>Retry</button></div>}

          <div style={{...s.controls,marginBottom:14}}>
            <input style={s.search} placeholder="Search ambassadors…" value={tSearch} onChange={e=>setTSearch(e.target.value)}/>
            <button style={{...s.actBtn,background:C.greenDark,color:C.yellow}} onClick={()=>{loadStats();loadPending();}} disabled={sLoad}>↻ Refresh</button>
          </div>

          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  {["#","Ambassador","Type","Clicks","Orders","Conv %","Email Status","Log Order"].map(h=>(
                    <th key={h} style={{...s.th,...(h==="Conv %"?{}:{})}}>
                      {h==="Conv %"?(
                        <span title="Conversion % = Orders ÷ Clicks × 100. Only meaningful when Clicks > 0.">{h} ⓘ</span>
                      ):h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tRows.map((row,i)=>{
                  // Conv% is ONLY shown when clicks > 0. When clicks=0 we show "—" to avoid division-by-zero confusion.
                  const convPct = row.stat.clicks > 0
                    ? Math.round((row.stat.orders / row.stat.clicks) * 100)
                    : null;
                  const tColor=row.kind==="core"?C.yellow:row.kind==="sub"?"#e0f2fe":C.milk;
                  const tText =row.kind==="core"?C.greenDark:row.kind==="sub"?"#0369a1":C.green;
                  return(
                  <tr key={row.id} style={{...s.tr,background:i%2===0?C.white:C.milk}}>
                    <td style={s.td}><span style={s.num}>{i+1}.</span></td>
                    <td style={s.td}>
                      <strong style={{color:C.greenDark,display:"block"}}>{row.name}</strong>
                      <span style={{...s.slotId,fontSize:"0.74rem"}}>{row.id}</span>
                    </td>
                    <td style={s.td}><span style={{...s.badge,background:tColor,color:tText}}>{row.kind==="core"?"⭐ Core":row.kind==="sub"?"🔗 Sub":"General"}</span></td>
                    <td style={s.td}><span style={{fontWeight:800,color:row.stat.clicks>0?C.green:"#ccc",fontSize:"1rem"}}>{row.stat.clicks}</span></td>
                    <td style={s.td}><span style={{fontWeight:800,color:row.stat.orders>0?C.greenDark:"#ccc",fontSize:"1rem"}}>{row.stat.orders}</span></td>
                    <td style={s.td}>
                      {convPct===null
                        ? <span style={{color:"#ccc",fontSize:"0.82rem"}}>— (no clicks yet)</span>
                        : <span style={{...s.badge,background:convPct>=10?C.green:convPct>0?C.yellowDark:C.milk,color:convPct>=10?C.white:C.greenDark}}>{convPct}%</span>
                      }
                    </td>
                    <td style={s.td}>
                      {row.stat.email
                        ?<span style={{color:C.green,fontWeight:700,fontSize:"0.8rem"}}>✓ Registered</span>
                        :<span style={{color:"#ccc",fontSize:"0.8rem"}}>Not registered</span>}
                    </td>
                    <td style={s.td}><button style={{...s.cpBtn,background:C.greenDark,color:C.yellow,border:"none"}} onClick={()=>openLog(row.id,row.name)}>📝 Log</button></td>
                  </tr>
                );})}
                {tRows.length===0&&!sLoad&&<tr><td colSpan={8} style={s.empty}>No ambassadors found. Stats appear once links are clicked.</td></tr>}
              </tbody>
            </table>
          </div>
          <p style={s.footer}>{tRows.length} ambassadors · Conv% = Orders ÷ Clicks · Click ↻ for latest data</p>
        </>)}

        {/* ════ MANAGE ════ */}
        {tab==="manage"&&(<>
          <div style={s.secLabel}>⚙️ Manage Ambassador Slots</div>
          <div style={s.info}><span style={s.infoIcon}>💡</span><p style={{fontSize:"0.85rem",lineHeight:1.7}}>Edit or add slots below — changes apply instantly to all tabs. Click <strong>🚀 Deploy</strong> to push live (~30s).</p></div>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap" as const,alignItems:"center"}}>
            <input style={{...s.search,maxWidth:260}} placeholder="Search slots…" value={mSearch} onChange={e=>setMSearch(e.target.value)}/>
            <button style={{...s.actBtn,background:C.green,color:C.white}} onClick={()=>{setNewId(nextId(data.slots));setNewName("");setNewSchool("");setNewSt("active");setAddErr("");setAddOpen(true);}}>➕ Add Ambassador</button>
            <button style={{...s.actBtn,background:dep==="ok"?C.green:dep==="fail"?C.red:C.greenDark,color:C.yellow,marginLeft:"auto",opacity:dep==="busy"?0.7:1}} onClick={doDeploy} disabled={dep==="busy"}>
              {dep==="busy"?"⏳ Deploying…":dep==="ok"?"✅ Deployed!":dep==="fail"?"❌ Retry":"🚀 Deploy to GitHub"}
            </button>
          </div>
          {depMsg&&<div style={{...s.banner,borderColor:dep==="fail"?C.red:C.green,background:dep==="fail"?C.redLight:C.white,color:dep==="fail"?C.red:C.greenDark,marginBottom:16}}>{depMsg}</div>}

          {/* GitHub settings */}
          <div style={{...s.settBox,marginBottom:20}}>
            <button style={s.settToggle} onClick={()=>setGhOpen(o=>!o)}>🔑 GitHub Deploy Settings {ghOpen?"▲":"▼"}</button>
            {ghOpen&&(
              <div style={{padding:"20px 18px"}}>
                {([{l:"GitHub Username",k:"owner",p:"e.g. PrinceAmadin"},{l:"Repository Name",k:"repo",p:"e.g. EduCraft-Ambassador"},{l:"Personal Access Token",k:"token",p:"ghp_xxxx…"}] as const).map(f=>(
                  <div key={f.k} style={{marginBottom:12}}>
                    <label style={s.fLabel}>{f.l}</label>
                    <input style={s.fInp} type={f.k==="token"?"password":"text"} placeholder={f.p} value={gh[f.k]} onChange={e=>setGh({...gh,[f.k]:e.target.value})}/>
                  </div>
                ))}
                <button style={{...s.actBtn,background:C.green,color:C.white}} onClick={()=>{lsSet(LS_G,gh);setGhOpen(false);setDepMsg("✅ Saved!");}}>Save</button>
              </div>
            )}
          </div>

          {/* Add form */}
          {addOpen&&(
            <div style={s.editCard}>
              <div style={{fontWeight:800,color:C.greenDark,marginBottom:16}}>➕ Add New Ambassador</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
                {[{l:"Slot ID",v:newId,s:setNewId,p:"e.g. 067"},{l:"Full Name",v:newName,s:setNewName,p:"Name"},{l:"School",v:newSchool,s:setNewSchool,p:"EUI, UNIBEN…"}].map(f=>(
                  <div key={f.l}><label style={s.fLabel}>{f.l}</label><input style={s.fInp} value={f.v} onChange={e=>f.s(e.target.value)} placeholder={f.p}/></div>
                ))}
                <div><label style={s.fLabel}>Status</label><div style={{display:"flex",gap:8,marginTop:2}}>
                  {(["active","vacant"] as const).map(st=><button key={st} style={{...s.fBtn,...(newSt===st?{background:st==="active"?C.green:C.yellowDark,color:st==="active"?C.white:C.greenDark,border:"none"}:{})}} onClick={()=>setNewSt(st)}>{st==="active"?"● Active":"○ Vacant"}</button>)}
                </div></div>
              </div>
              {addErr&&<p style={{color:C.red,fontSize:"0.82rem",marginTop:10}}>⚠️ {addErr}</p>}
              <div style={{display:"flex",gap:8,marginTop:16}}>
                <button style={{...s.actBtn,background:C.green,color:C.white}} onClick={saveNew}>✓ Add</button>
                <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>{setAddOpen(false);setAddErr("");}}>Cancel</button>
              </div>
            </div>
          )}

          {/* Edit form */}
          {editId&&(
            <div style={s.editCard}>
              <div style={{fontWeight:800,color:C.greenDark,marginBottom:16}}>✏️ Editing <span style={{color:C.green}}>EduCraftA-{editId}</span></div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
                {[{l:"Name",v:editName,s:setEditName,p:"Name"},{l:"School",v:editSchool,s:setEditSchool,p:"EUI…"}].map(f=>(
                  <div key={f.l}><label style={s.fLabel}>{f.l}</label><input style={s.fInp} value={f.v} onChange={e=>f.s(e.target.value)} placeholder={f.p}/></div>
                ))}
                <div><label style={s.fLabel}>Status</label><div style={{display:"flex",gap:8,marginTop:2}}>
                  {(["active","vacant"] as const).map(st=><button key={st} style={{...s.fBtn,...(editSt===st?{background:st==="active"?C.green:C.yellowDark,color:st==="active"?C.white:C.greenDark,border:"none"}:{})}} onClick={()=>setEditSt(st)}>{st==="active"?"● Active":"○ Vacant"}</button>)}
                </div></div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:16}}>
                <button style={{...s.actBtn,background:C.green,color:C.white}} onClick={saveEdit}>✓ Save</button>
                <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>setEditId(null)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr style={s.thead}>{["Slot ID","Name","School","Status","Edit"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {mRows.map(([id,sl],i)=>(
                  <tr key={id} style={{...s.tr,background:i%2===0?C.white:C.milk,outline:editId===id?`2px solid ${C.green}`:"none"}}>
                    <td style={s.td}><span style={s.slotId}>EduCraftA-{id}</span></td>
                    <td style={s.td}>{sl.name?<strong style={{color:C.greenDark}}>{sl.name}</strong>:<em style={{color:"#bbb"}}>— Vacant —</em>}</td>
                    <td style={s.td}><span style={s.schoolTag}>{sl.school||"—"}</span></td>
                    <td style={s.td}><span style={{...s.badge,background:sl.status==="active"?C.green:C.yellowDark,color:sl.status==="active"?C.white:C.greenDark}}>{sl.status==="active"?"● Active":"○ Vacant"}</span></td>
                    <td style={s.td}><button style={{...s.cpBtn,...(editId===id?{background:C.yellow,color:C.greenDark}:{})}} onClick={()=>editId===id?setEditId(null):startEdit(id)}>{editId===id?"Editing…":"✏️ Edit"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{...s.footer,marginTop:12}}>{Object.keys(data.slots).length} slots · Edits are local · Deploy to push live</p>
        </>)}

        <p style={s.footer}>EduCraft Ambassador Panel · Powered by Vercel</p>
      </main>
    </div>
  );
}

function SC({label,v,clr,bg}:{label:string;v:number|string;clr:string;bg:string}){
  return<div style={{borderRadius:14,padding:"20px 22px",background:bg,border:`1.5px solid ${bg===C.milk?C.yellowDark:bg}`,boxShadow:"0 2px 8px rgba(0,0,0,.07)"}}>
    <div style={{fontSize:"2rem",fontWeight:900,color:clr,lineHeight:1}}>{v}</div>
    <div style={{fontSize:"0.7rem",color:clr,opacity:0.85,marginTop:6,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:"0.06em"}}>{label}</div>
  </div>;
}

const s:Record<string,React.CSSProperties>={
  page:{minHeight:"100vh",background:C.milk,color:C.greenDark,fontFamily:"'Segoe UI',system-ui,sans-serif"},
  header:{background:C.greenDark,padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"},
  logo:{display:"flex",alignItems:"center",gap:12},logoImg:{width:44,height:44,objectFit:"contain"},
  logoTitle:{fontSize:"1.1rem",fontWeight:800,color:C.yellow},logoSub:{fontSize:"0.68rem",color:C.white,opacity:0.75},
  desktopNav:{display:"flex",gap:4,flexWrap:"wrap"},
  navBtn:{background:"transparent",border:"1.5px solid rgba(255,255,255,.2)",color:C.white,borderRadius:8,padding:"7px 11px",fontSize:"0.79rem",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"},
  navBtnActive:{background:C.yellow,border:`1.5px solid ${C.yellow}`,color:C.greenDark},
  hamburger:{display:"flex",background:"transparent",border:"1.5px solid rgba(255,255,255,.3)",color:C.white,borderRadius:8,padding:"8px 12px",fontSize:"1.1rem",cursor:"pointer"},
  mobileMenu:{background:C.greenDark,borderBottom:`3px solid ${C.yellow}`,display:"flex",flexDirection:"column",padding:"8px 16px 16px"},
  mobileItem:{background:"transparent",border:"none",borderBottom:"1px solid rgba(255,255,255,.1)",color:C.white,padding:"14px 8px",fontSize:"0.95rem",cursor:"pointer",textAlign:"left",fontWeight:600},
  mobileActive:{color:C.yellow},
  bar:{height:4,background:`linear-gradient(90deg,${C.yellow},${C.yellowDark},${C.green})`},
  main:{padding:"24px 16px",maxWidth:1200,margin:"0 auto"},
  statsRow:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:28},
  secLabel:{fontSize:"0.68rem",fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12},
  controls:{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"},
  search:{flex:1,minWidth:180,background:C.white,border:`1.5px solid ${C.yellowDark}`,borderRadius:8,padding:"10px 14px",color:C.greenDark,fontSize:"0.88rem",outline:"none"},
  filterRow:{display:"flex",gap:6,flexWrap:"wrap"},
  fBtn:{background:C.white,border:`1.5px solid ${C.green}`,color:C.green,borderRadius:8,padding:"9px 16px",fontSize:"0.82rem",cursor:"pointer",fontWeight:600},
  fBtnA:{background:C.green,border:`1.5px solid ${C.green}`,color:C.white},
  tableWrap:{background:C.white,border:`1.5px solid ${C.milkDark}`,borderRadius:14,overflowX:"auto",boxShadow:"0 2px 12px rgba(0,0,0,.06)",WebkitOverflowScrolling:"touch"},
  table:{width:"100%",borderCollapse:"collapse",minWidth:500},
  thead:{background:C.greenDark},
  th:{padding:"12px 14px",textAlign:"left",fontSize:"0.67rem",fontWeight:700,color:C.yellow,textTransform:"uppercase",letterSpacing:"0.08em",whiteSpace:"nowrap"},
  tr:{borderBottom:`1px solid ${C.milkDark}`},
  td:{padding:"11px 14px",fontSize:"0.85rem",verticalAlign:"middle"},
  num:{color:"#bbb",fontSize:"0.78rem"},
  slotId:{fontFamily:"monospace",color:C.green,fontWeight:700,fontSize:"0.82rem"},
  schoolTag:{background:C.milk,border:`1px solid ${C.milkDark}`,color:C.green,padding:"2px 8px",borderRadius:6,fontSize:"0.78rem",fontWeight:600},
  badge:{fontSize:"0.72rem",fontWeight:700,padding:"4px 10px",borderRadius:999,display:"inline-block",whiteSpace:"nowrap"},
  link:{fontFamily:"monospace",color:C.yellowDark,fontSize:"0.78rem",fontWeight:600},
  cpBtn:{background:C.milk,border:`1.5px solid ${C.green}`,color:C.green,borderRadius:6,padding:"5px 12px",fontSize:"0.78rem",cursor:"pointer",fontWeight:700},
  cpDone:{background:C.green,border:`1.5px solid ${C.green}`,color:C.white},
  empty:{padding:40,textAlign:"center",color:"#bbb"},
  schoolGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16},
  schoolCard:{background:C.white,border:`1.5px solid ${C.milkDark}`,borderRadius:14,padding:"20px",boxShadow:"0 2px 8px rgba(0,0,0,.05)"},
  schoolHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14},
  schoolAbbr:{fontSize:"1.2rem",fontWeight:900,color:C.greenDark},schoolName:{fontSize:"0.75rem",color:"#888",marginTop:2},schoolTot:{fontSize:"2rem",fontWeight:900,color:C.green},
  prog:{height:8,background:C.milk,borderRadius:999,overflow:"hidden",marginBottom:10},
  progFill:{height:"100%",background:C.green,borderRadius:999},
  schoolFoot:{display:"flex",justifyContent:"space-between",fontSize:"0.75rem",flexWrap:"wrap",gap:4},
  info:{background:C.white,border:`1.5px solid ${C.yellowDark}`,borderRadius:10,padding:"14px 18px",marginBottom:20,display:"flex",gap:12,alignItems:"flex-start",fontSize:"0.88rem",color:C.greenDark,lineHeight:1.6},
  infoIcon:{fontSize:"1.3rem",flexShrink:0},
  footer:{marginTop:28,color:"#aaa",fontSize:"0.76rem",textAlign:"center"},
  actBtn:{padding:"10px 20px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:"0.85rem"},
  editCard:{background:C.white,border:`2px solid ${C.green}`,borderRadius:14,padding:"20px 24px",marginBottom:20,boxShadow:"0 4px 16px rgba(18,130,124,.12)"},
  fLabel:{display:"block",fontSize:"0.72rem",fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5},
  fInp:{width:"100%",background:C.milk,border:`1.5px solid ${C.yellowDark}`,borderRadius:8,padding:"9px 14px",color:C.greenDark,fontSize:"0.88rem",outline:"none"},
  settBox:{background:C.white,border:`1.5px solid ${C.milkDark}`,borderRadius:12,overflow:"hidden"},
  settToggle:{width:"100%",background:"none",border:"none",borderBottom:`1.5px solid ${C.milkDark}`,padding:"14px 18px",textAlign:"left",cursor:"pointer",fontWeight:700,color:C.greenDark,fontSize:"0.88rem"},
  banner:{border:"1.5px solid",borderRadius:8,padding:"12px 16px",fontSize:"0.85rem",fontWeight:600},
};
