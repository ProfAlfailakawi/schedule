/**
 * ── «خريطتي»: نموذجُ خريطة الطالب في مساري وحسابُها ───────────────────────────
 *
 * الطالبُ يدرس **كلَّ صحيفته**: مقرراتِ قسمه ومقرراتِ الأقسام الأخرى والمتطلباتِ العامة. فخريطتُه تعرض كلَّ ذلك
 * (على خلاف شاشة القسم وصفحته العامة اللتين تعرضان مقرراتِ القسم وحدها، تطبيقاً للقاعدة الثابتة).
 *
 *   · `buildStudentMap` (الخادم): من الصحيفة المعتمدة وقواعدِها يبني نموذجاً صغيراً بلا أيّ بيانٍ عن الطالب.
 *   · `STUDENT_MAP_CORE` (المتصفح، ES5): الحالةُ والمتبقّي والنسبةُ والسلاسل، يُعاد حسابُها لحظةَ يعلّم الطالبُ مقرراً.
 *     هو منقولٌ عن دوال المنصّة نفسِها (unmetPrereq وgroupProgress وremainingNeed)، ويُختبر عليها في
 *     tests/student-map-audit.ts على آلاف المجموعات العشوائية: فلا يختلف رقمُ الشاشة عن رقم الخادم.
 */
import type { CurriculumCourseRule, ElectiveGroup } from "../types";
import { KIND_LABEL, courseLevelFromCode, normalizeLevel } from "./curriculumRules";

export interface StudentMapCourse {
  id: number;
  /** الرمزُ الجامعي كاملاً. */
  code: string;
  /** رمزُ العرض: آخر ثلاث خانات، وإن تكرّرت في الصحيفة فالرمزُ دون الكلية. */
  short: string;
  name: string;
  credit: number;
  /** ١٠٠…٤٠٠، و٠ لغير المصنّف. */
  level: number;
  /** نوعُ المقرر من قواعد الصحيفة (compulsory|college|university|elective) أو فارغ. */
  kind: string;
  /** التصنيفُ كما تكتبه الصحيفة، وإلا نوعُه بالعربية. */
  cat: string;
  own: boolean;
  /** اسمُ القسم المالك لغير مقررات قسم الطالب. */
  owner: string;
  /** المجموعةُ الاختيارية، أو فارغ. */
  group: string;
}
export interface StudentMapRule { all: number[]; anyOf: number[][]; minUnits: number; coreq: number[] }
export interface StudentMapGroup { id: string; name: string; minCourses: number; minUnits: number; courseIds: number[] }
export interface StudentMapModel {
  sectionName: string;
  planName: string;
  termName: string;
  courses: StudentMapCourse[];
  rules: Record<number, StudentMapRule>;
  groups: StudentMapGroup[];
  /** [مقرر ← عدد الشعب المطروحة هذا الفصل]، للمطروح فقط. */
  offered: Record<number, number>;
  /** التصنيفاتُ بترتيبها. */
  cats: string[];
}

export interface BuildStudentMapInput {
  planCourseIds: readonly number[];
  courses: ReadonlyMap<number, { code: string; name: string; credit: number; sectionId: number }>;
  rules: readonly CurriculumCourseRule[];
  groups: readonly ElectiveGroup[];
  studentSectionId: number;
  sectionName: (sectionId: number) => string;
  offered: ReadonlyMap<number, { sections: number }> | null;
  categoryOf?: (id: number) => string;
  categoryOrder?: readonly string[];
  planName: string;
  studentSectionName: string;
  termName: string;
}

const tail = (code: string) => (/^\d{7}$/.test(code) ? code.slice(-3) : code);

