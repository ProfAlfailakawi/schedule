import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Building2,
  Check,
  ChevronDown,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { GhostButton, PrimaryButton, SecondaryButton } from "./ui";
import { formatScheduleTimeRange } from "../utils/scheduleTime";

type Opportunity = {
  id: string;
  buildingId?: string;
  roomId?: string;
  roomCode: string;
  roomHall: string;
  building: string;
  day: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  confidence: number;
  historyTerms: number;
  ownerShare: number;
  ownerCollegeId: number;
  ownerSectionId: number;
  ownerCollegeName: string;
  ownerSectionName: string;
  ownerSections?: Array<{ id: number; name: string }>;
  shared?: boolean;
};

export type HallBarterReservationView = {
  id: string;
  buildingId?: string;
  roomId?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  day: "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";
  roomCode: string;
  roomHall: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  confidence: number;
  historyTerms: number;
  requesterSectionName: string;
  requesterCollegeName: string;
  ownerSectionName: string;
  ownerCollegeName: string;
  requesterCollegeId: number;
  requesterSectionId: number;
  ownerCollegeId: number;
  ownerSectionId: number;
  createdAt: string;
};

type Facets = {
  owners: Array<{ id: number; name: string; count: number }>;
  days: Array<{ key: string; label: string; count: number }>;
  buildings: Array<{ code: string; count: number }>;
};

type Board = {
  opportunities: Opportunity[];
  incoming: HallBarterReservationView[];
  outgoing: HallBarterReservationView[];
  /** المرشِّحات تُبنى من هذه، لا من الصفحة المعروضة: القائمة قد تكون مقصوصة. */
  facets: Facets;
  total: number;
  truncated: boolean;
};

const emptyFacets: Facets = { owners: [], days: [], buildings: [] };
const emptyBoard: Board = { opportunities: [], incoming: [], outgoing: [], facets: emptyFacets, total: 0, truncated: false };

async function readJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "include", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || "تعذر إكمال العملية");
  return body;
}

const statusLabel = (status: HallBarterReservationView["status"]) =>
  status === "approved" ? "معتمدة" : status === "pending" ? "بانتظار الموافقة" : status === "rejected" ? "مرفوضة" : "ملغاة";

