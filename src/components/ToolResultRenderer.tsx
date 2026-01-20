import React from 'react';
import { Activity, ShieldCheck, BarChart3, TrendingUp, DollarSign } from 'lucide-react';
import { cn } from '../lib/utils';

interface ToolResultRendererProps {
    toolName: string;
    data: any;
}

const ToolResultRenderer: React.FC<ToolResultRendererProps> = ({ toolName, data }) => {
    if (!data) return null;

    switch (toolName) {
        case 'get_pipeline_brief':
            return (
                <div className="mt-4 bg-black/40 backdrop-blur-xl text-white p-6 rounded-2xl border border-white/10 shadow-2xl">
                    <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-3">
                        <BarChart3 className="text-indigo-400" size={18} />
                        <h3 className="font-bold uppercase tracking-tight text-xs opacity-70">Pipeline Briefing</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-6">
                        {data.counts && Object.entries(data.counts).map(([status, count]: [string, any]) => (
                            <div key={status} className="bg-white/5 p-3 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                                <div className="text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1 truncate">{status}</div>
                                <div className="text-xl font-bold tracking-tight">{count}</div>
                            </div>
                        ))}
                    </div>
                    <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl flex items-start gap-3">
                        <TrendingUp className="text-indigo-400 shrink-0 mt-0.5" size={16} />
                        <span className="text-xs font-medium text-indigo-100/80 leading-relaxed">
                            {data.summary || "Pipeline volume is stable. Focus on moving candidates from 'Contacted' to 'Interested' to meet weekly targets."}
                        </span>
                    </div>
                </div>
            );

        case 'save_certification':
            return (
                <div className="mt-4 flex items-center gap-4 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl group transition-all hover:bg-emerald-500/15">
                    <div className="h-10 w-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                        <ShieldCheck size={20} />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-0.5">Diamond Verified</div>
                        <div className="text-sm font-semibold text-emerald-50/90">{data.cert || 'Certification'} saved to profile.</div>
                    </div>
                </div>
            );

        case 'set_ui_state':
            return (
                <div className="mt-2 text-[10px] font-bold text-indigo-400 flex items-center gap-2 px-2 animate-in fade-in slide-in-from-left-2 transition-all">
                    <Activity size={12} className="animate-pulse" />
                    <span className="uppercase tracking-widest">Dashboard Updated: {data.filter_specialty || 'ALL'} | {data.view_mode?.toUpperCase() || 'LIST'}</span>
                </div>
            );

        case 'calculate_pay':
            return (
                <div className="mt-4 bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-2xl p-6 shadow-xl shadow-indigo-500/10 border border-white/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                        <DollarSign size={80} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <div className="text-[10px] font-bold uppercase text-white/50 tracking-widest mb-1">Weekly Gross Target</div>
                                <div className="text-3xl font-bold tracking-tight">${data.weekly_gross?.toLocaleString() || (data.target_gross?.toLocaleString() || '0')}</div>
                            </div>
                            {data.city && (
                                <div className="bg-white/10 px-3 py-1.5 rounded-lg text-right backdrop-blur-md border border-white/10">
                                    <div className="text-[10px] font-bold text-white/70">{data.city}, {data.state}</div>
                                    <div className="text-[9px] font-black tracking-tighter uppercase opacity-50">GSA Stipend Match</div>
                                </div>
                            )}
                        </div>
                        <div className="space-y-2.5">
                            <PayLine label="Taxable Hourly" value={`$${data.taxable_hourly || '0'}/hr`} />
                            <PayLine label="Non-Taxable Stipend" value={`$${data.nontaxable_stipend || '0'}/wk`} />
                            <div className="pt-3 border-t border-white/10">
                                <PayLine label="Estimated Net" value={`$${data.estimated_net || '0'}/wk`} highlight />
                            </div>
                        </div>
                    </div>
                </div>
            );

        default:
            return null;
    }
};

const PayLine = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
    <div className={cn(
        "flex justify-between items-center transition-all",
        highlight ? "text-white font-bold" : "text-white/60 font-medium"
    )}>
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
        <span className={cn("font-mono tracking-tighter", highlight ? "text-lg" : "text-xs")}>{value}</span>
    </div>
);

export default ToolResultRenderer;
