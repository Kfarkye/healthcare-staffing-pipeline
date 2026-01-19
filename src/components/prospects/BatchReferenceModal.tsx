import React, { useState, useMemo } from 'react';
import { X, MailCheck, Loader2 as Loader, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Prospect } from '../ProspectsDashboard';
import { buildReferenceEmail } from './emailBuilders';

const TIFFANY_CC = 'Tiffany.Chavez@ayahealthcare.com';

const cn = (...classes: (string | boolean | null | undefined)[]) =>
  classes.filter(Boolean).join(' ');

interface BatchReferenceModalProps {
  open: boolean;
  onClose: () => void;
  prospects: Prospect[];
  onComplete: () => void;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function BatchReferenceModal({
  open,
  onClose,
  prospects,
  onComplete,
  toast
}: BatchReferenceModalProps) {
  const [sending, setSending] = useState(false);
  const valid = useMemo(() => prospects.filter(p => p.email), [prospects]);
  const skipped = prospects.length - valid.length;

  const send = async () => {
    if (!valid.length) {
      toast('No prospects with valid emails selected.', 'error');
      return;
    }

    setSending(true);

    try {
      const isDev = import.meta.env.DEV;
      const successIds: number[] = [];

      for (const p of valid) {
        try {
          if (isDev) {
            const subject = encodeURIComponent('Reference Request for Aya Submission');
            const body = encodeURIComponent(buildReferenceEmail(p));
            window.open(
              `mailto:${p.email}?cc=${TIFFANY_CC}&subject=${subject}&body=${body}`,
              '_blank'
            );
          } else {
            const { error } = await supabase.functions.invoke('send_email', {
              body: {
                to: p.email,
                cc: TIFFANY_CC,
                subject: 'Reference Request for Aya Submission',
                body: buildReferenceEmail(p)
              }
            });
            if (error) throw error;
          }
          successIds.push(p.id);
        } catch (err) {
          console.error(`Failed to send reference request to ${p.name}:`, err);
          toast(`Failed to send to ${p.name}`, 'error');
        }
      }

      if (successIds.length > 0) {
        const { error } = await supabase
          .from('prospects')
          .update({ status: 'Contacted' })
          .in('id', successIds);

        if (error) throw error;
        toast(`Sent ${successIds.length} reference request(s).`, 'success');
      }

      onComplete();
      if (skipped > 0) {
        toast(`Skipped ${skipped} prospect(s) without an email.`, 'info');
      }
      onClose();
    } catch (error) {
      console.error('Batch reference send error:', error);
      toast('An error occurred while sending batch requests.', 'error');
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
            <MailCheck className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Send Reference Request</h2>
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
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg p-3">
            <span className="text-sm text-gray-700 font-medium">
              Ready to send to {valid.length} prospect{valid.length !== 1 ? 's' : ''}
            </span>
            {skipped > 0 && (
              <div className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                <AlertCircle size={12} />
                {skipped} without email
              </div>
            )}
          </div>

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
                  <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">
                    ID
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
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                      {p.candidate_id || <span className="text-gray-400">—</span>}
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
            disabled={sending || !valid.length}
            className={cn(
              'px-4 py-2 text-sm font-semibold rounded-lg text-white flex items-center gap-2 transition-all shadow-sm',
              sending || !valid.length
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
            )}
          >
            {sending ? (
              <>
                <Loader className="w-3.5 h-3.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <MailCheck className="w-3.5 h-3.5" />
                Send ({valid.length})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
