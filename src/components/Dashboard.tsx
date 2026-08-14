import React,{useEffect,useMemo,useState}from"react";
import{ArrowLeft,BookOpen,Building2,CalendarClock,CalendarDays,CheckCircle2,ChevronDown,Clock3,DoorOpen,GraduationCap,ShieldAlert,Sparkles,UsersRound}from"lucide-react";
import{Notice,PrimaryButton}from"./ui";
import{SCHEDULE_DAY_END,SCHEDULE_DAY_SPAN,SCHEDULE_DAY_START}from"../utils/scheduleTime";

interface DashboardProps{user:any;scopes:any[];canManageSchedule?:boolean;onNavigate?:(view:string)=>void;searchView?:string;reportView?:string}
interface DashboardData{history?:Array<{termId:number;termName:string;schedules:number;rooms:number;instructors:number}>;previous?:{termId:number;termName:string;schedules:number;rooms:number;instructors:number}|null;metrics:{courses:number;schedules:number;terms:number;instructors:number};latestTermName:string;dayName:string;weekend?:boolean;dashboardTotal:number;today:Array<{id:number;instructorName:string;courseCode:string;courseName:string;startTime:string;endTime:string;roomCode:string;roomHall:string}>;workspace?:{mode:"admin"|"personal"|"scope";activeSchedules:number;uniqueRooms:number;uniqueInstructors:number;roomOccupancyPeak:number;peakOccupiedRooms:number;weekdayLoad:Array<{key:string;label:string;count:number}>;busiestHours:Array<{hour:string;count:number}>;busiestRooms:Array<{room:string;count:number}>;scopeCount:number;linkedInstructorName:string;personalToday:any[]}}
interface DecisionItem{severity?:string;level?:string;title?:string;label?:string;detail?:string;description?:string;message?:string}

const num=(value:number|undefined)=>Number(value||0).toLocaleString("ar-KW-u-nu-latn");
const minutesOf=(value:string)=>{const[h,m]=String(value||"0:0").split(":").map(Number);return(h||0)*60+(m||0)};
const spot=(minutes:number)=>`${Math.min(100,Math.max(0,((minutes-SCHEDULE_DAY_START)/SCHEDULE_DAY_SPAN)*100))}%`;
const laneWidth=(start:number,end:number)=>`${Math.max(0,(Math.min(SCHEDULE_DAY_END,end)-Math.max(SCHEDULE_DAY_START,start))/SCHEDULE_DAY_SPAN*100)}%`;
const percent=(value:unknown)=>Math.min(100,Math.max(0,Math.round(Number(value)||0)));
const decisionTitle=(item?:DecisionItem)=>item?.title||item?.label||"";
const decisionDetail=(item?:DecisionItem)=>item?.detail||item?.description||item?.message||"";
const decisionTone=(item?:DecisionItem)=>{
 const raw=String(item?.severity||item?.level||"info").toLowerCase();
 if(["critical","danger","error","high","blocker"].includes(raw))return"critical";
 if(["warning","warn","medium"].includes(raw))return"warning";
 return"info";
};
/** Single-letter day marks, the way a printed Arabic timetable labels its columns. */
const DAY_MARK:Record<string,string>={"الأحد":"ح","الاثنين":"ن","الإثنين":"ن","الثلاثاء":"ث","الأربعاء":"ر","الخميس":"خ"};
const dayMark=(label:string)=>DAY_MARK[String(label||"").trim()]||String(label||"").replace(/^ال/,"").slice(0,2);

/**
 * A number's direction, next to the number.
 *
 * "832 موعد" says how big the term is. "832 موعد ▲ 41 عن الفصل الماضي" says
 * which way the department is moving, which is the thing a coordinator is
 * actually deciding against. No arrow is drawn when nothing changed, and none
 * is drawn at all when there is no earlier term to compare with.
 */
