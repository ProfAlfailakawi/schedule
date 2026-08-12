import type { AdCourse, AdInstructor, AdTerm, FSchedule, ScheduleConstraint } from "../types";
import { activeDays, analyzeSchedule, autoScheduleProposal, conflictSolutions, findConflicts, minutesToTime, SCHEDULE_DAYS, timeToMinutes } from "./scheduleIntelligence";

const cloneRows=(rows:FSchedule[])=>rows.map(row=>({...row}));
const roomKey=(row:Partial<FSchedule>)=>`${String(row.AdRoomCode||"").trim()}|${String(row.AdRoomHall||"").trim()}`;
const replaceById=(rows:FSchedule[],next:FSchedule)=>rows.map(row=>row.id===next.id?next:row);
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

function dayGapRows(rows:FSchedule[], instructorId:number, day:keyof Pick<FSchedule,"fsunday"|"fmonday"|"ftuesday"|"fwednesday"|"fthursday">){
  const list=rows.filter(row=>row.AdInstructorId===instructorId&&Boolean(row[day])).sort((a,b)=>timeToMinutes(a.fstarttime)-timeToMinutes(b.fstarttime));
  const gaps:Array<{minutes:number;before:FSchedule;after:FSchedule}>=[];
  for(let i=1;i<list.length;i++){
    const minutes=Math.max(0,timeToMinutes(list[i].fstarttime)-timeToMinutes(list[i-1].fendtime));
    if(minutes>0)gaps.push({minutes,before:list[i-1],after:list[i]});
  }
  return gaps;
}

export function evaluateScheduleConstraints(rows:FSchedule[],constraints:ScheduleConstraint[]){
  const enabled=constraints.filter(c=>c.enabled!==false);
  const violations:Array<{constraintId:string;type:ScheduleConstraint["type"];label:string;detail:string;rowId?:number;severity:"warning"|"critical"}>=[];
  for(const c of enabled){
    if(c.type==="instructor_latest_end"&&c.AdInstructorId&&c.time){
      const limit=timeToMinutes(c.time);
      rows.filter(r=>r.AdInstructorId===c.AdInstructorId&&timeToMinutes(r.fendtime)>limit).forEach(r=>violations.push({constraintId:c.id,type:c.type,label:c.label,detail:`ينتهي ${r.AdCourseName||"المقرر"} عند ${r.fendtime} بعد الحد ${c.time}.`,rowId:r.id,severity:"critical"}));
    }
    if(c.type==="instructor_day_off"&&c.AdInstructorId&&c.day){
      rows.filter(r=>r.AdInstructorId===c.AdInstructorId&&Boolean((r as any)[c.day!])).forEach(r=>violations.push({constraintId:c.id,type:c.type,label:c.label,detail:`يوجد ${r.AdCourseName||"مقرر"} في ${SCHEDULE_DAYS.find(d=>d.key===c.day)?.label||"اليوم المحجوز"}.`,rowId:r.id,severity:"critical"}));
    }
    if(c.type==="department_day_off"&&c.day){
      rows.filter(r=>Boolean((r as any)[c.day!])).forEach(r=>violations.push({constraintId:c.id,type:c.type,label:c.label,detail:`يوجد ${r.AdCourseName||"مقرر"} في ${SCHEDULE_DAYS.find(d=>d.key===c.day)?.label||"اليوم المحجوز"}.`,rowId:r.id,severity:"critical"}));
    }
    if(c.type==="course_room"&&c.AdCourseId&&c.roomCode&&c.roomHall){
      rows.filter(r=>r.AdCourseId===c.AdCourseId&&(String(r.AdRoomCode)!==String(c.roomCode)||String(r.AdRoomHall)!==String(c.roomHall))).forEach(r=>violations.push({constraintId:c.id,type:c.type,label:c.label,detail:`الشعبة ${r.SCode} في ${r.AdRoomCode}/${r.AdRoomHall} بدل ${c.roomCode}/${c.roomHall}.`,rowId:r.id,severity:"critical"}));
    }
    if(c.type==="max_instructor_gap"&&c.maxMinutes){
      const ids=c.AdInstructorId?[c.AdInstructorId]:[...new Set(rows.map(r=>r.AdInstructorId).filter(Boolean))];
      ids.forEach(id=>SCHEDULE_DAYS.forEach(day=>dayGapRows(rows,id,day.key).filter(g=>g.minutes>Number(c.maxMinutes)).forEach(g=>violations.push({constraintId:c.id,type:c.type,label:c.label,detail:`فراغ ${g.minutes} دقيقة يوم ${day.label} بين ${g.before.fendtime} و${g.after.fstarttime}.`,rowId:g.after.id,severity:"warning"}))));
    }
  }
  const byConstraint=enabled.map(c=>({id:c.id,label:c.label,count:violations.filter(v=>v.constraintId===c.id).length}));
  return {total:violations.length,critical:violations.filter(v=>v.severity==="critical").length,warning:violations.filter(v=>v.severity==="warning").length,violations,byConstraint,healthy:violations.length===0};
}

