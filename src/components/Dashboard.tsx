import React,{useEffect,useMemo,useState}from"react";
import{ArrowLeft,BookOpen,Building2,CalendarClock,CalendarDays,CheckCircle2,ChevronDown,Clock3,DoorOpen,GraduationCap,ShieldAlert,Sparkles,UsersRound}from"lucide-react";
import{Notice,PrimaryButton,SecondaryButton}from"./ui";

interface DashboardProps{user:any;scopes:any[];canManageSchedule?:boolean;onNavigate?:(view:string)=>void;searchView?:string;reportView?:string}
interface DashboardData{metrics:{courses:number;schedules:number;terms:number;instructors:number};latestTermName:string;dayName:string;dashboardTotal:number;today:Array<{id:number;instructorName:string;courseCode:string;courseName:string;startTime:string;endTime:string;roomCode:string;roomHall:string}>;workspace?:{mode:"admin"|"personal"|"scope";activeSchedules:number;uniqueRooms:number;uniqueInstructors:number;roomOccupancyPeak:number;peakOccupiedRooms:number;weekdayLoad:Array<{key:string;label:string;count:number}>;busiestHours:Array<{hour:string;count:number}>;busiestRooms:Array<{room:string;count:number}>;scopeCount:number;linkedInstructorName:string;personalToday:any[]}}