export default function HallBarterBoard({
  collegeId,
  sectionId,
  termId,
  liveSerial = 0,
  openSignal = 0,
  onReservationsChange,
  onPendingChange,
}: {
  collegeId: number;
  sectionId: number;
  termId: number;
  liveSerial?: number;
  /** يُزاد من الخارج ليُفتح اللوح على الطلبات المنتظرة. */
  openSignal?: number;
  onReservationsChange?: (rows: HallBarterReservationView[]) => void;
  onPendingChange?: (count: number) => void;
}) {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const boardRef = useRef<HTMLElement | null>(null);
  /* بحثٌ واحد يقبل القسم والمبنى ورمز القاعة، ورقاقات الأقسام تختصر الطريق:
     القائمة صارت كل قاعات الكلية، ومن غير مرشِّح تصير كشفاً لا يُقرأ. */
  /* ── أربعة مرشِّحات في سطر، لا صفٌّ من الرقاقات ──────────────────────────
     صفُّ رقاقاتٍ بعدد أقسام الكلية يملأ الشاشة قبل أن تبدأ القراءة. أربع
     قوائم مضغوطة تحمل العدد نفسه في سطر واحد هادئ، ولا تظهر منها قائمة إلا
     إن كان فيها أكثر من خيار واحد. */
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState(0);
  const [dayFilter, setDayFilter] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!collegeId || !sectionId || !termId) { setBoard(emptyBoard); return; }
    if (!quiet) {
      setLoading(true);
      setBoard(emptyBoard);
      onReservationsChange?.([]);
    }
    setError("");
    try {
      const query = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId) });
      /* التضييق يُسأل عنه الخادم: القسم المختار يريد نوافذه كلها، لا حصته من
         الصفحة الأولى. */
      if (ownerFilter) query.set("ownerSectionId", String(ownerFilter));
      if (dayFilter) query.set("day", dayFilter);
      if (buildingFilter) query.set("buildingCode", buildingFilter);
      const data = await readJson(`/api/hall-barter?${query}`);
      const incoming = Array.isArray(data?.incoming) ? data.incoming : [];
      const outgoing = Array.isArray(data?.outgoing) ? data.outgoing : [];
      setBoard({
        opportunities: Array.isArray(data?.opportunities) ? data.opportunities : [],
        incoming,
        outgoing,
        facets: {
          owners: Array.isArray(data?.facets?.owners) ? data.facets.owners : [],
          days: Array.isArray(data?.facets?.days) ? data.facets.days : [],
          buildings: Array.isArray(data?.facets?.buildings) ? data.facets.buildings : [],
        },
        total: Number(data?.total || 0),
        truncated: Boolean(data?.truncated),
      });
      onPendingChange?.(incoming.filter((row: HallBarterReservationView) => row.status === "pending").length);
      if (onReservationsChange) {
        const active = [...incoming, ...outgoing].filter((row: HallBarterReservationView) => row.status === "approved");
        onReservationsChange([...new Map(active.map((row: HallBarterReservationView) => [row.id, row])).values()] as HallBarterReservationView[]);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [collegeId, sectionId, termId, ownerFilter, dayFilter, buildingFilter, onReservationsChange, onPendingChange]);

  useEffect(() => { void load(); }, [load]);
  /* نداءٌ من خارج اللوحة: افتحها — جاء من شريط «طلبات تنتظر قرارك». */
  const openSignalSeen = useRef(openSignal);
  useEffect(() => {
    if (openSignal === openSignalSeen.current) return;
    openSignalSeen.current = openSignal;
    setOpen(true);
    void load(true);
  }, [openSignal, load]);
  useEffect(() => {
    if (!liveSerial) return;
    void load(true);
  }, [liveSerial, load]);

  /* Open, this board is a full-screen destination. Say so on the document so the
     floating dock and the guide step aside, exactly as they do for the journey —
     otherwise they float in the middle of the sheet. */
  useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.barterOpen = "true";
    return () => { delete document.documentElement.dataset.barterOpen; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    /* ── قائمةُ المتصفح ليست «خارج الشاشة» ──────────────────────────────────
     * الشاشة كانت تُغلق عند أي ضغطة خارج إطارها. وقائمة `select` المنسدلة
     * يرسمها النظام خارج شجرة الصفحة، فاختيار المبنى بعد القسم كان يُقرأ
     * ضغطةً خارجية فتُطوى الشاشة كلها ويضيع ما اختير.
     * والشاشة ممتدة على المتصفح كله ولها زر إغلاق ومفتاح Escape، فلا معنى
     * لإغلاقها بالضغط «خارجها» إلا في موضع واحد: فراغُ الإطار نفسه. */
    const dismiss = (event: PointerEvent) => {
      if (event.target !== boardRef.current) return;
      setOpen(false);
    };
    const dismissByKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", dismissByKey);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", dismissByKey);
    };
  }, [open]);

  const incomingPending = useMemo(() => board.incoming.filter(row => row.status === "pending"), [board.incoming]);
  const outgoingPending = useMemo(() => board.outgoing.filter(row => row.status === "pending"), [board.outgoing]);
  const approved = useMemo(() => {
    const rows = [...board.incoming, ...board.outgoing].filter(row => row.status === "approved");
    return [...new Map(rows.map(row => [row.id, row])).values()];
  }, [board.incoming, board.outgoing]);

  const ownersOf = (item: Opportunity) => item.ownerSections?.length
    ? item.ownerSections
    : [{ id: item.ownerSectionId, name: item.ownerSectionName }];

  const owners = board.facets.owners;
  const days = board.facets.days;
  const buildings = board.facets.buildings;

  const filtersActive = Boolean(query.trim() || ownerFilter || dayFilter || buildingFilter);
  const clearFilters = () => { setQuery(""); setOwnerFilter(0); setDayFilter(""); setBuildingFilter(""); };

  const visibleOpportunities = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return board.opportunities;
    /* القسم واليوم والمبنى صفّاها الخادم؛ ولا يبقى هنا إلا البحث الحر. */
    return board.opportunities.filter(item =>
      [...ownersOf(item).map(owner => owner.name), item.roomCode, item.roomHall, `${item.roomCode}/${item.roomHall}`, item.dayLabel]
        .some(field => String(field || "").toLocaleLowerCase().includes(needle)));
  }, [board.opportunities, query]);

  const act = async (id: string, work: () => Promise<any>) => {
    setBusyId(id); setError(""); setMessage("");
    try {
      const result = await work();
      setMessage(result?.message || "تمت العملية");
      await load(true);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusyId("");
    }
  };

  const request = (opportunity: Opportunity) => act(opportunity.id, () => readJson("/api/hall-barter/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collegeId, sectionId, termId, opportunityId: opportunity.id }),
  }));
  const respond = (requestId: string, decision: "approve" | "reject") => act(requestId, () => readJson(`/api/hall-barter/requests/${encodeURIComponent(requestId)}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  }));
  const cancel = (requestId: string) => act(requestId, () => readJson(`/api/hall-barter/requests/${encodeURIComponent(requestId)}/cancel`, { method: "POST" }));

  const windowLine = (row: Pick<HallBarterReservationView, "dayLabel" | "startTime" | "endTime" | "roomCode" | "roomHall">) => (
    <span className="hall-barter-window"><Clock3 aria-hidden="true" /><b>{row.dayLabel}</b><time dir="ltr">{formatScheduleTimeRange(row.startTime, row.endTime)}</time><em dir="ltr">{row.roomCode}/{row.roomHall}</em></span>
  );

  /* ── لا أيقونة لبابٍ لا يُفتح ────────────────────────────────────────────
     لوحةٌ عنوانها «٠ فرصة» تشغل مكاناً وتعِد بشيء لا تملكه. فمتى لم تكن هناك
     نافذة تُطلب ولا طلبٌ قائم ولا استعارة سارية، لا تظهر أصلاً. */
  const hasAnything = board.opportunities.length > 0 || incomingPending.length > 0 || outgoingPending.length > 0 || approved.length > 0;
  if (!hasAnything && !loading && !error) return null;

  return (
    <section ref={boardRef} className={`hall-barter-board visual-minimal ${open ? "is-open" : ""}`} aria-label="استعارة القاعات بين الأقسام">
      {open ? <button type="button" className="hall-barter-screen-close" onClick={() => setOpen(false)} aria-label="إغلاق استعارة القاعات" title="إغلاق استعارة القاعات" data-guide-ignore="زر إغلاق شاشة استعارة القاعات فقط؛ لا ينفذ ميزة تشغيلية ولا يحتاج خطوة إرشادية مستقلة"><X aria-hidden="true" /></button> : null}
      <button type="button" className="hall-barter-summary" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <span className="hall-barter-mark"><Building2 aria-hidden="true" /><ArrowLeftRight aria-hidden="true" /></span>
        <span className="hall-barter-summary-copy">
          <small>داخل الكلية · موافقة رقمية · لهذا الفصل وحده</small>
          <strong>{open ? "استعارة القاعات بين الأقسام" : "استعارة قاعة"}</strong>
          <em>كل قاعة فارغة في الكلية بحسب جدول هذا الفصل، بنافذتها وساعتها.</em>
        </span>
        <span className="hall-barter-summary-stats">
          <b><i>{board.opportunities.length}</i> نافذة</b>
          {incomingPending.length ? <b className="needs-action"><i>{incomingPending.length}</i> بانتظارك</b> : null}
          {approved.length ? <b className="approved"><i>{approved.length}</i> معتمدة</b> : null}
        </span>
        <ChevronDown className="hall-barter-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className="hall-barter-body">
          <div className="hall-barter-guard">
            <ShieldCheck aria-hidden="true" />
            <div><strong>الاستعارة تحجز نافذة القاعة فقط، ولهذا الفصل وحده</strong><span>لا ينشئ النظام محاضرة وهمية ولا يغيّر مقررًا، ولا ينتقل الإذن إلى فصل قادم. والاستعارة تفصل البنين والبنات بالكامل، وبعد الموافقة يظل إنشاء الموعد الحقيقي عبر محرر الجدول المعتاد مع فحص التضارب نفسه.</span></div>
            <GhostButton type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} />تحديث</GhostButton>
          </div>
          {message ? <div className="hall-barter-message ok">{message}</div> : null}
          {error ? <div className="hall-barter-message error">{error}</div> : null}

          {incomingPending.length ? (
            <div className="hall-barter-section incoming">
              <header><div><small>تحتاج قرارك</small><strong>طلبات وصلت لقاعاتك</strong></div><b>{incomingPending.length}</b></header>
              <div className="hall-barter-request-list">
                {incomingPending.map(row => (
                  <article key={row.id}>
                    <div className="hall-barter-request-main">
                      <strong>{row.requesterSectionName}</strong>
                      {windowLine(row)}
                    </div>
                    <div className="hall-barter-actions">
                      <PrimaryButton type="button" disabled={busyId === row.id} onClick={() => void respond(row.id, "approve")}><Check />موافقة</PrimaryButton>
                      <SecondaryButton type="button" disabled={busyId === row.id} onClick={() => void respond(row.id, "reject")}><X />رفض</SecondaryButton>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {approved.length ? (
            <div className="hall-barter-section approved-list">
              <header><div><small>سارية الآن</small><strong>نوافذ استعارة معتمدة</strong></div><b>{approved.length}</b></header>
              <div className="hall-barter-active-grid">
                {approved.map(row => {
                  const borrowing = row.requesterCollegeId === collegeId && row.requesterSectionId === sectionId;
                  return (
                    <article key={row.id}>
                      <span className="hall-barter-status-dot" />
                      <div><small>{borrowing ? "مستعارة لقسمك من" : "معارة إلى"}</small><strong>{borrowing ? row.ownerSectionName : row.requesterSectionName}</strong></div>
                      {windowLine(row)}
                      {borrowing ? <GhostButton type="button" disabled={busyId === row.id} onClick={() => void cancel(row.id)}>إلغاء الاستعارة</GhostButton> : <span className="hall-barter-approved-label"><Check />معتمدة</span>}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="hall-barter-section opportunities">
            <header><div><small>فارغة في جدول هذا الفصل</small><strong>نوافذ يمكن طلبها بنقرة واحدة</strong></div><b>{visibleOpportunities.length}</b></header>
            {board.opportunities.length ? (
              <div className="hall-barter-filters">
                <label className="hall-barter-search">
                  <Search aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="ابحث بالقسم أو المبنى أو رمز القاعة"
                    aria-label="بحث في نوافذ الاستعارة"
                    data-guide-ignore="حقل بحث داخل شاشة استعارة القاعات؛ يصفّي المعروض ولا ينفذ عملية"
                  />
                </label>
                <div className="hall-barter-selects">
                  {days.length > 1 ? (
                    <select aria-label="تصفية باليوم" value={dayFilter} onChange={event => setDayFilter(event.target.value)}>
                      <option value="">كل الأيام</option>
                      {days.map(day => <option key={day.key} value={day.key}>{day.label} ({day.count})</option>)}
                    </select>
                  ) : null}
                  {buildings.length > 1 ? (
                    <select aria-label="تصفية بالمبنى" value={buildingFilter} onChange={event => setBuildingFilter(event.target.value)}>
                      <option value="">كل المباني</option>
                      {buildings.map(building => <option key={building.code} value={building.code}>{building.code} ({building.count})</option>)}
                    </select>
                  ) : null}
                  {owners.length > 1 ? (
                    <select aria-label="تصفية بالقسم" value={ownerFilter || ""} onChange={event => setOwnerFilter(Number(event.target.value) || 0)}>
                      <option value="">كل الأقسام</option>
                      {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name} ({owner.count})</option>)}
                    </select>
                  ) : null}
                  {filtersActive ? (
                    <button type="button" className="hall-barter-clear" onClick={clearFilters} data-guide-ignore="مسح مرشِّحات شاشة استعارة القاعات">مسح</button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {board.truncated ? (
              <p className="hall-barter-truncated">عُرضت {visibleOpportunities.length} من {board.total} نافذة — من كل قسم نصيبٌ منها. اختر قسماً أو يوماً أو مبنى لترى نوافذه كاملة.</p>
            ) : null}
            {visibleOpportunities.length ? (
              <div className="hall-barter-opportunity-grid">
                {visibleOpportunities.map(opportunity => (
                  <article key={opportunity.id}>
                    <div className="hall-barter-room"><Building2 /><strong dir="ltr">{opportunity.roomCode}/{opportunity.roomHall}</strong><small>{ownersOf(opportunity).map(owner => owner.name).join(" · ")}</small></div>
                    <div className="hall-barter-opportunity-meta">
                      <div className="hall-barter-slot"><span>{opportunity.dayLabel}</span><time dir="ltr">{formatScheduleTimeRange(opportunity.startTime, opportunity.endTime)}</time><small>دقيقة {opportunity.durationMinutes}</small></div>
                    </div>
                    <PrimaryButton type="button" disabled={busyId === opportunity.id} onClick={() => void request(opportunity)}><ArrowLeftRight />اطلب استعارة النطاق</PrimaryButton>
                  </article>
                ))}
              </div>
            ) : (
              <div className="hall-barter-empty">{board.opportunities.length ? "لا نافذة تطابق بحثك. امسح البحث أو اختر «كل الأقسام»." : "لا توجد قاعة فارغة في الكلية ضمن جدول هذا الفصل الآن."}</div>
            )}
          </div>

          {outgoingPending.length ? (
            <div className="hall-barter-section outgoing">
              <header><div><small>أُرسلت ولم تُحسم</small><strong>طلبات قسمك</strong></div><b>{outgoingPending.length}</b></header>
              <div className="hall-barter-pending-row">
                {outgoingPending.map(row => (
                  <article key={row.id}>
                    <div><strong>{row.ownerSectionName}</strong></div>
                    {windowLine(row)}
                    <span className="hall-barter-pending-label">{statusLabel(row.status)}</span>
                    <GhostButton type="button" disabled={busyId === row.id} onClick={() => void cancel(row.id)}>إلغاء الطلب</GhostButton>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

        </div>
      ) : null}
    </section>
  );
}
