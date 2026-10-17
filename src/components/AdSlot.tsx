import React, { useEffect } from "react";

/**
 * موقعُ إعلانٍ داخل تطبيق الكادر. السكربتُ نفسه الذي تحمله الصفحات العامة (server/adClientScript)
 * يملأ العنصر #adx، ويحتسب الظهور بعد ثانيةٍ من الرؤية الفعلية. العنصر يبقى مخفياً حتى يصله إعلان،
 * فلا يتغير شكل اللوحة حين لا توجد حملة.
 */
export default function AdSlot({ slot }: { slot: string }) {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/_ads/ad.js?v=1";
    script.async = true;
    script.setAttribute("data-slot", slot);
    document.body.appendChild(script);
    return () => { script.remove(); };
  }, [slot]);
  return <aside id="adx" className="adx" aria-label="إعلان" dir="rtl" />;
}

/** نبضُ الزيارة المجهول لتطبيق الكادر: مرةً في اليوم لكل متصفح، بلا هوية. يُستدعى بعد الدخول. */
export function usePulse(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const script = document.createElement("script");
    script.src = "/_ads/ad.js?v=1";
    script.async = true;
    script.setAttribute("data-pulse", "app");
    document.body.appendChild(script);
    return () => { script.remove(); };
  }, [enabled]);
}
