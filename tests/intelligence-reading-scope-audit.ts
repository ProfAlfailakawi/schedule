import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareIntelligenceTerms, mergeDecisionReadings, mergeDemandReadings, mergeOperationsReadings, rowsForIntelligenceScope, sameIntelligenceScope, scopedReadingList } from '../src/utils/intelligenceReadingScope';
import { departmentFamily } from '../src/utils/sectionLabel';
const a = {collegeId:1,sectionId:10,collegeName:'أ'}, b = {collegeId:2,sectionId:20,collegeName:'ب'};
let passed = 0;
function check(label:string, run:()=>void) { run(); passed++; console.log(`✓ ${label}`); }
const row = (scope:any,id:number,time='08:00') => ({id,AdCollegeId:scope.collegeId,AdSectionId:scope.sectionId,AdTermId:1,AdCourseId:5,SCode:'501',AdInstructorId:7,fsunday:true,fstarttime:time,fendtime:'10:00',AdRoomCode:'A',AdRoomHall:'1'}) as any;
check('نطاق القراءة يطابق الكلية والقسم مع اختلاف نوع المعرف',()=>{
 assert(sameIntelligenceScope(a,{collegeId:'1',sectionId:'10'} as any)); assert(!sameIntelligenceScope(a,b));
 assert.equal(rowsForIntelligenceScope([row(a,1),row(b,2),{...row(a,3),AdSectionId:11}],a).length,1);
});
check('عائلة القسم تضم المواقع المتماثلة دون أقسام أخرى',()=>{
 const sections=[{AdCollegeId:1,AdSectionId:10,AdSectionName:'قسم الرياضيات'},{AdCollegeId:2,AdSectionId:20,AdSectionName:'الرياضيات'},{AdCollegeId:3,AdSectionId:30,AdSectionName:'الفيزياء'}];
 assert.deepEqual(departmentFamily(sections,1,10),[{collegeId:1,sectionId:10},{collegeId:2,sectionId:20}]);
});
check('التجميع يحتفظ بمصدر كل مسودة ولا يغيّر بياناتها',()=>{
 const draft={id:'draft',rows:[row(b,2)]}; const result=scopedReadingList([{scope:b,data:[draft]}]);
 assert.deepEqual(result[0].readingScope,b); assert.equal(result[0].rows[0].AdCollegeId,2); assert(!('readingScope' in draft));
});
check('مقارنة الفصول لا تخلط مقرراً وشعبة متماثلين في كليتين',()=>{
 const diff=compareIntelligenceTerms([row(a,1),row(b,2)],[row(a,3),row(b,4,'09:00')],[a,b]);
 assert.equal(diff.moved.length,1); assert.equal(diff.moved[0].row.AdCollegeId,2); assert.equal(diff.added,1); assert.equal(diff.removed,1);
 const transfer=compareIntelligenceTerms([row(a,1)],[row(b,2)],[a,b]);
 assert.equal(transfer.appeared.length,1); assert.equal(transfer.disappeared.length,1); assert.equal(transfer.moved.length,0);
});
check('دقة الجدول تحسب من المواعيد وليست متوسط النسب',()=>{
 const result=mergeOperationsReadings([{scope:a,data:{accuracy:{available:true,unchanged:90,changed:10}}},{scope:b,data:{accuracy:{available:true,unchanged:0,changed:1}}}]);
 assert.equal(result.accuracy.accuracy,89); assert(result.accuracy.complete);
});
check('غياب أساس المقارنة لا يصبح دقة كاملة أو صفر أخطاء',()=>{
 const none=mergeOperationsReadings([{scope:a,data:{accuracy:{available:false}}}]); assert.equal(none.accuracy.accuracy,null); assert.equal(none.accuracy.available,false);
 const partial=mergeOperationsReadings([{scope:a,data:{accuracy:{available:true,unchanged:5,changed:0}}},{scope:b,data:{accuracy:{available:false}}}]); assert.equal(partial.accuracy.complete,false);
});
check('القرارات المستنتجة المتشابهة تبقى مستقلة لكل كلية',()=>{
 const result=mergeDecisionReadings([{scope:a,data:{manual:[{id:'x',status:'closed'}],inferred:[{id:'same'}]}},{scope:b,data:{manual:[{id:'y',status:'open'}],inferred:[{id:'same'}]}}]);
 assert.equal(result.totalOpen,3); assert.notEqual(result.inferred[0].id,result.inferred[1].id); assert.deepEqual(result.manual[1].readingScope,b);
});
check('طلب الطلاب والتوقعات ومقترحات الشعب تحتفظ بمصادرها ومقاماتها',()=>{
 const input=[{scope:a,data:{respondents:10,totalRespondents:10,totalCases:1,courses:[{courseId:5,students:5}],prediction:{from:10,courses:[{courseId:5,expected:5}]},openings:{proposals:[{courseId:5}]}}},{scope:b,data:{respondents:20,totalRespondents:20,totalCases:2,courses:[{courseId:5,students:10}],prediction:{from:20,courses:[{courseId:5,expected:8}]},openings:{proposals:[{courseId:5}]}}}];
 const result=mergeDemandReadings(input); assert.equal(result.respondents,30); assert.equal(result.totalCases,3); assert.equal(result.courses.length,2); assert.equal(result.prediction.courses[1].predictionFrom,20); assert.deepEqual(result.openings.proposals[1].readingScope,b); assert.equal(result.byCollege[0].data,input[0].data);
 assert.equal(mergeDemandReadings(input.slice(0,1)).respondents,10); assert.equal(mergeDemandReadings([]).courses.length,0);
});
check('الأيام فوق الوقت في الحاوية المستخدمة فعلياً',()=>{
 const css=readFileSync('src/styles/05-schedule.css','utf8'), ui=readFileSync('src/components/Schedules.tsx','utf8');
 assert.match(css,/\.schedule-agenda \.agenda-time\s*\{[^}]*flex-direction:\s*column/); assert.match(css,/\.schedule-agenda \.agenda-time\s*\{[^}]*align-items:\s*center/);
 const start=ui.indexOf('className="agenda-time"'); assert(start>=0); const markup=ui.slice(start,start+3000); assert(markup.indexOf('agenda-days')<markup.indexOf('agenda-clock-line')); assert(markup.includes('agenda-clock-line'));
});
check('المحاكاة محلية والإجراءات ترجع لمصدرها وتمنع الأجوبة القديمة',()=>{
 const ui=readFileSync('src/components/IntelligenceWorkspace.tsx','utf8');
 assert(ui.includes('tab === "twin" ? "college" : analysisScope')); assert(ui.includes('pending.termId !== termId')); assert(ui.includes('serial !== reloadSerial.current'));
 for(const kind of ['draft','publish','restore','opening','repair','spatial','rule']) assert(ui.includes(`"${kind}"`));
 assert(ui.includes('policyDraft.scope === "family" ? "department" : "college"')); assert(ui.includes('value: "lab"'));
});
console.log(`Intelligence reading scope: ${passed} checks passed`);
