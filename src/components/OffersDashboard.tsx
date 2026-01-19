import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useLivelistSync } from '../hooks/useLivelistSync';
import { Search, RefreshCw, ExternalLink, X, ChevronDown, Phone, TriangleAlert as AlertTriangle, ArrowUpRight, Activity, TrendingUp, Zap, Target, Users, Gift, Signature as FileSignature, CircleCheck as CheckCircle2, Sparkles } from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
interface Engagement {
  id: number;
  candidate_name: string;
  candidate_id: string | null;
  facility_name: string | null;
  specialty: string | null;
  job_id: string | null;
  start_date: string | null;
  status: 'Offer Extended' | 'Signed';
  created_at?: string;
  phone_number?: string | null | number;
}

type Status = 'idle' | 'loading' | 'success' | 'error';
type FilterStatus = 'all' | 'offers' | 'signed';

const NOVA_LINKS = [
  { name: 'Live List', href: 'https://nova.ayahealthcare.com/#/recruiting/live-nurses-new', icon: '📋' },
  { name: 'Margins', href: 'https://nova.ayahealthcare.com/#/recruiting/margins', icon: '📊' },
  { name: 'Contract Requests', href: 'https://nova.ayahealthcare.com/#/recruiting/contract-requests-new', icon: '📝' },
  { name: 'Deals', href: 'https://nova.ayahealthcare.com/#/recruiting/deals', icon: '💼' }
];

// ============================================================================
// UTILITIES
// ============================================================================
const formatPhoneNumberForLink = (phoneInput: string | number | null | undefined): string | null => {
  if (!phoneInput) return null;
  const digitsOnly = String(phoneInput).replace(/\D/g, '');
  return digitsOnly.length > 0 ? digitsOnly : null;
};

const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const getColorFromString = (str: string): string => {
  const colors = [
    'from-blue-400 to-blue-600',
    'from-purple-400 to-purple-600',
    'from-emerald-400 to-emerald-600',
    'from-amber-400 to-amber-600',
    'from-rose-400 to-rose-600',
    'from-indigo-400 to-indigo-600',
    'from-teal-400 to-teal-600',
    'from-pink-400 to-pink-600'
  ];
  const index = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
};

const cleanSpecialty = (specialty: string | null): string => {
  if (!specialty) return 'Specialty TBD';
  
  // Remove years in parentheses and clean up the text
  let cleaned = specialty.replace(/\(\d+\s*years?\)/g, '').trim();
  
  // Split by semicolon and clean each part
  const parts = cleaned.split(';').map(s => s.trim()).filter(Boolean);
  
  if (parts.length === 0) return 'Specialty TBD';
  
  // If all parts start with the same prefix (like RRT), just show it once
  const prefixes = parts.map(p => p.split(/[\s-]/)[0]);
  const uniquePrefixes = [...new Set(prefixes)];
  
  if (uniquePrefixes.length === 1 && parts.length > 1) {
    // Common prefix scenario - show just the main specialty
    const mainPrefix = uniquePrefixes[0];
    
    // Check for specific subspecialties to highlight
    const hasFloat = parts.some(p => p.toLowerCase().includes('float'));
    const hasPediatrics = parts.some(p => p.toLowerCase().includes('pediatric') || p.toLowerCase().includes('picu'));
    const hasACCS = parts.some(p => p.includes('ACCS'));
    
    if (hasFloat) return `${mainPrefix} Float`;
    if (hasPediatrics) return `${mainPrefix} Pediatrics`;
    if (hasACCS) return `${mainPrefix}-ACCS`;
    
    // Just return the base specialty
    return mainPrefix;
  }
  
  // For different specialties, take the first one or the most specific
  const primary = parts[0];
  
  // Clean up common patterns
  return primary
    .replace(/^(RRT|RN|LPN|CNA|MA|PT|OT|ST|SPT)\s+/, '$1 ') // Normalize spacing after credentials
    .replace(/\s+/g, ' ') // Remove extra spaces
    .trim();
};

