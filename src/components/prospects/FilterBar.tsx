import React, { useState } from 'react';
import { Search, X, ChevronDown, SlidersHorizontal, List, LayoutGrid, RotateCcw, MapPin } from 'lucide-react';

// ============================================================================
// PROPS & DATABASE DATA
// ============================================================================

const ALL_PROFESSIONS_FROM_DB = [
    "Registered Nurse", "Surgical Services", "Radiology / Cardiology",
    "CNA / Nurse Assistant", "LVN / LPN", "Behavioral Health Tech",
    "Schools/Education", "Laboratory", "Therapy/Rehabilitation",
    "Medical Assistant", "Respiratory / Neuro Diagnostics", "Perfusionist",
    "Dietary Services", "Patient Care Technician"
].sort();

interface FilterBarProps {
    searchQuery: string;
    setSearchQuery: (value: string) => void;
    selectedProfessions: string[];
    setSelectedProfessions: (values: string[]) => void;
    licenseStateQuery: string;
    setLicenseStateQuery: (value: string) => void;
    viewMode: 'board' | 'list';
    setViewMode: (mode: 'board' | 'list') => void;
}

// ============================================================================
// MINIMALIST FILTER BAR
// ============================================================================

export const FilterBar: React.FC<FilterBarProps> = ({
    searchQuery,
    setSearchQuery,
    selectedProfessions,
    setSelectedProfessions,
    licenseStateQuery,
    setLicenseStateQuery,
    viewMode,
    setViewMode
}) => {
    const [isFilterPanelOpen, setFilterPanelOpen] = useState(false);
    const filtersAreActive = searchQuery !== '' || selectedProfessions.length > 0 || licenseStateQuery !== '';
    const filterCount = selectedProfessions.length + (licenseStateQuery ? 1 : 0);

    const handleProfessionToggle = (profession: string) => {
        const newSelection = new Set(selectedProfessions);
        if (newSelection.has(profession)) {
            newSelection.delete(profession);
        } else {
            newSelection.add(profession);
        }
        setSelectedProfessions(Array.from(newSelection));
    };

    const clearFilters = () => {
        setSearchQuery('');
        setSelectedProfessions([]);
        setLicenseStateQuery('');
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">

                {/* Search Input */}
                <div className="flex-1 relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
                    />
                    {searchQuery && (
                        <button 
                            onClick={() => setSearchQuery('')} 
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                            <X size={14} className="text-gray-400" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* View Mode Toggle */}
                    <div className="flex bg-gray-100 rounded-lg p-0.5">
                        <button 
                            onClick={() => setViewMode('board')} 
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                viewMode === 'board' 
                                    ? 'bg-white text-gray-900 shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Board
                        </button>
                        <button 
                            onClick={() => setViewMode('list')} 
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                viewMode === 'list' 
                                    ? 'bg-white text-gray-900 shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            List
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="h-6 w-px bg-gray-200" />

                    {/* Filter Toggle */}
                    <button
                        onClick={() => setFilterPanelOpen(!isFilterPanelOpen)}
                        className={`relative px-3 py-2 rounded-lg transition-all text-xs font-medium ${
                            isFilterPanelOpen 
                                ? 'bg-gray-900 text-white' 
                                : 'hover:bg-gray-100 text-gray-700'
                        }`}
                    >
                        Filters
                        {filterCount > 0 && (
                            <span className="ml-1.5 text-xs">
                                ({filterCount})
                            </span>
                        )}
                        <ChevronDown 
                            size={12} 
                            className={`inline ml-1 transition-transform ${
                                isFilterPanelOpen ? 'rotate-180' : ''
                            }`} 
                        />
                    </button>

                    {/* Clear Filters */}
                    {filtersAreActive && (
                        <button 
                            onClick={clearFilters} 
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Clear all filters"
                        >
                            <RotateCcw size={14} className="text-gray-500" />
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Panel */}
            <div className={`
                transition-all duration-300 overflow-hidden
                ${isFilterPanelOpen ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0'}
            `}>
                <div className="pt-4 border-t border-gray-100 space-y-6">
                    
                    {/* License State Filter */}
                    <div>
                        <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">
                            License States
                        </h4>
                        <div className="relative max-w-xs">
                            <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="e.g., CA, TX, NY"
                                value={licenseStateQuery}
                                onChange={(e) => setLicenseStateQuery(e.target.value.toUpperCase())}
                                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
                            />
                        </div>
                    </div>
                    
                    {/* Profession Filter */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                                Professions
                            </h4>
                            {selectedProfessions.length > 0 && (
                                <button 
                                    onClick={() => setSelectedProfessions([])}
                                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Clear ({selectedProfessions.length})
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2">
                            {ALL_PROFESSIONS_FROM_DB.map(profession => (
                                <label 
                                    key={profession} 
                                    className={`
                                        flex items-center justify-center text-center px-3 py-2 rounded-lg 
                                        cursor-pointer transition-all duration-200 border
                                        ${selectedProfessions.includes(profession) 
                                            ? 'bg-gray-900 border-gray-900 text-white' 
                                            : 'bg-white border-gray-200 hover:border-gray-400 text-gray-700'
                                        }
                                    `}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedProfessions.includes(profession)}
                                        onChange={() => handleProfessionToggle(profession)}
                                        className="hidden"
                                    />
                                    <span className="text-xs font-medium leading-tight">
                                        {profession}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};