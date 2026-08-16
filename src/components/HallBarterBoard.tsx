import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Building2,
  Check,
  ChevronDown,
  Clock3,
  History,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { GhostButton, PrimaryButton, SecondaryButton } from "./ui";

type Opportunity = {
  id: string;
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
};

export type HallBarterReservationView = {
  id: string;
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

type Board = {
  opportunities: Opportunity[];
  incoming: HallBarterReservationView[];
  outgoing: HallBarterReservationView[];
  memory: { terms: number; years: number; buildings: string[] };
};

const emptyBoard: Board = { opportunities: [], incoming: [], outgoing: [], memory: { terms: 0, years: 10, buildings: [] } };

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
  onReservationsChange,
}: {
  collegeId: number;
  sectionId: number;
  termId: number;
  liveSerial?: number;
  onReservationsChange?: (rows: HallBarterReservationView[]) => void;
}) {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
      const data = await readJson(`/api/hall-barter?${query}`);
      const incoming = Array.isArray(data?.incoming) ? data.incoming : [];
      const outgoing = Array.isArray(data?.outgoing) ? data.outgoing : [];
      setBoard({
        opportunities: Array.isArray(data?.opportunities) ? data.opportunities : [],
        incoming,
        outgoing,
        memory: data?.memory || emptyBoard.memory,
      });
      if (onReservationsChange) {
        const active = [...incoming, ...outgoing].filter((row: HallBarterReservationView) => row.status === "approved");
        onReservationsChange([...new Map(active.map((row: HallBarterReservationView) => [row.id, row])).values()] as HallBarterReservationView[]);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [collegeId, sectionId, termId, onReservationsChange]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!liveSerial) return;
    void load(true);
  }, [liveSerial, load]);

  const incomingPending = useMemo(() => board.incoming.filter(row => row.status === "pending"), [board.incoming]);
  const outgoingPending = useMemo(() => board.outgoing.filter(row => row.status === "pending"), [board.outgoing]);
  const approved = useMemo(() => {
    const rows = [...board.incoming, ...board.outgoing].filter(row => row.status === "approved");
    return [...new Map(rows.map(row => [row.id, row])).values()];
  }, [board.incoming, board.outgoing]);

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
    <span className="hall-barter-window"><Clock3 aria-hidden="true" /><b>{row.dayLabel}</b><time dir="ltr">{row.startTime}–{row.endTime}</time><em dir="ltr">{row.roomCode}/{row.roomHall}</em></span>
  );

  return (
    <section className={`hall-barter-board ${open ? "is-open" : ""}`} aria-label="بورصة القاعات الساكنة بين الكليات">
      <button type="button" className="hall-barter-summary" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <span className="hall-barter-mark"><Building2 aria-hidden="true" /><ArrowLeftRight aria-hidden="true" /></span>
        <span className="hall-barter-summary-copy">
          <small>بين الكليات · موافقة رقمية</small>
          <strong>بورصة القاعات الساكنة</strong>
          <em>تتعلم من آخر عشر سنوات، ولا تعرض إلا نافذة متكررة الفراغ ومجانية الآن.</em>
        </span>
        <span className="hall-barter-summary-stats">
          <b><i>{board.opportunities.length}</i> فرصة</b>
          {incomingPending.length ? <b className="needs-action"><i>{incomingPending.length}</i> بانتظارك</b> : null}
          {approved.length ? <b className="approved"><i>{approved.length}</i> معتمدة</b> : null}
        </span>
        <ChevronDown className="hall-barter-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className="hall-barter-body">
          <div className="hall-barter-guard">
            <ShieldCheck aria-hidden="true" />
            <div><strong>الاستعارة تحجز نافذة القاعة فقط</strong><span>لا ينشئ النظام محاضرة وهمية ولا يغيّر مقررًا. بعد الموافقة يظل إنشاء الموعد الحقيقي عبر محرر الجدول المعتاد، مع فحص التضارب نفسه.</span></div>
            <GhostButton type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} />تحديث</GhostButton>
          </div>
          <div className="hall-barter-memory">
            <History aria-hidden="true" />
            <span>ذاكرة {board.memory.years || 10} سنوات</span>
            <b>{board.memory.terms || 0} فصلًا تاريخيًا</b>
            <em>{board.memory.buildings?.length ? `داخل مباني قسمك: ${board.memory.buildings.join(" · ")}` : "لا يوجد مبنى تاريخي كافٍ لهذا القسم بعد"}</em>
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
                      <strong>{row.requesterSectionName}</strong><small>{row.requesterCollegeName}</small>
                      {windowLine(row)}
                    </div>
                    <div className="hall-barter-confidence"><b>{row.confidence}%</b><span>ثبات الفراغ</span><small>{row.historyTerms} فصول</small></div>
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
                      <div><small>{borrowing ? "مستعارة لقسمك من" : "معارة إلى"}</small><strong>{borrowing ? row.ownerSectionName : row.requesterSectionName}</strong><em>{borrowing ? row.ownerCollegeName : row.requesterCollegeName}</em></div>
                      {windowLine(row)}
                      {borrowing ? <GhostButton type="button" disabled={busyId === row.id} onClick={() => void cancel(row.id)}>إلغاء الاستعارة</GhostButton> : <span className="hall-barter-approved-label"><Check />معتمدة</span>}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="hall-barter-section opportunities">
            <header><div><small>ساكنة تاريخيًا وفارغة الآن</small><strong>نوافذ يمكن طلبها بنقرة واحدة</strong></div><b>{board.opportunities.length}</b></header>
            {board.opportunities.length ? (
              <div className="hall-barter-opportunity-grid">
                {board.opportunities.map(opportunity => (
                  <article key={opportunity.id}>
                    <div className="hall-barter-room"><Building2 /><strong dir="ltr">{opportunity.roomCode}/{opportunity.roomHall}</strong><small>{opportunity.ownerSectionName}</small><em>{opportunity.ownerCollegeName}</em></div>
                    <div className="hall-barter-slot"><span>{opportunity.dayLabel}</span><time dir="ltr">{opportunity.startTime}–{opportunity.endTime}</time><small>{Math.round(opportunity.durationMinutes / 30) * 30} دقيقة متصلة</small></div>
                    <div className="hall-barter-confidence"><b>{opportunity.confidence}%</b><span>ثبات الفراغ</span><small>{opportunity.historyTerms} فصول · ملكية تاريخية {opportunity.ownerShare}%</small></div>
                    <PrimaryButton type="button" disabled={busyId === opportunity.id} onClick={() => void request(opportunity)}><ArrowLeftRight />اطلب استعارة النطاق</PrimaryButton>
                  </article>
                ))}
              </div>
            ) : (
              <div className="hall-barter-empty">لا توجد نافذة تحقق معايير الاستقرار والفراغ الحالي داخل مباني قسمك الآن. لن يعرض النظام فرصة لمجرد أن القاعة فارغة مرة واحدة.</div>
            )}
          </div>

          {outgoingPending.length ? (
            <div className="hall-barter-section outgoing">
              <header><div><small>أُرسلت ولم تُحسم</small><strong>طلبات قسمك</strong></div><b>{outgoingPending.length}</b></header>
              <div className="hall-barter-pending-row">
                {outgoingPending.map(row => (
                  <article key={row.id}>
                    <div><strong>{row.ownerSectionName}</strong><small>{row.ownerCollegeName}</small></div>
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
