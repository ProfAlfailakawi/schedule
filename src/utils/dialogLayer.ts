/**
 * ── النافذةُ المفتوحة فوق الصفحة ────────────────────────────────────────────
 *
 * كلُّ حوارٍ في البرنامج (role="dialog" أو "alertdialog") يُعلن aria-modal:
 * "true" إن ملك الشاشة، و"false" إن كان نافذةً صغيرةً بجوار ما فتحها. وهو في
 * الحالين نافذةٌ فوق الصفحة، والجرسُ من أثاث الصفحة — فيتنحّى لها
 * (03-shell.css، «الجرسُ يتنحّى، ولا يغطّي»).
 *
 * المُحدِّد مكتوبٌ هنا مرّةً واحدة. قاعدةُ :has() في 03-shell.css تطابقه حرفاً
 * بحرف، والبديلُ أدناه يقرؤه، واختبارُ tests/notify-bell-yield-audit.ts يمسك
 * الاثنين معاً ويمسك كلَّ حوارٍ نسي أن يُعلن.
 *
 * `:not([hidden])`: درجُ المرشد يبقى في الصفحة مخفيّاً بالسمة hidden وهو يعمل على
 * الشاشة؛ الحوارُ المخفيّ ليس نافذةً مفتوحة.
 */
export const OPEN_DIALOG = "[aria-modal]:not([hidden])";

/** العلامةُ التي يكتبها البديلُ على <html>: `html[data-dialog-open]`. */
export const DIALOG_OPEN_FLAG = "dialogOpen";

/**
 * البديلُ للمحرّكات التي لا تعرف :has().
 *
 * أهدافُ Vite الافتراضية (Safari 14 وChrome 87 وFirefox 78) لا تعرفه، والمحرّكُ
 * الذي لا يعرفه يُسقط القاعدةَ كلَّها — فيبقى الجرسُ فوق ✕ كل حوار كما كان. هناك
 * وحدها تُراقَب الصفحة: كلُّ حوارٍ يظهر أو يغيب أو يتغيّر إعلانُه يكتب العلامةَ على
 * <html> أو يمحوها. وحيث يعرف المحرّكُ :has() لا يعمل هنا شيء: CSS وحدها تكفي، بلا
 * مراقبٍ يقرأ الصفحة مع كل تغييرٍ فيها.
 *
 * يعيد دالّةَ التنظيف، فيُستعمل مباشرةً داخل useEffect.
 */
export function followOpenDialogs(): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {};
  try {
    if (typeof CSS !== "undefined" && CSS.supports("selector(:has(*))")) return () => {};
  } catch { /* CSS.supports بلا selector(): محرّكٌ قديم، فالبديلُ لازم */ }
  const root = document.documentElement;
  const sync = () => {
    if (document.querySelector(OPEN_DIALOG)) root.dataset[DIALOG_OPEN_FLAG] = "true";
    else delete root.dataset[DIALOG_OPEN_FLAG];
  };
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "hidden"] });
  sync();
  return () => {
    observer.disconnect();
    delete root.dataset[DIALOG_OPEN_FLAG];
  };
}
