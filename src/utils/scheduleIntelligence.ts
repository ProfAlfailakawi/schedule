import type { AdCourse, AdInstructor, FSchedule } from "../types";

export type DayKey = "fsunday"|"fmonday"|"ftuesday"|"fwednesday"|"fthursday";
export const SCHEDULE_DAYS: Array<{key:DayKey;label:string}> = [
  {key:"fsunday",label:"الأحد"},{key:"fmonday",label:"الاثنين"},{key:"ftuesday",label:"الثلاثاء"},{key:"fwednesday",label:"الأربعاء"},{key:"fthursday",label:"الخميس"}
];

export function timeToMinutes(value:string):number {
  const [h,m]=String(value||"0:0").split(":").map(Number);
  return (Number.isFinite(h)?h:0)*60+(Number.isFinite(m)?m:0);
}
export function minutesToTime(value:number):string {
  const bounded=Math.max(0,Math.min(23*60+59,Math.round(value)));
  return `${String(Math.floor(bounded/60)).padStart(2,"0")}:${String(bounded%60).padStart(2,"0")}`;
}
export function activeDays(row:Partial<FSchedule>):DayKey[]{return SCHEDULE_DAYS.filter(day=>Boolean(row[day.key])).map(day=>day.key)}
export function sharesDay(a:Partial<FSchedule>,b:Partial<FSchedule>):boolean{return SCHEDULE_DAYS.some(day=>Boolean(a[day.key])&&Boolean(b[day.key]))}
export function overlaps(a:Partial<FSchedule>,b:Partial<FSchedule>):boolean {
  return sharesDay(a,b) && timeToMinutes(String(a.fstarttime||"")) < timeToMinutes(String(b.fendtime||"")) && timeToMinutes(String(b.fstarttime||"")) < timeToMinutes(String(a.fendtime||""));
}
const roomKey=(row:Partial<FSchedule>)=>`${String(row.AdRoomCode||"").trim()}|${String(row.AdRoomHall||"").trim()}`;
const duration=(row:Partial<FSchedule>)=>Math.max(0,timeToMinutes(String(row.fendtime||""))-timeToMinutes(String(row.fstarttime||"")));
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

export interface ConflictInsight {
  type:"room"|"instructor"|"duplicate";
  severity:"high"|"medium";
  rowId:number;otherId:number;message:string;detail:string;
  /** Every reason this one pair collides, so a clash is never counted twice. */
  reasons?:Array<"room"|"instructor"|"duplicate">;
}

/**
 * One clash between two appointments is one conflict.
 *
 * The previous version emitted a separate record for each *reason* a pair
 * collided, so a single lecture booked over another with the same instructor in
 * the same hall was reported three times — once for the instructor, once for the
 * room, once for the repeated section — and a department with forty-six real
 * collisions was told it had a hundred and thirty-eight. Saving already refuses
 * a genuine clash, so the number on the screen was not describing anything a
 * coordinator could act on; it was describing the loop that produced it.
 *
 * Now a pair yields at most one conflict, carrying every reason it has, and the
 * count is a count of collisions.
 *
 * A repeated course and section is also no longer a conflict by itself. Half of
 * a department's catalogue is taught as a lecture on one day and a laboratory on
 * another under the same section number, and that is the timetable working, not
 * failing. It is only reported when the two rows occupy the very same placement,
 * which is the actual duplicate the check was written to catch.
 */
export function findConflicts(targetRows:FSchedule[], allRows:FSchedule[]):ConflictInsight[] {
  const samePlacement=(a:FSchedule,b:FSchedule)=>
    a.fstarttime===b.fstarttime && a.fendtime===b.fendtime &&
    SCHEDULE_DAYS.every(day=>Boolean(a[day.key])===Boolean(b[day.key]));

  const byPair=new Map<string,ConflictInsight>();
  for(const row of targetRows){
    for(const other of allRows){
      if(row.id===other.id || row.AdTermId!==other.AdTermId) continue;
      const clashing=overlaps(row,other);
      const twin=row.AdCourseId===other.AdCourseId && String(row.SCode)===String(other.SCode) && samePlacement(row,other);
      if(!clashing && !twin) continue;

      const pair=[row.id,other.id].sort((a,b)=>a-b).join(":");
      if(byPair.has(pair)) continue;

      const reasons:Array<"room"|"instructor"|"duplicate">=[];
      if(clashing && row.AdInstructorId && row.AdInstructorId===other.AdInstructorId) reasons.push("instructor");
      if(clashing && roomKey(row)!=="|" && roomKey(row)===roomKey(other)) reasons.push("room");
      if(twin) reasons.push("duplicate");
      if(!reasons.length) continue;

      // The pair is named after the most serious thing true about it.
      const type=reasons.includes("instructor")?"instructor":reasons.includes("room")?"room":"duplicate";
      const message=type==="instructor"?"تعارض في أستاذ المقرر"
        :type==="room"?"تعارض في القاعة"
        :"موعدان متطابقان لنفس الشعبة";
      const detail=type==="instructor"
        ? `الموعدان ${row.fstarttime}-${row.fendtime} و ${other.fstarttime}-${other.fendtime} يتقاطعان في يوم مشترك.`
        : type==="room"
          ? `القاعة ${row.AdRoomCode}/${row.AdRoomHall} مستخدمة في موعد متداخل.`
          : "نفس المقرر ونفس الشعبة بنفس الأيام ونفس الوقت.";
      byPair.set(pair,{
        type,
        severity:type==="duplicate"?"medium":"high",
        rowId:row.id,otherId:other.id,message,detail,reasons,
      });
    }
  }
  return [...byPair.values()];
}

