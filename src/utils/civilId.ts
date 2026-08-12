/**
 * Validate Kuwaiti Civil ID based on the legacy checksum algorithm.
 */
export function validateCivilId(civilId: string): { isValid: boolean; message?: string } {
  // Check if empty
  if (!civilId || civilId.trim() === "") {
    return { isValid: false, message: "الرجاء إدخال رقم مدني صحيح" };
  }

  // Check for Arabic-Indic digits (٠-٩) or letters/symbols
  if (/[٠-٩]/.test(civilId)) {
    return { isValid: false, message: "الرجاء كتابة الأرقام بالانجليزي" };
  }

  if (!/^\d+$/.test(civilId)) {
    return { isValid: false, message: "الرجاء كتابة الأرقام بالانجليزي" };
  }

  // Check length
  if (civilId.length !== 12) {
    return { isValid: false, message: "الرقم المدني المدخل لأستاذ المقرر غير صحيح وفقاً لبيانات البطاقة المدنية" };
  }

  const digits = civilId.split("").map(Number);
  const c1 = digits[0];
  const c2 = digits[1];
  const c3 = digits[2];
  const c4 = digits[3];
  const c5 = digits[4];
  const c6 = digits[5];
  const c7 = digits[6];
  const c8 = digits[7];
  const c9 = digits[8];
  const c10 = digits[9];
  const c11 = digits[10];
  const c12 = digits[11];

  const sum =
    c1 * 2 +
    c2 * 1 +
    c3 * 6 +
    c4 * 3 +
    c5 * 7 +
    c6 * 9 +
    c7 * 10 +
    c8 * 5 +
    c9 * 8 +
    c10 * 4 +
    c11 * 2;

  const expectedCheckDigit = 11 - (sum % 11);

  if (expectedCheckDigit !== c12) {
    return { isValid: false, message: "الرقم المدني المدخل لأستاذ المقرر غير صحيح وفقاً لبيانات البطاقة المدنية" };
  }

  return { isValid: true };
}

/**
 * Generate a valid synthetic 12-digit Kuwaiti Civil ID for testing and demo seed.
 */
export function generateSyntheticCivilId(): string {
  while (true) {
    const c = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10));
    const sum =
      c[0] * 2 +
      c[1] * 1 +
      c[2] * 6 +
      c[3] * 3 +
      c[4] * 7 +
      c[5] * 9 +
      c[6] * 10 +
      c[7] * 5 +
      c[8] * 8 +
      c[9] * 4 +
      c[10] * 2;

    const rem = sum % 11;
    const expectedCheckDigit = 11 - rem;

    if (expectedCheckDigit >= 0 && expectedCheckDigit <= 9) {
      return [...c, expectedCheckDigit].join("");
    }
  }
}
