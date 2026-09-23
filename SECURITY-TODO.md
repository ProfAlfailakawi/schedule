# SECURITY-TODO — إصلاحات مؤجّلة تحتاج موافقة المالك

هذه بنود **لم تُطبّق** في جولة التنظيف الآمن (2026-09) لأنها قد تكسر التشغيل أو
تحتاج قراراً من المالك. لا تُطبَّق تلقائياً. لم تُلمس طبقة Gemini ولا المصادقة ولا
`firestore.rules` (deny-all سليمة).

> تحديث 2026-09-04: نُفّذ البند 4 (حدّ معدّل على `/api/public/*`)، ونُفّذ البند 5
> (تخطٍّ صريح موصوف للاختبارات المعتمدة على اللقطة الخاصة). البندان 1 و3 ما زالا
> مؤجّلين ويحتاجان قرار المالك؛ التفاصيل أدناه.
>
> تحديث 2026-09-20: نُفّذ البند 8 (إحياء عقد المطابقة وتشغيل أقسامه 2-7 دائماً).
>
> تحديث 2026-09-23: البند 0 يتولّاه المالك بنفسه. نُفّذ البند 6 (مسارُ ملفّي OCR)
> وحُسم البند 3 (Cloud Armor، وأوامرُه جاهزة أدناه) وحُسم نبضُ البند 8. وأُوقف البند 7
> عمداً قبل الدفع — السببُ والنتائجُ في موضعه.

---

## FIXED (2026-09-17) — Path traversal / arbitrary file read on `/landing/*` — **HIGH**

- **File/line:** `server.ts:11886` (the `/landing/` sub-asset handler inside the
  landing middleware at `server.ts:11876`).
- **Severity:** HIGH — unauthenticated arbitrary file read. This middleware runs
  **before** the `/api` auth stack and serves the public landing page, so no
  session is required to reach it.
- **The bug:** the handler computed
  `const sub = req.path.slice("/landing/".length)` and then
  `path.join(process.cwd(), "…/landing", sub)` and `res.sendFile`d the result if
  it existed. Express does **not** dot-segment-normalize `req.path` (verified:
  a raw request to `/landing/../../server.ts` yields `req.path ===
  "/landing/../../server.ts"`), so `sub` could be `../../server.ts` and
  `path.join(cwd, "public/landing", "../../server.ts")` resolves to
  `<repo>/server.ts`. `fs.existsSync`/`isFile` passed and the file was sent —
  giving any anonymous caller read access to source, `.env`-adjacent files, service
  account material, etc. (Browsers normalize `..`, but `curl --path-as-is` / any
  raw HTTP client does not.)
- **The fix (minimal, backwards-compatible):** resolve the candidate against a
  fixed base directory with `path.resolve` and require containment
  (`subFile === landingBase || subFile.startsWith(landingBase + path.sep)`) before
  serving. Legitimate assets (which never contain `..`) resolve inside the base and
  are served unchanged; traversal attempts fall through to the landing shell.
  Verified: the exact payload above now returns `contained === false`.
- **Validation:** `npx tsc --noEmit` → exit 0 (no new type errors); behavioral
  proof of both the vuln and the fix run with the real `express`.

## 0) تدوير كلمة سر المدير القديمة — **يتولّاه المالك (أكّد 2026-09-23)**
- كانت كلمة سر حساب `admin` الحقيقية مكتوبة نصاً صريحاً في أربعة ملفات مُلتزَمة:
  `tests/run-tests.ts`، `tests/credential-audit.ts`، `docs/LEGACY_PARITY_MATRIX.md`، `docs/FIRESTORE_IMPORT.md`.
- **أُزيلت من الشجرة** (2026-09-11): الاختبارات تقرأ الآن القيمة المتوقعة من متغيّر البيئة
  `LEGACY_ADMIN_PASSWORD` وتتخطى الفحص باسمِه عند غيابه، والوثائق حُرِّرت.
