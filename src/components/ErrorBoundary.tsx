import React from "react";
import { telemetryError } from "../utils/clientTelemetry";

interface State {
  error: Error | null;
  recoveryNonce: number;
  attempts: number;
}

interface Props {
  children: React.ReactNode;
}

/**
 * Global render recovery.
 *
 * Product policy: a transient render failure must never navigate the user away
 * from the current screen, reload the application, or clear runtime caches.
 * Recovery is performed in-place by remounting the React subtree, silently —
 * the three automatic attempts are invisible because they resolve in
 * milliseconds and a flash of error text for a hiccup that healed itself is
 * noise.
 *
 * What changed (2026-08-28, product decision): a failure that survives all
 * automatic attempts is no longer allowed to be silent. The old behaviour kept
 * an invisible cover over the screen, so a person whose subtree had genuinely
 * stopped rendering sat in front of a blank page with no way to know and
 * nothing to press. Now the stuck state — and only the stuck state — shows one
 * quiet line and one button: «إعادة المحاولة», which restarts the same
 * in-place remount cycle. Still no navigation, no reload, no crash card.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  declare state: State;
  // This project intentionally does not ship @types/react. Declare the
  // inherited React state updater explicitly for TypeScript while preserving
  // React.Component's real runtime implementation.
  declare setState: (
    state: Partial<State> | ((prevState: Readonly<State>, props: Readonly<Props>) => Partial<State> | State | null),
    callback?: () => void,
  ) => void;

  private retryTimer: number | null = null;
  private readonly maxImmediateAttempts = 3;

  constructor(props: Props) {
    super(props);
    this.state = { error: null, recoveryNonce: 0, attempts: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    try { (window as any).__scheduleBooted?.(); } catch { /* optional boot hook */ }
    /* ── العطل الصامت يجب أن يُعرَف، لا أن يُرى ────────────────────────────
     *
     * The product policy above is deliberate and unchanged: a render failure
     * never navigates, never reloads, and never puts an error card in front of
     * the person working. What it never said is that nobody should KNOW.
     *
     * This was the one place in the product that catches a real render crash
     * at a real user, and it reported to `console.error` in DEV only — so in
     * production the failure was invisible twice over: the person saw a quiet
     * screen and no telemetry ever left the browser. It could recur for a
     * month across ten people and never reach anyone who could fix it.
     *
     * The reader still sees nothing. `attempt` distinguishes the first failure
     * from a subtree that has stopped recovering, which is the difference
     * between a transient hiccup and a screen a person is now stuck on. */
    try {
      telemetryError(
        this.state.attempts + 1 > this.maxImmediateAttempts ? "ui.render.unrecovered" : "ui.render.recovery",
        error,
      );
    } catch { /* telemetry must never be the thing that breaks a recovery */ }
    if (import.meta.env?.DEV) console.error("Schedule render recovery:", error);

    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    const nextAttempt = this.state.attempts + 1;

    if (nextAttempt <= this.maxImmediateAttempts) {
      this.retryTimer = window.setTimeout(() => {
        this.setState(state => ({
          error: null,
          recoveryNonce: state.recoveryNonce + 1,
          attempts: nextAttempt,
        }));
      }, nextAttempt === 1 ? 0 : 120);
    }
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    // Once the subtree survives a render after recovery, forget the failure
    // streak. This keeps a later unrelated transient error eligible for silent
    // in-place recovery as well.
    if (prevState.error && !this.state.error && this.state.attempts) {
      window.setTimeout(() => {
        if (!this.state.error) this.setState({ attempts: 0 });
      }, 1500);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
  }

  private manualRetry = () => {
    try { telemetryError("ui.render.manual-retry", this.state.error || new Error("manual retry")); } catch { /* never block the retry */ }
    // Reset the streak too: the person asking again deserves the full set of
    // automatic attempts, not a boundary that gives up on the first failure.
    this.setState(state => ({ error: null, recoveryNonce: state.recoveryNonce + 1, attempts: 0 }));
  };

  render() {
    if (this.state.error) {
      // Automatic recovery still pending: stay quiet. This cover exists for
      // 0–120ms at a time; showing text here would flash on every hiccup.
      if (this.state.attempts < this.maxImmediateAttempts) {
        return <div className="render-recovery-quiet" aria-hidden="true" />;
      }
      // Every automatic attempt failed. The person is stuck; say so, small,
      // and hand them the retry the boundary was doing on their behalf.
      return (
        <div className="render-recovery-shell" role="alert">
          <div className="render-recovery-bar">
            <div>
              <strong>تعذّر عرض هذا الجزء</strong>
              <span>حدث خلل مؤقت في العرض. بياناتك محفوظة ولم تتأثر.</span>
            </div>
            <div className="render-recovery-actions">
              <button type="button" className="primary" data-guide-ignore="زر طوارئ يظهر فقط حين يتعطل العرض نفسه — المرشد لا يعمل في هذه الحالة أصلاً" onClick={this.manualRetry}>إعادة المحاولة</button>
            </div>
          </div>
        </div>
      );
    }

    return <React.Fragment key={this.state.recoveryNonce}>{this.props.children}</React.Fragment>;
  }
}
