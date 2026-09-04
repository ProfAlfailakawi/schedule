# أول نشر — مهم

## Google AI Studio / Cloud Run

ارفع ZIP كما هو **من دون `node_modules`**. ملف البيانات داخل الحزمة هو:

```text
database/db.json.gz
```

وهو Snapshot حقيقي مضغوط. لا تفك ضغطه يدوياً. الخادم يقرأه مباشرة، وإذا كان Firestore فارغاً يستورده ويتحقق من الأعداد قبل فتح تسجيل الدخول.

في Cloud Run لا يعتمد البرنامج على الكتابة داخل مجلد المشروع. إذا بقي `DATA_MODE=demo` في ملف `.env` القديم، يكتشف Cloud Run ذلك ويستخدم Firestore تلقائياً بدلاً من تشغيل قاعدة JSON مؤقتة.

الإعداد المفضل في متغيرات البيئة هو:

```env
DATA_MODE=firestore
AUTO_IMPORT_LEGACY_DATA=true
```

وتأكد من `FIREBASE_PROJECT_ID` و`FIREBASE_DATABASE_ID` إذا كنت تستخدم قاعدة Firestore غير الافتراضية.

## cPanel / استضافة تقليدية

استخدم مساراً دائماً خارج مجلد الإصدار:

```env
SCHEDULE_PRIVATE_DIR=/absolute/persistent/path/schedule-private
```

ثم بعد أول تشغيل ناجح:

```bash
npm run protect:data
```

بهذا لا تستطيع أي عملية رفع لاحقة حذف بيانات التشغيل.


### وضع التشغيل
على Cloud Run يفرض التطبيق `NODE_ENV=production` تلقائياً حتى يخدم ناتج البناء المترجم من `dist`. في cPanel أو Node التقليدي عيّن `NODE_ENV=production` في بيئة الاستضافة قبل تشغيل التطبيق.
