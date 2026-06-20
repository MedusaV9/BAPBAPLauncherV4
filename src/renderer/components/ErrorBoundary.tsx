import React from "react";

export interface ErrorBoundaryProps {
  /** Optional custom fallback UI to render when an error is caught. */
  fallback?: React.ReactNode;
  /** Callback invoked with the error and component stack for diagnostics logging. */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary that catches unhandled rendering errors
 * and displays a recovery UI instead of a white screen.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 11.2
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      // Render custom fallback if provided
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      // Default fallback UI with dark navy palette
      return (
        <div
          className="flex min-h-screen w-full flex-col items-center justify-center p-8"
          style={{ backgroundColor: "#0a0e1a" }}
        >
          <div className="flex max-w-md flex-col items-center gap-6 text-center">
            {/* Error icon */}
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(96, 130, 182, 0.15)" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="#6082b6"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            {/* Error summary */}
            <div className="flex flex-col gap-2">
              <h1
                className="text-xl font-semibold"
                style={{ color: "#f5f0e8" }}
              >
                Something went wrong
              </h1>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "rgba(245, 240, 232, 0.7)" }}
              >
                {this.state.error?.message || "An unexpected error occurred while rendering the application."}
              </p>
            </div>

            {/* Reload button */}
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-md px-5 py-2.5 text-sm font-medium transition-colors duration-150"
              style={{
                backgroundColor: "#6082b6",
                color: "#f5f0e8",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#7a9ac8";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#6082b6";
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