function profileTerm(rows:FSchedule[],courses:AdCourse[],instructors:AdInstructor[]){
  const occurrences=Math.max(1,rows.reduce((sum,row)=>sum+activeDays(row).length,0));
  const dayShares=Object.fromEntries(SCHEDULE_DAYS.map(day=>[day.key,Math.round(rows.filter(r=>Boolean(r[day.key])).length/occurrences*1000)/10]));
  const buckets=[{key:"08-10",from:8*60,to:10*60},{key:"10-12",from:10*60,to:12*60},{key:"12-14",from:12*60,to:14*60},{key:"14-16",from:14*60,to:16*60},{key:"16+",from:16*60,to:24*60}];
  const timeShares=Object.fromEntries(buckets.map(b=>[b.key,Math.round(rows.filter(r=>{const m=timeToMinutes(r.fstarttime);return m>=b.from&&m<b.to}).length/Math.max(1,rows.length)*1000)/10]));
  const roomCounts=new Map<string,number>();rows.forEach(r=>{const key=roomKey(r);if(key!=="|")roomCounts.set(key,(roomCounts.get(key)||0)+1)});
  const rooms=[...roomCounts.entries()].sort((a,b)=>b[1]-a[1]).map(([key,count])=>({key,count,share:Math.round(count/Math.max(1,rows.length)*1000)/10}));
  const analysis=analyzeSchedule(rows,rows,courses,instructors);
  const peak=[...analysis.heatmap].sort((a:any,b:any)=>b.count-a.count).slice(0,5);
  return {count:rows.length,occurrences,dayShares,timeShares,rooms,avgGap:analysis.metrics.avgInstructorGap,imbalance:analysis.metrics.imbalance,lateRows:analysis.metrics.lateRows,peak};
}

