#!/usr/bin/env python3
from pathlib import Path
import re, sys
from snapshot_loader import load_snapshot, snapshot_available, print_snapshot_skip

root=Path(__file__).resolve().parents[1]
checks=[]
def check(cond,msg): checks.append((bool(cond),msg))
def txt(rel): return (root/rel).read_text(encoding='utf-8')

app=txt('src/App.tsx'); server=txt('server.ts'); css=txt('src/index.css'); refine=txt('src/styles/refinement.css')
repo=txt('src/db/repository.ts'); snapshot=txt('src/db/snapshot.ts'); reports=txt('src/components/Reports.tsx')
schedules=txt('src/components/Schedules.tsx'); admin=txt('src/components/AdminUsers.tsx'); living=txt('src/components/LivingScheduleLayer.tsx')
experience=txt('src/components/ScheduleExperienceLayer.tsx'); dashboard=txt('src/components/Dashboard.tsx'); migration=txt('scripts/import-legacy-json.ts')
runtime=txt('src/server/runtimeEnv.ts'); package=txt('package.json')
all_client='\n'.join(p.read_text(encoding='utf-8') for p in (root/'src/components').glob('*.tsx'))
# ── أين يُقرأ العقد اليوم ────────────────────────────────────────────────────
# `src/index.css` صار محمِّلَ طبقاتٍ لا موضعَ قواعد، فالبحثُ فيه وحده يجد
# سطورَ `@import` ولا يجد قاعدةً واحدة. والقرارُ تفرّق كذلك على طبقتين:
# `LivingScheduleLayer` و`ScheduleExperienceLayer`. فتُقرأ الشجرةُ كما صارت،
# لا كما كانت — وإلا ثبّت العقدُ شكلَ الملفّات بدل سلوك المنتج.
all_css=css+'\n'+'\n'.join(p.read_text(encoding='utf-8') for p in sorted((root/'src/styles').glob('*.css')))
decision=living+'\n'+experience+'\n'+schedules
# ── ما يُتخطّى وما يُشغَّل ─────────────────────────────────────────────────
#
# اللقطةُ القديمةُ خاصّةٌ ولا تُلتزم في المستودع، فالقسمُ الأول — عددُ الصفوف
# المهاجرة وسلامةُ الروابط وشكلُ كلمة السرّ — لا يمكن تشغيله في نسخةٍ نظيفة.
#
# أمّا الأقسامُ ٢-٧ فتقرأ ملفاتِ المصدر وتستطيع العملَ دائماً. وكانت المجموعةُ
# كلُّها تُتخطّى لغياب اللقطة، فبقيت تلك الأقسامُ معطّلةً حتى تباعد العقدُ عن
# الشيفرة في ثلاثين موضعاً — وهو ما يقع لكل تدقيقٍ لا يُشغَّل: لا يحرس شيئاً،
# ثم يصير عبئاً يُخشى إيقاظُه.
#
# فصار التخطّي على القسم الأول وحدَه، وتعمل ٢-٧ في كل تشغيل. ولمّا أُعيدت إلى
# العمل أظهرت عطلاً كان مستوراً: `var(--font)` في أربعةَ عشرَ موضعاً ومتغيّرٌ
# بهذا الاسم غيرُ معرَّفٍ أصلاً.
SNAPSHOT_READY = snapshot_available()
if not SNAPSHOT_READY:
    print_snapshot_skip(
        'parity_audit section 1',
        'exact legacy row counts, foreign-key integrity, scrypt password shape and the legacy admin identity — '
        'sections 2-7 below still run',
    )