function Delta({current,previous,invert=false}:{current:number;previous?:number|null;invert?:boolean}){
 if(previous==null||!Number.isFinite(previous))return null;
 const change=Number(current||0)-Number(previous||0);
 if(!change)return <span className="delta delta-flat" title="بلا تغيير عن الفصل الماضي">=</span>;
 // For most counts more is growth; for gaps and waste, less is the good news.
 const good=invert?change<0:change>0;
 return <span className={`delta ${good?"delta-up":"delta-down"}`} title={`عن الفصل الماضي: ${num(previous)}`}>
  <i aria-hidden="true">{change>0?"▲":"▼"}</i>
  {num(Math.abs(change))}
 </span>;
}

/**
 * Four terms of one number, drawn small.
 *
 * A delta says what changed since last term; a line says whether the department
 * has been drifting that way for a year. Four points is the smallest number
 * that can show a direction rather than a jump, and small enough to sit inside
 * a tile without competing with the figure it belongs to.
 */
function Spark({series,label}:{series:number[];label:string}){
 if(series.length<2)return null;
 const max=Math.max(...series),min=Math.min(...series),span=Math.max(1,max-min);
 const points=series.map((value,index)=>{
  const x=(index/(series.length-1))*100;
  const y=28-((value-min)/span)*24-2;
  return `${x},${y}`;
 }).join(" ");
 const rising=series[series.length-1]>=series[0];
 return <svg className={`spark ${rising?"spark-up":"spark-down"}`} viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label={label}>
  <polyline points={points} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
  <circle cx="100" cy={28-((series[series.length-1]-min)/span)*24-2} r="2.4" vectorEffect="non-scaling-stroke"/>
 </svg>;
}

