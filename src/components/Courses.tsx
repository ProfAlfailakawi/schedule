import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Building2, Clock3, Trash2, Users } from "lucide-react";
import { sortByName } from "../utils/sorting";
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
} from "./ui";
type Mode = "index" | "create" | "edit";
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
    [loading, setLoading] = useState(false),
    [visibleLimit, setVisibleLimit] = useState(160);
  const load = async () => {
    setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        fetch("/api/courses"),
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
  useEffect(() => {
    void load();
  }, []);
  const sectionOptions = useMemo(
      () =>
        sections.filter(
          (s) => !collegeId || s.AdCollegeId === Number(collegeId),
        ),
      [sections, collegeId],
    ),
    suggestions = useMemo(
      () =>
        Array.from(
          new Set<string>(
            items.map((x) => String(x.CourseName || "").trim()).filter(Boolean),
          ),
        ).sort((a, b) => a.localeCompare(b, "ar")),
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
    },
    back = () => {
      setMode("index");
      setError(null);
    },
    create = () => {
      reset();
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
      setMode("edit");
    };
  const numeric = (v: string, setter: (x: string) => void) => {
      if (!/^\d*$/.test(v)) {
        setError("الرجاء كتابة الأرقام بالانجليزي");
        return;
      }
      setter(v);
      setError(null);
    },
    decimal = (v: string, setter: (x: string) => void) => {
      if (!/^\d*(?:\.\d*)?$/.test(v)) {
        setError("الرجاء كتابة الأرقام بالانجليزي");
        return;
      }
      setter(v);
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
        // The typed value stays. Erasing the field on a duplicate warning made
        // the reader retype a code they could no longer see to compare.
        setError("تم تسجيل رمز المقرر الدراسي هذا من قبل");
      }
    };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (
      !collegeId ||
      !sectionId ||
      !code ||
      !name.trim() ||
      !credit ||
      !hours
    ) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
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
    /* The answer contains the saved record, so the list updates from it. The
       old path re-read every course in the university — plus the colleges and
       the sections — to show one edited line. */
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
    back();
  };
  const remove = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف بيانات المقرر الدراسي؟")) return;
    const r = await fetch(`/api/courses/${id}`, { method: "DELETE" }),
      d = await r.json();
    if (!r.ok) {
      setError(d.error || "فشل حذف بيانات المقرر الدراسي");
      return;
    }
    // The row leaves the list directly; nothing else on this screen changed.
    setSelectedId(null);
    setItems(current => current.filter(item => Number(item.AdCourseId) !== Number(id)));
  };
  useEffect(() => setVisibleLimit(160), [query]);
  const coll = (id: number) =>
      colleges.find((c) => c.AdCollegeId === id)?.AdCollegeName || "",
    sec = (id: number) =>
      sections.find((s) => s.AdSectionId === id)?.AdSectionName || "";
  const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      let list = items;
      if (listCollege) list = list.filter((x) => x.AdCollegeId === listCollege);
      if (listSection) list = list.filter((x) => x.AdSectionId === listSection);
      const base = q
        ? list.filter((x) =>
            [
              x.CourseCode,
              x.CourseName,
              coll(x.AdCollegeId),
              sec(x.AdSectionId),
            ].some((v) =>
              String(v || "")
                .toLowerCase()
                .includes(q),
            ),
          )
        : list;
      return sortByName(base, (x: any) => x.CourseName);
    }, [items, colleges, sections, query, listCollege, listSection]),
    selected =
      filtered.find((x) => x.AdCourseId === selectedId) || filtered[0] || null,
    activeId = selected?.AdCourseId ?? null;
  const editorDrawer = mode !== "index" ? (
      <CatalogFormDrawer onClose={back} label={mode === "create" ? "إنشاء مقرر جديد" : "تعديل بيانات المقرر"}>
        <PageTitle
          eyebrow="البيانات الأكاديمية"
          subtitle="مرتبط بالكلية والقسم"
        >
          {mode === "create" ? "تسجيل مقرر دراسي جديد" : "تعديل بيانات المقرر"}
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="form-card smart-form">
          <div className="form-intro">
            <span>
              <BookOpen />
            </span>
            <div>
              <strong>بطاقة المقرر</strong>
              <p>كل ما يلزم المقرر</p>
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
                  }}
                  aria-label="الكلية"
                  autoFocus
                  required
                >
                  <option value="">اختر ...</option>
                  {colleges.map((c) => (
                    <option key={c.AdCollegeId} value={c.AdCollegeId}>
                      {c.AdCollegeName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="القسم العلمي" required>
                <select
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                  disabled={!collegeId}
                  aria-label="القسم العلمي"
                  required
                >
                  <option value="">اختر ...</option>
                  {sectionOptions.map((s) => (
                    <option key={s.AdSectionId} value={s.AdSectionId}>
                      {s.AdSectionName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="رمز المقرر الدراسي" required>
                <input
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => numeric(e.target.value, setCode)}
                  onBlur={validateCourseCode}
                  aria-label="رمز المقرر الدراسي"
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
                  {suggestions.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </Field>
              <Field label="الوحدات" required>
                <input
                  inputMode="numeric"
                  value={credit}
                  onChange={(e) => numeric(e.target.value, setCredit)}
                  aria-label="الوحدات"
                  required
                />
              </Field>
              <Field label="الساعات" required>
                <input
                  inputMode="decimal"
                  value={hours}
                  onChange={(e) => decimal(e.target.value, setHours)}
                  aria-label="الساعات"
                  required
                />
              </Field>
              <Field label="السعة">
                <input
                  inputMode="numeric"
                  value={capacity}
                  onChange={(e) => numeric(e.target.value, setCapacity)}
                  aria-label="السعة القصوى للطلبة"
                />
              </Field>
            </div>
            <FormActions
              onBack={back}
              loading={loading}
              submitLabel={mode === "create" ? "إنشاء المقرر" : "حفظ التعديلات"}
            />
          </form>
        </Surface>
      </CatalogFormDrawer>
    ) : null;
  return (
    <div className={`content-stack library-page catalog-inspector-page ${embedded ? "embedded-catalog" : ""}`}>
      {embedded ? (
        <EmbeddedAction slot={actionSlot}>
          <AddButton onClick={create}>إنشاء مقرر</AddButton>
        </EmbeddedAction>
      ) : (
        <PageTitle
          eyebrow="المكتبة الأكاديمية"
          subtitle="المكتبة والتفاصيل في لوحة واحدة"
          action={<AddButton onClick={create}>إنشاء مقرر</AddButton>}
        >
          المقررات الدراسية
        </PageTitle>
      )}
      {error ? <Notice>{error}</Notice> : null}
      <div className="catalog-workspace">
        <Surface className="catalog-master">
          <ListToolbar
            value={query}
            onChange={setQuery}
            count={filtered.length}
            placeholder="رمز المقرر، اسمه، الكلية أو القسم"
          >
            <select
              className="list-filter"
              value={listCollege}
              onChange={(e) => { setListCollege(Number(e.target.value)); setListSection(0); }}
              aria-label="تصفية بالكلية"
            >
              <option value={0}>كل الكليات</option>
              {colleges.map((c) => (
                <option key={c.AdCollegeId} value={c.AdCollegeId}>{c.AdCollegeName}</option>
              ))}
            </select>
            <select
              className="list-filter"
              value={listSection}
              onChange={(e) => setListSection(Number(e.target.value))}
              aria-label="تصفية بالقسم"
            >
              <option value={0}>كل الأقسام</option>
              {sections.filter((s) => !listCollege || s.AdCollegeId === listCollege).map((s) => (
                <option key={s.AdSectionId} value={s.AdSectionId}>{s.AdSectionName}</option>
              ))}
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
                  /* `activeId` is what the inspector is actually showing —
                     `selectedId` is null until the reader clicks, so on first
                     load the panel described a course whose card looked
                     unselected. Every sibling screen keys on activeId. */
                  className={activeId === x.AdCourseId ? "selected" : ""}
                  icon={<BookOpen />}
                  title={x.CourseName}
                  subtitle={
                    <span className="record-path">
                      <Building2 />
                      {sec(x.AdSectionId)} <i>•</i> {coll(x.AdCollegeId)}
                    </span>
                  }
                  meta={
                    <>
                      <MetaPill label="الرمز" value={x.CourseCode} />
                      <MetaPill label="الوحدات" value={x.CourseCredit} />
                      <MetaPill label="الساعات" value={x.CourseHours} />
                    </>
                  }
                />
              ))}
            </RecordDeck>
          ) : (
            <EmptyState
              title="لا توجد مقررات مطابقة"
              detail="جرّب رمزاً آخر أو امسح عبارة البحث."
            />
          )}
          {filtered.length > visibleLimit ? (
            <div className="catalog-more">
              <SecondaryButton onClick={() => setVisibleLimit((v) => v + 160)}>
                عرض المزيد ·{" "}
                {(filtered.length - visibleLimit).toLocaleString("ar-KW-u-nu-latn")} متبقٍ
              </SecondaryButton>
            </div>
          ) : null}
        </Surface>
        <aside className="academic-inspector">
          {selected ? (
            <>
              <div className="academic-inspector-icon">
                <BookOpen />
              </div>
              <span className="surface-kicker">تفاصيل المقرر</span>
              <h2>{selected.CourseName}</h2>
              <p>
                {sec(selected.AdSectionId)} · {coll(selected.AdCollegeId)}
              </p>
              <div className="inspector-facts">
                <article>
                  <span>رمز المقرر</span>
                  <b>{selected.CourseCode}</b>
                </article>
                <article>
                  <span>الوحدات</span>
                  <b>{selected.CourseCredit}</b>
                </article>
                <article>
                  <span>الساعات</span>
                  <b>{selected.CourseHours}</b>
                </article>
                <article>
                  <span>السعة</span>
                  <b>{selected.MaxStudent || 0}</b>
                </article>
                <article>
                  <span>المعرّف</span>
                  <b>{selected.AdCourseId}</b>
                </article>
              </div>
              <div className="inspector-actions">
                <PrimaryButton onClick={() => edit(selected)}>
                  تعديل
                </PrimaryButton>
                <SecondaryButton
                  className="danger-action"
                  onClick={() => remove(selected.AdCourseId)}
                >
                  <Trash2 /> حذف
                </SecondaryButton>
              </div>
            </>
          ) : (
            <div className="master-empty">
              <BookOpen />
              <strong>اختر مقرراً</strong>
              <span>التفاصيل ستظهر هنا.</span>
            </div>
          )}
        </aside>
      </div>
      {editorDrawer}
    </div>
  );
}