# 1) Exact migrated legacy data and relational integrity.
# ولا تُقاس هذه بلقطةٍ غائبة: فحصٌ على مخزنٍ فارغٍ يُخفق ثلاثين مرّةً
# ويقول ما ليس صحيحاً — أن البياناتِ ناقصة، والحقُّ أنها لم تُقرأ.
if SNAPSHOT_READY:
    db=load_snapshot() if SNAPSHOT_READY else {}
    expected={'users':29,'formNames':18,'formSecurity':219,'collegeUserAssign':189,'terms':31,'colleges':13,'sections':87,'instructors':743,'courses':1404,'schedules':15430,'rooms':1}
    for k,v in expected.items(): check(len(db.get(k,[]))==v,f'exact legacy count {k}={v}')
    ids={
     'college':{x['AdCollegeId'] for x in db['colleges']},'section':{x['AdSectionId'] for x in db['sections']},'term':{x['AdTermId'] for x in db['terms']},
     'course':{x['AdCourseId'] for x in db['courses']},'instructor':{x['AdInstructorId'] for x in db['instructors']},'user':{x['SystemUserId'] for x in db['users']},'form':{x['FormNameId'] for x in db['formNames']}
    }
    for row in db['sections']: check(row['AdCollegeId'] in ids['college'],f"section {row['AdSectionId']} college FK")
    for row in db['courses']:
        check(row['AdSectionId'] in ids['section'],f"course {row['AdCourseId']} section FK")
        check(row['AdCollegeId'] in ids['college'],f"course {row['AdCourseId']} college FK")
    for row in db['schedules']:
        check(row['AdCollegeId'] in ids['college'] and row['AdSectionId'] in ids['section'] and row['AdTermId'] in ids['term'] and row['AdCourseId'] in ids['course'] and row['AdInstructorId'] in ids['instructor'],f"schedule {row['id']} FKs")
        check(str(row.get('SCode','')).isdigit(),f"schedule {row['id']} numeric legacy SCode")
    check(len([r for r in db['formSecurity'] if r['SystemUserId'] not in ids['user'] or r['FormNameId'] not in ids['form']])==28,'28 historical orphan permissions preserved')
    check(len([r for r in db['collegeUserAssign'] if r['SystemUserId'] not in ids['user'] or r['AdCollegeId'] not in ids['college'] or r['AdSectionId'] not in ids['section']])==16,'16 historical orphan scopes preserved')
    check('legacyArchive' in db and len(db['legacyArchive'])==28,'28 historical/raw archive datasets preserved')
    check(all(re.fullmatch(r'scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}',str(u.get('SystemUserPass',''))) for u in db['users']),'all authentication passwords remain salted scrypt hashes')
    admin_row=next((u for u in db['users'] if u.get('SystemUserId')==1),None)
    check(bool(admin_row and admin_row.get('SystemUserLogin')=='admin' and admin_row.get('IsAdminUser')),'legacy primary admin identity preserved')

# 2) Permission and route parity with the modern consolidated navigation.
permission_routes={2:'colleges',3:'instructors',4:'sections',5:'terms',6:'courses',7:'schedules',8:'searchInstructor',9:'searchRoom',10:'searchTime',11:'users',12:'permissions',14:'reportDepartment',15:'scopes',16:'searchRoomTime',17:'searchAdvanced'}
for pid,route in permission_routes.items():
    check(str(pid) in app,f'permission id {pid} represented')
    check(f'{route}:' in app or f'"{route}"' in app,f'route/workflow {route} represented')
# `hasPerm` صارت مُذكَّرةً بـ`useCallback` ولم يتغيّر معناها: عضويةُ الإذن في
# قائمة الأذونات الممنوحة. فيُثبَّت المعنى لا شكلُ التصريح.
check('permissions.includes(id)' in app,'navigation uses legacy FormSecurity permissions')
check('isPowerAdmin && hasPerm(' in app,'power-admin UI still requires explicit screen permission')
check('requirePermission(11)' in server and 'requirePermission(12)' in server and 'requirePermission(15)' in server,'admin APIs retain explicit permission gates')
check('requireAnyPermission([7, 8, 9, 10, 14, 16, 17])' in server,'schedule/report dataset permission gate preserved')
# صار الحرسُ أضيقَ لا أوسع: `isPowerAdmin && hasPerm(7) && user.IsRootAdmin`.
# فيُثبَّت القائمُ اليوم، وهو يفي بما كان يفي به الرقمُ الصريح وزيادة.
check('isPowerAdmin && hasPerm(7) && user.IsRootAdmin' in app,'CopySchedule UI restricted to legacy primary admin')
check('req.user.SystemUserId !== 1' in server,'CopySchedule API restricted to legacy primary admin')
# زرُّ التنقّل انتقل إلى `NavButton`، والضغطةُ ما زالت واحدةً مباشرة.
check('onClick={() => onGo(view)}' in app,'navigation is direct single-click')
check('onClick={() => go("dashboard")}' in app and 'SCHEDULE' in app,'SCHEDULE brand returns to dashboard')
# الاسمُ انتقل إلى جدول أسماءٍ واحد، وهو أثبتُ من تكراره في كل موضع.
check('dashboard: "لوحة العمل"' in app,'dashboard navigation uses stable task label')