export function buildStudentMap(input: BuildStudentMapInput): StudentMapModel {
  const plan = [...new Set(input.planCourseIds.map(Number))].filter(id => input.courses.has(id));
  const ruleOf = new Map(input.rules.map(rule => [rule.courseId, rule] as const));
  const groupOf = new Map<number, string>();
  for (const group of input.groups) for (const id of group.courseIds) if (plan.includes(id)) groupOf.set(id, group.id);
  /* رمزُ العرض: يتكرّر آخر ثلاث خانات بين قسمين (105 في «الحضارة» وفي «أسس تكنولوجيا التعليم»)، فيأخذ غيرُ مقررات الطالب رمزَه دون الكلية. */
  const tails = new Map<string, number>();
  for (const id of plan) tails.set(tail(input.courses.get(id)!.code), (tails.get(tail(input.courses.get(id)!.code)) || 0) + 1);
  const courses: StudentMapCourse[] = plan.map(id => {
    const info = input.courses.get(id)!;
    const rule = ruleOf.get(id);
    const own = Number(info.sectionId) === input.studentSectionId;
    const t = tail(info.code);
    const short = (tails.get(t) || 0) > 1 && !own && /^\d{7}$/.test(info.code) ? `${info.code.slice(2, 4)}·${t}` : t;
    const kind = String(rule?.kind || "");
    return {
      id, code: info.code, short, name: info.name, credit: Number(info.credit) || 0,
      level: courseLevelFromCode(info.code) || normalizeLevel(rule?.level) || 0,
      kind, cat: input.categoryOf?.(id) || (kind && KIND_LABEL[kind as keyof typeof KIND_LABEL]) || "",
      own, owner: own ? "" : input.sectionName(Number(info.sectionId)), group: groupOf.get(id) || "",
    };
  });
  const rules: Record<number, StudentMapRule> = {};
  for (const rule of input.rules) {
    if (!plan.includes(rule.courseId)) continue;
    const prereq = rule.prereq, coreq = (rule.coreq || []).filter(id => plan.includes(id));
    const all = (prereq?.all || []).filter(id => plan.includes(id));
    const anyOf = (prereq?.anyOf || []).map(group => group.filter(id => plan.includes(id))).filter(group => group.length);
    const minUnits = Number(prereq?.minUnits) || 0;
    if (all.length || anyOf.length || minUnits || coreq.length) rules[rule.courseId] = { all, anyOf, minUnits, coreq };
  }
  const offered: Record<number, number> = {};
  if (input.offered) for (const id of plan) { const n = input.offered.get(id)?.sections || 0; if (n > 0) offered[id] = n; }
  const present = new Set(courses.map(course => course.cat).filter(Boolean));
  const ordered = [...(input.categoryOrder || [])].filter(cat => present.has(cat));
  const cats = [...ordered, ...[...present].filter(cat => !ordered.includes(cat))];
  return {
    sectionName: input.studentSectionName, planName: input.planName, termName: input.termName, courses, rules, offered, cats,
    groups: input.groups.map(group => ({ id: group.id, name: group.name, minCourses: group.minCourses, minUnits: group.minUnits, courseIds: group.courseIds.filter(id => plan.includes(id)) }))
      .filter(group => group.courseIds.length),
  };
}

/**
 * حسابُ الخريطة في المتصفح (ES5 عادي، بلا علامة اقتباسٍ مائلة ولا ‎${‎: النصُّ قالبٌ في الخادم).
 * يُعرِّف الدالة kmCore(model, passedIds) فيعيد كائناً بالدوال أدناه.
 */
