import React from 'react';
import { StatCard, PlaceholderCard } from '../../design-system';

export default function LocalJobsDashboard(): JSX.Element {
  return (
    <div className="p-8 space-y-6 animate-fadeIn">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <StatCard label="Open Positions" value="64" delay={0} />
        <StatCard label="Matched Candidates" value="41" delay={80} />
        <StatCard label="Same-State" value="38" delay={160} />
      </div>
      <div className="animate-fadeInUp" style={{ animationDelay: '240ms', opacity: 0 }}>
        <PlaceholderCard
          title="Local Assignments"
          description="State-based and commutable positions with proximity filters"
          comingSoon
        />
      </div>
    </div>
  );
}