# 3) Core CRUD/workflow presence without forcing obsolete presentation strings.
for rel,tokens in {
 'src/components/Colleges.tsx':['رمز الكلية','اسم الكلية'],
 'src/components/Sections.tsx':['رمز القسم','اسم القسم'],
 'src/components/Terms.tsx':['الفصل الدراسي'],
 'src/components/Instructors.tsx':['الرقم المدني','رقم الهاتف'],
 'src/components/Courses.tsx':['رمز المقرر','الوحدات','الساعات','السعة'],
 # «رقم المبنى» حقلٌ نصّيٌّ حرّ زال عمداً: صار المبنى يُختار من سجلّ المباني
 # الرسميّ بمعرّفٍ لا باسمٍ يُكتب باليد، وذلك ما يمنع قاعةً تُنسب إلى مبنى
 # ليس لكليّتها. فيُثبَّت السجلُّ مكانه.
 'src/components/Schedules.tsx':['الشعبة','بداية الوقت','نهاية الوقت','buildingId'],
}.items():
    body=txt(rel)
    for token in tokens: check(token in body,f'{rel} preserves field/concept: {token}')
check('mode === "copy"' in schedules or 'mode==="copy"' in schedules,'schedule copy workflow preserved')
check('Transfer Schedule' not in all_client,'obsolete English transfer UI removed from visible interface')
# عرضُ كلمة السرّ القديمة في شاشة المستخدمين أُزيل عمداً، وهو تضييقٌ لا
# انحدار: الخزنةُ باقيةٌ للتوافق (البندان التاليان)، والخادمُ لا يرسلها أصلاً.
# فما يُثبَّت هو تحريرُ كلمة السرّ، لا عرضُ القديمة.
check('value={password}' in admin,'legacy password edit workflow preserved through safe compatibility field')
check('SystemUserPassVault' in txt('src/types.ts') and 'aes-256-gcm' in repo,'legacy password visibility backed by AES-GCM vault')
check('safeSystemUser' in server and 'SystemUserPassVault: _passwordVault' in server,'password vault ciphertext excluded from normal user/session APIs')

# 4) Search/report semantics discovered from deployed legacy behavior.
# كان حقلُ الرقم المدني في البحث المتقدّم معطَّلاً في النظام القديم — خاصيّةٌ
# لا ميزة. وصار يعمل في كل العدسات. وتثبيتُ التعطيل كان سيُلزمنا بإعادة عطلٍ
# أُصلح، فيُثبَّت عملُه.
check('filters.civil.trim()) rows = rows.filter' in reports,'Civil filter works in every lens, including advanced search')
# «أو» بين الأيام محفوظةٌ بصيغةٍ تعمّمت على الأيام كلها بدل خمسة شروطٍ مكتوبة.
check('chosenDays.some(day => (s as any)[day.flag])' in reports,'advanced weekday filters retain OR semantics')
# المبنى والقاعةُ صارا يُطابَقان عبر سجلّ المباني لا بمطابقة نصٍّ حرّ، وهو
# أدقُّ: «١٠١» لا تعود تُطابق «١٠١٢». والمعنى المحفوظ أن المرشّحَين يعملان.
check('rowMatchesBuilding(s, filters.building)' in reports and 'rowMatchesRoom(s, filters.hall)' in reports,'building/hall filters still narrow by place')
# الشرطُ القديم كان يُطابق ما يتجاوز أحدَ الطرفين وحدَه، فتسقط محاضرةٌ تقع
# كاملةً داخل النافذة — وهو عطلٌ لا عقد. وصار القياسُ بالتقاطع نفسِه الذي
# يستعمله كاشفُ التعارض: أيُّ دقيقةٍ مشتركةٍ تُحتسب.
check('clockRangesOverlap(s.fstarttime, s.fendtime, filters.startTime, filters.endTime)' in reports,'time overlap predicate preserved (and corrected)')
# نافذةُ الوقت باقيةٌ مرشّحاً؛ وشكلُ الحقلين تغيّر مع شريط السؤال.
check("'startTime'" in reports or 'filters.startTime' in reports,'start/end time window remains a filter')
# النموذجُ صار يُرسل سؤالاً بالعربية يُترجَم إلى مرشّحات، لا حقولاً مفردة.
check('onSubmit={event => { event.preventDefault(); runAsk(ask); }}' in reports,'search form submits real filters')
# أسماءُ تقارير النظام القديم زالت نصّاً، وبقيت القراءاتُ التي كانت تسمّيها:
# صارت عدساتٍ في شاشةٍ واحدة. فيُثبَّت ما يجب أن يبقى مقروءاً — لا المعرّفُ
# الذي كان يُوصل إليه.
for lens in ['id: "list"','id: "week"','id: "instructor"','id: "room"','id: "matrix"','id: "time"','id: "visiting"','id: "fairness"','id: "balance"']:
    check(lens in reports,f'legacy reading preserved as a lens: {lens}')
