import React from 'react';
import { StatCard, PlaceholderCard } from '../../design-system';

export default function TravelJobsDashboard(): JSX.Element {
  return (
    <div className="p-8 space-y-6 animate-fadeIn">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <StatCard label="Open Positions" value="156" delay={0} />
        <StatCard label="Matched Candidates" value="89" delay={80} />
        <StatCard label="High Priority" value="23" delay={160} />
      </div>
      <div className="animate-fadeInUp" style={{ animationDelay: '240ms', opacity: 0 }}>
        <PlaceholderCard
          title="Travel Assignments"
          description="National and out-of-state opportunities with intelligent matching"
          comingSoon
        />
      </div>
    </div>
  );
}
