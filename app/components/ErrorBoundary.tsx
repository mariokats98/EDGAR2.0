'use client';

import * as React from 'react';

type Props = {
  children: React.ReactNode;
  /** Optional fallback UI (receives a string message) */
  fallback?: (msg: string) => React.ReactNode;
};

type State = {
  hasError: boolean;
  error: unknown; // can be Error, string, or anything thrown
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    // TODO: send to your logging service if you want
    // console.error('ErrorBoundary caught:', error, errorInfo);
  }

  private errorMessage(err: unknown): string {
    if (!err) return '';
    if (err instanceof Error) return err.message || err.name || 'Unknown error';
    if (typeof err === 'string') return err;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.errorMessage(this.state.error);

    if (this.props.fallback) return <>{this.props.fallback(msg)}</>;

    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <strong>Something went wrong:</strong> {msg}
      </div>
    );
  }
}