import React, { useEffect, useState } from "react";
import { AtSign, CheckCircle2, Download, Globe2, GraduationCap, Mail, Phone, Share } from "lucide-react";

/**
 * Idea 4 — install as an app.
 *
 * On Android/Chrome the browser fires `beforeinstallprompt`, which we hold and
 * replay behind one clean button. iOS Safari never fires it, so there the same
 * button reveals the two-step "add to home screen" path. If the app is already
 * running installed, it just says so. No clutter, one small affordance.
 */
function InstallApp() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
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

  if (isStandalone || installed) {
    return (
      <div className="install-card is-installed">
        <span className="install-icon"><CheckCircle2 /></span>
        <div className="install-copy">
          <strong>التطبيق مثبّت على جهازك</strong>
          <p>افتحه من أيقونته على الشاشة الرئيسية مباشرة.</p>
        </div>
      </div>
    );
  }

  const onInstall = async () => {
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") setInstalled(true);
      setDeferred(null);
    } else {
      setShowSteps((v) => !v);
    }
  };

  return (
    <div className="install-card">
      <span className="install-icon"><Download /></span>
      <div className="install-copy">
        <strong>ثبّت التطبيق على جهازك</strong>
        <p>أيقونة على الشاشة الرئيسية، بملء الشاشة وأسرع فتحاً — كأي تطبيق.</p>
        <button type="button" className="install-btn" onClick={onInstall}>
          <Download /> {deferred ? "ثبّت الآن" : "طريقة التثبيت"}
        </button>
        {(showSteps || (!deferred && isIos)) ? (
          <ol className="install-steps">
            {isIos ? (
              <>
                <li>اضغط زر المشاركة <Share aria-hidden="true" /> في شريط Safari.</li>
                <li>اختر «إضافة إلى الشاشة الرئيسية».</li>
                <li>اضغط «إضافة» — تظهر أيقونة الجدول.</li>
              </>
            ) : (
              <>
                <li>افتح قائمة المتصفح (⋮).</li>
                <li>اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</li>
                <li>أكّد — تظهر أيقونة الجدول على جهازك.</li>
              </>
            )}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

const Person = ({
  name,
  phone,
  email,
  image,
  twitter,
  website,
}: {
  name: string;
  phone: string;
  email: string;
  image: string;
  twitter: string;
  website?: string;
}) => (
  <article className="editorial-person">
    <div className="editorial-photo">
      <img src={image} alt="" />
    </div>
    <div className="editorial-person-copy">
      <span className="editorial-role">
        <GraduationCap /> أستاذ تكنولوجيا التعليم
      </span>
      <h2>{name}</h2>
      <p>قسم تكنولوجيا التعليم، كلية التربية الأساسية</p>
      <div className="editorial-contact">
        <a href={`tel:${phone.replace(/\s/g, "")}`}>
          <Phone />
          <span dir="ltr">{phone}</span>
        </a>
        <a href={`mailto:${email}`}>
          <Mail />
          <span>{email}</span>
        </a>
      </div>
      <div className="editorial-social">
        <a href={twitter} target="_blank" rel="noreferrer">
          <AtSign /> X / Twitter
        </a>
        {website ? (
          <a href={website} target="_blank" rel="noreferrer">
            <Globe2 /> الموقع الشخصي
          </a>
        ) : null}
      </div>
    </div>
  </article>
);

export default function About() {
  return (
    <div className="about-editorial">
      <header className="about-editorial-hero">
        <span>SCHEDULE · التحكم الأكاديمي</span>
        <h1>
          الجدول الدراسي،
          <br />
          كمنتج يُفهم من أول نظرة.
        </h1>
        <p>
          منظومة صُممت لمسؤولي إعداد الجداول الدراسية: بناء الجدول، مراجعته،
          البحث فيه وإخراج تقاريره داخل مساحة واحدة واضحة وهادئة.
        </p>
      </header>
      <InstallApp />
      <section className="about-editorial-people">
        <Person
          name="د. أحمد حسين الفيلكاوي"
          phone="00965 97424400"
          email="Ah.Alfailakawi@paaet.edu.kw"
          image="/assets/about/A2.png"
          twitter="https://twitter.com/DrAhmadKw"
          website="http://dr-alfailakawi.com/"
        />
        <Person
          name="د. عبدالعزيز دخيل العنزي"
          phone="00965 55995095"
          email="dr.abdulazizalenizi@yahoo.com"
          image="/assets/about/A1.png"
          twitter="https://twitter.com/AbdulazizAleniz"
        />
      </section>
      <footer className="about-editorial-footer">
        <span>Schedule</span>
        <small>مساحة عمل الجدول الأكاديمي</small>
      </footer>
    </div>
  );
}