- **لكن القيمة ما زالت في تاريخ git** ولا يمكن اعتبارها سرّية بعد الآن. المطلوب من المالك:
  1. تغيير كلمة سر حساب `admin` في النظام الحي فوراً (شاشة SystemUser أو مباشرة عبر API).
  2. عند تنظيف تاريخ git (البند 7)، ضم هذه الملفات إلى قائمة إعادة الكتابة.

## 1) ترقية xlsx (ثغرات معروفة) — ما زالت مؤجّلة (محاولة 2026-09-04)
- `xlsx@0.18.5` في `package.json` به ثغرات معروفة (Prototype Pollution / ReDoS، GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9). `npm audit` يصنّفها **high** ويقول `fixAvailable: false`.
- **سبب التأجيل (محقَّق لا مفترض):**
  - آخر إصدار منشور على npm هو `0.18.5` نفسه (`npm view xlsx dist-tags` → `latest: 0.18.5`)؛ SheetJS أوقفت النشر على npm، فلا يوجد إصلاح يمكن سحبه من السجلّ.
  - الإصدار المصحَّح يُوزَّع من مستودع SheetJS الرسمي فقط: `https://cdn.sheetjs.com/xlsx-<ver>/xlsx-<ver>.tgz`. هذا المضيف **محجوب بسياسة الخروج للشبكة** في بيئة العمل الحالية (رفض `403` على CONNECT إلى `cdn.sheetjs.com:443`)، فتعذّر التنزيل والتحقق.
- **أين تُستخدم الحزمة فعلاً** (سطح صغير ومستقر، كله من الواجهة الموثّقة):
  - `server.ts` (تصدير تقرير Excel): `XLSX.utils.json_to_sheet` و`book_new` و`book_append_sheet` و`XLSX.write(wb,{type:"buffer",bookType:"xlsx"})`.
  - `src/components/ScheduleTransfer.tsx` و`src/components/IntelligenceWorkspace.tsx` (استيراد/تصدير ونموذج): `XLSX.read(arrayBuffer,{type:"array"})` و`utils.sheet_to_json` و`utils.aoa_to_sheet` و`writeFile`.
  - هذه الدوال كلها موجودة بالاسم والتوقيع نفسه في `0.20.x`، فالترقية **متوقَّع ألّا تغيّر سطح الاستيراد**؛ ما ينقص هو التنفيذ والتحقق الفعلي.
- **خطوات الترقية عند توفّر منفذ للشبكة (شغّلها كما هي):**
  1. `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (أو أحدث إصدار معلن على `https://cdn.sheetjs.com/`).
  2. تأكّد أن `package.json` صار `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` وأن `package-lock.json` سجّل `resolved` و`integrity` لهذا العنوان (يصبح المستودع معتمداً على مضيف غير npm — قرار يخصّ المالك).
  3. `npm run lint` ثم `npm test` ثم `npm run build`.
  4. تحقّق يدوي لا يغني عنه البناء: تصدير تقرير Excel من الخادم، وتصدير جدول فصل من `ScheduleTransfer`، وتنزيل نموذج الاستيراد، ثم **استيراد** ملف `.xlsx` حقيقي والتأكد من قراءة الصفوف.
- **بديل إن رُفض الاعتماد على مضيف خارجي:** مرآة داخلية للـtarball (Artifact Registry) وتثبيت `xlsx` منها، أو استبدال الحزمة بمكتبة تُنشر على npm (مثل `exceljs`) — وهذا **إعادة كتابة** لطبقتَي الاستيراد والتصدير، لا ترقية.



## 2) مفاتيح Firebase العامة في المستودع — مراجعة
- `firebase-applet-config.json` يحتوي `apiKey` و`oAuthClientId` و`recaptchaSiteKey` و`appId` وغيرها.
- هذه مفاتيح Firebase **من النوع العام (client-side)** ويُقصد كشفها في الواجهة، لكن يُفضّل:
  - التأكد أن حصر الوصول يتم عبر `firestore.rules` (deny-all) وقيود App Check/reCAPTCHA وليس عبر سرية المفتاح.
  - مراجعة `oAuthClientId` والتأكد من ضبط Authorized origins/redirect URIs بدقة.
  - النظر في نقل هذه القيم لمتغيّرات بيئة عند البناء بدل تثبيتها في المستودع (تحسين لا إصلاح عاجل).