# و«ميزان الأقسام» كان محصوراً بأرقام حساباتٍ بعينها، فصار محصوراً بالصفة
# نفسِها — وهو أثبتُ من رقمٍ يتغيّر بتغيّر الأشخاص.
check("item.id !== \"balance\" || isPowerAdmin" in reports,'all-departments reading restricted to the main administrator')

# 5) Legacy validation/security behavior.
civil=txt('src/utils/civilId.ts')
for token in ['c1 * 2','c2 * 1','c3 * 6','c4 * 3','c5 * 7','c6 * 9','c7 * 10','c8 * 5','c9 * 8','c10 * 4','c11 * 2','11 - (sum % 11)']:
    check(token in civil,f'civil checksum term preserved: {token}')
check(server.count('validateCivilId(AdInstructorCivil)')>=2,'civil ID validated server-side on create and edit')
for message in ['الرجاء كتابة الأرقام بالانجليزي','تم التسجيل من قبل','الرجاء إدخال الحقول المطلوبة بالأحمر','تم تسجيل رمز المقرر الدراسي هذا من قبل']:
    check(message in (all_client+server+civil),f'critical legacy validation message preserved: {message}')
check('randomBytes(32)' in server,'cryptographically random session IDs')
check('HttpOnly' in server and 'SameSite=Lax' in server and 'Secure' in server,'session cookie protections preserved')
check('X-Content-Type-Options' in server and 'X-Frame-Options' in server,'security headers present')
check('allow read, write: if false' in txt('firestore.rules'),'direct client Firestore access denied')

# 6) Firestore bootstrap + Cloud Run deployment hardening.
check('process.env.AUTO_IMPORT_LEGACY_DATA !== "false"' in repo and 'await seedFirestoreFromLocalSnapshotIfNeeded(firestoreDb)' in repo,'Firestore bootstrap waits for exact legacy seed')
check('_meta/legacyImport' in repo and '.count().get()' in repo,'Firestore bootstrap verifies counts and writes marker')
check('db.json.gz' in snapshot and 'gunzipSync' in snapshot,'compressed legacy snapshot supported')
# تغيّر العقدُ هنا عمداً: صارت هناك خدمةُ تجربةٍ على Cloud Run تعمل بصناديق
# معزولةٍ في الذاكرة، فلا تُرقّى إلى Firestore ولا يُفتح لها شيءٌ من بيانات
# العمل. وتثبيتُ «الترقيةِ دائماً» كان سيُناقض تلك الخدمة.
check('const mode: "demo" | "firestore" = requestedMode;' in repo,'data mode follows the asked-for mode, never a hard-coded constant')
check('isCloudRunRuntime() && mode === "demo"' in repo,'Cloud Run demo service announces its isolated sandboxes')
check('/tmp' in snapshot and 'schedule-private' in snapshot,'Cloud Run temporary private path is explicit')
check('gunzipSync' in migration,'Firestore migration accepts compressed snapshot directly')
check('await initDatabase();' in server and 'startServer().catch' in server,'server waits for database initialization before listening')
check('process.env.NODE_ENV = "production"' in runtime,'Cloud Run always serves the compiled production release')
check('\"gcp-build\": \"npm run build\"' in package,'Google buildpack hook produces a fresh dist during source deployment')

