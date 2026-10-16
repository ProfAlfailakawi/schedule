import React, { useState } from "react";
import { CalendarCheck, CalendarPlus, Check, ShieldCheck, X } from "lucide-react";
import { Notice, PrimaryButton, SecondaryButton } from "./ui";

/**
 * ── «اعتمد في الجدول» ────────────────────────────────────────────────────────
 *
 * زرٌّ واحدٌ لكل الشاشات التي تنتهي إلى سؤال «أنفّذ هذا في الجدول الأصلي؟»: مركز الذكاء، كشف
 * التسجيل، الرادار. يعرض ما سيُكتب بسطورٍ قبل أن يُكتب، ويُنفّذ بنداء الخادم الواحد، ويقول ما حدث
 * بعده — أو لماذا لم يحدث (تعارضٌ، قفلٌ عند التسجيل، موعدٌ تغيّر). لا يكتب شيئاً بنفسه: كلُّ التحقق
 * في الخادم، وهو الحاكم.
 */

export interface ApplyOutcome {
  /** سطرٌ يقول ما وقع، يُعرض بعد النجاح. */
  summary: string;
  /** جولةُ تعديلٍ فُتحت لأن الجدولَ كان مقبولاً من التسجيل. */
  amendment?: boolean;
}

/** نداءُ اعتماد اقتراحٍ مباشر (مركز الذكاء والرادار). يرمي رسالةَ الخادم كما هي. */
export async function postScheduleProposal(body: unknown): Promise<any> {
  const response = await fetch("/api/schedules/apply-proposal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("وصل ردٌّ غير متوقّع من الخادم."); }
  if (!response.ok) throw new Error(data.error || "تعذّر تنفيذ الاقتراح.");
  return data;
}

interface Props {
  key?: React.Key;
  /** ما سيُكتب: سطرٌ لكل تغيير (مثل «شعبة 505 · الأحد 10:00–11:15 · قاعة 101»). */
  lines: string[];
  /** سطرٌ يقول لماذا يستحق هذا التنفيذ (الأثر المقيس)، اختياري. */
  why?: React.ReactNode;
  run: () => Promise<ApplyOutcome>;
  label?: string;
  /** يُستدعى بعد النجاح ليعيد الشاشةُ قراءةَ ما تغيّر. */
  onApplied?: (outcome: ApplyOutcome) => void;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
  icon?: "add" | "check";
}

export default function ApplyProposal({ lines, why, run, label = "اعتمد في الجدول", onApplied, disabled, disabledReason, compact, icon = "add" }: Props) {
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  const Icon = icon === "add" ? CalendarPlus : CalendarCheck;

  const confirm = async () => {
    setStep("busy"); setError("");
    try {
      const done = await run();
      setOutcome(done); setStep("done");
      onApplied?.(done);
    } catch (e: any) {
      setError(e?.message || "تعذّر التنفيذ."); setStep("confirm");
    }
  };

  if (step === "done" && outcome) {
    return (
      <div className="ap-done" role="status">
        <span className="ap-ic" aria-hidden="true"><Check /></span>
        <div>
          <b>{outcome.summary}</b>
          <small>{outcome.amendment ? "الجدول كان مقبولاً عند التسجيل: فُتحت جولة تعديلٍ ويصله ما تغيّر." : "كُتب في الجدول الأصلي، ويُعاد حسابُ الرادار تلقائياً."}</small>
        </div>
      </div>
    );
  }

  if (step === "idle") {
    return (
      <div className={`ap-wrap${compact ? " compact" : ""}`}>
        <PrimaryButton type="button" disabled={disabled} title={disabled ? disabledReason : undefined} onClick={() => setStep("confirm")}
          data-guide-ignore="يفتح تأكيد اعتماد الاقتراح؛ لا يكتب شيئاً قبل التأكيد">
          <Icon aria-hidden="true" /> {label}
        </PrimaryButton>
        {disabled && disabledReason ? <small className="ap-why-not">{disabledReason}</small> : null}
      </div>
    );
  }

  return (
    <div className="ap-confirm" role="group" aria-label="تأكيد اعتماد الاقتراح في الجدول">
      <header><span className="ap-ic" aria-hidden="true"><ShieldCheck /></span><b>سيُكتب هذا في الجدول الأصلي الآن</b></header>
      <ul>{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
      {why ? <p className="ap-why">{why}</p> : null}
      <small>يمرّ بنفس تحقّق الحفظ اليدوي: التعارضات، وقفل الجدول عند التسجيل، ونطاق صلاحيتك. وإن كان الجدول مقبولاً فتُفتح جولة تعديل.</small>
      {error ? <Notice type="error" inline>{error}</Notice> : null}
      <div className="ap-actions">
        <PrimaryButton type="button" disabled={step === "busy"} onClick={confirm} data-guide-ignore="تأكيدُ كتابة الاقتراح في الجدول الأصلي">
          {step === "busy" ? "جارٍ الكتابة…" : "اعتمد الآن"}
        </PrimaryButton>
        <SecondaryButton type="button" disabled={step === "busy"} onClick={() => { setStep("idle"); setError(""); }} data-guide-ignore="تراجعٌ عن اعتماد الاقتراح دون أي كتابة">
          <X aria-hidden="true" /> تراجع
        </SecondaryButton>
      </div>
    </div>
  );
}
