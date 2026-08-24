import React, { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, CircleAlert, Database, DoorOpen, Info, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, UsersRound, X } from "lucide-react";
import type { AdCollege, AdSection, LocationMigrationRun, LocationReviewCase, MasterBuilding, MasterRoom } from "../types";
import { Badge, Field, Notice, PrimaryButton, SecondaryButton, Surface } from "./ui";
import { buildingNumberLabel, normalizeCollegeName, officialCollegeSitePrefix, officialSiteLabel } from "../utils/locationCollegePrefixes";

type Payload={buildings:MasterBuilding[];rooms:MasterRoom[];reviewCases:LocationReviewCase[];runs:LocationMigrationRun[];health:Record<string,number>;pending:any[];colleges:AdCollege[];sections:AdSection[]};
type CollegeGroup={key:string;label:string;ids:number[];prefix?:string};
type AliasEditor={kind:"building"|"room";id:string;label:string;value:string;currentAliases:any[]}|null;

const empty:Payload={buildings:[],rooms:[],reviewCases:[],runs:[],health:{},pending:[],colleges:[],sections:[]};
async function json(url:string,init?:RequestInit){const r=await fetch(url,{...init,headers:{"Content-Type":"application/json",...(init?.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"تعذر تنفيذ العملية");return data;}
const aliases=(items:any[]|undefined)=>Array.isArray(items)?items.map(item=>String(item?.value||"").trim()).filter(Boolean):[];
const intersects=(a:number[],b:number[])=>a.some(id=>b.includes(id));
const buildingPrefix=(building:MasterBuilding)=>String(building.sitePrefix||building.officialCode.slice(0,4)||"").trim().toUpperCase();
const migrationLabel=(key:string)=>({scanned:"تم فحصها",verified:"موثقة",buildingChanged:"تم توحيد المبنى",roomChanged:"تم توحيد القاعة",review:"تحتاج مراجعة",invalid:"قيم غير صالحة",unchanged:"بدون تغيير"} as Record<string,string>)[key]||key;
const reviewKindLabel=(kind:string)=>({BUILDING:"مبنى",ROOM:"قاعة",PAIR:"مبنى/قاعة",SWAPPED_FIELDS:"احتمال تبديل الحقول",UNKNOWN_PREFIX:"كود موقع غير معروف",CROSS_BUILDING_ROOM_CODE:"رمز قاعة في أكثر من مبنى"} as Record<string,string>)[kind]||kind;

export default function LocationRegistryAdmin({header,demoReadOnly=false}:{header?:React.ReactNode;demoReadOnly?:boolean}){
  const [data,setData]=useState<Payload>(empty),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);
  const [query,setQuery]=useState(""),[selectedBuilding,setSelectedBuilding]=useState<string>(""),[reviewOnly,setReviewOnly]=useState(true);
  const [statusFilter,setStatusFilter]=useState("all"),[collegeFilter,setCollegeFilter]=useState("all"),[sectionFilter,setSectionFilter]=useState(0),[siteFilter,setSiteFilter]=useState("all");
  const [editEntity,setEditEntity]=useState<any>(null),[aliasEditor,setAliasEditor]=useState<AliasEditor>(null);
  const [newBuilding,setNewBuilding]=useState({collegeId:0,buildingNumber:"",siteName:"",branchName:""});
  const [newRoom,setNewRoom]=useState({buildingId:"",canonicalCode:"",shared:false});
  const [migrationPreview,setMigrationPreview]=useState<any>(null);

  const load=async()=>{setBusy(true);setError(null);try{setData(await json("/api/admin/location-registry"));}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  useEffect(()=>{void load();},[]);

  const collegeGroups=useMemo<CollegeGroup[]>(()=>{
    const groups=new Map<string,CollegeGroup>();
    for(const college of data.colleges){
      const id=Number(college.AdCollegeId);if(!id)continue;
      const name=String(college.AdCollegeName||"").trim();
      const prefix=officialCollegeSitePrefix(name);
      const key=prefix?`prefix:${prefix}`:`name:${normalizeCollegeName(name)}`;
      const label=prefix?officialSiteLabel(prefix,name):name||String(id);
      const current=groups.get(key)||{key,label,ids:[],prefix};
      if(!current.ids.includes(id))current.ids.push(id);
      groups.set(key,current);
    }
    return [...groups.values()].sort((a,b)=>a.label.localeCompare(b.label,"ar"));
  },[data.colleges]);

  const selectedCollegeGroup=collegeGroups.find(group=>group.key===collegeFilter);
  const selectedCollegeIds=selectedCollegeGroup?.ids||[];

  const roomIdsByBuilding=useMemo(()=>{
    const map=new Map<string,MasterRoom[]>();
    for(const room of data.rooms){const list=map.get(room.buildingId)||[];list.push(room);map.set(room.buildingId,list);}
    return map;
  },[data.rooms]);

  const buildingCollegeIds=(building:MasterBuilding)=>{
    const ids=new Set<number>((building.collegeIds||[]).map(Number).filter(Boolean));
    for(const room of roomIdsByBuilding.get(building.id)||[])for(const id of room.collegeIds||[])if(Number(id))ids.add(Number(id));
    const prefix=buildingPrefix(building);
    if(prefix)for(const college of data.colleges)if(officialCollegeSitePrefix(college.AdCollegeName)===prefix)ids.add(Number(college.AdCollegeId));
    return [...ids];
  };
  const buildingSectionIds=(building:MasterBuilding)=>{
    const ids=new Set<number>((building.sectionIds||[]).map(Number).filter(Boolean));
    for(const room of roomIdsByBuilding.get(building.id)||[])for(const id of room.sectionIds||[])if(Number(id))ids.add(Number(id));
    return [...ids];
  };

  const sites=useMemo(()=>{
    const map=new Map<string,string>();
    for(const building of data.buildings){
      const prefix=buildingPrefix(building);
      if(prefix)map.set(prefix,officialSiteLabel(prefix,building.siteName||building.branchName));
    }
    return [...map.entries()].map(([value,label])=>({value,label})).sort((a,b)=>a.label.localeCompare(b.label,"ar"));
  },[data.buildings]);

  const q=query.trim().toLowerCase();
  const buildings=useMemo(()=>data.buildings.filter(building=>{
    const bCollegeIds=buildingCollegeIds(building),bSectionIds=buildingSectionIds(building);
    const searchable=[building.officialCode,building.sitePrefix,officialSiteLabel(buildingPrefix(building),building.siteName||building.branchName),building.siteName,building.branchName,...aliases(building.aliases),...bCollegeIds.map(id=>data.colleges.find(c=>Number(c.AdCollegeId)===id)?.AdCollegeName||""),...bSectionIds.map(id=>data.sections.find(s=>Number(s.AdSectionId)===id)?.AdSectionName||"")].join(" ").toLowerCase();
    if(q&&!searchable.includes(q))return false;
    if(statusFilter!=="all"&&(statusFilter==="active"?!building.active:building.active))return false;
    if(siteFilter!=="all"&&buildingPrefix(building)!==siteFilter)return false;
    if(selectedCollegeIds.length&&!intersects(bCollegeIds,selectedCollegeIds))return false;
    if(sectionFilter&&!bSectionIds.includes(sectionFilter))return false;
    return true;
  }).sort((a,b)=>a.officialCode.localeCompare(b.officialCode)),[data.buildings,data.colleges,data.sections,roomIdsByBuilding,q,statusFilter,siteFilter,selectedCollegeIds.join(","),sectionFilter]);

  const current=buildings.find(building=>building.id===selectedBuilding)||buildings[0];
  const rooms=useMemo(()=>data.rooms.filter(room=>current&&room.buildingId===current.id&&(!q||[room.canonicalCode,...aliases(room.aliases)].join(" ").toLowerCase().includes(q))).sort((a,b)=>a.canonicalCode.localeCompare(b.canonicalCode)),[data.rooms,current,q]);
  const reviews=data.reviewCases.filter(c=>!reviewOnly||c.status==="open");
  const collegeName=(id:number)=>data.colleges.find(c=>Number(c.AdCollegeId)===Number(id))?.AdCollegeName||String(id);
  const sectionName=(id:number)=>data.sections.find(s=>Number(s.AdSectionId)===Number(id))?.AdSectionName||String(id);
  const selectedNewBuildingCollege=data.colleges.find(c=>Number(c.AdCollegeId)===Number(newBuilding.collegeId));
  const selectedNewBuildingPrefix=officialCollegeSitePrefix(selectedNewBuildingCollege?.AdCollegeName);
  const filterActive=Boolean(q||statusFilter!=="all"||siteFilter!=="all"||collegeFilter!=="all"||sectionFilter);

  const mutate=async(url:string,init:RequestInit,ok:string)=>{if(demoReadOnly)return false;setBusy(true);setError(null);setMessage(null);try{await json(url,init);setMessage(ok);await load();return true;}catch(e:any){setError(e.message);return false;}finally{setBusy(false);}};
  const selectedIds=(e:React.ChangeEvent<HTMLSelectElement>)=>Array.from(e.target.selectedOptions as HTMLCollectionOf<HTMLOptionElement>).map((o:HTMLOptionElement)=>Number(o.value)).filter(Boolean);
  const saveAlias=async()=>{if(!aliasEditor?.value.trim())return;const value=aliasEditor.value.trim();const next=[...aliasEditor.currentAliases,{value,normalized:value.toUpperCase().replace(/\s+/g,""),confidence:"CONFIRMED",source:"ADMIN",evidence:["اعتماد يدوي من مدير النظام"]}];const ok=await mutate(`/api/admin/location-registry/${aliasEditor.kind==="building"?"buildings":"rooms"}/${encodeURIComponent(aliasEditor.id)}`,{method:"PUT",body:JSON.stringify({aliases:next})},"تمت إضافة الصيغة التاريخية");if(ok)setAliasEditor(null);};
  const previewMigration=async()=>{setBusy(true);setError(null);try{setMigrationPreview(await json("/api/admin/location-registry/migration/preview"));}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  const applyMigration=async()=>{if(!migrationPreview||demoReadOnly)return;if(!window.confirm("سيُنشئ النظام نقطة أمان أولاً، ثم يطبق التوحيد عالي الثقة فقط. متابعة؟"))return;const ok=await mutate("/api/admin/location-registry/migration/apply",{method:"POST",headers:{"X-Schedule-Confirm":"initialize-location-registry"}},"اكتملت تهيئة سجل المباني والقاعات");if(ok)setMigrationPreview(null);};
  const rollback=async(run:LocationMigrationRun)=>{if(demoReadOnly||!window.confirm("إرجاع قيم المواقع التي غيّرتها هذه المهاجرة؟"))return;await mutate(`/api/admin/location-registry/migration/${encodeURIComponent(run.id)}/rollback`,{method:"POST",headers:{"X-Schedule-Confirm":"rollback-location-registry"}},"تم التراجع عن المهاجرة");};
  const resetFilters=()=>{setQuery("");setStatusFilter("all");setSiteFilter("all");setCollegeFilter("all");setSectionFilter(0);};

  return <div className="location-admin-page">
    {header}{error?<Notice>{error}</Notice>:null}{message?<Notice type="success">{message}</Notice>:null}

    <Surface className="location-admin-guide">
      <div className="location-admin-guide-icon"><ShieldCheck/></div>
      <div><strong>هذه شاشة إدارة فعلية للسجل الرسمي، وليست شاشة عرض فقط.</strong><p>فلتر واختر المبنى، ثم أدر القاعات المرتبطة به. أي تعديل من «إدارة» يُحفظ في السجل مباشرة. «الصيغة التاريخية» هي كتابة قديمة لنفس المبنى أو القاعة، ويستخدمها النظام لفهم بيانات السنوات السابقة فقط ولا تظهر للمستخدم كخيار مستقل.</p></div>
    </Surface>

    <div className="location-health-grid">
      <Surface><Building2/><b>{data.health.officialBuildings||0}</b><span>مبنى رسمي</span></Surface>
      <Surface><DoorOpen/><b>{data.health.officialRooms||0}</b><span>قاعة رسمية</span></Surface>
      <Surface><UsersRound/><b>{data.health.sharedRooms||0}</b><span>قاعة مشتركة</span></Surface>
      <Surface><CircleAlert/><b>{data.health.pendingRooms||0}</b><span>بانتظار قاعة</span></Surface>
      <Surface><ShieldCheck/><b>{data.health.historicalReview||0}</b><span>تاريخية تحتاج توثيق</span></Surface>
    </div>

    <Surface className="location-admin-toolbar">
      <label className="location-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث بكود المبنى أو القاعة أو صيغة تاريخية"/></label>
      <select aria-label="حالة المبنى" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">كل الحالات</option><option value="active">الفعالة فقط</option><option value="inactive">غير الفعالة فقط</option></select>
      <select aria-label="الموقع" value={siteFilter} onChange={e=>setSiteFilter(e.target.value)}><option value="all">كل المواقع</option>{sites.map(site=><option key={site.value} value={site.value}>{site.label}</option>)}</select>
      <select aria-label="الكلية" value={collegeFilter} onChange={e=>{setCollegeFilter(e.target.value);setSectionFilter(0);}}><option value="all">كل الكليات</option>{collegeGroups.map(group=><option key={group.key} value={group.key}>{group.label}</option>)}</select>
      <select aria-label="القسم" value={sectionFilter} onChange={e=>setSectionFilter(Number(e.target.value))}><option value={0}>كل الأقسام</option>{data.sections.filter(section=>!selectedCollegeIds.length||selectedCollegeIds.includes(Number(section.AdCollegeId))).map(section=><option key={section.AdSectionId} value={section.AdSectionId}>{section.AdSectionName}</option>)}</select>
      {filterActive?<SecondaryButton type="button" data-guide-ignore="مسح فلاتر سجل المواقع" onClick={resetFilters}>مسح الفلاتر</SecondaryButton>:null}
      <SecondaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" onClick={()=>void load()} disabled={busy}><RefreshCw/>تحديث</SecondaryButton>
      <SecondaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" onClick={()=>void previewMigration()} disabled={busy}><Database/>معاينة المهاجرة</SecondaryButton>
    </Surface>

    <div className="location-filter-summary"><span>النتيجة: <b>{buildings.length}</b> من {data.buildings.length} مبنى</span>{siteFilter!=="all"?<Badge>{officialSiteLabel(siteFilter)}</Badge>:null}{selectedCollegeGroup?<Badge>{selectedCollegeGroup.label}</Badge>:null}{sectionFilter?<Badge>{sectionName(sectionFilter)}</Badge>:null}</div>

    {migrationPreview?<Surface className="location-migration-preview"><div className="location-admin-title"><div><strong>معاينة آمنة للمهاجرة</strong><p>لا يتم تغيير أي بيانات قبل الضغط على زر التهيئة.</p></div><Badge>{migrationPreview.version}</Badge></div><div className="location-stat-row">{Object.entries(migrationPreview.stats||{}).map(([k,v])=><span key={k}><b>{String(v)}</b><small>{migrationLabel(k)}</small></span>)}</div><PrimaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" disabled={busy||demoReadOnly} onClick={()=>void applyMigration()}><CheckCircle2/>تهيئة سجل المباني والقاعات</PrimaryButton></Surface>:null}

    <div className="location-admin-columns">
      <Surface className="location-admin-list">
        <div className="location-admin-title"><div><h2>المباني</h2><p>اختر مبنى لعرض وإدارة قاعاته.</p></div><Badge>{buildings.length}</Badge></div>
        <div className="location-inline-form location-create-building"><select aria-label="كلية المبنى الجديد" value={newBuilding.collegeId} onChange={e=>setNewBuilding({...newBuilding,collegeId:Number(e.target.value),buildingNumber:""})}><option value={0}>اختر الكلية/الموقع</option>{collegeGroups.map(group=><option key={group.key} value={group.ids[0]}>{group.label}</option>)}</select><input inputMode="numeric" placeholder="رقم المبنى، مثال 7" value={newBuilding.buildingNumber} onChange={e=>setNewBuilding({...newBuilding,buildingNumber:e.target.value.replace(/\D/g,"").slice(0,3)})}/><span className="location-code-preview" dir="ltr">{selectedNewBuildingPrefix?`${selectedNewBuildingPrefix}${String(Number(newBuilding.buildingNumber||0)).padStart(2,"0")}`:"اختر موقعًا رسميًا"}</span><PrimaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" disabled={!newBuilding.collegeId||!newBuilding.buildingNumber||!selectedNewBuildingPrefix||busy||demoReadOnly} onClick={async()=>{const ok=await mutate("/api/admin/location-registry/buildings",{method:"POST",body:JSON.stringify({...newBuilding,collegeIds:[newBuilding.collegeId]})},"تمت إضافة المبنى");if(ok)setNewBuilding({collegeId:0,buildingNumber:"",siteName:"",branchName:""});}}><Plus/>إضافة</PrimaryButton></div>
        <div className="location-master-list">{buildings.length?buildings.map(building=><button type="button" data-guide-ignore="اختيار مبنى داخل لوحة السجل" className={current?.id===building.id?"active":""} key={building.id} onClick={()=>setSelectedBuilding(building.id)}><div className="location-building-row"><strong dir="ltr">{building.officialCode}</strong>{!building.active?<Badge>غير فعّال</Badge>:null}</div><span>{officialSiteLabel(buildingPrefix(building),building.siteName||building.branchName)} · مبنى {buildingNumberLabel(building)}</span><small>{building.roomCount} قاعة · {building.historicalUsageCount} استخدام تاريخي</small></button>):<div className="location-empty-state"><Search/><strong>لا توجد مبانٍ تطابق الفلاتر</strong><button type="button" data-guide-ignore="مسح فلاتر سجل المواقع" onClick={resetFilters}>مسح الفلاتر</button></div>}</div>
      </Surface>

      <Surface className="location-admin-detail">{current?<><div className="location-admin-title"><div><div className="location-detail-kicker">{officialSiteLabel(buildingPrefix(current),current.siteName||current.branchName)}</div><h2 dir="ltr">{current.officialCode}</h2><p>مبنى {buildingNumberLabel(current)} · {current.roomCount} قاعة · {current.historicalUsageCount} استخدام تاريخي</p></div><div className="location-admin-actions"><SecondaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" disabled={demoReadOnly} onClick={()=>setAliasEditor({kind:"building",id:current.id,label:current.officialCode,value:"",currentAliases:current.aliases||[]})}>إضافة صيغة تاريخية</SecondaryButton><PrimaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" disabled={demoReadOnly} onClick={()=>setEditEntity({kind:"building",id:current.id,title:current.officialCode,active:current.active,siteName:officialSiteLabel(buildingPrefix(current),current.siteName||current.branchName),branchName:current.branchName||"",description:current.description||"",collegeIds:[...buildingCollegeIds(current)],sectionIds:[...buildingSectionIds(current)]})}>إدارة المبنى</PrimaryButton></div></div>
        <div className="location-meta-grid"><div><small>الموقع الرسمي</small><strong>{officialSiteLabel(buildingPrefix(current),current.siteName||current.branchName)}</strong></div><div><small>الكليات المرتبطة</small><strong>{buildingCollegeIds(current).map(collegeName).join("، ")||"—"}</strong></div><div><small>الأقسام المستخدمة</small><strong>{buildingSectionIds(current).map(sectionName).join("، ")||"—"}</strong></div><div><small>الصيغ التاريخية</small><strong dir="ltr">{aliases(current.aliases).join(" · ")||"لا توجد"}</strong></div></div>
        <div className="location-alias-help"><Info/><span><b>الصيغة التاريخية:</b> طريقة قديمة كُتب بها نفس المبنى أو القاعة في السنوات السابقة. لا تنشئ مبنى أو قاعة جديدة ولا تظهر كخيار للمستخدم العادي.</span></div>
        <div className="location-inline-form location-create-room"><input placeholder="رمز القاعة، مثال F06" value={newRoom.buildingId===current.id?newRoom.canonicalCode:""} onFocus={()=>setNewRoom(v=>({...v,buildingId:current.id}))} onChange={e=>setNewRoom({buildingId:current.id,canonicalCode:e.target.value.toUpperCase().replace(/\s+/g,""),shared:newRoom.shared})}/><label className="location-toggle"><input type="checkbox" checked={newRoom.shared} onChange={e=>setNewRoom({...newRoom,buildingId:current.id,shared:e.target.checked})}/> قاعة مشتركة</label><PrimaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" disabled={!newRoom.canonicalCode||busy||demoReadOnly} onClick={async()=>{const ok=await mutate("/api/admin/location-registry/rooms",{method:"POST",body:JSON.stringify({...newRoom,buildingId:current.id})},"تمت إضافة القاعة");if(ok)setNewRoom({buildingId:current.id,canonicalCode:"",shared:false});}}><Plus/>إضافة قاعة</PrimaryButton></div>
        <div className="location-room-table">{rooms.map(room=><div key={room.id}><div className="location-room-code"><strong dir="ltr">{room.canonicalCode}</strong><span>{room.shared?<Badge>مشتركة</Badge>:null}{!room.active?<Badge>غير فعالة</Badge>:null}</span></div><small>{room.historicalUsageCount} استخدام · {room.sectionIds.map(sectionName).join("، ")||"غير مخصصة لقسم"}</small><div className="location-room-actions"><SecondaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" disabled={demoReadOnly} onClick={()=>setEditEntity({kind:"room",id:room.id,title:`${current.officialCode} / ${room.canonicalCode}`,active:room.active,shared:room.shared,newBuildingId:room.buildingId,collegeIds:[...room.collegeIds],sectionIds:[...room.sectionIds],primarySectionIds:[...(room.primarySectionIds||[])]})}>إدارة</SecondaryButton><SecondaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" disabled={demoReadOnly} onClick={()=>setAliasEditor({kind:"room",id:room.id,label:`${current.officialCode} / ${room.canonicalCode}`,value:"",currentAliases:room.aliases||[]})}>صيغة تاريخية</SecondaryButton><SecondaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" disabled={demoReadOnly} onClick={()=>void mutate(`/api/admin/location-registry/rooms/${encodeURIComponent(room.id)}`,{method:"PUT",body:JSON.stringify({active:!room.active})},room.active?"تم تعطيل القاعة دون حذف التاريخ":"تم تفعيل القاعة")}>{room.active?"تعطيل":"تفعيل"}</SecondaryButton></div></div>)}</div>
      </>:<div className="location-empty-state"><Building2/><strong>اختر مبنى من القائمة</strong><span>ستظهر قاعاته وإدارته هنا.</span></div>}</Surface>
    </div>

    <Surface className="location-review"><div className="location-admin-title"><div><h2>طابور المراجعة</h2><p>الحالات غير المحسومة تبقى هنا ولا يتم تحويلها تلقائيًا.</p></div><label className="location-toggle"><input type="checkbox" checked={reviewOnly} onChange={e=>setReviewOnly(e.target.checked)}/> المفتوحة فقط</label></div>
      <div className="location-review-list">{reviews.map(c=><article key={c.id}><header><strong dir="ltr">{c.rawValue||"—"}</strong><Badge>{reviewKindLabel(c.kind)}</Badge><span>{c.occurrences} ظهور</span></header><p>{c.reason}</p><small>الكليات: {c.collegeNames.join("، ")||"—"} · الأقسام: {c.sectionNames.join("، ")||"—"}</small><small>المرشح: {[c.buildingCandidate,c.roomCandidate].filter(Boolean).join(" / ")||[...c.buildingCandidates,...c.roomCandidates].join("، ")||"لا يوجد حسم"}</small><em>{c.recommendation}</em>{c.status==="open"?<div className="location-admin-actions"><PrimaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" disabled={demoReadOnly} onClick={()=>{const resolution=window.prompt("اكتب القرار البشري الذي يحسم هذه الحالة");if(resolution?.trim())void mutate(`/api/admin/location-registry/review/${encodeURIComponent(c.id)}`,{method:"PUT",body:JSON.stringify({status:"resolved",resolution:resolution.trim()})},"تم حسم حالة المراجعة");}}>حسم</PrimaryButton><SecondaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" disabled={demoReadOnly} onClick={()=>void mutate(`/api/admin/location-registry/review/${encodeURIComponent(c.id)}`,{method:"PUT",body:JSON.stringify({status:"ignored",resolution:"تحتاج معرفة بشرية/تم تأجيلها"})},"تم تحديث حالة المراجعة")}>تأجيل</SecondaryButton></div>:<Badge>{c.status==="resolved"?"محسومة":"مؤجلة"}</Badge>}</article>)}</div>
    </Surface>

    <Surface className="location-pending-admin"><div className="location-admin-title"><div><h2>الشعب بانتظار تثبيت القاعة</h2><p>هذه حالة نظام مقصودة وليست قاعة، ولا تدخل في إحصائيات استخدام القاعات.</p></div><Badge>{data.pending.length}</Badge></div>{data.pending.length?<div className="location-pending-table"><div className="head"><span>الكلية / القسم</span><span>الأستاذ</span><span>المقرر / الشعبة</span><span>المبنى</span><span>الأيام / الوقت</span></div>{data.pending.map(row=><div key={row.id}><span>{row.collegeName||collegeName(row.AdCollegeId)} · {row.sectionName||sectionName(row.AdSectionId)}</span><span>{row.instructorName||row.AdInstructorId||"—"}</span><span>{row.AdCourseName||row.AdCourseId||"—"} · {row.SCode||"—"}</span><span dir="ltr">{row.AdRoomCode||"—"}</span><span>{(row.days||[]).join("، ")||"—"} · {row.fstarttime||"—"}–{row.fendtime||"—"}</span></div>)}</div>:<p>لا توجد شعب معلقة حاليًا.</p>}</Surface>

    {data.runs.length?<Surface className="location-migration-history"><h2>سجل المهاجرات</h2>{data.runs.map(run=><div key={run.id}><span>{new Date(run.createdAt).toLocaleString("ar-KW-u-nu-latn")}</span><Badge>{run.status==="completed"?"مكتملة":run.status==="rolled_back"?"تم التراجع":run.status}</Badge><code>{run.version}</code>{run.status==="completed"?<SecondaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" onClick={()=>void rollback(run)} disabled={demoReadOnly||busy}><RotateCcw/>تراجع عن المهاجرة</SecondaryButton>:null}</div>)}</Surface>:null}

    {editEntity?<div className="location-admin-modal-backdrop" role="dialog" aria-modal="true" aria-label={editEntity.kind==="building"?"إدارة المبنى":"إدارة القاعة"} onMouseDown={e=>{if(e.target===e.currentTarget)setEditEntity(null);}}><section className="location-admin-modal"><button className="location-modal-close" type="button" data-guide-ignore="إغلاق نافذة إدارة سجل المواقع" onClick={()=>setEditEntity(null)} aria-label="إغلاق"><X/></button><div className="location-admin-modal-head"><small>{editEntity.kind==="building"?"إدارة المبنى":"إدارة القاعة"}</small><h2 dir="ltr">{editEntity.title}</h2><p>التغييرات هنا تُحفظ مباشرة في السجل الرسمي بعد الضغط على «حفظ».</p></div><div className="location-entity-editor">{editEntity.kind==="building"?<><Field label="اسم الموقع"><input value={editEntity.siteName} onChange={e=>setEditEntity({...editEntity,siteName:e.target.value})}/></Field><Field label="الفرع / الوصف المختصر"><input value={editEntity.branchName} onChange={e=>setEditEntity({...editEntity,branchName:e.target.value})}/></Field><Field label="الوصف"><input value={editEntity.description} onChange={e=>setEditEntity({...editEntity,description:e.target.value})}/></Field></>:<Field label="المبنى"><select value={editEntity.newBuildingId} onChange={e=>setEditEntity({...editEntity,newBuildingId:e.target.value})}>{data.buildings.filter(b=>b.active&&b.confidence==="CONFIRMED").map(b=><option key={b.id} value={b.id}>{b.officialCode} · {officialSiteLabel(buildingPrefix(b),b.siteName||b.branchName)}</option>)}</select></Field>}<label className="location-toggle"><input type="checkbox" checked={Boolean(editEntity.active)} onChange={e=>setEditEntity({...editEntity,active:e.target.checked})}/> فعّال</label>{editEntity.kind==="room"?<label className="location-toggle"><input type="checkbox" checked={Boolean(editEntity.shared)} onChange={e=>setEditEntity({...editEntity,shared:e.target.checked})}/> قاعة مشتركة</label>:null}<Field label="الكليات المرتبطة"><select multiple value={(editEntity.collegeIds||[]).map(String)} onChange={e=>{const ids=selectedIds(e);setEditEntity({...editEntity,collegeIds:ids});}}>{data.colleges.map(c=><option key={c.AdCollegeId} value={c.AdCollegeId}>{c.AdCollegeName}</option>)}</select></Field><Field label="الأقسام المرتبطة"><select multiple value={(editEntity.sectionIds||[]).map(String)} onChange={e=>{const ids=selectedIds(e);setEditEntity({...editEntity,sectionIds:ids,primarySectionIds:(editEntity.primarySectionIds||[]).filter((id:number)=>ids.includes(id))});}}>{data.sections.filter(x=>!editEntity.collegeIds?.length||editEntity.collegeIds.includes(Number(x.AdCollegeId))).map(x=><option key={x.AdSectionId} value={x.AdSectionId}>{x.AdSectionName}</option>)}</select></Field>{editEntity.kind==="room"?<Field label="الأقسام الأساسية"><select multiple value={(editEntity.primarySectionIds||[]).map(String)} onChange={e=>setEditEntity({...editEntity,primarySectionIds:selectedIds(e)})}>{data.sections.filter(x=>(editEntity.sectionIds||[]).includes(Number(x.AdSectionId))).map(x=><option key={x.AdSectionId} value={x.AdSectionId}>{x.AdSectionName}</option>)}</select></Field>:null}</div><div className="location-admin-modal-actions"><SecondaryButton type="button" data-guide-ignore="إلغاء إدارة سجل المواقع" onClick={()=>setEditEntity(null)}>إلغاء</SecondaryButton><PrimaryButton type="button" data-guide-ignore="إجراء إداري خاص بسجل المواقع" disabled={busy||demoReadOnly} onClick={async()=>{const ok=await mutate(`/api/admin/location-registry/${editEntity.kind==="building"?"buildings":"rooms"}/${encodeURIComponent(editEntity.id)}`,{method:"PUT",body:JSON.stringify(editEntity)},editEntity.kind==="building"?"تم تحديث المبنى":"تم تحديث القاعة");if(ok)setEditEntity(null);}}>حفظ التغييرات</PrimaryButton></div></section></div>:null}

    {aliasEditor?<div className="location-admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="إضافة صيغة تاريخية" onMouseDown={e=>{if(e.target===e.currentTarget)setAliasEditor(null);}}><section className="location-admin-modal location-alias-modal"><button className="location-modal-close" type="button" data-guide-ignore="إغلاق نافذة الصيغة التاريخية" onClick={()=>setAliasEditor(null)} aria-label="إغلاق"><X/></button><div className="location-admin-modal-head"><small>صيغة تاريخية</small><h2 dir="ltr">{aliasEditor.label}</h2><p>أدخل فقط كتابة قديمة مؤكدة لنفس {aliasEditor.kind==="building"?"المبنى":"القاعة"}. ستُستخدم للتعرف على السجلات القديمة ولن تظهر كخيار مستقل للمستخدمين.</p></div><Field label="الكتابة القديمة"><input autoFocus value={aliasEditor.value} onChange={e=>setAliasEditor({...aliasEditor,value:e.target.value})} placeholder={aliasEditor.kind==="building"?"مثال: B 05":"مثال: F 06"}/></Field><div className="location-admin-modal-actions"><SecondaryButton type="button" data-guide-ignore="إلغاء إضافة صيغة تاريخية" onClick={()=>setAliasEditor(null)}>إلغاء</SecondaryButton><PrimaryButton type="button" data-guide-ignore="حفظ صيغة تاريخية في سجل المواقع" disabled={!aliasEditor.value.trim()||busy||demoReadOnly} onClick={()=>void saveAlias()}>حفظ الصيغة التاريخية</PrimaryButton></div></section></div>:null}
  </div>;
}
