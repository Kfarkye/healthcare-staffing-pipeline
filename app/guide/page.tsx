'use client';

import dynamic from 'next/dynamic';
import LoadingFallback from '../../src/components/LoadingFallback';

const TravelerHandbook = dynamic(
    () => import('../../src/components/handbook/TravelerHandbook'),
    { loading: () => <LoadingFallback /> }
);

export default function GuidePage() {
    return <TravelerHandbook />;
}
