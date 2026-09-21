import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Building2, GraduationCap, Trash2 } from "lucide-react";
import { sortByName, byArabic } from "../utils/sorting";
import CurriculumPlans from "./CurriculumPlans";
import { decimalText, numericText } from "../utils/digits";
import type { AdSection } from "../types";
import type { CurriculumPlan } from "../types";
import {
  AddButton,
  EmbeddedAction,
  EmptyState,
  Field,
  FormActions,
  ListToolbar,
  MetaPill,
  Notice,
  PageTitle,
  PrimaryButton,
  RecordCard,
  RecordDeck,
  SecondaryButton,
  SkeletonDeck,
  Surface,
  CatalogFormDrawer,
  visualConfirm,
} from "./ui";

type Mode = "index" | "create" | "edit";
type CurriculumTarget = {
  loading: boolean;
  bootstrap: boolean;
  plan: CurriculumPlan | null;
  error: string | null;
};

/** `embedded` means the academic console already supplies the page identity. */
export default function Courses({ embedded = false, actionSlot = null }: { embedded?: boolean; actionSlot?: HTMLElement | null }) {
  const [items, setItems] = useState<any[]>([]),
    [colleges, setColleges] = useState<any[]>([]),
    [sections, setSections] = useState<any[]>([]),
    [listCollege, setListCollege] = useState(0),
    [listSection, setListSection] = useState(0),
    [mode, setMode] = useState<Mode>("index"),
    [editId, setEditId] = useState<number | null>(null),
    [selectedId, setSelectedId] = useState<number | null>(null),
    [collegeId, setCollegeId] = useState(""),
    [sectionId, setSectionId] = useState(""),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [credit, setCredit] = useState(""),
    [hours, setHours] = useState(""),
    [capacity, setCapacity] = useState(""),
    [query, setQuery] = useState(""),
    [error, setError] = useState<string | null>(null),
    [receipt, setReceipt] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [visibleLimit, setVisibleLimit] = useState(160),
    [curriculumOpen, setCurriculumOpen] = useState(false),
    [curriculumSectionId, setCurriculumSectionId] = useState(0),
    [curriculumProbe, setCurriculumProbe] = useState(0),
    [curriculumTarget, setCurriculumTarget] = useState<CurriculumTarget | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        fetch("/api/courses?operational=1"),
        fetch("/api/colleges"),
        fetch("/api/sections"),
      ]);
      if (!a.ok || !b.ok || !c.ok) throw 0;
      const data = await a.json();
      setItems(data);
      setColleges(sortByName(await b.json(), (row:any)=>row.AdCollegeName));
      setSections(sortByName(await c.json(), (row:any)=>row.AdSectionName));
      setSelectedId((v) =>
        v && data.some((x: any) => x.AdCourseId === v)
          ? v
          : data[0]?.AdCourseId || null,
      );
    } catch {
      setError("فشل تحميل بيانات المقررات الدراسية");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  /*
   * Reading the legacy catalogue before curriculum setup remains intentionally
   * permissive: every current course is operational. Creating is different.
   * A newly entered course must have one explicit academic destination, so the
   * editor resolves the active plan first and refuses to write while the section
   * is still in the virtual/bootstrap state. That makes it impossible to seed
   * the new curriculum into the old transition catalogue by accident.
   */
  useEffect(() => {
    if (mode !== "create" || !sectionId) {
      setCurriculumTarget(null);
      return;
    }
    let alive = true;
    setCurriculumTarget({ loading: true, bootstrap: false, plan: null, error: null });
    void fetch(`/api/curriculum/sections/${Number(sectionId)}`)
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "تعذر التحقق من الصحيفة الحالية");
        if (!alive) return;
        const active = (Array.isArray(body?.plans) ? body.plans : [])
          .find((plan: CurriculumPlan) => plan.status === "active" && !plan.virtual) || null;
        setCurriculumTarget({
          loading: false,
          bootstrap: Boolean(body?.bootstrap),
          plan: active,
          error: null,
        });
      })
      .catch(reason => {
        if (!alive) return;
        setCurriculumTarget({
          loading: false,
          bootstrap: false,
          plan: null,
          error: String(reason?.message || "تعذر التحقق من الصحيفة الحالية"),
        });
      });
    return () => { alive = false; };
  }, [mode, sectionId, curriculumProbe]);

  const sectionOptions = useMemo(
      () =>
        sortByName(sections.filter(
          (s) => !collegeId || s.AdCollegeId === Number(collegeId),
        ), (s: AdSection) => s.AdSectionName),
      [sections, collegeId],
    ),
    suggestions = useMemo(
      () =>
        Array.from(
          new Set<string>(
            items.map((x) => String(x.CourseName || "").trim()).filter(Boolean),
          ),
        ).sort(byArabic),
      [items],
    );

  const reset = () => {
      setEditId(null);
      setCollegeId("");
      setSectionId("");
      setCode("");
      setName("");
      setCredit("");
      setHours("");
      setCapacity("");
      setError(null);
      setCurriculumTarget(null);
    },
    back = () => {
      setMode("index");
      setError(null);
    },
    create = () => {
      reset();
      setReceipt(null);
      setMode("create");
    },
    edit = (x: any) => {
      setEditId(x.AdCourseId);
      setCollegeId(String(x.AdCollegeId));
      setSectionId(String(x.AdSectionId));
      setCode(String(x.CourseCode || ""));
      setName(x.CourseName || "");
      setCredit(String(x.CourseCredit ?? ""));
      setHours(String(x.CourseHours ?? ""));
      setCapacity(String(x.MaxStudent ?? ""));
      setError(null);
      setCurriculumTarget(null);
      setMode("edit");
    };

  const numeric = (v: string, setter: (x: string) => void) => {
      setter(numericText(v));
      setError(null);
    },
    decimal = (v: string, setter: (x: string) => void) => {
      setter(decimalText(v));
      setError(null);
    },
    validateCourseCode = () => {
      if (
        code &&
        sectionId &&
        items.some(
          (x) =>
            x.AdSectionId === Number(sectionId) &&
            String(x.CourseCode || "") === code &&
            x.AdCourseId !== editId,
        )
      ) {
        setError("تم تسجيل الرقم الأكاديمي للمقرر هذا من قبل");
      }
    };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!collegeId || !sectionId || !code || !name.trim() || !credit || !hours) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    if (mode === "create") {
      if (curriculumTarget?.loading) {
        setError("انتظر لحظة حتى يكتمل التحقق من الصحيفة الأكاديمية الحالية");
        return;
      }
      if (!curriculumTarget?.plan) {
        setError("أنشئ الصحيفة الجديدة لهذا القسم أولاً؛ لن نضيف مقرراً جديداً إلى كتالوج انتقالي غير محدد.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const targetPlan = mode === "create" ? curriculumTarget?.plan || null : null;
      const savedCode = code;
      const savedName = name.trim();
      const r = await fetch(
          mode === "edit" ? `/api/courses/${editId}` : "/api/courses",
          {
            method: mode === "edit" ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              AdCollegeId: Number(collegeId),
              AdSectionId: Number(sectionId),
              CourseCode: code,
              CourseName: name.trim(),
              CourseCredit: Number(credit),
              CourseHours: Number(hours),
              MaxStudent: Number(capacity || 0),
            }),
          },
        ),
        d = await r.json();
      if (!r.ok) {
        setError(d.error || "فشل حفظ بيانات المقررات الدراسية");
        return;
      }
      if (d && Number(d.AdCourseId)) {
        setItems(current => {
          const exists = current.some(item => Number(item.AdCourseId) === Number(d.AdCourseId));
          return exists
            ? current.map(item => (Number(item.AdCourseId) === Number(d.AdCourseId) ? { ...item, ...d } : item))
            : sortByName([...current, d], (row: any) => row.CourseName);
        });
        setSelectedId(Number(d.AdCourseId));
      } else {
        await load();
      }
      if (mode === "create" && targetPlan) {
        setReceipt(`تمت إضافة ${savedCode} — ${savedName} إلى ${targetPlan.name} بنجاح.`);
      }
      back();
    } catch {
      setError("تعذّر الاتصال بالخادم، تحقّق من الشبكة وحاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: number) => {
    if (submitting) return;
    if (!(await visualConfirm({ title: "حذف المقرر الدراسي", message: "سيُحذف سجل المقرر الدراسي من النظام.", confirmLabel: "حذف", tone: "danger", compact: true }))) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/courses/${id}`, { method: "DELETE" }),
        d = await r.json();
      if (!r.ok) {
        setError(d.error || "فشل حذف بيانات المقررات الدراسية");
        return;
      }
      setSelectedId(null);
      setItems(current => current.filter(item => Number(item.AdCourseId) !== Number(id)));
    } catch {
      setError("تعذّر الاتصال بالخادم، تحقّق من الشبكة وحاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => setVisibleLimit(160), [query]);
  const coll = (id: number) => colleges.find((c) => c.AdCollegeId === id)?.AdCollegeName || "",
    sec = (id: number) => sections.find((s) => s.AdSectionId === id)?.AdSectionName || "";

  const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      let list = items;
      if (listCollege) list = list.filter((x) => x.AdCollegeId === listCollege);
      if (listSection) list = list.filter((x) => x.AdSectionId === listSection);
      const base = q
        ? list.filter((x) =>
            [x.CourseCode, x.CourseName, coll(x.AdCollegeId), sec(x.AdSectionId)].some((v) =>
              String(v || "").toLowerCase().includes(q),
            ),
          )
        : list;
      return sortByName(base, (x: any) => x.CourseName);
    }, [items, colleges, sections, query, listCollege, listSection]),
    selected = filtered.find((x) => x.AdCourseId === selectedId) || filtered[0] || null,
    activeId = selected?.AdCourseId ?? null;

  const openCurriculum = (preferredSectionId = 0) => {
    const sid = preferredSectionId || listSection || Number(selected?.AdSectionId || 0);
    setCurriculumSectionId(sid);
    setMode("index");
    setError(null);
    setCurriculumOpen(true);
  };
  const createBlocked = mode === "create" && Boolean(sectionId) && Boolean(
    curriculumTarget?.loading || curriculumTarget?.error || !curriculumTarget?.plan,
  );

  const editorDrawer = mode !== "index" ? (
    <CatalogFormDrawer onClose={back} label={mode === "create" ? "إنشاء مقرر جديد" : "تعديل بيانات المقرر"}>
      <PageTitle
        eyebrow="البيانات الأكاديمية"
        subtitle={mode === "create" ? "المقرر الجديد يرتبط بالصحيفة الحالية تلقائياً" : "مرتبط بالكلية والقسم"}
      >
        {mode === "create" ? "تسجيل مقرر دراسي جديد" : "تعديل بيانات المقرر"}
      </PageTitle>
      {error ? <Notice>{error}</Notice> : null}
      <Surface className="form-card smart-form">
        <div className="form-intro">
          <span><BookOpen /></span>
          <div>
            <strong>بطاقة المقرر</strong>
            <p>{mode === "create" ? "اختر القسم أولاً لعرض الصحيفة التي سيُسجّل فيها المقرر" : "كل ما يلزم المقرر"}</p>
          </div>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="الكلية" required>
              <select
                value={collegeId}
                onChange={(e) => {
                  setCollegeId(e.target.value);
                  setSectionId("");
                  setCurriculumTarget(null);
                }}
                aria-label="الكلية"
                autoFocus
                required
              >
                <option value="">اختر ...</option>
                {colleges.map((c) => <option key={c.AdCollegeId} value={c.AdCollegeId}>{c.AdCollegeName}</option>)}
              </select>
            </Field>
            <Field label="القسم العلمي" required>
              <select
                value={sectionId}
                onChange={(e) => {
                  setSectionId(e.target.value);
                  setCurriculumTarget(null);
                }}
                disabled={!collegeId}
                aria-label="القسم العلمي"
                required
              >
                <option value="">اختر ...</option>
                {sectionOptions.map((s) => <option key={s.AdSectionId} value={s.AdSectionId}>{s.AdSectionName}</option>)}
              </select>
            </Field>

            {mode === "create" && sectionId ? (
              <div style={{ gridColumn: "1 / -1" }}>
                {curriculumTarget?.loading ? (
                  <Notice type="info" inline>يجري التحقق من الصحيفة الأكاديمية الحالية لهذا القسم…</Notice>
                ) : curriculumTarget?.plan ? (
                  <Notice type="success" inline>
                    <strong>الصحيفة المستهدفة: {curriculumTarget.plan.name}{curriculumTarget.plan.code ? ` · ${curriculumTarget.plan.code}` : ""}</strong>
                    <br />
                    سيتم ربط هذا المقرر تلقائياً بهذه الصحيفة عند الحفظ، ولن يُضاف إلى الصحيفة الانتقالية.
                  </Notice>
                ) : curriculumTarget?.error ? (
                  <Notice
                    type="block"
                    inline
                    action={
                      <SecondaryButton
                        type="button"
                        data-guide-ignore="إعادة محاولة قراءة الصحيفة بعد تعذر التحقق؛ لا تنفذ تغييراً أكاديمياً"
                        onClick={() => setCurriculumProbe(value => value + 1)}
                      >
                        إعادة التحقق
                      </SecondaryButton>
                    }
                  >
                    تعذر التحقق من الصحيفة الحالية. أوقفنا الحفظ حتى نتأكد من وجهة المقرر بدلاً من تسجيله في صحيفة غير صحيحة.
                  </Notice>
                ) : (
                  <Notice
                    type="warning"
                    inline
                    action={
                      <SecondaryButton
                        type="button"
                        data-guide-ignore="إدارة أكاديمية متخصصة للصحائف؛ لا تغيّر الجدول مباشرة"
                        onClick={() => openCurriculum(Number(sectionId))}
                      >
                        <GraduationCap /> تهيئة الصحيفة الجديدة
                      </SecondaryButton>
                    }
                  >
                    <strong>لا توجد صحيفة جديدة فعّالة لهذا القسم بعد.</strong>
                    <br />
                    لحماية التاريخ، لن نضيف مقرراً جديداً الآن. أنشئ الصحيفة الجديدة أولاً؛ سيُثبّت النظام المقررات الموجودة حالياً في الصحيفة السابقة، ثم تبدأ الجديدة فارغة.
                  </Notice>
                )}
              </div>
            ) : null}

            <Field label="الرقم الأكاديمي للمقرر" required>
              <input
                inputMode="numeric"
                value={code}
                onChange={(e) => numeric(e.target.value, setCode)}
                onBlur={validateCourseCode}
                aria-label="الرقم الأكاديمي للمقرر"
                autoComplete="off"
                required
              />
            </Field>
            <Field label="المقرر الدراسي" required>
              <input
                list="course-name-suggestions"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="اسم المقرر الدراسي"
                autoComplete="off"
                required
              />
              <datalist id="course-name-suggestions">
                {suggestions.map((x) => <option key={x} value={x} />)}
              </datalist>
            </Field>
            <Field label="الوحدات" required>
              <input inputMode="numeric" value={credit} onChange={(e) => numeric(e.target.value, setCredit)} aria-label="الوحدات" required />
            </Field>
            <Field label="الساعات" required>
              <input inputMode="decimal" value={hours} onChange={(e) => decimal(e.target.value, setHours)} aria-label="الساعات" required />
            </Field>
            <Field label="السعة">
              <input inputMode="numeric" value={capacity} onChange={(e) => numeric(e.target.value, setCapacity)} aria-label="السعة القصوى للطلبة" />
            </Field>
          </div>
          <FormActions
            onBack={back}
            loading={loading || submitting || Boolean(curriculumTarget?.loading && mode === "create")}
            submitDisabled={createBlocked}
            submitLabel={mode === "create" ? (curriculumTarget?.plan ? `إنشاء في ${curriculumTarget.plan.name}` : "إنشاء المقرر") : "حفظ التعديلات"}
          />
        </form>
      </Surface>
    </CatalogFormDrawer>
  ) : null;

  return (
    <div className={`content-stack library-page catalog-inspector-page visual-minimal ${embedded ? "embedded-catalog" : ""}`}>
      {embedded ? (
        <EmbeddedAction slot={actionSlot}>
          <div className="course-head-actions">
            <SecondaryButton data-guide-ignore="إدارة أكاديمية متخصصة للصحائف؛ لا تغيّر الجدول مباشرة" onClick={() => openCurriculum()}><GraduationCap /> الصحائف الأكاديمية</SecondaryButton>
            <AddButton onClick={create}>إنشاء مقرر</AddButton>
          </div>
        </EmbeddedAction>
      ) : (
        <PageTitle
          eyebrow="المكتبة الأكاديمية"
          subtitle="المكتبة والتفاصيل في لوحة واحدة"
          action={<div className="course-head-actions"><SecondaryButton data-guide-ignore="إدارة أكاديمية متخصصة للصحائف؛ لا تغيّر الجدول مباشرة" onClick={() => openCurriculum()}><GraduationCap /> الصحائف الأكاديمية</SecondaryButton><AddButton onClick={create}>إنشاء مقرر</AddButton></div>}
        >
          المقررات الدراسية
        </PageTitle>
      )}
      {receipt ? <Notice type="success" onDismiss={() => setReceipt(null)}>{receipt}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      <div className="catalog-workspace">
        <Surface className="catalog-master">
          <ListToolbar value={query} onChange={setQuery} count={filtered.length} placeholder="الرقم الأكاديمي، اسم المقرر، الكلية أو القسم">
            <select
              className="list-filter"
              value={listCollege}
              onChange={(e) => { setListCollege(Number(e.target.value)); setListSection(0); }}
              aria-label="تصفية بالكلية"
            >
              <option value={0}>كل الكليات</option>
              {colleges.map((c) => <option key={c.AdCollegeId} value={c.AdCollegeId}>{c.AdCollegeName}</option>)}
            </select>
            <select
              className="list-filter"
              value={listSection}
              onChange={(e) => setListSection(Number(e.target.value))}
              aria-label="تصفية بالقسم"
            >
              <option value={0}>كل الأقسام</option>
              {sections.filter((s) => !listCollege || s.AdCollegeId === listCollege).map((s) => <option key={s.AdSectionId} value={s.AdSectionId}>{s.AdSectionName}</option>)}
            </select>
          </ListToolbar>
          {loading ? (
            <SkeletonDeck count={6} />
          ) : filtered.length ? (
            <RecordDeck className="course-deck">
              {filtered.slice(0, visibleLimit).map((x) => (
                <RecordCard
                  key={x.AdCourseId}
                  onClick={() => setSelectedId(x.AdCourseId)}
                  className={activeId === x.AdCourseId ? "selected" : ""}
                  icon={<BookOpen />}
                  title={x.CourseName}
                  subtitle={<span className="record-path"><Building2 />{sec(x.AdSectionId)} <i className="record-path-dot" aria-hidden="true" /> {coll(x.AdCollegeId)}</span>}
                  meta={<><MetaPill label="الرقم الأكاديمي" value={x.CourseCode} /><MetaPill label="الوحدات" value={x.CourseCredit} /><MetaPill label="الساعات" value={x.CourseHours} /></>}
                />
              ))}
            </RecordDeck>
          ) : (
            <EmptyState title="لا توجد مقررات مطابقة" detail="جرّب رمزاً آخر أو امسح عبارة البحث." />
          )}
          {filtered.length > visibleLimit ? (
            <div className="catalog-more">
              <SecondaryButton onClick={() => setVisibleLimit((v) => v + 160)}>
                عرض المزيد · {" "}{(filtered.length - visibleLimit).toLocaleString("ar-KW-u-nu-latn")} متبقٍ
              </SecondaryButton>
            </div>
          ) : null}
        </Surface>
        <aside className="academic-inspector">
          {selected ? (
            <>
              <div className="academic-inspector-icon"><BookOpen /></div>
              <span className="surface-kicker">تفاصيل المقرر</span>
              <h2>{selected.CourseName}</h2>
              <p>{sec(selected.AdSectionId)} · {coll(selected.AdCollegeId)}</p>
              <div className="inspector-facts">
                <article><span>الوحدات</span><b>{selected.CourseCredit}</b></article>
                <article><span>الساعات</span><b>{selected.CourseHours}</b></article>
                <article><span>السعة</span><b>{selected.MaxStudent || 0}</b></article>
                <article><span>رمز المقرر</span><b>{selected.CourseCode || "—"}</b></article>
              </div>
              <div className="inspector-actions">
                <PrimaryButton onClick={() => edit(selected)}>تعديل</PrimaryButton>
                <SecondaryButton
                  data-guide-ignore="إجراء حذف حساس داخل شاشة الإدارة ويستخدم تأكيد الشاشة نفسه"
                  className="danger-action"
                  onClick={() => remove(selected.AdCourseId)}
                >
                  <Trash2 /> حذف
                </SecondaryButton>
              </div>
            </>
          ) : (
            <div className="master-empty"><BookOpen /><strong>اختر مقرراً</strong><span>التفاصيل ستظهر هنا.</span></div>
          )}
        </aside>
      </div>
      {editorDrawer}
      {curriculumOpen ? (
        <CurriculumPlans
          sections={sections}
          initialSectionId={curriculumSectionId || listSection || Number(selected?.AdSectionId || 0)}
          onClose={() => { setCurriculumOpen(false); setCurriculumProbe(value => value + 1); }}
          onChanged={() => { void load(); setCurriculumProbe(value => value + 1); }}
        />
      ) : null}
    </div>
  );
}