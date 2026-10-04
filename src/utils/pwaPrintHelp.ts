/** iOS Home Screen apps cannot reliably open the native print sheet. */
export function isIosStandalonePwa(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || "")
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && ((navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia?.("(display-mode: standalone)").matches === true);
}

/** Keep print layouts intact in the installed iOS app and explain the supported path. */
export function showPwaPrintHelp(): boolean {
  if (!isIosStandalonePwa()) return false;
  document.querySelector(".pwa-print-notice")?.remove();
  const notice = document.createElement("div");
  notice.className = "pwa-print-notice";
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  const title = document.createElement("strong");
  title.textContent = "للطباعة، افتح الجدول في Safari أو استخدم الكمبيوتر";
  const detail = document.createElement("span");
  detail.textContent = "سيظهر التقرير بتنسيقه الكامل هناك.";
  notice.append(title, detail);
  document.body.appendChild(notice);
  window.setTimeout(() => notice.remove(), 5000);
  return true;
}
