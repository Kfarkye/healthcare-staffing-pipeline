'use client';

import dynamic from 'next/dynamic';
import LoadingFallback from '../../../src/components/LoadingFallback';

const FollowUpDashboard = dynamic(
    () => import('../../../src/components/NewFollowUpDashboard'),
    { loading: () => <LoadingFallback /> }
);

export default function FollowUpsPage() {
    return <FollowUpDashboard />;
}
