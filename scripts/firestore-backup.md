# النسخ الاحتياطي لقاعدة البيانات الحقيقية (Firestore)

> **الحالة قبل هذا الملف:** لا توجد نقطة استرجاع واحدة لجدول الجامعة الحقيقي.
> الحماية الموجودة في الكود (`db.json.backup`، الكتابة الذرية) تخص **الوضع
> التجريبي المحلي فقط** — وCloud Run يفرض `DATA_MODE=firestore`. أي حذف خاطئ
> أو خطأ في سكربت استيراد كان يعني فقداً نهائياً، بما فيه أرشيف `legacyArchive`
> المنقول من نسخة SQL لعام 2015 والذي لا يمكن إعادة إنتاجه.

الخطوتان التاليتان تُنفَّذان مرة واحدة، وتحتاجان صلاحية المالك على المشروع.

---

## ١. الاسترجاع الزمني (PITR) — سبعة أيام إلى الوراء

يحفظ Google نسخة من كل دقيقة خلال آخر سبعة أيام، فيمكن الرجوع إلى ما قبل أي
خطأ بدقة. هذه أهم خطوة وأسرعها.

```bash
gcloud firestore databases update --database='(default)' --enable-pitr
```

للاسترجاع لاحقاً إلى لحظة محددة (يُنشئ قاعدة جديدة ولا يلمس الحالية):

```bash
gcloud firestore databases restore --source-database='(default)' --destination-database='recovered' --snapshot-time='2026-08-14T09:00:00Z'
```

## ٢. تصدير يومي إلى Cloud Storage — أرشيف طويل الأمد

PITR يغطي أسبوعاً؛ التصدير يغطي ما بعده.

```bash
# دلو مخصص للنسخ، في نفس منطقة قاعدة البيانات
gcloud storage buckets create gs://schedule-backups --location=me-central1

# يحذف النسخ الأقدم من سنة تلقائياً
gcloud storage buckets update gs://schedule-backups \
  --lifecycle-file=<(echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":365}}]}')

# تصدير يدوي للتجربة
gcloud firestore export gs://schedule-backups/$(date +%Y-%m-%d) --database='(default)'
```

جدولة يومية عبر Cloud Scheduler:

```bash
PROJECT=$(gcloud config get-value project)

gcloud services enable cloudscheduler.googleapis.com

gcloud scheduler jobs create http firestore-daily-export \
  --schedule="0 2 * * *" \
  --time-zone="Asia/Kuwait" \
  --uri="https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default):exportDocuments" \
  --http-method=POST \
  --oauth-service-account-email="$PROJECT@appspot.gserviceaccount.com" \
  --message-body='{"outputUriPrefix":"gs://schedule-backups/daily"}'
```

يحتاج حساب الخدمة الدورين: `roles/datastore.importExportAdmin` و
`roles/storage.admin` على الدلو.

## ٣. التحقق — نسخة لا تُختبر ليست نسخة

مرة كل فصل دراسي:

```bash
# استورد آخر نسخة إلى قاعدة اختبار منفصلة، لا إلى الإنتاج
gcloud firestore import gs://schedule-backups/daily/<اسم-المجلد> --database='drill'
```

ثم شغّل البرنامج على `FIREBASE_DATABASE_ID=drill` وتأكد من ظهور الجدول وعدد
المواعيد. بعدها احذف قاعدة `drill`.

## قواعد التشغيل

- **لا تشغّل أي سكربت استيراد على قاعدة الإنتاج قبل التأكد من وجود تصدير حديث.**
  `npm run migrate:firestore:replace` مدمّر بطبيعته.
- القواعد الأمنية (`firestore.rules`) تمنع كل وصول مباشر من المتصفح؛ السيرفر
  وحده يكتب عبر Admin SDK. أي تعديل يوسّع تلك القواعد يجب أن يمر بمراجعة.
- سياسة TTL في `firestore.indexes.json` تحذف الجلسات المنتهية وحدها، فلا تحتاج
  تنظيفاً يدوياً.
