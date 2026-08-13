import React,{useEffect,useMemo,useState}from"react";
import{ArrowLeft,BookOpen,Building2,CalendarClock,CalendarDays,CheckCircle2,ChevronDown,Clock3,DoorOpen,GraduationCap,ShieldAlert,Sparkles,UsersRound}from"lucide-react";
import{Notice,PrimaryButton}from"./ui";

interface DashboardProps{user:any;scopes:any[];canManageSchedule?:boolean;onNavigate?:(view:string)=>void;searchView?:string;reportView?:string}
interface DashboardData{history?:Array<{termId:number;termName:string;schedules:number;rooms:number;instructors:number}>;previous?:{termId:number;termName:string;schedules:number;rooms:number;instructors:number}|null;metrics:{courses:number;schedules:number;terms:number;instructors:number};latestTermName:string;dayName:string;dashboardTotal:number;today:Array<{id:number;instructorName:string;courseCode:string;courseName:string;startTime:string;endTime:string;roomCode:string;roomHall:string}>;workspace?:{mode:"admin"|"personal"|"scope";activeSchedules:number;uniqueRooms:number;uniqueInstructors:number;roomOccupancyPeak:number;peakOccupiedRooms:number;weekdayLoad:Array<{key:string;label:string;count:number}>;busiestHours:Array<{hour:string;count:number}>;busiestRooms:Array<{room:string;count:number}>;scopeCount:number;linkedInstructorName:string;personalToday:any[]}}

const num=(value:number|undefined)=>Number(value||0).toLocaleString("ar-KW-u-nu-latn");
const DAY_START=7*60,DAY_END=21*60,DAY_SPAN=DAY_END-DAY_START;
const minutesOf=(value:string)=>{const[h,m]=String(value||"0:0").split(":").map(Number);return(h||0)*60+(m||0)};
const spot=(minutes:number)=>`${Math.min(100,Math.max(0,((minutes-DAY_START)/DAY_SPAN)*100))}%`;
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

/** Circular gauge. The number carries the meaning; the arc carries the feeling. */
function Gauge({value,label,suffix,tone="accent"}:{value:number;label:string;suffix?:string;tone?:"accent"|"brass"|"warning"}){
 const radius=34,circumference=2*Math.PI*radius;
 const filled=circumference*Math.min(100,Math.max(0,value))/100;
 return <figure className={`gauge gauge-${tone}`}>
  <svg viewBox="0 0 80 80" aria-hidden="true">
   <circle className="gauge-track" cx="40" cy="40" r={radius}/>
   <circle className="gauge-value" cx="40" cy="40" r={radius} strokeDasharray={`${filled} ${circumference}`}/>
  </svg>
  <b>{num(value)}{suffix?<i>{suffix}</i>:null}</b>
  <figcaption>{label}</figcaption>
 </figure>;
}

