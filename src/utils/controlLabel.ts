/**
 * Read a concise human label from a live control without accidentally flattening
 * the entire subtree into one run-on string. In particular, `select.textContent`
 * contains every option back-to-back, which previously produced labels such as
 * «اختر الفصلالفصل الأول...الفصل الثاني...». This helper always uses only the
 * current option and keeps field context separated with a visible delimiter.
 */
export function controlLabel(element: HTMLElement | null, maxLength = 110): string {
  if (!element) return "";

  const explicit = [
    element.getAttribute("data-guide-title"),
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
  ].map(value => String(value || "").replace(/\s+/g, " ").trim()).find(Boolean);
  if (explicit) return explicit.slice(0, maxLength);

  const field = element.closest<HTMLElement>(".field");
  const fieldLabel = String(field?.querySelector(":scope > label")?.textContent || "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  let valueLabel = "";
  if (element instanceof HTMLSelectElement) {
    valueLabel = String(element.selectedOptions?.[0]?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    // Never expose typed values through guide/telemetry labels. A placeholder is
    // descriptive enough and does not leak the user's input.
    valueLabel = String(element.getAttribute("placeholder") || "")
      .replace(/\s+/g, " ")
      .trim();
  } else {
    valueLabel = String(element.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const parts = [fieldLabel, valueLabel].filter(Boolean);
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.join(" · ").slice(0, maxLength);
}
