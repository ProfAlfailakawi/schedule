import React, { useEffect, useRef, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { safeStorage } from "../utils/safeStorage";

const SEEN_KEY = "schedule-install-seen";
type InstallVariant = "dashboard" | "login";

let pendingInstallPrompt: any = null;
let appInstalled = false;
const promptListeners = new Set<(prompt: any) => void>();
const installedListeners = new Set<() => void>();

/**
 * Keep the browser's install event outside the component.
 *
 * Login and dashboard are different React screens. If the event belonged to
 * whichever component happened to be mounted first, logging in would discard
 * the only native install prompt and the dashboard icon would stop working.
 */
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event: any) => {
    event.preventDefault();
    pendingInstallPrompt = event;
    promptListeners.forEach(listener => listener(event));
  });
  window.addEventListener("appinstalled", () => {
    appInstalled = true;
    pendingInstallPrompt = null;
    installedListeners.forEach(listener => listener());
    promptListeners.forEach(listener => listener(null));
  });
}

export default function InstallApp({ variant = "dashboard" }: { variant?: InstallVariant }) {
  const [deferred, setDeferred] = useState<any>(pendingInstallPrompt);
  const [installed, setInstalled] = useState(appInstalled);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => Boolean(safeStorage.get(SEEN_KEY)));
  const ref = useRef<HTMLDivElement>(null);
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);

  useEffect(() => {
    const onPrompt = (prompt: any) => setDeferred(prompt);
    const onInstalled = () => setInstalled(true);
    promptListeners.add(onPrompt);
    installedListeners.add(onInstalled);
    return () => {
      promptListeners.delete(onPrompt);
      installedListeners.delete(onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (isStandalone || installed) return null;

  const discover = () => {
    if (!seen) {
      safeStorage.set(SEEN_KEY, "1");
      setSeen(true);
    }
    setOpen(value => !value);
  };

  const install = async () => {
    const prompt = deferred || pendingInstallPrompt;
    if (!prompt) return;
    prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    pendingInstallPrompt = null;
    setDeferred(null);
    if (choice?.outcome === "accepted") setInstalled(true);
  };

  return (
    <div className={`install visual-minimal install-${variant}`} ref={ref}>
      <button
        type="button"
        className={`install-trigger ${open ? "active" : ""} ${!seen ? "discoverable" : ""}`}
        onClick={discover}
        aria-expanded={open}
        aria-label="تثبيت التطبيق على الجهاز"
        title="تثبيت التطبيق"
      >
        <Download aria-hidden="true" />
        {variant === "login" ? <span>تثبيت التطبيق</span> : null}
      </button>

      {open ? (
        <div className="install-pop" role="dialog" aria-label="تثبيت التطبيق">
          <header>
            <strong>ثبّت SCHEDULE</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق"><X aria-hidden="true" /></button>
          </header>
          {deferred ? (
            <>
              <p>التثبيت يعني إضافة SCHEDULE إلى جهازك ليعمل كتطبيق مستقل وتفتحه مباشرة بسهولة.</p>
              <button type="button" className="install-go" onClick={install}>
                <Download aria-hidden="true" /> ثبّت الآن
              </button>
            </>
          ) : (
            <>
              <p>أضف SCHEDULE إلى جهازك ليظهر كتطبيق مستقل وسهل الوصول.</p>
              <ol className="install-steps">
                {isIos ? (
                  <>
                    <li>زر المشاركة <Share aria-hidden="true" /></li>
                    <li>«إضافة إلى الشاشة الرئيسية»</li>
                    <li>«إضافة»</li>
                  </>
                ) : (
                  <>
                    <li>قائمة المتصفح</li>
                    <li>«تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»</li>
                    <li>أكّد</li>
                  </>
                )}
              </ol>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
