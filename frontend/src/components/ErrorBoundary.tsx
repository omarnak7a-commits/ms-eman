import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors so the app shows a readable message instead
 * of a silent blank page (no error boundary was previously present).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-red-200 p-8">
            <h1 className="text-lg font-semibold text-red-700 mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-600 mb-4">
              An unexpected error occurred while rendering this page. Details:
            </p>
            <pre className="text-xs text-slate-700 bg-red-50 border border-red-100 rounded-lg p-3 overflow-auto whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
