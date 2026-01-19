import React from 'react';
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

export default function ErrorBoundary(): JSX.Element {
  const error = useRouteError();

  let errorMessage = 'An unexpected error occurred';
  let errorDetails = '';

  if (isRouteErrorResponse(error)) {
    errorMessage = error.statusText || 'Page not found';
    errorDetails = error.data?.message || '';
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorDetails = error.stack || '';
  }

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center animate-scaleIn">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Something went wrong
        </h1>

        <p className="text-slate-600 mb-6">
          {errorMessage}
        </p>

        {errorDetails && (
          <details className="mb-6 text-left">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 transition-colors">
              Technical Details
            </summary>
            <pre className="mt-2 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 overflow-auto max-h-40 border border-slate-200">
              {errorDetails}
            </pre>
          </details>
        )}

        <div className="flex gap-3 justify-center">
          <Link
            to="/prospects"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all duration-200 text-sm font-medium shadow-sm hover:shadow-md active:scale-95"
          >
            <Home size={16} />
            Go Home
          </Link>

          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all duration-200 text-sm font-medium active:scale-95"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