export default function Dashboard({user,scopes,canManageSchedule=false,onNavigate,searchView,reportView}:DashboardProps){
 const[data,setData]=useState<DashboardData|null>(null),[overview,setOverview]=useState<any>(null),[living,setLiving]=useState<any>(null),[error,setError]=useState<string|null>(null),[attentionOpen,setAttentionOpen]=useState(false),[detailsOpen,setDetailsOpen]=useState(false);
 useEffect(()=>{(async()=>{try{
  const jobs:Promise<Response>[]=[fetch("/api/dashboard")];
  if(canManageSchedule){jobs.push(fetch("/api/intelligence/overview"));jobs.push(fetch("/api/intelligence/living"))}
  const results=await Promise.all(jobs),r=results[0],d=await r.json();
  if(!r.ok)throw new Error(d.error||"تعذر تحميل اللوحة");
  setData(d);
  if(results[1]){const pd=await results[1].json();if(results[1].ok)setOverview(pd)}
  if(results[2]){const ld=await results[2].json();if(results[2].ok)setLiving(ld)}
 }catch(e:any){setError(e.message)}})()},[canManageSchedule]);

 const power=Boolean(user?.IsAdminUser||user?.SystemUserId===1),ws=data?.workspace;
 const maxDay=useMemo(()=>Math.max(1,...(ws?.weekdayLoad||[]).map(x=>x.count)),[ws]);
 const maxHour=useMemo(()=>Math.max(1,...(ws?.busiestHours||[]).map(x=>x.count)),[ws]);
 const decisionSource:DecisionItem[]=living?.pulse
  ?(Array.isArray(living.pulse.items)?living.pulse.items:[])
  :(Array.isArray(overview?.alerts)?overview.alerts.filter((item:DecisionItem)=>decisionTitle(item)!=="الوضع مستقر"):[]);
 const attentionItems=decisionSource.filter(item=>Boolean(decisionTitle(item)));
 const decisions=attentionItems.slice(0,3);
 const primaryDecision=decisions[0];
 const now=new Date();
 const greeting=now.getHours()<12?"صباح الخير":"مساء الخير";
 const dateLabel=new Intl.DateTimeFormat("ar-KW-u-nu-latn",{weekday:"long",day:"numeric",month:"long"}).format(now);
 const dateValue=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
 const decisionLevel=decisionTone(primaryDecision);
 const today=data?.today||[];
 const nowMinutes=now.getHours()*60+now.getMinutes();
 const nowVisible=nowMinutes>=SCHEDULE_DAY_START&&nowMinutes<=SCHEDULE_DAY_END;
 const currentLecture=useMemo(()=>today.find(row=>minutesOf(row.startTime)<=nowMinutes&&minutesOf(row.endTime)>nowMinutes)||null,[today,nowMinutes]);
 const nextUp=useMemo(()=>currentLecture||today.find(row=>minutesOf(row.startTime)>=nowMinutes)||null,[today,currentLecture,nowMinutes]);
 const healthLines=living?.health?[{
  label:"جودة",value:percent(living.health.quality)
 },{
  label:"مرونة",value:percent(living.health.resilience)
 },{
  label:"عدالة",value:percent(living.health.fairness)
 },...(ws?[{label:"إشغال",value:percent(ws.roomOccupancyPeak)}]:[])]:[];
 // The ordered readiness strip: the five figures a coordinator actually decides
 // against — today's load, live conflicts, room pressure, wasted gap, readiness —
 // gathered into one quiet row instead of a wall of competing tiles. A single
 // warning colour is reserved for a real conflict count; every other figure is ink.
 const criticalCount=canManageSchedule?decisionSource.filter(item=>decisionTone(item)==="critical").length:null;
 const signals:Array<{key:string;label:string;value:string;tone?:"danger"}>=[
  {key:"today",label:"محاضرات اليوم",value:num(today.length)},
  criticalCount!=null?{key:"conflicts",label:"تعارضات حرجة",value:num(criticalCount),tone:criticalCount>0?"danger":undefined}:null,
  ws?{key:"rooms",label:"قاعات مشغولة",value:num(ws.peakOccupiedRooms)}:null,
  overview?.metrics?.avgInstructorGap!=null?{key:"gap",label:"متوسط الفراغ",value:`${num(overview.metrics.avgInstructorGap)} د`}:null,
  living?.health?{key:"ready",label:"الجاهزية",value:`${num(percent(living.health.quality))}٪`}:null,
 ].filter(Boolean) as Array<{key:string;label:string;value:string;tone?:"danger"}>;

 return <div className="content-stack dashboard-page command-deck">
  <header className="deck-bar" aria-label="ملخص الحساب والنطاق الحالي">
   <span className="deck-avatar" aria-hidden="true">{user?.Name?.trim()?.charAt(0)||"م"}</span>
   <div className="deck-identity">
    <strong>{greeting}</strong>
    <small>{user?.Name}</small>
   </div>
   <time className="deck-chip" dateTime={dateValue}><CalendarDays aria-hidden="true"/>{dateLabel}</time>
   {data?.latestTermName?<span className="deck-chip"><GraduationCap aria-hidden="true"/>{data.latestTermName}</span>:null}
   <span className="deck-live" role="status" aria-label="البيانات محدّثة"><i aria-hidden="true"/></span>
  </header>

  {error?<Notice>{error}</Notice>:null}

  {!data?<div className="dashboard-canvas-skeleton" role="status" aria-live="polite"><span className="sr-only">جاري تحميل لوحة القيادة</span><i/><i/><i/></div>:<>
   <section className={`deck-decision level-${decisionLevel}`} aria-labelledby="dashboard-primary-decision">
    <span className="deck-decision-mark">{primaryDecision?<ShieldAlert aria-hidden="true"/>:<CheckCircle2 aria-hidden="true"/>}</span>
    <div>
     <strong id="dashboard-primary-decision">{decisionTitle(primaryDecision)||"الجدول سليم"}</strong>
     <small>{primaryDecision?decisionDetail(primaryDecision):"لا توجد أمور تتطلب قراراً في القراءة الحالية."}</small>
    </div>
    {decisions.length>1?<span className="deck-decision-count" aria-label={`${num(decisions.length)} أمور تستحق الانتباه`}>{num(decisions.length)}</span>:null}
    {primaryDecision&&canManageSchedule?<button type="button" aria-label={`معالجة: ${decisionTitle(primaryDecision)}`} onClick={()=>onNavigate?.("schedules")}><ArrowLeft aria-hidden="true"/></button>:null}
   </section>

   {signals.length>1?<section className="deck-signals" aria-label="مؤشرات الجاهزية">
    {signals.map(item=><article key={item.key} className={item.tone?`signal-${item.tone}`:undefined}>
     <b>{item.value}</b>
     <span>{item.label}</span>
    </article>)}
   </section>:null}

   {decisions.length>1?<section className={`dashboard-insights dashboard-attention ${attentionOpen?"open":""}`} aria-labelledby="dashboard-attention-title">
    <button className="dashboard-insights-toggle" type="button" onClick={()=>setAttentionOpen(v=>!v)} aria-expanded={attentionOpen} aria-controls="dashboard-attention-list">
     <span><ShieldAlert aria-hidden="true"/><strong id="dashboard-attention-title">يحتاج انتباهك</strong><small className="dashboard-attention-summary">{num(attentionItems.length-1)} إضافية</small></span>
     <ChevronDown aria-hidden="true"/>
    </button>
    {attentionOpen?<div className="pulse-legacy-details" id="dashboard-attention-list">
     <div className="pulse-decisions dashboard-attention-list" role="list">
      {decisions.slice(1).map((item,index)=><article key={`${decisionTitle(item)}-${index}`} className={decisionTone(item)} role="listitem">
       <span aria-hidden="true">{index+2}</span>
       <div><strong>{decisionTitle(item)}</strong>{decisionDetail(item)?<p>{decisionDetail(item)}</p>:null}</div>
       {canManageSchedule?<button type="button" aria-label={`معالجة: ${decisionTitle(item)}`} onClick={()=>onNavigate?.("schedules")}><ArrowLeft aria-hidden="true"/></button>:<span aria-hidden="true"/>}
      </article>)}
     </div>
     {attentionItems.length>decisions.length?<button type="button" className="dashboard-attention-all" onClick={()=>onNavigate?.(canManageSchedule?"intelligence":"schedules")}>عرض الكل · {num(attentionItems.length)}<ArrowLeft aria-hidden="true"/></button>:null}
    </div>:null}
   </section>:null}

   <section className="deck-today" aria-labelledby="dashboard-today-title">
    <h2 className="sr-only" id="dashboard-today-title">مسار محاضرات اليوم</h2>
    <div className="deck-today-lead">
     <b aria-label={`${num(today.length)} محاضرة اليوم`}>{num(today.length)}</b>
     <span>اليوم</span>
     {nextUp?<em dir="ltr" title={currentLecture?`المحاضرة الجارية حتى ${nextUp.endTime}`:`المحاضرة التالية تبدأ ${nextUp.startTime}`} aria-label={currentLecture?`المحاضرة الجارية حتى ${nextUp.endTime}`:`المحاضرة التالية تبدأ ${nextUp.startTime}`}>{currentLecture?nextUp.endTime:nextUp.startTime}</em>:null}
    </div>
    <div className="daybar">
     <div className="daybar-track" role="group" aria-label="المحاضرات موزعة على ساعات اليوم">
      {[8,10,12,14,16,18,20].map(hour=><i key={hour} className="daybar-grid" style={{insetInlineStart:spot(hour*60)}} aria-hidden="true"/>)}
      {today.map(row=>{
       const start=minutesOf(row.startTime),end=Math.max(start+30,minutesOf(row.endTime));
       const description=`${row.courseCode}، ${row.courseName}، من ${row.startTime} إلى ${row.endTime}، قاعة ${row.roomCode}/${row.roomHall}، ${row.instructorName}`;
       return <button
        key={row.id}
        type="button"
        className="daybar-block"
        style={{insetInlineStart:spot(start),width:laneWidth(start,end)}}
        title={description}
        aria-label={description}
        onClick={()=>onNavigate?.("schedules")}
       ><b>{row.courseCode}</b></button>;
      })}
      {nowVisible?<span className="daybar-now" style={{insetInlineStart:spot(nowMinutes)}} aria-hidden="true"/>:null}
     </div>
     <div className="daybar-scale" aria-hidden="true">
      {[8,11,14,17,20].map(hour=><span key={hour} style={{insetInlineStart:spot(hour*60)}} dir="ltr">{String(hour).padStart(2,"0")}</span>)}
     </div>
    </div>
    {/* On a weekend the row below is Sunday's schedule, not today's — saying
     which day is being shown costs one line and prevents a reader from
     planning a Friday around Sunday's lectures. */}
    {data?.weekend?<p className="deck-clear deck-weekend"><CalendarDays aria-hidden="true"/>عطلة نهاية الأسبوع — المعروض جدول الأحد</p>
     :today.length?null:<p className="deck-clear"><CheckCircle2 aria-hidden="true"/>لا محاضرات</p>}
    <div className="deck-today-actions">
     {canManageSchedule?<PrimaryButton onClick={()=>onNavigate?.("schedules")}><CalendarDays aria-hidden="true"/>الجدول</PrimaryButton>:null}
     {reportView||searchView?<button type="button" className="editorial-text-action" onClick={()=>onNavigate?.((reportView||searchView) as string)}>التقارير<ArrowLeft aria-hidden="true"/></button>:null}
    </div>
   </section>

   {healthLines.length?<section className="deck-chart dashboard-health-ribbon" aria-labelledby="dashboard-health-title">
    <header><CheckCircle2 aria-hidden="true"/><span id="dashboard-health-title">صحة الجدول</span></header>
    <div className="bar-rows dashboard-health-lines">
     {healthLines.map(item=><div key={item.label} className="dashboard-health-factor">
      <span>{item.label}</span>
      <i role="progressbar" aria-label={`مؤشر ${item.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.value}><b style={{width:`${item.value}%`}} aria-hidden="true"/></i>
      <em>{num(item.value)}٪</em>
     </div>)}
    </div>
   </section>:null}

   <section className="deck-metrics" aria-label="أرقام النطاق">
    <article><BookOpen aria-hidden="true"/><b>{num(data.metrics.courses)}</b><span>مقرر</span></article>
    <article>
     <CalendarDays aria-hidden="true"/>
     <b>{num(data.metrics.schedules)}<Delta current={data.metrics.schedules} previous={data.previous?.schedules}/></b>
     <span>موعد</span>
     <Spark series={(data.history||[]).map(x=>x.schedules)} label="مواعيد آخر أربعة فصول"/>
    </article>
    <article>
     <UsersRound aria-hidden="true"/>
     <b>{num(data.metrics.instructors)}<Delta current={data.metrics.instructors} previous={data.previous?.instructors}/></b>
     <span>أستاذ</span>
     <Spark series={(data.history||[]).map(x=>x.instructors)} label="أساتذة آخر أربعة فصول"/>
    </article>
    {ws?<article>
     <DoorOpen aria-hidden="true"/>
     <b>{num(ws.uniqueRooms)}<Delta current={ws.uniqueRooms} previous={data.previous?.rooms}/></b>
     <span>قاعة</span>
     <Spark series={(data.history||[]).map(x=>x.rooms)} label="قاعات آخر أربعة فصول"/>
    </article>:null}
   </section>
   {/*
     The sparklines' own caption.
     Naming all four terms in one sentence produced a line longer than the row
     of cards it described and wrapped it onto a second line; the two ends of
     the range say the same thing and fit.
   */}
   {data.history&&data.history.length>1?<p className="deck-compare-note">
     <span>الخط يغطي</span>
     <b>{data.history[0]?.termName}</b>
     <i aria-hidden="true">←</i>
     <b>{data.history[data.history.length-1]?.termName}</b>
     <em>{num(data.history.length)} فصول</em>
   </p>:data.previous?.termName?<p className="deck-compare-note"><span>المقارنة مع</span><b>{data.previous.termName}</b></p>:null}

   {ws?<section className="deck-charts dashboard-workload-preview" aria-label="قراءة حمل الجدول">
    <article className="deck-chart dashboard-week-preview" aria-labelledby="dashboard-week-title">
     <header><CalendarClock aria-hidden="true"/><span id="dashboard-week-title">حمل الأسبوع</span></header>
     <div className="bar-columns" role="list" aria-label="عدد المواعيد في كل يوم">
      {ws.weekdayLoad.map(day=><div key={day.key} role="listitem" aria-label={`${day.label}: ${num(day.count)} موعد`} title={`${day.label}: ${num(day.count)}`}>
       <i style={{height:day.count?`${Math.max(6,Math.round(day.count/maxDay*100))}%`:"0%"}} aria-hidden="true"/>
       <b aria-hidden="true">{num(day.count)}</b>
       <span aria-hidden="true">{dayMark(day.label)}</span>
      </div>)}
     </div>
    </article>

    {power?<><article className="deck-chart" aria-labelledby="dashboard-peak-hours-title">
     <header><Clock3 aria-hidden="true"/><span id="dashboard-peak-hours-title">ذروة الأوقات</span></header>
     {ws.busiestHours.length?<div className="bar-rows" role="list">
      {ws.busiestHours.slice(0,5).map(slot=><div key={slot.hour} role="listitem" aria-label={`${slot.hour}: ${num(slot.count)} موعد`} title={`${slot.hour}: ${num(slot.count)}`}>
       <span dir="ltr" aria-hidden="true">{slot.hour}</span>
       <i aria-hidden="true"><b style={{width:`${Math.round(slot.count/maxHour*100)}%`}}/></i>
       <em aria-hidden="true">{num(slot.count)}</em>
      </div>)}
     </div>:<p className="deck-clear"><CheckCircle2 aria-hidden="true"/>لا توجد أوقات مزدحمة</p>}
    </article>

    <article className="deck-chart" aria-labelledby="dashboard-busiest-rooms-title">
     <header><Building2 aria-hidden="true"/><span id="dashboard-busiest-rooms-title">أكثر القاعات استخداماً</span></header>
     {ws.busiestRooms.length?<div className="rank-rows" role="list">
      {ws.busiestRooms.slice(0,5).map((room,index)=><div key={room.room} role="listitem" aria-label={`${room.room}: ${num(room.count)} موعد`}>
       <b aria-hidden="true">{index+1}</b>
       <span aria-hidden="true">{room.room}</span>
       <em aria-hidden="true">{num(room.count)}</em>
      </div>)}
     </div>:<p className="deck-clear"><CheckCircle2 aria-hidden="true"/>لا توجد قاعات مشغولة</p>}
    </article></>:null}
   </section>:null}

   {power&&ws?<section className={`dashboard-insights ${detailsOpen?"open":""}`}>
    <button className="dashboard-insights-toggle" type="button" onClick={()=>setDetailsOpen(v=>!v)} aria-expanded={detailsOpen}>
     <span><Sparkles aria-hidden="true"/><strong>تفاصيل</strong></span>
     <ChevronDown aria-hidden="true"/>
    </button>
    {detailsOpen?<div className="pulse-legacy-details">
     <div className="deck-facts">
      <div><small>النطاق</small><strong>{ws.mode==="admin"?"كل الأقسام":ws.mode==="personal"?(ws.linkedInstructorName||user.Name):`${num(scopes.length)} نطاق`}</strong></div>
      <div><small>مواعيد فعّالة</small><strong>{num(ws.activeSchedules)}</strong></div>
      <div><small>أساتذة</small><strong>{num(ws.uniqueInstructors)}</strong></div>
      <div><small>ذروة الإشغال</small><strong>{num(ws.peakOccupiedRooms)} / {num(ws.uniqueRooms)}</strong></div>
     </div>
    </div>:null}
   </section>:null}
  </>}
 </div>
}
