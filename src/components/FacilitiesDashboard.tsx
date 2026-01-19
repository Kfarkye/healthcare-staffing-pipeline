import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, X, Edit3, Trash2, Loader, MapPin } from 'lucide-react';
import { facilitiesService } from '../services/schemaService';
import type { Facility, FacilityInput } from '../types/schema';

const cn = (...classes: (string | boolean | undefined | null)[]) =>
  classes.filter(Boolean).join(' ');

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
              <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Facilities</h1>
              <p className="text-xs text-gray-500 mt-1">
                Manage healthcare facilities and locations
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search facilities..."
                  className="w-64 pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-400"
                />
              </div>
              <button
                onClick={() => openModal('add')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 active:scale-[0.98] transition-all shadow-sm"
              >
                <Plus size={15} />
                Add Facility
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
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Facility Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/50">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="text-center py-16">
                      <Loader className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filteredFacilities.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-16 text-gray-500">
                      {searchQuery ? 'No facilities found matching your search.' : 'No facilities yet. Add your first facility to get started.'}
                    </td>
                  </tr>
                ) : (
                  filteredFacilities.map((facility, index) => (
                    <tr key={facility.id} className="hover:bg-gray-50/50 transition-colors animate-fadeIn" style={{ animationDelay: `${Math.min(index * 20, 400)}ms`, opacity: 0 }}>
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-gray-900">{facility.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={14} className="text-gray-400" />
                          {facility.city}, {facility.state}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openModal('edit', facility)} className="p-2 rounded-md hover:bg-gray-100 transition-colors">
                            <Edit3 size={14} className="text-gray-500" />
                          </button>
                          <button onClick={() => openModal('delete', facility)} className="p-2 rounded-md hover:bg-gray-100 transition-colors">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg animate-fadeIn" style={{ animationDelay: '50ms' }}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{modalTitle}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-500" />
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

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-gray-900 hover:bg-gray-800 transition-all shadow-sm flex items-center gap-2">
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
