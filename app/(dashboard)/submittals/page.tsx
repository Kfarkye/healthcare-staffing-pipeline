'use client';

import dynamic from 'next/dynamic';
import LoadingFallback from '../../../src/components/LoadingFallback';

const SubmittalDashboard = dynamic(
    () => import('../../../src/components/SubmittalDashboard'),
    { loading: () => <LoadingFallback />, ssr: false }
);

export default function SubmittalsPage() {
    return <SubmittalDashboard />;
}
