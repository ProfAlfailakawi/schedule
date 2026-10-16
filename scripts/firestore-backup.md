# النسخ الاحتياطي لقاعدة البيانات الحقيقية (Firestore)

> **الحالة قبل هذا الملف:** لا توجد نقطة استرجاع واحدة لجدول الجامعة الحقيقي.
> الحماية الموجودة في الكود (`db.json.backup`، الكتابة الذرية) تخص **الوضع
> التجريبي المحلي فقط** — وCloud Run يفرض `DATA_MODE=firestore`. أي حذف خاطئ
> أو خطأ في سكربت استيراد كان يعني فقداً نهائياً، بما فيه أرشيف `legacyArchive`
> المنقول من نسخة SQL لعام 2015 والذي لا يمكن إعادة إنتاجه.

> **نطاق SCHEDULE الفعلي (يجب عدم استبداله بـ `(default)`):** خدمة التطبيق في
> `schedule-863eb` تقرأ قاعدة SCHEDULE المسماة
> `ai-studio-schedule-337bbbf5-1098-44cb-aabf-95536daf9106` من مشروع البيانات
> `gen-lang-client-0379571946`. قواعد Mizan قواعد منفصلة ولا تدخل في هذه
> الخطوات. تحقّق من اسم المشروع وقاعدة البيانات قبل أي استرجاع أو استيراد.
> تحقّق بتاريخ 2026-10-16: PITR وحماية الحذف غير مفعّلين على قاعدة SCHEDULE.

```bash
APP_PROJECT_ID=schedule-863eb
DATA_PROJECT_ID=gen-lang-client-0379571946
DATABASE_ID=ai-studio-schedule-337bbbf5-1098-44cb-aabf-95536daf9106
BACKUP_BUCKET=schedule-863eb-firestore-backups
```

الخطوتان التاليتان تُنفَّذان مرة واحدة، وتحتاجان صلاحية المالك على المشروع.

---

## ١. الاسترجاع الزمني (PITR) — سبعة أيام إلى الوراء

يحفظ Google نسخة من كل دقيقة خلال آخر سبعة أيام، فيمكن الرجوع إلى ما قبل أي
خطأ بدقة. هذه أهم خطوة وأسرعها.

```bash
gcloud firestore databases update \
  --project="$DATA_PROJECT_ID" --database="$DATABASE_ID" --enable-pitr
```

للاسترجاع لاحقاً إلى لحظة محددة (يُنشئ قاعدة جديدة ولا يلمس الحالية):

```bash
gcloud firestore databases restore \
  --project="$DATA_PROJECT_ID" \
  --source-database="$DATABASE_ID" \
  --destination-database='schedule-recovered' \
  --snapshot-time='2026-08-14T09:00:00Z'
```

## ٢. تصدير يومي إلى Cloud Storage — أرشيف طويل الأمد

PITR يغطي أسبوعاً؛ التصدير يغطي ما بعده.

```bash
# دلو منفصل لمشروع SCHEDULE، في منطقة قاعدة البيانات نفسها
gcloud storage buckets create "gs://$BACKUP_BUCKET" \
  --project="$APP_PROJECT_ID" --location=europe-west2

# يحذف النسخ الأقدم من سنة تلقائياً
# طبّق سياسة الاحتفاظ بعد ضبط صلاحية الكتابة على الدلو لحساب تصدير SCHEDULE فقط.
gcloud storage buckets update "gs://$BACKUP_BUCKET" \
  --lifecycle-file=<(echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":365}}]}')

# تصدير يدوي للتجربة
gcloud firestore export "gs://$BACKUP_BUCKET/manual/$(date +%Y-%m-%d)" \
  --project="$DATA_PROJECT_ID" --database="$DATABASE_ID"
```

جدولة يومية عبر Cloud Scheduler:

```bash
gcloud services enable cloudscheduler.googleapis.com --project="$APP_PROJECT_ID"

gcloud scheduler jobs create http schedule-firestore-daily-export \
  --project="$APP_PROJECT_ID" \
  --location=europe-west2 \
  --schedule="0 2 * * *" \
  --time-zone="Asia/Kuwait" \
  --uri="https://firestore.googleapis.com/v1/projects/$DATA_PROJECT_ID/databases/$DATABASE_ID:exportDocuments" \
  --http-method=POST \
  --oauth-service-account-email="schedule-backup@$APP_PROJECT_ID.iam.gserviceaccount.com" \
  --message-body="{\"outputUriPrefix\":\"gs://$BACKUP_BUCKET/daily\"}"
```

يحتاج `schedule-backup@$APP_PROJECT_ID.iam.gserviceaccount.com` دور
`roles/datastore.importExportAdmin` في مشروع البيانات بشرط قاعدة SCHEDULE
المحددة أعلاه، وصلاحية إنشاء كائنات على دلو النسخ فقط. ويحتاج حساب Firestore
service agent في مشروع البيانات صلاحية الكتابة على ذلك الدلو. لا تمنح أيّاً من
هذه الحسابات دوراً غير مشروط على قواعد Firestore الأخرى أو على مشروع Mizan.

## ٣. التحقق — نسخة لا تُختبر ليست نسخة

مرة كل فصل دراسي:

```bash
# استورد آخر نسخة إلى قاعدة اختبار منفصلة، لا إلى الإنتاج
gcloud firestore import "gs://$BACKUP_BUCKET/daily/<اسم-المجلد>" \
  --project="$DATA_PROJECT_ID" --database='schedule-drill'
```

ثم شغّل نسخة اختبار بصلاحية محصورة على `FIREBASE_DATABASE_ID=schedule-drill` وتأكد من ظهور الجدول وعدد
المواعيد. بعدها احذف قاعدة `drill`.

## قواعد التشغيل

- **لا تشغّل أي سكربت استيراد على قاعدة الإنتاج قبل التأكد من وجود تصدير حديث.**
  `npm run migrate:firestore:replace` مدمّر بطبيعته.
- القواعد الأمنية (`firestore.rules`) تمنع كل وصول مباشر من المتصفح؛ السيرفر
  وحده يكتب عبر Admin SDK. أي تعديل يوسّع تلك القواعد يجب أن يمر بمراجعة.
- سياسة TTL في `firestore.indexes.json` تحذف الجلسات المنتهية وحدها، فلا تحتاج
  تنظيفاً يدوياً.
