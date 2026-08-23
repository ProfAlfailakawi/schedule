السبب الجذري المختصر:
كانت عدة شاشات تعتمد على بيانات الفصل الحالي أو حالة الواجهة بدل ذاكرة القسم الدائمة، وبعض الوظائف لم تكن تفصل بين «دليل القسم» و«عضوية الفصل». كذلك كانت الطباعة/الرفع/الحضور تستخدم سلوكاً عاماً لا يطابق الحالات المطلوبة.

الملفات المعدلة فقط:
server.ts
src/components/IntelligenceWorkspace.tsx
src/components/QuickCreatePopover.tsx
src/components/ScheduleTransfer.tsx
src/components/Schedules.tsx
src/components/Sections.tsx
src/components/schedulePresence.ts
src/db/demoSandbox.ts
src/db/repository.ts
src/styles/05-schedule.css
src/styles/08-print.css
src/styles/09-details.css
src/types.ts

ملاحظة التحقق:
تمت مراجعة الفروقات مقابل النسخة الأصلية وحصر ZIP بهذه الملفات فقط. فحص TypeScript الكامل لم يكتمل لأن node_modules في بيئة العمل ناقصة type definitions؛ لذلك لا أدعي نجاح build كامل في هذه البيئة.
