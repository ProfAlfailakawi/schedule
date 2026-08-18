/**
 * One numeric alphabet for the entire product.
 *
 * Users may type Arabic-Indic (٠١٢٣...) or Persian (۰۱۲۳...) digits on any
 * keyboard. Internally we always store ASCII digits (0123...), because HTML
 * number/time controls, API comparisons, room codes and civil-id validation all
 * use that alphabet. Converting at the edge makes the UI forgiving without
 * changing any business rule.
 */
export const toEnglishDigits = (value: unknown): string =>
  String(value ?? "")
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

export const digitsOnly = (value: unknown): string =>
  toEnglishDigits(value).replace(/\D/g, "");

export const numericText = (value: unknown): string =>
  toEnglishDigits(value).replace(/[^0-9]/g, "");

export const decimalText = (value: unknown): string => {
  const normalized = toEnglishDigits(value).replace(/[^0-9.]/g, "");
  const [head = "", ...rest] = normalized.split(".");
  return rest.length ? `${head}.${rest.join("")}` : head;
};