export function buildScheduleGenome(allSectionRows:FSchedule[],terms:AdTerm[],currentTermId:number,courses:AdCourse[],instructors:AdInstructor[]){
  const sorted=[...terms].sort((a,b)=>b.AdTermId-a.AdTermId);
  const currentRows=allSectionRows.filter(r=>r.AdTermId===currentTermId);
  const previous=sorted.filter(t=>t.AdTermId<currentTermId&&allSectionRows.some(r=>r.AdTermId===t.AdTermId));
  const historyTerms=(previous.length?previous:sorted.filter(t=>t.AdTermId!==currentTermId&&allSectionRows.some(r=>r.AdTermId===t.AdTermId))).slice(0,4);
  const historical=historyTerms.map(term=>({term,profile:profileTerm(allSectionRows.filter(r=>r.AdTermId===term.AdTermId),courses,instructors)}));
  const current=profileTerm(currentRows,courses,instructors);
  if(!historical.length)return {available:false,current,history:[],compatibility:null,deviations:[{kind:"history",severity:"info",title:"لا توجد فصول سابقة كافية",detail:"سيبدأ Schedule Genome ببناء بصمة القسم بعد توفر فصل سابق واحد على الأقل."}],dna:{dayShares:current.dayShares,timeShares:current.timeShares,rooms:current.rooms.slice(0,5),avgGap:current.avgGap}};
  const avg=(pick:(p:any)=>number)=>historical.reduce((s,x)=>s+pick(x.profile),0)/historical.length;
  const dnaDays:any={};for(const day of SCHEDULE_DAYS)dnaDays[day.key]=Math.round(avg(p=>Number(p.dayShares[day.key]||0))*10)/10;
  const bucketKeys=["08-10","10-12","12-14","14-16","16+"];const dnaTimes:any={};for(const key of bucketKeys)dnaTimes[key]=Math.round(avg(p=>Number(p.timeShares[key]||0))*10)/10;
  const roomAgg=new Map<string,{count:number;terms:number}>();historical.forEach(({profile})=>profile.rooms.forEach((r:any)=>{const v=roomAgg.get(r.key)||{count:0,terms:0};v.count+=r.count;v.terms+=1;roomAgg.set(r.key,v)}));
  const dnaRooms=[...roomAgg.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,6).map(([key,v])=>({key,avgSessions:Math.round(v.count/historical.length*10)/10,terms:v.terms}));
  const bottleneckAgg=new Map<string,{day:string;label:string;time:string,total:number;terms:number}>();historical.forEach(({profile})=>profile.peak.forEach((cell:any)=>{const key=`${cell.day}:${cell.time}`,v=bottleneckAgg.get(key)||{day:cell.day,label:cell.label,time:cell.time,total:0,terms:0};v.total+=Number(cell.count||0);v.terms+=1;bottleneckAgg.set(key,v)}));
  const bottlenecks=[...bottleneckAgg.values()].map(v=>({...v,avgLoad:Math.round(v.total/Math.max(1,v.terms)*10)/10})).sort((a,b)=>b.avgLoad-a.avgLoad).slice(0,5);
  const dnaGap=Math.round(avg(p=>p.avgGap));
  const deviations:Array<any>=[];
  let distance=0;
  for(const day of SCHEDULE_DAYS){const cur=Number(current.dayShares[day.key]||0),base=Number(dnaDays[day.key]||0),delta=Math.round((cur-base)*10)/10;distance+=Math.abs(delta)*0.9;if(Math.abs(delta)>=8)deviations.push({kind:"day",severity:Math.abs(delta)>=15?"warning":"info",title:`${day.label}: ${delta>0?"ضغط أعلى":"حضور أقل"} من بصمة القسم`,detail:`الحالي ${cur}% مقابل متوسط تاريخي ${base}% (${delta>0?"+":""}${delta} نقطة).`})}
  for(const key of bucketKeys){const cur=Number(current.timeShares[key]||0),base=Number(dnaTimes[key]||0),delta=Math.round((cur-base)*10)/10;distance+=Math.abs(delta)*0.55;if(Math.abs(delta)>=10)deviations.push({kind:"time",severity:"info",title:`نافذة ${key} تغيّرت`,detail:`الحالي ${cur}% مقابل ${base}% تاريخياً.`})}
  const gapDelta=current.avgGap-dnaGap;distance+=Math.min(30,Math.abs(gapDelta)/6);if(Math.abs(gapDelta)>=45)deviations.push({kind:"gap",severity:gapDelta>0?"warning":"success",title:gapDelta>0?"الفراغات أطول من المعتاد":"الفراغات أفضل من المعتاد",detail:`متوسط الفراغ الحالي ${current.avgGap} دقيقة مقابل البصمة التاريخية ${dnaGap} دقيقة.`});
  const historicalRoomSet=new Set(dnaRooms.map(r=>r.key));const newTop=current.rooms.slice(0,4).filter((r:any)=>!historicalRoomSet.has(r.key));if(newTop.length)deviations.push({kind:"room",severity:"info",title:"تغيّر في القاعات المعتادة",detail:`${newTop.map((r:any)=>r.key.replace("|","/")).join("، ")} دخلت ضمن القاعات الأكثر استخداماً هذا الفصل.`});
  const compatibility=Math.round(clamp(100-distance/2.25,0,100));
  if(!deviations.length)deviations.push({kind:"stable",severity:"success",title:"الفصل قريب جداً من بصمة القسم",detail:"توزيع الأيام والأوقات والفراغات والقاعات يقع داخل النمط التاريخي المعتاد."});
  return {available:true,current,history:historical.map(({term,profile})=>({termId:term.AdTermId,termName:term.AdTermName,count:profile.count,avgGap:profile.avgGap})),compatibility,deviations:deviations.slice(0,8),dna:{dayShares:dnaDays,timeShares:dnaTimes,rooms:dnaRooms,bottlenecks,avgGap:dnaGap}};
}

