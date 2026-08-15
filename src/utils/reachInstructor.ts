import type { AdInstructor } from "../types";

/**
 * ── كيف نصل إلى الأستاذ ─────────────────────────────────────────────────────
 *
 * The question was: we only have a civil ID, so how could a notification ever
 * reach anyone? The answer is that the civil ID is not all we have — every
 * instructor record carries `AdInstructorMobile`, and it has all along.
 *
 * That changes the problem from an impossible one to a solved one, because the
 * missing thing was never the address. It was the *infrastructure*: a push
 * service needs a registered app, a device token, a subscription store and a
 * background sender, and an SMS gateway needs a contract and a per-message
 * cost. Both are large, and neither is needed.
 *
 * A phone number plus a link is a channel. `https://wa.me/<msisdn>?text=…`
 * opens a conversation with that number, already written, on the coordinator's
 * own phone or desktop, and they press send. No API key, no gateway, no
 * subscription, no per-message cost, nothing to keep alive, and nothing stored
 * about anyone. The department was already doing exactly this by hand; this
 * removes the forty presses, not the human.
 *
 * The honest shape of it:
 *   - It is **pull, then nudge**. The card is the source of truth and updates
 *     itself; the message is a tap on the shoulder that says go and look.
 *   - It is **initiated by a person**, never by the system. Nothing here can
 *     message anybody on its own, which is the property that makes it safe.
 *   - It **carries no schedule detail into the message body** beyond one line,
 *     because a message is forwarded and a link is not a document.
 *
 * What this deliberately is NOT: a notification system. There is no delivery
 * receipt, no read state, no retry, and no promise that anyone saw anything.
 * Claiming otherwise would be the dangerous version of this feature.
 */

/** Kuwait's country code. Local numbers are stored without it. */
const COUNTRY = "965";

/**
 * A stored mobile in the form WhatsApp accepts: digits only, country code
 * included, no plus sign.
 *
 * Returns null when the number cannot be trusted — an empty field, a landline
 * fragment, a note somebody typed into the wrong box. A wrong number opens a
 * conversation with a stranger, so the bar is deliberately high and silence is
 * the correct answer when it is not met.
 */
export function whatsappNumber(raw: string | undefined | null): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  // Already carries the country code.
  if (digits.length === 11 && digits.startsWith(COUNTRY)) return digits;
  // A local Kuwaiti mobile: eight digits beginning 5, 6 or 9.
  if (digits.length === 8 && /^[569]/.test(digits)) return COUNTRY + digits;
  // An international number written in full, with or without a leading zero.
  if (digits.length >= 11 && digits.length <= 15) return digits.replace(/^0+/, "");
  return null;
}

export interface ReachMessage {
  /** The address to open. Null when there is no usable number. */
  href: string | null;
  /** Why not, when there is no address — shown instead of a dead button. */
  blocked: string | null;
  /** The message itself, so it can be shown before it is sent. */
  text: string;
}

/**
 * The message a coordinator sends an instructor about their own card.
 *
 * Written to be read on a lock screen: who it is from, what it is, and the
 * link. No lecture times in the body — the card holds those, it is always
 * current, and a message that repeats them is wrong the moment anything moves.
 */
export function reachAboutCard(
  person: Pick<AdInstructor, "AdInstructorName" | "AdInstructorMobile">,
  cardUrl: string,
  occasion?: "new" | "changed" | "reminder",
): ReachMessage {
  const number = whatsappNumber(person.AdInstructorMobile);
  const name = String(person.AdInstructorName || "").trim();
  const greeting = name ? `${name}،` : "";
  const line =
    occasion === "changed" ? "طرأ تعديل على جدولك."
    : occasion === "reminder" ? "تذكير بجدولك لهذا الفصل."
    : "هذه بطاقة جدولك الدراسي.";
  const text = [
    greeting,
    line,
    cardUrl,
    "الرابط للقراءة فقط ويُحدَّث من نفسه — احفظه ولا حاجة لطلبه مرة أخرى.",
  ].filter(Boolean).join("\n");

  return {
    href: number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null,
    blocked: number ? null : "لا يوجد رقم جوّال صالح في سجل هذا الأستاذ.",
    text,
  };
}

/**
 * Who cannot be reached at all.
 *
 * Quietly the most useful thing this module produces. A department that has
 * been phoning people for years has no idea which records are missing a number
 * until something tries to use them — and that is exactly the list that has to
 * be fixed before any of this is worth anything.
 */
export function unreachable(people: AdInstructor[]): AdInstructor[] {
  return people.filter(person => !whatsappNumber(person.AdInstructorMobile));
}
