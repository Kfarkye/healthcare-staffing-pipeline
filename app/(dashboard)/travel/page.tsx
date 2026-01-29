'use client';

import dynamic from 'next/dynamic';
import LoadingFallback from '../../../src/components/LoadingFallback';

const PriorityDashboard = dynamic(
    () => import('../../../src/components/PriorityDashboard'),
    { loading: () => <LoadingFallback /> }
);

export default function TravelPage() {
    return <PriorityDashboard />;
}