function instructorGapStats(rows:FSchedule[]){
  const byInstructor=new Map<number,FSchedule[]>();
  rows.forEach(row=>{if(row.AdInstructorId){const list=byInstructor.get(row.AdInstructorId)||[];list.push(row);byInstructor.set(row.AdInstructorId,list)}});
  const result=new Map<number,{gapMinutes:number;maxGap:number;weeklyMinutes:number;days:Set<DayKey>;maxContinuous:number}>();
  for(const [id,list] of byInstructor){
    let gapMinutes=0,maxGap=0,weeklyMinutes=0,maxContinuous=0; const daySet=new Set<DayKey>();
    for(const day of SCHEDULE_DAYS){
      const blocks=list.filter(row=>Boolean(row[day.key])).map(row=>({start:timeToMinutes(row.fstarttime),end:timeToMinutes(row.fendtime)})).sort((a,b)=>a.start-b.start);
      if(!blocks.length) continue; daySet.add(day.key);
      weeklyMinutes+=blocks.reduce((sum,b)=>sum+Math.max(0,b.end-b.start),0);
      let chainStart=blocks[0].start,chainEnd=blocks[0].end;
      for(let i=1;i<blocks.length;i++){
        const gap=Math.max(0,blocks[i].start-blocks[i-1].end); gapMinutes+=gap; maxGap=Math.max(maxGap,gap);
        if(blocks[i].start<=chainEnd+15) chainEnd=Math.max(chainEnd,blocks[i].end); else {maxContinuous=Math.max(maxContinuous,chainEnd-chainStart);chainStart=blocks[i].start;chainEnd=blocks[i].end}
      }
      maxContinuous=Math.max(maxContinuous,chainEnd-chainStart);
    }
    result.set(id,{gapMinutes,maxGap,weeklyMinutes,days:daySet,maxContinuous});
  }
  return result;
}

