import React from 'react';
import { StatCard, PlaceholderCard } from '../../design-system';

export default function AdminDashboard(): JSX.Element {
  return (
    <div className="p-8 space-y-6 animate-fadeIn">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <StatCard label="Total Candidates" value="1,247" delay={0} />
        <StatCard label="Active Users" value="23" delay={80} />
        <StatCard label="Compliance Rate" value="98%" trend="+2%" delay={160} />
        <StatCard label="Avg Margin" value="24%" delay={240} />
      </div>
      <div className="animate-fadeInUp" style={{ animationDelay: '320ms', opacity: 0 }}>
        <PlaceholderCard
          title="System Administration"
          description="Full database access, compliance tracking, licensing, and business intelligence"
          comingSoon
        />
      </div>
    </div>
  );
}