## 3) تحديد المعدّل (rate limit) في الذاكرة لا يعمل عبر منطقتين — **حُسم (2026-09-23): Cloud Armor، والتطبيق بيد المالك**
- `rateLimitLogin` و`rateLimitPublic` في `server.ts` عدّادان **في ذاكرة العملية** لكل نسخة. و`cloudbuild.yaml` ينشر الخدمةَ في **منطقتين** (لندن `europe-west2` والدوحة `me-central1`) خلف **موازِن تحميلٍ عامّ واحد** — فكلُّ منطقةٍ وكلُّ نسخةٍ تعدّ وحدها، والسقفُ الحقيقي = الحدّ × عدد النسخ في المنطقتين معاً. وكلُّ بدءٍ باردٍ يصفّر العدّ.
- **القرار: Cloud Armor على موازِن التحميل القائم.** طلب المالك «الأنسب، والأهمّ ألّا يخترب شيء»، وهذا الأنسبُ لثلاثة أسباب محقَّقة لا مفترضة:
  1. **موازِنُ التحميل موجودٌ أصلاً** (يذكره `cloudbuild.yaml` صراحةً)، فيُلصق به Cloud Armor مباشرةً بلا بنيةٍ جديدة.
  2. **لا يلمس شيفرةَ التطبيق إطلاقاً**، فلا يمكن أن يكسر شيئاً فيه، ولا يتصادم مع العمل الجاري على `server.ts` (23 التزاماً من جلسةٍ أخرى وقت الحسم).
  3. **يعمل على الحافة قبل أن تُوقَظ أيُّ نسخة**، فيرى المنطقتين والنسخَ كلَّها عدّاداً واحداً، ويصدّ حتى الفيضانَ الذي يستهلك النُّسخ.
- **لماذا لا Firestore:** يضيف قراءةً وكتابةً على كلّ طلبٍ عامّ في منطقتين (تكلفةٌ وتأخيرٌ على المسار الساخن)، ويعني تعديلَ `server.ts` وسط عملٍ جارٍ عليه. ولا Redis: خدمةٌ مُدارةٌ جديدة وVPC connector لقاء ما يعطيه Cloud Armor بلا شيفرة.
- **لم يُطبَّق من هنا:** بيئةُ العمل بلا `gcloud` ولا وصولٍ إلى مشروع جوجل — وتغييرُ أمنِ الإنتاج يُطبَّق بيد من يراقبه لا من صندوقٍ معزول. **الأوامرُ أدناه لم تُشغَّل**، فراجع كلَّ علمٍ منها بـ `--help` قبل التشغيل.
- **الخطوات — تبدأ بوضع المعاينة، فلا تحجب شيئاً ولا تكسر شيئاً:**
  ```bash
  # 1) اعرف اسمَ خدمة الخلفية التي يوجّه إليها الموازِن (قراءة فقط):
  gcloud compute backend-services list --global

  # 2) أنشئ السياسة:
  gcloud compute security-policies create schedule-edge-rate \
    --description="حدّ معدّل على الحافة لسطح /api/public وتسجيل الدخول"

  # 3) قاعدةُ السطح العام — --preview: تُسجِّل من كان سيُحجب ولا تحجبه.
  #    240/دقيقة لكل IP لأن جامعةً خلف NAT واحد عنوانٌ واحد لعشرات الطلبة (انظر البند 4).
  gcloud compute security-policies rules create 1000 \
    --security-policy=schedule-edge-rate \
    --expression="request.path.startsWith('/api/public/')" \
    --action=rate-based-ban \
    --rate-limit-threshold-count=240 --rate-limit-threshold-interval-sec=60 \
    --ban-duration-sec=300 \
    --conform-action=allow --exceed-action=deny-429 \
    --enforce-on-key=IP \
    --preview

  # 4) قاعدةُ تسجيل الدخول — أضيق، وفي المعاينة كذلك:
  gcloud compute security-policies rules create 1100 \
    --security-policy=schedule-edge-rate \
    --expression="request.path == '/api/auth/login'" \
    --action=rate-based-ban \
    --rate-limit-threshold-count=60 --rate-limit-threshold-interval-sec=60 \
    --ban-duration-sec=600 \
    --conform-action=allow --exceed-action=deny-429 \
    --enforce-on-key=IP \
    --preview

  # 5) ألصق السياسةَ بخدمة الخلفية من الخطوة 1:
  gcloud compute backend-services update <BACKEND_NAME> \
    --security-policy=schedule-edge-rate --global
  ```
