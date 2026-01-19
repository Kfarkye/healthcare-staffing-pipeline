import React from 'react';
import { Search, X } from 'lucide-react';
import type { EnhancedFilterState } from '../../store/useAppStore';

interface FilterBarProps {
  filters: EnhancedFilterState;
  onFiltersChange: (updates: Partial<EnhancedFilterState>) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({ 
  filters, 
  onFiltersChange 
}) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[300px] relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search prospects..."
            value={filters.searchTerm || ''}
            onChange={(e) => onFiltersChange({ searchTerm: e.target.value })}
            className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {filters.searchTerm && (
            <button
              onClick={() => onFiltersChange({ searchTerm: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
            >
              <X size={14} className="text-gray-400" />
            </button>
          )}
        </div>

        <select
          value={filters.statusFilter || 'all'}
          onChange={(e) => onFiltersChange({ statusFilter: e.target.value as any })}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Status</option>
          <option value="New">New</option>
          <option value="Contacted">Contacted</option>
          <option value="Interested">Interested</option>
          <option value="Submitted">Submitted</option>
          <option value="Offer Extended">Offer Extended</option>
          <option value="Hired">Hired</option>
          <option value="Exited">Exited</option>
        </select>

        <div className="flex items-center bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => onFiltersChange({ viewMode: 'board' })}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              filters.viewMode === 'board'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Board
          </button>
          <button
            onClick={() => onFiltersChange({ viewMode: 'list' })}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              filters.viewMode === 'list'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            List
          </button>
        </div>

        <button
          onClick={() => onFiltersChange({ 
            searchTerm: '',
            statusFilter: 'all',
            selectedProfessions: [],
            licenseStateQuery: ''
          })}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
};