export const STUDENT_MAP_CORE = String.raw`
function kmCore(m,passedArr){
  var byId={},plan=[],i,j;
  for(i=0;i<m.courses.length;i++){byId[m.courses[i].id]=m.courses[i];plan.push(m.courses[i].id)}
  var passed={};for(i=0;i<passedArr.length;i++)if(byId[passedArr[i]])passed[passedArr[i]]=true;
  var inGroup={};m.groups.forEach(function(g){g.courseIds.forEach(function(id){inGroup[id]=true})});
  var loose={};m.courses.forEach(function(c){if(c.kind==="elective"&&!inGroup[c.id])loose[c.id]=true});
  var credit=function(id){return byId[id]?byId[id].credit:0};
  var X={m:m,byId:byId,plan:plan};
  X.isPassed=function(id){return passed[id]===true};
  X.set=function(id,on){if(!byId[id])return;if(on)passed[id]=true;else delete passed[id]};
  X.passedList=function(){var o=[];for(var k in passed)if(passed[k])o.push(Number(k));return o.sort(function(a,b){return a-b})};
  X.passedUnits=function(){var s=0;for(var k in passed)if(passed[k])s+=credit(Number(k));return s};
  X.unmet=function(id){var r=m.rules[id];if(!r)return{all:[],anyOf:[],unitsShort:0};
    return{all:r.all.filter(function(x){return!passed[x]}),anyOf:r.anyOf.filter(function(g){return!g.some(function(x){return passed[x]})}),unitsShort:r.minUnits?Math.max(0,r.minUnits-X.passedUnits()):0}};
  X.unlocked=function(id){var u=X.unmet(id);return u.all.length===0&&u.anyOf.length===0&&u.unitsShort===0};
  X.group=function(g){var done=g.courseIds.filter(function(id){return passed[id]});var pu=0;done.forEach(function(id){pu+=credit(id)});
    var needC=Math.max(0,g.minCourses-done.length),needU=Math.max(0,g.minUnits-pu);
    return{group:g,passedCourses:done.length,passedUnits:pu,needCourses:needC,needUnits:needU,done:needC===0&&needU===0,candidateIds:g.courseIds.filter(function(id){return!passed[id]})}};
  X.groupById=function(id){for(var k=0;k<m.groups.length;k++)if(m.groups[k].id===id)return m.groups[k];return null};
  /* مقررٌ في مجموعةٍ اكتملت: لا حاجة إليه (يبقى متاحاً إن شاء). */
  X.status=function(id){if(passed[id])return"ok";var c=byId[id];
    if(c&&c.group){var g=X.groupById(c.group);if(g&&X.group(g).done)return"full"}
    return X.unlocked(id)?"now":"wait"};
  X.need=function(){
    var comp=plan.filter(function(id){return!inGroup[id]&&!loose[id]});
    var compRemaining=comp.filter(function(id){return!passed[id]});
    var compUnits=0;compRemaining.forEach(function(id){compUnits+=credit(id)});
    var gs=m.groups.map(function(g){return X.group(g)});
    var typical=function(p){var cs=p.candidateIds.map(credit).filter(function(c){return c>0});if(!cs.length)return 3;var s=0;cs.forEach(function(c){s+=c});return s/cs.length};
    var groupUnits=0;gs.forEach(function(p){groupUnits+=Math.max(p.needUnits,p.needCourses*typical(p))});
    var req=0;comp.forEach(function(id){req+=credit(id)});m.groups.forEach(function(g){req+=Math.max(g.minUnits,g.minCourses*3)});
    return{compulsoryRemaining:compRemaining,compulsoryUnits:compUnits,groups:gs,remainingUnits:Math.round(compUnits+groupUnits),requiredUnits:req,compulsory:comp}};
  /* النسبةُ والمتبقّي كما يحسبهما الخادم في summaryOf: بالمجموعات إن وُجدت، وإلا بوحدات الصحيفة كلّها. */
  X.progress=function(){var pu=X.passedUnits(),total=0;plan.forEach(function(id){total+=credit(id)});
    var passedInPlan=pu,remaining=Math.max(0,total-passedInPlan),pct=total>0?Math.min(100,Math.round(passedInPlan/total*100)):0;
    if(m.groups.length){var n=X.need();total=Math.max(n.requiredUnits,pu);remaining=n.remainingUnits;pct=total>0?Math.max(0,Math.min(100,Math.round((total-remaining)/total*100))):0}
    return{totalUnits:total,passedUnits:pu,remainingUnits:remaining,percent:pct}};
  var deps=null;
  X.dependents=function(id){if(!deps){deps={};plan.forEach(function(c){var r=m.rules[c];if(!r)return;var seen={};
      r.all.concat.apply(r.all,r.anyOf).forEach(function(n){if(!seen[n]){seen[n]=1;(deps[n]=deps[n]||[]).push(c)}})})}return deps[id]||[]};
  X.requires=function(id){var r=m.rules[id];if(!r)return[];var out=[],seen={};r.all.concat.apply(r.all,r.anyOf).forEach(function(n){if(!seen[n]){seen[n]=1;out.push(n)}});return out};
  /* كم مقرراً إجبارياً متبقّياً يفتحه هذا المقرر (مباشرةً وبعده)، بلا دوران. */
  var comp0={};plan.forEach(function(id){if(!inGroup[id]&&!loose[id])comp0[id]=true});
  X.unlocks=function(id){var out={};var walk=function(x,trail){X.dependents(x).forEach(function(c){if(passed[c]||trail[c])return;if(comp0[c])out[c]=1;var t={};for(var k in trail)t[k]=1;t[c]=1;walk(c,t)})};
    var t0={};t0[id]=1;walk(id,t0);return Object.keys(out).map(Number)};
  X.levels=function(){var by={};plan.forEach(function(id){var l=byId[id].level;(by[l]=by[l]||[]).push(id)});
    return Object.keys(by).map(Number).sort(function(a,b){return(a||9e9)-(b||9e9)}).map(function(l){return{level:l,ids:by[l].sort(function(a,b){return byId[a].short<byId[b].short?-1:byId[a].short>byId[b].short?1:0})}})};
  /* سلاسل المسبقات التي تعبر الأقسام: مسارٌ خطيّ يبدأ بمقررٍ لا يُسبق وينتهي حيث ينتهي، ويضمّ مقرراً غريباً على الأقل. */
  X.chains=function(){var edges=[];plan.forEach(function(c){X.requires(c).forEach(function(p){if(byId[p])edges.push([p,c])})});
    var cross=edges.filter(function(e){return!byId[e[0]].own||!byId[e[1]].own});
    var next={},hasIn={};cross.forEach(function(e){(next[e[0]]=next[e[0]]||[]).push(e[1]);hasIn[e[1]]=1});
    var starts=Object.keys(next).map(Number).filter(function(a){return!hasIn[a]});
    var out=[];
    var walk=function(path){if(out.length>=12)return;var last=path[path.length-1],ns=(next[last]||[]).filter(function(x){return path.indexOf(x)<0});
      if(!ns.length||path.length>=5){if(path.length>1)out.push(path);return}
      ns.forEach(function(n){walk(path.concat([n]))})};
    starts.forEach(function(a){walk([a])});
    return out};
  return X}
`;
