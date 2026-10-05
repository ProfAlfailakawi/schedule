import assert from 'node:assert/strict';
// Run against a local development server. Every operation uses an isolated demo session.
const base=process.env.SCHEDULE_TEST_URL || 'http://localhost:3000';
const target=new URL(base); assert(['localhost','127.0.0.1','::1'].includes(target.hostname),'Scope API tests require localhost');
const login=await fetch(base+'/api/auth/demo',{method:'POST'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];const identity=await login.json();
let passed=0;function check(label,ok){assert(ok,label);passed++;console.log('✓ '+label);}
async function request(path,body){const res=await fetch(base+path,{headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const data=await res.json();assert.equal(res.status,200,`${path}: ${JSON.stringify(data)}`);return data;}
const sections=await request('/api/sections');const family=sections.filter(s=>String(s.AdSectionName).includes('الدراسات الإسلامية'));check('ثلاث كليات لقسم واحد في التجربة',family.length===3);
const current=family[0], context={collegeId:current.AdCollegeId,sectionId:current.AdSectionId,termId:1};const query=new URLSearchParams(context);
const local=await request('/api/intelligence/overview?'+query);const all=await request('/api/intelligence/overview?'+query+'&analysisScope=department');
check('القراءة المحلية تعرض كلية واحدة',local.family.length===1&&local.readingRows.every(r=>r.AdCollegeId===context.collegeId));
check('القراءة العامة تجمع الكليات الثلاث',all.family.length===3&&all.collegeReadings.length===3&&all.readingRows.length>local.readingRows.length);
check('كل موعد في القراءة العامة من العائلة فقط',all.readingRows.every(r=>family.some(s=>s.AdCollegeId===r.AdCollegeId&&s.AdSectionId===r.AdSectionId)));
check('حالة الاعتماد مستقلة لكل كلية',all.collegeReadings.every(r=>typeof r.blockers==='number'&&r.collegeName));
const before=await request('/api/schedules?'+query);
for(const path of ['/api/intelligence/genome','/api/intelligence/experience-health']){const data=await request(path+'?'+query+'&analysisScope=department');check(path+' يعمل في النطاق العام',Boolean(data));}
for(const s of family){const q=new URLSearchParams({collegeId:s.AdCollegeId,sectionId:s.AdSectionId,termId:1});for(const path of ['/api/intelligence/drafts','/api/intelligence/versions','/api/intelligence/operations-review','/api/intelligence/open-decisions','/api/schedules/demand'])await request(path+'?'+q);check('القراءات الثانوية متاحة لكلية '+s.AdCollegeId,true);}
const policyLocal=await request('/api/intelligence/policy-simulate',{...context,type:'growth',growth:10,scope:'department',analysisScope:'college'});const policyAll=await request('/api/intelligence/policy-simulate',{...context,type:'growth',growth:10,scope:'department',analysisScope:'department'});check('محاكاة النمو تشمل نطاق القسم المختار',policyAll.affected>=policyLocal.affected);
const comparison=await request('/api/intelligence/compare-terms?'+query+'&fromTermId=2&toTermId=1&analysisScope=department');check('مقارنة مستقلة للكليات الثلاث',comparison.perCollege.length===3);
const answer=await request('/api/intelligence/copilot',{...context,prompt:'كم موانع الحفظ؟',analysisScope:'department'});check('المساعد يجيب في النطاق العام',Boolean(answer));
check('كل القراءات والمحاكاة لا تغيّر الجدول الحقيقي',JSON.stringify(before)===JSON.stringify(await request('/api/schedules?'+query)));
const multi=identity.demo.roles.find(r=>r.label.includes('ثلاث'));assert(multi);const scoped=await request('/api/demo/role',{role:multi.role});check('حساب رئيس اللجنة متعدد المواقع لا يصبح مديرًا',!scoped.user.IsAdminUser);
const dept=await request('/api/intelligence/overview?'+query+'&analysisScope=department');check('قراءة رئيس اللجنة تقتصر على عائلته المسموحة',dept.family.length===3);
const other=sections.find(s=>!family.some(f=>f.AdSectionId===s.AdSectionId));const denied=await fetch(base+'/api/intelligence/overview?'+new URLSearchParams({collegeId:other.AdCollegeId,sectionId:other.AdSectionId,termId:1,analysisScope:'department'}),{headers:{Cookie:cookie}});check('القسم غير المسموح يبقى محجوبًا',denied.status===403);
const malformed=await request('/api/intelligence/overview?'+query+'&analysisScope=invalid');check('نطاق غير معروف يرجع إلى القراءة المحلية',malformed.family.length===1);
await request('/api/demo/role',{role:'committeeChair'});
const single=await request('/api/intelligence/overview?collegeId=1&sectionId=1&termId=1&analysisScope=department');check('رئيس لجنة كلية واحدة لا تتسع صلاحياته باختيار القسم',single.family.length===1&&single.family[0].collegeId===1);
const deniedOther=await fetch(base+'/api/intelligence/overview?'+new URLSearchParams({collegeId:family[1].AdCollegeId,sectionId:family[1].AdSectionId,termId:1,analysisScope:'department'}),{headers:{Cookie:cookie}});check('اختيار عام لا يفتح كلية غير مسموحة',deniedOther.status===403);
console.log(`Scope API: ${passed} checks passed`);
