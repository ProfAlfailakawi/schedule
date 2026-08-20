import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Sparkles, Trash2 } from "lucide-react";
import { isTermClosed, sortTermsNewest, suggestNextTermName } from "../utils/termSequence";
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
/** `embedded` means the academic console already supplies the page identity. */
export default function Terms({ embedded = false, actionSlot = null }: { embedded?: boolean; actionSlot?: HTMLElement | null }) {
  const [items, setItems] = useState<any[]>([]),
    [mode, setMode] = useState<Mode>("index"),
    [editId, setEditId] = useState<number | null>(null),
    [selectedId, setSelectedId] = useState<number | null>(null),
    [name, setName] = useState(""),
    [query, setQuery] = useState(""),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false);
  // The list is sorted chronologically from newest to oldest.
  const suggestedTerm = useMemo(() => suggestNextTermName(items[0]?.AdTermName), [items]);
  /* When teaching begins, and for how long. Both optional — a decade of terms
     exists with neither — but without them the subscribable calendar has to
     guess its own semester, and a guess that is re-read forever drifts. */
  const [start, setStart] = useState("");
  const [weeks, setWeeks] = useState("");
  /* Whether teaching in this term is over. Room borrowing between departments
     is meaningless once it is, so the schedule screen reads this mark. */
  const [closed, setClosed] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/terms");
      if (!r.ok) throw 0;
      const data = sortTermsNewest(await r.json());
      setItems(data);
      setSelectedId((v) =>
        v && data.some((x: any) => x.AdTermId === v)
          ? v
          : data[0]?.AdTermId || null,
      );
    } catch {
      setError("فشل تحميل بيانات الفصل الدراسي");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const back = () => {
      setMode("index");
      setError(null);
    },
    create = () => {
      setEditId(null);
      // Note 29: pre-fill the next term in sequence so the common case is one click.
      setName(suggestedTerm);
      setStart(""); setWeeks("16"); setClosed(false);
      setMode("create");
      setError(null);
    },
    edit = (x: any) => {
      setEditId(x.AdTermId);
      setName(x.AdTermName);
      setStart(x.AdTermStart || ""); setWeeks(String(x.AdTermWeeks || ""));
      /* Show the mark that is actually in force, including the one inferred for
         the ten years of terms that pre-date the field, so saving makes the
         state explicit instead of quietly re-opening an old term. */
      setClosed(isTermClosed(x, items));
      setMode("edit");
      setError(null);
    };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    const r = await fetch(
        mode === "edit" ? `/api/terms/${editId}` : "/api/terms",
        {
          method: mode === "edit" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ AdTermName: name.trim(),
            AdTermStart: start || undefined, AdTermWeeks: Number(weeks) || undefined,
            AdTermClosed: closed }),
        },
      ),
      d = await r.json();
    if (!r.ok) {
      setError(d.error || "فشل حفظ بيانات الفصل الدراسي");
      return;
    }
    await load();
    back();
  };
  const remove = async (id: number) => {
    if (!(await visualConfirm({ title: "حذف الفصل الدراسي", message: "سيُحذف سجل الفصل الدراسي من النظام.", confirmLabel: "حذف", tone: "danger", compact: true }))) return;
    const r = await fetch(`/api/terms/${id}`, { method: "DELETE" }),
      d = await r.json();
    if (!r.ok) {
      setError(d.error || "فشل حذف بيانات الفصل الدراسي");
      return;
    }
    setSelectedId(null);
    await load();
  };
  const filtered = useMemo(
      () =>
        query.trim()
          ? items.filter((x) => String(x.AdTermName).includes(query.trim()))
          : items,
      [items, query],
    ),
    selected =
      filtered.find((x) => x.AdTermId === selectedId) || filtered[0] || null,
    activeId = selected?.AdTermId ?? null;
  const editorDrawer = mode !== "index" ? (
      <CatalogFormDrawer onClose={back} label={mode === "create" ? "إنشاء فصل جديد" : "تعديل بيانات الفصل"}>
        <PageTitle
          eyebrow="البيانات الأكاديمية"
          subtitle="يظهر في الجداول والتقارير"
        >
          {mode === "create" ? "إنشاء فصل دراسي جديد" : "تعديل الفصل الدراسي"}
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="form-card smart-form">
          <div className="form-intro">
            <span>
              <CalendarDays />
            </span>
            <div>
              <strong>الفصل الدراسي</strong>
              <p>تسمية واضحة للفرز والنسخ</p>
            </div>
          </div>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="الفصل الدراسي" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="الفصل الدراسي"
                  autoComplete="off"
                  autoFocus
                  required
                />
              </Field>
              <Field label="بداية التدريس">
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  aria-label="تاريخ بداية التدريس"
                />
              </Field>
              <Field label="عدد الأسابيع">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value)}
                  aria-label="عدد أسابيع الفصل"
                  inputMode="numeric"
                />
              </Field>
            </div>
            <label className="term-closed-toggle">
              <input
                type="checkbox"
                checked={closed}
                onChange={(e) => setClosed(e.target.checked)}
                aria-label="انتهى هذا الفصل الدراسي"
              />
              <span>
                <strong>انتهى هذا الفصل الدراسي</strong>
                <small>تُخفى أدوات استعارة القاعات بين الأقسام، فلا معنى لاستعارة قاعة في فصل انتهى. الجدول نفسه يبقى كما هو للقراءة والتقارير.</small>
              </span>
            </label>
            <p className="smart-term-hint">
              {start
                ? "التقويم المُشترَك سيبدأ وينتهي بهذين التاريخين بالضبط."
                : "بدون تاريخ بداية، التقويم المُشترَك يقدّر الفصل — ويعلن ذلك للمشترك."}
            </p>
            {mode === "create" && suggestedTerm && name === suggestedTerm ? (
              <p className="smart-term-hint">
                <Sparkles aria-hidden="true" />
                اقتُرح تلقائياً بعد «{items[0]?.AdTermName}» — عدّله إن رغبت.
              </p>
            ) : null}
            <FormActions
              onBack={back}
              loading={loading}
              submitLabel={mode === "create" ? "إنشاء الفصل" : "حفظ التعديلات"}
            />
          </form>
        </Surface>
      </CatalogFormDrawer>
    ) : null;
  return (
    <div className={`content-stack library-page catalog-inspector-page visual-minimal ${embedded ? "embedded-catalog" : ""}`}>
      {embedded ? (
        <EmbeddedAction slot={actionSlot}>
          <AddButton onClick={create}>إنشاء فصل</AddButton>
        </EmbeddedAction>
      ) : (
        <PageTitle
          eyebrow="الخط الزمني الأكاديمي"
          subtitle="المكتبة والتفاصيل في لوحة واحدة"
          action={<AddButton onClick={create}>إنشاء فصل</AddButton>}
        >
          الفصول الدراسية
        </PageTitle>
      )}
      {error ? <Notice>{error}</Notice> : null}
      <div className="catalog-workspace" aria-busy={loading}>
        <Surface className="catalog-master">
          <h2 className="sr-only">قائمة الفصول الدراسية</h2>
          <ListToolbar
            value={query}
            onChange={setQuery}
            count={filtered.length}
            placeholder="ابحث عن فصل دراسي"
          />
          {loading ? (
            <SkeletonDeck />
          ) : filtered.length ? (
            <RecordDeck className="term-deck">
              {filtered.map((x, i) => (
                <RecordCard
                  key={x.AdTermId}
                  onClick={() => setSelectedId(x.AdTermId)}
                  className={activeId === x.AdTermId ? "selected" : ""}
                  icon={<CalendarDays />}
                  title={(
                    <>
                      {x.AdTermName}
                      {activeId === x.AdTermId ? <span className="sr-only">، محدد</span> : null}
                    </>
                  )}
                  subtitle={isTermClosed(x, items) ? "فصل منتهٍ · للقراءة والتقارير" : "الفصل الجاري · مرجع الجداول"}
                  meta={<MetaPill label="الحالة" value={isTermClosed(x, items) ? "منتهٍ" : "جارٍ"} />}
                />
              ))}
            </RecordDeck>
          ) : (
            <EmptyState
              title={query ? "لا يوجد فصل مطابق" : "لا توجد فصول دراسية بعد"}
              detail={query ? "جرّب عبارة أخرى أو امسح البحث." : "أنشئ الفصل الأول ليظهر في الجداول والتقارير."}
              action={query ? <SecondaryButton onClick={() => setQuery("")}>مسح البحث</SecondaryButton> : undefined}
            />
          )}
        </Surface>
        <aside className="academic-inspector" aria-label="تفاصيل الفصل المحدد" aria-live="polite">
          {selected ? (
            <>
              <div className="academic-inspector-icon">
                <CalendarDays />
              </div>
              <span className="surface-kicker">تفاصيل الفصل</span>
              <h2>{selected.AdTermName}</h2>
              <p>مرجع الجداول والنسخ.</p>
              <div className="inspector-facts">
                <article>
                  <span>المعرّف</span>
                  <b>{selected.AdTermId}</b>
                </article>
              </div>
              <div className="inspector-actions">
                <PrimaryButton onClick={() => edit(selected)}>
                  تعديل
                </PrimaryButton>
                <SecondaryButton
                  data-guide-ignore="إجراء حذف حساس داخل شاشة الإدارة ويستخدم تأكيد الشاشة نفسه"
                  className="danger-action"
                  onClick={() => remove(selected.AdTermId)}
                >
                  <Trash2 /> حذف
                </SecondaryButton>
              </div>
            </>
          ) : (
            <div className="master-empty">
              <CalendarDays />
              <strong>اختر فصلاً</strong>
              <span>التفاصيل ستظهر هنا.</span>
            </div>
          )}
        </aside>
      </div>
      {editorDrawer}
    </div>
  );
}
