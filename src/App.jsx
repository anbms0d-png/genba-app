import { useState, useRef, useCallback, useEffect } from "react";
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  setDoc, getDoc, serverTimestamp, query, orderBy
} from "firebase/firestore";
import {
  ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject
} from "firebase/storage";
import { db, storage } from "./firebase.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESIGN TOKENS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const C = {
  accent:"#3DB87A", accentHover:"#35A46C", accentLight:"#EBF8F1",
  sidebar:"#1E2532", sidebarHover:"#2A3347",
  bg:"#F5F6F8", white:"#FFFFFF",
  border:"#E8EAED",
  text:"#1A1D23", textSub:"#6B7280", textMuted:"#9CA3AF",
  danger:"#EF4444", dangerLight:"#FEF2F2",
};

const ROLE_COLORS = {"現場監督":"#3DB87A","職長":"#4A9EE8","担当":"#E8944A","作業員":"#9C6FE8","安全管理":"#E84A7A","その他":"#6B7280"};
const ROLES = Object.keys(ROLE_COLORS);
const DAYS_JP   = ["日","月","火","水","木","金","土"];
const MONTHS_JP = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function emptyEvForm(date=""){return{date,text:"",siteId:"",time:"",staff:[],cars:[""],memo:""};}
function emptyMForm(){return{name:"",kana:"",role:"作業員",phone:"",company:"",color:"#6B7280"};}
const nowStr=()=>{const n=new Date();return`${n.getFullYear()}/${String(n.getMonth()+1).padStart(2,"0")}/${String(n.getDate()).padStart(2,"0")} ${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`;};
const fmtDK=(y,m,d)=>`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
const getDIM=(y,m)=>new Date(y,m+1,0).getDate();
const getFDOW=(y,m)=>new Date(y,m,1).getDay();
const TODAY = new Date();
const TOSTR = fmtDK(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SMALL COMPONENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function FocusInput({type="text",value,onChange,placeholder,onKeyDown,autoFocus,inlineStyle,wrapStyle={}}){
  const [focused,setFocused]=useState(false);const isEmpty=!value;
  const base={width:"100%",border:"none",outline:"none",fontSize:inlineStyle?11:12,color:C.text,background:"transparent",fontFamily:"'Noto Sans JP',sans-serif",caretColor:C.accent,padding:inlineStyle?"2px 6px":"7px 9px",height:inlineStyle?"100%":"auto",display:"block"};
  if(inlineStyle)return(<div style={{flex:1,position:"relative",display:"flex",alignItems:"stretch"}}><input type={type} value={value} onChange={onChange} onKeyDown={onKeyDown} autoFocus={autoFocus} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} style={{...base,backgroundColor:focused?"#FFFEF5":"transparent"}}/>{focused&&isEmpty&&<span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:C.accent,fontSize:14,fontWeight:300,pointerEvents:"none",animation:"cursorBlink 1s step-end infinite",lineHeight:1}}>|</span>}{focused&&isEmpty&&placeholder&&<span style={{position:"absolute",left:20,top:"50%",transform:"translateY(-50%)",color:"#C5C8CC",fontSize:10,pointerEvents:"none"}}>{placeholder}</span>}</div>);
  return(<div style={{position:"relative",...wrapStyle}}><input type={type} value={value} onChange={onChange} onKeyDown={onKeyDown} autoFocus={autoFocus} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} style={{...base,border:`1px solid ${focused?C.accent:C.border}`,background:focused?"#FFFEF5":C.bg,borderRadius:5,padding:"7px 9px",transition:"border-color 0.15s,background 0.15s"}}/>{focused&&isEmpty&&<span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:C.accent,fontSize:15,fontWeight:300,pointerEvents:"none",animation:"cursorBlink 1s step-end infinite",lineHeight:1}}>|</span>}{focused&&isEmpty&&placeholder&&<span style={{position:"absolute",left:22,top:"50%",transform:"translateY(-50%)",color:"#C5C8CC",fontSize:12,pointerEvents:"none"}}>{placeholder}</span>}</div>);
}

function ContextMenu({x,y,items,onClose}){
  useEffect(()=>{const h=()=>onClose();window.addEventListener("click",h);window.addEventListener("contextmenu",h);return()=>{window.removeEventListener("click",h);window.removeEventListener("contextmenu",h);};},[onClose]);
  const safeX = Math.min(x, window.innerWidth - 200);
  const safeY = Math.min(y, window.innerHeight - (items.length * 40 + 16));
  return(<div style={{position:"fixed",top:safeY,left:safeX,background:C.white,borderRadius:8,boxShadow:"0 8px 30px rgba(0,0,0,0.16)",border:`1px solid ${C.border}`,zIndex:9999,minWidth:170,padding:"4px 0",animation:"ctxAppear 0.12s ease"}}>{items.map((item,i)=>{if(item.divider)return<div key={i} style={{height:1,background:C.border,margin:"4px 0"}}/>;return(<button key={i} onClick={()=>{item.action();onClose();}} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 14px",border:"none",background:"transparent",cursor:"pointer",textAlign:"left",fontSize:12,fontWeight:500,color:item.danger?C.danger:C.text,fontFamily:"'Noto Sans JP',sans-serif"}} onMouseEnter={e=>e.currentTarget.style.background=item.danger?"#FEF2F2":"#F5F6F8"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{fontSize:14}}>{item.icon}</span>{item.label}</button>);})}</div>);
}

function ConfirmDialog({title,message,onConfirm,onCancel}){
  return(<Overlay onClick={onCancel}><Modal maxW={340} onClick={e=>e.stopPropagation()}><div style={{padding:"24px 20px 18px",textAlign:"center"}}><div style={{fontSize:32,marginBottom:12}}>🗑️</div><div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}}>{title}</div><div style={{fontSize:12,color:C.textSub,lineHeight:1.7,marginBottom:20}}>{message}</div><div style={{display:"flex",gap:8}}><button onClick={onCancel} style={{flex:1,padding:"10px",borderRadius:7,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:12,fontWeight:600,color:C.textSub}}>キャンセル</button><button onClick={onConfirm} style={{flex:1,padding:"10px",borderRadius:7,border:"none",background:C.danger,color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>削除する</button></div></div></Modal></Overlay>);
}

function LoadingSpinner({label="読み込み中..."}){
  return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:14,color:C.textMuted}}>
    <div style={{width:36,height:36,borderRadius:"50%",border:`3px solid ${C.border}`,borderTopColor:C.accent,animation:"spin 0.8s linear infinite"}}/>
    <span style={{fontSize:12}}>{label}</span>
  </div>);
}

function SyncBadge({syncing}){
  return(<div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:syncing?"#F59E0B":C.accent}}>
    <div style={{width:6,height:6,borderRadius:"50%",background:syncing?"#F59E0B":C.accent,animation:syncing?"syncPulse 1s ease infinite":""}}/>
    {syncing?"同期中...":"同期済み"}
  </div>);
}

const IST={width:"100%",padding:"7px 9px",borderRadius:5,border:`1px solid #E8EAED`,fontSize:12,outline:"none",color:"#1A1D23",background:"#F5F6F8",boxSizing:"border-box",caretColor:"#3DB87A"};
function Overlay({children,onClick}){return(<div onClick={onClick} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.44)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:14}}>{children}</div>);}
function Modal({children,maxW=460,maxH="88vh",onClick}){return(<div onClick={onClick} style={{background:C.bg,borderRadius:11,width:"100%",maxWidth:maxW,maxHeight:maxH,overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 65px rgba(0,0,0,0.22)",animation:"fsc 0.17s ease"}}>{children}</div>);}
function ModalHead({children}){return(<div style={{padding:"12px 15px",borderBottom:`1px solid ${C.border}`,background:C.white,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>{children}</div>);}
function CloseBtn({onClick}){return(<button onClick={onClick} style={{width:24,height:24,borderRadius:5,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer",fontSize:13,color:C.textSub,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>);}
function Toolbar({children}){return(<div style={{display:"flex",alignItems:"center",gap:7,padding:"9px 14px",borderBottom:`1px solid ${C.border}`,background:C.white,flexShrink:0,flexWrap:"wrap"}}>{children}</div>);}
function Btn({children,onClick,accent,small,disabled}){const[h,sH]=useState(false);return(<button onClick={onClick} disabled={disabled} onMouseEnter={()=>sH(true)} onMouseLeave={()=>sH(false)} style={{display:"inline-flex",alignItems:"center",gap:4,padding:small?"3px 9px":"5px 11px",borderRadius:5,border:`1px solid ${accent?"transparent":C.border}`,background:accent?(h?"#35A46C":"#3DB87A"):(h?"#F9FAFB":"#FFFFFF"),color:accent?"white":C.text,fontSize:small?10:12,fontWeight:600,cursor:disabled?"default":"pointer",opacity:disabled?0.5:1,transition:"background 0.15s",whiteSpace:"nowrap"}}>{children}</button>);}
function IcoBtn({children,onClick}){return(<button onClick={onClick} style={{width:22,height:22,borderRadius:4,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:13,color:C.textSub,display:"flex",alignItems:"center",justifyContent:"center"}}>{children}</button>);}
function ViewToggle({value,onChange,opts}){return(<div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:5,overflow:"hidden"}}>{opts.map(o=><button key={o.v} onClick={()=>onChange(o.v)} style={{padding:"3px 11px",border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:value===o.v?C.accent:C.white,color:value===o.v?"white":C.textSub,transition:"all 0.15s"}}>{o.l}</button>)}</div>);}
function Field({label,children}){return(<div style={{marginBottom:10}}><label style={{display:"block",fontSize:10,fontWeight:700,color:C.textSub,marginBottom:4}}>{label}</label>{children}</div>);}
function Tag({children,color}){return(<span style={{fontSize:10,padding:"2px 7px",borderRadius:10,background:color+"18",color,fontWeight:700,border:`1px solid ${color}30`}}>{children}</span>);}
function NotifBadge({count}){return(<div style={{position:"relative",cursor:"pointer"}}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg><div style={{position:"absolute",top:-3,right:-3,width:13,height:13,borderRadius:"50%",background:"#EF4444",color:"white",fontSize:7,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{count}</div></div>);}
function PlusIco({size=14}){return(<svg width={size} height={size} viewBox="0 0 14 14" fill="none"><line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>);}
function CalIco(){return(<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>);}
function ChatIco(){return(<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>);}
function PeopleIco(){return(<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>);}
function PhotoIco(){return(<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>);}
function SearchIco({size=14,color="#9CA3AF"}){return(<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>);}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN APP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function GenbaApp(){
  const [tab,setTab]=useState("calendar");
  const [activeCh,setActiveCh]=useState(null);
  const [currentDate,setCurrentDate]=useState(new Date());
  const [calView,setCalView]=useState("week");

  // ── Firebase state ──
  const [members,setMembers]=useState([]);
  const [sites,setSites]=useState([]);
  const [events,setEvents]=useState({});      // { "2026-03-07": [...] }
  const [channels,setChannels]=useState([]);
  const [chats,setChats]=useState({});        // { channelId: [...] }
  const [photoFolders,setPhotoFolders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState(false);

  // ── UI state ──
  const [dayModal,setDayModal]=useState(null);
  const [evModal,setEvModal]=useState(null);
  const [evForm,setEvForm]=useState(emptyEvForm());
  const [memberModal,setMemberModal]=useState(false);
  const [editMember,setEditMember]=useState(null);
  const [mForm,setMForm]=useState(emptyMForm());
  const [mFilter,setMFilter]=useState("すべて");
  const [mSearch,setMSearch]=useState("");
  const [openFolder,setOpenFolder]=useState(null);
  const [addFolderOpen,setAddFolderOpen]=useState(false);
  const [newFolderName,setNewFolderName]=useState("");
  const [dragOverFolder,setDragOverFolder]=useState(null);
  const photoFileInputRef=useRef(null);
  const [addChOpen,setAddChOpen]=useState(false);
  const [newChName,setNewChName]=useState("");
  const [chatInput,setChatInput]=useState("");
  const chatEndRef=useRef(null);
  const [ctxMenu,setCtxMenu]=useState(null);
  const [deleteEvConfirm,setDeleteEvConfirm]=useState(null);
  const [deleteMemberConfirmId,setDeleteMemberConfirmId]=useState(null);
  const [renameCh,setRenameCh]=useState(null);
  const [renameVal,setRenameVal]=useState("");
  const [uploadProgress,setUploadProgress]=useState({});

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FIREBASE LISTENERS (リアルタイム同期)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  useEffect(()=>{
    const unsubs=[];

    // Members
    unsubs.push(onSnapshot(collection(db,"members"),(snap)=>{
      setMembers(snap.docs.map(d=>({id:d.id,...d.data()})));
    }));

    // Sites
    unsubs.push(onSnapshot(collection(db,"sites"),(snap)=>{
      const s=snap.docs.map(d=>({id:d.id,...d.data()}));
      setSites(s);
      if(s.length&&!activeCh){
        // Auto select first channel when sites load
      }
    }));

    // Events (Firestore stores each event as doc, we group by date)
    unsubs.push(onSnapshot(collection(db,"events"),(snap)=>{
      const evMap={};
      snap.docs.forEach(d=>{
        const ev={id:d.id,...d.data()};
        if(!evMap[ev.date])evMap[ev.date]=[];
        evMap[ev.date].push(ev);
      });
      setEvents(evMap);
    }));

    // Channels
    unsubs.push(onSnapshot(collection(db,"channels"),(snap)=>{
      const chs=snap.docs.map(d=>({id:d.id,...d.data()}));
      setChannels(chs);
      if(chs.length&&!activeCh){
        setActiveCh(chs[0].id);
      }
    }));

    // Photo Folders
    unsubs.push(onSnapshot(collection(db,"photoFolders"),(snap)=>{
      setPhotoFolders(snap.docs.map(d=>({id:d.id,...d.data(),photos:d.data().photos||[]})));
    }));

    setLoading(false);
    return()=>unsubs.forEach(u=>u());
  },[]);

  // Chat messages listener (per channel)
  useEffect(()=>{
    if(!activeCh)return;
    const q=query(collection(db,"channels",activeCh,"messages"),orderBy("createdAt","asc"));
    const unsub=onSnapshot(q,(snap)=>{
      const msgs=snap.docs.map(d=>({id:d.id,...d.data()}));
      setChats(p=>({...p,[activeCh]:msgs}));
      setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:"smooth"}),80);
    });
    return()=>unsub();
  },[activeCh]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SEED DATA (初回のみ)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  useEffect(()=>{
    const seedIfEmpty=async()=>{
      const snap=await getDoc(doc(db,"_meta","seeded"));
      if(snap.exists())return;

      setSyncing(true);
      // Seed sites
      const siteIds=[];
      const seedSites=[
        {name:"渋谷ビル改修工事",color:"#3DB87A",status:"進行中",period:"2026/02/01〜04/30"},
        {name:"新宿マンション外壁",color:"#4A9EE8",status:"進行中",period:"2026/03/01〜05/15"},
        {name:"品川倉庫新築",color:"#E8944A",status:"準備中",period:"2026/04/01〜08/31"},
      ];
      for(const s of seedSites){
        const d=await addDoc(collection(db,"sites"),{...s,createdAt:serverTimestamp()});
        siteIds.push(d.id);
      }

      // Seed members
      const seedMembers=[
        {name:"田中 太郎",kana:"タナカ タロウ",role:"現場監督",phone:"090-1111-2222",company:"株式会社アルダグラム",avatar:"田",color:"#3DB87A",active:true},
        {name:"山本 次郎",kana:"ヤマモト ジロウ",role:"職長",phone:"090-3333-4444",company:"株式会社アルダグラム",avatar:"山",color:"#4A9EE8",active:true},
        {name:"佐藤 三郎",kana:"サトウ サブロウ",role:"担当",phone:"090-5555-6666",company:"カンナ株式会社",avatar:"佐",color:"#E8944A",active:true},
        {name:"鈴木 四郎",kana:"スズキ シロウ",role:"現場監督",phone:"090-7777-8888",company:"株式会社アルダグラム",avatar:"鈴",color:"#9C6FE8",active:true},
        {name:"高橋 五郎",kana:"タカハシ ゴロウ",role:"職長",phone:"090-9999-0000",company:"カンナ株式会社",avatar:"高",color:"#E84A7A",active:true},
        {name:"伊藤 六郎",kana:"イトウ ロクロウ",role:"担当",phone:"080-1234-5678",company:"株式会社アルダグラム",avatar:"伊",color:"#20C997",active:true},
      ];
      for(const m of seedMembers){
        await addDoc(collection(db,"members"),{...m,createdAt:serverTimestamp()});
      }

      // Seed channels
      const chNames=["渋谷ビル改修工事","新宿マンション外壁","品川倉庫新築","全体連絡"];
      const chTypes=["site","site","site","group"];
      const chIds=[];
      for(let i=0;i<chNames.length;i++){
        const d=await addDoc(collection(db,"channels"),{name:chNames[i],type:chTypes[i],siteId:i<3?siteIds[i]:null,createdAt:serverTimestamp()});
        chIds.push(d.id);
      }

      // Seed initial chat
      if(chIds[0]){
        await addDoc(collection(db,"channels",chIds[0],"messages"),{
          memberId:"seed",memberName:"田中 太郎",memberAvatar:"田",memberColor:"#3DB87A",
          text:"GENBAへようこそ！チームで現場情報を共有しましょう。",
          files:[],createdAt:serverTimestamp()
        });
      }

      // Seed photo folders
      await addDoc(collection(db,"photoFolders"),{name:"渋谷ビル_施工前",updatedAt:nowStr(),photos:[],createdAt:serverTimestamp()});
      await addDoc(collection(db,"photoFolders"),{name:"品川倉庫_着工前",updatedAt:nowStr(),photos:[],createdAt:serverTimestamp()});

      // Mark as seeded
      await setDoc(doc(db,"_meta","seeded"),{at:serverTimestamp()});
      setSyncing(false);
    };
    seedIfEmpty().catch(console.error);
  },[]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // COMPUTED
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const memberById=id=>members.find(m=>m.id===id);
  const activeMembers=members.filter(m=>m.active);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // EVENT ACTIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const submitEvent=async()=>{
    if(!evForm.date||!evForm.text)return;
    setSyncing(true);
    const site=sites.find(s=>s.id===evForm.siteId);
    const payload={
      date:evForm.date,text:evForm.text,
      color:site?.color||"#9C6FE8",
      siteId:evForm.siteId||null,
      time:evForm.time,
      staff:evForm.staff,
      cars:evForm.cars.filter(c=>c.trim()),
      memo:evForm.memo,
      updatedAt:serverTimestamp()
    };
    try{
      if(evModal?.mode==="edit"){
        await updateDoc(doc(db,"events",evModal.ev.id),payload);
      } else {
        await addDoc(collection(db,"events"),{...payload,createdAt:serverTimestamp()});
      }
    }catch(e){console.error(e);}
    setSyncing(false);
    setEvModal(null);
  };

  const openAddEv=(date)=>{setEvForm(emptyEvForm(date));setEvModal({mode:"add",date});};
  const openEditEv=(dateKey,ev)=>{
    setEvForm({date:dateKey,text:ev.text,siteId:ev.siteId||"",time:ev.time||"",staff:ev.staff||[],cars:ev.cars?.length?ev.cars:[""],memo:ev.memo||""});
    setEvModal({mode:"edit",date:dateKey,ev});
  };
  const confirmDeleteEv=(dateKey,evId)=>setDeleteEvConfirm({dateKey,evId});
  const doDeleteEv=async()=>{
    setSyncing(true);
    try{await deleteDoc(doc(db,"events",deleteEvConfirm.evId));}catch(e){console.error(e);}
    setSyncing(false);
    setDeleteEvConfirm(null);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MEMBER ACTIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const submitMember=async()=>{
    if(!mForm.name.trim())return;
    setSyncing(true);
    const payload={...mForm,avatar:mForm.name[0]||"?",updatedAt:serverTimestamp()};
    try{
      if(editMember){
        await updateDoc(doc(db,"members",editMember.id),payload);
      } else {
        await addDoc(collection(db,"members"),{...payload,active:true,createdAt:serverTimestamp()});
      }
    }catch(e){console.error(e);}
    setSyncing(false);
    setMemberModal(false);setEditMember(null);setMForm(emptyMForm());
  };

  const openEditMember=m=>{setEditMember(m);setMForm({name:m.name,kana:m.kana||"",role:m.role,phone:m.phone||"",company:m.company||"",color:m.color});setMemberModal(true);};

  const doDeleteMember=async()=>{
    setSyncing(true);
    try{await deleteDoc(doc(db,"members",deleteMemberConfirmId));}catch(e){console.error(e);}
    setSyncing(false);
    setDeleteMemberConfirmId(null);setMemberModal(false);setEditMember(null);setMForm(emptyMForm());
  };

  const toggleMemberActive=async(m)=>{
    setSyncing(true);
    try{await updateDoc(doc(db,"members",m.id),{active:!m.active,updatedAt:serverTimestamp()});}catch(e){console.error(e);}
    setSyncing(false);
    setMemberModal(false);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CHAT ACTIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const sendMsg=async()=>{
    if(!chatInput.trim()||!activeCh)return;
    const text=chatInput;
    setChatInput("");
    setSyncing(true);
    try{
      await addDoc(collection(db,"channels",activeCh,"messages"),{
        memberId:"self",memberName:"あなた",memberAvatar:"自",memberColor:C.accent,
        text,files:[],mine:true,
        createdAt:serverTimestamp()
      });
    }catch(e){console.error(e);}
    setSyncing(false);
  };

  const addChannel=async()=>{
    if(!newChName.trim())return;
    setSyncing(true);
    try{
      const d=await addDoc(collection(db,"channels"),{name:newChName.trim(),type:"group",siteId:null,createdAt:serverTimestamp()});
      setActiveCh(d.id);
    }catch(e){console.error(e);}
    setSyncing(false);
    setNewChName("");setAddChOpen(false);
  };

  const deleteChannel=async(id)=>{
    setSyncing(true);
    try{await deleteDoc(doc(db,"channels",id));}catch(e){console.error(e);}
    setSyncing(false);
    if(activeCh===id){const rem=channels.filter(c=>c.id!==id);if(rem.length)setActiveCh(rem[0].id);}
  };

  const renameChannel=async(id,name)=>{
    setSyncing(true);
    try{await updateDoc(doc(db,"channels",id),{name:name||"無題",updatedAt:serverTimestamp()});}catch(e){console.error(e);}
    setSyncing(false);
    setRenameCh(null);setRenameVal("");
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHOTO ACTIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const addPhotosToFolder=useCallback(async(folderId,files)=>{
    const arr=Array.from(files).filter(f=>f.type.startsWith("image/"));
    if(!arr.length)return;
    setSyncing(true);

    const folder=photoFolders.find(f=>f.id===folderId);
    if(!folder)return;

    const newPhotos=[];
    for(const file of arr){
      const id="ph_"+Date.now()+"_"+Math.random().toString(36).slice(2);
      const path=`photos/${folderId}/${id}_${file.name}`;
      const sRef=storageRef(storage,path);
      const task=uploadBytesResumable(sRef,file);

      await new Promise((res,rej)=>{
        task.on("state_changed",
          snap=>setUploadProgress(p=>({...p,[id]:Math.round(snap.bytesTransferred/snap.totalBytes*100)})),
          rej,
          async()=>{
            const url=await getDownloadURL(task.snapshot.ref);
            newPhotos.push({
              id,name:file.name,thumb:"📷",
              date:new Date().toISOString().split("T")[0],
              size:(file.size/1024/1024).toFixed(1)+"MB",
              dataUrl:url, storagePath:path
            });
            setUploadProgress(p=>{const r={...p};delete r[id];return r;});
            res();
          }
        );
      });
    }

    const updated=[...(folder.photos||[]),...newPhotos];
    try{await updateDoc(doc(db,"photoFolders",folderId),{photos:updated,updatedAt:nowStr()});}catch(e){console.error(e);}
    setSyncing(false);
  },[photoFolders]);

  const deletePhoto=async(folderId,photoId)=>{
    setSyncing(true);
    const folder=photoFolders.find(f=>f.id===folderId);
    if(!folder)return;
    const photo=folder.photos.find(p=>p.id===photoId);
    // Delete from Storage if has path
    if(photo?.storagePath){
      try{await deleteObject(storageRef(storage,photo.storagePath));}catch(e){/* ignore */}
    }
    const updated=folder.photos.filter(p=>p.id!==photoId);
    try{await updateDoc(doc(db,"photoFolders",folderId),{photos:updated,updatedAt:nowStr()});}catch(e){console.error(e);}
    setSyncing(false);
  };

  const createFolder=async()=>{
    if(!newFolderName.trim())return;
    setSyncing(true);
    try{await addDoc(collection(db,"photoFolders"),{name:newFolderName.trim(),updatedAt:nowStr(),photos:[],createdAt:serverTimestamp()});}catch(e){console.error(e);}
    setSyncing(false);
    setNewFolderName("");setAddFolderOpen(false);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER: CALENDAR
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const renderCalendar=()=>{
    const y=currentDate.getFullYear(),m=currentDate.getMonth();
    const sow=new Date(currentDate);sow.setDate(currentDate.getDate()-currentDate.getDay());
    const label=calView==="week"?`${y}年${m+1}月${sow.getDate()}日 – ${new Date(sow.getTime()+6*86400000).getDate()}日`:`${y}年 ${MONTHS_JP[m]}`;
    return(<div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <Toolbar>
        <Btn onClick={()=>openAddEv(TOSTR)}><PlusIco size={12}/> 作成</Btn>
        <div style={{display:"flex",alignItems:"center",gap:5,marginLeft:"auto"}}>
          <IcoBtn onClick={()=>{const d=new Date(currentDate);calView==="week"?d.setDate(d.getDate()-7):d.setMonth(d.getMonth()-1);setCurrentDate(d);}}>‹</IcoBtn>
          <IcoBtn onClick={()=>{const d=new Date(currentDate);calView==="week"?d.setDate(d.getDate()+7):d.setMonth(d.getMonth()+1);setCurrentDate(d);}}>›</IcoBtn>
          <span style={{fontSize:13,fontWeight:600,color:C.text,minWidth:210,textAlign:"center"}}>{label}</span>
          <Btn small onClick={()=>setCurrentDate(new Date())}>今日</Btn>
        </div>
        <ViewToggle value={calView} onChange={setCalView} opts={[{v:"week",l:"週"},{v:"month",l:"月"}]}/>
      </Toolbar>
      {calView==="week"?renderWeek(y,m,sow):renderMonth(y,m)}
    </div>);
  };

  const renderWeek=(y,m,sow)=>{
    const today=new Date();
    const wds=Array.from({length:7},(_,i)=>{const d=new Date(sow);d.setDate(sow.getDate()+i);return d;});
    return(<div style={{flex:1,overflowY:"auto"}}>
      <div style={{display:"grid",gridTemplateColumns:"48px repeat(7,1fr)",borderBottom:`1px solid ${C.border}`,background:C.white,position:"sticky",top:0,zIndex:10}}>
        <div style={{borderRight:`1px solid ${C.border}`}}/>
        {wds.map((d,i)=>{const isT=d.toDateString()===today.toDateString(),dow=d.getDay();return(<div key={i} style={{padding:"7px 3px",textAlign:"center",borderRight:i<6?`1px solid ${C.border}`:"none"}}><div style={{fontSize:10,fontWeight:600,color:dow===0?"#EF4444":dow===6?"#3B82F6":C.textMuted,marginBottom:2}}>{DAYS_JP[dow]}</div><div onClick={()=>setDayModal(fmtDK(d.getFullYear(),d.getMonth(),d.getDate()))} style={{width:26,height:26,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",background:isT?C.accent:"transparent",color:isT?"white":C.text,fontSize:12,fontWeight:isT?700:400,cursor:"pointer"}}>{d.getDate()}</div></div>);})}
      </div>
      {Array.from({length:12},(_,hi)=>{const hour=8+hi;return(<div key={hi} style={{display:"grid",gridTemplateColumns:"48px repeat(7,1fr)",borderBottom:`1px solid ${C.border}`,minHeight:50}}><div style={{padding:"4px 5px",borderRight:`1px solid ${C.border}`,fontSize:10,color:C.textMuted,paddingTop:5}}>{hour}:00</div>{wds.map((d,ci)=>{const dk=fmtDK(d.getFullYear(),d.getMonth(),d.getDate());const devs=(events[dk]||[]).filter(e=>e.time&&parseInt(e.time)===hour);return(<div key={ci} onClick={()=>setDayModal(dk)} style={{borderRight:ci<6?`1px solid ${C.border}`:"none",padding:"2px 3px",cursor:"pointer",minHeight:50}} onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{devs.map(ev=>(<div key={ev.id} onClick={e=>{e.stopPropagation();openEditEv(dk,ev);}} style={{background:ev.color+"18",borderLeft:`3px solid ${ev.color}`,borderRadius:"0 4px 4px 0",padding:"2px 4px",marginBottom:2,fontSize:10,lineHeight:1.3,cursor:"pointer"}}><div style={{color:ev.color,fontWeight:700}}>{ev.time}</div><div style={{color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.text}</div></div>))}</div>);})}</div>);})}
    </div>);
  };

  const renderMonth=(y,m)=>{
    const today=new Date();
    const dim=getDIM(y,m),fdow=getFDOW(y,m);
    const cells=[...Array(fdow).fill(null),...Array.from({length:dim},(_,i)=>i+1)];
    while(cells.length%7!==0)cells.push(null);
    return(<div style={{flex:1,overflow:"auto"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:C.white,borderBottom:`1px solid ${C.border}`}}>
        {DAYS_JP.map((d,i)=>(<div key={d} style={{padding:"8px 0",textAlign:"center",fontSize:11,fontWeight:700,color:i===0?"#EF4444":i===6?"#3B82F6":C.textSub,borderRight:i<6?`1px solid ${C.border}`:"none"}}>{d}</div>))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
        {cells.map((day,i)=>{if(!day)return<div key={i} style={{minHeight:80,background:"#FAFBFC",borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}/>;
          const dk=fmtDK(y,m,day),devs=events[dk]||[];
          const isT=day===today.getDate()&&m===today.getMonth()&&y===today.getFullYear();
          const dow=(fdow+day-1)%7;
          return(<div key={i} onClick={()=>setDayModal(dk)} style={{minHeight:80,background:C.white,borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,padding:"4px",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"} onMouseLeave={e=>e.currentTarget.style.background=C.white}>
            <div style={{width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isT?C.accent:"transparent",color:isT?"white":dow===0?"#EF4444":dow===6?"#3B82F6":C.text,fontSize:11,fontWeight:isT?700:400,marginBottom:2}}>{day}</div>
            {devs.slice(0,2).map((ev,j)=>(<div key={j} onClick={e=>{e.stopPropagation();openEditEv(dk,ev);}} style={{fontSize:9,background:ev.color+"15",borderLeft:`2px solid ${ev.color}`,borderRadius:"0 3px 3px 0",padding:"1px 4px",marginBottom:1,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"}}>{ev.time&&<span style={{color:ev.color,fontWeight:700,marginRight:2}}>{ev.time}</span>}{ev.text}</div>))}
            {devs.length>2&&<div style={{fontSize:8,color:C.textMuted}}>+{devs.length-2}</div>}
          </div>);
        })}
      </div>
    </div>);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER: CHAT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const renderChat=()=>{
    const msgs=chats[activeCh]||[],ch=channels.find(c=>c.id===activeCh);
    return(<div style={{display:"flex",height:"100%",overflow:"hidden"}}>
      <div style={{width:220,flexShrink:0,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",background:C.white}}>
        <div style={{padding:"9px 10px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:6}}>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:5,padding:"5px 8px",background:C.bg,borderRadius:6,border:`1px solid ${C.border}`}}><SearchIco size={12} color={C.textMuted}/><span style={{fontSize:11,color:C.textMuted}}>検索</span></div>
          <button onClick={()=>setAddChOpen(true)} style={{width:26,height:26,borderRadius:6,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",color:C.textSub}} title="チャンネルを追加">+</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"6px 7px"}}>
          {["案件","グループ"].map(g=>{
            const fch=channels.filter(c=>g==="案件"?c.type==="site":c.type==="group");
            return(<div key={g} style={{marginBottom:6}}>
              <div style={{fontSize:10,fontWeight:700,color:C.textMuted,padding:"3px 5px",letterSpacing:"0.06em"}}>{g}</div>
              {fch.map(c=>{
                const cs=sites.find(s=>s.id===c.siteId),isActive=activeCh===c.id;
                return(<div key={c.id} style={{position:"relative"}}>
                  {renameCh===c.id?(
                    <div style={{padding:"4px 7px"}}><input autoFocus value={renameVal} onChange={e=>setRenameVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")renameChannel(c.id,renameVal||c.name);if(e.key==="Escape"){setRenameCh(null);setRenameVal("");} }} onBlur={()=>renameChannel(c.id,renameVal||c.name)} style={{width:"100%",padding:"4px 6px",borderRadius:4,border:`1px solid ${C.accent}`,fontSize:12,outline:"none",fontFamily:"'Noto Sans JP',sans-serif",background:"#FFFEF5",caretColor:C.accent}}/></div>
                  ):(
                    <button onClick={()=>setActiveCh(c.id)} onContextMenu={e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,items:[{icon:"✏️",label:"案件名の変更",action:()=>{setRenameCh(c.id);setRenameVal(c.name);}},{icon:"📋",label:"コピーする",action:()=>{navigator.clipboard?.writeText(c.name);}},{divider:true},{icon:"🗑️",label:"削除する",danger:true,action:()=>deleteChannel(c.id)}]});}}
                      style={{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"6px 7px",borderRadius:6,border:"none",cursor:"pointer",textAlign:"left",background:isActive?C.accentLight:"transparent"}}>
                      <div style={{width:26,height:26,borderRadius:5,flexShrink:0,background:cs?.color||"#9C6FE8",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:10,fontWeight:700}}>{c.name[0]}</div>
                      <span style={{fontSize:12,fontWeight:isActive?700:500,color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
                    </button>
                  )}
                </div>);
              })}
            </div>);
          })}
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"9px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",background:C.white,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:C.accent}}/><span style={{fontSize:13,fontWeight:700,color:C.text}}>#{ch?.name||"..."}</span></div>
          <div style={{marginLeft:"auto"}}><SyncBadge syncing={syncing}/></div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:12,background:C.bg}}>
          {msgs.map(msg=>{
            const mbr=msg.mine?{name:msg.memberName||"あなた",avatar:msg.memberAvatar||"自",color:msg.memberColor||C.accent}:(memberById(msg.memberId)||{name:msg.memberName||"不明",avatar:msg.memberAvatar||"?",color:msg.memberColor||"#9CA3AF"});
            return(<div key={msg.id} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
              <div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:mbr.color,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>{mbr.avatar||mbr.name[0]}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:3}}><span style={{fontSize:12,fontWeight:700,color:C.text}}>{mbr.name}</span><span style={{fontSize:10,color:C.textMuted}}>{msg.createdAt?.toDate?.()?.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})||""}</span></div>
                <div style={{fontSize:13,color:C.text,lineHeight:1.6,background:C.white,padding:"8px 11px",borderRadius:"4px 9px 9px 9px",border:`1px solid ${C.border}`,display:"inline-block",maxWidth:"80%"}}>{msg.text}</div>
              </div>
            </div>);
          })}
          <div ref={chatEndRef}/>
        </div>
        <div style={{padding:"9px 16px",borderTop:`1px solid ${C.border}`,background:C.white,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",border:`1px solid ${C.border}`,borderRadius:6,background:C.bg}}>
            <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendMsg()} placeholder="メッセージを入力... (Enterで送信)" style={{flex:1,border:"none",outline:"none",fontSize:12,background:"transparent",color:C.text,fontFamily:"'Noto Sans JP',sans-serif",caretColor:C.accent}}/>
            <button onClick={sendMsg} style={{padding:"4px 11px",borderRadius:5,border:"none",background:chatInput.trim()?C.accent:"#D1D5DB",color:"white",fontSize:11,fontWeight:700,cursor:"pointer"}}>送信</button>
          </div>
        </div>
      </div>
    </div>);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER: MEMBERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const renderMembers=()=>{
    const filtered=members.filter(m=>{const ro=mFilter==="すべて"||m.role===mFilter;const se=!mSearch||(m.name+m.kana+m.company).includes(mSearch);return ro&&se;});
    return(<div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <Toolbar>
        <Btn accent onClick={()=>{setEditMember(null);setMForm(emptyMForm());setMemberModal(true);}}><PlusIco size={12}/> メンバー追加</Btn>
        <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 9px",background:C.white,border:`1px solid ${C.border}`,borderRadius:6}}><SearchIco size={12} color={C.textMuted}/><input value={mSearch} onChange={e=>setMSearch(e.target.value)} placeholder="名前・会社で検索" style={{border:"none",outline:"none",fontSize:12,color:C.text,width:130,fontFamily:"'Noto Sans JP',sans-serif",background:"transparent",caretColor:C.accent}}/></div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{["すべて",...ROLES].map(r=>(<button key={r} onClick={()=>setMFilter(r)} style={{padding:"3px 9px",borderRadius:20,border:`1px solid ${mFilter===r?(ROLE_COLORS[r]||C.accent):C.border}`,cursor:"pointer",background:mFilter===r?(ROLE_COLORS[r]||C.accent)+"18":C.white,color:mFilter===r?(ROLE_COLORS[r]||C.accent):C.textSub,fontSize:11,fontWeight:mFilter===r?700:400}}>{r}</button>))}</div>
        </div>
      </Toolbar>
      <div style={{flex:1,overflowY:"auto",padding:"10px 14px"}}>
        {members.length===0?(<div style={{textAlign:"center",padding:"60px 0",color:C.textMuted}}><div style={{fontSize:44,marginBottom:10}}>👷</div><div style={{fontSize:13,marginBottom:12}}>メンバーがいません</div><Btn accent onClick={()=>{setEditMember(null);setMForm(emptyMForm());setMemberModal(true);}}>メンバーを追加する</Btn></div>):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:8}}>
          {filtered.map(m=>(<div key={m.id} onClick={()=>openEditMember(m)} style={{background:C.white,borderRadius:9,border:`1px solid ${C.border}`,padding:"12px",display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer",transition:"box-shadow 0.15s"}} onMouseEnter={e=>e.currentTarget.style.boxShadow="0 3px 14px rgba(0,0,0,0.08)"} onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
            <div style={{width:40,height:40,borderRadius:"50%",background:m.active?m.color:"#D1D5DB",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,flexShrink:0}}>{m.avatar}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:1}}><span style={{fontSize:13,fontWeight:700,color:m.active?C.text:"#9CA3AF"}}>{m.name}</span><span style={{fontSize:9,padding:"1px 6px",borderRadius:20,background:(ROLE_COLORS[m.role]||"#6B7280")+"18",color:ROLE_COLORS[m.role]||"#6B7280",fontWeight:700}}>{m.role}</span>{!m.active&&<span style={{fontSize:9,color:C.textMuted}}>休止中</span>}</div>
              <div style={{fontSize:10,color:C.textMuted,marginBottom:1}}>{m.kana}</div>
              <div style={{fontSize:11,color:C.textSub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.company}</div>
              {m.phone&&<div style={{fontSize:11,color:C.textSub}}>📞 {m.phone}</div>}
            </div>
          </div>))}
        </div>)}
      </div>
    </div>);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER: PHOTOS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const renderPhotos=()=>{
    const currentFolder=openFolder?photoFolders.find(f=>f.id===openFolder):null;
    const isUploading=Object.keys(uploadProgress).length>0;
    return(<div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <Toolbar>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <button onClick={()=>setOpenFolder(null)} style={{background:"none",border:"none",cursor:"pointer",color:openFolder?C.accent:C.text,fontWeight:openFolder?600:700,fontSize:13,fontFamily:"'Noto Sans JP',sans-serif",padding:0}}>写真フォルダ</button>
          {openFolder&&<><span style={{color:C.textMuted,fontSize:13}}>›</span><span style={{color:C.text,fontWeight:700,fontSize:13}}>{currentFolder?.name}</span></>}
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          {isUploading&&<span style={{fontSize:11,color:"#F59E0B",fontWeight:600}}>アップロード中...</span>}
          {openFolder?(<><input ref={photoFileInputRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>{addPhotosToFolder(openFolder,e.target.files);e.target.value="";}} /><Btn accent onClick={()=>photoFileInputRef.current?.click()}><PlusIco size={12}/> 写真を追加する</Btn></>):(<Btn accent onClick={()=>setAddFolderOpen(true)}><PlusIco size={12}/> フォルダを作成する</Btn>)}
        </div>
      </Toolbar>
      {!openFolder?(
        <div style={{flex:1,overflowY:"auto",padding:"14px"}}>
          {photoFolders.length===0?(<div style={{textAlign:"center",padding:"60px 0",color:C.textMuted}}><div style={{fontSize:44,marginBottom:10}}>📁</div><Btn accent onClick={()=>setAddFolderOpen(true)}><PlusIco size={12}/> フォルダを作成する</Btn></div>):(
            <><div style={{display:"grid",gridTemplateColumns:"1fr 80px 90px 150px",padding:"6px 14px",background:"#F9FAFB",borderRadius:"7px 7px 0 0",border:`1px solid ${C.border}`,borderBottom:"none",fontSize:11,fontWeight:700,color:C.textMuted}}><span>フォルダ名</span><span style={{textAlign:"center"}}>写真枚数</span><span style={{textAlign:"center"}}>公開範囲</span><span style={{textAlign:"center"}}>更新日時</span></div>
            <div style={{border:`1px solid ${C.border}`,borderRadius:"0 0 7px 7px",overflow:"hidden"}}>
              {photoFolders.map((f,i)=>(<div key={f.id} onDragOver={e=>{e.preventDefault();setDragOverFolder(f.id);}} onDragLeave={()=>setDragOverFolder(null)} onDrop={e=>{e.preventDefault();setDragOverFolder(null);addPhotosToFolder(f.id,e.dataTransfer.files);}} onClick={()=>setOpenFolder(f.id)} style={{display:"grid",gridTemplateColumns:"1fr 80px 90px 150px",padding:"11px 14px",background:dragOverFolder===f.id?"#EBF8F1":i%2===0?C.white:"#FAFBFC",borderBottom:i<photoFolders.length-1?`1px solid ${C.border}`:"none",cursor:"pointer",alignItems:"center"}} onMouseEnter={e=>{if(dragOverFolder!==f.id)e.currentTarget.style.background="#F0FDF4";}} onMouseLeave={e=>{if(dragOverFolder!==f.id)e.currentTarget.style.background=i%2===0?C.white:"#FAFBFC";}}>
                <div style={{display:"flex",alignItems:"center",gap:9}}><span style={{fontSize:17}}>📁</span><span style={{fontSize:13,fontWeight:600,color:f.photos.length>0?"#0055BB":C.textSub}}>{f.name}</span></div>
                <div style={{textAlign:"center",fontSize:13,fontWeight:700,color:C.text}}>{f.photos.length}枚</div>
                <div style={{textAlign:"center",fontSize:11,color:C.textMuted}}>全体公開</div>
                <div style={{textAlign:"center",fontSize:11,color:C.textMuted}}>{f.updatedAt}</div>
              </div>))}
            </div></>
          )}
        </div>
      ):(
        <div style={{flex:1,overflowY:"auto",padding:"14px"}}>
          {currentFolder?.photos.length===0&&!isUploading?(<div style={{textAlign:"center",padding:"60px 0",color:C.textMuted,border:`2px dashed ${C.border}`,borderRadius:10}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addPhotosToFolder(openFolder,e.dataTransfer.files);}}><div style={{fontSize:44,marginBottom:10}}>📷</div><div style={{fontSize:14,marginBottom:4}}>写真がありません</div><div style={{fontSize:12}}>ドラッグ＆ドロップまたは「写真を追加する」から</div></div>):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
            {(currentFolder?.photos||[]).map(ph=>(<div key={ph.id} style={{background:C.white,borderRadius:7,overflow:"hidden",border:`1px solid ${C.border}`,position:"relative",transition:"box-shadow 0.15s"}} onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 14px rgba(0,0,0,0.1)"} onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
              <div style={{height:100,background:"#F0F2F4",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>{ph.dataUrl?<img src={ph.dataUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:34}}>{ph.thumb}</span>}</div>
              <button onClick={e=>{e.stopPropagation();deletePhoto(openFolder,ph.id);}} style={{position:"absolute",top:4,right:4,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,0.55)",border:"none",color:"white",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
              <div style={{padding:"6px 8px"}}><div style={{fontSize:10,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ph.name}</div><div style={{fontSize:9,color:C.textMuted}}>{ph.date} · {ph.size}</div></div>
            </div>))}
            <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addPhotosToFolder(openFolder,e.dataTransfer.files);}} onClick={()=>photoFileInputRef.current?.click()} style={{height:140,border:`2px dashed ${C.border}`,borderRadius:7,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",color:C.textMuted,fontSize:11,gap:4}}><PlusIco size={20}/><span>ドロップで追加</span></div>
          </div>)}
        </div>
      )}
    </div>);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MODALS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const renderDayModal=()=>{
    if(!dayModal)return null;
    const devs=events[dayModal]||[];const[y,m,d]=dayModal.split("-");
    const dow=DAYS_JP[new Date(Number(y),Number(m)-1,Number(d)).getDay()];
    const allStaff=[...new Set(devs.flatMap(e=>e.staff||[]))].map(id=>memberById(id)).filter(Boolean);
    return(<Overlay onClick={()=>setDayModal(null)}><Modal maxW={480} maxH="80vh" onClick={e=>e.stopPropagation()}>
      <ModalHead><div style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontSize:16,fontWeight:800,color:C.text}}>{Number(m)}月{Number(d)}日（{dow}）</span>{devs.length>0&&<Tag color={C.accent}>{devs.length}件</Tag>}</div><div style={{display:"flex",gap:6}}><Btn small accent onClick={()=>{setDayModal(null);openAddEv(dayModal);}}><PlusIco size={10}/> 追加</Btn><CloseBtn onClick={()=>setDayModal(null)}/></div></ModalHead>
      <div style={{overflowY:"auto",flex:1,padding:"12px"}}>
        {devs.length===0?(<div style={{textAlign:"center",padding:"36px 0"}}><div style={{fontSize:32,marginBottom:8}}>📋</div><div style={{color:C.textMuted,fontSize:13,marginBottom:12}}>予定はありません</div><Btn accent onClick={()=>{setDayModal(null);openAddEv(dayModal);}}>予定を追加する</Btn></div>):(
          <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:10}}>
            {devs.map(ev=>{const site=sites.find(s=>s.id===ev.siteId);const evStaff=(ev.staff||[]).map(id=>memberById(id)).filter(Boolean);return(<div key={ev.id} style={{background:C.white,borderRadius:7,border:`1px solid ${C.border}`,overflow:"hidden"}}><div style={{borderLeft:`4px solid ${ev.color}`,padding:"9px 12px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:13,fontWeight:700,color:C.text}}>{ev.text}</span>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  {ev.time&&<span style={{fontSize:11,color:ev.color,fontWeight:700}}>{ev.time}</span>}
                  <button onClick={()=>{setDayModal(null);openEditEv(dayModal,ev);}} style={{padding:"2px 7px",borderRadius:4,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:10,color:C.textSub}}>編集</button>
                  <button onClick={()=>{setDayModal(null);confirmDeleteEv(dayModal,ev.id);}} style={{padding:"2px 7px",borderRadius:4,border:`1px solid #FCA5A5`,background:"#FEF2F2",cursor:"pointer",fontSize:10,color:C.danger,fontWeight:700}}>削除</button>
                </div>
              </div>
              {site&&<div style={{fontSize:10,color:C.textMuted,marginBottom:evStaff.length?5:0}}>📍 {site.name}</div>}
              {evStaff.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3}}>{evStaff.map(s=>(<div key={s.id} style={{display:"flex",alignItems:"center",gap:3,padding:"2px 7px 2px 3px",background:C.bg,borderRadius:20}}><div style={{width:15,height:15,borderRadius:"50%",background:s.color,color:"white",fontSize:7,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{s.avatar}</div><span style={{fontSize:10,color:C.text}}>{s.name}</span></div>))}</div>}
              {ev.memo&&<div style={{marginTop:5,fontSize:11,color:C.textSub,background:C.bg,borderRadius:4,padding:"4px 7px"}}>{ev.memo}</div>}
            </div></div>);})}
          </div>
        )}
        {allStaff.length>0&&(<div style={{background:C.white,borderRadius:7,padding:"10px 12px",border:`1px solid ${C.border}`}}><div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:6}}>本日の出動人員（{allStaff.length}名）</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{allStaff.map(s=>(<div key={s.id} style={{display:"flex",alignItems:"center",gap:3,padding:"3px 8px 3px 3px",background:C.bg,borderRadius:20}}><div style={{width:20,height:20,borderRadius:"50%",background:s.color,color:"white",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{s.avatar}</div><span style={{fontSize:11,color:C.text}}>{s.name}</span></div>))}</div></div>)}
      </div>
    </Modal></Overlay>);
  };

  const renderEvModal=()=>{
    if(!evModal)return null;
    const isEdit=evModal.mode==="edit",ok=evForm.date&&evForm.text;
    return(<Overlay onClick={()=>setEvModal(null)}><Modal maxW={440} maxH="92vh" onClick={e=>e.stopPropagation()}>
      <ModalHead><span style={{fontSize:14,fontWeight:700,color:C.text}}>{isEdit?"予定を編集":"予定を作成"}</span><CloseBtn onClick={()=>setEvModal(null)}/></ModalHead>
      <div style={{overflowY:"auto",flex:1,padding:"13px 16px 16px"}}>
        <Field label="📆 日付 *"><FocusInput type="date" value={evForm.date} onChange={e=>setEvForm(p=>({...p,date:e.target.value}))}/></Field>
        <Field label="📌 予定名 *"><FocusInput type="text" value={evForm.text} placeholder="例：足場解体" onChange={e=>setEvForm(p=>({...p,text:e.target.value}))}/></Field>
        <Field label="🏗 現場名"><select value={evForm.siteId} onChange={e=>setEvForm(p=>({...p,siteId:e.target.value}))} style={IST}><option value="">選択（任意）</option>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="🕐 時間"><FocusInput type="time" value={evForm.time} onChange={e=>setEvForm(p=>({...p,time:e.target.value}))}/></Field>
        <Field label="👷 人員"><div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"7px",background:C.bg,borderRadius:6,border:`1px solid ${C.border}`}}>{activeMembers.map(m=>{const sel=evForm.staff.includes(m.id);return(<button key={m.id} onClick={()=>setEvForm(p=>({...p,staff:sel?p.staff.filter(x=>x!==m.id):[...p.staff,m.id]}))} style={{display:"flex",alignItems:"center",gap:3,padding:"3px 8px 3px 3px",borderRadius:20,border:`1px solid ${sel?m.color:C.border}`,cursor:"pointer",background:sel?m.color+"18":C.white}}><div style={{width:16,height:16,borderRadius:"50%",background:sel?m.color:"#D1D5DB",color:"white",fontSize:7,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{m.avatar}</div><span style={{fontSize:11,color:sel?m.color:C.textSub,fontWeight:sel?700:400}}>{m.name}</span></button>);})}</div></Field>
        <Field label="📝 メモ"><textarea value={evForm.memo} onChange={e=>setEvForm(p=>({...p,memo:e.target.value}))} rows={2} style={{...IST,resize:"vertical",lineHeight:1.6}}/></Field>
        <div style={{display:"flex",gap:8}}>
          {isEdit&&<button onClick={()=>{setEvModal(null);confirmDeleteEv(evModal.date,evModal.ev.id);}} style={{flex:"0 0 auto",padding:"9px 14px",borderRadius:7,border:`1px solid #FCA5A5`,background:"#FEF2F2",color:C.danger,fontWeight:700,fontSize:12,cursor:"pointer"}}>🗑️ 削除</button>}
          <button onClick={submitEvent} disabled={!ok} style={{flex:1,padding:"10px",borderRadius:7,border:"none",background:ok?C.accent:"#D1D5DB",color:"white",fontWeight:700,fontSize:13,cursor:ok?"pointer":"default",fontFamily:"'Noto Sans JP',sans-serif"}}>{isEdit?"変更を保存":"作成する"}</button>
        </div>
      </div>
    </Modal></Overlay>);
  };

  const renderMemberModal=()=>{
    if(!memberModal)return null;
    const isEdit=!!editMember;
    return(<Overlay onClick={()=>setMemberModal(false)}><Modal maxW={400} maxH="92vh" onClick={e=>e.stopPropagation()}>
      <ModalHead><span style={{fontSize:14,fontWeight:700,color:C.text}}>{isEdit?"メンバーを編集":"メンバーを追加"}</span><div style={{display:"flex",gap:6}}>{isEdit&&<button onClick={()=>toggleMemberActive(editMember)} style={{padding:"3px 9px",borderRadius:5,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer",fontSize:11,color:C.textSub}}>{editMember.active?"休止":"復帰"}</button>}<CloseBtn onClick={()=>setMemberModal(false)}/></div></ModalHead>
      <div style={{overflowY:"auto",flex:1,padding:"13px 16px 16px"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:14}}><div style={{width:50,height:50,borderRadius:"50%",background:mForm.color,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700}}>{mForm.name?mForm.name[0]:"?"}</div></div>
        <Field label="氏名 *"><FocusInput type="text" value={mForm.name} placeholder="田中 太郎" onChange={e=>setMForm(p=>({...p,name:e.target.value}))}/></Field>
        <Field label="ふりがな"><FocusInput type="text" value={mForm.kana} placeholder="タナカ タロウ" onChange={e=>setMForm(p=>({...p,kana:e.target.value}))}/></Field>
        <Field label="役職"><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{ROLES.map(r=>{const sel=mForm.role===r;return<button key={r} onClick={()=>setMForm(p=>({...p,role:r,color:ROLE_COLORS[r]}))} style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${sel?ROLE_COLORS[r]:C.border}`,cursor:"pointer",background:sel?ROLE_COLORS[r]+"18":C.white,color:sel?ROLE_COLORS[r]:C.textSub,fontSize:11,fontWeight:sel?700:400}}>{r}</button>;})}</div></Field>
        <Field label="会社名"><FocusInput type="text" value={mForm.company} placeholder="株式会社〇〇" onChange={e=>setMForm(p=>({...p,company:e.target.value}))}/></Field>
        <Field label="電話番号"><FocusInput type="text" value={mForm.phone} placeholder="090-0000-0000" onChange={e=>setMForm(p=>({...p,phone:e.target.value}))}/></Field>
        <button onClick={submitMember} disabled={!mForm.name.trim()} style={{width:"100%",padding:"10px",borderRadius:7,border:"none",background:mForm.name.trim()?C.accent:"#D1D5DB",color:"white",fontWeight:700,fontSize:13,cursor:mForm.name.trim()?"pointer":"default",marginBottom:isEdit?10:0}}>{isEdit?"変更を保存する":"メンバーを登録する"}</button>
        {isEdit&&(<button onClick={()=>setDeleteMemberConfirmId(editMember.id)} style={{width:"100%",padding:"9px",borderRadius:7,border:`1px solid #FCA5A5`,background:"#FEF2F2",color:C.danger,fontWeight:700,fontSize:12,cursor:"pointer"}}>🗑️ このメンバーを削除する</button>)}
      </div>
    </Modal></Overlay>);
  };

  const renderAddFolderModal=()=>{if(!addFolderOpen)return null;return(<Overlay onClick={()=>setAddFolderOpen(false)}><Modal maxW={320} onClick={e=>e.stopPropagation()}><ModalHead><span style={{fontSize:14,fontWeight:700,color:C.text}}>フォルダを作成する</span><CloseBtn onClick={()=>setAddFolderOpen(false)}/></ModalHead><div style={{padding:"13px 16px 16px"}}><Field label="フォルダ名 *"><FocusInput type="text" value={newFolderName} placeholder="例：渋谷ビル_施工中" onChange={e=>setNewFolderName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createFolder()} autoFocus/></Field><button onClick={createFolder} disabled={!newFolderName.trim()} style={{width:"100%",padding:"10px",borderRadius:7,border:"none",background:newFolderName.trim()?C.accent:"#D1D5DB",color:"white",fontWeight:700,fontSize:13,cursor:newFolderName.trim()?"pointer":"default"}}>作成する</button></div></Modal></Overlay>);};
  const renderAddChModal=()=>{if(!addChOpen)return null;return(<Overlay onClick={()=>setAddChOpen(false)}><Modal maxW={320} onClick={e=>e.stopPropagation()}><ModalHead><span style={{fontSize:14,fontWeight:700,color:C.text}}>チャンネルを追加</span><CloseBtn onClick={()=>setAddChOpen(false)}/></ModalHead><div style={{padding:"13px 16px 16px"}}><Field label="チャンネル名 *"><FocusInput type="text" value={newChName} placeholder="例：安全管理チーム" onChange={e=>setNewChName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addChannel()} autoFocus/></Field><button onClick={addChannel} disabled={!newChName.trim()} style={{width:"100%",padding:"10px",borderRadius:7,border:"none",background:newChName.trim()?C.accent:"#D1D5DB",color:"white",fontWeight:700,fontSize:13,cursor:newChName.trim()?"pointer":"default"}}>作成する</button></div></Modal></Overlay>);};

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // NAV & LAYOUT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const NAV=[
    {id:"calendar",label:"カレンダー",icon:<CalIco/>},
    {id:"chat",label:"チャット",icon:<ChatIco/>},
    {id:"members",label:"メンバー",icon:<PeopleIco/>},
    {id:"photos",label:"写真管理",icon:<PhotoIco/>},
  ];

  if(loading)return(<div style={{height:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,fontFamily:"'Noto Sans JP',sans-serif"}}><LoadingSpinner label="GENBAを起動中..."/></div>);

  return(<div style={{display:"flex",height:"100dvh",overflow:"hidden",fontFamily:"'Noto Sans JP','Hiragino Sans',sans-serif",background:C.bg}}>
    <style>{`*{box-sizing:border-box;}input,select,textarea,button{font-family:'Noto Sans JP',sans-serif;}::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:99px;}@keyframes cursorBlink{0%,100%{opacity:1}50%{opacity:0}}@keyframes ctxAppear{from{transform:scale(0.95) translateY(-4px);opacity:0}to{transform:none;opacity:1}}@keyframes fsc{from{transform:scale(0.97);opacity:0}to{transform:none;opacity:1}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes syncPulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>

    {/* Sidebar */}
    <div style={{width:52,flexShrink:0,background:C.sidebar,display:"flex",flexDirection:"column",alignItems:"center",paddingTop:10,zIndex:20}}>
      <div style={{width:30,height:30,borderRadius:7,background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12,flexShrink:0}}><span style={{color:"white",fontSize:14}}>🏗</span></div>
      <div style={{display:"flex",flexDirection:"column",gap:1,width:"100%",padding:"0 4px"}}>
        {NAV.map(n=>(<button key={n.id} onClick={()=>setTab(n.id)} title={n.label} style={{width:"100%",padding:"9px 0",borderRadius:6,border:"none",cursor:"pointer",background:tab===n.id?C.sidebarHover:"transparent",display:"flex",justifyContent:"center",alignItems:"center"}}><div style={{color:tab===n.id?"white":"rgba(255,255,255,0.32)"}}>{n.icon}</div></button>))}
      </div>
      <div style={{marginTop:"auto",padding:"0 4px 12px",width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
        <SyncBadge syncing={syncing}/>
        <div style={{width:28,height:28,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><span style={{color:"white",fontSize:10,fontWeight:700}}>自</span></div>
      </div>
    </div>

    {/* Main */}
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{height:46,flexShrink:0,background:C.white,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 16px",gap:10}}>
        <span style={{fontSize:13,fontWeight:800,color:C.text}}>{NAV.find(n=>n.id===tab)?.label}</span>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          <NotifBadge count={0}/>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:24,height:24,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:9,fontWeight:700}}>自</div><span style={{fontSize:11,fontWeight:600,color:C.text,display:"none"}}>ゲスト</span></div>
        </div>
      </div>
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {tab==="calendar"&&renderCalendar()}
        {tab==="chat"&&renderChat()}
        {tab==="members"&&renderMembers()}
        {tab==="photos"&&renderPhotos()}
      </div>
    </div>

    {/* Modals */}
    {renderDayModal()}
    {renderEvModal()}
    {renderMemberModal()}
    {renderAddFolderModal()}
    {renderAddChModal()}
    {ctxMenu&&<ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={()=>setCtxMenu(null)}/>}
    {deleteEvConfirm&&<ConfirmDialog title="予定を削除しますか？" message="この操作は取り消せません。" onConfirm={doDeleteEv} onCancel={()=>setDeleteEvConfirm(null)}/>}
    {deleteMemberConfirmId&&<ConfirmDialog title="メンバーを削除しますか？" message={`「${members.find(m=>m.id===deleteMemberConfirmId)?.name}」を完全に削除します。この操作は取り消せません。`} onConfirm={doDeleteMember} onCancel={()=>setDeleteMemberConfirmId(null)}/>}
  </div>);
}
