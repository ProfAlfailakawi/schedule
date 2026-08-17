import React from "react";
import { RefreshCw, RotateCcw } from "lucide-react";

interface State {
  error: Error | null;
  exhausted: boolean;
}

interface Props {
  children: React.ReactNode;
}

/**
 * Global render recovery.
 *
 * The old boundary replaced the whole product with a large fatal-error card.
 * That was visually disruptive and, more importantly, turned a transient stale
 * bundle/cache problem into a dead-end screen. The boundary now attempts staged
 * recovery first and only exposes a compact rescue bar after repeated failures.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  declare state: State;

  private stableTimer: number | null = null;
  private readonly recoveryKey = "schedule-render-recovery-v3";

  constructor(props: Props) {
    super(props);
    this.state = { error: null, exhausted: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, exhausted: false };
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
    if (import.meta.env?.DEV) console.error("Schedule render recovery:", error);
    void this.recoverAutomatically();
  }

  private armStableReset = () => {
    if (this.stableTimer) window.clearTimeout(this.stableTimer);
    this.stableTimer = window.setTimeout(() => {
      try { sessionStorage.removeItem(this.recoveryKey); } catch { /* storage may be blocked */ }
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

    // First failure: most render crashes are a stale chunk or a one-off state
    // mismatch. A normal reload is the least destructive recovery.
    if (next.length === 1) {
      window.setTimeout(() => window.location.reload(), 60);
      return;
    }

    // Second failure in one minute: aggressively discard stale runtime assets,
    // then reload. This handles old service-worker/cache combinations without
    // asking the user to know what a "hard refresh" is.
    if (next.length === 2) {
      await this.clearRuntimeCaches();
      window.setTimeout(() => window.location.reload(), 60);
      return;
    }

    // A persistent programming/data error should not trap the browser in an
    // infinite reload loop. Keep the fallback tiny and actionable instead of
    // replacing the whole application with a fatal-error page.
    this.setState({ exhausted: true });
  };

  private retry = () => {
    try { sessionStorage.removeItem(this.recoveryKey); } catch { /* ignore */ }
    window.location.reload();
  };

  private cleanRetry = async () => {
    await this.clearRuntimeCaches();
    try { sessionStorage.removeItem(this.recoveryKey); } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    // During the automatic recovery window there is deliberately no large
    // crash card. A quiet surface avoids flashing a scary full-page error for
    // a failure that normally resolves itself in milliseconds.
    if (!this.state.exhausted) {
      return <div className="render-recovery-quiet" role="status" aria-label="جارٍ استعادة العرض" />;
    }

    return (
      <div className="render-recovery-shell" role="status" aria-live="polite">
        <div className="render-recovery-bar">
          <div>
            <strong>تعذّر تحديث هذه الشاشة</strong>
            <span>حاولنا الاستعادة تلقائيًا. يمكنك المحاولة مرة أخرى دون فقد بياناتك المحفوظة.</span>
          </div>
          <div className="render-recovery-actions">
            <button type="button" data-guide-ignore="أداة إنقاذ عامة بعد فشل الاستعادة التلقائية" onClick={this.retry}>
              <RotateCcw aria-hidden="true" /> إعادة المحاولة
            </button>
            <button type="button" className="primary" data-guide-ignore="أداة إنقاذ عامة تنظف ملفات التشغيل المؤقتة فقط" onClick={this.cleanRetry}>
              <RefreshCw aria-hidden="true" /> تنظيف وإعادة فتح
            </button>
          </div>
        </div>
      </div>
    );
  }
}