- **بعد اللصق:** راقب سجلّات الموازِن أياماً تشمل موسمَ ذروة (بداية تسجيل). السجلُّ في المعاينة يُظهر من **كان سيُحجب**. إن ظهر مستخدمون حقيقيون فارفع العتبة؛ وإن لم يظهر إلا ما يُراد حجبُه فأزِل المعاينة بـ `gcloud compute security-policies rules update 1000 --security-policy=schedule-edge-rate --no-preview` (ثم 1100). والرجوعُ في أيّ لحظة: `gcloud compute backend-services update <BACKEND_NAME> --no-security-policy --global`.
- **العدّادُ في الذاكرة يبقى** طبقةً ثانيةً رخيصة داخل كلّ نسخة. وما دامت الخطوة 5 لم تُنفَّذ، فالحدُّ القائم **يقلّل الضرر ولا يمنعه**، ويجب ألّا يُوصف بأنه حمايةٌ من فيضانٍ موزّع.

## 4) لا حدّ على `/api/public/*` — **نُفِّذ (2026-09-04)**
- أُضيف `rateLimitPublic` في `server.ts` ورُكّب على كامل المسار: `app.use("/api/public", rateLimitPublic)` — أي أنه يغطّي كل نقاط النهاية العامة الحالية والمستقبلية، لا نقطة بعينها.
- السلوك: نافذة ثابتة لكل IP (`req.ip`، و`app.set("trust proxy", 1)` مضبوط أصلاً فالعنوان هو عنوان الزائر لا الوسيط)، وعند التجاوز يردّ `429` مع ترويسة `Retry-After` ورسالة عربية واضحة. النوافذ المنتهية تُكنس دورياً فلا تنمو الذاكرة بصف لكل عنوان.
- الضبط عبر متغيّرات البيئة (لا أرقام مدفونة):
  - `PUBLIC_RATE_LIMIT_MAX` — الافتراضي `60` طلباً لكل نافذة لكل IP. القيمة `0` **تعطّل الحدّ بالكامل** (مخرج فوري إن ضاق على استخدام مشروع).
  - `PUBLIC_RATE_LIMIT_WINDOW_MS` — الافتراضي `60000` (دقيقة)، وأدنى قيمة مقبولة 1000. أي قيمة غير صالحة تعود إلى الافتراضي بدل أن تعطّل الحماية صامتة.
- **انتبه قبل تضييق الرقم:** جامعة خلف NAT واحد تظهر كعنوان IP واحد لعشرات الطلبة في موسم التسجيل. إن ظهرت شكاوى `429` من صفحة الاستبيان أو رابط المشاركة، ارفع `PUBLIC_RATE_LIMIT_MAX` أولاً (مثلاً 240) قبل التفكير في تعطيله.
- تغطية الاختبار: القسم 38 في `tests/run-tests.ts` (تثبيتات على مستوى المصدر — تشغيل الوسيط فعلياً يحتاج خادماً وقاعدة حيّة).

