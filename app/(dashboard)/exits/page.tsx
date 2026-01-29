'use client';

import dynamic from 'next/dynamic';
import LoadingFallback from '../../../src/components/LoadingFallback';

const ExitsDashboard = dynamic(
    () => import('../../../src/components/ExitsDashboard'),
    { loading: () => <LoadingFallback />, ssr: false }
);

export default function ExitsPage() {
    return <ExitsDashboard />;
}
