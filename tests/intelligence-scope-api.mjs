import assert from 'node:assert/strict';
// Run against a local development server. Every operation uses an isolated demo session.
const base=process.env.SCHEDULE_TEST_URL || 'http://localhost:3000';
const target=new URL(base); assert(['localhost','127.0.0.1','::1'].includes(target.hostname),'Scope API tests require localhost');
const login=await fetch(base+'/api/auth/demo',{method:'POST'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];const identity=await login.json();
let passed=0;function check(label,ok){assert(ok,label);passed++;console.log('✓ '+label);}
async function request(path,body){const res=await fetch(base+path,{headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const data=await res.json();assert.equal(res.status,200,`${path}: ${JSON.stringify(data)}`);return data;}
const sections=await request('/api/sections');check('الأقسام التجريبية الثلاثة لعرض استعارة القاعات',sections.length===3&&sections.some(s=>s.AdSectionId===1&&s.AdSectionName==='تكنولوجيا التعليم'));
/* العائلة متعدّدة المواقع تُختبر على المنطق مباشرةً (visiting-family / approval-scope / intelligence-reading-scope)؛ هنا القراءاتُ عبر الخادم على القسم الوحيد. */
const family=sections.filter(s=>s.AdSectionId===1);
const current=family[0], context={collegeId:current.AdCollegeId,sectionId:current.AdSectionId,termId:1};const query=new URLSearchParams(context);
const local=await request('/api/intelligence/overview?'+query);const all=await request('/api/intelligence/overview?'+query+'&analysisScope=department');
check('القراءة المحلية تعرض كلية واحدة',local.family.length===1&&local.readingRows.every(r=>r.AdCollegeId===context.collegeId));
check('القراءة العامة على قسمٍ بلا إخوة تساوي المحلية',all.family.length===1&&all.collegeReadings.length===1&&all.readingRows.length===local.readingRows.length);
check('كل موعد في القراءة العامة من العائلة فقط',all.readingRows.every(r=>family.some(s=>s.AdCollegeId===r.AdCollegeId&&s.AdSectionId===r.AdSectionId)));
check('حالة الاعتماد مستقلة لكل كلية',all.collegeReadings.every(r=>typeof r.blockers==='number'&&r.collegeName));
const before=await request('/api/schedules?'+query);
for(const path of ['/api/intelligence/genome','/api/intelligence/experience-health']){const data=await request(path+'?'+query+'&analysisScope=department');check(path+' يعمل في النطاق العام',Boolean(data));}
for(const s of family){const q=new URLSearchParams({collegeId:s.AdCollegeId,sectionId:s.AdSectionId,termId:1});for(const path of ['/api/intelligence/drafts','/api/intelligence/versions','/api/intelligence/operations-review','/api/intelligence/open-decisions','/api/schedules/demand'])await request(path+'?'+q);check('القراءات الثانوية متاحة لكلية '+s.AdCollegeId,true);}
const policyLocal=await request('/api/intelligence/policy-simulate',{...context,type:'growth',growth:10,scope:'department',analysisScope:'college'});const policyAll=await request('/api/intelligence/policy-simulate',{...context,type:'growth',growth:10,scope:'department',analysisScope:'department'});check('محاكاة النمو تشمل نطاق القسم المختار',policyAll.affected>=policyLocal.affected);
const comparison=await request('/api/intelligence/compare-terms?'+query+'&fromTermId=1&toTermId=1&analysisScope=department');check('مقارنة الفصل بنفسه تقرأ الكلية الوحيدة',comparison.perCollege.length===1);
const answer=await request('/api/intelligence/copilot',{...context,prompt:'كم موانع الحفظ؟',analysisScope:'department'});check('المساعد يجيب في النطاق العام',Boolean(answer));
check('كل القراءات والمحاكاة لا تغيّر الجدول الحقيقي',JSON.stringify(before)===JSON.stringify(await request('/api/schedules?'+query)));
const malformed=await request('/api/intelligence/overview?'+query+'&analysisScope=invalid');check('نطاق غير معروف يرجع إلى القراءة المحلية',malformed.family.length===1);
await request('/api/demo/role',{role:'committeeChair'});
const denied=await fetch(base+'/api/intelligence/overview?'+new URLSearchParams({collegeId:999,sectionId:999,termId:1,analysisScope:'department'}),{headers:{Cookie:cookie}});check('رئيس اللجنة لا يقرأ كليةً خارج نطاقه',denied.status!==200);
const single=await request('/api/intelligence/overview?collegeId=1&sectionId=1&termId=1&analysisScope=department');check('رئيس لجنة كلية واحدة لا تتسع صلاحياته باختيار القسم',single.family.length===1&&single.family[0].collegeId===1);
console.log(`Scope API: ${passed} checks passed`);