## 5) الاختبارات تعتمد على `database/db.json.gz` غير الموجود في CI — **نُفِّذ (2026-09-04): تخطٍّ صريح موصوف**
- الملف **مستبعَد عمداً** عبر `.gitignore` لأنه بيانات Legacy حقيقية (PII)، فهو غير موجود في CI ولن يكون. توليد عيّنة مصغّرة داخل الاختبار **لا يصلح هنا**: هذه المجموعات تتحقّق من أعداد صفوف حقيقية بعينها (15430 موعداً، 743 مدرّساً…) ومن كلمات سرّ مُهاجَرة فعلاً — بيانات مُصطنعة تجعلها تمرّ بلا معنى.
- ما تغيّر: كل مجموعة تعتمد على اللقطة صارت تطبع `[SKIP]` يذكر **ما لم يُتحقَّق منه** و**كيف يُتحقَّق محلياً**، بدل سطر عام واحد يسهل قراءته كنجاح:
  - `tests/run-tests.ts` — يُنهي بمجموع موسوم `(source-level checks only)` فلا يبدو الرقم مجموعاً كاملاً.
  - `tests/legacy-data-audit.py` و`tests/parity_audit.py` — عبر `print_snapshot_skip` في `tests/snapshot_loader.py`.
  - `tests/credential-audit.ts` — يفحص الآن وجود **مفتاح الخزنة** أيضاً ويسمّي الناقص، بدل أن ينهار عند غيابه لو وُجدت اللقطة وحدها.
- النتيجة: `npm test` في بيئة نظيفة يعمل ويعطي نتيجة صادقة (2751 فحصاً على مستوى المصدر + أربع مجموعات متخطّاة موصوفة).



## 6) ملفات OCR (`ara.traineddata` / `eng.traineddata`) — **نُفِّذ (2026-09-23): المسارُ صريح، والملفّان في مكانهما**
- **العيبُ الفعليّ لم يكن الموضع بل الافتراض:** كان tesseract يجد الملفّين لأن مجلّدَ التشغيل هو `/app` مصادفةً. من مجلّدٍ آخر يطلبهما من الشبكة.
- **قيس بلا شبكة**، على المسار الحقيقي نفسه (esbuild بأعلام الإنتاج، والحزمة تحت الجذر بمستوى كما يقع `dist/server.cjs`):
  | الحالة | النتيجة |
  |---|---|
  | قبل التغيير، من مجلّدٍ آخر | jsdelivr → `403`، فشل |
  | بعده، من المجلّد نفسه | تعمل |
  | بعده، من الجذر (حالة الإنتاج اليوم) | تعمل كما كانت |
  | بعده، مع `OCR_DATA_DIR` صريح | تعمل |
- **ما تغيّر (`src/utils/documentOcr.ts`):** كلُّ عاملٍ من المواضع الخمسة يمرّ بـ `newOcrWorker`، الذي يبحث عن الملفّين في `OCR_DATA_DIR` ثم مجلّد العمل ثم مجلّد البرنامج وأبيه. **لا يُعطى tesseract مساراً إلا إن وُجد الملفّان كلاهما**؛ وإلا تُترك قيمتُه الافتراضية كما كانت — فلا يُضيَّق شيءٌ كان يعمل. والمحرّكُ متروكٌ لافتراضه (`undefined`) فلا يتغيّر التعرّف نفسه.
- **لماذا لم يُنقلا:** النقلُ يلمس النشر (`.gcloudignore` و`Dockerfile`) بلا فائدةٍ وظيفية، والعيبُ كان الافتراض. وطُلب «الأهمّ ألّا يخترب شيء».
- **ملاحظة صادقة عن الأثر:** في الاختبار المعزول أسقط الفشلُ العمليةَ كلَّها، لكن الخادم يركّب `unhandledRejection`/`uncaughtException` (`server.ts`)، فالأثرُ في الإنتاج كان سيكون **فشلَ قراءة OCR لا سقوطَ الخادم**.
- مُثبَّت في `tests/parity_audit.py`: أيُّ `createWorker("…")` مباشرة يُخفق.

