'use client';

import dynamic from 'next/dynamic';
import LoadingFallback from '../../../src/components/LoadingFallback';

const ActiveAssignmentsDashboard = dynamic(
    () => import('../../../src/components/ActiveAssignmentsDashboard'),
    { loading: () => <LoadingFallback />, ssr: false }
);

export default function ActivePage() {
    return <ActiveAssignmentsDashboard />;
}
