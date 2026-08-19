import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Command,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  FlaskConical,
} from "lucide-react";
import { Field, Notice, PrimaryButton } from "./ui";
import InstallApp from "./InstallApp";
import ScheduleJourney from "./ScheduleJourney";
import ScheduleSignature, { SCHEDULE_DEFINITION } from "./ScheduleSignature";
interface LoginProps {
  onLoginSuccess: (data: {
    user: any;
    permissions: number[];
    scopes: any[];
  }) => void;
}
export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null),
    [identityOpen, setIdentityOpen] = useState(false),
    [demoLoading, setDemoLoading] = useState(false),
    [demoEnabled, setDemoEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/demo/config", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => {
      if (!alive) return;
      setDemoEnabled(Boolean(data?.enabled));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const enterDemo = async () => {
    setError(null);
    if (!demoEnabled) return;
    setDemoLoading(true);
    try {
      const res = await fetch("/api/auth/demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر بدء البيئة التجريبية");
      onLoginSuccess(data);
    } catch (err: any) { setError(err.message || "تعذر بدء البيئة التجريبية"); }
    finally { setDemoLoading(false); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("الرجاء إدخال اسم المستخدم وكلمة السر");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), password }),
        }),
        data = await res.json();
      // A reference the reader can quote; the reason itself stays in the log.
      if (!res.ok) throw new Error(data.ref ? `${data.error} (مرجع: ${data.ref})` : (data.error || "خطأ في تسجيل الدخول"));
      onLoginSuccess(data);
    } catch (err: any) {
      setError(err.message || "خطأ في تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="apex-login visual-minimal" dir="rtl">
      <div className="apex-login-ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <header className="apex-login-brand apex-login-brand--mark-only" aria-hidden="true">
        <span className="apex-login-mark">
          <CalendarDays />
        </span>
      </header>
      <section className="apex-login-stage">
        <div className="apex-login-story">
          <span className="apex-login-kicker">
            <i /> مساحة تشغيل الجدول الأكاديمي
          </span>
          <h1>
            الجدول
            <br />
            <em>يبدأ من قرار.</em>
          </h1>
          <p>{SCHEDULE_DEFINITION}</p>
          <div className="apex-login-principles" aria-hidden="true">
            <span>
              <ShieldCheck />
              <b>صلاحيات دقيقة</b>
              <small>كل مستخدم يرى ما يحتاجه فقط</small>
            </span>
            <span>
              <Sparkles />
              <b>ذكاء في السياق</b>
              <small>القرار يظهر حيث تعمل</small>
            </span>
            <span>
              <Command />
              <b>وصول مباشر</b>
              <small>كل المساحة تحت أمرك</small>
            </span>
          </div>
        </div>
        <div className="apex-login-access">
          <div className="apex-access-head">
            <span>دخول آمن</span>
            <div className="apex-access-title-row">
              <strong>أهلاً بعودتك</strong>
              <button
                type="button"
                className="apex-login-identity-trigger apex-login-identity-trigger--pulse"
                onClick={() => setIdentityOpen(true)}
                aria-label="افتح رحلة SCHEDULE"
                title="رحلة SCHEDULE"
                data-guide-ignore="زر تعريفي قبل تسجيل الدخول يفتح رحلة SCHEDULE فقط ولا ينفذ إجراءً داخل النظام"
              >
                <span className="apex-login-pulse-rings" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <ScheduleSignature size="micro" markOnly />
              </button>
            </div>
            <p>أكمل من حيث توقفت</p>
          </div>
          {error ? (
            <div className="login-error">
              <Notice inline>{error}</Notice>
            </div>
          ) : null}
          <form className="apex-login-form" onSubmit={submit}>
            <Field label="اسم المستخدم" required>
              <input
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                required
              />
            </Field>
            <Field label="كلمة السر" required>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </Field>
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? (
                <span className="button-spinner" />
              ) : (
                <>
                  <LockKeyhole /> دخول إلى البرنامج <ArrowLeft />
                </>
              )}
            </PrimaryButton>
          </form>
          <footer className="login-footer">
            <span className="login-footer-label">الجدول الأكاديمي</span>
            <div className="login-footer-tools">
              {demoEnabled ? (
                <button type="button" className="demo-entry-icon" onClick={enterDemo} disabled={loading || demoLoading} aria-label="تجربة النظام" title="تجربة النظام" data-guide-ignore="دخول اختياري إلى بيئة Demo معزولة">
                  {demoLoading ? <span className="button-spinner" /> : <FlaskConical aria-hidden="true" />}
                </button>
              ) : null}
              <InstallApp variant="login" />
            </div>
            <small className="login-footer-year">{new Date().getFullYear()}</small>
          </footer>
        </div>
      </section>
      {identityOpen ? <ScheduleJourney onClose={() => setIdentityOpen(false)} /> : null}
    </main>
  );
}
