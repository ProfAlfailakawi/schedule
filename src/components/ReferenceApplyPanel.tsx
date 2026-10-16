import React, { useState } from "react";
import { ArrowLeftRight, Ban, CheckCircle2, ListPlus, Link2, ShieldAlert, Wand2 } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { Notice, PrimaryButton, SecondaryButton } from "./ui";

/**
 * ── تطبيق الصحيفة المرجعية على الكتالوج ─────────────────────────────────────────
 *
 * الصحيفة هي المرجع: ما خالفها في الكتالوج يُصحَّح (اسماً ووحداتٍ وساعات)، والناقص يُضاف في
 * قسمه المالك، ومقررات القسم تُربط بصحيفته، وتُنشأ مسوّدة قواعد لا تُعتمد. للحساب الرئيسي وحده.
 * المعاينة والتطبيق من نداء الخادم نفسه، فما تقرؤه هنا هو ما سيُكتب.
 */

interface Site {
  sectionId: number; collegeName: string; branch: string; planNote: string; planId: string | null; applied: boolean;
  updates: Array<{ code: string; before: { name: string; credit: number; hours: number }; after: { name: string; credit: number; hours: number }; identityChange: boolean; frozen?: boolean }>;
  held: Array<{ code: string; before: { name: string }; after: { name: string } }>;
  creates: Array<{ code: string; name: string }>;
  links: Array<{ code: string }>;
  skipped: Array<{ code: string; name: string; reason: string }>;
  notes: string[];
  courseCount?: number; rules: number; groups: number;
}
interface Report { referenceId: string; dryRun: boolean; sites: Site[] }

