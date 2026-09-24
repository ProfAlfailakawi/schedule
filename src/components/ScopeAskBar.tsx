/**
 * ── شريط السؤال والنطاق ─────────────────────────────────────────────────────
 *
 * مركز الاستعلام يبدأ بسطرٍ واحد: تكتب «قاعات فاضية الثلاثاء ١٠» فيجيب، وتحته
 * ثلاثة مرشّحات — الكلية والقسم والفصل — وزرٌّ واحدٌ يفتح ما زاد عليها. الشكل
 * نفسه استقرّ هناك لأنه صحيح: السؤالُ أولاً لأنه أسرع طريقٍ إلى كل ما تعبّر عنه
 * القوائم يدوياً، والقوائمُ تحته لمن يعرف نطاقه سلفاً، والباقي مطويٌّ حتى يُطلب.
 *
 * وكان يعيش في `Reports.tsx` وحده — نسخةٌ واحدةٌ مكتوبةٌ داخل شاشةٍ واحدة. فكل
 * شاشةٍ أرادت الشكل نفسه كانت أمام خيارين: أن تنسخه فيفترق النسختان عند أول
 * تعديل، أو أن تخترع شريطاً آخر فيتعلّم المستخدم شريطين لسؤالٍ واحد. هذا الملف
 * هو الخيار الثالث: الشكلُ نفسه، الأصنافُ نفسها (`query-bar`، `query-ask`،
 * `query-primary-filters`، `query-more`)، فما يتحسّن في الشكل يتحسّن في كل
 * شاشةٍ تستعمله دفعةً واحدة.
 *
 * ما لا يفعله مقصودٌ كفعله:
 *   - لا يعرف شيئاً عن الكليات ولا الأقسام ولا الفصول. الشاشةُ تمرّر خياراتها،
 *     فيصلح للوارد كما يصلح للتقارير دون أن يحمل بياناتِ أيّهما.
 *   - لا يقرأ ولا يكتب. هو حقولٌ وأحداث، والقراءةُ عند من يملكها.
 *   - لا يفسّر السؤال بنفسه. الشاشةُ التي تعرف ما تعرضه هي التي تفهم الجملة،
 *     وهذا الشريط يوصّلها إليها ويعرض جوابها سطراً واحداً تحت الحقل.
 */

import React from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Field, GhostButton } from "./ui";
import { AR, countOf } from "../utils/arabicCount";

export interface ScopeAskOption {
  value: string | number;
  label: string;
}

export interface ScopeAskSelect {
  /** مفتاحٌ ثابتٌ للحقل، يُستعمل في `onSelect` وفي مفتاح React. */
  key: string;
  label: string;
  value: string | number;
  /** النصّ المعروض حين لا شيء مختار — «اختر الكلية»، «كل الأقسام». */
  placeholder: string;
  options: ScopeAskOption[];
  disabled?: boolean;
}

export interface ScopeAskBarProps {
  /** نصُّ السؤال الحالي. الشاشة تملكه. */
  ask: string;
  onAskChange: (value: string) => void;
  /** يُستدعى عند Enter أو عند الإرسال — لا عند كل حرف. */
  onAskSubmit: (value: string) => void;
  askPlaceholder: string;
  /** ما فهمه النظام من الجملة، سطرٌ واحدٌ تحت الحقل. */
  askNote?: string | null;
  /** يُفرغ السؤال ويعيد المرشّحات إلى أصلها. */
  onClear?: () => void;

  /** المرشّحات الثلاثة الظاهرة دائماً. */
  selects: ScopeAskSelect[];
  onSelect: (key: string, value: string) => void;

  /** المرشّحات الإضافية. تُطوى حتى تُطلب، ولا يظهر الزرّ إن لم توجد. */
  more?: React.ReactNode;
  moreOpen?: boolean;
  onToggleMore?: () => void;
  /** عدد المرشّحات الإضافية النشطة، يظهر رقماً على الزرّ. */
  activeMoreCount?: number;