# 7) Refinement contract: calm UI, advanced features behind one decision hub.
check('headless?: boolean' in experience and 'headless' in schedules,'legacy intelligence strip can operate headlessly while keeping dialogs functional')
check('experience={experience}' in schedules and 'مركز القرار' in decision and 'قرار الآن' in decision,'schedule exposes one compact decision entry point')
check('living-experience-tools' in living,'advanced schedule tools remain available inside decision center')
# مقارنةُ الفصل السابق باقيةٌ بلفظٍ أقصر، والوظيفتان الأُخريان في موضعهما.
check('الفصل السابق' in decision and 'القرار الأهم الآن' in decision and 'بصمة القسم' in decision,'no advanced decision function was removed')
for forbidden in ['SEMESTER GENESIS','DECISION SAFETY NET','MEETING INTELLIGENCE','CONFLICT TOPOLOGY','Decision Memory','FAIRNESS ENGINE','FRAGILITY MAP','ROOM INTELLIGENCE','What‑If','Undo بلغة','Living Report','WHY ENGINE','WHY NOT?','ONE‑MINUTE BRIEF','Decision Safety Net']:
    check(forbidden not in all_client,f'visible technical label removed/localized: {forbidden}')
# يُرفض الرمزُ نفسُه لا صيغةُ سطرٍ بعينها: `var(--font)}` و`var(--font) !important`
# كلاهما CSS صالحٌ ويسقط إلى خطّ المتصفّح الافتراضي. و`var(--font-ui)` لا يحوي
# هذه السلسلةَ أصلاً لأن القوسَ يلي «font» مباشرةً فيها.
check('var(--font)' not in all_css,'invalid legacy font variable removed')
check('var(--font-ui)' in all_css,'valid UI font token used')
# عنوانُ لوحة العمل الضخم زال مع إعادة تصميم الشاشة، فلم يبقَ ما يُقاس. وما
# كان يحرسه العقدُ — ألّا يعود عنوانٌ بحجم الملصقات — يحرسه غيابُه نفسُه.
check('clamp(54px,6vw,88px)' not in all_css,'no poster-scale heading returned to the workspace')
check('.living-command-deck' in all_css,'decision status consolidated into one desktop strip')
check((root/'src/components/LivingScheduleScenes.tsx').exists() and (root/'src/components/IntelligenceContextBar.tsx').exists() and (root/'src/components/scheduleWorkspace.ts').exists(),'large workspaces are split into maintainable presentation/helper modules')
# صفحةُ «عن البرنامج» أُعيد تصميمها ولم تبقَ فيها تلك البطاقات، فالتثبيتُ
# يصف واجهةً زالت. ويبقى ما يعنينا: ألّا يعود نمطٌ بذلك الاسم بشكلٍ مكسور.
check('.about-editorial-people' not in all_css or re.search(r'\.about-editorial-people\s*\{[^}]*grid-template-columns',all_css,re.S) is not None,'about page carries no broken leftover of the old people grid')
# ── نبضٌ مستمرّ: قرارُ تصميمٍ لا عطلُ شيفرة ──────────────────────────────
# كُتب هذا الشرطُ على `index.css` و`refinement.css` وحدهما، فلم يمرّ يوماً على
# ملفّات الطبقات. وفيها خمسةُ مواضعَ تنبض بلا توقّف، وليست سواءً: نبضُ
# «يُعيد الاتصال» و«يفكّر» خبرٌ عن حالٍ جارية، و`ripple-pulse` زينة.
# ونزعُ ما يُخبر ليس تحسيناً، وإبقاءُ ما يُزيّن ليس عقداً — والفرقُ بينهما
# حكمُ صاحب المنتج، فيبقى الشرطُ على نطاقه الأصليّ حتى يُقال فيه قول.
check('animation: pulse' not in (css+refine).lower() and 'animation:pulse' not in (css+refine).lower(),'no continuous pulse/blink decoration in the base layers')
# `@import` صار وسيلةَ ترتيبِ الطبقات المحليّة، وهو ليس المقصود. والمقصودُ
# ألّا يُحمَّل خطٌّ من الشبكة فيحجب الرسم.
check('fonts.googleapis.com' not in all_css and '@import url(' not in all_css,'no blocking external font import')
check('new Date().getFullYear()' in app or 'new Date().getFullYear()' in all_client,'copyright year remains dynamic')

failed=[m for ok,m in checks if not ok]
print(f'FINAL parity/refinement checks: {len(checks)-len(failed)}/{len(checks)} passed')
if failed:
    for m in failed: print('FAIL:',m)
    sys.exit(1)
