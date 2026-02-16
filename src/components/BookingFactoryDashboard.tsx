import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { 
    AlertCircle, Zap, Check, Phone, Mail, ExternalLink,
    Briefcase, UserPlus, Send, Target, FileText
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface DashboardStats {
    tasks_today: number;
    completed_today: number;
    bookings_this_week: number;
}

interface Task {
    task_id: string;
    task_type: 'Close Offer' | 'Follow Up for Offer' | 'Prepare Extension' | 'Submit to Job' | 'Initial Outreach';
    candidate_name: string;
    context_1: string; // e.g., Facility Name or Specialty
    context_2: string; // e.g., "Submitted 5 days ago"
    priority_score: number;
    link: string; // Link to Nova profile
}

// ============================================================================
// TASK-DRIVEN DASHBOARD
// ============================================================================

export default function TaskDrivenDashboard() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            const [statsRes, tasksRes] = await Promise.all([
                supabase.from('dashboard_booking_stats').select('*').single(),
                supabase.from('actionable_dashboard_tasks').select('*')
            ]);

            if (statsRes.data) setStats(statsRes.data);
            if (tasksRes.data) setTasks(tasksRes.data);

        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    }, []);
    
    const handleCompleteTask = async (taskId: string) => {
        // Optimistically remove the task from the UI
        setTasks(currentTasks => currentTasks.filter(t => t.task_id !== taskId));
        
        // Update stats optimistically
        if (stats) {
            setStats({
                ...stats,
                tasks_today: stats.tasks_today - 1,
                completed_today: stats.completed_today + 1
            });
        }

        // Persist the completion to the database
        await supabase.from('task_completions').insert({ task_id: taskId });
    };

    useEffect(() => {
        fetchData();
        const channel = supabase
            .channel('tasks-realtime')
            .on('postgres_changes', { event: '*', schema: 'public' }, fetchData)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchData]);

    if (loading || !stats) {
        return <div className="flex items-center justify-center h-screen bg-gray-50">Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header with Task Stats */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Your Action Plan</h1>
                        <p className="text-sm text-gray-500">Prioritized tasks to drive bookings</p>
                    </div>
                    <div className="flex items-center gap-6">
                        <StatItem label="Tasks Today" value={stats.tasks_today} />
                        <StatItem label="Completed Today" value={stats.completed_today} />
                        <StatItem label="Bookings This Week" value={stats.bookings_this_week} highlight={true} />
                    </div>
                </div>
            </header>

            {/* Main Task List */}
            <main className="max-w-4xl mx-auto px-6 py-8">
                <div className="space-y-4">
                    {tasks.length > 0 ? (
                        tasks.map(task => (
                            <TaskCard 
                                key={task.task_id} 
                                task={task} 
                                onComplete={() => handleCompleteTask(task.task_id)}
                            />
                        ))
                    ) : (
                        <div className="text-center py-20 bg-white rounded-lg border border-dashed">
                            <Check size={40} className="mx-auto text-green-500" />
                            <h3 className="mt-4 text-lg font-semibold text-gray-900">All Caught Up!</h3>
                            <p className="mt-1 text-sm text-gray-500">There are no pending tasks. Great job!</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const StatItem: React.FC<{ label: string; value: number; highlight?: boolean }> = ({ label, value, highlight }) => (
    <div className="text-right">
        <p className={`text-2xl font-bold ${highlight ? 'text-blue-600' : 'text-gray-900'}`}>{value}</p>
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
    </div>
);

const getTaskIcon = (taskType: Task['task_type']) => {
    switch (taskType) {
        case 'Close Offer': return { Icon: AlertCircle, color: 'text-red-500' };
        case 'Follow Up for Offer': return { Icon: Send, color: 'text-purple-500' };
        case 'Prepare Extension': return { Icon: Briefcase, color: 'text-green-500' };
        case 'Submit to Job': return { Icon: Target, color: 'text-blue-500' };
        case 'Initial Outreach': return { Icon: UserPlus, color: 'text-orange-500' };
        default: return { Icon: Zap, color: 'text-gray-500' };
    }
};

const TaskCard: React.FC<{ task: Task; onComplete: () => void; }> = ({ task, onComplete }) => {
    const { Icon, color } = getTaskIcon(task.task_type);
    const novaUrl = task.link.startsWith('/#/') || task.link.startsWith('#/')
        ? `https://nova.ayahealthcare.com${task.link}`
        : `https://nova.ayahealthcare.com/#${task.link}`;

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-4">
            <div className="flex items-start justify-between">
                {/* Task Info */}
                <div className="flex items-center gap-4">
                    <Icon size={20} className={color} />
                    <div>
                        <p className={`text-sm font-semibold ${color}`}>{task.task_type}</p>
                        <h3 className="font-bold text-gray-900 mt-1">{task.candidate_name}</h3>
                        <p className="text-sm text-gray-500">{task.context_1}</p>
                        <p className="text-xs text-gray-400">{task.context_2}</p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1">
                    <button className="p-2 rounded hover:bg-gray-100" title="Call"><Phone size={16} className="text-gray-500" /></button>
                    <button className="p-2 rounded hover:bg-gray-100" title="Email"><Mail size={16} className="text-gray-500" /></button>
                    <a href={novaUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded hover:bg-gray-100" title="View in Nova">
                        <ExternalLink size={16} className="text-gray-500" />
                    </a>
                    <button onClick={onComplete} className="ml-2 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded hover:bg-green-100 hover:text-green-800 transition-colors" title="Mark as Done">
                        <Check size={14} /> Done
                    </button>
                </div>
            </div>
        </div>
    );
};