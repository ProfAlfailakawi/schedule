import React, { useEffect, useRef, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { safeStorage } from "../utils/safeStorage";

/**
 * Install as an app — an icon, and the steps only when asked for.
 *
 * A coordinator opens the dashboard dozens of times a week and does not need a
 * paragraph about installing every time. So this is an icon first: one quiet
 * download button in the identity bar. Pressing it opens a small, elegant
 * popover with three short steps — or, on Android where the browser offers a
 * real install prompt, a single button that does it. The first visit opens the
 * popover once so the option is discovered; after that it stays folded to the
 * icon. When the app is already installed there is nothing to show.
 */
const SEEN_KEY = "schedule-install-seen";

export default function InstallApp() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(() => !safeStorage.get(SEEN_KEY));
  const ref = useRef<HTMLDivElement>(null);
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);

  useEffect(() => {
    const onPrompt = (e: any) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // A press anywhere outside the popover closes it, and Escape does too.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  if (isStandalone || installed) return null;

  const remember = () => safeStorage.set(SEEN_KEY, "1");
  const close = () => { remember(); setOpen(false); };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setInstalled(true);
    setDeferred(null);
    remember();
  };

  return (
    <div className="install" ref={ref}>
      <button
        type="button"
        className={`install-trigger ${open ? "active" : ""}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label="تثبيت التطبيق على الجهاز"
        title="تثبيت التطبيق"
      >
        <Download aria-hidden="true" />
      </button>
      {open ? (
        <div className="install-pop" role="dialog" aria-label="تثبيت التطبيق">
          <header>
            <strong>ثبّت التطبيق</strong>
            <button type="button" onClick={close} aria-label="إغلاق"><X aria-hidden="true" /></button>
          </header>
          {deferred ? (
            <>
              <p>أيقونة على شاشتك، وفتح أسرع.</p>
              <button type="button" className="install-go" onClick={install}>
                <Download aria-hidden="true" /> ثبّت الآن
              </button>
            </>
          ) : (
            <ol className="install-steps">
              {isIos ? (
                <>
                  <li>زر المشاركة <Share aria-hidden="true" /></li>
                  <li>«إضافة إلى الشاشة الرئيسية»</li>
                  <li>«إضافة»</li>
                </>
              ) : (
                <>
                  <li>قائمة المتصفح ⋮</li>
                  <li>«تثبيت التطبيق»</li>
                  <li>أكّد</li>
                </>
              )}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
