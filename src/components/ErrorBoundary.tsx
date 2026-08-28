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
 * from the current screen, reload the application, clear runtime caches, or
 * replace the product with a visible rescue/error panel. Recovery is therefore
 * performed in-place by remounting the React subtree. Persistent failures are
 * kept visually quiet rather than forcing a navigation loop.
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

  render() {
    if (this.state.error) {
      // Intentionally invisible. Never show a global error card and never
      // navigate/reload the user out of the screen they were working in.
      return <div className="render-recovery-quiet" aria-hidden="true" />;
    }

    return <React.Fragment key={this.state.recoveryNonce}>{this.props.children}</React.Fragment>;
  }
}
