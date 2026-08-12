import React, { useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Command,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Field, Notice, PrimaryButton } from "./ui";
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
    [error, setError] = useState<string | null>(null);
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
      if (!res.ok) throw new Error(data.error || "خطأ في تسجيل الدخول");
      onLoginSuccess(data);
    } catch (err: any) {
      setError(err.message || "خطأ في تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="apex-login" dir="rtl">
      <div className="apex-login-ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <header className="apex-login-brand">
        <span className="apex-login-mark">
          <CalendarDays />
        </span>
        <div>
          <strong>SCHEDULE</strong>
          <small>التحكم الأكاديمي</small>
        </div>
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
          <p>
            مساحة هادئة لبناء الجدول الدراسي، فهم أثر كل حركة، والوصول إلى
            القرار الصحيح بدون ضوضاء.
          </p>
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
            <strong>أهلاً بعودتك</strong>
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
          <footer>
            <span>Schedule</span>
            <small>{new Date().getFullYear()}</small>
          </footer>
        </div>
      </section>
    </main>
  );
}