const post = async (body: unknown): Promise<Report> => {
  const response = await fetch("/api/plan-review/reference/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("وصل ردٌّ غير متوقّع من الخادم."); }
  if (!response.ok) throw new Error(data.error || "تعذّر تطبيق الصحيفة.");
  return data;
};

export default function ReferenceApplyPanel({ referenceId, referenceName, onApplied }: { key?: React.Key; referenceId: string; referenceName: string; onApplied: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmIdentity, setConfirmIdentity] = useState(false);
  const [done, setDone] = useState(false);

  const look = async () => {
    setBusy(true); setError(""); setDone(false); setConfirmIdentity(false);
    try { setReport(await post({ referenceId, dryRun: true })); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setError("");
    try { setReport(await post({ referenceId, dryRun: false, confirmIdentity })); setDone(true); onApplied(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const sites = report?.sites || [];
  const anyHeld = sites.some(site => site.held?.length);
  const totals = sites.reduce((sum, site) => ({
    updates: sum.updates + site.updates.length, creates: sum.creates + site.creates.length, links: sum.links + site.links.length, skipped: sum.skipped + site.skipped.length,
  }), { updates: 0, creates: 0, links: 0, skipped: 0 });

  const branchOf = (site: Site) => site.branch === "012" ? "بنات" : site.branch === "011" ? "بنين" : "";
  const collegeOf = (site: Site) => site.collegeName.replace(/\s*[-–]\s*(بنين|بنات)\s*$/, "");
  const STATS = [
    { key: "updates", label: "تصحيح", Icon: ArrowLeftRight, tone: "fix" },
    { key: "creates", label: "إضافة", Icon: ListPlus, tone: "add" },
    { key: "links", label: "ربط", Icon: Link2, tone: "link" },
    { key: "skipped", label: "استبعاد", Icon: Ban, tone: "skip" },
  ] as const;

  return (
    <section className="rap" aria-label="تطبيق الصحيفة المرجعية">
      <header className="rap-head">
        <span className="rap-ic" aria-hidden="true"><Wand2 /></span>
        <div><b>طبّق «{referenceName}» على الكتالوج</b><small>معاينة أولاً · لا يُكتب شيء قبل تأكيدك</small></div>
        {!report ? <PrimaryButton type="button" disabled={busy} onClick={look} data-guide-ignore="معاينة تطبيق الصحيفة المرجعية على الكتالوج؛ لا يكتب شيئاً">{busy ? "جارٍ الفحص…" : "عاين ما سيتغيّر"}</PrimaryButton> : null}
      </header>
      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {report ? (
        <div className="rap-body">
          {totals.updates || totals.creates || totals.links || totals.skipped ? (
            <div className="rap-stats" role="status">
              {STATS.map(({ key, label, Icon, tone }) => (
                <div key={key} className={`rap-stat is-${tone}${totals[key] ? "" : " is-zero"}`}>
                  <Icon aria-hidden="true" /><b>{totals[key].toLocaleString("en-US")}</b><span>{label}</span>
                </div>
              ))}
            </div>
          ) : <p className="rap-match" role="status"><CheckCircle2 aria-hidden="true" /> الكتالوج مطابق لهذه الصحيفة</p>}
          <ul className="rap-sites">
            {sites.map(site => {
              const chips = [
                { n: site.updates.length, Icon: ArrowLeftRight, tone: "fix", tip: site.updates.map(row => `${row.before.name} ← ${row.after.name}`).join("\n") },
                { n: site.creates.length, Icon: ListPlus, tone: "add", tip: site.creates.map(row => row.name).join("\n") },
                { n: site.links.length, Icon: Link2, tone: "link", tip: "" },
                { n: site.skipped.length, Icon: Ban, tone: "skip", tip: [...new Set(site.skipped.map(row => row.reason))].join("\n") },
                { n: site.held?.length || 0, Icon: ShieldAlert, tone: "held", tip: (site.held || []).map(row => `${row.before.name} ← ${row.after.name}`).join("\n") },
              ].filter(chip => chip.n);
              const hasDetail = site.updates.length || site.skipped.length || site.held?.length || site.notes.length;
              return (
                <li key={site.sectionId} className="rap-site">
                  <div className="rap-site-head">
                    <b>{collegeOf(site)}</b>
                    {branchOf(site) ? <span className={`rap-branch is-${site.branch}`}>{branchOf(site)}</span> : null}
                    {site.courseCount ? <small>{countOf(site.courseCount, AR.course)}</small> : null}
                  </div>
                  {site.planNote ? <Notice type="info" inline>{site.planNote}</Notice> : null}
                  <div className="rap-chips">
                    {chips.length ? chips.map(({ n, Icon, tone, tip }) => (
                      <span key={tone} className={`rap-chip is-${tone}`} title={tip || undefined}><Icon aria-hidden="true" />{n}</span>
                    )) : <span className="rap-chip is-ok"><CheckCircle2 aria-hidden="true" />مطابق</span>}
                    {site.applied ? <span className="rap-chip is-ok"><CheckCircle2 aria-hidden="true" />طُبّق</span> : null}
                  </div>
                  {hasDetail ? (
                    <details className="rap-notes"><summary>التفاصيل</summary>
                      <ul>
                        {site.updates.map(row => <li key={`u${row.code}`}><ArrowLeftRight aria-hidden="true" />{row.before.name} ← {row.after.name}</li>)}
                        {site.held?.map(row => <li key={`h${row.code}`} className="rap-held"><ShieldAlert aria-hidden="true" />{row.before.name} ← {row.after.name} · اسم مجمَّد</li>)}
                        {[...new Set(site.skipped.map(row => row.reason))].map(reason => <li key={`s${reason}`}><Ban aria-hidden="true" />{countOf(site.skipped.filter(row => row.reason === reason).length, AR.course)}: {reason}</li>)}
                        {site.notes.slice(0, 12).map((note, i) => <li key={`n${i}`}>{note}</li>)}
                      </ul>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {!done ? (
            <div className="rap-actions">
              {anyHeld ? (
                <label className="rap-confirm"><input type="checkbox" checked={confirmIdentity} onChange={e => setConfirmIdentity(e.target.checked)} /> أؤكد تغيير الأسماء المجمَّدة إلى ما في الصحيفة (الوحدات والساعات تُصحَّح في كل حال)</label>
              ) : null}
              <PrimaryButton type="button" disabled={busy} onClick={apply} data-guide-ignore="تأكيد كتابة الصحيفة المرجعية في الكتالوج">{busy ? "جارٍ الكتابة…" : "اعتمد التطبيق"}</PrimaryButton>
              <SecondaryButton type="button" disabled={busy} onClick={() => setReport(null)} data-guide-ignore="إغلاق المعاينة دون كتابة">تراجع</SecondaryButton>
            </div>
          ) : <Notice type="success" inline>تم. مسوّدة القواعد قيد المراجعة عند الأقسام، ولا شيء اعتُمد تلقائياً.</Notice>}
        </div>
      ) : null}
    </section>
  );
}
