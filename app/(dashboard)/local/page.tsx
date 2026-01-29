'use client';

import dynamic from 'next/dynamic';
import LoadingFallback from '../../../src/components/LoadingFallback';

const LocalJobsDashboard = dynamic(
    () => import('../../../src/components/placeholders/LocalJobsDashboard'),
    { loading: () => <LoadingFallback /> }
);

export default function LocalPage() {
    return <LocalJobsDashboard />;
}
