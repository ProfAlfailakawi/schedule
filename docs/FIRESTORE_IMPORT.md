# Firestore import — complete SCHEDULE legacy data

`database/db.json` هو Snapshot حقيقي مستخرج من Backup SQL Server المقدم، ويحتوي بيانات خاصة/PII. أبقه وملف الـZIP في نطاق خاص.

## اختبار فوري قبل Firestore

```env
DATA_MODE=demo
```

يستخدم التطبيق Snapshot الكامل مباشرة.

```text
admin / a7424400
```

## مشروع Firestore فارغ

```env
DATA_MODE=firestore
FIREBASE_PROJECT_ID=your-project-id
AUTO_IMPORT_LEGACY_DATA=true
```

عند كون `users` فارغة، الخادم:

1. يستورد users/forms/permissions/scopes/terms/colleges/sections/instructors/courses/schedules/rooms بالـLegacy IDs المستقرة.
2. يستورد الـ28 historical/raw datasets تحت `legacyArchive`.
3. يهيئ counters من أعلى IDs القديمة.
4. يتحقق من Counts.
5. يكتب `_meta/legacyImport`.
6. بعدها فقط يبدأ قبول Login.

## استبدال قاعدة اختبار موجودة

```bash
npm run migrate:firestore:replace
```

هذا الأمر يحذف Collections المستهدفة ثم يعيد الاستيراد، ويقرأ الوجهة مرة أخرى للتحقق من Count + canonical SHA-256 ويولد ملف verification محلياً. استخدمه فقط على مشروع اختبار تريد استبداله قصداً.

## Password compatibility vault

Authentication لا يحتاج كلمة سر Plain Text؛ hashes المهاجرة تعمل مباشرة. لكن شاشة `SystemUser` القديمة تعرض كلمة السر وتسمح بتعديلها. لذلك Snapshot يحتوي `SystemUserPassVault` مشفراً AES-256-GCM.

للاختبار الخاص يمكن استخدام الملف المرفق:

```text
database/legacy-password-vault.key
```

للإنتاج الأفضل ضبط:

```env
PASSWORD_VAULT_KEY=<same 32-byte key as hex/base64>
```

ثم حفظ السر خارج Source Tree. لا تغيّر المفتاح عشوائياً من دون إعادة تشفير القيم الحالية، وإلا لن تستطيع شاشة الإدارة فك قيم Legacy القديمة.

## Firebase credentials

لا تضع service-account JSON داخل المشروع. في Google Cloud استخدم Application Default Credentials، أو `GOOGLE_APPLICATION_CREDENTIALS` إلى ملف خاص خارج Source Tree.
