السبب الجذري المختصر:
كانت وظائف الاستيراد والتقرير والنشر موزعة بين أكثر من شاشة ومسار بيانات، وبعض حقول PDF كانت تعتمد على نتيجة الاستخراج الخام بدل مطابقتها مع بيانات النظام الحالية. كذلك كان مسار OCR يُستخدم حتى عندما يحتوي PDF على طبقة نصية قابلة للاستخراج مباشرة، وهذا يسبب بطئاً كبيراً وأخطاء أكثر. وتم أيضاً إصلاح نوع مصفوفة المنتدبين في server.ts حتى لا تتحول إلى unknown[].

الملفات المعدلة فقط:
server.ts
src/components/ImportPreviewTable.tsx
src/components/IntelligenceWorkspace.tsx
src/components/QuickCreatePopover.tsx
src/components/Reports.tsx
src/components/ScheduleTransfer.tsx
src/components/Schedules.tsx
src/components/Sections.tsx
src/components/schedulePresence.ts
src/db/demoSandbox.ts
src/db/repository.ts
src/styles/05-schedule.css
src/styles/06-intelligence.css
src/styles/08-print.css
src/styles/09-details.css
src/types.ts
src/utils/documentOcr.ts