export default function Dashboard({user,scopes,canManageSchedule=false,onNavigate,searchView,reportView}:DashboardProps){
 const[data,setData]=useState<DashboardData|null>(null),[overview,setOverview]=useState<any>(null),[living,setLiving]=useState<any>(null),[error,setError]=useState<string|null>(null),[detailsOpen,setDetailsOpen]=useState(false);
 useEffect(()=>{(async()=>{try{
  const jobs:Promise<Response>[]=[fetch("/api/dashboard")];
  if(canManageSchedule){jobs.push(fetch("/api/intelligence/overview"));jobs.push(fetch("/api/intelligence/living"))}
  const results=await Promise.all(jobs),r=results[0],d=await r.json();
  if(!r.ok)throw new Error(d.error||"فشل تحميل الصفحة الرئيسية");
  setData(d);
  if(results[1]){const pd=await results[1].json();if(results[1].ok)setOverview(pd)}
  if(results[2]){const ld=await results[2].json();if(results[2].ok)setLiving(ld)}
 }catch(e:any){setError(e.message)}})()},[canManageSchedule]);

 const power=Boolean(user?.IsAdminUser||user?.SystemUserId===1),ws=data?.workspace;
 const maxDay=useMemo(()=>Math.max(1,...(ws?.weekdayLoad||[]).map(x=>x.count)),[ws]);
 const maxHour=useMemo(()=>Math.max(1,...(ws?.busiestHours||[]).map(x=>x.count)),[ws]);
 const modeLabel=power?(ws?.mode==="admin"?"جميع الأقسام العلمية":ws?.mode==="personal"?`نطاق ${ws.linkedInstructorName||user.Name}`:`${scopes.length} نطاق أكاديمي`):"قسمك العلمي فقط";
 const decisions:Array<any>=living?.pulse?.items||overview?.alerts?.slice?.(0,3)||[];
 const decisionCount=Math.min(3,decisions.length),primaryDecision=decisions[0];
 const now=new Date(),greeting=now.getHours()<12?"صباح الجدول":"مساء الجدول";
 const greetingParts=greeting.split(" ");
 const dateLabel=new Intl.DateTimeFormat("ar-KW-u-nu-latn",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(now);
 const decisionLevel=String(primaryDecision?.severity||primaryDecision?.level||"info");

 return <div className="content-stack dashboard-page editorial-dashboard">
  <header className="editorial-dashboard-masthead">
   <div className="editorial-operator"><span>{user.Name?.trim()?.charAt(0)||"م"}</span><div><strong>مسؤول الجدول</strong><small>{user.Name}</small></div></div>
   <div className="editorial-date"><CalendarDays/><div><strong>{dateLabel}</strong><small>الكويت</small></div></div>
   <div className="editorial-wordmark"><strong>SCHEDULE</strong><small>التحكم الأكاديمي</small></div>
  </header>

  {error?<Notice>{error}</Notice>:null}
  {!data?<div className="dashboard-canvas-skeleton"><i/><i/><i/></div>:<>
   <section className="editorial-dashboard-hero">
    <span className="editorial-kicker"><i/> نبض اليوم</span>
    <h1><span>{greetingParts[0]}</span> {greetingParts.slice(1).join(" ")}</h1>
    <p>{decisionCount?`ابدأ يومك بأهم ${decisionCount===1?"قرار":"قرارات"} تحتاج انتباهك لضمان سير الجدول بسلاسة.`:"الجدول تحت السيطرة الآن؛ ادخل للمراجعة أو واصل عملك بهدوء."}</p>
    <div className="editorial-hero-actions">
     {canManageSchedule?<PrimaryButton onClick={()=>onNavigate?.("schedules")}><CalendarDays/> فتح الجدول</PrimaryButton>:null}
     {reportView?<button type="button" className="editorial-text-action" onClick={()=>onNavigate?.(reportView)}>عرض التقرير اليومي <ArrowLeft/></button>:searchView?<button type="button" className="editorial-text-action" onClick={()=>onNavigate?.(searchView)}>استعلام سريع <ArrowLeft/></button>:null}
    </div>
   </section>

   <section className="editorial-dayline" aria-label="محاضرات اليوم">
    <header><span>محاضرات اليوم</span><small>{data.latestTermName}</small></header>
    {data.today.length?<ol>{data.today.slice(0,3).map((row,index)=><li key={row.id}>
     <button type="button" onClick={()=>onNavigate?.("schedules")}>
      <span className="editorial-sequence">{index+1}</span>
      <time dir="ltr"><strong>{row.startTime}</strong><small>{row.endTime}</small></time>
      <div><strong>{row.courseName}</strong><small>{row.courseCode} · {row.instructorName}</small><span><Building2/>{row.roomCode}-{row.roomHall}</span></div>
     </button>
    </li>)}</ol>:<div className="editorial-all-clear"><CheckCircle2/><div><strong>اليوم هادئ</strong><span>لا توجد محاضرات ظاهرة ضمن نطاق صلاحياتك.</span></div></div>}
   </section>

   <section className={`editorial-decision-zone level-${decisionLevel}`} aria-label="القرار الأهم">
    <header><div><span>{primaryDecision?"يحتاج قرارك":"تحت السيطرة"}</span><h2>{primaryDecision?.title||primaryDecision?.label||"لا توجد تعارضات حرجة"}</h2><p>{primaryDecision?.detail||primaryDecision?.description||primaryDecision?.message||"لا يوجد أمر عاجل يقطع سير الجدول الآن."}</p></div><span className="editorial-decision-symbol">{primaryDecision?<ShieldAlert/>:<CheckCircle2/>}</span></header>
    {primaryDecision?<div className="editorial-decision-facts">
     {decisions.slice(0,2).map((item:any,index:number)=><button type="button" key={item.id||item.title||index} onClick={()=>onNavigate?.("schedules")}><b>0{index+1}</b><span><strong>{item.title||item.label||"مراجعة الجدول"}</strong><small>{item.detail||item.description||item.message||"افتح الجدول لرؤية الأثر."}</small></span><ArrowLeft/></button>)}
    </div>:null}
    <footer><span><Clock3/> آخر قراءة الآن</span>{primaryDecision&&canManageSchedule?<button type="button" onClick={()=>onNavigate?.("schedules")}>معالجة القرار <ArrowLeft/></button>:null}</footer>
   </section>

   <section className="editorial-scope-summary" aria-label="نطاق التشغيل">
    <article><GraduationCap/><div><small>الفصل الدراسي</small><strong>{data.latestTermName||"—"}</strong></div></article>
    <article><UsersRound/><div><small>نطاق الجدول</small><strong>{modeLabel}</strong></div></article>
    <article><CalendarClock/><div><small>اليوم</small><strong>{dateLabel}</strong></div></article>
   </section>

   <section className={`dashboard-insights editorial-details ${detailsOpen?"open":""}`}>
    <button className="dashboard-insights-toggle" type="button" onClick={()=>setDetailsOpen(v=>!v)} aria-expanded={detailsOpen}><span><Sparkles/><div><strong>تفاصيل التشغيل</strong><small>المؤشرات والتحليلات التفصيلية عند الحاجة فقط.</small></div></span><ChevronDown/></button>
    {detailsOpen?<div className="pulse-legacy-details">
     <div className="dashboard-metric-ribbon" aria-label="ملخص سريع">
      <article><BookOpen/><div><strong>{data.metrics.courses.toLocaleString("ar-KW-u-nu-latn")}</strong><span>مقرر</span></div></article>
      <article><CalendarDays/><div><strong>{data.metrics.schedules.toLocaleString("ar-KW-u-nu-latn")}</strong><span>موعد</span></div></article>
      <article><UsersRound/><div><strong>{data.metrics.instructors.toLocaleString("ar-KW-u-nu-latn")}</strong><span>أستاذ</span></div></article>
      <article><GraduationCap/><div><strong>{data.metrics.terms.toLocaleString("ar-KW-u-nu-latn")}</strong><span>فصل</span></div></article>
      {overview?<article className="metric-priority"><Clock3/><div><strong>{overview.metrics?.avgInstructorGap||0}</strong><span>دقيقة فراغ متوسط</span></div></article>:null}
     </div>
     {power&&ws?<div className="dashboard-insight-grid">
      <article className="insight-occupancy"><div className="insight-head"><span><DoorOpen/></span><div><small>إشغال القاعات</small><strong>{ws.roomOccupancyPeak}%</strong></div></div><p>{ws.peakOccupiedRooms} من {ws.uniqueRooms} قاعة في أعلى نقطة استخدام متزامن.</p><div className="thin-meter"><i style={{width:`${Math.min(100,ws.roomOccupancyPeak)}%`}}/></div></article>
      <article><div className="insight-head"><span><CalendarClock/></span><div><small>حركة الأسبوع</small><strong>توزيع المحاضرات</strong></div></div><div className="quiet-bars">{ws.weekdayLoad.map(x=><div key={x.key}><span>{x.label}</span><i><b style={{width:`${Math.round(x.count/maxDay*100)}%`}}/></i><strong>{x.count}</strong></div>)}</div></article>
      <article><div className="insight-head"><span><Clock3/></span><div><small>ذروة اليوم</small><strong>أكثر الساعات ازدحاماً</strong></div></div><div className="quiet-bars">{ws.busiestHours.slice(0,6).map(x=><div key={x.hour}><span dir="ltr">{x.hour}</span><i><b style={{width:`${Math.round(x.count/maxHour*100)}%`}}/></i><strong>{x.count}</strong></div>)}</div></article>
      <article><div className="insight-head"><span><Building2/></span><div><small>القاعات</small><strong>الأكثر استخداماً</strong></div></div><div className="quiet-rank">{ws.busiestRooms.slice(0,6).map((x,i)=><div key={x.room}><b>{i+1}</b><span>{x.room.replace(" / "," / قاعة ")}</span><small>{x.count} موعد</small></div>)}</div></article>
     </div>:null}
    </div>:null}
   </section>
  </>}
 </div>
}
