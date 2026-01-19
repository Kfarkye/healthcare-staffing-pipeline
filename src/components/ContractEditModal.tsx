import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase'; // Adjust path as needed
import { X, Save, Loader2 } from 'lucide-react';

interface ContractEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void; // A simple callback to trigger a refresh
    contract: any | null; // Pass null or an empty object for a new contract
}

export const ContractEditModal: React.FC<ContractEditModalProps> = ({ isOpen, onClose, onSave, contract }) => {
    const [formData, setFormData] = useState<any>({});
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // Populate form when a contract is passed in, or set defaults for a new one
        if (contract) {
            setFormData({
                id: contract.id || undefined,
                candidate_name: contract.candidate_name || '',
                facility_name: contract.facility_name || '',
                specialty: contract.specialty || '',
                start_date: contract.start_date || '',
                end_date: contract.end_date || '',
                status: contract.status || 'Active',
                extension_stage: contract.extension_stage || 'working',
            });
        }
    }, [contract]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        setIsLoading(true);
        try {
            const payload = { ...formData };
            const { error } = await supabase.from('engagements').upsert(payload);

            if (error) throw error;

            onSave(); // Trigger refresh on the parent dashboard
            onClose();
        } catch (error: any) {
            console.error("Failed to save contract:", error);
            // You can add a toast notification here
        } finally {
            setIsLoading(false);
        }
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
                <header className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-slate-900">
                        {contract?.id ? 'Edit Assignment' : 'Create New Assignment'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
                        <X size={20} className="text-slate-500" />
                    </button>
                </header>
                <main className="p-6 grid grid-cols-2 gap-4">
                    <InputField label="Candidate Name" name="candidate_name" value={formData.candidate_name || ''} onChange={handleInputChange} />
                    <InputField label="Facility Name" name="facility_name" value={formData.facility_name || ''} onChange={handleInputChange} />
                    <InputField label="Specialty" name="specialty" value={formData.specialty || ''} onChange={handleInputChange} />
                    <InputField label="Status" name="status" value={formData.status || ''} onChange={handleInputChange} isSelect options={['Active', 'Extension Request Sent', 'Extension Signed']} />
                    <InputField label="Start Date" name="start_date" type="date" value={formData.start_date || ''} onChange={handleInputChange} />
                    <InputField label="End Date" name="end_date" type="date" value={formData.end_date || ''} onChange={handleInputChange} />
                    <InputField label="Extension Stage" name="extension_stage" value={formData.extension_stage || ''} onChange={handleInputChange} isSelect options={['working', 'outreach', 'interested', 'requested', 'offer', 'signed']} />
                </main>
                <footer className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
                    <button onClick={handleSubmit} disabled={isLoading} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:bg-slate-400 flex items-center gap-2">
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {isLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                </footer>
            </div>
        </div>
    );
};

const InputField = ({ label, name, value, onChange, type = "text", isSelect = false, options = [] }: any) => (
    <div>
        <label htmlFor={name} className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
        {isSelect ? (
            <select id={name} name={name} value={value} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400 transition-colors">
                {options.map((opt: string) => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
            </select>
        ) : (
            <input id={name} name={name} type={type} value={value} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400 transition-colors" />
        )}
    </div>
);

export default ContractEditModal;