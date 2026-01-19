// ============================================================================
// src/components/ProspectsDashboard.tsx
// PRODUCTION READY – Complete Schema Alignment + Field Name Mapping
// READ: prospects table | WRITE: prospects table
// Fields: All schema fields properly mapped and validated
// Design: Apple × Stripe × Vercel
// Updated: Fixed handleAddProspect to map full_name→name, primary_specialty→specialty
// ============================================================================

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Search, X, Phone, Mail, Plus, Loader as Loader2, CreditCard as Edit2, CircleCheck as CheckCircle, ExternalLink, SquareCheck as CheckSquare, MailCheck, CircleAlert as AlertCircle, UserX, TriangleAlert as AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Modals
import EmailTemplateModal from './prospects/EmailTemplateModal';
import EditProspectModal from './prospects/EditProspectModal';
import AddProspectModal from './prospects/AddProspectModal';

// ============================================================================
// TYPES - Matching prospects TABLE
// ============================================================================

export type VisibleColumnId = 'New' | 'Contacted' | 'Responded' | 'Final Updates' | 'Submittal Ready';
export type ArchiveStatusId = 'Not Interested';
export type StatusId = VisibleColumnId | ArchiveStatusId;
export type ModalType = 'add' | 'edit' | 'email' | 'batch_reference' | 'batch_reassignment' | null;

export interface Prospect {
  id: number;
  candidate_id: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  profession: string | null;
  status: StatusId;
  home_state: string | null;
  licenses: string[] | null;
  notes: string | null;
  rto_notes: string | null;
  recruiter: string | null;
  recruiter_id: string | null;
  source: string | null;
  priority: string | null;
  metadata: Record<string, any> | null;
  nova_url: string | null;
  available_start_date: string | null;
  last_contacted_at: string | null;
  last_response_at: string | null;
  next_follow_up_date: string | null;
  created_at: string;
  updated_at: string;

  // Client-side calculated fields, not in DB
  profile_score?: number;
  references_verified?: number;
  profile_complete?: boolean;
}

export interface ColumnDefinition {
  id: VisibleColumnId;
  label: string;
  color: string;
  description: string;
}

export interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const VISIBLE_COLUMNS: ColumnDefinition[] = [
  { id: 'New', label: 'New', color: '#6B7280', description: 'Fresh leads to review' },
  { id: 'Contacted', label: 'Contacted', color: '#2563EB', description: 'Initial outreach sent' },
  { id: 'Responded', label: 'Responded', color: '#D97706', description: 'Showing interest' },
  { id: 'Final Updates', label: 'Final Updates', color: '#7C3AED', description: 'Completing requirements' },
  { id: 'Submittal Ready', label: 'Submittal Ready', color: '#16A34A', description: 'Profile complete and ready' },
];

const TIFFANY_CC = 'Tiffany.Chavez@ayahealthcare.com';
const REASSIGNMENT_EMAIL = 'reassignments@ayahealthcare.com';

// ============================================================================
// UTILITIES
// ============================================================================

const cn = (...classes: (string | boolean | null | undefined)[]) =>
  classes.filter(Boolean).join(' ');

