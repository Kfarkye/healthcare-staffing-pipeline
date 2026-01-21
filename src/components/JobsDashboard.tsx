import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, X, Edit3, Trash2, Loader, Briefcase, MapPin, Clock, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { jobsService, facilitiesService } from '../services/schemaService';
import type { JobWithFacility, JobInput, Facility, JobStatus } from '../types/schema';
import { JOB_STATUS, SPECIALTY, SHIFT_TYPE } from '../types/schema';
import { DashboardShell } from './shared/DashboardShell';
import { PrecisionTable } from './shared/PrecisionTable';
import { SuccessBadge, WarningBadge, AccentBadge, DefaultBadge } from './shared/Badges';
import { cn } from '../lib/utils';

type ModalType = 'add' | 'edit' | 'delete' | null;

const JobsDashboard: React.FC = () => {
  const [jobs, setJobs] = useState<JobWithFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'All'>('All');
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedJob, setSelectedJob] = useState<JobWithFacility | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const data = await jobsService.getAll();
      setJobs(data);
    } catch (error) {
      console.error('Error loading jobs:', error);
      showToast('Failed to load jobs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const filteredJobs = useMemo(() => {
    let filtered = jobs;

    if (statusFilter !== 'All') {
      filtered = filtered.filter(j => j.status === statusFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(j =>
        j.specialty.toLowerCase().includes(q) ||
        j.facility?.name.toLowerCase().includes(q) ||
        j.facility?.city.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [jobs, searchQuery, statusFilter]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openModal = (type: ModalType, job?: JobWithFacility) => {
    setModal(type);
    setSelectedJob(job || null);
  };

  const closeModal = () => {
    setModal(null);
    setSelectedJob(null);
  };

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case 'Open': return <SuccessBadge>Open</SuccessBadge>;
      case 'On Hold': return <WarningBadge>On Hold</WarningBadge>;
      case 'Filled': return <AccentBadge>Filled</AccentBadge>;
      case 'Cancelled': return <DefaultBadge>Cancelled</DefaultBadge>;
      default: return <span className="text-slate-400">Unknown</span>;
    }
  };

  const HeaderActions = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => openModal('add')}
        className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-[14px] transition-all shadow-lift font-bold text-[13px] active:scale-95"
      >
        <Plus size={16} strokeWidth={2.5} />
        <span>Add Job</span>
      </button>
      <button
        onClick={loadJobs}
        className="p-2.5 bg-white border border-slate-200/60 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-[14px] transition-all active:scale-95 shadow-lift"
        title="Refresh"
      >
        <RefreshCw size={18} strokeWidth={2.5} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );

  const tableColumns = [
    {
      header: 'Specialty',
      accessor: (job: JobWithFacility) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            <Briefcase size={16} />
          </div>
          <span className="font-bold text-slate-900">{job.specialty}</span>
        </div>
      )
    },
    {
      header: 'Facility',
      accessor: (job: JobWithFacility) => (
        <div className="space-y-1">
          <div className="font-semibold text-slate-900">{job.facility?.name || 'Unknown'}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <MapPin size={12} className="text-slate-400" />
            {job.facility?.city}, {job.facility?.state}
          </div>
        </div>
      )
    },
    {
      header: 'Details',
      accessor: (job: JobWithFacility) => (
        <div className="flex items-center gap-2 text-[12px] text-slate-600 font-medium">
          <Clock size={13} className="text-slate-400" />
          <span>{job.shift} • {job.hours_per_week}h/wk • {job.duration_weeks}w</span>
        </div>
      )
    },
    {
      header: 'Start Date',
      accessor: (job: JobWithFacility) => (
        <div className="text-slate-600 font-medium whitespace-nowrap">
          {new Date(job.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      )
    },
    {
      header: 'Status',
      accessor: (job: JobWithFacility) => getStatusBadge(job.status)
    },
    {
      header: '',
      id: 'actions',
      className: 'text-right',
      accessor: (job: JobWithFacility) => (
        <div className="flex items-center justify-end gap-1 px-2">
          <button
            onClick={() => openModal('edit', job)}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
          >
            <Edit3 size={15} />
          </button>
          <button
            onClick={() => openModal('delete', job)}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )
    }
  ];

  return (
    <>
      <DashboardShell
        title="Job Openings"
        subtitle="Master repository of active positions and facility requirements."
        eyebrow="Inventory"
        actions={HeaderActions}
      >
        <div className="space-y-6">
          {/* Unified Filter Bar */}
          <div className="precision-glass rounded-[28px] p-5 flex items-center justify-between gap-4 shadow-lift border-white/20">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative group flex-1 max-w-sm">
                <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search jobs..."
                  className="w-full pl-11 pr-4 py-2.5 bg-white/50 border border-slate-200/60 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 focus:bg-white transition-all text-[14px] font-medium tracking-tight shadow-sm"
                />
              </div>

              <div className="h-6 w-px bg-slate-200 mx-2" />

              <div className="flex items-center gap-1.5">
                {(['All', ...JOB_STATUS] as const).map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      'px-4 py-2 text-[12px] font-bold rounded-[12px] transition-all active:scale-95',
                      statusFilter === status
                        ? 'bg-slate-900 text-white shadow-lift'
                        : 'bg-white/50 border border-slate-200/60 text-slate-500 hover:bg-white hover:border-slate-300'
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('All');
              }}
              className="text-[12px] font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-[0.12em] px-2 active:scale-95"
            >
              Clear
            </button>
          </div>

          <div className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm overflow-hidden min-h-[500px]">
            <PrecisionTable
              data={filteredJobs}
              columns={tableColumns}
              isLoading={loading}
              emptyMessage="No active job openings found matching your filters."
            />
          </div>
        </div>
      </DashboardShell>

      {modal && (
        <JobModal
          type={modal}
          job={selectedJob}
          onClose={closeModal}
          onSuccess={() => {
            loadJobs();
            showToast(
              modal === 'add' ? 'Job created successfully' :
                modal === 'edit' ? 'Job updated successfully' :
                  'Job deleted successfully',
              'success'
            );
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-slideIn">
          <div className={cn(
            'px-6 py-4 rounded-[20px] shadow-floating backdrop-blur-md border border-white/20 text-[14px] font-bold flex items-center gap-3',
            toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
          )}>
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              {toast.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            </div>
            {toast.message}
          </div>
        </div>
      )}
    </>
  );
};

interface JobModalProps {
  type: ModalType;
  job: JobWithFacility | null;
  onClose: () => void;
  onSuccess: () => void;
}

const JobModal: React.FC<JobModalProps> = ({ type, job, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<JobInput>({
    facility_id: job?.facility_id || 0,
    status: job?.status || 'Open',
    specialty: job?.specialty || 'RN',
    shift: job?.shift || 'Days',
    hours_per_week: job?.hours_per_week || 40,
    start_date: job?.start_date || new Date().toISOString().split('T')[0],
    duration_weeks: job?.duration_weeks || 13,
  });
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFacilities = async () => {
      try {
        const data = await facilitiesService.getAll();
        setFacilities(data);
      } catch (err) {
        console.error('Error loading facilities:', err);
      }
    };
    if (type !== 'delete') {
      loadFacilities();
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

    if (!formData.facility_id || formData.facility_id === 0) {
      setError('Please select a facility.');
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      if (type === 'edit' && job) {
        await jobsService.update(job.id, formData);
      } else {
        await jobsService.create(formData);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save job:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!job) return;
    setIsSaving(true);
    try {
      await jobsService.delete(job.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to delete job:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const modalTitle = type === 'add' ? 'Add New Job' : type === 'edit' ? 'Edit Job' : 'Delete Job';
  const isDeleteModal = type === 'delete';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
      <div className="relative bg-white rounded-[32px] shadow-floating w-full max-w-2xl animate-scaleIn border border-white/20">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-slate-900 tracking-tight">{modalTitle}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-all active:scale-95">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {isDeleteModal ? (
          <div className="p-6">
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete this {job?.specialty} position? This action cannot be undone.
            </p>
            {error && <p className="text-xs text-red-600 mb-4">{error}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={isSaving} className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-red-600 hover:bg-red-700 transition-all shadow-sm flex items-center gap-2">
                {isSaving && <Loader className="w-4 h-4 animate-spin" />}
                Delete Job
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="facility_id" className="block text-xs font-medium text-gray-600 mb-1">Facility</label>
                <select
                  id="facility_id"
                  name="facility_id"
                  value={formData.facility_id}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  <option value={0} disabled>Select a facility...</option>
                  {facilities.map(f => (
                    <option key={f.id} value={f.id}>{f.name} - {f.city}, {f.state}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="specialty" className="block text-xs font-medium text-gray-600 mb-1">Specialty</label>
                  <select
                    id="specialty"
                    name="specialty"
                    value={formData.specialty}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  >
                    {SPECIALTY.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
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
                    {JOB_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="shift" className="block text-xs font-medium text-gray-600 mb-1">Shift</label>
                  <select
                    id="shift"
                    name="shift"
                    value={formData.shift}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  >
                    {SHIFT_TYPE.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="hours_per_week" className="block text-xs font-medium text-gray-600 mb-1">Hours/Week</label>
                  <input
                    type="number"
                    id="hours_per_week"
                    name="hours_per_week"
                    value={formData.hours_per_week}
                    onChange={handleChange}
                    required
                    min="1"
                    max="80"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="duration_weeks" className="block text-xs font-medium text-gray-600 mb-1">Duration (Weeks)</label>
                  <input
                    type="number"
                    id="duration_weeks"
                    name="duration_weeks"
                    value={formData.duration_weeks}
                    onChange={handleChange}
                    required
                    min="1"
                    max="52"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

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

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3 rounded-b-[32px]">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-[14px] font-bold rounded-[14px] border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 text-[14px] font-bold rounded-[14px] text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-lift flex items-center gap-2 active:scale-95"
              >
                {isSaving && <Loader className="w-4 h-4 animate-spin" />}
                {type === 'add' ? 'Create Job' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default JobsDashboard;
