// src/config/routes-next.ts
// Next.js App Router route configuration (no react-router-dom)

import { Category } from '../types/views';

export interface RouteConfigNext {
    path: string;
    label: string;
    description: string;
    category: Category;
}

export const ROUTE_CONFIG_NEXT: RouteConfigNext[] = [
    {
        path: '/prospects',
        label: 'Prospects',
        description: 'Lead intake and profile-ready stages',
        category: 'Pipelines',
    },
    {
        path: '/submittals',
        label: 'Submittals',
        description: 'Track submissions, recommend job links, focus follow-ups',
        category: 'Pipelines',
    },
    {
        path: '/active',
        label: 'Active',
        description: 'Manage clinicians on contract and extensions',
        category: 'Pipelines',
    },
    {
        path: '/exits',
        label: 'Exits',
        description: 'Post-assignment, offboarding, or lost leads',
        category: 'Dashboards / Calendars',
    },
    {
        path: '/follow-ups',
        label: 'Follow-Ups',
        description: 'Reminders & cycle-of-service check-ins',
        category: 'Dashboards / Calendars',
    },
    {
        path: '/travel',
        label: 'Travel',
        description: 'Priority Command Center: Hot candidates, local talent, job openings, and intelligent matching',
        category: 'Jobs & Interest',
    },
    {
        path: '/local',
        label: 'Local',
        description: 'State-based or commutable assignments with home-state filters',
        category: 'Jobs & Interest',
    },
    {
        path: '/admin',
        label: 'Admin',
        description: 'Full candidate DB, global controls, compliance, licensing, margin, RTO',
        category: 'Admin',
    },
];
