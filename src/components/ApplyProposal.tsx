import React, { useState } from "react";
import { AlertOctagon, CalendarCheck, CalendarPlus, Check, CircleSlash, ShieldCheck, TrendingDown, TrendingUp, X, Zap } from "lucide-react";
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

/** أثرُ الاقتراح على من أجابوا (من الخادم: إعادة محاكاة قبل/بعد). */
export interface ChangeImpact {
  before: Bands; after: Bands; helped: number; harmed: number; responders: number; delta12: number; delta15: number;
  conflictsBefore: number; conflictsAfter: number; harmedOutside?: number; verdict: "apply" | "caution" | "avoid" | "neutral";
}
interface Bands { canReach15: number; canReach12To14: number; below12: number; graduatingBelow12: number; unknown: number }

/** «ماذا لو؟»: يقيس الأثر بلا كتابة. يرمي رسالةَ الخادم كما هي. */
export async function postWhatIf(body: unknown): Promise<ChangeImpact> {
  const response = await fetch("/api/schedules/what-if", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("وصل ردٌّ غير متوقّع من الخادم."); }
  if (!response.ok) throw new Error(data.error || "تعذّر قياس الأثر.");
  return data.impact as ChangeImpact;
}

const VERDICT_TEXT: Record<ChangeImpact["verdict"], string> = {
  apply: "الأثر إيجابي على من أجابوا", caution: "ينفع بعضهم ويضرّ آخرين", avoid: "الضرر أكبر — يُنصح بعدم التنفيذ", neutral: "لا أثر مقيس على من أجابوا",
};
const fmtN = (n: number) => n.toLocaleString("ar-KW-u-nu-latn");

function BandBar({ label, bands, total }: { label: string; bands: Bands; total: number }) {
  const w = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div className="ip-bar" role="img" aria-label={`${label}: ${bands.canReach15} يبلغون 15، ${bands.canReach12To14} بين 12 و14، ${bands.below12} أقل من 12`}>
      <small>{label}</small>
      <span><i className="b15" style={{ inlineSize: w(bands.canReach15) }} /><i className="b12" style={{ inlineSize: w(bands.canReach12To14 + bands.graduatingBelow12) }} /><i className="bLow" style={{ inlineSize: w(bands.below12) }} /><i className="bUnk" style={{ inlineSize: w(bands.unknown) }} /></span>
    </div>
  );
}

function ImpactCard({ impact }: { impact: ChangeImpact }) {
  const Icon = impact.verdict === "avoid" ? AlertOctagon : impact.verdict === "neutral" ? CircleSlash : impact.verdict === "caution" ? TrendingDown : TrendingUp;
  return (
    <div className={`ip-card v-${impact.verdict}`}>
      <div className="ip-verdict"><Icon aria-hidden="true" /><b>{VERDICT_TEXT[impact.verdict]}</b></div>
      <BandBar label="الآن" bands={impact.before} total={impact.responders} />
      <BandBar label="بعد" bands={impact.after} total={impact.responders} />
      <ul className="ip-chips">
        <li className="up"><TrendingUp aria-hidden="true" /><b>{fmtN(impact.helped)}</b><span>يتحسن حالهم</span></li>
        <li className={impact.harmed ? "down" : ""}><TrendingDown aria-hidden="true" /><b>{fmtN(impact.harmed)}</b><span>يتضررون</span></li>
        {impact.harmedOutside ? <li className="down"><TrendingDown aria-hidden="true" /><span>ويتضرر طلبةٌ من قسمٍ آخر</span></li> : null}
        {impact.conflictsBefore !== impact.conflictsAfter ? <li><Zap aria-hidden="true" /><span>تعارضات</span><b>{fmtN(impact.conflictsBefore)} ← {fmtN(impact.conflictsAfter)}</b></li> : null}
      </ul>
      <small className="ip-foot">قياسٌ على {fmtN(impact.responders)} ممن أجابوا؛ مقارنةُ حالتين لا ضمانٌ.</small>
    </div>
  );
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
  /** يقيس الأثر قبل التأكيد (اختياري): فإن تعذّر عاد النصّ البسيط. */
  preview?: () => Promise<ChangeImpact>;
}

export default function ApplyProposal({ lines, why, run, label = "اعتمد في الجدول", onApplied, disabled, disabledReason, compact, icon = "add", preview }: Props) {
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  const [impact, setImpact] = useState<ChangeImpact | "loading" | "failed" | null>(null);
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
        <PrimaryButton type="button" disabled={disabled} title={disabled ? disabledReason : undefined} onClick={() => { setStep("confirm"); if (preview) { setImpact("loading"); void preview().then(setImpact).catch(() => setImpact("failed")); } }}
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
      {impact && typeof impact === "object" ? <ImpactCard impact={impact} /> : null}
      {impact === "loading" ? <div className="ip-card ip-loading" role="status"><i /><i /><small>يقيس الأثر على الطلبة…</small></div> : null}
      {why && (!preview || impact === "failed") ? <p className="ap-why">{why}</p> : null}
      <small>يمرّ بنفس تحقّق الحفظ اليدوي: التعارضات، وقفل الجدول عند التسجيل، ونطاق صلاحيتك. وإن كان الجدول مقبولاً فتُفتح جولة تعديل.</small>
      {error ? <Notice type="error" inline>{error}</Notice> : null}
      <div className="ap-actions">
        <PrimaryButton type="button" disabled={step === "busy"} onClick={confirm} data-guide-ignore="تأكيدُ كتابة الاقتراح في الجدول الأصلي">
          {step === "busy" ? "جارٍ الكتابة…" : impact && typeof impact === "object" && impact.verdict === "avoid" ? "اعتمد رغم الضرر" : "اعتمد الآن"}
        </PrimaryButton>
        <SecondaryButton type="button" disabled={step === "busy"} onClick={() => { setStep("idle"); setError(""); setImpact(null); }} data-guide-ignore="تراجعٌ عن اعتماد الاقتراح دون أي كتابة">
          <X aria-hidden="true" /> تراجع
        </SecondaryButton>
      </div>
    </div>
  );
}
