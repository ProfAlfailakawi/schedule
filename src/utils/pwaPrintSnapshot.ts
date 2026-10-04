/**
 * iOS Home Screen apps cannot reliably open Safari's print sheet from their
 * standalone WebKit view. Post the already-rendered print portal into a fresh
 * top-level browsing context instead; iOS opens that context in Safari, where
 * the user can invoke its native print UI.
 */
export function isIosStandalonePwa(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || "")
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && ((navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia?.("(display-mode: standalone)").matches === true);
}

export function openPwaPrintSnapshot(): boolean {
  if (typeof document === "undefined") return false;
  const host = document.getElementById("app-print-root");
  if (!host?.innerHTML.trim()) return false;

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/print/snapshot";
  form.target = "_blank";
  form.hidden = true;

  const add = (name: string, value: string) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };

  const styles = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')]
    .map(link => {
      const url = new URL(link.href, window.location.href);
      return url.origin === window.location.origin ? `${url.pathname}${url.search}` : "";
    })
    .filter(Boolean);

  add("markup", host.outerHTML);
  add("styles", JSON.stringify(styles));
  add("printKind", document.documentElement.dataset.printKind || "");
  add("printRotate", document.documentElement.dataset.printRotate || "");
  add("printChromium", document.documentElement.dataset.printChromium || "");
  document.body.appendChild(form);
  form.submit();
  form.remove();
  return true;
}