const getFirstName = (name: string) =>
  (name?.trim()?.split(' ')[0] ?? '').replace(/[^A-Za-z'-]/g, '') || 'there';

const formatPhoneLink = (phone: string | null) =>
  phone ? `tel:${phone.replace(/\D/g, '')}` : '';

const formatNovaLink = (id?: number | null) =>
  id ? `https://nova.ayahealthcare.com/#/recruiting/candidates/${id}/new-profile/about` : '';

const buildReferenceEmail = (p: Prospect) => {
  const firstName = getFirstName(p.name);
  const novaUrl = p.nova_url || formatNovaLink(p.candidate_id);
  return `Hi ${firstName},\n\nThe facility requires a verified supervisory reference from the past 12 months.\nCould you please ask a supervisor from within the last 12 months to complete the attached reference form and email it to References@ayahealthcare.com?\n\nSupervisory Reference – Can be a Team Lead, Charge Nurse, Nurse Practitioner, Unit Manager, or Director.\n\nPlease ensure the reference matches one of the references listed on your Aya profile with the correct facility and dates.\n\nFor tracking purposes, it would be helpful if they could CC me at Kofi.Farkye@ayahealthcare.com and ${TIFFANY_CC}.\n\nI can begin the submittal process without the reference, but we'll need it completed as soon as possible.\n\n${novaUrl ? `Nova link: ${novaUrl}\n` : ''}Email: ${p.email ?? ''}\n\nThank you!\nKofi Farkye\nSenior Recruiter, Fulfillment Specialist\nP: 858-529-7267 Ext: 17017`;
};

const buildReassignmentEmail = (p: Prospect) => {
  return `Hi Team,\n\nCan we please reassign ${p.name}?\n\nEmail: ${p.email || 'Not Available'}\nNova Profile: ${p.nova_url || formatNovaLink(p.candidate_id)}\n\nThank you!`;
};

// ============================================================================
// PROSPECT CARD (Refined with perfect hover states)
// ============================================================================

const ProspectCard: React.FC<{
  prospect: Prospect;
  onEdit: () => void;
  onEmail: () => void;
  onArchive: (status: ArchiveStatusId) => void;
  onMarkReady: () => void;
  checked: boolean;
  onToggle: () => void;
  index: number;
}> = ({ prospect, onEdit, onEmail, onArchive, onMarkReady, checked, onToggle, index }) => {
  const profileScore = prospect.profile_score || 0;
  const isFullyReady = profileScore === 100;

  const stop = (e: React.MouseEvent, fn: () => void) => { e.stopPropagation(); fn(); };
  const openLink = (e: React.MouseEvent, url: string) => { e.stopPropagation(); window.open(url, '_blank', 'noopener'); };

  const statusColor = isFullyReady ? 'bg-green-500' : profileScore >= 75 ? 'bg-blue-500' : profileScore >= 50 ? 'bg-amber-500' : 'bg-gray-300';

  return (
    <div
      onClick={onEdit}
      className="relative bg-white rounded-lg border border-gray-200 p-4 cursor-pointer transition-all duration-200 group hover:shadow-lg hover:shadow-gray-100/50 hover:border-gray-300 hover:-translate-y-0.5 animate-fadeInUp"
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms`, opacity: 0 }}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={e => stop(e, onToggle)}
          className="mt-0.5 w-5 h-5 rounded bg-white border-2 border-gray-300 flex items-center justify-center hover:border-blue-600 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 z-10"
          aria-pressed={checked}
        >
          <div className={cn('transition-all duration-150', checked ? 'scale-100 opacity-100' : 'scale-0 opacity-0')}>
            <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
          </div>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-2">
              <h3 className="text-[13px] font-semibold text-gray-900 truncate transition-colors duration-150 group-hover:text-blue-600 tracking-tight">
                {prospect.name}
              </h3>
              <p className="text-[11px] text-gray-500 truncate mt-0.5">
                {prospect.specialty || prospect.profession || '—'}
              </p>
            </div>
            <button
              onClick={e => stop(e, onEdit)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-50 rounded transition-all duration-150 shrink-0"
              aria-label="Edit prospect"
            >
              <Edit2 size={13} className="text-gray-400 hover:text-gray-600" />
            </button>
          </div>

          <div className="mt-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-gray-500 tracking-wider uppercase">Profile Score</span>
              <span className="text-[11px] font-bold text-gray-700 tabular-nums">{profileScore}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
              <div className={cn('h-full rounded-full transition-all duration-500 ease-out', statusColor)} style={{ width: `${profileScore}%` }} />
            </div>
          </div>

          <div className="relative pt-3.5 mt-3.5 border-t border-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-0.5">
                {prospect.phone && (
                  <button onClick={e => openLink(e, formatPhoneLink(prospect.phone))} className="p-1.5 rounded text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-all duration-150" aria-label="Call">
                    <Phone size={13} />
                  </button>
                )}
                {prospect.email && (
                  <button onClick={e => stop(e, onEmail)} className="p-1.5 rounded text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-all duration-150" aria-label="Email">
                    <Mail size={13} />
                  </button>
                )}
                {(prospect.candidate_id || prospect.nova_url) && (
                  <button onClick={e => openLink(e, prospect.nova_url || formatNovaLink(prospect.candidate_id))} className="p-1.5 rounded text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-all duration-150" aria-label="Open Nova">
                    <ExternalLink size={13} />
                  </button>
                )}
                 <button onClick={e => stop(e, () => onArchive('Not Interested'))} className="p-1.5 rounded text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all duration-150" aria-label="Not Interested">
                    <UserX size={13} />
                </button>
              </div>

              {isFullyReady && prospect.status !== 'Submittal Ready' && (
                <button
                  onClick={e => { e.stopPropagation(); onMarkReady(); }}
                  className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full transition-all duration-150 hover:bg-green-100 tracking-wider uppercase"
                >
                  <CheckCircle size={11} />
                  Ready
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// BATCH MODALS (Refined spacing and typography)
// ============================================================================

const BatchReferenceModal: React.FC<{
  open: boolean;
  onClose: () => void;
  prospects: Prospect[];
  onComplete: () => void;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ open, onClose, prospects, onComplete, toast }) => {
  const [sending, setSending] = useState(false);
  const valid = useMemo(() => prospects.filter(p => p.email), [prospects]);
  const skipped = prospects.length - valid.length;

  const send = async () => {
    if (!valid.length) return toast('No prospects with valid emails selected.', 'error');
    setSending(true);

    try {
      const isDev = import.meta.env.DEV;
      const successIds: number[] = [];

      for (const p of valid) {
        try {
          if (isDev) {
            const subject = encodeURIComponent('Reference Request for Aya Submission');
            const body = encodeURIComponent(buildReferenceEmail(p));
            window.open(`mailto:${p.email}?cc=${TIFFANY_CC}&subject=${subject}&body=${body}`, '_blank');
          } else {
            const { error } = await supabase.functions.invoke('send_email', {
              body: { to: p.email, cc: TIFFANY_CC, subject: 'Reference Request for Aya Submission', body: buildReferenceEmail(p) }
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
        const { error } = await supabase.from('prospects').update({
          status: 'Contacted'
        }).in('id', successIds);
        if (error) throw error;
        toast(`Sent ${successIds.length} reference request(s).`, 'success');
      }

      onComplete();
      if (skipped > 0) toast(`Skipped ${skipped} prospect(s) without an email.`, 'info');
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
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50 transition-colors" aria-label="Close">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg p-3">
            <span className="text-sm text-gray-700 font-medium">Ready to send to {valid.length} prospect{valid.length !== 1 ? 's' : ''}</span>
            {skipped > 0 && (
              <div className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                <AlertCircle size={12} />{skipped} without email
              </div>
            )}
          </div>

          <div className="max-h-60 overflow-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {prospects.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-900 text-[13px]">{p.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{p.email || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{p.candidate_id || <span className="text-gray-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-5 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all">
            Cancel
          </button>
          <button onClick={send} disabled={sending || !valid.length} className={cn('px-4 py-2 text-sm font-semibold rounded-lg text-white flex items-center gap-2 transition-all shadow-sm', sending || !valid.length ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]')}>
            {sending ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending...</>) : (<><MailCheck className="w-3.5 h-3.5" />Send ({valid.length})</>)}
          </button>
        </div>
      </div>
    </div>
  );
};

const BatchReassignModal: React.FC<{
  open: boolean;
  onClose: () => void;
  prospects: Prospect[];
  onComplete: () => void;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ open, onClose, prospects, onComplete, toast }) => {
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);

    try {
      const successIds: number[] = [];

      for (const p of prospects) {
        try {
          const subject = `Reassignment Request – ${p.name}`;
          const body = buildReassignmentEmail(p);

          if (import.meta.env.DEV) {
            window.open(`mailto:${REASSIGNMENT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
          } else {
            const { error } = await supabase.functions.invoke('send_email', { body: { to: REASSIGNMENT_EMAIL, subject, body } });
            if (error) throw error;
          }
          successIds.push(p.id);
        } catch (err) {
          console.error(`Reassignment failed for ${p.name}:`, err);
          toast(`Failed to reassign ${p.name}`, 'error');
        }
      }

      if (successIds.length > 0) {
        toast(`Sent ${successIds.length} reassignment request(s)`, 'success');
      }

      onComplete();
      onClose();
    } catch (error) {
      console.error('Batch reassignment error:', error);
      toast('Batch reassignment failed', 'error');
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
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50 transition-colors" aria-label="Close">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">This will open an email draft to <span className="font-semibold text-gray-900">{REASSIGNMENT_EMAIL}</span> for {prospects.length} prospect{prospects.length !== 1 ? 's' : ''}</p>

          <div className="max-h-60 overflow-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {prospects.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-900 text-[13px]">{p.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{p.email || <span className="text-gray-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-5 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all">
            Cancel
          </button>
          <button onClick={send} disabled={sending} className={cn('px-4 py-2 text-sm font-semibold rounded-lg text-white flex items-center gap-2 transition-all shadow-sm', sending ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 active:scale-[0.98]')}>
            {sending ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending...</>) : (<><UserX className="w-3.5 h-3.5" />Request ({prospects.length})</>)}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// KANBAN COLUMN (Perfect sticky header with smooth scrolling)
// ============================================================================

const KanbanColumn: React.FC<{
  column: ColumnDefinition;
  prospects: Prospect[];
  dropTarget: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId?: number) => void;
  onDragStart: (e: React.DragEvent, p: Prospect) => void;
  onClick: (p: Prospect, action: 'edit' | 'email') => void;
  onArchive: (p: Prospect, status: ArchiveStatusId) => void;
  onMarkReady: (p: Prospect) => void;
  checked: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
}> = ({ column, prospects, dropTarget, onDragOver, onDragLeave, onDrop, onDragStart, onClick, onArchive, onMarkReady, checked, onToggle, onSelectAll }) => {
  const allChecked = prospects.length > 0 && prospects.every(p => checked.has(p.id));
  const [dragOverCard, setDragOverCard] = useState<number | null>(null);

  return (
    <div className="flex flex-col h-full">
      {/* STICKY COLUMN HEADER */}
      <div className="mb-4 bg-gradient-to-b from-gray-50 to-transparent pb-3 sticky top-0 z-10">
        <div className="flex items-baseline gap-3 mb-1.5">
          <h3 className="text-[15px] font-semibold tracking-tight text-gray-900">{column.label}</h3>
          <span className="text-[13px] font-medium text-gray-400 tabular-nums">{prospects.length}</span>
          {prospects.length > 0 && (
            <button onClick={onSelectAll} className={cn(
              'ml-auto text-[11px] font-medium uppercase tracking-wide transition-colors',
              allChecked ? 'text-blue-600 hover:text-blue-700' : 'text-gray-400 hover:text-gray-600'
            )}>
              {allChecked ? 'Deselect' : 'Select All'}
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-500 tracking-wide">{column.description}</p>
      </div>

      {/* SCROLLABLE CONTENT AREA */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOverCard(null); onDrop(e); }}
        className={cn(
          "flex-1 space-y-3 p-3 rounded-xl bg-gray-50/60 border-2 overflow-y-auto",
          dropTarget ? "border-blue-400 bg-blue-50/30" : "border-transparent"
        )}
      >
        {prospects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4">
            <div className="w-full max-w-[180px] border-2 border-dashed border-gray-200 rounded-lg p-6">
              <p className="text-sm font-medium text-gray-700">No prospects</p>
              <p className="text-xs text-gray-400 mt-1">Drag cards here</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {prospects.map((p, i) => (
              <React.Fragment key={p.id}>
                {dragOverCard === p.id && (
                  <div className="h-1 bg-blue-500 rounded-full animate-pulse" />
                )}
                <div
                  draggable
                  onDragStart={e => onDragStart(e, p)}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverCard(p.id); }}
                  onDragLeave={() => setDragOverCard(null)}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOverCard(null); onDrop(e, p.id); }}
                  className="cursor-move"
                >
                  <ProspectCard
                    prospect={p}
                    onEdit={() => onClick(p, 'edit')}
                    onEmail={() => onClick(p, 'email')}
                    onArchive={s => onArchive(p, s)}
                    onMarkReady={() => onMarkReady(p)}
                    checked={checked.has(p.id)}
                    onToggle={() => onToggle(p.id)}
                    index={i}
                  />
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN DASHBOARD (Complete with Fixed handleAddProspect + Field Mapping)
// ============================================================================

export default function ProspectsDashboard() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [loading, setLoading] = useState(true);
  const [archivedCounts, setArchivedCounts] = useState({ notInterested: 0 });
  const [dragOver, setDragOver] = useState<VisibleColumnId | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const checkedProspects = useMemo(() => {
    const checkedMap = new Map(prospects.filter(p => checked.has(p.id)).map(p => [p.id, p]));
    return Array.from(checked).map(id => checkedMap.get(id)).filter(Boolean) as Prospect[];
  }, [prospects, checked]);

  const showToast = useCallback((msg: string, type: Toast['type'] = 'info') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('prospects')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const allProspects = (data || []).map(p => ({
        ...p,
        status: p.status || 'New',
        profile_score: 0,
        references_verified: 0,
        profile_complete: false,
      }));

      setArchivedCounts({
        notInterested: allProspects.filter(p => p.status === 'Not Interested').length
      });

      const visible = allProspects.filter(p => VISIBLE_COLUMNS.some(c => c.id === p.status));

      const deduped = Array.from(
        new Map(visible.map(p => [p.id, p])).values()
      );

      setProspects(deduped);
    } catch (error) {
      console.error('Load error:', error);
      showToast('Failed to load prospects', 'error');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(true); }, [load]);

  const { byStatus, stats } = useMemo(() => {
    const filtered = prospects.filter(p =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      p.specialty?.toLowerCase().includes(search.toLowerCase())
    );

    const grouped = VISIBLE_COLUMNS.reduce((acc, col) => {
      acc[col.id] = filtered.filter(p => p.status === col.id);
      return acc;
    }, {} as Record<VisibleColumnId, Prospect[]>);

    const ready = filtered.filter(p => (p.profile_score || 0) === 100).length;

    return { byStatus: grouped, stats: { total: filtered.length, ready, ...archivedCounts } };
  }, [prospects, search, archivedCounts]);

  // ============================================================================
  // FIXED: handleAddProspect - Complete Schema Mapping + Field Name Mapping
  // Maps full_name→name and primary_specialty→specialty from AddProspect
  // ============================================================================
  
  const handleAddProspect = async (prospectData: Partial<Prospect>) => {
    try {
      console.log('[AddProspect] Starting save operation');
      console.log('[AddProspect] Received data:', JSON.stringify(prospectData, null, 2));
      
      // ========================================================================
      // STEP 1: FIELD NAME MAPPING
      // AddProspect uses different field names than the database
      // Map them here before building the insert payload
      // ========================================================================
      
      const mappedData = {
        ...prospectData,
        // Map full_name → name (if present)
        name: (prospectData as any).full_name || prospectData.name,
        // Map primary_specialty → specialty (if present)
        specialty: (prospectData as any).primary_specialty || prospectData.specialty,
      };
      
      // Remove old field names to keep payload clean
      delete (mappedData as any).full_name;
      delete (mappedData as any).primary_specialty;
      
      console.log('[AddProspect] After field mapping:', JSON.stringify(mappedData, null, 2));
      
      // ========================================================================
      // STEP 2: BUILD INSERT PAYLOAD
      // ========================================================================
      
      const dataToInsert: Record<string, any> = {
        // Core identification
        candidate_id: mappedData.candidate_id,
        name: mappedData.name,  // ← Now correctly mapped from full_name
        
        // Contact information
        email: mappedData.email,
        phone: mappedData.phone,
        
        // Professional details
        profession: mappedData.profession,
        specialty: mappedData.specialty,  // ← Now correctly mapped from primary_specialty
        home_state: mappedData.home_state,
        
        // Nova integration
        nova_url: mappedData.nova_url,
        
        // Notes and metadata
        notes: mappedData.notes,
        metadata: mappedData.metadata || {},
        
        // Status and priority
        status: mappedData.status || 'New',
        priority: mappedData.priority || 'Medium',
        
        // Optional fields (only include if provided)
        ...(mappedData.licenses && { licenses: mappedData.licenses }),
        ...(mappedData.rto_notes && { rto_notes: mappedData.rto_notes }),
        ...(mappedData.recruiter && { recruiter: mappedData.recruiter }),
        ...(mappedData.recruiter_id && { recruiter_id: mappedData.recruiter_id }),
        ...(mappedData.source && { source: mappedData.source }),
        ...(mappedData.available_start_date && { available_start_date: mappedData.available_start_date }),
      };

      // ========================================================================
      // STEP 3: CLEAN NULL/UNDEFINED VALUES
      // ========================================================================
      
      Object.keys(dataToInsert).forEach(key => {
        const value = dataToInsert[key];
        if (value === undefined || value === null || value === '') {
          delete dataToInsert[key];
        }
      });

      // Ensure metadata is always an object
      if (!dataToInsert.metadata || typeof dataToInsert.metadata !== 'object') {
        dataToInsert.metadata = {};
      }

      console.log('[AddProspect] Cleaned payload:', JSON.stringify(dataToInsert, null, 2));

      // ========================================================================
      // STEP 4: VALIDATE REQUIRED FIELDS
      // ========================================================================
      
      if (!dataToInsert.candidate_id) {
        throw new Error('Candidate ID is required');
      }
      if (!dataToInsert.name) {
        throw new Error('Name is required');
      }
      if (!dataToInsert.email) {
        throw new Error('Email is required');
      }

      // ========================================================================
      // STEP 5: DATABASE INSERT
      // ========================================================================
      
      const { data, error } = await supabase
        .from('prospects')
        .insert([dataToInsert])
        .select('*');

      if (error) {
        console.error('[AddProspect] Database error:', error);
        
        // Handle specific errors
        if (error.code === '23505') {
          if (error.message.includes('candidate_id')) {
            throw new Error('This candidate is already in your prospects');
          }
          throw new Error('A prospect with this information already exists');
        }
        
        throw new Error(error.message || 'Failed to save prospect to database');
      }

      if (!data || data.length === 0) {
        throw new Error('No data returned from database after insert');
      }

      console.log('[AddProspect] Successfully saved:', data[0]);
      console.log('[AddProspect] Saved fields:', Object.keys(data[0]).filter(k => data[0][k] !== null).join(', '));

      await load();
      showToast('Prospect added successfully', 'success');

      return data;

    } catch (error: any) {
      console.error('[AddProspect] Save failed:', error);
      showToast(error?.message || 'Failed to add prospect', 'error');
      throw error;
    }
  };

  const handleArchive = async (p: Prospect, status: ArchiveStatusId) => {
    try {
      const { error } = await supabase.from('prospects').update({
        status: status
      }).eq('id', p.id);

      if (error) throw error;
      await load();
      showToast(`${p.name} moved to ${status}`, 'success');
    } catch (error) {
      console.error('Archive error:', error);
      showToast('Failed to archive prospect', 'error');
    }
  };
  
  const handleMarkReady = async (p: Prospect) => {
    try {
        const { error } = await supabase.from('prospects').update({
            status: 'Submittal Ready'
        }).eq('id', p.id);

        if (error) throw error;
        await load();
        showToast(`${p.name} is ready for submittal`, 'success');
    } catch (error) {
        console.error('Mark ready error:', error);
        showToast('Failed to update prospect status', 'error');
    }
  };

  const handleDrop = async (e: React.DragEvent, colId: VisibleColumnId, _targetId?: number) => {
    e.preventDefault();
    setDragOver(null);

    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    const originalProspect = prospects.find(x => x.id === data.id);
    if (!originalProspect || originalProspect.status === colId) return;

    try {
      setProspects(current => current.map(p => p.id === originalProspect.id ? { ...p, status: colId } : p));

      const { error } = await supabase.from('prospects').update({
        status: colId
      }).eq('id', originalProspect.id);

      if (error) {
        setProspects(current => current.map(p => p.id === originalProspect.id ? { ...p, status: originalProspect.status } : p));
        throw error;
      }
      await load();
      showToast(`Moved ${originalProspect.name} to ${colId}`, 'success');
    } catch (error) {
      console.error('Drop error:', error);
      showToast('Failed to move prospect', 'error');
    }
  };

  const toggleCheck = (id: number) => setChecked(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const toggleAll = (colId: VisibleColumnId) => {
    setChecked(prev => {
      const next = new Set(prev);
      const ids = (byStatus[colId] ?? []).map(p => p.id);
      const allSelected = ids.length > 0 && ids.every(id => next.has(id));
      ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center animate-fadeIn">
          <Loader2 className="w-7 h-7 text-gray-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600 font-medium">Loading prospects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-20 animate-fadeIn" style={{ opacity: 0 }}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Prospecting Dashboard</h1>
              <p className="text-xs text-gray-500 mt-1">
                <span className="font-semibold text-gray-700 tabular-nums">{stats.total}</span> Active · 
                <span className="font-semibold text-gray-700 tabular-nums ml-1">{stats.ready}</span> Ready · 
                <span className="font-semibold text-gray-700 tabular-nums ml-1">{stats.notInterested}</span> Archived
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search prospects..."
                  className="w-64 pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-400"
                  aria-label="Search prospects"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 transition-colors" aria-label="Clear search">
                    <X size={14} className="text-gray-500" />
                  </button>
                )}
              </div>

              <button onClick={() => { setModal('add'); setSelected(null); }} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 active:scale-[0.98] transition-all shadow-sm">
                <Plus size={15} />
                Add Prospect
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* SELECTED ACTIONS BAR */}
      {checkedProspects.length > 0 && (
        <div className="px-6 pt-4 animate-slideDown">
          <div className="mb-4 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-800">
              <CheckSquare className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-gray-900 tabular-nums">{checkedProspects.length}</span>
              <span className="text-gray-600">selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setModal('batch_reference')} className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5 transition-all uppercase tracking-wide">
                <MailCheck className="w-3.5 h-3.5" />
                Send Reference
              </button>
              <button onClick={() => setModal('batch_reassignment')} className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5 transition-all uppercase tracking-wide">
                <UserX className="w-3.5 h-3.5" />
                Reassign
              </button>
              <div className="w-px h-4 bg-gray-200 mx-1" />
              <button onClick={() => setChecked(new Set())} className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KANBAN COLUMNS */}
      <main className="flex-1 p-6 overflow-hidden">
        <div className="grid grid-cols-5 gap-4 h-[calc(100vh-200px)]">
          {VISIBLE_COLUMNS.map((col, i) => (
            <div key={col.id} className="h-full overflow-hidden animate-fadeInUp" style={{ animationDelay: `${i * 75}ms`, opacity: 0 }}>
              <KanbanColumn
                column={col}
                prospects={byStatus[col.id] ?? []}
                dropTarget={dragOver === col.id}
                onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e, tid) => handleDrop(e, col.id, tid)}
                onDragStart={(e, p) => e.dataTransfer.setData('text/plain', JSON.stringify({ id: p.id, currentStatus: p.status }))}
                onClick={(p, action) => { setModal(action); setSelected(p); }}
                onArchive={handleArchive}
                onMarkReady={handleMarkReady}
                checked={checked}
                onToggle={toggleCheck}
                onSelectAll={() => toggleAll(col.id)}
              />
            </div>
          ))}
        </div>
      </main>

      {/* TOAST */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-5 right-5 px-4 py-3 rounded-lg text-sm font-medium text-white shadow-xl z-50 flex items-center gap-2.5 animate-slideUp',
            { 
              'bg-gray-900': toast.type === 'info', 
              'bg-green-600': toast.type === 'success', 
              'bg-red-600': toast.type === 'error' 
            }
          )}
        >
          {toast.type === 'success' && <CheckCircle size={15} />}
          {toast.type === 'error' && <AlertTriangle size={15} />}
          {toast.type === 'info' && <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* MODALS */}
      {modal === 'add' && (
        <AddProspectModal onClose={() => setModal(null)} onSave={handleAddProspect} showToast={showToast} />
      )}
      {modal === 'edit' && selected && (
        <EditProspectModal
          prospect={selected}
          onClose={() => setModal(null)}
          onUpdate={() => { load(); setModal(null); showToast('Prospect updated', 'success'); }}
          showToastNotification={showToast}
          supabase={supabase}
        />
      )}
      {modal === 'email' && selected && (
        <EmailTemplateModal
          prospect={selected}
          extractedData={null}
          onClose={() => setModal(null)}
          onSend={async () => {
            if (selected.status === 'New') {
              await supabase.from('prospects').update({
                status: 'Contacted'
              }).eq('id', selected.id);
              await load();
            }
            setModal(null);
          }}
          showToastNotification={showToast}
        />
      )}
      {modal === 'batch_reference' && (
        <BatchReferenceModal open={true} onClose={() => setModal(null)} prospects={checkedProspects} onComplete={() => { load(); setChecked(new Set()); }} toast={showToast} />
      )}
      {modal === 'batch_reassignment' && (
        <BatchReassignModal open={true} onClose={() => setModal(null)} prospects={checkedProspects} onComplete={() => { load(); setChecked(new Set()); }} toast={showToast} />
      )}

      {/* GLOBAL STYLES */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes fadeInUp {
          from { 
            opacity: 0;
            transform: translateY(10px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideDown {
          from { 
            opacity: 0;
            transform: translateY(-10px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(10px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes scaleIn {
          from { 
            opacity: 0;
            transform: scale(0.95);
          }
          to { 
            opacity: 1;
            transform: scale(1);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
        
        .animate-fadeInUp {
          animation: fadeInUp 0.4s ease-out forwards;
        }
        
        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
        
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
        
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
        
        ::-webkit-scrollbar { 
          width: 0; 
          height: 0; 
        }
        
        * { 
          scrollbar-width: none; 
          -ms-overflow-style: none; 
        }
      `}</style>
    </div>
  );
}