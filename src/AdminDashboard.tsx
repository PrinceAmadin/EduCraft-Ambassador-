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
type TabId    = "ambassadors" | "schools" | "core" | "sub" | "tracking" | "manage" | "applications";
type Filter   = "all" | "active" | "vacant";
type Deploy   = "idle" | "busy" | "ok" | "fail";

interface Stat     { clicks: number; orders: number; email: string|null; registeredName: string|null; }
interface TRow     { id: string; name: string; school: string; kind: "general"|"core"|"sub"; stat: Stat; }
interface Pending  { slotId: string; name: string; school: string; email: string; registeredAt: string; }
interface SyncProfile { name: string; school: string; email?: string; }
interface SyncData { profiles: Record<string, SyncProfile>; payments: Record<string, Record<string,string>>; }

const SCHOOL: Record<string,string> = {
  EUI:"Edo State University",UNIBEN:"University of Benin",DELSU:"Delta State University",
  AAU:"Ambrose Alli University",ECU:"Edwin Clark University",SDU:"University of Southern Denmark",
  UNILAG:"University of Lagos",PG:"Postgraduate Students",Admin:"Administration",
  UNICAL:"University of Calabar",OAU:"Obafemi Awolowo University",UI:"University of Ibadan",
  UNILORIN:"University of Ilorin",ABU:"Ahmadu Bello University",LASU:"Lagos State University",
  FUTA:"Federal University of Technology Akure",FUTO:"Federal University of Technology Owerri",
  COOU:"Chukwuemeka Odumegwu Ojukwu University",IMSU:"Imo State University",
  ESUT:"Enugu State University of Science and Technology",UNIZIK:"Nnamdi Azikiwe University",
  "Co-founders":"EduCraft Co-founders",
};

// ── LocalStorage ──────────────────────────────────────────────────────────────
const LS_D="ec_data_v5",LS_G="ec_gh",LS_S="ec_secret";
const lsGet=(k:string)=>{try{const r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch{return null;}};
const lsSet=(k:string,v:unknown)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{/**/}};

// ── Code generators (for GitHub deploy) ──────────────────────────────────────
function genAmbTS(d:AmbassadorData):string{
  const sl=Object.entries(d.slots).map(([id,s])=>`    "${id}": { name: ${JSON.stringify(s.name).padEnd(22)}, school: ${JSON.stringify(s.school).padEnd(14)}, status: "${s.status}" },`).join("\n");
  const cl=d.coreAmbassadors.map(c=>`    { id:"${c.id}", name:"${c.name}", school:"${c.school}", percentage:${c.percentage}, status:"${c.status??"active"}" },`).join("\n");
  const sb=d.subAmbassadors.map(s=>`    { id:"${s.id}", name:"${s.name}", school:"${s.school}", percentage:${s.percentage}, coreId:"${s.coreId}", status:"${s.status??"active"}" },`).join("\n");
  return `// src/ambassadors.ts\nexport interface AmbassadorSlot{name:string;school:string;status:"active"|"vacant";}\nexport interface CoreAmbassador{id:string;name:string;school:string;percentage:number;status?:"active"|"vacant";}\nexport interface SubAmbassador{id:string;name:string;school:string;percentage:number;coreId:string;status?:"active"|"vacant";}\nexport interface AmbassadorData{educraft_whatsapp:string;slots:Record<string,AmbassadorSlot>;coreAmbassadors:CoreAmbassador[];subAmbassadors:SubAmbassador[];}\nconst ambassadors:AmbassadorData={\n  educraft_whatsapp:"${d.educraft_whatsapp}",\n  slots:{\n${sl}\n  },\n  coreAmbassadors:[\n${cl}\n  ],\n  subAmbassadors:[\n${sb}\n  ],\n};\nexport default ambassadors;\n`;
}

// Generates updated SLOTS block for redirect.ts
function genSlotsBlock(d:AmbassadorData):string{
  const lines=Object.entries(d.slots).map(([id,s])=>`  "${id}": { name: ${JSON.stringify(s.name).padEnd(22)}, school: ${JSON.stringify(s.school).padEnd(14)}, status: "${s.status}" },`).join("\n");
  return `const SLOTS: Record<string, { name: string; school: string; status: "active" | "vacant" }> = {\n${lines}\n};`;
}

async function deploy(owner:string,repo:string,token:string,data:AmbassadorData,log:(m:string)=>void):Promise<void>{
  const h={"Authorization":`token ${token}`,"Accept":"application/vnd.github.v3+json","Content-Type":"application/json"};
  const base=`https://api.github.com/repos/${owner}/${repo}/contents`;
  const b64=(s:string)=>{const bytes=new TextEncoder().encode(s);let bin="";bytes.forEach(b=>{bin+=String.fromCharCode(b);});return btoa(bin);};
  const getFile=async(p:string)=>{const r=await fetch(`${base}/${p}`,{headers:h});if(!r.ok)throw new Error(`Cannot read ${p} in repo`);const j=await r.json();return{sha:j.sha as string,content:atob((j.content as string).replace(/\n/g,""))};};
  const put=async(p:string,c:string,s:string)=>{const r=await fetch(`${base}/${p}`,{method:"PUT",headers:h,body:JSON.stringify({message:"EduCraft Admin deploy",content:b64(c),sha:s})});if(!r.ok){const e=await r.json();throw new Error(e.message||`Failed ${p}`);}};

  log("Connecting to GitHub…");

  // 1. Update ambassadors.ts
  const {sha:aS}=await getFile("src/ambassadors.ts");
  log("Updating src/ambassadors.ts…");
  await put("src/ambassadors.ts",genAmbTS(data),aS);

  // 2. Update SLOTS block inside api/redirect.ts
  log("Updating api/redirect.ts…");
  const {sha:rS,content:rContent}=await getFile("api/redirect.ts");
  const slotsStart=rContent.indexOf("const SLOTS:");
  const slotsEnd=rContent.indexOf("\n};",slotsStart)+3;
  if(slotsStart===-1)throw new Error("Could not find SLOTS block in redirect.ts");
  const newRedirect=rContent.substring(0,slotsStart)+genSlotsBlock(data)+rContent.substring(slotsEnd);
  await put("api/redirect.ts",newRedirect,rS);

  log("Both files pushed to GitHub. Vercel is rebuilding now.");
  log("Monitor: https://vercel.com/dashboard → educraft-ambassador → Deployments");
}

function nextId(slots:Record<string,AmbassadorSlot>):string{
  const ns=Object.keys(slots).map(k=>parseInt(k,10)).filter(n=>!isNaN(n));
  return String((ns.length?Math.max(...ns):0)+1).padStart(3,"0");
}

function naira(n:number):string{
  return"₦"+n.toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});
}

