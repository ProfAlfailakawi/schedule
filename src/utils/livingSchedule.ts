import type { AdCourse, AdInstructor, FSchedule, ScheduleConstraint, ScheduleDecisionMemory } from "../types";
import { activeDays, analyzeSchedule, findConflicts, minutesToTime, SCHEDULE_DAYS, timeToMinutes } from "./scheduleIntelligence";
import { evaluateScheduleConstraints } from "./scheduleInnovation";

const DAY_LABEL = new Map(SCHEDULE_DAYS.map(day => [day.key, day.label]));
const clamp = (value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const roomKey = (row:Partial<FSchedule>)=>`${String(row.AdRoomCode||"").trim()}|${String(row.AdRoomHall||"").trim()}`;
const rowSignature = (row:Partial<FSchedule>)=>`${row.AdCourseId||0}:${row.SCode||""}:${row.AdInstructorId||0}:${activeDays(row).join(",")}:${row.fstarttime||""}:${row.fendtime||""}:${roomKey(row)}`;
const rowsEqual = (a:FSchedule,b:FSchedule)=>rowSignature(a)===rowSignature(b);
const replaceRow = (rows:FSchedule[],candidate:FSchedule)=>rows.map(row=>row.id===candidate.id?candidate:row);

function instructorGap(rows:FSchedule[], instructorId:number){
  let total=0,max=0;
  for(const day of SCHEDULE_DAYS){
    const blocks=rows.filter(r=>r.AdInstructorId===instructorId&&Boolean((r as any)[day.key])).map(r=>({start:timeToMinutes(r.fstarttime),end:timeToMinutes(r.fendtime)})).sort((a,b)=>a.start-b.start);
    for(let i=1;i<blocks.length;i++){const gap=Math.max(0,blocks[i].start-blocks[i-1].end);total+=gap;max=Math.max(max,gap)}
  }
  return {total,max};
}

function conflictCountForRow(candidate:FSchedule, universe:FSchedule[]){
  return findConflicts([candidate],universe.filter(row=>row.id!==candidate.id).concat(candidate)).filter(item=>item.rowId===candidate.id||item.otherId===candidate.id).length;
}

export function buildConflictTopology(rows:FSchedule[], universe:FSchedule[], courses:AdCourse[], instructors:AdInstructor[]){
  const courseById=new Map(courses.map(c=>[c.AdCourseId,c]));
  const instructorById=new Map(instructors.map(i=>[i.AdInstructorId,i]));
  const conflicts=findConflicts(rows,universe);
  const issueWeight=new Map<number,number>();
  for(const item of conflicts){issueWeight.set(item.rowId,(issueWeight.get(item.rowId)||0)+(item.severity==="high"?3:1));issueWeight.set(item.otherId,(issueWeight.get(item.otherId)||0)+(item.severity==="high"?3:1))}
  const nodes=new Map<string,any>(); const edges:any[]=[];
  const addNode=(id:string,type:string,label:string,meta?:string,rowId?:number)=>{const existing=nodes.get(id)||{id,type,label,meta:meta||"",weight:0,issues:0,rows:0};existing.weight+=1;existing.rows+=rowId?1:0;existing.issues+=rowId?(issueWeight.get(rowId)||0):0;nodes.set(id,existing)};
  const addEdge=(source:string,target:string,row:FSchedule)=>edges.push({id:`${source}>${target}:${row.id}`,source,target,rowId:row.id,weight:1+(issueWeight.get(row.id)||0)});
  rows.forEach(row=>{
    const instructor=`instructor:${row.AdInstructorId}`,course=`course:${row.AdCourseId}`,section=`section:${row.AdCourseId}:${row.SCode}`,room=`room:${roomKey(row)}`;
    addNode(instructor,"instructor",instructorById.get(row.AdInstructorId)?.AdInstructorName||`أستاذ ${row.AdInstructorId}`,"أستاذ المقرر",row.id);
    addNode(course,"course",courseById.get(row.AdCourseId)?.CourseCode||row.AdCourseName||`مقرر ${row.AdCourseId}`,row.AdCourseName||courseById.get(row.AdCourseId)?.CourseName||"",row.id);
    addNode(section,"section",`شعبة ${row.SCode}`,row.AdCourseName,row.id);
    addNode(room,"room",`${row.AdRoomCode}/${row.AdRoomHall}`,"قاعة",row.id);
    addEdge(instructor,course,row); addEdge(course,section,row); addEdge(section,room,row);
    activeDays(row).forEach(day=>{const time=`time:${day}:${row.fstarttime}`;addNode(time,"time",`${DAY_LABEL.get(day)||day} ${row.fstarttime}`,`${row.fstarttime}–${row.fendtime}`,row.id);addEdge(section,time,row)});
  });
  const ranked=[...nodes.values()].map(node=>({...node,centrality:node.weight+node.issues*2})).sort((a,b)=>b.centrality-a.centrality);
  return {nodes:ranked.slice(0,90),edges:edges.filter(edge=>ranked.slice(0,90).some(n=>n.id===edge.source)&&ranked.slice(0,90).some(n=>n.id===edge.target)).slice(0,220),hotspots:ranked.slice(0,8),conflicts:conflicts.length};
}

export function buildFairnessEngine(rows:FSchedule[], instructors:AdInstructor[]){
  const instructorById=new Map(instructors.map(i=>[i.AdInstructorId,i]));
  const ids=[...new Set(rows.map(r=>r.AdInstructorId).filter(Boolean))];
  const profiles=ids.map(id=>{
    const own=rows.filter(r=>r.AdInstructorId===id),days=new Set(activeDays({fsunday:own.some(r=>r.fsunday),fmonday:own.some(r=>r.fmonday),ftuesday:own.some(r=>r.ftuesday),fwednesday:own.some(r=>r.fwednesday),fthursday:own.some(r=>r.fthursday)} as any));
    const gap=instructorGap(rows,id);let early=0,late=0,weeklyMinutes=0;
    own.forEach(row=>{const meetings=Math.max(1,activeDays(row).length),duration=Math.max(0,timeToMinutes(row.fendtime)-timeToMinutes(row.fstarttime));weeklyMinutes+=duration*meetings;if(timeToMinutes(row.fstarttime)<9*60)early+=meetings;if(timeToMinutes(row.fstarttime)>=16*60)late+=meetings});
    const burden=days.size*8+(gap.total/60)*5+early*2.5+late*4+(weeklyMinutes/60)*1.2;
    return {id,name:instructorById.get(id)?.AdInstructorName||`أستاذ ${id}`,days:days.size,gapMinutes:gap.total,maxGap:gap.max,early,late,weeklyHours:Number((weeklyMinutes/60).toFixed(1)),burden:Number(burden.toFixed(1))};
  });
  const burdens=profiles.map(p=>p.burden);const avg=burdens.length?burdens.reduce((a,b)=>a+b,0)/burdens.length:0;const variance=burdens.length?burdens.reduce((s,v)=>s+(v-avg)**2,0)/burdens.length:0;const stdev=Math.sqrt(variance);const cv=avg?stdev/avg:0;const score=Math.round(clamp(100-cv*72,0,100));
  const ranked=[...profiles].sort((a,b)=>b.burden-a.burden).map(p=>({...p,deltaFromAverage:Number((p.burden-avg).toFixed(1))}));
  const warnings=ranked.filter(p=>p.deltaFromAverage>Math.max(8,avg*.28)).slice(0,5).map(p=>`${p.name}: حمله أعلى من متوسط القسم بنحو ${Math.round(p.deltaFromAverage)} نقطة.`);
  return {score,label:score>=90?"عادل جدًا":score>=78?"متوازن":score>=62?"يحتاج موازنة":"غير عادل",averageBurden:Number(avg.toFixed(1)),spread:Number(stdev.toFixed(1)),profiles:ranked,warnings};
}

function roomFreeFor(row:FSchedule, room:{code:string;hall:string}, universe:FSchedule[]){
  const candidate={...row,AdRoomCode:room.code,AdRoomHall:room.hall};
  const conflicts=findConflicts([candidate],universe.filter(x=>x.id!==row.id).concat(candidate));
  return !conflicts.some(c=>c.severity==="high"&&(c.rowId===candidate.id||c.otherId===candidate.id));
}

export function buildRoomResilience(rows:FSchedule[], universe:FSchedule[]){
  const groups=new Map<string,FSchedule[]>(); rows.forEach(r=>{const key=roomKey(r);if(key!=="|"){const list=groups.get(key)||[];list.push(r);groups.set(key,list)}});
  const universeRooms=[...new Map(universe.filter(r=>roomKey(r)!=="|").map(r=>[roomKey(r),{code:r.AdRoomCode,hall:r.AdRoomHall}])).values()];
  const rooms=[...groups.entries()].map(([key,list])=>{const [code,hall]=key.split("|");let recoverable=0;for(const row of list){if(universeRooms.some(room=>`${room.code}|${room.hall}`!==key&&roomFreeFor(row,room,universe)))recoverable++}const dependency=rows.length?list.length/rows.length:0;const recoverability=list.length?recoverable/list.length:1;const risk=clamp(dependency*72+(1-recoverability)*42,0,100);return{key,code,hall,sessions:list.length,dependencyPct:Math.round(dependency*100),recoverable,recoverabilityPct:Math.round(recoverability*100),risk:Math.round(risk),singlePoint:risk>=38&&list.length>=Math.max(3,rows.length*.08)}}).sort((a,b)=>b.risk-a.risk);
  return {rooms,topRisk:rooms[0]||null,singlePoints:rooms.filter(r=>r.singlePoint)};
}

export function buildFragilityMap(rows:FSchedule[], universe:FSchedule[], courses:AdCourse[], instructors:AdInstructor[]){
  const analysis=analyzeSchedule(rows,universe,courses,instructors);const total=Math.max(1,rows.length);const room=buildRoomResilience(rows,universe);const fairness=buildFairnessEngine(rows,instructors);
  const instructorCounts=new Map<number,number>();rows.forEach(r=>instructorCounts.set(r.AdInstructorId,(instructorCounts.get(r.AdInstructorId)||0)+1));
  const instructorById=new Map(instructors.map(i=>[i.AdInstructorId,i]));
  const professorRisk=[...instructorCounts.entries()].map(([id,count])=>({type:"instructor",key:String(id),label:instructorById.get(id)?.AdInstructorName||`أستاذ ${id}`,affected:count,impactPct:Math.round(count/total*100),severity:count/total>.12?"high":count/total>.07?"medium":"low"})).sort((a,b)=>b.affected-a.affected).slice(0,5);
  const dayRisk=SCHEDULE_DAYS.map(day=>{const count=rows.filter(r=>Boolean((r as any)[day.key])).length;return{type:"day",key:day.key,label:day.label,affected:count,impactPct:Math.round(count/total*100),severity:count/total>.32?"high":count/total>.22?"medium":"low"}}).sort((a,b)=>b.affected-a.affected);
  const roomRisk=room.rooms.slice(0,5).map(r=>({type:"room",key:r.key,label:`${r.code}/${r.hall}`,affected:r.sessions,impactPct:r.dependencyPct,severity:r.risk>=45?"high":r.risk>=28?"medium":"low",recoverabilityPct:r.recoverabilityPct}));
  const worst=Math.max(roomRisk[0]?.impactPct||0,professorRisk[0]?.impactPct||0,dayRisk[0]?.impactPct||0);const resilience=Math.round(clamp(100-worst*.9-room.singlePoints.length*2-(100-fairness.score)*.12,0,100));
  return {resilience,label:resilience>=88?"مرن":resilience>=72?"متماسك":resilience>=55?"هش جزئيًا":"هش",quality:analysis.score,roomRisk,professorRisk,dayRisk,roomIntelligence:room};
}

export function buildScheduleHealth2(rows:FSchedule[], universe:FSchedule[], courses:AdCourse[], instructors:AdInstructor[]){
  const quality=analyzeSchedule(rows,universe,courses,instructors);const fragility=buildFragilityMap(rows,universe,courses,instructors);const fairness=buildFairnessEngine(rows,instructors);const composite=Math.round(quality.score*.58+fragility.resilience*.28+fairness.score*.14);
  const descriptor=quality.score>=90&&fragility.resilience<65?"ممتاز… لكنه هش":quality.score>=85&&fairness.score<70?"قوي… لكنه غير متوازن":composite>=88?"صحي ومرن":composite>=75?"جيد مع نقاط تحسين":"يحتاج تدخل";
  return {score:composite,descriptor,quality:quality.score,resilience:fragility.resilience,fairness:fairness.score,readiness:quality.readiness,fragility};
}

export function buildSchedulePulse(rows:FSchedule[], universe:FSchedule[], courses:AdCourse[], instructors:AdInstructor[]){
  const analysis=analyzeSchedule(rows,universe,courses,instructors);const health=buildScheduleHealth2(rows,universe,courses,instructors);const issues:Array<any>=[];
  analysis.alerts.filter((alert:any)=>alert.title!=="الوضع مستقر").forEach((alert:any)=>issues.push({type:"quality",severity:alert.severity,title:alert.title,detail:alert.detail,score:alert.severity==="critical"?100:alert.severity==="warning"?70:30}));
  const room=health.fragility.roomIntelligence.topRisk;if(room?.singlePoint)issues.push({type:"room",severity:"warning",title:`${room.code}/${room.hall} نقطة اعتماد حساسة`,detail:`ترتبط بـ${room.sessions} مواعيد، ويمكن استيعاب ${room.recoverabilityPct}% منها فقط في قاعات بديلة بنفس الوقت.`,score:82});
  if(health.fairness<75)issues.push({type:"fairness",severity:"warning",title:"عدالة التوزيع تحتاج مراجعة",detail:`مؤشر العدالة ${health.fairness}/100؛ يوجد تفاوت ملحوظ في الأيام والفراغات والأوقات الثقيلة.`,score:74});
  if(health.resilience<70)issues.push({type:"fragility",severity:"warning",title:"الجدول جيد لكنه حساس للطوارئ",detail:`مؤشر المرونة ${health.resilience}/100. اختبر القاعات والأساتذة والأيام الأعلى تأثيرًا قبل الاعتماد.`,score:78});
  const unique=issues.filter((item,index,array)=>array.findIndex(other=>other.title===item.title)===index).sort((a,b)=>b.score-a.score).slice(0,3);
  return {count:unique.length,items:unique,health:{score:health.score,descriptor:health.descriptor,quality:health.quality,resilience:health.resilience,fairness:health.fairness},message:unique.length?`اليوم عندك ${unique.length} أمور تستحق القرار`:`لا يوجد أمر حرج؛ الجدول في حالة مستقرة`};
}

export function explainScheduleDecision(baseRows:FSchedule[], universe:FSchedule[], candidate:FSchedule, courses:AdCourse[], instructors:AdInstructor[], constraints:ScheduleConstraint[]=[]){
  const current=baseRows.find(r=>r.id===candidate.id);if(!current)throw new Error("الموعد غير موجود داخل نطاق الجدول");
  const baseIds=new Set(baseRows.map(r=>r.id));const external=universe.filter(r=>!baseIds.has(r.id));const scenario=replaceRow(baseRows,candidate);const scenarioUniverse=[...external,...scenario];
  const before=analyzeSchedule(baseRows,universe,courses,instructors),after=analyzeSchedule(scenario,scenarioUniverse,courses,instructors);const beforeGap=instructorGap(baseRows,current.AdInstructorId),afterGap=instructorGap(scenario,candidate.AdInstructorId);
  const beforeRules=evaluateScheduleConstraints(baseRows,constraints),afterRules=evaluateScheduleConstraints(scenario,constraints);const positives:string[]=[],tradeoffs:string[]=[],warnings:string[]=[];
  const conflictDelta=after.metrics.criticalConflicts-before.metrics.criticalConflicts;if(conflictDelta<0)positives.push(`يخفض التعارضات الحرجة بمقدار ${Math.abs(conflictDelta)}.`);else if(conflictDelta>0)warnings.push(`يزيد التعارضات الحرجة بمقدار ${conflictDelta}.`);else positives.push("لا يضيف تعارضًا حرجًا جديدًا.");
  const gapDelta=afterGap.total-beforeGap.total;if(gapDelta<0)positives.push(`يخفض فراغ الأستاذ ${Math.abs(gapDelta)} دقيقة.`);else if(gapDelta>0)tradeoffs.push(`يزيد فراغ الأستاذ ${gapDelta} دقيقة.`);
  if(roomKey(candidate)===roomKey(current))positives.push("يحافظ على القاعة الحالية.");else tradeoffs.push(`يغيّر القاعة من ${current.AdRoomCode}/${current.AdRoomHall} إلى ${candidate.AdRoomCode}/${candidate.AdRoomHall}.`);
  if(activeDays(candidate).join("|")===activeDays(current).join("|"))positives.push("يحافظ على أيام المقرر.");else tradeoffs.push(`يغيّر نمط الأيام من ${activeDays(current).map(d=>DAY_LABEL.get(d)).join("، ")} إلى ${activeDays(candidate).map(d=>DAY_LABEL.get(d)).join("، ")}.`);
  const qualityDelta=after.score-before.score;if(qualityDelta>0)positives.push(`يرفع جودة الجدول ${qualityDelta} نقاط.`);else if(qualityDelta<0)tradeoffs.push(`يخفض جودة الجدول ${Math.abs(qualityDelta)} نقاط.`);
  const imbalanceDelta=after.metrics.imbalance-before.metrics.imbalance;if(imbalanceDelta>0)tradeoffs.push(`يزيد عدم توازن الأيام ${imbalanceDelta}% تقريبًا.`);else if(imbalanceDelta<0)positives.push(`يحسن توازن الأيام ${Math.abs(imbalanceDelta)}%.`);
  const ruleDelta=afterRules.total-beforeRules.total;if(ruleDelta>0)warnings.push(`يضيف ${ruleDelta} مخالفة لقواعد Constraint Canvas.`);else if(ruleDelta<0)positives.push(`يزيل ${Math.abs(ruleDelta)} مخالفة من قواعد Constraint Canvas.`);
  const verdict=warnings.length?"ممكن، لكن يحتاج مراجعة":qualityDelta>0||conflictDelta<0||gapDelta<0?"أفضل من الوضع الحالي":"مقبول، بلا مكسب واضح";
  return {verdict,headline:`${current.AdCourseName} · شعبة ${current.SCode}`,before:{score:before.score,conflicts:before.metrics.criticalConflicts,gap:beforeGap.total,imbalance:before.metrics.imbalance,rules:beforeRules.total},after:{score:after.score,conflicts:after.metrics.criticalConflicts,gap:afterGap.total,imbalance:after.metrics.imbalance,rules:afterRules.total},delta:{score:qualityDelta,conflicts:conflictDelta,gap:gapDelta,imbalance:imbalanceDelta,rules:ruleDelta},positives,tradeoffs,warnings,candidate:{id:candidate.id,start:candidate.fstarttime,end:candidate.fendtime,room:`${candidate.AdRoomCode}/${candidate.AdRoomHall}`,days:activeDays(candidate).map(d=>DAY_LABEL.get(d)||d)}};
}

export function buildOneMinuteBrief(rows:FSchedule[], universe:FSchedule[], courses:AdCourse[], instructors:AdInstructor[], changedSince?:number){
  const pulse=buildSchedulePulse(rows,universe,courses,instructors);const health=buildScheduleHealth2(rows,universe,courses,instructors);const topology=buildConflictTopology(rows,universe,courses,instructors);const risk=health.fragility;
  const biggest=topology.hotspots[0];const riskItem=[...(risk.roomRisk||[]),...(risk.professorRisk||[]),...(risk.dayRisk||[])].sort((a:any,b:any)=>b.impactPct-a.impactPct)[0];
  return {title:`الجدول ${health.descriptor}`,summary:`الجودة ${health.quality}/100، المرونة ${health.resilience}/100، والعدالة ${health.fairness}/100. ${pulse.items[0]?.title||"لا توجد مشكلة حرجة ظاهرة."}`,topIssues:pulse.items.slice(0,3),changeSummary:changedSince==null?"لا توجد نقطة مقارنة محددة.":changedSince===0?"لا تغيير منذ نقطة المقارنة.":`${changedSince} موعدًا تغير منذ نقطة المقارنة.`,bestDecision:biggest?`ابدأ من ${biggest.label}؛ هي العقدة الأكثر اتصالًا بالمشكلات الحالية.`:"لا توجد عقدة اختناق بارزة.",largestRisk:riskItem?`${riskItem.label}: قد يتأثر نحو ${riskItem.impactPct}% من مواعيد القسم إذا خرج من الخدمة.`:"لا توجد نقطة هشاشة كبيرة ظاهرة.",seconds:60};
}

export function buildDecisionMemoryInsight(memories:ScheduleDecisionMemory[], courseId?:number){
  const filtered=memories.filter(m=>!courseId||m.AdCourseId===courseId);return {count:filtered.length,recent:filtered.slice(0,8),warning:filtered[0]?`سبق رفض خيار قريب: ${filtered[0].reason}`:"لا توجد ذاكرة رفض سابقة لهذا السياق."};
}

export function createEmergencyPlans(kind:"room"|"day"|"instructor",value:string|number,rows:FSchedule[],universe:FSchedule[],courses:AdCourse[],instructors:AdInstructor[],constraints:ScheduleConstraint[]=[]){
  const baseIds=new Set(rows.map(r=>r.id));const external=universe.filter(r=>!baseIds.has(r.id));const allRooms=[...new Map(universe.filter(r=>roomKey(r)!=="|").map(r=>[roomKey(r),{code:r.AdRoomCode,hall:r.AdRoomHall}])).values()];const instructorById=new Map(instructors.map(i=>[i.AdInstructorId,i]));
  const affected=kind==="room"?rows.filter(r=>roomKey(r)===String(value)):kind==="day"?rows.filter(r=>Boolean((r as any)[String(value)])):rows.filter(r=>r.AdInstructorId===Number(value));
  const courseTeachers=new Map<number,number[]>();universe.forEach(r=>{const list=courseTeachers.get(r.AdCourseId)||[];if(r.AdInstructorId&&!list.includes(r.AdInstructorId))list.push(r.AdInstructorId);courseTeachers.set(r.AdCourseId,list)});
  const strategies=[{id:"minimal",title:"الأقل تغييرًا",timeWeight:5,roomWeight:2,qualityWeight:1},{id:"comfort",title:"الأقل إزعاجًا للأساتذة",timeWeight:2,roomWeight:1,qualityWeight:4},{id:"quality",title:"الأعلى جودة",timeWeight:1,roomWeight:1,qualityWeight:8}];
  const plans=strategies.map(strategy=>{let scenario=rows.map(r=>({...r}));const unresolved:string[]=[];
    for(const item of affected){const index=scenario.findIndex(r=>r.id===item.id);if(index<0)continue;const current=scenario[index];const candidates:FSchedule[]=[];
      if(kind==="room"){
        for(const room of allRooms){if(`${room.code}|${room.hall}`===String(value))continue;candidates.push({...current,AdRoomCode:room.code,AdRoomHall:room.hall})}
        for(let offset of [-60,-30,30,60]){const start=timeToMinutes(current.fstarttime)+offset,end=timeToMinutes(current.fendtime)+offset;if(start>=8*60&&end<=18*60)for(const room of allRooms.slice(0,18))candidates.push({...current,fstarttime:minutesToTime(start),fendtime:minutesToTime(end),AdRoomCode:room.code,AdRoomHall:room.hall})}
      } else if(kind==="day"){
        for(const day of SCHEDULE_DAYS){if(day.key===String(value))continue;const c:any={...current};for(const d of SCHEDULE_DAYS)c[d.key]=false;c[day.key]=true;candidates.push(c)}
        for(const day of SCHEDULE_DAYS){if(day.key===String(value))continue;for(let offset of [-60,-30,30,60]){const start=timeToMinutes(current.fstarttime)+offset,end=timeToMinutes(current.fendtime)+offset;if(start<8*60||end>18*60)continue;const c:any={...current,fstarttime:minutesToTime(start),fendtime:minutesToTime(end)};for(const d of SCHEDULE_DAYS)c[d.key]=false;c[day.key]=true;candidates.push(c)}}
      } else {
        const replacements=(courseTeachers.get(current.AdCourseId)||[]).filter(id=>id!==Number(value));for(const id of replacements)candidates.push({...current,AdInstructorId:id});
      }
      let best:FSchedule|undefined,bestObjective=Number.POSITIVE_INFINITY;
      for(const candidate of candidates){const temp=[...scenario];temp[index]=candidate;const u=[...external,...temp];const conflicts=conflictCountForRow(candidate,u);const timeChange=Math.abs(timeToMinutes(candidate.fstarttime)-timeToMinutes(current.fstarttime));const roomChange=roomKey(candidate)===roomKey(current)?0:1;const profGap=instructorGap(temp,candidate.AdInstructorId).total;const objective=conflicts*100000+timeChange*strategy.timeWeight+roomChange*45*strategy.roomWeight+profGap/Math.max(1,strategy.qualityWeight);if(objective<bestObjective){bestObjective=objective;best=candidate}}
      if(best)scenario[index]=best;else unresolved.push(`${current.AdCourseName} · شعبة ${current.SCode}`);
    }
    const scenarioUniverse=[...external,...scenario];const analysis=analyzeSchedule(scenario,scenarioUniverse,courses,instructors);const rules=evaluateScheduleConstraints(scenario,constraints);const changed=scenario.filter(r=>{const b=rows.find(x=>x.id===r.id);return b&&!rowsEqual(b,r)}).length;const fairness=buildFairnessEngine(scenario,instructors);
    return {id:strategy.id,title:strategy.title,rows:scenario,changed,unresolved,score:analysis.score,conflicts:analysis.metrics.criticalConflicts,fairness:fairness.score,constraintViolations:rules.total,summary:unresolved.length?`${changed} تعديل ممكن، و${unresolved.length} موعد يحتاج قرارًا بشريًا.`:`خطة كاملة تغيّر ${changed} موعدًا فقط.`};
  });
  return {kind,value,affected:affected.length,plans};
}
