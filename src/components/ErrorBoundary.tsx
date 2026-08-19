import React from "react";

interface State {
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
}

/**
 * Global render recovery.
 *
 * A render failure must never strand the reader behind a fatal/recovery card.
 * Recovery is intentionally silent: first reload, then discard stale runtime
 * assets, then return to the login entry point once. Persistent programming
 * errors remain on a neutral recovery surface instead of exposing a dead-end
 * "retry / clean" UI to the user.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  declare state: State;

  private stableTimer: number | null = null;
  private readonly recoveryKey = "schedule-render-recovery-v4";
  private readonly safeLoginKey = "schedule-render-safe-login-v1";

  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidMount() {
    this.armStableReset();
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    if (prevState.error && !this.state.error) this.armStableReset();
  }

  componentWillUnmount() {
    if (this.stableTimer) window.clearTimeout(this.stableTimer);
  }

  componentDidCatch(error: Error) {
    try { (window as any).__scheduleBooted?.(); } catch { /* optional boot hook */ }
    if (typeof console !== "undefined") console.error("Schedule render recovery:", error);
    void this.recoverAutomatically();
  }

  private armStableReset = () => {
    if (this.stableTimer) window.clearTimeout(this.stableTimer);
    this.stableTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(this.recoveryKey);
        sessionStorage.removeItem(this.safeLoginKey);
      } catch { /* storage may be blocked */ }
    }, 20_000);
  };

  private readAttempts = (): number[] => {
    try {
      const raw = JSON.parse(sessionStorage.getItem(this.recoveryKey) || "[]");
      if (!Array.isArray(raw)) return [];
      const floor = Date.now() - 60_000;
      return raw.map(Number).filter(value => Number.isFinite(value) && value >= floor);
    } catch {
      return [];
    }
  };

  private writeAttempt = (times: number[]) => {
    try { sessionStorage.setItem(this.recoveryKey, JSON.stringify(times)); } catch { /* ignore */ }
  };

  private clearRuntimeCaches = async () => {
    try {
      sessionStorage.removeItem("miras_chunk_reload");
    } catch { /* ignore */ }
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      const registrations = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((registrations || []).map(registration => registration.unregister()));
    } catch {
      // Cache APIs can be unavailable in private/restricted contexts.
    }
  };

  private recoverAutomatically = async () => {
    const attempts = this.readAttempts();
    const next = [...attempts, Date.now()];
    this.writeAttempt(next);

    // First failure: the least destructive recovery is a normal reload.
    if (next.length === 1) {
      window.setTimeout(() => window.location.reload(), 60);
      return;
    }

    // Second failure: stale JS/service-worker assets are the usual culprit.
    if (next.length === 2) {
      await this.clearRuntimeCaches();
      window.setTimeout(() => window.location.reload(), 60);
      return;
    }

    // Third failure: never expose a fatal rescue card. Return to the clean
    // application entry point once after clearing runtime assets. The one-shot
    // marker prevents an infinite redirect loop if the deployed bundle itself
    // contains a persistent programming error.
    let alreadyReturnedToLogin = false;
    try {
      alreadyReturnedToLogin = sessionStorage.getItem(this.safeLoginKey) === "1";
      if (!alreadyReturnedToLogin) sessionStorage.setItem(this.safeLoginKey, "1");
    } catch { /* storage may be blocked */ }

    if (!alreadyReturnedToLogin) {
      await this.clearRuntimeCaches();
      window.setTimeout(() => window.location.replace("/"), 80);
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    // Deliberately no error card, retry button, or cache-cleaning prompt. The
    // recovery flow above owns the transition and keeps the reader out of a
    // dead-end screen.
    return <div className="render-recovery-quiet" role="status" aria-label="جارٍ استعادة SCHEDULE" />;
  }
}
