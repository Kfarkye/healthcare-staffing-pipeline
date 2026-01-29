'use client';

import dynamic from 'next/dynamic';
import LoadingFallback from '../../../src/components/LoadingFallback';

const AdminDashboard = dynamic(
    () => import('../../../src/components/placeholders/AdminDashboard'),
    { loading: () => <LoadingFallback /> }
);

export default function AdminPage() {
    return <AdminDashboard />;
}
