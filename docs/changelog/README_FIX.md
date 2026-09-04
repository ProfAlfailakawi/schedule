السبب الجذري
تمت إضافة استخدام xraySectionRef عند فتح «أشعة الجدول» من القائمة، لكن تعريف الـ ref نفسه لم يُدرج في النسخة المرسلة، لذلك فشل TypeScript في السطرين المشار إليهما.

الإصلاح
- أضفت: const xraySectionRef = useRef<HTMLElement | null>(null);
- لم أغيّر أي سلوك آخر.
- تم فحص Syntax/Transpile للملف بعد الإصلاح ونجح.

الملف المعدل فقط
- src/components/Schedules.tsx