export function forecastScheduleMove(existing:FSchedule,candidate:FSchedule,scopeRows:FSchedule[],termRows:FSchedule[],courses:AdCourse[],instructors:AdInstructor[],targetDay?:string){
  const beforeScope=scopeRows;
  const afterScope=replaceById(scopeRows,candidate);
  const afterTerm=replaceById(termRows,candidate);
  const before=analyzeSchedule(beforeScope,termRows,courses,instructors);
  const after=analyzeSchedule(afterScope,afterTerm,courses,instructors);
  const beforeConflicts=findConflicts([existing],termRows).filter(c=>c.rowId===existing.id||c.otherId===existing.id).length;
  const afterConflicts=findConflicts([candidate],afterTerm).filter(c=>c.rowId===candidate.id||c.otherId===candidate.id).length;
  const beforeProf=before.professorLoads.find((p:any)=>p.id===existing.AdInstructorId);
  const afterProf=after.professorLoads.find((p:any)=>p.id===existing.AdInstructorId);
  const dayKey=(targetDay&&SCHEDULE_DAYS.some(d=>d.key===targetDay)?targetDay:activeDays(candidate)[0]) as any;
  const dayLabel=SCHEDULE_DAYS.find(d=>d.key===dayKey)?.label||"اليوم";
  const beforeDay=before.dayLoad.find((d:any)=>d.key===dayKey)?.count||0,afterDay=after.dayLoad.find((d:any)=>d.key===dayKey)?.count||0;
  const pressureDelta=beforeDay?Math.round((afterDay-beforeDay)/beforeDay*100):afterDay>beforeDay?100:0;
  const qualityDelta=after.score-before.score,conflictDelta=afterConflicts-beforeConflicts,gapDelta=(afterProf?.gapMinutes||0)-(beforeProf?.gapMinutes||0);
  const effects:Array<{tone:"good"|"warn"|"neutral";text:string}>=[];
  effects.push({tone:conflictDelta<0?"good":conflictDelta>0?"warn":"neutral",text:conflictDelta<0?`يحل ${Math.abs(conflictDelta)} تعارض/علاقة لهذا الموعد`:conflictDelta>0?`يضيف ${conflictDelta} تعارض/علاقة محتملة`:"لا يغيّر تعارضات هذا الموعد"});
  effects.push({tone:gapDelta<0?"good":gapDelta>0?"warn":"neutral",text:gapDelta<0?`يقلل فراغات الأستاذ ${Math.abs(gapDelta)} دقيقة`:gapDelta>0?`يزيد فراغات الأستاذ ${gapDelta} دقيقة`:"فراغات الأستاذ تبقى تقريباً كما هي"});
  effects.push({tone:pressureDelta<=0?"good":pressureDelta>=15?"warn":"neutral",text:`ضغط ${dayLabel} ${pressureDelta>0?"يزداد":pressureDelta<0?"ينخفض":"لا يتغير"} ${Math.abs(pressureDelta)}%`});
  effects.push({tone:qualityDelta>0?"good":qualityDelta<0?"warn":"neutral",text:`مؤشر الجودة ${qualityDelta>0?"+":""}${qualityDelta}`});
  const headline=conflictDelta<0?"النقل يحل مشكلة ظاهرة":conflictDelta>0?"النقل يخلق تعارضاً جديداً":qualityDelta>0?"النقل يحسّن الجدول":"الأثر محدود؛ راجع الفراغ والضغط قبل الإفلات";
  return {headline,effects,before:{score:before.score,conflicts:beforeConflicts,professorGap:beforeProf?.gapMinutes||0,dayLoad:beforeDay},after:{score:after.score,conflicts:afterConflicts,professorGap:afterProf?.gapMinutes||0,dayLoad:afterDay},delta:{quality:qualityDelta,conflicts:conflictDelta,professorGap:gapDelta,dayPressure:pressureDelta},candidate:{id:candidate.id,start:candidate.fstarttime,end:candidate.fendtime,days:activeDays(candidate),roomCode:candidate.AdRoomCode,roomHall:candidate.AdRoomHall,targetDay:dayKey,targetDayLabel:dayLabel}};
}

