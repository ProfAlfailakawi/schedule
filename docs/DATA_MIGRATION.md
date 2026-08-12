# SQL Server backup → Firestore migration

تم استخراج Backup Plesk SQL Server المقدم مباشرة إلى `database/db.json` بواسطة:

```text
scripts/extract-legacy-bak.py
```

السكريبت يقرأ Microsoft Tape Format، يعيد تركيب كتالوج/صفحات SQL Server، يطابق Counts مع `sysrowsets`، يحول الجداول الفعالة إلى نماذج SCHEDULE، ويحفظ الجداول التاريخية تحت `legacyArchive`.

كلمات السر تعامل بطبقتين:

- `SystemUserPass`: salted scrypt hash لتسجيل الدخول.
- `SystemUserPassVault`: AES-256-GCM encrypted compatibility value لأن شاشة SystemUser القديمة تعرض القيمة وتعيدها في Edit.

مفتاح الخزنة يكتب بشكل منفصل في `database/legacy-password-vault.key` أو يؤخذ من `PASSWORD_VAULT_KEY`.

السكريبت يحتاج Python package `cryptography` بالإضافة إلى مكتبات Python القياسية المستخدمة فيه.

مصدر البيانات:

```text
Backup SHA-256: e363f6930a820619616829a3005dc923371f149c27ce4e22e281284e33d62120
```

دليل الاستخراج التفصيلي في:

```text
docs/LEGACY_DATA_EXTRACTION_REPORT.json
```

لـBackup جديد:

```bash
python3 scripts/extract-legacy-bak.py /path/to/backup.zip \
  --output database/db.json \
  --report docs/LEGACY_DATA_EXTRACTION_REPORT.json
```

إذا توفر SQL Server، يبقى `scripts/export-legacy-sql.ps1` كمسار قراءة بديل.

الخطوة السحابية الأخيرة هي JSON → Firestore عبر `scripts/import-legacy-json.ts`. استخدم `--replace` فقط على قاعدة اختبار يمكن حذفها قصداً. المستورد يتحقق من Counts وcanonical SHA-256 بعد الكتابة.
