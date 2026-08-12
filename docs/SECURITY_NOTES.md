# Security Notes

- قاعدة الإنتاج النهائية هي Firestore عبر Express backend موثوق؛ `firestore.rules` تمنع القراءة والكتابة المباشرة من Browser (`allow read, write: if false`).
- تهيئة Firestore تُنتظر قبل تشغيل الخادم. عند قاعدة اختبار فارغة يمكن استيراد Snapshot القديم ثم التحقق من Counts قبل قبول أول Login.
- Session cookies هي HttpOnly وSameSite، وتصبح Secure في الإنتاج.
- الطلبات التي تغيّر الحالة تخضع لفحوص Origin/Fetch Metadata بالإضافة إلى حماية الكوكي.
- تسجيل الدخول Rate-limited.
- Authorization مفروض على الخادم. إخفاء Icon من الواجهة ليس صلاحية بحد ذاته.
- `IsAdminUser` يحافظ على سلوك Legacy الخاص بنطاق البيانات، لكنه لا يمنح FormSecurity screen permissions تلقائياً.
- المستخدم العادي مقيد بنطاقات `AdCollegeUserAssign` حيث يطبقها النظام القديم.
- كلمات السر الأصلية لا تُخزن Plain Text في `database/db.json`. Authentication يستخدم salted scrypt hashes.
- لأن شاشة `SystemUser` القديمة نفسها تعرض كلمة السر وتعيدها في Edit، تمت المحافظة على هذا الـWorkflow من دون الرجوع لتخزين Plain Text: قيمة العرض/التعديل محفوظة AES-256-GCM في `SystemUserPassVault` ومفتاح منفصل. Endpoint الذي يفكها محمي بصلاحية FormName 11، بينما Login/session endpoints يحذفان hash والـvault من الاستجابة.
- في حزمة الاختبار الخاصة يوجد مفتاح `database/legacy-password-vault.key` حتى تعمل شاشة SystemUser القديمة فوراً. في الإنتاج انقل نفس المفتاح إلى Secret manager/`PASSWORD_VAULT_KEY` واحذف الملف من مساحة الكود بعد التأكد من إعداد السر.
- IDs الجديدة في Firestore تُحجز عبر transaction-backed counters لتجنب التصادم.
- Snapshot الحالي يحتوي PII حقيقية بناءً على طلب مالك النظام. لذلك `database/db.json` ومفتاح الخزنة موجودان في `.gitignore` ولا يجوز نشرهما في Repository عام أو AI Studio asset عام.
- لا يوجد service-account JSON أو SQL connection string أو `.bak` أو MDF/LDF داخل patch.
