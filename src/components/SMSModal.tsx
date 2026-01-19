// ============================================================================
// src/components/SMSModal.tsx
// SMS Composition Modal with RingCentral Integration
// ============================================================================

import React, { useState, useCallback, useEffect } from 'react';
import { X, MessageSquare, Send, Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface SMSModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateName: string;
  candidatePhone: string;
  onSend?: (message: string) => void;
}

const SMS_TEMPLATES = [
  {
    id: 'extension_check',
    label: 'Extension Check-in',
    template: (name: string) => `Hi ${name}! Just checking in about your extension opportunity. Do you have 5 minutes to chat today?`
  },
  {
    id: 'new_job',
    label: 'New Job Interest',
    template: (name: string) => `Hi ${name}! I have a great opportunity that matches your profile. When would be a good time to discuss?`
  },
  {
    id: 'quick_followup',
    label: 'Quick Follow-up',
    template: (name: string) => `Hi ${name}! Following up on our last conversation. Let me know if you have any questions!`
  },
  {
    id: 'availability',
    label: 'Check Availability',
    template: (name: string) => `Hi ${name}! Are you still available for assignments starting next month?`
  }
];

export const SMSModal: React.FC<SMSModalProps> = ({
  isOpen,
  onClose,
  candidateName,
  candidatePhone,
  onSend,
}) => {
  const [message, setMessage] = useState('');
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const firstName = candidateName.split(' ')[0];

  useEffect(() => {
    if (!isOpen) {
      setMessage('');
      setCopiedMessage(false);
      setCopiedPhone(false);
    }
  }, [isOpen]);

  const handleCopyMessage = useCallback(() => {
    navigator.clipboard.writeText(message);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  }, [message]);

  const handleCopyPhone = useCallback(() => {
    navigator.clipboard.writeText(candidatePhone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  }, [candidatePhone]);

  const handleOpenRingCentral = useCallback(() => {
    if (message.trim()) {
      navigator.clipboard.writeText(message);
    }

    window.open('https://app.ringcentral.com/sms', '_blank');

    if (onSend) {
      onSend(message);
    }

    onClose();
  }, [message, onSend, onClose]);

  const useTemplate = useCallback((template: string) => {
    setMessage(template);
  }, []);

  const charCount = message.length;
  const maxChars = 320;
  const isOverLimit = charCount > maxChars;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-100 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50">
              <MessageSquare className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Send Text Message</h2>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-slate-600">
                  {candidateName} • {candidatePhone}
                </p>
                <button
                  onClick={handleCopyPhone}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  {copiedPhone ? (
                    <>
                      <Check size={12} className="text-emerald-600" />
                      <span className="text-emerald-600">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      Copy Phone
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
            Quick Templates
          </p>
          <div className="flex flex-wrap gap-2">
            {SMS_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => useTemplate(template.template(firstName))}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all"
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Example:\n${SMS_TEMPLATES[0].template(firstName)}`}
            className={cn(
              "w-full h-48 p-4 text-sm rounded-lg border-2 resize-none",
              "focus:outline-none focus:ring-0 transition-colors",
              isOverLimit
                ? "border-red-300 focus:border-red-400 bg-red-50/50"
                : "border-blue-300 focus:border-blue-400 bg-blue-50/20"
            )}
            autoFocus
          />
          <div className="flex items-center justify-between mt-2">
            <span className={cn(
              "text-xs font-medium",
              isOverLimit ? "text-red-600" : charCount > 160 ? "text-amber-600" : "text-slate-500"
            )}>
              {charCount} / {maxChars} characters
              {charCount > 160 && charCount <= 320 && (
                <span className="ml-2 text-slate-400">(2 messages)</span>
              )}
              {isOverLimit && (
                <span className="ml-2 text-red-600 font-semibold">Over limit!</span>
              )}
            </span>
            {message && (
              <button
                onClick={handleCopyMessage}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                {copiedMessage ? (
                  <>
                    <Check size={14} className="text-emerald-600" />
                    <span className="text-emerald-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copy Message
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="p-5 bg-slate-50 border-t border-slate-100 rounded-b-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-slate-600">
              💡 <span className="font-medium">Quick Steps:</span> Copy phone → Open RingCentral → Find contact → Paste message
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleOpenRingCentral}
              disabled={!message.trim() || isOverLimit}
              className={cn(
                'flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg text-white flex items-center justify-center gap-2 transition-all shadow-sm',
                !message.trim() || isOverLimit
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
              )}
            >
              <Send size={16} />
              Open RingCentral
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
      `}</style>
    </div>
  );
};
