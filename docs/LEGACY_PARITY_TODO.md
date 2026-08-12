# Legacy Parity TODO

تم حسم الوظائف الجوهرية من النسخة الاحتياطية الحقيقية + `schedule.dll` + Views/RDLC القديمة: Schema الفعال، IDs، الصلاحيات، نطاقات المستخدم، Civil ID، CRUD، FSchedule، CopySchedule، Search/Report filters، Dashboard quirks، `fdetail`، والعلاقات Course → Section → College.

ما بقي قبل **استبدال موقع 2015 إنتاجياً** ليس إعادة تصميم أو اختراع وظائف، بل تحقق بيئي نهائي:

1. تشغيل `npm install && npm run lint && npm test && npm run build` في بيئة Google/Node التي تملك npm registry كاملاً. بيئة الفحص التي أنشأت هذا patch لم تستطع تنزيل كل dependencies من registry، لذلك لا يُدّعى Build إنتاجي كامل من داخلها.
2. ربط مشروع Firestore الفعلي ثم تنفيذ الاستيراد والتحقق. لا توجد في بيئة الفحص الحالية Firebase credentials أو Connector إلى مشروع المالك، ولذلك لم تتم كتابة بيانات حقيقية في Cloud نيابة عنه.
3. بعد Cloud import، الاحتفاظ بنتيجة Counts/SHA verification وإجراء Smoke Test بالحسابات والصلاحيات والجدول والنسخ والبحث.
4. مقارنة إخراج الطباعة النهائي لكل تقرير مع ملفات RDLC القديمة بنفس الفلاتر والبيانات. منطق البيانات والأزرار نُقل، لكن Pixel/Layout report comparison يحتاج تشغيل النسختين في بيئة Browser/Hosting فعلية.

لا توجد TODO وظيفية معروفة حالياً تبرر تغيير Workflow القديم أو إضافة Feature جديدة.
