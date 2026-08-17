import React from "react";

/**
 * The last line before a blank screen.
 *
 * A render error anywhere in the tree used to unmount everything and leave the
 * page white, which tells the person nothing and tells whoever is called about
 * it even less. This catches the error, keeps the page readable in Arabic, and
 * offers the two things that actually help: try again, or clear the stored copy
 * and reload — the fix for a tab still holding a previous release.
 */
interface State {
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  // React's type packages are not installed in this workspace, so the base
  // class carries no member types. Declaring them keeps this file checked.
  declare props: Props;
  declare state: State;

  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Keep technical diagnostics out of the user's screen. In development the
    // console still receives the real exception; production attempts one quiet
    // recovery before showing a small Arabic-only fallback.
    try { (window as any).__scheduleBooted?.(); } catch { /* guard absent in tests */ }
    if (import.meta.env?.DEV) console.error("Schedule crashed while rendering:", error);
    try {
      const key = "schedule-render-recovery-at";
      const now = Date.now();
      const previous = Number(sessionStorage.getItem(key) || 0);
      if (!previous || now - previous > 15_000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
      }
    } catch { /* storage can be blocked; fallback remains usable */ }
  }

  private hardReload = async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      const registrations = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((registrations || []).map(registration => registration.unregister()));
    } catch { /* a blocked cache API must not stop the reload */ }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen crash-screen-quiet" role="status" aria-live="polite">
        <div className="crash-card crash-card-quiet">
          <span className="button-spinner" aria-hidden="true" />
          <p>تعذّر إكمال العرض. يمكنك إعادة المحاولة الآن.</p>
          <button type="button" className="btn btn-primary" onClick={this.hardReload}>
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }
}