export function analyzeSchedule(targetRows:FSchedule[], allRows:FSchedule[], courses:AdCourse[]=[], instructors:AdInstructor[]=[]){
  const conflicts=findConflicts(targetRows,allRows);
  const dayLoad=SCHEDULE_DAYS.map(day=>({key:day.key,label:day.label,count:targetRows.filter(row=>Boolean(row[day.key])).length}));
  const activeDayCounts=dayLoad.map(x=>x.count); const maxDay=Math.max(0,...activeDayCounts),minDay=Math.min(...activeDayCounts);
  const gaps=instructorGapStats(targetRows); const gapValues=[...gaps.values()]; const totalGap=gapValues.reduce((s,g)=>s+g.gapMinutes,0); const avgGap=gapValues.length?Math.round(totalGap/gapValues.length):0;
  const lateRows=targetRows.filter(row=>timeToMinutes(row.fstarttime)>=16*60).length;
  const invalidRows=targetRows.filter(row=>!row.AdInstructorId||!row.AdCourseId||!row.AdRoomCode||!row.AdRoomHall||duration(row)<=0||activeDays(row).length===0).length;
  const imbalance=maxDay?Math.round((maxDay-minDay)/maxDay*100):0;
  // Conflict counts can become large in imported/legacy semesters because every overlapping
  // pair is counted. A square-root curve keeps the score sensitive to meaningful reductions
  // instead of saturating immediately after a handful of collisions.
  const criticalConflictCount=conflicts.filter(x=>x.severity==="high").length;
  const duplicateConflictCount=conflicts.filter(x=>x.type==="duplicate").length;
  const conflictPenalty=criticalConflictCount?Math.min(58,Math.round(5+Math.sqrt(criticalConflictCount)*2.45)):Math.min(8,Math.round(duplicateConflictCount*1.5));
  const gapPenalty=Math.min(16,Math.round(avgGap/45*2)); const latePenalty=targetRows.length?Math.min(10,Math.round(lateRows/targetRows.length*24)):0; const balancePenalty=Math.min(10,Math.round(imbalance/10)); const healthPenalty=Math.min(18,invalidRows*5);
  const score=clamp(100-conflictPenalty-gapPenalty-latePenalty-balancePenalty-healthPenalty,0,100);

  const heatmap:any[]=[];
  for(const day of SCHEDULE_DAYS){for(let minute=8*60;minute<18*60;minute+=30){const count=targetRows.filter(row=>Boolean(row[day.key])&&timeToMinutes(row.fstarttime)<minute+30&&timeToMinutes(row.fendtime)>minute).length;heatmap.push({day:day.key,label:day.label,time:minutesToTime(minute),count})}}

  const roomGroups=new Map<string,FSchedule[]>();
  targetRows.forEach(row=>{const key=roomKey(row);if(key!=="|"){const list=roomGroups.get(key)||[];list.push(row);roomGroups.set(key,list)}});
  const rooms=[...roomGroups.entries()].map(([key,list])=>{const [code,hall]=key.split("|");const occupied=list.reduce((sum,row)=>sum+duration(row)*activeDays(row).length,0);return{key,code,hall,sessions:list.length,occupiedMinutes:occupied,utilization:Math.round(clamp(occupied/(5*10*60)*100,0,100))}}).sort((a,b)=>b.occupiedMinutes-a.occupiedMinutes);

  const instructorById=new Map(instructors.map(i=>[i.AdInstructorId,i]));
  const professorLoads=[...gaps.entries()].map(([id,g])=>({id,name:instructorById.get(id)?.AdInstructorName||`أستاذ ${id}`,weeklyHours:Number((g.weeklyMinutes/60).toFixed(1)),days:g.days.size,gapMinutes:g.gapMinutes,maxGap:g.maxGap,maxContinuous:g.maxContinuous})).sort((a,b)=>b.weeklyHours-a.weeklyHours);

  const duplicateKeys=new Map<string,number>(); targetRows.forEach(row=>{const key=`${row.AdCourseId}:${row.SCode}`;duplicateKeys.set(key,(duplicateKeys.get(key)||0)+1)});
  const duplicates=[...duplicateKeys.entries()].filter(([,count])=>count>1).length;
  const courseById=new Map(courses.map(c=>[c.AdCourseId,c]));
  const scheduledCourseIds=new Set(targetRows.map(row=>row.AdCourseId));
  const scopedCourseIds=new Set(targetRows.map(row=>courseById.get(row.AdCourseId)?.AdSectionId).filter(Boolean));
  const targetSectionId=targetRows[0]?.AdSectionId;
  const unscheduledCourses=targetSectionId?courses.filter(c=>c.AdSectionId===targetSectionId&&!scheduledCourseIds.has(c.AdCourseId)).length:0;
  void scopedCourseIds;

  const alerts:Array<{severity:"critical"|"warning"|"info";title:string;detail:string}>=[];
  const critical=conflicts.filter(c=>c.severity==="high").length;
  if(critical)alerts.push({severity:"critical",title:`${critical} تعارض حرج`,detail:"يوجد تداخل في أستاذ مقرر أو قاعة ويستحق المراجعة قبل الاعتماد."});
  const longGap=professorLoads.filter(x=>x.maxGap>=180).length;if(longGap)alerts.push({severity:"warning",title:`${longGap} أستاذ لديهم فراغ طويل`,detail:"يوجد فراغ لا يقل عن 3 ساعات بين محاضرتين في يوم واحد."});
  if(lateRows)alerts.push({severity:"info",title:`${lateRows} موعداً متأخراً`,detail:"تبدأ بعد الساعة 4:00 مساءً؛ راجعها إذا كان القسم يفضّل التوزيع المبكر."});
  if(imbalance>=35)alerts.push({severity:"warning",title:"توزيع الأيام غير متوازن",detail:`الفارق النسبي بين أكثر وأقل الأيام حملاً يقارب ${imbalance}%.`});
  if(invalidRows)alerts.push({severity:"critical",title:`${invalidRows} سجل يحتاج بيانات`,detail:"يوجد موعد ناقص أو وقت غير صالح أو بدون يوم/قاعة/أستاذ."});
  if(!alerts.length)alerts.push({severity:"info",title:"الوضع مستقر",detail:"لا توجد ملاحظات حرجة ظاهرة في القراءة الحالية."});

  const readiness=critical===0&&invalidRows===0? (score>=85?"ready":score>=70?"review":"needs-work") : "blocked";
  return {
    score,
    readiness,
    metrics:{rows:targetRows.length,criticalConflicts:critical,allConflicts:conflicts.length,avgInstructorGap:avgGap,lateRows,imbalance,invalidRows,uniqueRooms:rooms.length,uniqueInstructors:professorLoads.length},
    factors:[
      {label:"التعارضات",penalty:conflictPenalty},{label:"فراغات الأساتذة",penalty:gapPenalty},{label:"الأوقات المتأخرة",penalty:latePenalty},{label:"توازن الأيام",penalty:balancePenalty},{label:"صحة البيانات",penalty:healthPenalty}
    ],
    dayLoad,heatmap,rooms,professorLoads,conflicts,alerts,
    dataHealth:{invalidRows,duplicates,unscheduledCourses,healthy:invalidRows===0&&duplicates===0},
  };
}

