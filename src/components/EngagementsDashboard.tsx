import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, X, Edit3, Trash2, Loader, UserCheck, Briefcase, Calendar } from 'lucide-react';
import { engagementsService, jobsService } from '../services/schemaService';
import { supabase } from '../lib/supabase';
import type { EngagementWithRelations, EngagementInput, JobWithFacility, EngagementStatus } from '../types/schema';
import { ENGAGEMENT_STATUS } from '../types/schema';

const cn = (...classes: (string | boolean | undefined | null)[]) =>
  classes.filter(Boolean).join(' ');

type ModalType = 'add' | 'edit' | 'delete' | null;

const EngagementsDashboard: React.FC = () => {
  const [engagements, setEngagements] = useState<EngagementWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EngagementStatus | 'All'>('All');
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedEngagement, setSelectedEngagement] = useState<EngagementWithRelations | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadEngagements = async () => {
    setLoading(true);
    try {
      const data = await engagementsService.getAll();
      setEngagements(data);
    } catch (error) {
      console.error('Error loading engagements:', error);
      showToast('Failed to load engagements', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEngagements();
  }, []);

  const filteredEngagements = useMemo(() => {
    let filtered = engagements;

    if (statusFilter !== 'All') {
      filtered = filtered.filter(e => e.status === statusFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.prospect?.name.toLowerCase().includes(q) ||
        e.job?.facility?.name.toLowerCase().includes(q) ||
        e.job?.specialty.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [engagements, searchQuery, statusFilter]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openModal = (type: ModalType, engagement?: EngagementWithRelations) => {
    setModal(type);
    setSelectedEngagement(engagement || null);
  };

  const closeModal = () => {
    setModal(null);
    setSelectedEngagement(null);
  };

  const getStatusColor = (status: EngagementStatus) => {
    switch (status) {
      case 'Offered': return 'bg-blue-50 text-blue-700';
      case 'Accepted': return 'bg-green-50 text-green-700';
      case 'Active': return 'bg-emerald-50 text-emerald-700';
      case 'Completed': return 'bg-gray-50 text-gray-700';
      case 'Cancelled': return 'bg-red-50 text-red-700';
      default: return 'bg-gray-50 text-gray-700';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
        .animate-slideIn { animation: slideIn 0.3s ease-out forwards; }
      `}</style>

      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Engagements</h1>
              <p className="text-xs text-gray-500 mt-1">
                Manage clinician assignments and placements
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {(['All', ...ENGAGEMENT_STATUS] as const).map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                      statusFilter === status
                        ? 'bg-gray-900 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search engagements..."
                  className="w-64 pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-400"
                />
              </div>
              <button
                onClick={() => openModal('add')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 active:scale-[0.98] transition-all shadow-sm"
              >
                <Plus size={15} />
                Add Engagement
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white border border-gray-200/75 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/75 border-b border-gray-200/75">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Clinician</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Details</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16">
                      <Loader className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filteredEngagements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-gray-500">
                      No engagements found.
                    </td>
                  </tr>
                ) : (
                  filteredEngagements.map((engagement, index) => (
                    <tr key={engagement.id} className="hover:bg-gray-50/50 transition-colors animate-fadeIn" style={{ animationDelay: `${Math.min(index * 20, 400)}ms`, opacity: 0 }}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <UserCheck size={16} className="text-gray-400" />
                          <span className="font-semibold text-gray-900">{engagement.prospect?.name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-gray-900">
                          <Briefcase size={14} className="text-gray-400" />
                          {engagement.job?.specialty || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {engagement.job?.facility?.name || 'Unknown Facility'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600 text-xs">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} className="text-gray-400" />
                          {formatDate(engagement.start_date)} → {formatDate(engagement.end_date)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={cn('px-2.5 py-0.5 text-xs font-medium rounded-full', getStatusColor(engagement.status))}>
                          {engagement.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openModal('edit', engagement)} className="p-2 rounded-md hover:bg-gray-100 transition-colors">
                            <Edit3 size={14} className="text-gray-500" />
                          </button>
                          <button onClick={() => openModal('delete', engagement)} className="p-2 rounded-md hover:bg-gray-100 transition-colors">
                            <Trash2 size={14} className="text-gray-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {modal && (
        <EngagementModal
          type={modal}
          engagement={selectedEngagement}
          onClose={closeModal}
          onSuccess={() => {
            loadEngagements();
            showToast(
              modal === 'add' ? 'Engagement created successfully' :
              modal === 'edit' ? 'Engagement updated successfully' :
              'Engagement deleted successfully',
              'success'
            );
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-slideIn">
          <div className={cn(
            'px-4 py-3 rounded-lg shadow-lg text-sm font-medium',
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          )}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
};

interface EngagementModalProps {
  type: ModalType;
  engagement: EngagementWithRelations | null;
  onClose: () => void;
  onSuccess: () => void;
}

const EngagementModal: React.FC<EngagementModalProps> = ({ type, engagement, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<EngagementInput>({
    prospect_id: engagement?.prospect_id || 0,
    job_id: engagement?.job_id || 0,
    status: engagement?.status || 'Offered',
    start_date: engagement?.start_date || new Date().toISOString().split('T')[0],
    end_date: engagement?.end_date || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });
  const [prospects, setProspects] = useState<{ id: number; name: string }[]>([]);
  const [jobs, setJobs] = useState<JobWithFacility[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [prospectsData, jobsData] = await Promise.all([
          supabase.from('prospects').select('id, name').order('name'),
          jobsService.getAll()
        ]);

        if (prospectsData.error) throw prospectsData.error;
        if (prospectsData.data) setProspects(prospectsData.data);
        setJobs(jobsData);
      } catch (err) {
        console.error('Error loading data:', err);
      }
    };

    if (type !== 'delete') {
      loadData();
    }
  }, [type]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? 0 : Number(value)) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.prospect_id || formData.prospect_id === 0) {
      setError('Please select a clinician.');
      return;
    }

    if (!formData.job_id || formData.job_id === 0) {
      setError('Please select a job.');
      return;
    }

    if (new Date(formData.end_date) <= new Date(formData.start_date)) {
      setError('End date must be after start date.');
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      if (type === 'edit' && engagement) {
        await engagementsService.update(engagement.id, formData);
      } else {
        await engagementsService.create(formData);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save engagement:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!engagement) return;
    setIsSaving(true);
    try {
      await engagementsService.delete(engagement.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to delete engagement:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const modalTitle = type === 'add' ? 'Add New Engagement' : type === 'edit' ? 'Edit Engagement' : 'Delete Engagement';
  const isDeleteModal = type === 'delete';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl animate-fadeIn" style={{ animationDelay: '50ms' }}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{modalTitle}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {isDeleteModal ? (
          <div className="p-6">
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete this engagement? This action cannot be undone.
            </p>
            {error && <p className="text-xs text-red-600 mb-4">{error}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={isSaving} className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-red-600 hover:bg-red-700 transition-all shadow-sm flex items-center gap-2">
                {isSaving && <Loader className="w-4 h-4 animate-spin" />}
                Delete Engagement
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="prospect_id" className="block text-xs font-medium text-gray-600 mb-1">Clinician</label>
                  <select
                    id="prospect_id"
                    name="prospect_id"
                    value={formData.prospect_id}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  >
                    <option value={0} disabled>Select clinician...</option>
                    {prospects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="job_id" className="block text-xs font-medium text-gray-600 mb-1">Job</label>
                  <select
                    id="job_id"
                    name="job_id"
                    value={formData.job_id}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  >
                    <option value={0} disabled>Select job...</option>
                    {jobs.map(j => (
                      <option key={j.id} value={j.id}>
                        {j.specialty} - {j.facility?.name || 'Unknown'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="status" className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  {ENGAGEMENT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="start_date" className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    id="start_date"
                    name="start_date"
                    value={formData.start_date}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="end_date" className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                  <input
                    type="date"
                    id="end_date"
                    name="end_date"
                    value={formData.end_date}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-gray-900 hover:bg-gray-800 transition-all shadow-sm flex items-center gap-2">
                {isSaving && <Loader className="w-4 h-4 animate-spin" />}
                {type === 'add' ? 'Create Engagement' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default EngagementsDashboard;
