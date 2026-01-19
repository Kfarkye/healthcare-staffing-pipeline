import React, { useState } from 'react';
import type { Prospect } from '../../shared/types/database';
import { Save, X, FileCheck2 } from 'lucide-react';

interface ProfileUpdateModalProps {
  prospect: Prospect;
  onClose: () => void;
  onSave: (prospectId: number, notes: string) => Promise<void>;
}

export const ProfileUpdateModal: React.FC<ProfileUpdateModalProps> = ({ prospect, onClose, onSave }) => {
  const [notes, setNotes] = useState(prospect.profile_update_notes || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(prospect.id, notes);
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-gray-100">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
                <FileCheck2 className="w-8 h-8 text-violet-600" />
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Profile Updates Needed</h2>
                    <p className="text-sm text-gray-500 mt-1">For {prospect.name}</p>
                </div>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-gray-100 rounded-xl transition-all duration-300 group">
              <X size={20} className="text-gray-400 group-hover:text-gray-600" />
            </button>
          </div>
        </div>
        <div className="p-8">
          <label htmlFor="updateNotes" className="block text-sm font-semibold text-gray-700 mb-2">
            What updates are required?
          </label>
          <textarea
            id="updateNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all duration-300"
            placeholder="e.g., Needs updated skills checklist, Missing reference from last role..."
          />
        </div>
        <div className="p-6 bg-gray-50/50 rounded-b-3xl flex justify-end gap-4">
          <button onClick={onClose} className="px-6 py-3 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-xl transition-all duration-300 font-semibold">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white rounded-xl transition-all duration-300 flex items-center gap-2 font-semibold shadow-lg hover:shadow-xl"
          >
            <Save size={16} /> {isSaving ? 'Saving...' : 'Save Notes'}
          </button>
        </div>
      </div>
    </div>
  );
};