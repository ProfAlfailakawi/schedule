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
    // The page is no longer blank, so the document-level boot guard must stand
    // down; it would otherwise reload the tab out from under this message.
    try { (window as any).__scheduleBooted?.(); } catch { /* guard absent in tests */ }
    if (import.meta.env?.DEV) console.error("Schedule crashed while rendering:", error);
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
      <div className="crash-screen" role="alert">
        <div className="crash-card">
          <span className="crash-mark" aria-hidden="true">!</span>
          <h1>توقفت هذه الشاشة</h1>
          <p>لم يُفقد أي شيء محفوظ. جرّب إعادة التحميل، وإذا تكرر الأمر استخدم «تحميل نسخة نظيفة».</p>
          <div className="crash-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              إعادة التحميل
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.hardReload}>
              تحميل نسخة نظيفة
            </button>
          </div>
          <code dir="ltr">{String(this.state.error?.message || this.state.error).slice(0, 160)}</code>
        </div>
      </div>
    );
  }
}
