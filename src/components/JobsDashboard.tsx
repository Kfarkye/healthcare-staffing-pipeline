import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, X, Edit3, Trash2, Loader, Briefcase, MapPin, Clock } from 'lucide-react';
import { jobsService, facilitiesService } from '../services/schemaService';
import type { JobWithFacility, JobInput, Facility, JobStatus, Specialty, ShiftType } from '../types/schema';
import { JOB_STATUS, SPECIALTY, SHIFT_TYPE } from '../types/schema';

const cn = (...classes: (string | boolean | undefined | null)[]) =>
  classes.filter(Boolean).join(' ');

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

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case 'Open': return 'bg-green-50 text-green-700';
      case 'On Hold': return 'bg-yellow-50 text-yellow-700';
      case 'Filled': return 'bg-blue-50 text-blue-700';
      case 'Cancelled': return 'bg-gray-50 text-gray-700';
      default: return 'bg-gray-50 text-gray-700';
    }
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
              <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Job Openings</h1>
              <p className="text-xs text-gray-500 mt-1">
                Manage open positions and assignments
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {(['All', ...JOB_STATUS] as const).map(status => (
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
                  placeholder="Search jobs..."
                  className="w-64 pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-400"
                />
              </div>
              <button
                onClick={() => openModal('add')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 active:scale-[0.98] transition-all shadow-sm"
              >
                <Plus size={15} />
                Add Job
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
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Specialty</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Facility</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Start Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/50">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <Loader className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-gray-500">
                      No jobs found.
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job, index) => (
                    <tr key={job.id} className="hover:bg-gray-50/50 transition-colors animate-fadeIn" style={{ animationDelay: `${Math.min(index * 20, 400)}ms`, opacity: 0 }}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Briefcase size={16} className="text-gray-400" />
                          <span className="font-semibold text-gray-900">{job.specialty}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-gray-900">{job.facility?.name || 'Unknown'}</div>
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                          <MapPin size={12} />
                          {job.facility?.city}, {job.facility?.state}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600 text-xs">
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="text-gray-400" />
                          {job.shift} • {job.hours_per_week}h/wk • {job.duration_weeks}w
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                        {new Date(job.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={cn('px-2.5 py-0.5 text-xs font-medium rounded-full', getStatusColor(job.status))}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openModal('edit', job)} className="p-2 rounded-md hover:bg-gray-100 transition-colors">
                            <Edit3 size={14} className="text-gray-500" />
                          </button>
                          <button onClick={() => openModal('delete', job)} className="p-2 rounded-md hover:bg-gray-100 transition-colors">
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

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-gray-900 hover:bg-gray-800 transition-all shadow-sm flex items-center gap-2">
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
