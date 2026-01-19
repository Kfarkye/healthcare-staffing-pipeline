import { Category } from '../types/views';

export const CATEGORIES: readonly Category[] = [
  'Pipelines',
  'Dashboards / Calendars',
  'Jobs & Interest',
  'Admin',
] as const;

export interface QuickLink {
  label: string;
  href: string;
}

export const QUICK_LINKS: readonly QuickLink[] = [
  { label: 'Tickets', href: 'https://nova.ayahealthcare.com/#/travelx/tickets' },
  { label: 'Search', href: 'https://nova.ayahealthcare.com/#/recruiting/search-all-candidates' },
  { label: 'Live', href: 'https://nova.ayahealthcare.com/#/recruiting/live-nurses-new' },
  { label: 'Deals', href: 'https://nova.ayahealthcare.com/#/recruiting/deals' },
  { label: 'Jobs', href: 'https://nova.ayahealthcare.com/#/recruiting/jobs' },
] as const;

export interface ActionItem {
  id: string;
  title: string;
  action?: () => void;
  href?: string;
  isLink: boolean;
}

export const ACTION_ITEMS: readonly ActionItem[] = [
  {
    id: 'T',
    title: 'Open Teams',
    href: 'msteams:',
    isLink: true,
  },
  {
    id: 'O',
    title: 'Open Outlook Calendar',
    href: 'https://outlook.office.com/calendar/',
    isLink: true,
  },
  {
    id: 'R',
    title: 'Open RingCentral',
    href: 'https://app.ringcentral.com',
    isLink: true,
  },
] as const;
