/**
 * ── شارة «شريك SCHEDULE» ────────────────────────────────────────────────────────────
 * صورةُ SVG ثابتة تضعها الشركةُ في موقعها: اسمُها وفترةُ حملتها. بلا سكربت ولا مراجع خارجية، وكلُّ نصٍّ مُهرَّب.
 * تُخدم من رابط تقريرها (الرمز هو الهوية) فلا تُنتَج لحملةٍ لم تبدأ بعد.
 */
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const dateAr = (day: string): string => { const [y, m, d] = day.split("-").map(Number); return `${d} ${MONTHS[m - 1] || ""} ${y}`; };
const xml = (s: string): string => s.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch] as string);
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function partnerBadgeSvg(c: { company: string; startDay: string; endDay: string }): string {
  const name = xml(clip(c.company.trim(), 30)), range = xml(`\u2067${dateAr(c.startDay)} – ${dateAr(c.endDay)}\u2069`); /* عزلٌ بالاتجاه العربي: البداية يميناً والنهاية يساراً */
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="92" viewBox="0 0 320 92" role="img" aria-label="${name} · شريك SCHEDULE">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f6b5a"/><stop offset="1" stop-color="#14473c"/></linearGradient></defs>
<rect width="320" height="92" rx="16" fill="url(#g)"/>
<rect x="14" y="14" width="42" height="42" rx="11" fill="#0d211c"/>
<rect x="23" y="34" width="5" height="14" rx="2.5" fill="#6fd1b0"/><rect x="31" y="24" width="5" height="24" rx="2.5" fill="#e0b25a"/><rect x="39" y="30" width="5" height="18" rx="2.5" fill="#6fd1b0"/>
<g font-family="'Noto Sans Arabic','Segoe UI',Tahoma,system-ui,sans-serif" fill="#ffffff" text-anchor="end">
<text x="306" y="32" font-size="19" font-weight="700">${name}</text>
<text x="306" y="54" font-size="13" fill="#bfe9db">شريك SCHEDULE</text>
<text x="306" y="76" font-size="11" fill="#9fd4c3">${range}</text></g>
</svg>
`;
}