export default function Dashboard({user,scopes,canManageSchedule=false,onNavigate,searchView,reportView}:DashboardProps){
 const[data,setData]=useState<DashboardData|null>(null),[overview,setOverview]=useState<any>(null),[living,setLiving]=useState<any>(null),[error,setError]=useState<string|null>(null),[detailsOpen,setDetailsOpen]=useState(false);
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
 const decisions:Array<any>=living?.pulse?.items||overview?.alerts?.slice?.(0,3)||[];
 const primaryDecision=decisions[0];
 const now=new Date();
 const greeting=now.getHours()<12?"صباح الخير":"مساء الخير";
 const dateLabel=new Intl.DateTimeFormat("ar-KW-u-nu-latn",{weekday:"long",day:"numeric",month:"long"}).format(now);
 const decisionLevel=String(primaryDecision?.severity||primaryDecision?.level||"info");
 const today=data?.today||[];
 const nowMinutes=now.getHours()*60+now.getMinutes();
 const nowVisible=nowMinutes>=DAY_START&&nowMinutes<=DAY_END;
 const nextUp=useMemo(()=>today.find(row=>minutesOf(row.startTime)>=nowMinutes)||null,[today,nowMinutes]);

 return <div className="content-stack dashboard-page command-deck">
  <header className="deck-bar">
   <span className="deck-avatar" aria-hidden="true">{user.Name?.trim()?.charAt(0)||"م"}</span>
   <div className="deck-identity">
    <strong>{greeting}</strong>
    <small>{user.Name}</small>
   </div>
   <span className="deck-chip"><CalendarDays aria-hidden="true"/>{dateLabel}</span>
   {data?.latestTermName?<span className="deck-chip"><GraduationCap aria-hidden="true"/>{data.latestTermName}</span>:null}
   <span className="deck-live" title="قراءة حيّة"><i/></span>
  </header>

  {error?<Notice>{error}</Notice>:null}

  {!data?<div className="dashboard-canvas-skeleton"><i/><i/><i/></div>:<>
   <section className="deck-today" aria-label="مسار اليوم">
    <div className="deck-today-lead">
     <b>{num(today.length)}</b>
     <span>اليوم</span>
     {nextUp?<em dir="ltr">{nextUp.startTime}</em>:null}
    </div>
    <div className="daybar">
     <div className="daybar-track">
      {[9,11,13,15,17,19].map(hour=><i key={hour} className="daybar-grid" style={{insetInlineStart:spot(hour*60)}}/>)}
      {today.map(row=>{
       const start=minutesOf(row.startTime),end=Math.max(start+30,minutesOf(row.endTime));
       return <button
        key={row.id}
        type="button"
        className="daybar-block"
        style={{insetInlineStart:spot(start),width:`${((end-start)/DAY_SPAN)*100}%`}}
        title={`${row.courseCode} · ${row.courseName} · ${row.startTime}-${row.endTime} · ${row.roomCode}/${row.roomHall} · ${row.instructorName}`}
        onClick={()=>onNavigate?.("schedules")}
       ><b>{row.courseCode}</b></button>;
      })}
      {nowVisible?<span className="daybar-now" style={{insetInlineStart:spot(nowMinutes)}} aria-hidden="true"/>:null}
     </div>
     <div className="daybar-scale" aria-hidden="true">
      {[7,10,13,16,19].map(hour=><span key={hour} style={{insetInlineStart:spot(hour*60)}} dir="ltr">{String(hour).padStart(2,"0")}</span>)}
     </div>
    </div>
    {today.length?null:<p className="deck-clear"><CheckCircle2 aria-hidden="true"/>لا محاضرات</p>}
    <div className="deck-today-actions">
     {canManageSchedule?<PrimaryButton onClick={()=>onNavigate?.("schedules")}><CalendarDays aria-hidden="true"/>الجدول</PrimaryButton>:null}
     {reportView||searchView?<button type="button" className="editorial-text-action" onClick={()=>onNavigate?.((reportView||searchView) as string)}>التقارير<ArrowLeft aria-hidden="true"/></button>:null}
    </div>
   </section>

   {living?.health?<section className="deck-gauges" aria-label="مؤشرات الجدول">
    <Gauge value={Number(living.health.quality)||0} label="جودة"/>
    <Gauge value={Number(living.health.resilience)||0} label="مرونة" tone="brass"/>
    <Gauge value={Number(living.health.fairness)||0} label="عدالة" tone="warning"/>
    {ws?<Gauge value={Number(ws.roomOccupancyPeak)||0} label="إشغال" suffix="٪"/>:null}
   </section>:null}

   <section className={`deck-decision level-${decisionLevel}`} aria-label="القرار الأهم">
    <span className="deck-decision-mark">{primaryDecision?<ShieldAlert aria-hidden="true"/>:<CheckCircle2 aria-hidden="true"/>}</span>
    <div>
     <strong>{primaryDecision?.title||primaryDecision?.label||"لا تعارضات"}</strong>
     {primaryDecision?<small>{primaryDecision.detail||primaryDecision.description||primaryDecision.message}</small>:null}
    </div>
    {decisions.length>1?<span className="deck-decision-count">{num(decisions.length)}</span>:null}
    {primaryDecision&&canManageSchedule?<button type="button" aria-label="معالجة القرار" onClick={()=>onNavigate?.("schedules")}><ArrowLeft aria-hidden="true"/></button>:null}
   </section>

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
    {overview?.metrics?.avgInstructorGap!=null?<article className="metric-priority"><Clock3 aria-hidden="true"/><b>{num(overview.metrics.avgInstructorGap)}</b><span>د فراغ</span></article>:null}
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

   {power&&ws?<section className="deck-charts">
    <article className="deck-chart" aria-label="حركة الأسبوع">
     <header><CalendarClock aria-hidden="true"/><span>الأسبوع</span></header>
     <div className="bar-columns">
      {ws.weekdayLoad.map(day=><div key={day.key} title={`${day.label}: ${num(day.count)}`}>
       <i style={{height:`${Math.max(6,Math.round(day.count/maxDay*100))}%`}}/>
       <b>{num(day.count)}</b>
       <span>{dayMark(day.label)}</span>
      </div>)}
     </div>
    </article>

    <article className="deck-chart" aria-label="ذروة الأوقات">
     <header><Clock3 aria-hidden="true"/><span>الذروة</span></header>
     <div className="bar-rows">
      {ws.busiestHours.slice(0,5).map(slot=><div key={slot.hour} title={`${slot.hour}: ${num(slot.count)}`}>
       <span dir="ltr">{slot.hour}</span>
       <i><b style={{width:`${Math.round(slot.count/maxHour*100)}%`}}/></i>
       <em>{num(slot.count)}</em>
      </div>)}
     </div>
    </article>

    <article className="deck-chart" aria-label="أكثر القاعات استخداماً">
     <header><Building2 aria-hidden="true"/><span>القاعات</span></header>
     <div className="rank-rows">
      {ws.busiestRooms.slice(0,5).map((room,index)=><div key={room.room}>
       <b>{index+1}</b>
       <span>{room.room}</span>
       <em>{num(room.count)}</em>
      </div>)}
     </div>
    </article>
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
