import React, { useState } from 'react';
import { X, UserX, Loader2 as Loader } from 'lucide-react';
import type { Prospect } from '../ProspectsDashboard';
import { buildReassignmentEmail } from './emailBuilders';

const REASSIGNMENT_EMAIL = 'reassignments@ayahealthcare.com';

const cn = (...classes: (string | boolean | null | undefined)[]) =>
  classes.filter(Boolean).join(' ');

interface BatchReassignModalProps {
  open: boolean;
  onClose: () => void;
  prospects: Prospect[];
  onComplete: () => void;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function BatchReassignModal({
  open,
  onClose,
  prospects,
  onComplete,
  toast
}: BatchReassignModalProps) {
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const body = prospects.map(buildReassignmentEmail).join('\n\n---\n\n');
      const subject = encodeURIComponent(
        `Reassignment Request (${prospects.length} prospect${prospects.length !== 1 ? 's' : ''})`
      );
      const encodedBody = encodeURIComponent(body);

      window.open(
        `mailto:${REASSIGNMENT_EMAIL}?subject=${subject}&body=${encodedBody}`,
        '_blank'
      );

      onComplete();
      toast(`Opened reassignment request for ${prospects.length} prospect(s).`, 'success');
      onClose();
    } catch (error) {
      console.error('Batch reassignment error:', error);
      toast('An error occurred while opening reassignment request.', 'error');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-gray-100 animate-scaleIn">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserX className="w-5 h-5 text-orange-600" />
            <h2 className="text-base font-semibold text-gray-900">Request Reassignment</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            aria-label="Close"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            This will open an email draft to{' '}
            <span className="font-semibold text-gray-900">{REASSIGNMENT_EMAIL}</span> for{' '}
            {prospects.length} prospect{prospects.length !== 1 ? 's' : ''}
          </p>

          <div className="max-h-60 overflow-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">
                    Email
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {prospects.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-900 text-[13px]">
                      {p.name}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                      {p.email || <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-5 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending}
            className={cn(
              'px-4 py-2 text-sm font-semibold rounded-lg text-white flex items-center gap-2 transition-all shadow-sm',
              sending
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-orange-600 hover:bg-orange-700 active:scale-[0.98]'
            )}
          >
            {sending ? (
              <>
                <Loader className="w-3.5 h-3.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <UserX className="w-3.5 h-3.5" />
                Request ({prospects.length})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