// ══════════════════════════════════════════════════════════════════════════════
export default function AdminDashboard({initialSecret=""}:{initialSecret?:string}){
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
  const[scrollY,setScrollY]=useState(0);

  // Broadcast state
  const[bcSubject,setBcSubject]=useState("");
  const[bcMessage,setBcMessage]=useState("");
  const[bcSt,setBcSt]=useState<"idle"|"busy"|"ok"|"fail">("idle");
  const[bcMsg,setBcMsg]=useState("");
  useEffect(()=>{
    const hr=()=>setMob(window.innerWidth<=640);
    const hs=()=>setScrollY(window.scrollY);
    window.addEventListener("resize",hr);
    window.addEventListener("scroll",hs,{passive:true});
    return()=>{window.removeEventListener("resize",hr);window.removeEventListener("scroll",hs);};
  },[]);

  // ── Manage ───────────────────────────────────────────────────────────────────
  const[editId,setEditId]=useState<string|null>(null);
  const[editName,setEditName]=useState("");const[editSchool,setEditSchool]=useState("");const[editSt,setEditSt]=useState<"active"|"vacant">("active");
  const[mSearch,setMSearch]=useState("");
  const[addOpen,setAddOpen]=useState(false);
  const[newId,setNewId]=useState("");const[newName,setNewName]=useState("");const[newSchool,setNewSchool]=useState("");const[newSt,setNewSt]=useState<"active"|"vacant">("active");const[addErr,setAddErr]=useState("");

  // Add Core Ambassador state
  const[addCoreOpen,setAddCoreOpen]=useState(false);
  const[ncId,setNcId]=useState("");const[ncName,setNcName]=useState("");const[ncSchool,setNcSchool]=useState("");const[ncPct,setNcPct]=useState(10);const[ncErr,setNcErr]=useState("");

  // Edit Core Ambassador state
  const[editCoreId,setEditCoreId]=useState<string|null>(null);
  const[ecName,setEcName]=useState("");const[ecSchool,setEcSchool]=useState("");const[ecPct,setEcPct]=useState(10);const[ecStatus,setEcStatus]=useState<"active"|"vacant">("active");const[ecErr,setEcErr]=useState("");

  // Add Sub Ambassador state
  const[addSubOpen,setAddSubOpen]=useState(false);
  const[nsId,setNsId]=useState("");const[nsName,setNsName]=useState("");const[nsSchool,setNsSchool]=useState("");const[nsCoreId,setNsCoreId]=useState("");const[nsErr,setNsErr]=useState("");

  // Edit Sub Ambassador state
  const[editSubId,setEditSubId]=useState<string|null>(null);
  const[esName,setEsName]=useState("");const[esSchool,setEsSchool]=useState("");const[esCoreId,setEsCoreId]=useState("");const[esStatus,setEsStatus]=useState<"active"|"vacant">("active");const[esErr,setEsErr]=useState("");
  const[gh,setGhRaw]=useState<{owner:string;repo:string;token:string;vercelToken:string;vercelProject:string}>(()=>lsGet(LS_G)??{owner:"",repo:"",token:"",vercelToken:"",vercelProject:"educraft-ambassador"});
  const setGh=(v:typeof gh)=>{setGhRaw(v);lsSet(LS_G,v);};
  const[dep,setDep]=useState<Deploy>("idle");const[depMsg,setDepMsg]=useState("");const[ghOpen,setGhOpen]=useState(false);
  // Vercel live status
  type VercelState="idle"|"pushing"|"queued"|"building"|"ready"|"error";
  const[vercelState,setVercelState]=useState<VercelState>("idle");
  const[vercelMsg,setVercelMsg]=useState("");

  // ── Tracking ─────────────────────────────────────────────────────────────────
  const[stats,setStats]=useState<Record<string,Stat>>({});
  const[sLoad,setSLoad]=useState(false);const[sErr,setSErr]=useState("");
  const[secret,setSecretRaw]=useState<string>(()=>initialSecret||lsGet(LS_S)??"");
  const setAdminSecret=(v:string)=>{setSecretRaw(v);lsSet(LS_S,v);};
  // Persist the login password into localStorage so all API calls work immediately
  useEffect(()=>{if(initialSecret){setSecretRaw(initialSecret);lsSet(LS_S,initialSecret);}},[initialSecret]);
  const[tempSecret,setTempSecret]=useState("");
  const[settOpen,setSettOpen]=useState(false);
  const[tSearch,setTSearch]=useState("");

  // Pending
  const[pending,setPending]=useState<Pending[]>([]);
  const[pLoad,setPLoad]=useState(false);
  const[rejId,setRejId]=useState<string|null>(null);const[rejReason,setRejReason]=useState("");
  const[appMsg,setAppMsg]=useState("");

  // Ambassador applications (new recruitment flow)
  interface Application {
    slotId:string;fullName:string;universityFull:string;universityAbbr:string;
    email:string;phone:string;bankName:string;accountNumber:string;accountName:string;
    submittedAt:string;status:string;
  }
  const[applications,setApplications]=useState<Application[]>([]);
  const[appsLoading,setAppsLoading]=useState(false);
  const[appActMsg,setAppActMsg]=useState("");
  const[editAppId,setEditAppId]=useState<string|null>(null);
  const[rejectAppId,setRejectAppId]=useState<string|null>(null);
  const[rejectAppReason,setRejectAppReason]=useState("");
  // Edit application form state
  const[eaFullName,setEaFullName]=useState("");
  const[eaUniAbbr,setEaUniAbbr]=useState("");
  const[eaEmail,setEaEmail]=useState("");

  // Edit pending registration state
  const[editPendingId,setEditPendingId]=useState<string|null>(null); // originalSlotId
  const[epSlotId,setEpSlotId]=useState("");
  const[epName,setEpName]=useState("");
  const[epSchool,setEpSchool]=useState("");
  const[epEmail,setEpEmail]=useState("");
  const[epReason,setEpReason]=useState("");
  const[epSt,setEpSt]=useState<"idle"|"busy"|"ok"|"fail">("idle");
  const[epMsg,setEpMsg]=useState("");

  // Log order
  const[logId,setLogId]=useState<string|null>(null);const[logName,setLogName]=useState("");
  const[logDesc,setLogDesc]=useState("");const[logAmt,setLogAmt]=useState("");const[logPct,setLogPct]=useState("10");
  const[logSt,setLogSt]=useState<"idle"|"busy"|"ok"|"fail">("idle");const[logMsg,setLogMsg]=useState("");

  // Direct message state
  const[msgId,setMsgId]=useState<string|null>(null);const[msgName,setMsgName]=useState("");
  const[msgTitle,setMsgTitle]=useState("");const[msgBody,setMsgBody]=useState("");
  const[msgSt,setMsgSt]=useState<"idle"|"busy"|"ok"|"fail">("idle");const[msgErr,setMsgErr]=useState("");

  // Reset slot registration
  const[resetId,setResetId]=useState<string|null>(null);

  // Payment records
  interface PaymentRecord { slotId:string;name:string;bankName:string;accountNumber:string;accountName:string;email?:string;phone?:string;universityFull?:string;universityAbbr?:string;approvedAt?:string;updatedAt?:string; }
  const[paymentRecords,setPaymentRecords]=useState<PaymentRecord[]>([]);
  const[payLoading,setPayLoading]=useState(false);
  const[editPayId,setEditPayId]=useState<string|null>(null);
  const[payForm,setPayForm]=useState<Partial<PaymentRecord>>({});
  const[paySt,setPaySt]=useState<"idle"|"busy"|"ok"|"fail">("idle");
  const[payMsg,setPayMsg]=useState("");
  const[resetSt,setResetSt]=useState<"idle"|"busy"|"ok"|"fail">("idle");
  const[resetMsg,setResetMsg]=useState("");

  // Auto-fetch when Tracking tab opens
  // Startup sync — secret is declared above so no hoisting issue
  useEffect(()=>{
    if(!secret)return;
    const doSync=async()=>{
      try{
        const r=await fetch(`/api/admin?action=sync-data&secret=${encodeURIComponent(secret)}`);
        if(!r.ok)return;
        const d=await r.json() as SyncData;
        if(!d?.profiles)return;
        // Merge approved profiles into slots
        setDataRaw((prev:AmbassadorData)=>{
          const merged:Record<string,AmbassadorSlot>={...prev.slots};
          let changed=false;
          Object.keys(d.profiles).forEach(id=>{
            const profile:SyncProfile=d.profiles[id];
            const existing=merged[id];
            if(!existing||existing.status==="vacant"||!existing.name){
              merged[id]={name:profile.name||existing?.name||"",school:profile.school||existing?.school||"",status:"active" as const};
              changed=true;
            }
          });
          if(!changed)return prev;
          const next:AmbassadorData={...prev,slots:merged};
          lsSet(LS_D,next);
          return next;
        });
        // Merge payment records
        if(d.payments&&Object.keys(d.payments).length>0){
          setPaymentRecords(Object.values(d.payments).map(v=>v as unknown as PaymentRecord));
        }
        // Update tracking stats
        setStats((prev:Record<string,Stat>)=>{
          const next:Record<string,Stat>={...prev};
          Object.keys(d.profiles).forEach(id=>{
            const p:SyncProfile=d.profiles[id];
            next[id]={clicks:prev[id]?.clicks??0,orders:prev[id]?.orders??0,email:p.email??prev[id]?.email??null,registeredName:p.name??prev[id]?.registeredName??null};
          });
          return next;
        });
      }catch{/* silent */}
    };
    void doSync();
  },[secret]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(tab==="tracking"){loadStats();loadPending();}
    if(tab==="applications"){loadApplications();}
    if(tab==="manage"){loadPaymentRecords();}
  },[tab]); // eslint-disable-line

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
    // General slots
    Object.values(data.slots).forEach(sl=>{const k=sl.school||"—";if(!m[k])m[k]={active:0,vacant:0};sl.status==="active"?m[k].active++:m[k].vacant++;});
    // Core ambassadors always count as active in their school
    data.coreAmbassadors.forEach(c=>{if(!c.school)return;const k=c.school;if(!m[k])m[k]={active:0,vacant:0};m[k].active++;});
    // Sub ambassadors always count as active in their school
    data.subAmbassadors.forEach(s=>{if(!s.school)return;const k=s.school;if(!m[k])m[k]={active:0,vacant:0};m[k].active++;});
    return Object.entries(m).sort((a,b)=>(b[1].active+b[1].vacant)-(a[1].active+a[1].vacant));
  },[data.slots,data.coreAmbassadors,data.subAmbassadors]);

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

  const loadApplications=async()=>{
    setAppsLoading(true);
    try{
      const qs=secret?`&secret=${encodeURIComponent(secret)}`:"";
      const r=await fetch(`/api/admin?action=applications${qs}`);
      if(r.ok)setApplications(await r.json());
    }catch{/**/}
    finally{setAppsLoading(false);}
  };

  const approveApplication=async(slotId:string)=>{
    setAppActMsg("");
    const app=applications.find(a=>a.slotId===slotId);
    if(!app)return;
    try{
      const r=await fetch("/api/admin?action=approve-application",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slotId,adminSecret:secret,baseUrl:base,
          fullName:editAppId===slotId?eaFullName:app.fullName,
          universityAbbr:editAppId===slotId?eaUniAbbr:app.universityAbbr,
          email:editAppId===slotId?eaEmail:app.email,
        })});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed");
      setApplications(prev=>prev.filter(a=>a.slotId!==slotId));
      setEditAppId(null);
      setAppActMsg(d.emailSent
        ?`Slot ${slotId} approved. Welcome email sent to ${d.email}.`
        :`Slot ${slotId} approved. (Add GMAIL_APP_PASSWORD to Vercel to send welcome emails.)`
      );
      // Update liveData so it reflects everywhere (Ambassadors, Schools, Manage tabs)
      const approvedName   = d.name   || app.fullName;
      const approvedSchool = (editAppId===slotId?eaUniAbbr:app.universityAbbr) || app.universityAbbr;
      const paddedId       = slotId.padStart(3,"0");
      // Always update — whether it was vacant or new, stamp it as active with the new ambassador
      setData({
        ...data,
        slots: {
          ...data.slots,
          [paddedId]: { name: approvedName, school: approvedSchool, status: "active" },
        },
      });
      // Also update tracking stats so email shows as registered
      setStats(prev => {
        const existing: Stat = prev[paddedId] ?? { clicks: 0, orders: 0, email: null, registeredName: null };
        const updated: Stat  = { clicks: existing.clicks, orders: existing.orders, email: d.email ?? null, registeredName: approvedName };
        return { ...prev, [paddedId]: updated };
      });
    }catch(e){setAppActMsg(`Error: ${(e as Error).message}`);}  };

  const rejectApplicationFn=async(slotId:string)=>{
    setAppActMsg("");
    try{
      const r=await fetch("/api/admin?action=reject-application",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slotId,reason:rejectAppReason,adminSecret:secret})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed");
      setApplications(prev=>prev.filter(a=>a.slotId!==slotId));
      setRejectAppId(null);setRejectAppReason("");
      setAppActMsg(`Slot ${slotId} application rejected.${d.emailSent?" Notification email sent.":""}`);
    }catch(e){setAppActMsg(`Error: ${(e as Error).message}`);}
  };

  const loadStats=async()=>{
    setSLoad(true);setSErr("");
    try{
      const qs=secret?`&secret=${encodeURIComponent(secret)}`:"";
      const r=await fetch(`/api/admin?action=stats${qs}`);
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed to load stats.");
      setStats(d);
    }catch(e){setSErr((e as Error).message);}
    finally{setSLoad(false);}
  };

  const loadPending=async()=>{
    setPLoad(true);
    try{
      const qs=secret?`&secret=${encodeURIComponent(secret)}`:"";
      const r=await fetch(`/api/admin?action=pending${qs}`);
      if(r.ok)setPending(await r.json());
    }catch{/**/}
    finally{setPLoad(false);}
  };

  const openEditPending=(p:{slotId:string;name:string;school:string;email:string})=>{
    setEditPendingId(p.slotId);
    setEpSlotId(p.slotId);setEpName(p.name);setEpSchool(p.school);setEpEmail(p.email);
    setEpReason("");setEpSt("idle");setEpMsg("");
  };

  const saveEditPending=async()=>{
    if(!editPendingId)return;
    if(!epSlotId.trim()){setEpMsg("Slot ID is required.");setEpSt("fail");return;}
    if(!epName.trim())  {setEpMsg("Name is required.");setEpSt("fail");return;}
    if(!epEmail.trim()) {setEpMsg("Email is required.");setEpSt("fail");return;}
    setEpSt("busy");setEpMsg("");
    try{
      const r=await fetch("/api/admin?action=edit-pending",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({originalSlotId:editPendingId,slotId:epSlotId,name:epName,school:epSchool,email:epEmail,changeReason:epReason,adminSecret:secret})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed to update.");
      // Update local pending list with corrected values
      setPending(prev=>prev.map(p=>p.slotId===editPendingId
        ?{...p,slotId:epSlotId.toUpperCase(),name:epName,school:epSchool,email:epEmail}
        :p
      ));
      setEpSt("ok");setEpMsg("Details updated successfully.");
      setTimeout(()=>{setEditPendingId(null);setEpSt("idle");setEpMsg("");},2000);
    }catch(e){setEpSt("fail");setEpMsg((e as Error).message);}
  };

  const approve=async(slotId:string)=>{
    setAppMsg("");
    try{
      const r=await fetch("/api/admin?action=approve",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slotId,action:"approve",adminSecret:secret,baseUrl:base})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed");
      setPending(p=>p.filter(x=>x.slotId!==slotId));
      setStats(p=>({...p,[slotId]:{...(p[slotId]??{clicks:0,orders:0}),email:d.email||null,registeredName:d.name||null}}));
      setAppMsg(d.emailSent?`${slotId} approved — welcome email sent to ${d.email}.`:`${slotId} approved. (Add GMAIL_APP_PASSWORD in Vercel to send welcome emails.)`);
    }catch(e){setAppMsg(`❌ ${(e as Error).message}`);}
  };

  const reject=async(slotId:string)=>{
    setAppMsg("");
    try{
      const r=await fetch("/api/admin?action=approve",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slotId,action:"reject",adminSecret:secret,reason:rejReason})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed");
      setPending(p=>p.filter(x=>x.slotId!==slotId));
      setRejId(null);setRejReason("");
      setAppMsg(`Slot ${slotId} rejected.${d.emailSent?" Rejection email sent.":""}`);
    }catch(e){setAppMsg(`❌ ${(e as Error).message}`);}
  };

  const openLog=(id:string,name:string)=>{setLogId(id);setLogName(name);setLogDesc("");setLogAmt("");setLogPct("10");setLogSt("idle");setLogMsg("");};

  const openMessage=(id:string,name:string)=>{setMsgId(id);setMsgName(name);setMsgTitle("");setMsgBody("");setMsgSt("idle");setMsgErr("");};
  const sendMessage=async()=>{
    if(!msgId)return;
    if(!msgTitle.trim()){setMsgErr("Title is required.");return;}
    if(!msgBody.trim()){setMsgErr("Message is required.");return;}
    setMsgSt("busy");setMsgErr("");
    try{
      const r=await fetch("/api/admin?action=message-ambassador",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slotId:msgId,title:msgTitle,message:msgBody,adminSecret:secret})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed to send.");
      setMsgSt("ok");setMsgErr(`Sent to ${d.sentTo}`);
      setTimeout(()=>{setMsgId(null);setMsgSt("idle");setMsgErr("");},4000);
    }catch(e){setMsgSt("fail");setMsgErr((e as Error).message);}
  };

  const logOrder=async()=>{
    if(!logId)return;
    setLogSt("busy");
    try{
      const r=await fetch("/api/admin?action=track-order",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slotId:logId,jobDesc:logDesc,jobAmount:logAmt,commissionPercent:logPct,adminSecret:secret})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed");
      setLogSt("ok");
      // Clear, precise message based on emailReason from server
      const msgs:Record<string,string>={
        sent: `Order logged. Commission email sent to ${d.emailTo}`,
        no_profile:     "Order logged. This ambassador is not yet approved — no email sent.",
        no_email:       "Order logged. Ambassador profile has no email address.",
        no_gmail_password: "Order logged. Add GMAIL_APP_PASSWORD to Vercel to enable emails.",
        send_failed:    "Order logged. Email failed to send — check GMAIL_APP_PASSWORD in Vercel.",
      };
      setLogMsg(msgs[d.emailReason]??`Order logged.`);
      setStats(p=>({...p,[logId]:{...(p[logId]??{clicks:0,email:null,registeredName:null}),orders:(p[logId]?.orders??0)+1}}));
      setTimeout(()=>{setLogId(null);setLogSt("idle");setLogMsg("");},5000);
    }catch(e){setLogSt("fail");setLogMsg(`❌ ${(e as Error).message}`);}
  };

  const resetSlot=async(slotId:string)=>{
    setResetSt("busy");setResetMsg("");
    try{
      const r=await fetch("/api/admin?action=reset-slot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({slotId,adminSecret:secret})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed");
      setResetSt("ok");setResetMsg(`Slot ${slotId} registration cleared. The new ambassador can now register.`);
      setStats(p=>{const n={...p};if(n[slotId]){n[slotId]={...n[slotId],email:null,registeredName:null};}return n;});
      setTimeout(()=>{setResetId(null);setResetSt("idle");setResetMsg("");},4000);
    }catch(e){setResetSt("fail");setResetMsg(`Error: ${(e as Error).message}`);}
  };

  const loadPaymentRecords=async()=>{
    setPayLoading(true);
    try{
      const r=await fetch(`/api/admin?action=payment-records&secret=${encodeURIComponent(secret)}`);
      if(r.ok)setPaymentRecords(await r.json());
    }catch{/**/}
    finally{setPayLoading(false);}
  };

  const savePaymentRecord=async()=>{
    if(!editPayId)return;
    setPaySt("busy");setPayMsg("");
    try{
      const r=await fetch("/api/admin?action=save-payment",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...payForm,fullName:(payForm as Record<string,string>).name,slotId:editPayId,adminSecret:secret})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed");
      setPaySt("ok");setPayMsg("Payment details saved.");
      setPaymentRecords(prev=>prev.map(p=>p.slotId===editPayId?d.record:p));
      // Also add if it was new
      if(!paymentRecords.find(p=>p.slotId===editPayId))setPaymentRecords(prev=>[...prev,d.record]);
      setTimeout(()=>{setEditPayId(null);setPaySt("idle");setPayMsg("");},2500);
    }catch(e){setPaySt("fail");setPayMsg((e as Error).message);}
  };

  const sendBroadcast=async()=>{
    if(!bcSubject.trim()){setBcMsg("Subject is required.");setBcSt("fail");return;}
    if(!bcMessage.trim()){setBcMsg("Message is required.");setBcSt("fail");return;}
    setBcSt("busy");setBcMsg("");
    try{
      const r=await fetch("/api/admin?action=broadcast",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject:bcSubject,message:bcMessage,adminSecret:secret})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed");
      setBcSt("ok");setBcMsg(`Sent to ${d.sent} ambassador${d.sent!==1?"s":""}.${d.failed>0?` ${d.failed} failed.`:""}`);
    }catch(e){setBcSt("fail");setBcMsg(`Error: ${(e as Error).message}`);}
  };

  const startEdit=(id:string)=>{const sl=data.slots[id];setEditId(id);setEditName(sl.name);setEditSchool(sl.school);setEditSt(sl.status);};
  const saveEdit=()=>{
    if(!editId)return;
    setData({...data,slots:{...data.slots,[editId]:{name:editName,school:editSchool,status:editSt}}});
    // When marking a slot vacant — clear their Redis profile and payment record
    if(editSt==="vacant"){
      fetch("/api/admin?action=clear-ambassador",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slotId:editId,adminSecret:secret})})
        .catch(()=>{});
      // Also clear from local tracking stats
      setStats((prev:Record<string,Stat>)=>{
        const n={...prev};
        if(n[editId]){n[editId]={...n[editId],email:null,registeredName:null};}
        return n;
      });
      // Remove from payment records list
      setPaymentRecords(prev=>prev.filter(p=>p.slotId!==editId.padStart(3,"0")));
    }
    setEditId(null);
  };
  const saveNew=()=>{const id=newId.trim().padStart(3,"0");if(!id){setAddErr("Slot ID required.");return;}if(!newName.trim()){setAddErr("Name required.");return;}if(data.slots[id]){setAddErr(`Slot ${id} already exists.`);return;}setData({...data,slots:{...data.slots,[id]:{name:newName.trim(),school:newSchool.trim(),status:newSt}}});setAddOpen(false);setAddErr("");};

  const nextEccaId=():string=>{
    const nums=data.coreAmbassadors.map(c=>{const m=c.id.match(/ECCA-(\d+)/);return m?parseInt(m[1],10):0;});
    return `ECCA-${String((nums.length?Math.max(...nums):0)+1).padStart(3,"0")}`;
  };
  const nextEcsaId=(coreId:string):string=>{
    const core=coreId.replace(/^ECCA-/,"");
    const subs=data.subAmbassadors.filter(s=>s.coreId===coreId);
    const nums=subs.map(s=>{const m=s.id.match(/ECSA-\d+-(\d+)/);return m?parseInt(m[1],10):0;});
    const next=String((nums.length?Math.max(...nums):0)+1).padStart(3,"0");
    return `ECSA-${core}-${next}`;
  };

  const saveNewCore=()=>{
    if(!ncName.trim()){setNcErr("Name is required.");return;}
    if(!ncId.trim()){setNcErr("Slot ID is required.");return;}
    const fullId=ncId.trim().toUpperCase().startsWith("ECCA-")?ncId.trim().toUpperCase():`ECCA-${ncId.trim().toUpperCase()}`;
    if(data.coreAmbassadors.find(c=>c.id===fullId)){setNcErr(`${fullId} already exists.`);return;}
    setData({...data,coreAmbassadors:[...data.coreAmbassadors,{id:fullId,name:ncName.trim(),school:ncSchool.trim(),percentage:ncPct}]});
    setAddCoreOpen(false);setNcErr("");setNcId("");setNcName("");setNcSchool("");setNcPct(10);
  };

  const saveNewSub=()=>{
    if(!nsName.trim()){setNsErr("Name is required.");return;}
    if(!nsCoreId.trim()){setNsErr("Core Ambassador Slot ID is required.");return;}
    const coreFullId=nsCoreId.trim().toUpperCase().startsWith("ECCA-")?nsCoreId.trim().toUpperCase():`ECCA-${nsCoreId.trim().toUpperCase()}`;
    const coreExists=data.coreAmbassadors.find(c=>c.id===coreFullId);
    if(!coreExists){setNsErr(`Core Ambassador ${coreFullId} does not exist. Add them first in the Core (ECCA) tab.`);return;}
    const subId=nsId.trim()?
      (nsId.trim().toUpperCase().startsWith("ECSA-")?nsId.trim().toUpperCase():`ECSA-${nsId.trim().toUpperCase()}`)
      :nextEcsaId(coreFullId);
    if(data.subAmbassadors.find(s=>s.id===subId)){setNsErr(`${subId} already exists.`);return;}
    setData({...data,subAmbassadors:[...data.subAmbassadors,{id:subId,name:nsName.trim(),school:nsSchool.trim(),percentage:7,coreId:coreFullId}]});
    setAddSubOpen(false);setNsErr("");setNsId("");setNsName("");setNsSchool("");setNsCoreId("");
  };

  const openEditCore=(a:{id:string;name:string;school:string;percentage:number;status?:string})=>{
    setEditCoreId(a.id);setEcName(a.name);setEcSchool(a.school);setEcPct(a.percentage);
    setEcStatus((a.status??"active") as "active"|"vacant");setEcErr("");
  };
  const saveEditCore=()=>{
    if(!editCoreId)return;
    if(!ecName.trim()){setEcErr("Name is required.");return;}
    setData({...data,coreAmbassadors:data.coreAmbassadors.map(c=>
      c.id===editCoreId?{...c,name:ecName.trim(),school:ecSchool.trim(),percentage:ecPct,status:ecStatus}:c
    )});
    if(ecStatus==="vacant"){
      fetch("/api/admin?action=clear-ambassador",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slotId:editCoreId,adminSecret:secret})}).catch(()=>{});
      setStats((prev:Record<string,Stat>)=>{const n={...prev};if(n[editCoreId]){n[editCoreId]={...n[editCoreId],email:null,registeredName:null};}return n;});
    }
    setEditCoreId(null);setEcErr("");
  };

  const openEditSub=(a:{id:string;name:string;school:string;coreId:string;status?:string})=>{
    setEditSubId(a.id);setEsName(a.name);setEsSchool(a.school);setEsCoreId(a.coreId);
    setEsStatus((a.status??"active") as "active"|"vacant");setEsErr("");
  };
  const saveEditSub=()=>{
    if(!editSubId)return;
    if(!esName.trim()){setEsErr("Name is required.");return;}
    const coreFullId=esCoreId.trim().toUpperCase().startsWith("ECCA-")?esCoreId.trim().toUpperCase():`ECCA-${esCoreId.trim().toUpperCase()}`;
    if(!data.coreAmbassadors.find(c=>c.id===coreFullId)){setEsErr(`Core Ambassador ${coreFullId} does not exist.`);return;}
    setData({...data,subAmbassadors:data.subAmbassadors.map(s=>
      s.id===editSubId?{...s,name:esName.trim(),school:esSchool.trim(),coreId:coreFullId,status:esStatus}:s
    )});
    if(esStatus==="vacant"){
      fetch("/api/admin?action=clear-ambassador",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({slotId:editSubId,adminSecret:secret})}).catch(()=>{});
      setStats((prev:Record<string,Stat>)=>{const n={...prev};if(n[editSubId]){n[editSubId]={...n[editSubId],email:null,registeredName:null};}return n;});
    }
    setEditSubId(null);setEsErr("");
  };

  const doDeploy=async()=>{
    if(!gh.owner||!gh.repo||!gh.token){setGhOpen(true);setDepMsg("Fill in GitHub settings first.");return;}
    setDep("busy");setDepMsg("Starting…");setVercelState("pushing");setVercelMsg("Pushing to GitHub…");
    try{
      await deploy(gh.owner,gh.repo,gh.token,data,setDepMsg);
      setDep("ok");
      // Begin Vercel status polling if token is provided
      if(gh.vercelToken&&gh.vercelProject){
        setVercelState("queued");setVercelMsg("Waiting for Vercel to pick up the deployment…");
        // Poll every 4 seconds for up to 3 minutes
        let attempts=0;
        const maxAttempts=45;
        const poll=async()=>{
          attempts++;
          try{
            const r=await fetch(
              `https://api.vercel.com/v6/deployments?app=${encodeURIComponent(gh.vercelProject)}&limit=1`,
              {headers:{Authorization:`Bearer ${gh.vercelToken}`}}
            );
            if(!r.ok){setVercelState("error");setVercelMsg("Could not reach Vercel API. Check your Vercel token.");return;}
            const d2=await r.json();
            const latest=d2.deployments?.[0];
            if(!latest){if(attempts<maxAttempts)setTimeout(poll,4000);return;}
            const st:string=latest.state??"";
            if(st==="READY"){
              setVercelState("ready");
              setVercelMsg(`Live on Vercel · ${new Date().toLocaleTimeString()}`);
            }else if(st==="ERROR"||st==="CANCELED"){
              setVercelState("error");
              setVercelMsg(`Vercel build ${st.toLowerCase()}. Check Vercel dashboard for details.`);
            }else{
              // BUILDING, INITIALIZING, QUEUED
              const label:Record<string,string>={BUILDING:"Building…",INITIALIZING:"Initializing…",QUEUED:"Queued…"};
              setVercelState("building");
              setVercelMsg(label[st]??`Status: ${st}…`);
              if(attempts<maxAttempts)setTimeout(poll,4000);
            }
          }catch{if(attempts<maxAttempts)setTimeout(poll,5000);}
        };
        setTimeout(poll,6000); // wait 6s for GitHub→Vercel webhook to fire
      }else{
        setVercelState("ready");setVercelMsg("Pushed to GitHub. Add Vercel Token in settings to see live status.");
      }
    }catch(e){setDep("fail");setDepMsg((e as Error).message);setVercelState("error");setVercelMsg("Push to GitHub failed.");}
  };

  // Nav tabs
  const navTabs:{key:TabId;label:string}[]=[
    {key:"ambassadors",  label:"Ambassadors"},
    {key:"schools",      label:"Schools"},
    {key:"core",         label:"Core (ECCA)"},
    {key:"sub",          label:"Sub (ECSA)"},
    {key:"applications", label:applications.length>0?`Applications (${applications.length})`:"Applications"},
    {key:"tracking",     label:pending.length>0?`Tracking (${pending.length})`:"Tracking"},
    {key:"manage",       label:"Manage"},
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
              onClick={()=>setTab(t.key)}>{t.label}</button>
          ))}
        </nav>
        <button style={{...s.hamburger,display:mob?"flex":"none"}} onClick={()=>setMenu(o=>!o)}>{menu?"✕":"≡"}</button>
      </header>
      {menu&&(
        <div style={s.mobileMenu}>
          {navTabs.map(t=>(
            <button key={t.key} style={{...s.mobileItem,...(tab===t.key?s.mobileActive:{})}} onClick={()=>{setTab(t.key);setMenu(false);}}>
              {t.label}{t.key==="tracking"&&pending.length>0?` (${pending.length})`:""}
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
          <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:12}}>
            <div style={s.secLabel}>School Coverage</div>
            <div style={{fontSize:"0.8rem",fontWeight:700,color:C.white,background:C.green,borderRadius:999,padding:"2px 10px"}}>{schoolStats.length} school{schoolStats.length!==1?"s":""}</div>
          </div>
          <div style={s.schoolGrid}>
            {schoolStats.map(([abbr,st])=>{const tot=st.active+st.vacant;const pct=Math.round((st.active/tot)*100);return(
              <div key={abbr} style={s.schoolCard}>
                <div style={s.schoolHead}>
                  <div>
                    <div style={s.schoolAbbr}>{abbr||"—"}</div>
                    <div style={s.schoolName}>{SCHOOL[abbr] || (abbr==="—" ? "Unknown School" : `${abbr} University`)}</div>
                  </div>
                  <div style={s.schoolTot}>{tot}</div>
                </div>
                <div style={s.prog}><div style={{...s.progFill,width:`${pct}%`}}/></div>
                <div style={s.schoolFoot}><span style={{color:C.green,fontWeight:700}}>● {st.active} Active</span><span style={{color:C.yellowDark,fontWeight:600}}>○ {st.vacant} Vacant</span><span style={{color:"#aaa"}}>{pct}% filled</span></div>
              </div>
            );})}
          </div>
        </>)}

        {/* ════ CORE ════ */}
        {/* ════ APPLICATIONS ════ */}
        {tab==="applications"&&(<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap" as const,gap:8}}>
            <div style={s.secLabel}>New Ambassador Applications</div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...s.actBtn,background:C.greenDark,color:C.yellow,fontSize:"0.82rem"}} onClick={loadApplications} disabled={appsLoading}>
                {appsLoading?"Loading…":"↻ Refresh"}
              </button>
              <button style={{...s.actBtn,background:C.green,color:C.white,fontSize:"0.82rem"}}
                onClick={()=>copy(`${base}/apply`,"apply-link")}>
                {copied==="apply-link"?"Copied":"Copy Application Link"}
              </button>
            </div>
          </div>

          <div style={{...s.info,marginBottom:16}}>
            <div style={{flex:1,fontSize:"0.85rem",lineHeight:1.7}}>
              Share <strong>{base}/apply</strong> with potential ambassadors. They fill in the form, you review here and approve or reject.
              On approval, they are automatically added to the system and receive a welcome email with their referral link.
            </div>
          </div>

          {appActMsg&&(
            <div style={{marginBottom:16}}>
              <div style={{...s.banner,borderColor:appActMsg.startsWith("Error")?C.red:C.green,background:appActMsg.startsWith("Error")?C.redLight:C.white,color:appActMsg.startsWith("Error")?C.red:C.greenDark,marginBottom:8}}>{appActMsg}</div>
              {!appActMsg.startsWith("Error")&&(
                <div style={{background:"#fffbeb",border:`1px solid ${C.yellowDark}`,borderRadius:8,padding:"10px 14px",fontSize:"0.82rem",color:C.greenDark,lineHeight:1.6}}>
                  <strong>Dashboard already updated.</strong> The ambassador's slot, school, and tracking data are live in your current session.
                  To make their link permanently work after a page refresh, go to <strong>Manage</strong> tab → <strong>Deploy to GitHub</strong>.
                </div>
              )}
            </div>
          )}

          {applications.length===0&&!appsLoading&&(
            <div style={{background:C.milk,border:`1px solid ${C.milkDark}`,borderRadius:10,padding:"40px 20px",textAlign:"center" as const,color:"#aaa",fontSize:"0.88rem"}}>
              No pending applications. Share the application link with new ambassadors.
            </div>
          )}

          {applications.length>0&&applications.map((app,i)=>(
            <div key={app.slotId} style={{background:C.white,border:`1.5px solid ${C.milkDark}`,borderRadius:12,marginBottom:16,overflow:"hidden"}}>
              {/* Application header */}
              <div style={{background:C.greenDark,padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap" as const,gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontFamily:"monospace",color:C.yellow,fontWeight:700,fontSize:"0.95rem"}}>EduCraftA-{app.slotId}</span>
                  <span style={{color:C.white,fontWeight:600}}>{app.fullName}</span>
                </div>
                <span style={{fontSize:"0.76rem",color:"rgba(255,255,255,0.7)"}}>
                  Submitted {new Date(app.submittedAt).toLocaleDateString()}
                </span>
              </div>

              {/* Details grid */}
              <div style={{padding:"16px 18px"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,marginBottom:16}}>
                  {[
                    {l:"University",   v:`${app.universityFull} (${app.universityAbbr})`},
                    {l:"Email",        v:app.email},
                    {l:"Phone",        v:app.phone},
                    {l:"Bank",         v:app.bankName},
                    {l:"Account No.",  v:app.accountNumber},
                    {l:"Account Name", v:app.accountName},
                  ].map(f=>(
                    <div key={f.l}>
                      <div style={{fontSize:"0.68rem",fontWeight:700,color:"#888",textTransform:"uppercase" as const,letterSpacing:"0.06em",marginBottom:3}}>{f.l}</div>
                      <div style={{fontSize:"0.86rem",color:C.greenDark,fontWeight:600}}>{f.v}</div>
                    </div>
                  ))}
                </div>

                {/* Admin edit before approval */}
                {editAppId===app.slotId&&(
                  <div style={{background:C.milk,border:`1px solid ${C.milkDark}`,borderLeft:`3px solid ${C.yellowDark}`,borderRadius:6,padding:"14px 16px",marginBottom:14}}>
                    <div style={{fontSize:"0.75rem",fontWeight:700,color:C.greenDark,marginBottom:12}}>Edit before approving (optional overrides):</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
                      {[
                        {l:"Full Name",     v:eaFullName,  s:setEaFullName,  ph:app.fullName},
                        {l:"Uni Abbr.",     v:eaUniAbbr,   s:setEaUniAbbr,   ph:app.universityAbbr},
                        {l:"Email",         v:eaEmail,     s:setEaEmail,     ph:app.email},
                      ].map(f=>(
                        <div key={f.l}>
                          <label style={{...s.fLabel,fontSize:"0.68rem"}}>{f.l}</label>
                          <input style={{...s.fInp,padding:"7px 10px",fontSize:"0.82rem"}} value={f.v} onChange={e=>f.s(e.target.value)} placeholder={f.ph}/>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reject reason input */}
                {rejectAppId===app.slotId&&(
                  <div style={{background:C.redLight,border:`1px solid #fca5a5`,borderRadius:6,padding:"12px 16px",marginBottom:14}}>
                    <div style={{fontSize:"0.75rem",fontWeight:700,color:C.red,marginBottom:8}}>Rejection reason (optional — will be emailed to applicant):</div>
                    <textarea style={{...s.fInp,height:70,resize:"vertical" as const,fontFamily:"inherit",fontSize:"0.84rem"}}
                      placeholder="e.g. Details could not be verified…"
                      value={rejectAppReason} onChange={e=>setRejectAppReason(e.target.value)}/>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                  <button style={{...s.actBtn,background:C.green,color:C.white,padding:"8px 18px",fontSize:"0.82rem"}}
                    onClick={()=>approveApplication(app.slotId)}>
                    Approve
                  </button>
                  <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`,padding:"8px 18px",fontSize:"0.82rem"}}
                    onClick={()=>{
                      if(editAppId===app.slotId){setEditAppId(null);}
                      else{setEditAppId(app.slotId);setEaFullName(app.fullName);setEaUniAbbr(app.universityAbbr);setEaEmail(app.email);}
                    }}>
                    {editAppId===app.slotId?"Cancel Edit":"Edit Before Approving"}
                  </button>
                  {rejectAppId===app.slotId?(
                    <>
                      <button style={{...s.actBtn,background:C.red,color:C.white,padding:"8px 18px",fontSize:"0.82rem"}}
                        onClick={()=>rejectApplicationFn(app.slotId)}>Confirm Reject</button>
                      <button style={{...s.cpBtn,fontSize:"0.82rem"}} onClick={()=>{setRejectAppId(null);setRejectAppReason("");}}>Cancel</button>
                    </>
                  ):(
                    <button style={{...s.actBtn,background:C.red,color:C.white,padding:"8px 18px",fontSize:"0.82rem"}}
                      onClick={()=>{setRejectAppId(app.slotId);setRejectAppReason("");}}>
                      Reject
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </>)}

        {tab==="core"&&(<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap" as const,gap:8}}>
            <div style={s.secLabel}>Core Ambassadors (ECCA) — Senior Partners</div>
            <button style={{...s.actBtn,background:C.green,color:C.white,padding:"8px 16px",fontSize:"0.82rem"}} onClick={()=>{setNcId(nextEccaId());setNcName("");setNcSchool("");setNcPct(10);setNcErr("");setAddCoreOpen(true);}}>Add Core Ambassador</button>
          </div>
          <div style={s.info}><div><p>Core Ambassadors earn their base percentage plus <strong>3%</strong> for each Sub-Ambassador job. Share the Recruit Link with potential Sub-Ambassadors.</p></div></div>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr style={s.thead}>{["No.","ID","Name","School","Base %","Subs","Total %","Recruit Link","",""].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{data.coreAmbassadors.map((a,i)=>{const subs=data.subAmbassadors.filter(sb=>sb.coreId===a.id).length;const tot=a.percentage+subs*3;const ck=`ec-${a.id}`;return(
                <tr key={a.id} style={{...s.tr,background:i%2===0?C.white:C.milk}}>
                  <td style={s.td}><span style={s.num}>{i+1}.</span></td><td style={s.td}><span style={s.slotId}>{a.id}</span></td>
                  <td style={s.td}><strong style={{color:C.greenDark}}>{a.name}</strong></td><td style={s.td}><span style={s.schoolTag}>{a.school}</span></td>
                  <td style={s.td}><span style={{...s.badge,background:C.green,color:C.white}}>{a.percentage}%</span></td>
                  <td style={s.td}><span style={{color:subs>0?C.green:"#bbb",fontWeight:subs>0?700:400}}>{subs>0?subs:"—"}</span></td>
                  <td style={s.td}><span style={{...s.badge,background:C.yellow,color:C.greenDark,fontWeight:800}}>{tot}%</span></td>
                  <td style={s.td}><span style={s.link}>/ECCA/{a.id}</span></td>
                  <td style={s.td}><button style={{...s.cpBtn,...(copied===ck?s.cpDone:{})}} onClick={()=>copy(`${base}/ECCA/${a.id}`,ck)}>{copied===ck?"✓":"Copy"}</button></td>
                  <td style={s.td}>
                    <div style={{display:"flex",gap:6}}>
                      <button style={{...s.cpBtn,fontSize:"0.76rem"}} onClick={()=>openEditCore(a)}>Edit</button>
                      <button style={{...s.cpBtn,fontSize:"0.76rem",color:"#888",borderColor:"#ddd"}} onClick={()=>{setResetId(a.id);setResetSt("idle");setResetMsg("");}}>Reset</button>
                    </div>
                  </td>
                </tr>
              );})}</tbody>
            </table>
          </div>
        </>)}

        {/* ════ SUB ════ */}
        {tab==="sub"&&(<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap" as const,gap:8}}>
            <div style={s.secLabel}>Sub-Ambassadors (ECSA)</div>
            <button style={{...s.actBtn,background:C.green,color:C.white,padding:"8px 16px",fontSize:"0.82rem"}} onClick={()=>{setNsId("");setNsName("");setNsSchool("");setNsCoreId("");setNsErr("");setAddSubOpen(true);}}>Add Sub Ambassador</button>
          </div>
          <div style={s.info}><div><p>Sub-Ambassadors earn <strong>7%</strong> per job. Their Core Ambassador earns an additional <strong>3%</strong> per Sub-Ambassador job.</p></div></div>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr style={s.thead}>{["No.","ID","Name","School","%","Under (Core)","Client Link","",""].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{data.subAmbassadors.map((a,i)=>{const core=data.coreAmbassadors.find(c=>c.id===a.coreId);const ck=`es-${a.id}`;return(
                <tr key={a.id} style={{...s.tr,background:i%2===0?C.white:C.milk}}>
                  <td style={s.td}><span style={s.num}>{i+1}.</span></td><td style={s.td}><span style={s.slotId}>{a.id}</span></td>
                  <td style={s.td}><strong style={{color:C.greenDark}}>{a.name}</strong></td><td style={s.td}><span style={s.schoolTag}>{a.school}</span></td>
                  <td style={s.td}><span style={{...s.badge,background:C.yellowDark,color:C.greenDark}}>{a.percentage}%</span></td>
                  <td style={s.td}>{core?<span style={{color:C.green,fontWeight:600}}>{core.name}</span>:<span style={{color:"#bbb"}}>—</span>}</td>
                  <td style={s.td}><span style={s.link}>/ECSA/{a.id.replace(/^ECSA/,"")}</span></td>
                  <td style={s.td}><button style={{...s.cpBtn,...(copied===ck?s.cpDone:{})}} onClick={()=>copy(`${base}/ECSA/${a.id.replace(/^ECSA/,"")}`,ck)}>{copied===ck?"Copied":"Copy"}</button></td>
                  <td style={s.td}>
                    <div style={{display:"flex",gap:6}}>
                      <button style={{...s.cpBtn,fontSize:"0.76rem"}} onClick={()=>openEditSub(a)}>Edit</button>
                      <button style={{...s.cpBtn,fontSize:"0.76rem",color:"#888",borderColor:"#ddd"}} onClick={()=>{setResetId(a.id);setResetSt("idle");setResetMsg("");}}>Reset</button>
                    </div>
                  </td>
                </tr>
              );})}</tbody>
            </table>
          </div>
        </>)}

        {/* ════ TRACKING ════ */}
        {tab==="tracking"&&(<>
          <div style={s.secLabel}>Referral Tracking — Live Leaderboard</div>

          {/* Pending approvals */}
          {pending.length>0&&(
            <div style={{background:C.white,border:`2px solid ${C.yellow}`,borderRadius:12,marginBottom:20,overflow:"hidden"}}>
              <div style={{background:C.yellow,padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap" as const,gap:8}}>
                <span style={{fontWeight:800,color:C.greenDark}}>{pending.length} Registration{pending.length>1?"s":""} Awaiting Approval</span>
                <span style={{fontSize:"0.78rem",color:C.greenDark,opacity:0.75}}>Verify each applicant before approving</span>
              </div>
              <div style={{overflowX:"auto" as const}}>
                <table style={{...s.table,minWidth:620}}>
                  <thead><tr style={{background:C.greenDark}}>{["Slot ID","Name","School","Email","Applied","Action"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {pending.map((p,i)=>(
                      <tr key={p.slotId} style={{...s.tr,background:i%2===0?C.white:C.milk}}>
                        <td style={s.td}>
                          <span style={s.slotId}>{p.slotId}</span>
                          {(p as {adminCorrected?:boolean}).adminCorrected&&<span style={{marginLeft:6,fontSize:"0.68rem",background:C.yellowDark,color:C.greenDark,borderRadius:4,padding:"1px 6px",fontWeight:700}}>Edited</span>}
                        </td>
                        <td style={s.td}><strong style={{color:C.greenDark}}>{p.name}</strong></td>
                        <td style={s.td}><span style={s.schoolTag}>{p.school||"—"}</span></td>
                        <td style={s.td}><span style={{color:C.green,fontSize:"0.82rem"}}>{p.email}</span></td>
                        <td style={s.td}><span style={{color:"#aaa",fontSize:"0.78rem"}}>{new Date(p.registeredAt).toLocaleDateString()}</span></td>
                        <td style={s.td}>
                          {rejId===p.slotId?(
                            <div style={{display:"flex",gap:6,flexWrap:"wrap" as const,alignItems:"center"}}>
                              <input style={{...s.fInp,width:130,padding:"5px 8px",fontSize:"0.78rem"}} placeholder="Reason (optional)" value={rejReason} onChange={e=>setRejReason(e.target.value)}/>
                              <button style={{...s.actBtn,background:C.red,color:C.white,padding:"5px 12px",fontSize:"0.78rem"}} onClick={()=>reject(p.slotId)}>Confirm</button>
                              <button style={{...s.cpBtn}} onClick={()=>setRejId(null)}>Cancel</button>
                            </div>
                          ):(
                            <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
                              <button style={{...s.actBtn,background:C.green,color:C.white,padding:"6px 14px",fontSize:"0.78rem"}} onClick={()=>approve(p.slotId)}>Approve</button>
                              <button style={{...s.cpBtn,fontSize:"0.78rem",padding:"5px 12px"}} onClick={()=>openEditPending(p)}>Edit</button>
                              <button style={{...s.actBtn,background:C.red,color:C.white,padding:"6px 14px",fontSize:"0.78rem"}} onClick={()=>{setRejId(p.slotId);setRejReason("");}}>Reject</button>
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
            <div style={{flex:1}}>
              <p style={{fontWeight:700,marginBottom:4}}>Ambassador Registration Link</p>
              <p style={{fontSize:"0.82rem"}}>Share this so ambassadors can submit for verification and approval.</p>
              <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center",flexWrap:"wrap" as const}}>
                <span style={{...s.link,fontSize:"0.85rem"}}>{base}/register</span>
                <button style={{...s.cpBtn,...(copied==="rl"?s.cpDone:{})}} onClick={()=>copy(`${base}/register`,"rl")}>{copied==="rl"?"Copied":"Copy Link"}</button>
              </div>
            </div>
          </div>

          {/* Tracking settings */}
          {/* Mobile admin secret prompt — shown when secret appears empty */}
          {!secret&&(
            <div style={{background:"#fffbeb",border:`1.5px solid ${C.yellowDark}`,borderRadius:8,padding:"14px 16px",marginBottom:16,display:"flex",gap:12,alignItems:"flex-start",flexWrap:"wrap" as const}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:C.greenDark,fontSize:"0.88rem",marginBottom:6}}>Admin Secret Required</div>
                <p style={{fontSize:"0.82rem",color:"#555",lineHeight:1.6,margin:"0 0 10px"}}>
                  Enter your admin secret to enable Approve, Reject, Log Order, and Broadcast on this device. This must be set on every device you use.
                </p>
                <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                  <input
                    style={{...s.fInp,maxWidth:220,padding:"8px 12px"}}
                    type="password"
                    placeholder="Enter admin secret…"
                    value={tempSecret}
                    onChange={e=>setTempSecret(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&tempSecret){setAdminSecret(tempSecret);setTempSecret("");}}}
                  />
                  <button
                    style={{...s.actBtn,background:C.greenDark,color:C.yellow,padding:"8px 16px",fontSize:"0.82rem"}}
                    onClick={()=>{if(tempSecret){setAdminSecret(tempSecret);setTempSecret("");}}}
                  >Save Secret</button>
                </div>
              </div>
            </div>
          )}

          <div style={{...s.settBox,marginBottom:16}}>
            <button style={s.settToggle} onClick={()=>setSettOpen(o=>!o)}>Tracking Settings {settOpen?"▲":"▼"}</button>
            {settOpen&&(
              <div style={{padding:"20px 18px"}}>
                <div style={{marginBottom:12}}>
                  <label style={s.fLabel}>Admin Secret</label>
                  <input style={s.fInp} type="password" placeholder="Must match ADMIN_SECRET in Vercel" value={secret} onChange={e=>setAdminSecret(e.target.value)}/>
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
                <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                  <button style={{...s.actBtn,background:C.green,color:C.white}} onClick={()=>{setSettOpen(false);loadStats();loadPending();}}>Save &amp; Refresh</button>
                  <TestEmailButton secret={secret} C={C} s={s}/>
                </div>
              </div>
            )}
          </div>

          {sLoad&&<div style={{...s.banner,borderColor:C.yellowDark,color:C.greenDark,marginBottom:16}}>Loading tracking data…</div>}
          {sErr&&!sLoad&&<div style={{...s.banner,borderColor:C.red,background:C.redLight,color:C.red,marginBottom:16}}>❌ {sErr} <button style={{marginLeft:12,background:"none",border:`1px solid ${C.red}`,color:C.red,borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:"0.8rem"}} onClick={loadStats}>Retry</button></div>}

          <div style={{...s.controls,marginBottom:14}}>
            <input style={s.search} placeholder="Search ambassadors…" value={tSearch} onChange={e=>setTSearch(e.target.value)}/>
            <button style={{...s.actBtn,background:C.greenDark,color:C.yellow}} onClick={()=>{loadStats();loadPending();}} disabled={sLoad}>↻ Refresh</button>
          </div>

          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  {["#","Ambassador","Type","Clicks","Orders","Conv %","Email Status","Actions"].map(h=>(
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
                    <td style={s.td}><span style={{...s.badge,background:tColor,color:tText}}>{row.kind==="core"?"Core":row.kind==="sub"?"Sub":"General"}</span></td>
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
                    <td style={s.td}>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
                        <button style={{...s.cpBtn,background:C.greenDark,color:C.yellow,border:"none"}} onClick={()=>openLog(row.id,row.name)}>Log</button>
                        <button style={{...s.cpBtn,background:row.stat.email?C.green:"#e0e0e0",color:row.stat.email?C.white:"#aaa",border:"none",cursor:row.stat.email?"pointer":"not-allowed"}}
                          onClick={()=>{if(row.stat.email)openMessage(row.id,row.name);}}
                          title={row.stat.email?"Send a direct message":"Ambassador must register their email first"}>
                          Message
                        </button>
                      </div>
                    </td>
                  </tr>
                );})}
                {tRows.length===0&&!sLoad&&<tr><td colSpan={8} style={s.empty}>No ambassadors found. Stats appear once links are clicked.</td></tr>}
              </tbody>
            </table>
          </div>
          <p style={s.footer}>{tRows.length} ambassadors · Conv% = Orders ÷ Clicks · Click Refresh for latest data</p>

          {/* Broadcast message */}
          <div style={{...s.settBox,marginTop:24}}>
            <button style={s.settToggle} onClick={()=>setBcMsg(p=>p===""?"open":"")}>
              Broadcast Message to All Ambassadors {bcMsg===""?"▼":"▲"}
            </button>
            {bcMsg!==""&&(
              <div style={{padding:"20px 18px"}}>
                <p style={{fontSize:"0.83rem",color:"#666",marginBottom:16,lineHeight:1.6}}>
                  Sends an email to all <strong>approved</strong> ambassadors who have registered. Use this for announcements, updates, or important notices.
                </p>
                <div style={{marginBottom:12}}>
                  <label style={s.fLabel}>Subject *</label>
                  <input style={s.fInp} placeholder="e.g. Important Update from EduCraft" value={bcSubject} onChange={e=>setBcSubject(e.target.value)}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={s.fLabel}>Message *</label>
                  <textarea style={{...s.fInp,height:140,resize:"vertical" as const,fontFamily:"inherit"}} placeholder="Type your message here. Use line breaks for paragraphs." value={bcMessage} onChange={e=>setBcMessage(e.target.value)}/>
                </div>
                <p style={{fontSize:"0.76rem",color:"#aaa",marginBottom:14}}>Note: Images, files, and videos cannot be attached via email here. For rich media, include a link in your message text.</p>
                {bcSt!=="idle"&&bcMsg!=="open"&&<div style={{...s.banner,borderColor:bcSt==="fail"?C.red:C.green,background:bcSt==="fail"?C.redLight:C.white,color:bcSt==="fail"?C.red:C.greenDark,marginBottom:14}}>{bcMsg}</div>}
                <button style={{...s.actBtn,background:bcSt==="ok"?C.green:C.greenDark,color:C.yellow,opacity:bcSt==="busy"?0.7:1}} onClick={sendBroadcast} disabled={bcSt==="busy"||bcSt==="ok"}>
                  {bcSt==="busy"?"Sending…":bcSt==="ok"?"Sent":"Send to All Ambassadors"}
                </button>
                {bcSt==="ok"&&<button style={{...s.actBtn,background:C.milk,color:C.greenDark,marginLeft:8,border:`1.5px solid ${C.milkDark}`}} onClick={()=>{setBcSt("idle");setBcSubject("");setBcMessage("");setBcMsg("open");}}>New Message</button>}
              </div>
            )}
          </div>
        </>)}

        {/* ════ MANAGE ════ */}
        {tab==="manage"&&(<>
          <div style={s.secLabel}>Manage Ambassador Slots</div>
          <div style={s.info}><div><p style={{fontSize:"0.85rem",lineHeight:1.7}}>Edit or add slots — changes apply instantly to all tabs. Click <strong>Deploy to GitHub</strong> to push live (approx. 30 seconds).</p></div></div>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap" as const,alignItems:"center"}}>
            <input style={{...s.search,maxWidth:260}} placeholder="Search slots…" value={mSearch} onChange={e=>setMSearch(e.target.value)}/>
            <button style={{...s.actBtn,background:C.green,color:C.white}} onClick={()=>{setNewId(nextId(data.slots));setNewName("");setNewSchool("");setNewSt("active");setAddErr("");setAddOpen(true);}}>Add Ambassador</button>
            <button
              style={{...s.actBtn,marginLeft:"auto",color:C.yellow,
                background:dep==="ok"&&vercelState==="ready"?C.green:dep==="fail"||vercelState==="error"?C.red:dep==="busy"||vercelState==="building"||vercelState==="queued"||vercelState==="pushing"?"#2563eb":C.greenDark,
                opacity:dep==="busy"?0.8:1}}
              onClick={doDeploy} disabled={dep==="busy"}>
              {dep==="busy"?"Deploying…":dep==="ok"&&vercelState==="ready"?"Live on Vercel":dep==="fail"?"Retry":"Deploy to GitHub"}
            </button>
          </div>

          {/* Live Vercel Status Bar */}
          {vercelState!=="idle"&&(
            <div style={{marginBottom:16,borderRadius:10,overflow:"hidden",border:`1.5px solid ${vercelState==="ready"?C.green:vercelState==="error"?C.red:vercelState==="building"?"#2563eb":"#E0B846"}`}}>
              {/* Progress header */}
              <div style={{
                background:vercelState==="ready"?C.green:vercelState==="error"?C.red:vercelState==="building"?"#2563eb":"#E0B846",
                padding:"10px 16px",display:"flex",alignItems:"center",gap:10
              }}>
                {/* Animated spinner for in-progress states */}
                {(vercelState==="pushing"||vercelState==="queued"||vercelState==="building")&&(
                  <div style={{width:16,height:16,border:"2.5px solid rgba(255,255,255,0.4)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>
                )}
                {vercelState==="ready"&&<span style={{color:"#fff",fontSize:"1rem"}}>✓</span>}
                {vercelState==="error"&&<span style={{color:"#fff",fontSize:"1rem"}}>✕</span>}
                <span style={{color:"#fff",fontWeight:700,fontSize:"0.88rem"}}>
                  {vercelState==="pushing"?"Pushing to GitHub…":
                   vercelState==="queued"?"Vercel: Deployment queued…":
                   vercelState==="building"?"Vercel: Building…":
                   vercelState==="ready"?"Vercel: Deployment live":
                   "Vercel: Build error"}
                </span>
                <button style={{marginLeft:"auto",background:"none",border:"none",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:"0.9rem"}} onClick={()=>{setVercelState("idle");setVercelMsg("");}}>✕</button>
              </div>
              {/* Progress steps */}
              <div style={{background:C.white,padding:"12px 16px"}}>
                <div style={{display:"flex",gap:0,marginBottom:8}}>
                  {[
                    {key:"pushing",  label:"Push to GitHub"},
                    {key:"queued",   label:"Vercel Queue"},
                    {key:"building", label:"Build"},
                    {key:"ready",    label:"Live"},
                  ].map((step,i)=>{
                    const order=["pushing","queued","building","ready","error"];
                    const stepIdx=order.indexOf(step.key);
                    const curIdx=order.indexOf(vercelState==="error"?"error":vercelState);
                    const done=curIdx>stepIdx||(vercelState==="ready"&&stepIdx<=3);
                    const active=vercelState===step.key;
                    const failed=vercelState==="error";
                    return(
                      <div key={step.key} style={{flex:1,display:"flex",flexDirection:"column" as const,alignItems:"center",gap:4}}>
                        <div style={{display:"flex",alignItems:"center",width:"100%"}}>
                          {i>0&&<div style={{flex:1,height:2,background:done?C.green:C.milkDark,transition:"background 0.4s"}}/>}
                          <div style={{
                            width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:"0.72rem",fontWeight:700,flexShrink:0,
                            background:failed&&active?"#ef4444":done?C.green:active?"#2563eb":C.milkDark,
                            color:done||active?"#fff":"#aaa",
                            transition:"all 0.3s"
                          }}>
                            {done&&!active?"✓":failed&&active?"✕":i+1}
                          </div>
                          {i<3&&<div style={{flex:1,height:2,background:done?C.green:C.milkDark,transition:"background 0.4s"}}/>}
                        </div>
                        <span style={{fontSize:"0.68rem",color:done?C.green:active?"#2563eb":"#aaa",fontWeight:done||active?700:400,textAlign:"center" as const}}>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
                {vercelMsg&&<p style={{fontSize:"0.78rem",color:vercelState==="error"?C.red:vercelState==="ready"?C.green:"#555",margin:0,lineHeight:1.5}}>{vercelMsg}</p>}
                {vercelState==="error"&&(
                  <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer"
                    style={{display:"inline-block",marginTop:8,fontSize:"0.78rem",color:"#2563eb",textDecoration:"underline"}}>
                    Open Vercel Dashboard →
                  </a>
                )}
              </div>
            </div>
          )}

          {/* CSS for spinner */}
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

          {/* GitHub settings */}
          <div style={{...s.settBox,marginBottom:20}}>
            <button style={s.settToggle} onClick={()=>setGhOpen(o=>!o)}>GitHub Deploy Settings {ghOpen?"▲":"▼"}</button>
            {ghOpen&&(
              <div style={{padding:"20px 18px"}}>
                <div style={{fontSize:"0.78rem",color:C.greenDark,fontWeight:700,marginBottom:12}}>GitHub Settings</div>
                {([{l:"GitHub Username",k:"owner",p:"e.g. PrinceAmadin"},{l:"Repository Name",k:"repo",p:"e.g. EduCraft-Ambassador"},{l:"GitHub Personal Access Token",k:"token",p:"ghp_xxxx…"}] as const).map(f=>(
                  <div key={f.k} style={{marginBottom:12}}>
                    <label style={s.fLabel}>{f.l}</label>
                    <input style={s.fInp} type={f.k==="token"?"password":"text"} placeholder={f.p} value={gh[f.k]} onChange={e=>setGh({...gh,[f.k]:e.target.value})}/>
                  </div>
                ))}
                <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.milkDark}`}}>
                  <div style={{fontSize:"0.78rem",color:C.greenDark,fontWeight:700,marginBottom:8}}>Vercel Settings (for live deploy status)</div>
                  <div style={{background:C.milk,border:`1px solid ${C.milkDark}`,borderLeft:`3px solid #2563eb`,borderRadius:4,padding:"10px 14px",marginBottom:12,fontSize:"0.78rem",color:"#555",lineHeight:1.7}}>
                    To get your Vercel token:<br/>
                    1. Go to <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" style={{color:"#2563eb"}}>vercel.com/account/tokens</a><br/>
                    2. Click "Create" → name it "EduCraft" → copy the token<br/>
                    3. Paste it below. Your project name is shown in Vercel dashboard URL.
                  </div>
                  <div style={{marginBottom:12}}>
                    <label style={s.fLabel}>Vercel API Token</label>
                    <input style={s.fInp} type="password" placeholder="Paste your Vercel token here" value={gh.vercelToken||""} onChange={e=>setGh({...gh,vercelToken:e.target.value})}/>
                  </div>
                  <div style={{marginBottom:12}}>
                    <label style={s.fLabel}>Vercel Project Name</label>
                    <input style={s.fInp} placeholder="e.g. educraft-ambassador" value={gh.vercelProject||""} onChange={e=>setGh({...gh,vercelProject:e.target.value})}/>
                  </div>
                </div>
                <button style={{...s.actBtn,background:C.green,color:C.white}} onClick={()=>{lsSet(LS_G,gh);setGhOpen(false);setDepMsg("Settings saved.");}}>Save All Settings</button>
              </div>
            )}
          </div>

          {resetMsg&&<div style={{...s.banner,borderColor:resetSt==="fail"?C.red:C.green,background:resetSt==="fail"?C.redLight:C.white,color:resetSt==="fail"?C.red:C.greenDark,marginBottom:16}}>{resetMsg}</div>}
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr style={s.thead}>{["Slot ID","Name","School","Status","Edit","Reset Reg."].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {mRows.map(([id,sl],i)=>(
                  <tr key={id} style={{...s.tr,background:i%2===0?C.white:C.milk}}>
                    <td style={s.td}><span style={s.slotId}>EduCraftA-{id}</span></td>
                    <td style={s.td}>{sl.name?<strong style={{color:C.greenDark}}>{sl.name}</strong>:<em style={{color:"#bbb"}}>— Vacant —</em>}</td>
                    <td style={s.td}><span style={s.schoolTag}>{sl.school||"—"}</span></td>
                    <td style={s.td}><span style={{...s.badge,background:sl.status==="active"?C.green:C.yellowDark,color:sl.status==="active"?C.white:C.greenDark}}>{sl.status==="active"?"Active":"Vacant"}</span></td>
                    <td style={s.td}><button style={s.cpBtn} onClick={()=>startEdit(id)}>Edit</button></td>
                    <td style={s.td}><button style={{...s.cpBtn,fontSize:"0.76rem",color:"#888",borderColor:"#ddd"}} onClick={()=>{setResetId(id);setResetSt("idle");setResetMsg("");}}>Reset</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{...s.footer,marginTop:12}}>{Object.keys(data.slots).length} slots · Edits are local · Deploy to push live</p>

          {/* ── Core Ambassadors in Manage ────────────────────────────── */}
          <div style={{marginTop:32}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap" as const,gap:8}}>
              <div style={s.secLabel}>Core Ambassadors (ECCA) — Manage</div>
              <button style={{...s.actBtn,background:C.green,color:C.white,padding:"8px 16px",fontSize:"0.82rem"}} onClick={()=>{setNcId(nextEccaId());setNcName("");setNcSchool("");setNcPct(10);setNcErr("");setAddCoreOpen(true);}}>Add Core Ambassador</button>
            </div>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead><tr style={s.thead}>{["ID","Name","School","Status","Edit","Reset"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>{data.coreAmbassadors.map((a,i)=>(
                  <tr key={a.id} style={{...s.tr,background:i%2===0?C.white:C.milk}}>
                    <td style={s.td}><span style={s.slotId}>{a.id}</span></td>
                    <td style={s.td}><strong style={{color:C.greenDark}}>{a.name||<em style={{color:"#bbb"}}>Vacant</em>}</strong></td>
                    <td style={s.td}><span style={s.schoolTag}>{a.school||"—"}</span></td>
                    <td style={s.td}><span style={{...s.badge,background:(a.status??"active")==="active"?C.green:C.yellowDark,color:(a.status??"active")==="active"?C.white:C.greenDark}}>{(a.status??"active")==="active"?"Active":"Vacant"}</span></td>
                    <td style={s.td}><button style={s.cpBtn} onClick={()=>openEditCore(a)}>Edit</button></td>
                    <td style={s.td}><button style={{...s.cpBtn,fontSize:"0.76rem",color:"#888",borderColor:"#ddd"}} onClick={()=>{setResetId(a.id);setResetSt("idle");setResetMsg("");}}>Reset</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          {/* ── Sub Ambassadors in Manage ─────────────────────────────── */}
          <div style={{marginTop:24}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap" as const,gap:8}}>
              <div style={s.secLabel}>Sub Ambassadors (ECSA) — Manage</div>
              <button style={{...s.actBtn,background:C.green,color:C.white,padding:"8px 16px",fontSize:"0.82rem"}} onClick={()=>{setNsId("");setNsName("");setNsSchool("");setNsCoreId("");setNsErr("");setAddSubOpen(true);}}>Add Sub Ambassador</button>
            </div>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead><tr style={s.thead}>{["ID","Name","School","Core","Status","Edit","Reset"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>{data.subAmbassadors.map((a,i)=>{const core=data.coreAmbassadors.find(c=>c.id===a.coreId);return(
                  <tr key={a.id} style={{...s.tr,background:i%2===0?C.white:C.milk}}>
                    <td style={s.td}><span style={s.slotId}>{a.id}</span></td>
                    <td style={s.td}><strong style={{color:C.greenDark}}>{a.name||<em style={{color:"#bbb"}}>Vacant</em>}</strong></td>
                    <td style={s.td}><span style={s.schoolTag}>{a.school||"—"}</span></td>
                    <td style={s.td}><span style={{color:C.green,fontSize:"0.8rem"}}>{core?.name??a.coreId}</span></td>
                    <td style={s.td}><span style={{...s.badge,background:(a.status??"active")==="active"?C.green:C.yellowDark,color:(a.status??"active")==="active"?C.white:C.greenDark}}>{(a.status??"active")==="active"?"Active":"Vacant"}</span></td>
                    <td style={s.td}><button style={s.cpBtn} onClick={()=>openEditSub(a)}>Edit</button></td>
                    <td style={s.td}><button style={{...s.cpBtn,fontSize:"0.76rem",color:"#888",borderColor:"#ddd"}} onClick={()=>{setResetId(a.id);setResetSt("idle");setResetMsg("");}}>Reset</button></td>
                  </tr>
                );})}
                {data.subAmbassadors.length===0&&<tr><td colSpan={7} style={s.empty}>No sub-ambassadors yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Registered Emails ─────────────────────────────────────── */}
          <RegisteredEmails stats={stats} allRows={tRows} secret={secret}/>

          {/* ── Payment Records ───────────────────────────────────────── */}
          <div style={{marginTop:32}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap" as const,gap:8}}>
              <div style={s.secLabel}>Payment Records — Ambassador Bank Details</div>
              <button style={{...s.actBtn,background:C.greenDark,color:C.yellow,fontSize:"0.82rem"}} onClick={loadPaymentRecords} disabled={payLoading}>
                {payLoading?"Loading…":"↻ Refresh"}
              </button>
            </div>
            <div style={{...s.info,marginBottom:16}}>
              <div style={{fontSize:"0.84rem",lineHeight:1.7,color:C.greenDark}}>
                Bank details collected from ambassador applications. Use these for commission payments.
                You can also manually add or update records for ambassadors who shared their details via WhatsApp.
              </div>
            </div>

            {/* Add manual payment record */}
            <div style={{...s.settBox,marginBottom:16}}>
              <button style={s.settToggle} onClick={()=>{setEditPayId(p=>p==="manual"?null:"manual");setPayForm({});setPaySt("idle");setPayMsg("");}}>
                Add / Update Payment Record Manually {editPayId==="manual"?"▲":"▼"}
              </button>
              {editPayId==="manual"&&(
                <div style={{padding:"20px 18px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12,marginBottom:14}}>
                    {[
                      {l:"Slot ID *",       k:"slotId",         p:"e.g. 051"},
                      {l:"Full Name",        k:"name",           p:"Ambassador's name"},
                      {l:"Bank Name",        k:"bankName",       p:"e.g. Access Bank"},
                      {l:"Account Number",   k:"accountNumber",  p:"10-digit account no."},
                      {l:"Account Name",     k:"accountName",    p:"Name on account"},
                      {l:"Email",            k:"email",          p:"ambassador@email.com"},
                      {l:"Phone",            k:"phone",          p:"08012345678"},
                      {l:"University",       k:"universityFull", p:"Full university name"},
                      {l:"University Abbr.", k:"universityAbbr", p:"e.g. UNIBEN"},
                    ].map(f=>(
                      <div key={f.k}>
                        <label style={s.fLabel}>{f.l}</label>
                        <input style={s.fInp} placeholder={f.p}
                          value={(payForm as Record<string,string>)[f.k]??""}
                          onChange={e=>setPayForm(p=>({...p,[f.k]:e.target.value}))}/>
                      </div>
                    ))}
                  </div>
                  {payMsg&&<div style={{...s.banner,borderColor:paySt==="fail"?C.red:C.green,background:paySt==="fail"?C.redLight:C.white,color:paySt==="fail"?C.red:C.greenDark,marginBottom:12}}>{payMsg}</div>}
                  <button style={{...s.actBtn,background:paySt==="ok"?C.green:C.greenDark,color:C.yellow,opacity:paySt==="busy"?0.7:1}}
                    onClick={()=>{if((payForm as Record<string,string>).slotId){setEditPayId("manual");savePaymentRecord();}else setPayMsg("Slot ID is required.")}}
                    disabled={paySt==="busy"||paySt==="ok"}>
                    {paySt==="busy"?"Saving…":paySt==="ok"?"Saved!":"Save Record"}
                  </button>
                </div>
              )}
            </div>

            {paymentRecords.length===0&&!payLoading&&(
              <div style={{background:C.milk,border:`1px solid ${C.milkDark}`,borderRadius:10,padding:"28px 20px",textAlign:"center" as const,color:"#aaa",fontSize:"0.85rem"}}>
                No payment records yet. Records are created automatically when ambassador applications are approved.
              </div>
            )}
            {paymentRecords.length>0&&(
              <div style={{...s.tableWrap}}>
                <table style={{...s.table,minWidth:700}}>
                  <thead><tr style={s.thead}>{["Slot","Name","Bank","Account No.","Account Name","University","Edit"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>{paymentRecords.map((rec,i)=>(
                    <tr key={rec.slotId} style={{...s.tr,background:i%2===0?C.white:C.milk}}>
                      <td style={s.td}><span style={s.slotId}>EduCraftA-{rec.slotId}</span></td>
                      <td style={s.td}><strong style={{color:C.greenDark}}>{rec.name||"—"}</strong></td>
                      <td style={s.td}><span style={{fontSize:"0.84rem"}}>{rec.bankName||"—"}</span></td>
                      <td style={s.td}><span style={{fontFamily:"monospace",color:C.green,fontSize:"0.84rem"}}>{rec.accountNumber||"—"}</span></td>
                      <td style={s.td}><span style={{fontSize:"0.84rem"}}>{rec.accountName||"—"}</span></td>
                      <td style={s.td}><span style={s.schoolTag}>{rec.universityAbbr||"—"}</span></td>
                      <td style={s.td}>
                        <button style={s.cpBtn} onClick={()=>{
                          setEditPayId(rec.slotId);
                          setPayForm({...rec});
                          setPaySt("idle");setPayMsg("");
                        }}>Edit</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </>)}

        <p style={s.footer}>EduCraft Ambassador Panel · Powered by Vercel</p>
      </main>

      {/* ── Edit Pending Registration Overlay ───────────────────────────────── */}
      {editPendingId&&(
        <div style={s.overlay} onClick={e=>{if(e.target===e.currentTarget){setEditPendingId(null);setEpSt("idle");}}}>
          <div style={{...s.overlayBox,maxWidth:520}}>
            <div style={s.overlayHead}>
              <div>
                <div style={s.overlayTitle}>Edit Pending Registration</div>
                <div style={s.overlaySub}>Original Slot ID: {editPendingId}</div>
              </div>
              <button style={s.overlayClose} onClick={()=>{setEditPendingId(null);setEpSt("idle");}}>✕</button>
            </div>

            {/* Original vs corrected notice */}
            <div style={{background:C.milk,border:`1px solid ${C.milkDark}`,borderLeft:`3px solid ${C.yellowDark}`,borderRadius:4,padding:"12px 14px",marginBottom:18,fontSize:"0.82rem",color:C.greenDark,lineHeight:1.7}}>
              <strong>Admin correction mode.</strong> Update any details that are incorrect or misleading. A reason for change is required so there is an audit trail if the ambassador queries the edit.
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <label style={s.fLabel}>Slot ID *</label>
                <input style={s.fInp} value={epSlotId} onChange={e=>setEpSlotId(e.target.value)} placeholder="e.g. 007"/>
                <p style={{fontSize:"0.72rem",color:"#aaa",marginTop:4}}>Changing this moves the record to the new slot.</p>
              </div>
              <div>
                <label style={s.fLabel}>School</label>
                <input style={s.fInp} value={epSchool} onChange={e=>setEpSchool(e.target.value)} placeholder="e.g. UNIBEN"/>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={s.fLabel}>Full Name *</label>
                <input style={s.fInp} value={epName} onChange={e=>setEpName(e.target.value)} placeholder="Ambassador's full name"/>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={s.fLabel}>Email Address *</label>
                <input style={s.fInp} type="email" value={epEmail} onChange={e=>setEpEmail(e.target.value)} placeholder="ambassador@example.com"/>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={{...s.fLabel,color:C.red}}>Reason for Change *</label>
                <textarea
                  style={{...s.fInp,height:80,resize:"vertical" as const,fontFamily:"inherit"}}
                  placeholder="e.g. Ambassador entered wrong slot ID — corrected to match our records. School updated from EUI to UNIBEN per verified student ID."
                  value={epReason}
                  onChange={e=>setEpReason(e.target.value)}
                />
                <p style={{fontSize:"0.72rem",color:"#aaa",marginTop:4}}>This is stored in the audit log and visible to your admin team.</p>
              </div>
            </div>

            {epMsg&&<div style={{...s.banner,borderColor:epSt==="fail"?C.red:C.green,background:epSt==="fail"?C.redLight:C.white,color:epSt==="fail"?C.red:C.greenDark,marginBottom:14}}>{epMsg}</div>}

            <div style={{display:"flex",gap:8}}>
              <button
                style={{...s.actBtn,background:epSt==="ok"?C.green:C.greenDark,color:C.yellow,flex:1,opacity:epSt==="busy"?0.7:1}}
                onClick={saveEditPending}
                disabled={epSt==="busy"||epSt==="ok"}
              >
                {epSt==="busy"?"Saving…":epSt==="ok"?"Saved — Close when ready":"Save Corrections"}
              </button>
              <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>{setEditPendingId(null);setEpSt("idle");}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Payment Record Overlay ──────────────────────────────────────── */}
      {editPayId&&editPayId!=="manual"&&(
        <div style={s.overlay} onClick={e=>{if(e.target===e.currentTarget){setEditPayId(null);setPaySt("idle");}}}>
          <div style={{...s.overlayBox,maxWidth:540}}>
            <div style={s.overlayHead}>
              <div>
                <div style={s.overlayTitle}>Edit Payment Record</div>
                <div style={s.overlaySub}>EduCraftA-{editPayId} — changes are saved to the payment database only</div>
              </div>
              <button style={s.overlayClose} onClick={()=>{setEditPayId(null);setPaySt("idle");}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              {[
                {l:"Full Name",        k:"name",           p:"Ambassador's name"},
                {l:"Bank Name",        k:"bankName",       p:"e.g. Access Bank"},
                {l:"Account Number",   k:"accountNumber",  p:"10-digit account no."},
                {l:"Account Name",     k:"accountName",    p:"Name on account"},
                {l:"Email",            k:"email",          p:"ambassador@email.com"},
                {l:"Phone",            k:"phone",          p:"08012345678"},
                {l:"University",       k:"universityFull", p:"Full university name"},
                {l:"University Abbr.", k:"universityAbbr", p:"e.g. UNIBEN"},
              ].map(f=>(
                <div key={f.k}>
                  <label style={s.fLabel}>{f.l}</label>
                  <input style={s.fInp} placeholder={f.p}
                    value={(payForm as Record<string,string>)[f.k]??""}
                    onChange={e=>setPayForm(p=>({...p,[f.k]:e.target.value}))}/>
                </div>
              ))}
            </div>
            {payMsg&&<div style={{...s.banner,borderColor:paySt==="fail"?C.red:C.green,background:paySt==="fail"?C.redLight:C.white,color:paySt==="fail"?C.red:C.greenDark,marginBottom:14}}>{payMsg}</div>}
            <div style={{display:"flex",gap:8}}>
              <button style={{...s.actBtn,background:paySt==="ok"?C.green:C.greenDark,color:C.yellow,flex:1,opacity:paySt==="busy"?0.7:1}}
                onClick={savePaymentRecord} disabled={paySt==="busy"||paySt==="ok"}>
                {paySt==="busy"?"Saving…":paySt==="ok"?"Saved!":"Save Changes"}
              </button>
              <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>{setEditPayId(null);setPaySt("idle");}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Core Ambassador Overlay ─────────────────────────────────────── */}
      {editCoreId&&(
        <div style={s.overlay} onClick={e=>{if(e.target===e.currentTarget){setEditCoreId(null);setEcErr("");}}}>
          <div style={{...s.overlayBox,maxWidth:500}}>
            <div style={s.overlayHead}>
              <div>
                <div style={s.overlayTitle}>Edit Core Ambassador</div>
                <div style={s.overlaySub}>{editCoreId}</div>
              </div>
              <button style={s.overlayClose} onClick={()=>{setEditCoreId(null);setEcErr("");}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div style={{gridColumn:"1/-1"}}>
                <label style={s.fLabel}>Full Name *</label>
                <input style={s.fInp} value={ecName} onChange={e=>setEcName(e.target.value)} placeholder="Full name"/>
              </div>
              <div>
                <label style={s.fLabel}>School</label>
                <input style={s.fInp} value={ecSchool} onChange={e=>setEcSchool(e.target.value)} placeholder="EUI, UNIBEN…"/>
              </div>
              <div>
                <label style={s.fLabel}>Base Commission %</label>
                <input style={s.fInp} type="number" min="1" max="100" value={ecPct} onChange={e=>setEcPct(parseInt(e.target.value)||10)}/>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={s.fLabel}>Status</label>
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  {(["active","vacant"] as const).map(st=>(
                    <button key={st} style={{...s.fBtn,...(ecStatus===st?{background:st==="active"?C.green:C.yellowDark,color:st==="active"?C.white:C.greenDark,border:"none"}:{})}} onClick={()=>setEcStatus(st)}>
                      {st==="active"?"Active":"Vacant"}
                    </button>
                  ))}
                </div>
                {ecStatus==="vacant"&&<p style={{fontSize:"0.76rem",color:"#888",marginTop:6}}>Marking as Vacant keeps the slot and link alive but signals the position is unoccupied.</p>}
              </div>
              <div style={{gridColumn:"1/-1",background:C.milk,border:`1px solid ${C.milkDark}`,borderLeft:`3px solid ${C.green}`,borderRadius:4,padding:"10px 14px",fontSize:"0.82rem",color:C.greenDark,lineHeight:1.7}}>
                Commission: <strong>{ecPct}%</strong> per direct job + <strong>3%</strong> per Sub Ambassador job.
              </div>
            </div>
            {ecErr&&<p style={{color:C.red,fontSize:"0.82rem",marginBottom:12}}>{ecErr}</p>}
            <div style={{display:"flex",gap:8}}>
              <button style={{...s.actBtn,background:C.green,color:C.white,flex:1}} onClick={saveEditCore}>Save Changes</button>
              <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>{setEditCoreId(null);setEcErr("");}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Sub Ambassador Overlay ──────────────────────────────────────── */}
      {editSubId&&(
        <div style={s.overlay} onClick={e=>{if(e.target===e.currentTarget){setEditSubId(null);setEsErr("");}}}>
          <div style={{...s.overlayBox,maxWidth:500}}>
            <div style={s.overlayHead}>
              <div>
                <div style={s.overlayTitle}>Edit Sub Ambassador</div>
                <div style={s.overlaySub}>{editSubId}</div>
              </div>
              <button style={s.overlayClose} onClick={()=>{setEditSubId(null);setEsErr("");}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div style={{gridColumn:"1/-1"}}>
                <label style={s.fLabel}>Full Name *</label>
                <input style={s.fInp} value={esName} onChange={e=>setEsName(e.target.value)} placeholder="Full name"/>
              </div>
              <div>
                <label style={s.fLabel}>School</label>
                <input style={s.fInp} value={esSchool} onChange={e=>setEsSchool(e.target.value)} placeholder="EUI, UNIBEN…"/>
              </div>
              <div>
                <label style={{...s.fLabel,color:C.green}}>Core Ambassador Slot ID *</label>
                <input style={s.fInp} value={esCoreId} onChange={e=>setEsCoreId(e.target.value)} placeholder="e.g. ECCA-001"/>
                {esCoreId.trim()&&(()=>{
                  const cid=esCoreId.trim().toUpperCase().startsWith("ECCA-")?esCoreId.trim().toUpperCase():`ECCA-${esCoreId.trim().toUpperCase()}`;
                  const core=data.coreAmbassadors.find(c=>c.id===cid);
                  return<p style={{fontSize:"0.72rem",marginTop:4,color:core?C.green:C.red}}>{core?`Found: ${core.name}`:"Not found"}</p>;
                })()}
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={s.fLabel}>Status</label>
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  {(["active","vacant"] as const).map(st=>(
                    <button key={st} style={{...s.fBtn,...(esStatus===st?{background:st==="active"?C.green:C.yellowDark,color:st==="active"?C.white:C.greenDark,border:"none"}:{})}} onClick={()=>setEsStatus(st)}>
                      {st==="active"?"Active":"Vacant"}
                    </button>
                  ))}
                </div>
                {esStatus==="vacant"&&<p style={{fontSize:"0.76rem",color:"#888",marginTop:6}}>Marking as Vacant keeps the slot alive but signals no one is assigned yet.</p>}
              </div>
              <div style={{gridColumn:"1/-1",background:C.milk,border:`1px solid ${C.milkDark}`,borderLeft:`3px solid ${C.yellowDark}`,borderRadius:4,padding:"10px 14px",fontSize:"0.82rem",color:C.greenDark,lineHeight:1.7}}>
                Reassigning to a different Core Ambassador updates the commission flow immediately.
                This Sub earns <strong>7%</strong> per job.
              </div>
            </div>
            {esErr&&<p style={{color:C.red,fontSize:"0.82rem",marginBottom:12}}>{esErr}</p>}
            <div style={{display:"flex",gap:8}}>
              <button style={{...s.actBtn,background:C.green,color:C.white,flex:1}} onClick={saveEditSub}>Save Changes</button>
              <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>{setEditSubId(null);setEsErr("");}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Core Ambassador Overlay ──────────────────────────────────────── */}
      {addCoreOpen&&(
        <div style={s.overlay} onClick={e=>{if(e.target===e.currentTarget){setAddCoreOpen(false);setNcErr("");}}}>
          <div style={{...s.overlayBox,maxWidth:500}}>
            <div style={s.overlayHead}>
              <div>
                <div style={s.overlayTitle}>Add Core Ambassador (ECCA)</div>
                <div style={s.overlaySub}>Senior partner who earns base % + 3% per Sub Ambassador job</div>
              </div>
              <button style={s.overlayClose} onClick={()=>{setAddCoreOpen(false);setNcErr("");}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <label style={s.fLabel}>ECCA Slot ID *</label>
                <input style={s.fInp} value={ncId} onChange={e=>setNcId(e.target.value)} placeholder="e.g. ECCA-006"/>
                <p style={{fontSize:"0.72rem",color:"#aaa",marginTop:4}}>Auto-filled — change if needed.</p>
              </div>
              <div>
                <label style={s.fLabel}>School</label>
                <input style={s.fInp} value={ncSchool} onChange={e=>setNcSchool(e.target.value)} placeholder="e.g. EUI, UNIBEN…"/>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={s.fLabel}>Full Name *</label>
                <input style={s.fInp} value={ncName} onChange={e=>setNcName(e.target.value)} placeholder="Core Ambassador's full name"/>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={s.fLabel}>Base Commission %</label>
                <div style={{display:"flex",gap:8,flexWrap:"wrap" as const,marginTop:4}}>
                  {[10,15,20,25].map(p=>(
                    <button key={p} style={{...s.fBtn,...(ncPct===p?{background:C.green,color:C.white,border:"none"}:{})}} onClick={()=>setNcPct(p)}>{p}%</button>
                  ))}
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:"0.8rem",color:"#888"}}>Custom:</span>
                    <input style={{...s.fInp,width:70,padding:"6px 10px"}} type="number" min="1" max="100"
                      value={ncPct} onChange={e=>setNcPct(parseInt(e.target.value)||10)}/>
                    <span style={{fontSize:"0.8rem",color:"#888"}}>%</span>
                  </div>
                </div>
                <div style={{marginTop:10,background:C.milk,border:`1px solid ${C.milkDark}`,borderLeft:`3px solid ${C.green}`,borderRadius:4,padding:"10px 14px",fontSize:"0.82rem",color:C.greenDark,lineHeight:1.7}}>
                  <strong>Commission structure:</strong> This Core Ambassador earns <strong>{ncPct}%</strong> per job they bring directly.
                  For every Sub Ambassador they manage, they earn an additional <strong>3%</strong> per Sub job
                  (Sub earns <strong>7%</strong>, Core earns <strong>3%</strong> from the same job).
                </div>
              </div>
            </div>
            {ncErr&&<p style={{color:C.red,fontSize:"0.82rem",marginBottom:12}}>{ncErr}</p>}
            <div style={{display:"flex",gap:8}}>
              <button style={{...s.actBtn,background:C.green,color:C.white,flex:1}} onClick={saveNewCore}>Add Core Ambassador</button>
              <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>{setAddCoreOpen(false);setNcErr("");}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Sub Ambassador Overlay ───────────────────────────────────────── */}
      {addSubOpen&&(
        <div style={s.overlay} onClick={e=>{if(e.target===e.currentTarget){setAddSubOpen(false);setNsErr("");}}}>
          <div style={{...s.overlayBox,maxWidth:500}}>
            <div style={s.overlayHead}>
              <div>
                <div style={s.overlayTitle}>Add Sub Ambassador (ECSA)</div>
                <div style={s.overlaySub}>Earns 7% per job — linked to a Core Ambassador who earns 3%</div>
              </div>
              <button style={s.overlayClose} onClick={()=>{setAddSubOpen(false);setNsErr("");}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div style={{gridColumn:"1/-1"}}>
                <label style={{...s.fLabel,color:C.red}}>Core Ambassador Slot ID *</label>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <input style={{...s.fInp,flex:1}} value={nsCoreId} onChange={e=>{setNsCoreId(e.target.value);setNsId(e.target.value.trim()?nextEcsaId(e.target.value.trim().toUpperCase().startsWith("ECCA-")?e.target.value.trim().toUpperCase():`ECCA-${e.target.value.trim().toUpperCase()}`):"");}} placeholder="e.g. 001 or ECCA-001"/>
                </div>
                <p style={{fontSize:"0.72rem",color:"#888",marginTop:4}}>
                  {(()=>{
                    if(!nsCoreId.trim()) return null;
                    const cid=nsCoreId.trim().toUpperCase().startsWith("ECCA-")
                      ?nsCoreId.trim().toUpperCase()
                      :`ECCA-${nsCoreId.trim().toUpperCase()}`;
                    const found=data.coreAmbassadors.find(c=>c.id===cid);
                    return found
                      ?<span style={{color:C.green}}>Found: {found.name}</span>
                      :<span style={{color:C.red}}>Not found — check the Core (ECCA) tab</span>;
                  })()}
                </p>
              </div>
              <div>
                <label style={s.fLabel}>ECSA Slot ID</label>
                <input style={s.fInp} value={nsId} onChange={e=>setNsId(e.target.value)} placeholder="Auto-generated"/>
                <p style={{fontSize:"0.72rem",color:"#aaa",marginTop:4}}>Leave blank to auto-generate.</p>
              </div>
              <div>
                <label style={s.fLabel}>School</label>
                <input style={s.fInp} value={nsSchool} onChange={e=>setNsSchool(e.target.value)} placeholder="e.g. EUI, UNIBEN…"/>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={s.fLabel}>Full Name *</label>
                <input style={s.fInp} value={nsName} onChange={e=>setNsName(e.target.value)} placeholder="Sub Ambassador's full name"/>
              </div>
              <div style={{gridColumn:"1/-1",background:C.milk,border:`1px solid ${C.milkDark}`,borderLeft:`3px solid ${C.yellowDark}`,borderRadius:4,padding:"10px 14px",fontSize:"0.82rem",color:C.greenDark,lineHeight:1.7}}>
                <strong>Fixed commission:</strong> Sub Ambassadors always earn <strong>7%</strong> per job they bring.
                Their linked Core Ambassador automatically earns <strong>3%</strong> for each of those jobs.
                The Sub's total % shows in the Core Ambassador's leaderboard.
              </div>
            </div>
            {nsErr&&<p style={{color:C.red,fontSize:"0.82rem",marginBottom:12}}>{nsErr}</p>}
            <div style={{display:"flex",gap:8}}>
              <button style={{...s.actBtn,background:C.green,color:C.white,flex:1}} onClick={saveNewSub}>Add Sub Ambassador</button>
              <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>{setAddSubOpen(false);setNsErr("");}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Ambassador Overlay ───────────────────────────────────────────── */}
      {addOpen&&(
        <div style={s.overlay} onClick={e=>{if(e.target===e.currentTarget){setAddOpen(false);setAddErr("");}}}>
          <div style={s.overlayBox}>
            <div style={s.overlayHead}>
              <div><div style={s.overlayTitle}>Add New Ambassador</div><div style={s.overlaySub}>New slot will appear instantly across all tabs</div></div>
              <button style={s.overlayClose} onClick={()=>{setAddOpen(false);setAddErr("");}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              {[{l:"Slot ID",v:newId,s:setNewId,p:"e.g. 067"},{l:"Full Name",v:newName,s:setNewName,p:"Ambassador's name"},{l:"School",v:newSchool,s:setNewSchool,p:"EUI, UNIBEN…"}].map(f=>(
                <div key={f.l} style={f.l==="School"?{gridColumn:"1/-1"}:{}}><label style={s.fLabel}>{f.l}</label><input style={s.fInp} value={f.v} onChange={e=>f.s(e.target.value)} placeholder={f.p}/></div>
              ))}
              <div style={{gridColumn:"1/-1"}}>
                <label style={s.fLabel}>Status</label>
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  {(["active","vacant"] as const).map(st=>(
                    <button key={st} style={{...s.fBtn,...(newSt===st?{background:st==="active"?C.green:C.yellowDark,color:st==="active"?C.white:C.greenDark,border:"none"}:{})}} onClick={()=>setNewSt(st)}>
                      {st==="active"?"Active":"Vacant"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {addErr&&<p style={{color:C.red,fontSize:"0.82rem",marginBottom:12}}>{addErr}</p>}
            <div style={{display:"flex",gap:8}}>
              <button style={{...s.actBtn,background:C.green,color:C.white,flex:1}} onClick={saveNew}>Add Ambassador</button>
              <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>{setAddOpen(false);setAddErr("");}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Ambassador Overlay ──────────────────────────────────────────── */}
      {editId&&(
        <div style={s.overlay} onClick={e=>{if(e.target===e.currentTarget)setEditId(null);}}>
          <div style={s.overlayBox}>
            <div style={s.overlayHead}>
              <div>
                <div style={s.overlayTitle}>Edit Slot</div>
                <div style={s.overlaySub}>EduCraftA-{editId}</div>
              </div>
              <button style={s.overlayClose} onClick={()=>setEditId(null)}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div><label style={s.fLabel}>Name</label><input style={s.fInp} value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Ambassador name"/></div>
              <div><label style={s.fLabel}>School</label><input style={s.fInp} value={editSchool} onChange={e=>setEditSchool(e.target.value)} placeholder="EUI, UNIBEN…"/></div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={s.fLabel}>Status</label>
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  {(["active","vacant"] as const).map(st=>(
                    <button key={st} style={{...s.fBtn,...(editSt===st?{background:st==="active"?C.green:C.yellowDark,color:st==="active"?C.white:C.greenDark,border:"none"}:{})}} onClick={()=>setEditSt(st)}>
                      {st==="active"?"Active":"Vacant"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...s.actBtn,background:C.green,color:C.white,flex:1}} onClick={saveEdit}>Save Changes</button>
              <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>setEditId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Registration Overlay ───────────────────────────────────────── */}
      {resetId&&(
        <div style={s.overlay} onClick={e=>{if(e.target===e.currentTarget){setResetId(null);setResetSt("idle");}}}>
          <div style={{...s.overlayBox,maxWidth:400}}>
            <div style={s.overlayHead}>
              <div>
                <div style={s.overlayTitle}>Reset Registration</div>
                <div style={s.overlaySub}>EduCraftA-{resetId}</div>
              </div>
              <button style={s.overlayClose} onClick={()=>{setResetId(null);setResetSt("idle");}}>✕</button>
            </div>
            <div style={{background:"#fef2f2",border:`1px solid #fca5a5`,borderRadius:8,padding:"14px 16px",marginBottom:16,fontSize:"0.86rem",color:"#7f1d1d",lineHeight:1.7}}>
              <strong>This will permanently clear:</strong><br/>
              — Registration profile &amp; email<br/>
              — All click counts<br/>
              — All logged orders &amp; order history<br/><br/>
              The slot itself stays. The new ambassador can register fresh.
            </div>
            {resetSt==="ok"&&<div style={{...s.banner,borderColor:C.green,background:C.white,color:C.greenDark,marginBottom:14}}>{resetMsg}</div>}
            {resetSt==="fail"&&<div style={{...s.banner,borderColor:C.red,background:C.redLight,color:C.red,marginBottom:14}}>{resetMsg}</div>}
            <div style={{display:"flex",gap:8}}>
              <button
                style={{...s.actBtn,background:resetSt==="ok"?C.green:C.red,color:C.white,flex:1,opacity:resetSt==="busy"?0.7:1}}
                onClick={()=>resetSlot(resetId)}
                disabled={resetSt==="busy"||resetSt==="ok"}
              >
                {resetSt==="busy"?"Clearing…":resetSt==="ok"?"Done — Close when ready":"Confirm Reset"}
              </button>
              <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>{setResetId(null);setResetSt("idle");}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Direct Message Overlay ───────────────────────────────────────────── */}
      {msgId&&(
        <div style={s.overlay} onClick={e=>{if(e.target===e.currentTarget){setMsgId(null);setMsgSt("idle");}}}>
          <div style={s.overlayBox}>
            <div style={s.overlayHead}>
              <div>
                <div style={s.overlayTitle}>Send Message</div>
                <div style={s.overlaySub}>{msgName} · {msgId}</div>
              </div>
              <button style={s.overlayClose} onClick={()=>{setMsgId(null);setMsgSt("idle");}}>✕</button>
            </div>
            <div style={{marginBottom:14}}>
              <label style={s.fLabel}>Title / Subject *</label>
              <input style={s.fInp} placeholder="e.g. Important Update, Well Done!, Action Required…"
                value={msgTitle} onChange={e=>setMsgTitle(e.target.value)}/>
            </div>
            <div style={{marginBottom:14}}>
              <label style={s.fLabel}>Message *</label>
              <textarea style={{...s.fInp,height:130,resize:"vertical" as const,fontFamily:"inherit"}}
                placeholder="Type your message here…"
                value={msgBody} onChange={e=>setMsgBody(e.target.value)}/>
            </div>
            {msgErr&&(
              <div style={{...s.banner,marginBottom:14,
                borderColor:msgSt==="fail"?C.red:msgSt==="ok"?C.green:C.yellowDark,
                background:msgSt==="fail"?C.redLight:C.white,
                color:msgSt==="fail"?C.red:C.greenDark}}>
                {msgErr}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button
                style={{...s.actBtn,background:msgSt==="ok"?C.green:C.greenDark,color:C.yellow,flex:1,opacity:msgSt==="busy"?0.7:1}}
                onClick={sendMessage} disabled={msgSt==="busy"||msgSt==="ok"}>
                {msgSt==="busy"?"Sending…":msgSt==="ok"?"Sent":"Send Message"}
              </button>
              <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}}
                onClick={()=>{setMsgId(null);setMsgSt("idle");setMsgErr("");}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Log Order Overlay Modal ──────────────────────────────────────────── */}
      {logId&&(
        <div style={s.overlay} onClick={e=>{if(e.target===e.currentTarget)setLogId(null);}}>
          <div style={s.overlayBox}>
            <div style={s.overlayHead}>
              <div>
                <div style={s.overlayTitle}>Log Order</div>
                <div style={s.overlaySub}>{logName} · {logId}</div>
              </div>
              <button style={s.overlayClose} onClick={()=>setLogId(null)}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
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
              <div style={{background:C.milk,border:`1px solid ${C.milkDark}`,borderLeft:`3px solid ${C.green}`,borderRadius:4,padding:"10px 14px",marginBottom:14,fontSize:"0.88rem",color:C.greenDark}}>
                Commission: <strong style={{color:C.green}}>{naira(commission)}</strong>
                <span style={{color:"#aaa",marginLeft:6}}>({pctNum}% of {naira(amtNum)})</span>
              </div>
            )}
            <div style={{marginBottom:14}}>
              <label style={s.fLabel}>Job Description (optional)</label>
              <input style={s.fInp} placeholder="e.g. Final year project, Seminar paper…" value={logDesc} onChange={e=>setLogDesc(e.target.value)}/>
            </div>
            {logMsg&&<div style={{...s.banner,marginBottom:14,borderColor:logSt==="fail"?C.red:C.green,background:logSt==="fail"?C.redLight:C.white,color:logSt==="fail"?C.red:C.greenDark}}>{logMsg}</div>}
            <div style={{display:"flex",gap:8}}>
              <button style={{...s.actBtn,background:logSt==="ok"?C.green:C.greenDark,color:C.yellow,opacity:logSt==="busy"?0.7:1,flex:1}} onClick={logOrder} disabled={logSt==="busy"||logSt==="ok"}>
                {logSt==="busy"?"Logging…":logSt==="ok"?"Logged — Close when ready":"Confirm Order"}
              </button>
              <button style={{...s.actBtn,background:C.milk,color:C.greenDark,border:`1.5px solid ${C.milkDark}`}} onClick={()=>setLogId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scroll Buttons ────────────────────────────────────────────────────── */}
      {scrollY>300&&(
        <button
          onClick={()=>window.scrollTo({top:0,behavior:"smooth"})}
          style={{position:"fixed",bottom:72,right:20,zIndex:900,width:40,height:40,borderRadius:"50%",background:C.greenDark,color:C.yellow,border:"none",cursor:"pointer",fontSize:"1.1rem",fontWeight:700,boxShadow:"0 2px 10px rgba(0,0,0,0.25)",display:"flex",alignItems:"center",justifyContent:"center"}}
          title="Back to top"
        >↑</button>
      )}
      {scrollY<100&&(
        <button
          onClick={()=>window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"})}
          style={{position:"fixed",bottom:24,right:20,zIndex:900,width:40,height:40,borderRadius:"50%",background:C.greenDark,color:C.yellow,border:"none",cursor:"pointer",fontSize:"1.1rem",fontWeight:700,boxShadow:"0 2px 10px rgba(0,0,0,0.25)",display:"flex",alignItems:"center",justifyContent:"center"}}
          title="Scroll to bottom"
        >↓</button>
      )}
    </div>
  );
}

function SC({label,v,clr,bg}:{label:string;v:number|string;clr:string;bg:string}){
  return<div style={{borderRadius:14,padding:"20px 22px",background:bg,border:`1.5px solid ${bg===C.milk?C.yellowDark:bg}`,boxShadow:"0 2px 8px rgba(0,0,0,.07)"}}>
    <div style={{fontSize:"2rem",fontWeight:900,color:clr,lineHeight:1}}>{v}</div>
    <div style={{fontSize:"0.7rem",color:clr,opacity:0.85,marginTop:6,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:"0.06em"}}>{label}</div>
  </div>;
}

// ── Test Email Button ─────────────────────────────────────────────────────────
function TestEmailButton({secret,C:CC,s:ss}:{secret:string;C:Record<string,string>;s:Record<string,React.CSSProperties>}){
  const[st,setSt]=useState<"idle"|"busy"|"ok"|"fail">("idle");
  const[msg,setMsg]=useState("");
  const test=async()=>{
    setSt("busy");setMsg("");
    try{
      const r=await fetch("/api/admin?action=test-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adminSecret:secret})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Failed");
      setSt("ok");setMsg(`OK · env: ${d.env}`);
    }catch(e){setSt("fail");setMsg((e as Error).message.substring(0,80));}
    setTimeout(()=>{setSt("idle");setMsg("");},7000);
  };
  return<div>
    <button style={{...ss.actBtn,background:st==="ok"?CC.green:st==="fail"?"#ef4444":"#555",color:CC.yellow,opacity:st==="busy"?0.7:1,fontSize:"0.82rem"}} onClick={test} disabled={st==="busy"}>
      {st==="busy"?"Sending…":st==="ok"?"Email OK":"Test Email"}
    </button>
    {msg&&<p style={{fontSize:"0.74rem",marginTop:5,color:st==="fail"?"#ef4444":CC.green,lineHeight:1.5,maxWidth:300}}>{msg}</p>}
  </div>;
}

// ── Registered Emails Section ─────────────────────────────────────────────────
function RegisteredEmails({stats:_,allRows,secret:__}:{stats:Record<string,Stat>;allRows:TRow[];secret:string}){
  const CC={green:"#12827c",greenDark:"#0D5753",yellow:"#fbdb21",milk:"#FFF9ED",milkDark:"#F0EBD8",white:"#ffffff",yellowDark:"#E0B846"};
  const registered=allRows.filter(r=>r.stat.email);
  const unregistered=allRows.filter(r=>!r.stat.email&&r.name);
  const[copied,setCopied]=useState(false);
  const allEmails=registered.map(r=>r.stat.email).filter(Boolean).join(", ");
  const copyAll=()=>{navigator.clipboard.writeText(allEmails);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  return(
    <div style={{marginTop:32}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap" as const,gap:8}}>
        <div style={{fontSize:"0.68rem",fontWeight:700,color:CC.green,textTransform:"uppercase" as const,letterSpacing:"0.12em"}}>Registered Emails — {registered.length} of {registered.length+unregistered.length} ambassadors</div>
        {registered.length>0&&<button style={{background:CC.green,color:CC.white,border:"none",borderRadius:6,padding:"6px 14px",fontSize:"0.78rem",cursor:"pointer",fontWeight:700}} onClick={copyAll}>{copied?"Copied":"Copy All Emails"}</button>}
      </div>
      {registered.length===0&&<div style={{background:CC.milk,border:`1px solid ${CC.milkDark}`,borderRadius:10,padding:"20px",textAlign:"center" as const,color:"#aaa",fontSize:"0.85rem"}}>No ambassadors have registered their email yet.</div>}
      {registered.length>0&&(
        <div style={{background:CC.white,border:`1.5px solid ${CC.milkDark}`,borderRadius:12,overflowX:"auto" as const}}>
          <table style={{width:"100%",borderCollapse:"collapse" as const,fontSize:"0.84rem",minWidth:500}}>
            <thead><tr style={{background:CC.greenDark}}>{["#","Name","Slot ID","Type","Email","Clicks","Orders"].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left" as const,fontSize:"0.67rem",fontWeight:700,color:CC.yellow,textTransform:"uppercase" as const,whiteSpace:"nowrap" as const}}>{h}</th>)}</tr></thead>
            <tbody>{registered.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:`1px solid ${CC.milkDark}`,background:i%2===0?CC.white:CC.milk}}>
                <td style={{padding:"10px 14px",color:"#bbb",fontSize:"0.78rem"}}>{i+1}.</td>
                <td style={{padding:"10px 14px"}}><strong style={{color:CC.greenDark}}>{r.name}</strong></td>
                <td style={{padding:"10px 14px",fontFamily:"monospace",color:CC.green,fontWeight:700,fontSize:"0.8rem"}}>{r.id}</td>
                <td style={{padding:"10px 14px"}}><span style={{fontSize:"0.72rem",fontWeight:700,padding:"3px 8px",borderRadius:999,background:r.kind==="core"?CC.yellow:r.kind==="sub"?"#e0f2fe":CC.milk,color:r.kind==="core"?CC.greenDark:r.kind==="sub"?"#0369a1":CC.green}}>{r.kind==="core"?"Core":r.kind==="sub"?"Sub":"General"}</span></td>
                <td style={{padding:"10px 14px",color:CC.green,fontSize:"0.82rem"}}>{r.stat.email}</td>
                <td style={{padding:"10px 14px",fontWeight:700,color:r.stat.clicks>0?CC.green:"#ccc"}}>{r.stat.clicks}</td>
                <td style={{padding:"10px 14px",fontWeight:700,color:r.stat.orders>0?CC.greenDark:"#ccc"}}>{r.stat.orders}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {unregistered.length>0&&(
        <div style={{marginTop:14}}>
          <div style={{fontSize:"0.68rem",fontWeight:700,color:"#aaa",textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:8}}>Not Yet Registered ({unregistered.length})</div>
          <div style={{display:"flex",flexWrap:"wrap" as const,gap:8}}>
            {unregistered.map(r=><span key={r.id} style={{background:"#f5f5f5",border:"1px solid #e0e0e0",borderRadius:6,padding:"4px 10px",fontSize:"0.78rem",color:"#888"}}>{r.name} <span style={{fontFamily:"monospace",fontSize:"0.7rem",color:"#bbb"}}>({r.id})</span></span>)}
          </div>
        </div>
      )}
    </div>
  );
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
  overlay:{position:"fixed" as const,inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16},
  overlayBox:{background:C.white,borderRadius:12,padding:"28px 28px 24px",maxWidth:480,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.25)",maxHeight:"90vh",overflowY:"auto" as const},
  overlayHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20},
  overlayTitle:{fontWeight:700,color:C.greenDark,fontSize:"1rem"},
  overlaySub:{fontSize:"0.82rem",color:C.green,marginTop:2},
  overlayClose:{background:"none",border:"none",fontSize:"1.1rem",cursor:"pointer",color:"#999",padding:"4px 8px",lineHeight:1},
};
