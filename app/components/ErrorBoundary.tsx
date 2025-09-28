// app/components/ErrorBoundary.tsx
"use client";
import { Component, ReactNode } from "react";

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: any }> {
  state = { error: null };
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Something went wrong: {String(this.state.error?.message || this.state.error)}
        </div>
      );
    }
    return this.props.children;
  }
}