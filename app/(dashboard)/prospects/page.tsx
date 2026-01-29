'use client';

import dynamic from 'next/dynamic';
import LoadingFallback from '../../../src/components/LoadingFallback';

const ProspectsDashboard = dynamic(
    () => import('../../../src/components/ProspectsDashboard'),
    { loading: () => <LoadingFallback /> }
);

export default function ProspectsPage() {
    return <ProspectsDashboard />;
}