## 7) تنظيف تاريخ git — **أُوقف عمداً قبل الدفع (2026-09-23)؛ لا حاجةَ إليه بعد تدوير كلمة السرّ**
- **ما جرى:** وافق المالك على إعادة الكتابة، فأُعدّت على نسخةٍ منفصلة وأُنشئ فرعُ نجاةٍ مرفوع (`backup/pre-history-rewrite-20260920`). ثم أُعيد تشغيلُ بيئة العمل قبل الدفع، وتبيّن عند العودة أن **جلسةً أخرى دفعت 68 التزاماً إلى `main`** في الأثناء (منها إعادةُ هيكلةٍ للخادم).
- **لماذا أُوقف:** دفعُ التاريخ المُعاد كتابته من تلك النسخة **كان سيمحو الالتزامات الـ68 كلَّها**. وإعادةُ الكتابة من جديد الآن تكسر النسخةَ المحلية لجلسةٍ تعمل في هذه اللحظة. فحُذفت النسخةُ المُعاد كتابتها كي لا تُدفع خطأً، وتحقّق أن **لا شيء دُفع**: الالتزامُ `8ed1a4c` ما زال سلفاً لـ `main`.
- **ولماذا لا حاجةَ إليه أصلاً — ثلاثُ حقائق خرجت من الإعداد:**
  1. **القائمةُ السابقة في هذا البند كانت غيرَ دقيقة.** `cookies.txt` و`room-registry-review.xlsx` و`metadata.json` و`bun.lock` و`fix-server.command` و`.crop.ts` **لم تُلتزَم في التاريخ قط**. الموجودُ فعلاً خمسةُ سكربتاتِ فحصٍ فقط: `.probe-lines.ts` و`test-firestore.mjs` و`test-headers.ts` و`test-ocr-build.cjs` و`test-ocr.ts` — ولا بياناتَ حسّاسة فيها.
  2. **القيمةُ الحسّاسة الوحيدة هي كلمةُ سرّ `admin`** (8 أحرف، 3 مواضع، أُزيلت في `c9cbe60`)، وتصل إليها 8 مراجع منها `main`.
  3. **مراجعُ طلبات الدمج `refs/pull/*` لا يمكن إعادةُ كتابتها** — GitHub يرفض الكتابة فيها ويحتفظ بها. فحتى إعادةُ كتابةٍ كاملةٍ ناجحة **لا تمحو القيمة من GitHub** دون تدخّل GitHub Support.
- **الخلاصة:** الإصلاحُ الحقيقيّ هو **التدوير** (البند 0)، والمالكُ يتولّاه. بعده تصير القيمةُ في التاريخ بلا قيمة، وإعادةُ الكتابة خطرٌ بلا مقابل.
- **فرعُ النجاة** `backup/pre-history-rewrite-20260920` يشير إلى `8ed1a4c`، وهو في تاريخ `main` أصلاً، فلا يضيف انكشافاً. لم يعد له غرض، ويمكن حذفُه متى شاء المالك.

## 8) تثبيتات المطابقة في `tests/parity_audit.py` قديمة مقابل الشيفرة الحالية — **نُفِّذ (2026-09-20)**
- الخلفية: من أقسام `parity_audit.py` السبعة، **قسم واحد فقط** (القسم 1) يحتاج اللقطة الخاصة؛ الأقسام 2-7 كلها تقرأ ملفات المصدر وتستطيع العمل في CI. ولأن المجموعة كانت تخرج مبكراً عند غياب اللقطة، لم تُنفَّذ تلك الأقسام منذ فترة، وتشغيلها أعطى **30 إخفاقاً**.
- ما جرى: رُوجعت الثلاثون تثبيتاً **واحداً واحداً** مقابل الشيفرة الحالية. تبيّن أن أياً منها ليس انحداراً في المنتج:
  - ما بقي سلوكه وتغيّرت صياغته **حُدِّث** إلى الصياغة الحالية (مثل `permissions.includes(id)` بعد `useCallback`، و`onClick={() => onGo(view)}`، و`user.IsRootAdmin`، و`clockRangesOverlap(...)`، والعدسات التسع التي حلّت محلّ أسماء تقارير Legacy الثمانية).
  - ما وصف واجهةً زالت فعلاً **حُذف** مع سبب مكتوب بالعربية في مكانه (خاصية civil الخاملة، `SystemUserPassDisplay`، `editorial-dashboard-hero`، `about-editorial-people`).