function scoreScenario(baseRows:FSchedule[],scenario:FSchedule[],termRows:FSchedule[],courses:AdCourse[],instructors:AdInstructor[],constraints:ScheduleConstraint[],goal:string){
  const ids=new Set(baseRows.map(r=>r.id));const universe=[...termRows.filter(r=>!ids.has(r.id)),...scenario];
  const analysis=analyzeSchedule(scenario,universe,courses,instructors);const rule=evaluateScheduleConstraints(scenario,constraints);
  const changed=scenario.filter(r=>{const b=baseRows.find(x=>x.id===r.id);return b&&(b.fstarttime!==r.fstarttime||b.fendtime!==r.fendtime||roomKey(b)!==roomKey(r)||activeDays(b).join(",")!==activeDays(r).join(","))}).length;
  const wantsGap=/فراغ|gap/i.test(goal),wantsBalance=/توازن|ضغط|ازدحام/i.test(goal),wantsRooms=/قاعة|قاعات/i.test(goal);
  let objective=analysis.score*100-analysis.metrics.criticalConflicts*900-rule.critical*1100-rule.warning*180-changed*8;
  objective-=analysis.metrics.avgInstructorGap*(wantsGap?1.25:.45);objective-=analysis.metrics.imbalance*(wantsBalance?7:2.4);if(wantsRooms)objective-=analysis.metrics.uniqueRooms*.25;
  return {analysis,rule,changed,objective};
}

function seeded(seed:number){let x=seed>>>0;return()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296}}
function scenarioSignature(rows:FSchedule[]){return rows.map(r=>`${r.id}:${r.fstarttime}:${r.fendtime}:${roomKey(r)}`).join("|")}

