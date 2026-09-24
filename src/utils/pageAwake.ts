import { useEffect, useState } from "react";

/**
 * Is anyone looking at this tab?
 *
 * A live stream (EventSource) is an open request, and Cloud Run bills CPU for
 * every second a request is open — a tab forgotten in the background overnight
 * kept the server billing all night. Streams follow this flag instead: the tab
 * stays "awake" for a grace minute after it is hidden (switching windows for a
 * moment must not drop the board), then sleeps; it wakes the instant it is
 * shown again, and whoever reopens the stream re-reads once to catch up.
 */
export function usePageAwake(graceMs = 60_000): boolean {
  const [awake, setAwake] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    if (typeof document === "undefined") return;
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      if (!document.hidden) { setAwake(true); return; }
      timer = window.setTimeout(() => setAwake(false), graceMs);
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [graceMs]);
  return awake;
}
