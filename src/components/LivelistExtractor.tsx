import React, { useState, useCallback } from 'react';
import { Loader2, CheckCircle, Clipboard, AlertTriangle, PartyPopper } from 'lucide-react';
import { useLivelistSync } from '../hooks/useLivelistSync'; // Import the new hook

// ============================================================================
// NOTE: Toast component and other UI-specific types can remain in this file
// ============================================================================
interface ToastProps {
  message: string;
  show: boolean;
  type?: 'success' | 'error' | 'info';
}

const Toast: React.FC<ToastProps> = ({ message, show, type = 'success' }) => {
  if (!show) return null;
  const colors = {
    success: { bg: 'bg-green-100', border: 'border-green-200', icon: 'text-green-600' },
    error: { bg: 'bg-red-100', border: 'border-red-200', icon: 'text-red-600' },
    info: { bg: 'bg-blue-100', border: 'border-blue-200', icon: 'text-blue-600' },
  };
  const style = colors[type];
  return (
    <div className="fixed top-6 right-6 z-50 animate-in slide-in-from-top-2 fade-in duration-200">
      <div className={`bg-white px-4 py-3 rounded-lg shadow-lg border ${style.border} flex items-center gap-3`}>
        <div className={`w-8 h-8 ${style.bg} rounded-full flex items-center justify-center`}>
          <CheckCircle size={16} className={style.icon} />
        </div>
        <span className="text-sm font-medium text-gray-900">{message}</span>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT (Now much cleaner)
// ============================================================================
export default function LivelistExtractor(): JSX.Element {
  // State for UI elements like toasts remains here
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

  const showToastNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  }, []);

  // All the complex logic and state is now managed by the hook.
  const {
    startSync,
    resetSync,
    isLoading,
    isSyncing,
    syncProgress,
    syncResults,
    showResultsScreen,
  } = useLivelistSync({ onNotification: showToastNotification });

  // The main useEffect and processAndSync functions are GONE from this file.

  const renderContent = () => {
    if (showResultsScreen && syncResults) {
      const isSuccess = syncResults.errorCount === 0;
      return (
        <div className="text-center border-2 border-dashed border-gray-300 rounded-lg p-12 animate-in fade-in duration-300">
          {isSuccess ? <PartyPopper size={48} className="mx-auto text-green-500" /> : <AlertTriangle size={48} className="mx-auto text-amber-500" />}
          <h2 className="mt-4 text-xl font-semibold text-gray-700">{isSuccess ? 'Sync Complete!' : 'Sync Complete with Errors'}</h2>
          <div className="mt-4 space-y-2 text-gray-600">
            <p><strong>Total Candidates Analyzed:</strong> {syncResults.totalCandidates}</p>
            <p><strong>Records Processed:</strong> {syncResults.operationsCount}</p>
            <p className={syncResults.errorCount > 0 ? 'text-red-600' : ''}><strong>Errors Encountered:</strong> {syncResults.errorCount}</p>
          </div>
          <button onClick={resetSync} className="mt-8 bg-gray-900 text-white font-semibold py-3 px-8 rounded-lg flex items-center justify-center gap-2 mx-auto hover:bg-gray-800 transition-colors">
            Sync Another List
          </button>
        </div>
      );
    }

    if (isSyncing) {
        return (
            <div className="text-center border-2 border-dashed border-gray-300 rounded-lg p-12">
                <Loader2 size={48} className="mx-auto text-gray-400 animate-spin"/>
                <h2 className="mt-4 text-xl font-semibold text-gray-700">Syncing to Database...</h2>
                <p className="mt-2 text-sm text-gray-500">Processing {Math.round(syncProgress)}%</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                    <div className="bg-gray-800 h-2.5 rounded-full" style={{ width: `${syncProgress}%`, transition: 'width 0.2s ease-in-out' }}></div>
                </div>
            </div>
        );
    }

    return (
      <div className="text-center border-2 border-dashed border-gray-300 rounded-lg p-12">
        <Clipboard size={48} className="mx-auto text-gray-400"/>
        <h2 className="mt-4 text-xl font-semibold text-gray-700">Sync Pipeline from Clipboard</h2>
        <p className="mt-2 text-sm text-gray-500">Use your `Copy Nova HTML` bookmarklet on the Livelist page, then click the button below.</p>
        <button onClick={startSync} disabled={isLoading} className="mt-6 bg-gray-900 text-white font-semibold py-3 px-8 rounded-lg flex items-center justify-center gap-2 disabled:bg-gray-400 mx-auto hover:bg-gray-800 transition-colors">
          {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" />Extracting...</> : 'Start Pipeline Sync'}
        </button>
      </div>
    );
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-md">
      <Toast message={toastMessage} show={showToast} type={toastType} />
      <h1 className="text-2xl font-bold text-gray-800">Livelist Pipeline Sync</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        Syncs your recruitment pipeline (Submittals, Offers, Prospects) from the LiveList.
        <br />
        <span className="text-xs text-amber-600 font-medium">Note: This does NOT mark candidates as Active. Use Working Candidates sync for active assignments.</span>
      </p>
      
      {renderContent()}
      
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Status Mappings:</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="font-mono text-gray-500">offer →</span> Offer Extended</div>
          <div><span className="font-mono text-gray-500">extension req →</span> Extension Request Sent</div>
          <div><span className="font-mono text-gray-500">active/submitted/pending →</span> Submitted</div>
          <div><span className="font-mono text-gray-500">ending soon →</span> Needs New Role</div>
          <div><span className="font-mono text-gray-500">not selected →</span> Closed</div>
          <div><span className="font-mono text-gray-500">no jobs →</span> Prospect</div>
        </div>
      </div>
    </div>
  );
}