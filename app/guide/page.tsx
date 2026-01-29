'use client';

import nextDynamic from 'next/dynamic';
import LoadingFallback from '../../src/components/LoadingFallback';

// Skip static generation - this page needs runtime env vars
export const dynamic = 'force-dynamic';

const TravelerHandbook = nextDynamic(
    () => import('../../src/components/handbook/TravelerHandbook'),
    { loading: () => <LoadingFallback />, ssr: false }
);

export default function GuidePage() {
    return <TravelerHandbook />;
}
