// src/components/ProspectDetailModal.tsx

import React, { useState, useCallback, useEffect } from 'react';
import { X, Phone, Mail, MapPin, Calendar, CircleCheck as CheckCircle, Circle, ExternalLink, CreditCard as Edit2, UserCheck, UserX, Clock, FileText, CircleAlert as AlertCircle, ChevronRight, Loader as Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EditProspectModal } from './prospects/EditProspectModal';
import { EmailTemplateModal } from './prospects/EmailTemplateModal';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Prospect {
  id: number;
  candidate_id?: number;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  profession: string | null;
  status: string;
  home_state: string | null;
  licenses: string[] | null;
  notes: string | null;
  recruiter?: string | null;
  references_verified?: number;
  profile_complete?: boolean;
  available_start_date?: string | null;
  rto_notes?: string | null;
  reassignment_requested_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface ProspectDetailModalProps {
  prospect: Prospect;
  onClose: () => void;
  onUpdate: () => void;
  showToastNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface Requirement {
  key: string;
  label: string;
  value: string | null;
  isComplete: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}

// ============================================================================
// UTILITIES
// ============================================================================

const classNames = (...classes: (string | boolean | null | undefined)[]) => 
  classes.filter(Boolean).join(' ');

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatPhoneNumber = (phone: string | null) => {
  if (!phone) return '—';
  const cleaned = phone.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }
  return phone;
};

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    'New': 'bg-slate-100 text-slate-700 border-slate-200',
    'Contacted': 'bg-blue-100 text-blue-700 border-blue-200',
    'Interested': 'bg-amber-100 text-amber-700 border-amber-200',
    'Profile Updates': 'bg-purple-100 text-purple-700 border-purple-200',
    'Submittal Ready': 'bg-green-100 text-green-700 border-green-200',
    'Not Interested': 'bg-red-100 text-red-700 border-red-200'
  };
  return colors[status] || 'bg-gray-100 text-gray-700 border-gray-200';
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ProspectDetailModal({
  prospect,
  onClose,
  onUpdate,
  showToastNotification
}: ProspectDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);

  // Load pay package data for email template
  useEffect(() => {
    const loadPayPackage = async () => {
      try {
        const { data } = await supabase
          .from('pay_packages')
          .select('*')
          .eq('source', 'outreach')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        setExtractedData(data);
      } catch (error) {
        console.error('Error loading pay package:', error);
      }
    };
    
    loadPayPackage();
  }, []);

  // Requirements calculation
  const requirements: Requirement[] = [
    {
      key: 'references',
      label: 'References Verified',
      value: `${prospect.references_verified || 0}/2`,
      isComplete: (prospect.references_verified || 0) >= 2,
      icon: FileText,
      color: 'green'
    },
    {
      key: 'profile',
      label: 'Profile Complete',
      value: prospect.profile_complete ? 'Complete' : 'Incomplete',
      isComplete: prospect.profile_complete === true,
      icon: UserCheck,
      color: 'blue'
    },
    {
      key: 'licenses',
      label: 'Active Licenses',
      value: prospect.licenses?.join(', ') || null,
      isComplete: !!(prospect.licenses && prospect.licenses.length > 0),
      icon: MapPin,
      color: 'purple'
    },
    {
      key: 'availability',
      label: 'Available Start Date',
      value: prospect.available_start_date ? formatDate(prospect.available_start_date) : null,
      isComplete: !!prospect.available_start_date,
      icon: Calendar,
      color: 'amber'
    },
    {
      key: 'rto',
      label: 'RTO Confirmed',
      value: prospect.rto_notes || null,
      isComplete: !!prospect.rto_notes,
      icon: CheckCircle,
      color: 'indigo'
    }
  ];

  const completedCount = requirements.filter(r => r.isComplete).length;
  const readinessPercentage = Math.round((completedCount / requirements.length) * 100);
  const isFullyReady = readinessPercentage === 100;

  // Handlers
  const handleArchive = async (status: 'Submittal Ready' | 'Not Interested') => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('prospects')
        .update({ 
          status, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', prospect.id);
      
      if (error) throw error;
      
      showToastNotification(`${prospect.name} marked as ${status}`, 'success');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error archiving prospect:', error);
      showToastNotification('Failed to update prospect', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSent = async () => {
    await supabase
      .from('prospects')
      .update({ 
        status: 'Contacted', 
        updated_at: new Date().toISOString() 
      })
      .eq('id', prospect.id);
    
    setShowEmailModal(false);
    showToastNotification('Email sent successfully', 'success');
    onUpdate();
  };

  const handleEditComplete = () => {
    setShowEditModal(false);
    showToastNotification('Prospect updated successfully', 'success');
    onUpdate();
  };

  const openExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 z-50">
        <div 
          className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
          onClick={onClose} 
        />
        
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 px-6 py-5 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-gray-900">
                  {prospect.name}
                </h2>
                <div className="flex items-center gap-3 mt-2">
                  <span className={classNames(
                    'inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border',
                    getStatusColor(prospect.status)
                  )}>
                    {prospect.status}
                  </span>
                  
                  {prospect.specialty && (
                    <span className="text-sm text-gray-600">
                      {prospect.specialty}
                    </span>
                  )}
                  
                  {prospect.candidate_id && (
                    <button
                      onClick={() => openExternalLink(
                        `https://nova.ayahealthcare.com/#/recruiting/candidates/${prospect.candidate_id}/new-profile/about`
                      )}
                      className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                    >
                      Nova Profile
                      <ExternalLink size={12} />
                    </button>
                  )}
                </div>
              </div>
              
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-6">
              {/* Contact Information */}
              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Contact Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Mail size={16} className="text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 mb-0.5">Email</p>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {prospect.email || '—'}
                      </p>
                    </div>
                    {prospect.email && (
                      <button
                        onClick={() => setShowEmailModal(true)}
                        className="p-1.5 hover:bg-white rounded-md transition-colors"
                      >
                        <ChevronRight size={14} className="text-gray-400" />
                      </button>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Phone size={16} className="text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 mb-0.5">Phone</p>
                      <p className="text-sm font-medium text-gray-900">
                        {formatPhoneNumber(prospect.phone)}
                      </p>
                    </div>
                    {prospect.phone && (
                      <button
                        onClick={() => openExternalLink(`tel:${prospect.phone.replace(/\D/g, '')}`)}
                        className="p-1.5 hover:bg-white rounded-md transition-colors"
                      >
                        <ChevronRight size={14} className="text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Requirements Progress */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Submittal Requirements
                  </h3>
                  <span className={classNames(
                    'text-sm font-semibold',
                    isFullyReady ? 'text-green-600' : 'text-gray-500'
                  )}>
                    {readinessPercentage}% Complete
                  </span>
                </div>
                
                {/* Progress Bar */}
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
                  <div
                    className={classNames(
                      'h-full transition-all duration-500',
                      isFullyReady 
                        ? 'bg-gradient-to-r from-green-500 to-green-400'
                        : readinessPercentage >= 75 
                          ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                          : readinessPercentage >= 50 
                            ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                            : 'bg-gray-300'
                    )}
                    style={{ width: `${readinessPercentage}%` }}
                  />
                </div>
                
                {/* Requirements List */}
                <div className="space-y-2">
                  {requirements.map(req => (
                    <div
                      key={req.key}
                      className={classNames(
                        'flex items-center gap-3 p-3 rounded-lg border transition-all',
                        req.isComplete 
                          ? 'bg-green-50/50 border-green-200' 
                          : 'bg-gray-50 border-gray-200'
                      )}
                    >
                      {req.isComplete ? (
                        <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
                      ) : (
                        <Circle size={18} className="text-gray-300 flex-shrink-0" />
                      )}
                      
                      <div className="flex-1">
                        <p className={classNames(
                          'text-sm font-medium',
                          req.isComplete ? 'text-gray-900' : 'text-gray-500'
                        )}>
                          {req.label}
                        </p>
                        {req.value && (
                          <p className="text-xs text-gray-600 mt-0.5">
                            {req.value}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Additional Information */}
              {(prospect.home_state || prospect.recruiter || prospect.notes) && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Additional Information
                  </h3>
                  <div className="space-y-3">
                    {prospect.home_state && (
                      <div className="flex items-start gap-3">
                        <MapPin size={16} className="text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Home State</p>
                          <p className="text-sm text-gray-900 mt-0.5">{prospect.home_state}</p>
                        </div>
                      </div>
                    )}
                    
                    {prospect.recruiter && (
                      <div className="flex items-start gap-3">
                        <UserCheck size={16} className="text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Recruiter</p>
                          <p className="text-sm text-gray-900 mt-0.5">{prospect.recruiter}</p>
                        </div>
                      </div>
                    )}
                    
                    {prospect.notes && (
                      <div className="flex items-start gap-3">
                        <FileText size={16} className="text-gray-400 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500">Notes</p>
                          <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">
                            {prospect.notes}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Timestamps */}
              <section className="pt-4 border-t border-gray-100">
                <div className="flex items-center gap-6 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} />
                    <span>Created {formatDate(prospect.created_at)}</span>
                  </div>
                  {prospect.updated_at && (
                    <div className="flex items-center gap-1.5">
                      <Clock size={12} />
                      <span>Updated {formatDate(prospect.updated_at)}</span>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isFullyReady && (
                  <button
                    onClick={() => handleArchive('Submittal Ready')}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <UserCheck size={14} />
                    )}
                    Mark Submittal Ready
                  </button>
                )}
                
                <button
                  onClick={() => handleArchive('Not Interested')}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <UserX size={14} />
                  )}
                  Not Interested
                </button>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEditModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Edit2 size={14} />
                  Edit
                </button>
                
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <EditProspectModal
          prospect={prospect}
          onClose={() => setShowEditModal(false)}
          onUpdate={handleEditComplete}
          showToastNotification={showToastNotification}
          supabase={supabase}
        />
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <EmailTemplateModal
          prospect={prospect}
          extractedData={extractedData}
          onClose={() => setShowEmailModal(false)}
          onSend={handleEmailSent}
          showToastNotification={showToastNotification}
        />
      )}
    </>
  );
}