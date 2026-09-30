/**
 * ── النصّ العربي كما يُحفظ، وكما يُقارن ─────────────────────────────────────
 *
 * اسمٌ منسوخٌ من PDF يصل غالباً بـ«أشكال العرض» (U+FB50–FDFF و U+FE70–FEFF):
 * «ﺍﻟﺘﺼﻮﻳﺮ» تبدو «التصوير» وليست هي — فلا يجدها البحث ولا يطابقها الفرز ولا
 * يتعرّف عليها الاستيراد. وNFKC يعيدها حروفاً عادية دون أن يمسّ غيرها من
 * العربي. هذه الوحدة هي المكان الوحيد لهذه القاعدة.
 */
const PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻿]/;

export function hasArabicPresentationForms(value: unknown): boolean {
  return PRESENTATION_FORMS.test(String(value ?? ""));
}

/** ما يُحفظ: NFKC، ومسافاتٌ مطويّة، بلا حوافّ. */
export function normalizeArabicText(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/[​-‏‪-‮⁦-⁩﻿]/g, "").replace(/\s+/g, " ").trim();
}

/** ما يُقارن: فوق ما يُحفظ، تُوحَّد الهمزات والتاء المربوطة والياء، ويُسقط التشكيل والتطويل. */
export function arabicMatchKey(value: unknown): string {
  return normalizeArabicText(value)
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();
}
