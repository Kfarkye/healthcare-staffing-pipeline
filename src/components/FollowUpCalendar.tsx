import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { 
    Calendar, Clock, Users, ChevronRight, ChevronLeft, AlertCircle,
    CalendarDays, Grid3x3, Search, Phone, Mail, User, Loader2, 
    MessageSquare, UserCheck, Star, Briefcase, Sparkles, Copy,
    Eye, EyeOff, X, Send, CheckCircle, Filter, ArrowUp,
    CheckCheck, ExternalLink, Zap, TrendingUp, BarChart3,
    Target, Bell, ChevronDown, MoreVertical, Activity
} from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
interface FollowUp {
    id: number;
    candidate_name: string;
    candidate_id: string | null;
    facility_name: string | null;
    type: 'prospect_follow_up' | 'submittal_follow_up' | 'exit_list_follow_up' | 'onboarding_check_in';
    status: 'urgent' | 'normal' | 'onboarding' | 'overdue';
    follow_up_date: string;
    isCompleted?: boolean;
    phone?: string | null;
    email?: string | null;
}

interface CalendarDay {
    day: number;
    date: Date;
    followUps: FollowUp[];
    isToday: boolean;
    isCurrentMonth: boolean;
    isWeekend: boolean;
}

type ViewMode = 'month' | 'week' | 'agenda';
type FilterType = 'all' | 'urgent' | 'normal' | 'overdue' | 'completed';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================
const TYPE_CONFIG = {
    exit_list_follow_up: { 
        label: 'Exit List', 
        color: '#DC2626',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: AlertCircle,
        gradient: 'from-red-500 to-rose-600'
    },
    prospect_follow_up: { 
        label: 'Prospect', 
        color: '#F59E0B',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        icon: Target,
        gradient: 'from-amber-500 to-orange-600'
    },
    submittal_follow_up: { 
        label: 'Submittal', 
        color: '#3B82F6',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        icon: Send,
        gradient: 'from-blue-500 to-indigo-600'
    },
    onboarding_check_in: { 
        label: 'Onboarding', 
        color: '#8B5CF6',
        bgColor: 'bg-violet-50',
        borderColor: 'border-violet-200',
        icon: UserCheck,
        gradient: 'from-violet-500 to-purple-600'
    }
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const formatDate = (date: Date | string, format: 'short' | 'long' | 'full' = 'short'): string => {
    const d = typeof date === 'string' ? new Date(`${date}T00:00:00Z`) : date;
    
    switch(format) {
        case 'full':
            return d.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                timeZone: 'UTC'
            });
        case 'long':
            return d.toLocaleDateString('en-US', { 
                month: 'long', 
                day: 'numeric', 
                year: 'numeric',
                timeZone: 'UTC'
            });
        default:
            return d.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                timeZone: 'UTC'
            });
    }
};

const getRelativeTime = (date: string): string => {
    const now = new Date();
    const followUpDate = new Date(`${date}T00:00:00Z`);
    const diffTime = followUpDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;
    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
    return formatDate(date, 'short');
};