  /** اسمٌ يُقرأ للنطاق كله، لقارئ الشاشة. */
  label: string;
  /** صنفٌ إضافيٌّ للشريط نفسه. */
  className?: string;
  /** يُعرض بين السؤال والمرشّحات — الشرائح مثلاً. */
  children?: React.ReactNode;
  /** معرّفٌ فريدٌ يربط الحقل بملاحظته وبلوحة «المزيد». */
  idPrefix?: string;
}

/**
 * الشريط.
 *
 * `ask-scope-bar` هو الصنف الذي تتعلّق به لمسات «الواجهة الهادئة» خارج صفحة
 * التقارير: الأصناف الأصلية تصف الشكل، وهذا يصف من يرتديه، فلا تُعاد كتابة
 * ورقة الأنماط لكل شاشةٍ جديدة.
 */
export default function ScopeAskBar({
  ask, onAskChange, onAskSubmit, askPlaceholder, askNote, onClear,
  selects, onSelect, more, moreOpen, onToggleMore, activeMoreCount = 0,
  label, className = "", children, idPrefix = "scope-ask",
}: ScopeAskBarProps) {
  const noteId = `${idPrefix}-note`;
  const moreId = `${idPrefix}-more`;

  return (
    <section className={`query-bar ask-scope-bar no-print ${className}`.trim()} aria-label={label}>
      <form
        className="query-ask"
        role="search"
        onSubmit={event => { event.preventDefault(); onAskSubmit(ask); }}
      >
        <Search aria-hidden="true" />
        <input
          value={ask}
          onChange={event => onAskChange(event.target.value)}
          onKeyDown={event => {
            /* الإرسال الضمني لا يُعتمد عليه في نموذجٍ زرُّه الوحيد زرُّ مسح،
               فالمفتاح يُعالَج هنا صراحةً كما في مركز الاستعلام. */
            if (event.key !== "Enter") return;
            event.preventDefault();
            onAskSubmit(event.currentTarget.value);
          }}
          placeholder={askPlaceholder}
          aria-label={askPlaceholder}
          aria-describedby={askNote ? noteId : undefined}
          enterKeyHint="search"
          type="search"
        />
        {ask ? (
          <button
            type="button"
            onClick={() => { onAskChange(""); onClear?.(); }}
            aria-label="مسح السؤال"
            title="مسح"
            data-guide-ignore="مسح السؤال — عرضٌ لا فعل"
          >
            <X />
          </button>
        ) : null}
      </form>
      {askNote ? <p className="query-ask-note" id={noteId} role="status">{askNote}</p> : null}

      {children}

      <div className="query-scope query-primary-filters" data-count={selects.length} aria-label="المرشحات الأساسية">
        {selects.map(select => (
          /* المفتاح على الغلاف لا على `Field`: نوعُ خصائصه لا يُعلن `key`،
             وإضافتُها إليه تُغري بتمريرها إلى الأمام كخاصيةٍ عادية — وهي ليست
             كذلك عند React. الغلافُ يُبقي الحدّ حيث هو. */
          <React.Fragment key={select.key}>
            <Field label={select.label}>
              <select
                value={select.value || ""}
                disabled={select.disabled}
                onChange={event => onSelect(select.key, event.target.value)}
              >
                <option value="">{select.placeholder}</option>
                {select.options.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
          </React.Fragment>
        ))}
        {more ? (
          <GhostButton
            type="button"
            onClick={onToggleMore}
            aria-expanded={Boolean(moreOpen)}
            aria-controls={moreId}
            aria-label={`مرشحات إضافية${activeMoreCount ? `، ${countOf(activeMoreCount, AR.filter)} نشط` : ""}`}
            title="مرشحات إضافية"
            data-guide-ignore="فتح المرشحات الإضافية — عرضٌ لا فعل"
          >
            <SlidersHorizontal aria-hidden="true" />
            المزيد
            {activeMoreCount ? <b className="tool-count">{activeMoreCount}</b> : null}
          </GhostButton>
        ) : null}
      </div>

      {more && moreOpen ? (
        <div className="query-more query-advanced-filters" id={moreId} role="group" aria-label="مرشحات إضافية">
          {more}
        </div>
      ) : null}
    </section>
  );
}