function candidateConflictCount(candidate:FSchedule, allRows:FSchedule[], excludeId:number){
  let count=0;
  for(const other of allRows){
    if(other.id===excludeId||other.AdTermId!==candidate.AdTermId||!overlaps(candidate,other))continue;
    if(candidate.AdInstructorId===other.AdInstructorId)count++;
    if(roomKey(candidate)!=="|"&&roomKey(candidate)===roomKey(other))count++;
  }
  return count;
}

export function conflictSolutions(row:FSchedule, allRows:FSchedule[], max=5){
  const rooms=[...new Map(allRows.filter(r=>r.AdRoomCode&&r.AdRoomHall).map(r=>[roomKey(r),{code:r.AdRoomCode,hall:r.AdRoomHall}])).values()];
  const preferredRooms=rooms.sort((a,b)=>Number(b.code===row.AdRoomCode)-Number(a.code===row.AdRoomCode)).slice(0,60);
  const dur=Math.max(30,duration(row)); const original=timeToMinutes(row.fstarttime); const candidates:Array<any>=[];
  for(let start=8*60;start<=17*60;start+=30){
    for(const room of [{code:row.AdRoomCode,hall:row.AdRoomHall},...preferredRooms]){
      const candidate={...row,fstarttime:minutesToTime(start),fendtime:minutesToTime(start+dur),AdRoomCode:room.code,AdRoomHall:room.hall};
      const conflicts=candidateConflictCount(candidate,allRows,row.id); const roomChanged=room.code!==row.AdRoomCode||room.hall!==row.AdRoomHall;
      const score=conflicts*10000+Math.abs(start-original)+(roomChanged?90:0)+(start>=16*60?80:0);
      candidates.push({score,conflicts,start:candidate.fstarttime,end:candidate.fendtime,roomCode:room.code,roomHall:room.hall,roomChanged});
    }
  }
  const unique=new Map<string,any>();
  candidates.sort((a,b)=>a.score-b.score).forEach(item=>{const key=`${item.start}|${item.roomCode}|${item.roomHall}`;if(!unique.has(key))unique.set(key,item)});
  return [...unique.values()].slice(0,max).map((item,index)=>({...item,rank:index+1,label:item.conflicts===0?"بدون تعارض ظاهر":`${item.conflicts} تعارض محتمل`,reason:item.roomChanged?"تغيير الوقت والقاعة لتحقيق أفضل مساحة متاحة":"الإبقاء على القاعة مع تحسين الوقت"}));
}