- وُسِّع مصدرا القراءة: `all_css` (يشمل `src/index.css` وكل `src/styles/*.css` بعد التقسيم إلى طبقات) و`decision` (living + experience + schedules).
- صار التخطّي محصوراً بالقسم 1 وحده (`if SNAPSHOT_READY:`)، والأقسام 2-7 تعمل دائماً.
- **العقد أثبت أنه غير فارغ**: عُكس تثبيتان عمداً (رمز الخط، ونقرة التنقّل) فأعطى كلٌّ منهما إخفاقه المنفرد.
- النتيجة: `133/133` ناجحة، والمجموعة صارت جزءاً حياً من `npm test`.
- **ما كشفه العقد فور إعادة تشغيله (عيبان حقيقيان لا تثبيتان قديمان):**
  1. `var(--font)` مستخدَم في **14 موضعاً** بينما لا يُعرَّف متغيّر `--font` في أي مكان في الشجرة — أي أن تلك المواضع كانت تسقط إلى خطّ المتصفّح الافتراضي. **أُصلح** بتحويلها إلى `var(--font-ui)` المعرَّف فعلاً.
  2. خمسة مواضع `animation: pulse … infinite` في ملفات الطبقات: حركة دائمة لا تتوقف. **حُسم (2026-09-23)، وأرضيةُ السكون نُفِّذت قبله.**
     - *الحسم:* قال المالك «نفّذ الأنسب». قُرئ كلُّ موضعٍ من الشيفرة بمتى يُعرض: أربعةٌ حالٌ عابرة تقف وحدها («يُعيد الاتصال»، «يفكّر»، «أحلّل…»، «تغيّر للتوّ» ستَّ ثوانٍ) فبقيت؛ وواحدٌ زينة — نقطةُ لوحة العمل الخضراء تُعرض بلا شرطٍ وتنبض طوال الجلسة — فسكنت. قيس في Chromium، ومُثبَّت في الاتجاهين.
     - *تصحيح:* ملاحظةٌ سابقةٌ هنا وفي عقد المطابقة عدّت `ripple-pulse` زينة، وهو «أحلّل…» — خبر.
     - *ما نُفِّذ (2026-09-20):* مكوّناتُ الواجهة المكتوبةُ بجافاسكربت كانت تحترم `prefers-reduced-motion` كلٌّ في موضعه، لكن **طبقةَ الأنماط لم تكن تحترمه إطلاقاً** — فكلُّ الحركات اللانهائية تظلّ تنبض عند من ضبط نظامَه على تقليل الحركة، ومنهم من يُصيبه ذلك بدوارٍ أو صداعٍ نصفيّ لا بانزعاجٍ فحسب. أُضيفت أرضيةٌ في `src/styles/01-foundation.css` تختصر كلَّ حركةٍ إلى لحظةٍ واحدة تصل فيها إلى حالتها النهائية وتقف (لا إلغاءَ للحركة بل عرضُ نهايتها) — وهو ما تقوله `Onboarding.tsx` صراحةً عن فلسفة تقليل الحركة في هذا المشروع.
     - *التحقّق:* قُيس في Chromium حقيقي — بلا تقليلِ حركة: `2s / infinite`؛ ومع `--force-prefers-reduced-motion`: `1e-05s / 1`. ومُثبَّت في عقد المطابقة، وبُرهن أن التثبيت غيرُ فارغٍ بحذف الأرضية وتلقّي إخفاقه المنفرد.
