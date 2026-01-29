'use client';

import dynamic from 'next/dynamic';
import LoadingFallback from '../../../src/components/LoadingFallback';

const ExitsDashboard = dynamic(
    () => import('../../../src/components/ExitsDashboard'),
    { loading: () => <LoadingFallback /> }
);

export default function ExitsPage() {
    return <ExitsDashboard />;
}