// ============================================================================
// LOADING SKELETON
// ============================================================================
const LoadingSkeleton: React.FC = () => (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
            <div className="bg-white rounded-2xl shadow-xl p-8 animate-pulse">
                <div className="h-8 bg-gray-200 rounded-lg w-48 mb-8"></div>
                <div className="grid grid-cols-7 gap-2 mb-6">
                    {[...Array(7)].map((_, i) => (
                        <div key={i} className="h-24 bg-gray-100 rounded-lg"></div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                    {[...Array(35)].map((_, i) => (
                        <div key={i} className="h-24 bg-gray-50 rounded-lg"></div>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

// ============================================================================
// STATS CARD COMPONENT
// ============================================================================
const StatsCard: React.FC<{
    label: string;
    value: number;
    icon: React.ElementType;
    color: string;
    trend?: number;
}> = ({ label, value, icon: Icon, color, trend }) => (
    <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100">
        <div className="flex items-center justify-between">
            <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                {trend !== undefined && (
                    <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <TrendingUp size={12} className={trend < 0 ? 'rotate-180' : ''} />
                        <span>{Math.abs(trend)}% vs last week</span>
                    </div>
                )}
            </div>
            <div className={`p-3 rounded-xl bg-gradient-to-br ${color}`}>
                <Icon size={20} className="text-white" />
            </div>
        </div>
    </div>
);

// ============================================================================
// CALENDAR DAY COMPONENT
// ============================================================================
const CalendarDayComponent: React.FC<{ 
    dayInfo: CalendarDay | null;
    isSelected: boolean;
    onClick: (day: CalendarDay) => void;
    viewMode: ViewMode;
}> = ({ dayInfo, isSelected, onClick, viewMode }) => {
    if (!dayInfo) {
        return <div className="h-28"></div>;
    }

    const { day, followUps, isToday, isCurrentMonth, isWeekend } = dayInfo;
    const hasFollowUps = followUps.length > 0;
    const urgentCount = followUps.filter(f => f.status === 'urgent' || f.status === 'overdue').length;
    const normalCount = followUps.filter(f => f.status === 'normal' || f.status === 'onboarding').length;

    return (
        <div 
            className={`
                relative h-28 p-2 cursor-pointer transition-all duration-200 rounded-lg
                ${isToday ? 'bg-gradient-to-br from-blue-50 to-indigo-50 ring-2 ring-blue-400 ring-opacity-50' : ''}
                ${!isToday && isCurrentMonth ? 'bg-white hover:bg-gray-50' : ''}
                ${!isCurrentMonth ? 'bg-gray-50 opacity-60' : ''}
                ${isWeekend && !isToday ? 'bg-gray-50/50' : ''}
                ${isSelected ? 'ring-2 ring-indigo-500' : 'border border-gray-200'}
                ${hasFollowUps ? 'hover:shadow-lg hover:scale-[1.02]' : 'hover:bg-gray-50'}
            `}
            onClick={() => hasFollowUps && onClick(dayInfo)}
        >
            <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-semibold ${
                    isToday ? 'text-blue-600' : 
                    isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                }`}>
                    {day}
                </span>
                {isToday && (
                    <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Today</span>
                )}
            </div>
            
            {hasFollowUps && (
                <div className="space-y-1 mt-2">
                    {urgentCount > 0 && (
                        <div className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded-md text-xs font-medium">
                            <AlertCircle size={10} />
                            <span>{urgentCount} urgent</span>
                        </div>
                    )}
                    {normalCount > 0 && (
                        <div className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-xs font-medium">
                            <Calendar size={10} />
                            <span>{normalCount} scheduled</span>
                        </div>
                    )}
                    <div className="flex gap-1 mt-1">
                        {followUps.slice(0, 3).map((f, i) => {
                            const config = TYPE_CONFIG[f.type];
                            return (
                                <div
                                    key={i}
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: config.color }}
                                    title={config.label}
                                />
                            );
                        })}
                        {followUps.length > 3 && (
                            <span className="text-xs text-gray-500">+{followUps.length - 3}</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// FOLLOW-UP CARD COMPONENT
// ============================================================================
const FollowUpCard: React.FC<{
    followUp: FollowUp;
    onComplete: (id: number) => void;
    onDraftMessage: (followUp: FollowUp) => void;
    onSnooze: (id: number) => void;
}> = ({ followUp, onComplete, onDraftMessage, onSnooze }) => {
    const [showActions, setShowActions] = useState(false);
    const config = TYPE_CONFIG[followUp.type];
    const Icon = config.icon;
    const profileUrl = followUp.candidate_id 
        ? `https://nova.ayahealthcare.com/#/recruiting/candidates/${followUp.candidate_id}/new-profile/about` 
        : null;

    return (
        <div className={`
            group relative bg-white rounded-xl p-4 transition-all duration-300
            ${followUp.isCompleted ? 'opacity-60 bg-gray-50' : 'hover:shadow-xl hover:scale-[1.02]'}
            border ${config.borderColor}
        `}>
            {/* Status Badge */}
            <div className={`absolute -top-2 -right-2 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${config.gradient} text-white shadow-lg`}>
                {config.label}
            </div>
            
            {/* Main Content */}
            <div className="mb-4">
                <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <Icon size={16} className="text-gray-400" />
                            {profileUrl ? (
                                <a 
                                    href={profileUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="font-semibold text-gray-900 hover:text-blue-600 transition-colors flex items-center gap-1"
                                >
                                    {followUp.candidate_name}
                                    <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                            ) : (
                                <h4 className="font-semibold text-gray-900">{followUp.candidate_name}</h4>
                            )}
                        </div>
                        <p className="text-sm text-gray-600">{followUp.facility_name || 'No facility assigned'}</p>
                        <div className="flex items-center gap-3 mt-2">
                            <span className={`text-xs font-medium px-2 py-1 rounded-md ${
                                followUp.status === 'overdue' ? 'bg-red-100 text-red-700' :
                                followUp.status === 'urgent' ? 'bg-orange-100 text-orange-700' :
                                'bg-gray-100 text-gray-600'
                            }`}>
                                {getRelativeTime(followUp.follow_up_date)}
                            </span>
                            {followUp.phone && (
                                <a href={`tel:${followUp.phone}`} className="text-gray-400 hover:text-gray-600">
                                    <Phone size={14} />
                                </a>
                            )}
                            {followUp.email && (
                                <a href={`mailto:${followUp.email}`} className="text-gray-400 hover:text-gray-600">
                                    <Mail size={14} />
                                </a>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => setShowActions(!showActions)}
                        className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <MoreVertical size={16} className="text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Action Buttons */}
            {!followUp.isCompleted && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button 
                        onClick={() => onDraftMessage(followUp)}
                        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-2 px-3 rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 text-xs font-semibold shadow-md hover:shadow-lg"
                    >
                        <Sparkles size={14} />
                        AI Draft
                    </button>
                    <button 
                        onClick={() => onComplete(followUp.id)}
                        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-2 px-3 rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 text-xs font-semibold shadow-md hover:shadow-lg"
                    >
                        <CheckCircle size={14} />
                        Complete
                    </button>
                    <button 
                        onClick={() => onSnooze(followUp.id)}
                        className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        title="Snooze"
                    >
                        <Clock size={14} />
                    </button>
                </div>
            )}

            {/* Quick Actions Dropdown */}
            {showActions && (
                <div className="absolute top-12 right-4 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-20 min-w-[160px]">
                    <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                        <Phone size={14} /> Call
                    </button>
                    <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                        <Mail size={14} /> Email
                    </button>
                    <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                        <MessageSquare size={14} /> Text
                    </button>
                    <hr className="my-1" />
                    <button className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                        <X size={14} /> Cancel Follow-up
                    </button>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// AI DRAFT MODAL
// ============================================================================
const AIDraftModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    followUp: FollowUp | null;
    onSend: (message: string) => void;
}> = ({ isOpen, onClose, followUp, onSend }) => {
    const [message, setMessage] = useState('');
    const [tone, setTone] = useState<'professional' | 'friendly' | 'urgent'>('professional');
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (isOpen && followUp) {
            generateMessage();
        }
    }, [isOpen, followUp, tone]);

    const generateMessage = async () => {
        setIsGenerating(true);
        // Simulate AI generation
        setTimeout(() => {
            const templates = {
                professional: `Dear ${followUp?.candidate_name},\n\nI hope this message finds you well. I wanted to follow up regarding your placement at ${followUp?.facility_name || 'the facility'}.\n\nCould we schedule a brief call to discuss your progress and any support you might need?\n\nBest regards`,
                friendly: `Hi ${followUp?.candidate_name}! 👋\n\nJust checking in to see how things are going at ${followUp?.facility_name || 'your placement'}!\n\nWould love to catch up when you have a moment. How's everything going so far?\n\nTalk soon!`,
                urgent: `Hi ${followUp?.candidate_name},\n\nThis is a time-sensitive follow-up regarding your placement at ${followUp?.facility_name || 'the facility'}.\n\nPlease contact me at your earliest convenience to discuss an important matter.\n\nThank you`
            };
            setMessage(templates[tone]);
            setIsGenerating(false);
        }, 1000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl transform transition-all">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-t-2xl">
                    <div className="flex items-center justify-between">
                        <div className="text-white">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Sparkles size={20} />
                                AI Message Draft
                            </h3>
                            <p className="text-sm text-blue-100 mt-1">
                                For {followUp?.candidate_name} - {followUp?.facility_name}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            <X size={20} className="text-white" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Tone Selector */}
                    <div className="mb-4">
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Message Tone</label>
                        <div className="flex gap-2">
                            {(['professional', 'friendly', 'urgent'] as const).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTone(t)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                        tone === t
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Message Area */}
                    <div className="relative">
                        {isGenerating && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-lg z-10">
                                <div className="flex items-center gap-2 text-blue-600">
                                    <Loader2 className="animate-spin" size={20} />
                                    <span className="text-sm font-medium">Generating message...</span>
                                </div>
                            </div>
                        )}
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="w-full h-64 p-4 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Your message will appear here..."
                        />
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-4 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500">Quick add:</span>
                        <button className="px-3 py-1 bg-gray-100 text-gray-600 rounded-md text-xs hover:bg-gray-200">
                            Meeting Request
                        </button>
                        <button className="px-3 py-1 bg-gray-100 text-gray-600 rounded-md text-xs hover:bg-gray-200">
                            Document Request
                        </button>
                        <button className="px-3 py-1 bg-gray-100 text-gray-600 rounded-md text-xs hover:bg-gray-200">
                            Schedule Call
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">
                                <Copy size={16} className="inline mr-2" />
                                Copy
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => onSend(message)}
                                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all text-sm font-semibold shadow-md hover:shadow-lg flex items-center gap-2"
                            >
                                <Send size={16} />
                                Send Message
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function FollowUpCalendar() {
    const [followUps, setFollowUps] = useState<FollowUp[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<CalendarDay | null>(null);
    const [aiModalFollowUp, setAiModalFollowUp] = useState<FollowUp | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [filterType, setFilterType] = useState<FilterType>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showNotifications, setShowNotifications] = useState(false);

    // Fetch follow-ups from database
    const fetchFollowUps = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data: followUpsData, error: followUpsError } = await supabase
                .from('follow_ups_view')
                .select('*');
                
            if (followUpsError) throw followUpsError;
            
            // Get completed follow-ups from last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const { data: completedData, error: completedError } = await supabase
                .from('follow_up_actions')
                .select('engagement_id')
                .gte('created_at', thirtyDaysAgo.toISOString());
                
            if (completedError) throw completedError;

            const completedIds = new Set(completedData?.map(item => item.engagement_id) || []);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Process follow-ups with status
            const processedFollowUps = (followUpsData || []).map((f: any) => {
                const followUpDate = new Date(`${f.follow_up_date}T00:00:00Z`);
                let status: FollowUp['status'] = 'normal';
                
                if (f.type === 'exit_list_follow_up') {
                    status = 'urgent';
                } else if (f.type === 'onboarding_check_in') {
                    status = 'onboarding';
                } else if (followUpDate < today) {
                    status = 'overdue';
                }
                
                return {
                    ...f,
                    status,
                    isCompleted: completedIds.has(f.id)
                };
            });

            setFollowUps(processedFollowUps);
        } catch (error) {
            console.error("Error loading follow-up data:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFollowUps();
        
        // Set up real-time subscription
        const channel = supabase
            .channel('followup-calendar-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'engagements' }, fetchFollowUps)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'follow_up_actions' }, fetchFollowUps)
            .subscribe();
            
        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchFollowUps]);

    // Generate calendar days
    const calendarDays = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();
        
        const days: (CalendarDay | null)[] = [];
        
        // Add empty days for alignment
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }
        
        // Add actual days
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dayFollowUps = followUps.filter(f => {
                const followUpDate = new Date(`${f.follow_up_date}T00:00:00Z`);
                return followUpDate.toDateString() === date.toDateString();
            });
            
            days.push({
                day,
                date,
                followUps: dayFollowUps,
                isToday: date.toDateString() === today.toDateString(),
                isCurrentMonth: true,
                isWeekend: date.getDay() === 0 || date.getDay() === 6
            });
        }
        
        return days;
    }, [currentDate, followUps]);

    // Filtered follow-ups
    const filteredFollowUps = useMemo(() => {
        let filtered = [...followUps];
        
        // Apply filter
        if (filterType !== 'all') {
            if (filterType === 'completed') {
                filtered = filtered.filter(f => f.isCompleted);
            } else {
                filtered = filtered.filter(f => f.status === filterType && !f.isCompleted);
            }
        }
        
        // Apply search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(f => 
                f.candidate_name.toLowerCase().includes(query) ||
                f.facility_name?.toLowerCase().includes(query)
            );
        }
        
        return filtered;
    }, [followUps, filterType, searchQuery]);

    // Calculate statistics
    const stats = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayFollowUps = followUps.filter(f => {
            const followUpDate = new Date(`${f.follow_up_date}T00:00:00Z`);
            return followUpDate.toDateString() === today.toDateString();
        });
        
        const overdueFollowUps = followUps.filter(f => {
            const followUpDate = new Date(`${f.follow_up_date}T00:00:00Z`);
            return followUpDate < today && !f.isCompleted;
        });
        
        const weekFollowUps = followUps.filter(f => {
            const followUpDate = new Date(`${f.follow_up_date}T00:00:00Z`);
            const weekFromNow = new Date(today);
            weekFromNow.setDate(weekFromNow.getDate() + 7);
            return followUpDate >= today && followUpDate <= weekFromNow;
        });
        
        return {
            total: followUps.length,
            today: todayFollowUps.length,
            overdue: overdueFollowUps.length,
            thisWeek: weekFollowUps.length,
            completed: followUps.filter(f => f.isCompleted).length
        };
    }, [followUps]);

    // Navigation functions
    const navigateNext = () => {
        setCurrentDate(prev => {
            const next = new Date(prev);
            if (viewMode === 'week') {
                next.setDate(next.getDate() + 7);
            } else {
                next.setMonth(next.getMonth() + 1);
            }
            return next;
        });
    };

    const navigatePrev = () => {
        setCurrentDate(prev => {
            const next = new Date(prev);
            if (viewMode === 'week') {
                next.setDate(next.getDate() - 7);
            } else {
                next.setMonth(next.getMonth() - 1);
            }
            return next;
        });
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    // Action handlers
    const handleCompleteFollowUp = async (followUpId: number) => {
        try {
            await supabase.from('follow_up_actions').insert({ engagement_id: followUpId });
            await fetchFollowUps();
        } catch (error) {
            console.error('Error completing follow-up:', error);
        }
    };

    const handleSnoozeFollowUp = async (followUpId: number) => {
        // Implement snooze logic
        console.log('Snooze follow-up:', followUpId);
    };

    const handleSendMessage = async (message: string) => {
        if (aiModalFollowUp) {
            await handleCompleteFollowUp(aiModalFollowUp.id);
            setAiModalFollowUp(null);
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
                goToToday();
            }
            if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
                navigatePrev();
            }
            if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
                navigateNext();
            }
        };
        
        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, []);

    if (isLoading) {
        return <LoadingSkeleton />;
    }
    
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                <Calendar className="text-blue-600" />
                                Follow-up Calendar
                            </h1>
                            <span className="text-sm text-gray-500">
                                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            {/* Search */}
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search candidates..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
                                />
                            </div>
                            
                            {/* View Mode Selector */}
                            <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                {(['month', 'week', 'agenda'] as ViewMode[]).map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => setViewMode(mode)}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                            viewMode === mode
                                                ? 'bg-white text-gray-900 shadow-sm'
                                                : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                    </button>
                                ))}
                            </div>
                            
                            {/* Notifications */}
                            <button
                                onClick={() => setShowNotifications(!showNotifications)}
                                className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <Bell size={20} />
                                {stats.overdue > 0 && (
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                                        {stats.overdue}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                    <StatsCard
                        label="Total Follow-ups"
                        value={stats.total}
                        icon={Users}
                        color="from-blue-500 to-indigo-600"
                    />
                    <StatsCard
                        label="Today"
                        value={stats.today}
                        icon={Calendar}
                        color="from-green-500 to-emerald-600"
                        trend={12}
                    />
                    <StatsCard
                        label="This Week"
                        value={stats.thisWeek}
                        icon={CalendarDays}
                        color="from-purple-500 to-pink-600"
                    />
                    <StatsCard
                        label="Overdue"
                        value={stats.overdue}
                        icon={AlertCircle}
                        color="from-red-500 to-orange-600"
                        trend={-8}
                    />
                    <StatsCard
                        label="Completed"
                        value={stats.completed}
                        icon={CheckCircle}
                        color="from-gray-500 to-gray-700"
                    />
                </div>

                {/* Filter Bar */}
                <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-gray-100">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Filter size={16} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-700">Filter:</span>
                            <div className="flex gap-2">
                                {(['all', 'urgent', 'normal', 'overdue', 'completed'] as FilterType[]).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setFilterType(type)}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                            filterType === type
                                                ? 'bg-blue-600 text-white shadow-md'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {type.charAt(0).toUpperCase() + type.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {/* Navigation Controls */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={goToToday}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Today
                            </button>
                            <div className="flex items-center bg-white border border-gray-300 rounded-lg">
                                <button
                                    onClick={navigatePrev}
                                    className="p-2 hover:bg-gray-50 transition-colors"
                                >
                                    <ChevronLeft size={20} className="text-gray-600" />
                                </button>
                                <span className="px-4 text-sm font-medium text-gray-900 min-w-[140px] text-center">
                                    {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
                                </span>
                                <button
                                    onClick={navigateNext}
                                    className="p-2 hover:bg-gray-50 transition-colors"
                                >
                                    <ChevronRight size={20} className="text-gray-600" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Calendar View */}
                {viewMode === 'month' && (
                    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                        <div className="grid grid-cols-7 gap-2 mb-2">
                            {WEEKDAYS_SHORT.map(day => (
                                <div key={day} className="text-center text-xs font-semibold text-gray-500 uppercase py-2">
                                    {day}
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-2">
                            {calendarDays.map((dayInfo, index) => (
                                <CalendarDayComponent
                                    key={index}
                                    dayInfo={dayInfo}
                                    isSelected={selectedDate?.date.toDateString() === dayInfo?.date.toDateString()}
                                    onClick={setSelectedDate}
                                    viewMode={viewMode}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Agenda View */}
                {viewMode === 'agenda' && (
                    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">All Follow-ups</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredFollowUps.map(followUp => (
                                <FollowUpCard
                                    key={followUp.id}
                                    followUp={followUp}
                                    onComplete={handleCompleteFollowUp}
                                    onDraftMessage={setAiModalFollowUp}
                                    onSnooze={handleSnoozeFollowUp}
                                />
                            ))}
                        </div>
                        {filteredFollowUps.length === 0 && (
                            <div className="text-center py-12">
                                <Calendar className="mx-auto text-gray-300 mb-4" size={48} />
                                <p className="text-gray-500">No follow-ups match your filters</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Selected Date Follow-ups */}
                {selectedDate && selectedDate.followUps.length > 0 && viewMode === 'month' && (
                    <div className="mt-6 bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">
                                Follow-ups for {formatDate(selectedDate.date, 'long')}
                            </h3>
                            <button
                                onClick={() => setSelectedDate(null)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X size={20} className="text-gray-400" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {selectedDate.followUps.map(followUp => (
                                <FollowUpCard
                                    key={followUp.id}
                                    followUp={followUp}
                                    onComplete={handleCompleteFollowUp}
                                    onDraftMessage={setAiModalFollowUp}
                                    onSnooze={handleSnoozeFollowUp}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* AI Draft Modal */}
            <AIDraftModal
                isOpen={!!aiModalFollowUp}
                onClose={() => setAiModalFollowUp(null)}
                followUp={aiModalFollowUp}
                onSend={handleSendMessage}
            />

            {/* Notifications Panel */}
            {showNotifications && (
                <div className="fixed right-4 top-20 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50">
                    <div className="p-4 border-b border-gray-100">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900">Notifications</h3>
                            <button
                                onClick={() => setShowNotifications(false)}
                                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X size={16} className="text-gray-400" />
                            </button>
                        </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto p-4">
                        {stats.overdue > 0 && (
                            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-center gap-2 text-red-700">
                                    <AlertCircle size={16} />
                                    <span className="text-sm font-medium">
                                        {stats.overdue} overdue follow-ups
                                    </span>
                                </div>
                            </div>
                        )}
                        {stats.today > 0 && (
                            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center gap-2 text-blue-700">
                                    <Calendar size={16} />
                                    <span className="text-sm font-medium">
                                        {stats.today} follow-ups scheduled today
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}