export function runScheduleAutopilot(baseRows:FSchedule[],termRows:FSchedule[],courses:AdCourse[],instructors:AdInstructor[],constraints:ScheduleConstraint[],goal:string,iterations=240){
  const random=seeded((baseRows.length*2654435761+String(goal||"").length*97)>>>0);
  const starts=Array.from({length:19},(_,i)=>8*60+i*30);
  const results:Array<any>=[];const seen=new Set<string>();
  const baseline=scoreScenario(baseRows,baseRows,termRows,courses,instructors,constraints,goal);
  const push=(rows:FSchedule[])=>{const sig=scenarioSignature(rows);if(seen.has(sig))return;seen.add(sig);const scored=scoreScenario(baseRows,rows,termRows,courses,instructors,constraints,goal);results.push({rows, ...scored})};
  push(cloneRows(baseRows));
  const greedy=autoScheduleProposal(baseRows,termRows);if(greedy.changed)push(greedy.rows);
  for(let n=0;n<iterations;n++){
    let candidate=cloneRows(baseRows);
    const edits=1+Math.floor(random()*Math.max(1,Math.min(7,Math.ceil(baseRows.length/8))));
    for(let e=0;e<edits;e++){
      if(!candidate.length)break;const idx=Math.floor(random()*candidate.length),row=candidate[idx];
      const duration=Math.max(30,timeToMinutes(row.fendtime)-timeToMinutes(row.fstarttime));
      const original=timeToMinutes(row.fstarttime);const exploratory=random()<.28;let start=exploratory?starts[Math.floor(random()*starts.length)]:original+(Math.floor(random()*7)-3)*30;start=clamp(Math.round(start/30)*30,8*60,17*60);
      candidate[idx]={...row,fstarttime:minutesToTime(start),fendtime:minutesToTime(start+duration)};
    }
    push(candidate);
  }
  results.sort((a,b)=>b.objective-a.objective);
  const selected:Array<any>=[];for(const result of results){if(selected.length>=3)break;if(selected.some(s=>scenarioSignature(s.rows)===scenarioSignature(result.rows)))continue;selected.push(result)}
  const options=selected.map((item,index)=>({id:`auto-${index+1}`,rank:index+1,title:index===0?"أفضل توازن شامل":index===1?"أقل تغيير ممكن":"بديل احتياطي قوي",rows:item.rows,score:item.analysis.score,deltaScore:item.analysis.score-baseline.analysis.score,conflicts:item.analysis.metrics.criticalConflicts,avgGap:item.analysis.metrics.avgInstructorGap,imbalance:item.analysis.metrics.imbalance,constraintViolations:item.rule.total,changed:item.changed,explanation:[item.analysis.metrics.criticalConflicts<baseline.analysis.metrics.criticalConflicts?`يقلل التعارضات الحرجة من ${baseline.analysis.metrics.criticalConflicts} إلى ${item.analysis.metrics.criticalConflicts}`:`يحافظ على التعارضات عند ${item.analysis.metrics.criticalConflicts}`,item.analysis.metrics.avgInstructorGap<baseline.analysis.metrics.avgInstructorGap?`يخفض متوسط الفراغ ${baseline.analysis.metrics.avgInstructorGap-item.analysis.metrics.avgInstructorGap} دقيقة`:`متوسط الفراغ ${item.analysis.metrics.avgInstructorGap} دقيقة`,item.rule.total?`${item.rule.total} مخالفة لقواعد Constraint Canvas`:`يحترم جميع قواعد Constraint Canvas`,`${item.changed} موعداً فقط يتغير داخل السيناريو`]}));
  return {goal:String(goal||"تحسين الجدول بأقل تدخل").slice(0,240),explored:iterations,evaluated:results.length,safety:{publishes:false,changesDays:false,changesRooms:false,humanGate:true},baseline:{score:baseline.analysis.score,conflicts:baseline.analysis.metrics.criticalConflicts,avgGap:baseline.analysis.metrics.avgInstructorGap,imbalance:baseline.analysis.metrics.imbalance,constraintViolations:baseline.rule.total},options};
}

