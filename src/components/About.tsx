import React from "react";

// The install invitation moved to the dashboard, where a first-time visitor
// actually lands — see components/InstallApp.tsx. It no longer sits on the
// About page.

/** صفحة تعريفية بالبرنامج: ما يفعله، بلا بطاقات أشخاص. */
export default function About() {
  return (
    <div className="about-editorial visual-minimal">
      <header className="about-editorial-hero">
        <span>SCHEDULE · نظام القرار الأكاديمي</span>
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
      <section className="about-editorial-note">
        <p>
          يبني البرنامج الجدول ويقرأ التعارض قبل وقوعه، ثم يقترح أقصر سلسلة
          نقلات تحلّه — ولا يكتب شيئاً حتى تُعتمد. ما تراه هنا حصيلة تشغيل
          فعلي عبر فصول متتابعة، لا واجهة عرض.
        </p>
      </section>
      <footer className="about-editorial-footer">
        <span>نظام القرار الأكاديمي</span>
        <small>ابنِ الجدول. راجِعه. اتخذ القرار.</small>
      </footer>
    </div>
  );
}
