import React from 'react';
import { X, Calendar, MapPin, Clock } from 'lucide-react';

interface ContractViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: any | null;
}

const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'N/A';
    return new Date(`${dateString}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
};

const ContractViewModal: React.FC<ContractViewModalProps> = ({ isOpen, onClose, contract }) => {
    if (!isOpen || !contract) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
                <header className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-slate-900">{contract.candidate_name}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-500" /></button>
                </header>
                <main className="p-6 space-y-4">
                    <DetailItem label="Facility" value={contract.facility_name} icon={<MapPin size={16} />} />
                    <DetailItem label="Specialty" value={contract.specialty} />
                    <DetailItem label="Status" value={contract.status} />
                    <DetailItem label="Extension Stage" value={contract.extension_stage || 'N/A'} />
                    <DetailItem label="Start Date" value={formatDate(contract.start_date)} icon={<Calendar size={16} />} />
                    <DetailItem label="End Date" value={formatDate(contract.end_date)} icon={<Calendar size={16} />} />
                </main>
            </div>
        </div>
    );
};

const DetailItem = ({ label, value, icon }: { label: string, value: string, icon?: React.ReactNode }) => (
    <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-slate-500 flex items-center gap-2">{icon}{label}</span>
        <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
);

export default ContractViewModal;