export function buildWarRoom(baseRows:FSchedule[],termRows:FSchedule[],courses:AdCourse[],instructors:AdInstructor[],constraints:ScheduleConstraint[],rowId?:number){
  const baselineUniverse=termRows;const baseline=analyzeSchedule(baseRows,baselineUniverse,courses,instructors);const conflicts=baseline.conflicts;
  let target=baseRows.find(r=>r.id===rowId);
  if(!target&&conflicts.length)target=baseRows.find(r=>r.id===conflicts[0].rowId||r.id===conflicts[0].otherId);
  if(!target){const worst=[...baseline.professorLoads].sort((a:any,b:any)=>b.maxGap-a.maxGap)[0];target=baseRows.find(r=>r.AdInstructorId===worst?.id)||baseRows[0]}
  if(!target)return {issue:null,baseline:{score:baseline.score},options:[]};
  const solutions=conflictSolutions(target,termRows,6);
  const scenarios:Array<{title:string;reason:string;rows:FSchedule[]}>=[];
  for(const sol of solutions){if(scenarios.length>=2)break;const moved={...target,fstarttime:sol.start,fendtime:sol.end,AdRoomCode:sol.roomCode,AdRoomHall:sol.roomHall};scenarios.push({title:scenarios.length?"حل متوازن":"أقل تدخل",reason:sol.reason,rows:replaceById(baseRows,moved)})}
  // A third option uses a compact global proposal but still remains only a scenario.
  const compact=cloneRows(baseRows);const profRows=compact.filter(r=>r.AdInstructorId===target!.AdInstructorId).sort((a,b)=>timeToMinutes(a.fstarttime)-timeToMinutes(b.fstarttime));
  if(profRows.length>1){const pivot=profRows[Math.min(1,profRows.length-1)],dur=Math.max(30,timeToMinutes(pivot.fendtime)-timeToMinutes(pivot.fstarttime));const anchor=timeToMinutes(profRows[0].fendtime);const shifted={...pivot,fstarttime:minutesToTime(clamp(anchor,8*60,17*60)),fendtime:minutesToTime(clamp(anchor,8*60,17*60)+dur)};scenarios.push({title:"ضغط الفراغات",reason:"يقرب مواعيد الأستاذ من بعضها لتقليل المسافات الزمنية.",rows:replaceById(baseRows,shifted)})}
  while(scenarios.length<3)scenarios.push({title:`بديل ${scenarios.length+1}`,reason:"سيناريو محافظ يبقي الجدول قريباً من الوضع الحالي.",rows:cloneRows(baseRows)});
  const ids=new Set(baseRows.map(r=>r.id));const baseProfessor=baseline.professorLoads.find((p:any)=>p.id===target!.AdInstructorId);const options=scenarios.slice(0,3).map((s,index)=>{const universe=[...termRows.filter(r=>!ids.has(r.id)),...s.rows],analysis=analyzeSchedule(s.rows,universe,courses,instructors),rules=evaluateScheduleConstraints(s.rows,constraints),scenarioTarget=s.rows.find(r=>r.id===target!.id)||target!,scenarioProfessor=analysis.professorLoads.find((p:any)=>p.id===target!.AdInstructorId),profGapDelta=(scenarioProfessor?.gapMinutes||0)-(baseProfessor?.gapMinutes||0),roomChanged=roomKey(scenarioTarget)!==roomKey(target!);return{id:`war-${index+1}`,rank:index+1,title:s.title,reason:s.reason,rows:s.rows,score:analysis.score,deltaScore:analysis.score-baseline.score,conflicts:analysis.metrics.criticalConflicts,avgGap:analysis.metrics.avgInstructorGap,imbalance:analysis.metrics.imbalance,constraintViolations:rules.total,professorImpact:{name:instructors.find(i=>i.AdInstructorId===target!.AdInstructorId)?.AdInstructorName||"أستاذ المقرر",gapDelta:profGapDelta,gapMinutes:scenarioProfessor?.gapMinutes||0},roomImpact:{changed:roomChanged,from:roomKey(target!).replace("|","/"),to:roomKey(scenarioTarget).replace("|","/")},changed:s.rows.filter(r=>{const b=baseRows.find(x=>x.id===r.id);return b&&scenarioSignature([b])!==scenarioSignature([r])}).length}});
  return {issue:{rowId:target.id,courseName:target.AdCourseName,sectionCode:target.SCode,instructorId:target.AdInstructorId,professorName:instructors.find(i=>i.AdInstructorId===target!.AdInstructorId)?.AdInstructorName||"",room:roomKey(target).replace("|","/"),conflictCount:conflicts.filter(c=>c.rowId===target!.id||c.otherId===target!.id).length},baseline:{score:baseline.score,conflicts:baseline.metrics.criticalConflicts,avgGap:baseline.metrics.avgInstructorGap,imbalance:baseline.metrics.imbalance},options};
}
