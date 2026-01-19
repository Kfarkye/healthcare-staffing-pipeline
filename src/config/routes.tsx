import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import RootLayout from '../components/layout/RootLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import LoadingFallback from '../components/LoadingFallback';
import { Category } from '../types/views';

const ProspectsDashboard = lazy(() => import('../components/ProspectsDashboard'));
const ActiveAssignmentsDashboard = lazy(() => import('../components/ActiveAssignmentsDashboard'));
const ExitsDashboard = lazy(() => import('../components/ExitsDashboard'));
const SubmittalDashboard = lazy(() => import('../components/SubmittalDashboard'));
const FollowUpDashboard = lazy(() => import('../components/NewFollowUpDashboard'));
const PipelineDashboard = lazy(() => import('../components/PipelineDashboard'));
const PriorityDashboard = lazy(() => import('../components/PriorityDashboard'));
const LocalJobsDashboard = lazy(() => import('../components/placeholders/LocalJobsDashboard'));
const AdminDashboard = lazy(() => import('../components/placeholders/AdminDashboard'));

export interface RouteConfig {
  path: string;
  label: string;
  description: string;
  category: Category;
  element: React.ReactNode;
}

export const ROUTE_CONFIG: RouteConfig[] = [
  {
    path: '/prospects',
    label: 'Prospects',
    description: 'Lead intake and profile-ready stages',
    category: 'Pipelines',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <ProspectsDashboard />
      </Suspense>
    ),
  },
  {
    path: '/submittals',
    label: 'Submittals',
    description: 'Track submissions, recommend job links, focus follow-ups',
    category: 'Pipelines',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <SubmittalDashboard />
      </Suspense>
    ),
  },
  {
    path: '/active',
    label: 'Active',
    description: 'Manage clinicians on contract and extensions',
    category: 'Pipelines',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <ActiveAssignmentsDashboard />
      </Suspense>
    ),
  },
  {
    path: '/exits',
    label: 'Exits',
    description: 'Post-assignment, offboarding, or lost leads',
    category: 'Dashboards / Calendars',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <ExitsDashboard />
      </Suspense>
    ),
  },
  {
    path: '/follow-ups',
    label: 'Follow-Ups',
    description: 'Reminders & cycle-of-service check-ins',
    category: 'Dashboards / Calendars',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <FollowUpDashboard />
      </Suspense>
    ),
  },
  {
    path: '/travel',
    label: 'Travel',
    description: 'Priority Command Center: Hot candidates, local talent, job openings, and intelligent matching',
    category: 'Jobs & Interest',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <PriorityDashboard />
      </Suspense>
    ),
  },
  {
    path: '/local',
    label: 'Local',
    description: 'State-based or commutable assignments with home-state filters',
    category: 'Jobs & Interest',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <LocalJobsDashboard />
      </Suspense>
    ),
  },
  {
    path: '/admin',
    label: 'Admin',
    description: 'Full candidate DB, global controls, compliance, licensing, margin, RTO',
    category: 'Admin',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <AdminDashboard />
      </Suspense>
    ),
  },
];

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        index: true,
        element: <Navigate to="/prospects" replace />,
      },
      ...ROUTE_CONFIG.map((route) => ({
        path: route.path,
        element: route.element,
        errorElement: <ErrorBoundary />,
      })),
      {
        path: '*',
        element: <Navigate to="/prospects" replace />,
      },
    ],
  },
]);
