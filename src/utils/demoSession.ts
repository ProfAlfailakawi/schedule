/**
 * البيئة التجريبية، كما يعرفها العميل: يضبطها App في الرسم نفسه حين تصله حمولةُ
 * الجلسة بقسم `demo`، فتقرؤها الشاشاتُ في أوّل رسمٍ لها بلا تمرير خاصيّةٍ لكل شاشة.
 *
 * قسمُ الحاسب هو مسرحُ البيانات في التجربة (الاعتماد، حالات الطلبة، مركز الذكاء)،
 * وعليه تفتح الشاشاتُ التي لا تعمل إلا على قسمٍ واحد بدل «اختر القسم».
 */
export const DEMO_STAGE_SECTION_ID = 1;

let active = false;
export function setDemoSession(value: boolean): void { active = Boolean(value); }
export function isDemoSession(): boolean { return active; }
