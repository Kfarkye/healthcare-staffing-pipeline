import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, X, Edit3, Trash2, Loader, MapPin, CheckCircle, AlertCircle } from 'lucide-react';
import { facilitiesService } from '../services/schemaService';
import type { Facility, FacilityInput } from '../types/schema';
import { DashboardShell } from './shared/DashboardShell';
import { PrecisionTable } from './shared/PrecisionTable';
import { cn } from '../lib/utils';

type ModalType = 'add' | 'edit' | 'delete' | null;

const FacilitiesDashboard: React.FC = () => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadFacilities = async () => {
    setLoading(true);
    try {
      const data = await facilitiesService.getAll();
      setFacilities(data);
    } catch (error) {
      console.error('Error loading facilities:', error);
      showToast('Failed to load facilities', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFacilities();
  }, []);

  const filteredFacilities = useMemo(() => {
    if (!searchQuery) return facilities;
    const q = searchQuery.toLowerCase();
    return facilities.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.city.toLowerCase().includes(q) ||
      f.state.toLowerCase().includes(q)
    );
  }, [facilities, searchQuery]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openModal = (type: ModalType, facility?: Facility) => {
    setModal(type);
    setSelectedFacility(facility || null);
  };

  const closeModal = () => {
    setModal(null);
    setSelectedFacility(null);
  };

  const HeaderActions = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => openModal('add')}
        className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-[14px] transition-all shadow-lift font-bold text-[13px] active:scale-95"
      >
        <Plus size={16} strokeWidth={2.5} />
        <span>Add Facility</span>
      </button>
    </div>
  );

  const tableColumns = [
    {
      header: 'Facility Name',
      accessor: (facility: Facility) => (
        <span className="font-bold text-slate-900">{facility.name}</span>
      )
    },
    {
      header: 'Location',
      accessor: (facility: Facility) => (
        <div className="flex items-center gap-1.5 text-slate-600 font-medium">
          <MapPin size={14} className="text-slate-400" />
          {facility.city}, {facility.state}
        </div>
      )
    },
    {
      header: '',
      id: 'actions',
      className: 'text-right',
      accessor: (facility: Facility) => (
        <div className="flex items-center justify-end gap-1 px-2">
          <button
            onClick={() => openModal('edit', facility)}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
          >
            <Edit3 size={15} />
          </button>
          <button
            onClick={() => openModal('delete', facility)}
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
        title="Facilities"
        subtitle="Comprehensive management of healthcare facility partners and locations."
        eyebrow="Network"
        actions={HeaderActions}
      >
        <div className="space-y-6">
          <div className="precision-glass rounded-[28px] p-5 flex items-center justify-between gap-4 shadow-lift border-white/20">
            <div className="relative group flex-1 max-w-sm">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search facilities..."
                className="w-full pl-11 pr-4 py-2.5 bg-white/50 border border-slate-200/60 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 focus:bg-white transition-all text-[14px] font-medium tracking-tight shadow-sm"
              />
            </div>
          </div>

          <div className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm overflow-hidden min-h-[500px]">
            <PrecisionTable
              data={filteredFacilities}
              columns={tableColumns}
              isLoading={loading}
              emptyMessage="No facilities found matching your search."
            />
          </div>
        </div>
      </DashboardShell>

      {modal && (
        <FacilityModal
          type={modal}
          facility={selectedFacility}
          onClose={closeModal}
          onSuccess={() => {
            loadFacilities();
            showToast(
              modal === 'add' ? 'Facility created successfully' :
                modal === 'edit' ? 'Facility updated successfully' :
                  'Facility deleted successfully',
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

interface FacilityModalProps {
  type: ModalType;
  facility: Facility | null;
  onClose: () => void;
  onSuccess: () => void;
}

const FacilityModal: React.FC<FacilityModalProps> = ({ type, facility, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<FacilityInput>({
    name: facility?.name || '',
    city: facility?.city || '',
    state: facility?.state || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      if (type === 'edit' && facility) {
        await facilitiesService.update(facility.id, formData);
      } else {
        await facilitiesService.create(formData);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save facility:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!facility) return;
    setIsSaving(true);
    try {
      await facilitiesService.delete(facility.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to delete facility:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const modalTitle = type === 'add' ? 'Add New Facility' : type === 'edit' ? 'Edit Facility' : 'Delete Facility';
  const isDeleteModal = type === 'delete';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md animate-fadeIn">
      <div className="relative bg-white rounded-[32px] shadow-floating w-full max-w-lg animate-scaleIn border border-white/20">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-slate-900 tracking-tight">{modalTitle}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-all active:scale-95">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {isDeleteModal ? (
          <div className="p-6">
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <span className="font-semibold">{facility?.name}</span>? This action cannot be undone.
            </p>
            {error && <p className="text-xs text-red-600 mb-4">{error}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={isSaving} className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-red-600 hover:bg-red-700 transition-all shadow-sm flex items-center gap-2">
                {isSaving && <Loader className="w-4 h-4 animate-spin" />}
                Delete Facility
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="name" className="block text-xs font-medium text-gray-600 mb-1">Facility Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g., Memorial Hospital"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="city" className="block text-xs font-medium text-gray-600 mb-1">City</label>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    required
                    placeholder="e.g., Boston"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="state" className="block text-xs font-medium text-gray-600 mb-1">State</label>
                  <input
                    type="text"
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    required
                    placeholder="e.g., MA"
                    maxLength={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all uppercase"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3 rounded-b-[32px]">
              <button type="button" onClick={onClose} className="px-5 py-2.5 text-[14px] font-bold rounded-[14px] border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="px-6 py-2.5 text-[14px] font-bold rounded-[14px] text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-lift flex items-center gap-2 active:scale-95">
                {isSaving && <Loader className="w-4 h-4 animate-spin" />}
                {type === 'add' ? 'Create Facility' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default FacilitiesDashboard;