export function autoScheduleProposal(targetRows:FSchedule[], allRows:FSchedule[]){
  // Greedy, safety-first optimisation. A candidate is never allowed to introduce more
  // professor/room conflicts than the row had at the moment it was evaluated.
  const targetIds=new Set(targetRows.map(r=>r.id));
  const external=allRows.filter(r=>!targetIds.has(r.id));
  const placed:FSchedule[]=[];
  const ordered=[...targetRows].sort((a,b)=>a.AdInstructorId-b.AdInstructorId||a.id-b.id);
  for(let index=0;index<ordered.length;index++){
    const row=ordered[index];
    const remaining=ordered.slice(index+1);
    const dur=Math.max(30,duration(row));
    const original=timeToMinutes(row.fstarttime);
    const originalUniverse=[...external,...placed,...remaining];
    const originalConflicts=candidateConflictCount(row,originalUniverse,row.id);
    let best={row:{...row},score:originalConflicts*10000};
    for(let start=8*60;start<=17*60;start+=30){
      const candidate={...row,fstarttime:minutesToTime(start),fendtime:minutesToTime(start+dur)};
      const universe=[...external,...placed,...remaining];
      const conflicts=candidateConflictCount(candidate,universe,row.id);
      // Never trade a clean/safer row for a new conflict merely to improve compactness.
      if(conflicts>originalConflicts)continue;
      let proximityPenalty=Math.abs(start-original)*0.38;
      if(start===original)proximityPenalty-=18;
      const latePenalty=start>=16*60?(start-16*60+30)*1.2:0;
      let gapPenalty=0;
      for(const other of [...placed,...remaining]){
        if(other.AdInstructorId!==candidate.AdInstructorId||!sharesDay(other,candidate))continue;
        const otherStart=timeToMinutes(other.fstarttime),otherEnd=timeToMinutes(other.fendtime);
        const gap=Math.min(Math.abs(start-otherEnd),Math.abs(otherStart-(start+dur)));
        gapPenalty+=Math.min(180,gap)*0.16;
      }
      const score=conflicts*10000+proximityPenalty+latePenalty+gapPenalty;
      if(score<best.score)best={row:candidate,score};
    }
    placed.push(best.row);
  }
  const byId=new Map(placed.map(r=>[r.id,r]));
  const rows=targetRows.map(row=>byId.get(row.id)||row);
  const changed=rows.filter((row,index)=>row.fstarttime!==targetRows[index].fstarttime||row.fendtime!==targetRows[index].fendtime).length;
  return {rows,changed};
}

/**
 * What changed between two terms.
 *
 * Counts alone ("+4 / -3") tell a coordinator that something moved but not
 * what, so the answer they need — is this new offering right? — is still a
 * manual row-by-row comparison. The identity of a lecture is its course and
 * section; everything else about it (day, time, hall, instructor) is a
 * property that can change. That gives three honest buckets: offerings that
 * appeared, offerings that disappeared, and offerings that stayed but moved.
 */
export function compareTerms(a:FSchedule[],b:FSchedule[]){
  const key=(r:FSchedule)=>`${r.AdCourseId}:${r.SCode}:${r.AdInstructorId}:${activeDays(r).join(",")}:${r.fstarttime}:${r.fendtime}:${roomKey(r)}`;
  const aKeys=new Set(a.map(key)),bKeys=new Set(b.map(key));

  /** Identity survives a move; the shape is what a move changes. */
  const identity=(r:FSchedule)=>`${r.AdCourseId}:${String(r.SCode||"").trim()}`;
  const dayLabel=(r:FSchedule)=>SCHEDULE_DAYS.filter(day=>Boolean((r as any)[day.key])).map(day=>day.label).join("، ");
  const shape=(r:FSchedule)=>({
    days:dayLabel(r),
    time:`${r.fstarttime}–${r.fendtime}`,
    room:roomKey(r),
    instructorId:Number(r.AdInstructorId||0)
  });
  const before=new Map(a.map(row=>[identity(row),row]));
  const after=new Map(b.map(row=>[identity(row),row]));

  const appeared=[...after.entries()].filter(([id])=>!before.has(id)).map(([,row])=>row);
  const disappeared=[...before.entries()].filter(([id])=>!after.has(id)).map(([,row])=>row);
  const moved:Array<{row:FSchedule;from:ReturnType<typeof shape>;to:ReturnType<typeof shape>;fields:string[]}>=[];
  for(const [id,next] of after){
    const previous=before.get(id);
    if(!previous)continue;
    const from=shape(previous),to=shape(next);
    const fields:string[]=[];
    if(from.days!==to.days)fields.push("الأيام");
    if(from.time!==to.time)fields.push("الوقت");
    if(from.room!==to.room)fields.push("القاعة");
    if(from.instructorId!==to.instructorId)fields.push("الأستاذ");
    if(fields.length)moved.push({row:next,from,to,fields});
  }

  return {
    fromCount:a.length,toCount:b.length,
    added:[...bKeys].filter(k=>!aKeys.has(k)).length,
    removed:[...aKeys].filter(k=>!bKeys.has(k)).length,
    uniqueInstructorsFrom:new Set(a.map(r=>r.AdInstructorId)).size,
    uniqueInstructorsTo:new Set(b.map(r=>r.AdInstructorId)).size,
    uniqueRoomsFrom:new Set(a.map(roomKey)).size,
    uniqueRoomsTo:new Set(b.map(roomKey)).size,
    appeared,disappeared,moved
  };
}