// ============================================================================
// UI COMPONENTS
// ============================================================================
const StatCard: React.FC<{ 
  label: string; 
  value: string; 
  icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  delay?: number;
  color: string;
}> = ({ label, value, icon, trend, delay = 0, color }) => (
  <div 
    className="group relative bg-white rounded-2xl p-6 transition-all duration-500 hover:shadow-lg border border-gray-100 overflow-hidden"
    style={{ 
      animationDelay: `${delay}ms`,
      animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      opacity: 0
    }}
  >
    <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${color}`} />
    
    <div className="relative">
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 rounded-xl bg-gray-50 group-hover:bg-gray-100 transition-colors duration-300">
          {icon}
        </div>
        {trend && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${
            trend.isPositive ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
          }`}>
            {trend.isPositive ? <TrendingUp size={10} /> : <Activity size={10} />}
            {trend.isPositive ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
      
      <div className="space-y-1">
        <p className="text-3xl font-bold text-gray-900 tabular-nums">
          {value}
        </p>
        <p className="text-sm font-medium text-gray-500">
          {label}
        </p>
      </div>
    </div>
  </div>
);

const FilterBar: React.FC<{
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  filterStatus: FilterStatus;
  setFilterStatus: (status: FilterStatus) => void;
  counts: { all: number; offers: number; signed: number };
}> = ({ searchTerm, setSearchTerm, filterStatus, setFilterStatus, counts }) => (
  <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-100 p-4 mb-8 shadow-sm">
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="flex-1 w-full relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-gray-400 group-focus-within:text-gray-600 transition-colors duration-200" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name or facility..."
          className="w-full pl-11 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            <X className="h-4 w-4 text-gray-400 hover:text-gray-600 transition-colors duration-200" />
          </button>
        )}
      </div>

      <div className="flex items-center p-1 bg-gray-50 rounded-xl">
        {(['all', 'offers', 'signed'] as FilterStatus[]).map((status) => {
          const isActive = filterStatus === status;
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`
                relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${isActive 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
                }
              `}
            >
              <span className="relative z-10">
                {status === 'all' && 'All'}
                {status === 'offers' && 'Offers'}
                {status === 'signed' && 'Signed'}
              </span>
              <span className={`ml-2 text-xs ${isActive ? 'text-gray-600' : 'text-gray-400'}`}>
                {counts[status]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);

const OfferCard: React.FC<{ engagement: Engagement; index: number }> = ({ engagement, index }) => {
  const { candidate_name, candidate_id, facility_name, status, specialty, phone_number } = engagement;
  const profileUrl = `https://nova.ayahealthcare.com/#/recruiting/candidates/${candidate_id}/new-profile/about`;
  const cleanPhoneNumber = formatPhoneNumberForLink(phone_number);
  const initials = getInitials(candidate_name);
  const avatarColor = getColorFromString(candidate_name);
  const displaySpecialty = cleanSpecialty(specialty);

  return (
    <div 
      className="group relative bg-white rounded-2xl p-6 border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300 cursor-pointer"
      style={{ 
        animationDelay: `${index * 50}ms`,
        animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        opacity: 0
      }}
    >
      {status === 'Signed' && (
        <div className="absolute -top-2 -right-2 bg-gradient-to-br from-emerald-400 to-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
          <CheckCircle2 size={14} />
          <span>Signed</span>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarColor} flex items-center justify-center`}>
                <span className="text-white font-semibold text-sm">{initials}</span>
              </div>
              {status === 'Offer Extended' && (
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white animate-pulse" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm truncate">
                {candidate_name}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">
                {displaySpecialty}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-gray-200 rounded-full" />
          <span className="text-xs text-gray-600 truncate">
            {facility_name || 'Facility TBD'}
          </span>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
          {cleanPhoneNumber && (
            <a
              href={`ringcentral://call?number=${cleanPhoneNumber}`}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 hover:text-emerald-600 bg-gray-50 hover:bg-emerald-50 rounded-lg transition-all duration-200"
            >
              <Phone size={14} />
              <span>Call</span>
            </a>
          )}
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 rounded-lg transition-all duration-200"
          >
            <span>View Profile</span>
            <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </div>
  );
};

const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-32">
    <div className="relative">
      <div className="w-12 h-12 rounded-full border-2 border-gray-200" />
      <div className="w-12 h-12 rounded-full border-2 border-gray-900 border-t-transparent animate-spin absolute inset-0" />
    </div>
    <p className="text-sm text-gray-500 mt-4 font-medium">Loading offers</p>
  </div>
);

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-32 bg-white rounded-2xl border border-gray-100">
    <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mb-4">
      <Target className="w-8 h-8 text-gray-400" />
    </div>
    <h3 className="font-semibold text-gray-900 text-lg mb-1">No candidates found</h3>
    <p className="text-sm text-gray-500">Try adjusting your search or filters</p>
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-32 bg-white rounded-2xl border border-red-100">
    <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
      <AlertTriangle className="w-8 h-8 text-red-500" />
    </div>
    <h3 className="font-semibold text-gray-900 text-lg mb-1">Unable to load data</h3>
    <p className="text-sm text-gray-500 mb-4 max-w-sm text-center">{message}</p>
    <button
      onClick={onRetry}
      className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors duration-200"
    >
      Try again
    </button>
  </div>
);

const QuickLinksDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all duration-200"
      >
        <Zap size={16} />
        <span>Quick Links</span>
        <ChevronDown 
          size={16} 
          className={`ml-1 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-200">
          {NOVA_LINKS.map((link, index) => (
            <a
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors duration-200"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <span className="text-base">{link.icon}</span>
              <span className="flex-1">{link.name}</span>
              <ExternalLink size={14} className="text-gray-400" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function OffersDashboard(): JSX.Element {
  const [offers, setOffers] = useState<Engagement[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  const fetchOffers = useCallback(async () => {
    setStatus('loading');
    try {
      const { data, error } = await supabase
        .from('offers_and_signed')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      setOffers(data || []);
      setStatus('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  const { startSync, isLoading: isExtracting, isSyncing } = useLivelistSync({
    onNotification: () => {},
    onSyncComplete: fetchOffers,
  });

  const filteredOffers = useMemo(() => {
    return offers.filter(offer => {
      const statusMatch = 
        filterStatus === 'all' || 
        (filterStatus === 'offers' && offer.status === 'Offer Extended') || 
        (filterStatus === 'signed' && offer.status === 'Signed');
      
      const searchMatch = 
        !searchTerm || 
        offer.candidate_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        offer.facility_name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      return statusMatch && searchMatch;
    });
  }, [offers, filterStatus, searchTerm]);

  const counts = useMemo(() => ({
    all: offers.length,
    offers: offers.filter(o => o.status === 'Offer Extended').length,
    signed: offers.filter(o => o.status === 'Signed').length
  }), [offers]);

  const isSyncActive = isExtracting || isSyncing;
  const syncButtonText = isExtracting ? 'Extracting' : isSyncing ? 'Syncing' : 'Sync Live List';

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return <LoadingState />;
      case 'error':
        return <ErrorState message={errorMessage} onRetry={fetchOffers} />;
      case 'success':
        return filteredOffers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredOffers.map((engagement, index) => (
              <OfferCard key={engagement.id} engagement={engagement} index={index} />
            ))}
          </div>
        ) : (
          <EmptyState />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <style jsx>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <header className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">
                  Offers & Signed
                </h1>
                <div className="px-2.5 py-1 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                </div>
              </div>
              <p className="text-sm text-gray-600">
                Track and manage your active offers and signed contracts
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <QuickLinksDropdown />
              <button
                onClick={startSync}
                disabled={isSyncActive}
                className={`
                  flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white 
                  bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 
                  rounded-xl transition-all duration-200 disabled:cursor-not-allowed
                  ${isSyncActive ? 'pl-3' : ''}
                `}
              >
                <RefreshCw className={`w-4 h-4 ${isSyncActive ? 'animate-spin' : ''}`} />
                <span>{syncButtonText}</span>
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Total Pipeline"
            value={counts.all.toString()}
            icon={<Users className="w-5 h-5 text-gray-600" />}
            trend={{ value: 12, isPositive: true }}
            delay={0}
            color="from-gray-400 to-gray-600"
          />
          <StatCard
            label="Active Offers"
            value={counts.offers.toString()}
            icon={<Gift className="w-5 h-5 text-amber-600" />}
            trend={{ value: 8, isPositive: true }}
            delay={100}
            color="from-amber-400 to-amber-600"
          />
          <StatCard
            label="Signed Contracts"
            value={counts.signed.toString()}
            icon={<FileSignature className="w-5 h-5 text-emerald-600" />}
            trend={{ value: 24, isPositive: true }}
            delay={200}
            color="from-emerald-400 to-emerald-600"
          />
        </div>

        <FilterBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          counts={counts}
        />

        <main className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}