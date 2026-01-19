// ============================================================================
// Follow-Up Utility Functions
// ============================================================================

import { format, isToday, isPast, isFuture, differenceInDays, parseISO } from 'date-fns';
import type { FollowUpDashboard, FollowUpStatusCategory, FollowUpStats } from '../types/followUps';

/**
 * Determine the status category of a follow-up based on its scheduled date
 */
export function getFollowUpStatus(scheduledDate: string): FollowUpStatusCategory {
  const date = parseISO(scheduledDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isToday(date)) {
    return 'today';
  }

  if (isPast(date)) {
    return 'overdue';
  }

  const daysUntil = differenceInDays(date, today);

  if (daysUntil <= 7) {
    return 'upcoming';
  }

  return 'future';
}

/**
 * Get human-readable label for follow-up status
 */
export function getStatusLabel(status: FollowUpStatusCategory): string {
  switch (status) {
    case 'overdue':
      return 'Overdue';
    case 'today':
      return 'Due Today';
    case 'upcoming':
      return 'This Week';
    case 'future':
      return 'Future';
  }
}

/**
 * Get badge styling classes for status
 */
export function getBadgeClasses(category: FollowUpStatusCategory): string {
  switch (category) {
    case 'overdue':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'today':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'upcoming':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'future':
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

/**
 * Format date for display
 */
export function formatFollowUpDate(dateString: string): string {
  const date = parseISO(dateString);

  if (isToday(date)) {
    return 'Today';
  }

  if (isPast(date)) {
    const daysAgo = differenceInDays(new Date(), date);
    if (daysAgo === 1) return 'Yesterday';
    return `${daysAgo} days ago`;
  }

  if (isFuture(date)) {
    const daysUntil = differenceInDays(date, new Date());
    if (daysUntil === 1) return 'Tomorrow';
    if (daysUntil <= 7) return `In ${daysUntil} days`;
  }

  return format(date, 'MMM d, yyyy');
}

/**
 * Format date for input fields (YYYY-MM-DD)
 */
export function formatDateForInput(dateString: string): string {
  return format(parseISO(dateString), 'yyyy-MM-dd');
}

/**
 * Calculate statistics from follow-ups
 */
export function calculateFollowUpStats(followUps: FollowUpDashboard[]): FollowUpStats {
  const pending = followUps.filter(f => !f.completed);

  const stats: FollowUpStats = {
    total: followUps.length,
    overdue: 0,
    today: 0,
    upcoming: 0,
    completed: followUps.filter(f => f.completed).length,
    byType: {
      active: followUps.filter(f => f.follow_up_type === 'active').length,
      rotation: followUps.filter(f => f.follow_up_type === 'rotation').length,
    },
  };

  pending.forEach(followUp => {
    const status = getFollowUpStatus(followUp.scheduled_date);
    if (status === 'overdue') stats.overdue++;
    if (status === 'today') stats.today++;
    if (status === 'upcoming') stats.upcoming++;
  });

  return stats;
}

/**
 * Sort follow-ups by priority (overdue first, then by date)
 */
export function sortFollowUpsByPriority(followUps: FollowUpDashboard[]): FollowUpDashboard[] {
  return [...followUps].sort((a, b) => {
    // Completed items go to the end
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;

    const statusA = getFollowUpStatus(a.scheduled_date);
    const statusB = getFollowUpStatus(b.scheduled_date);

    // Priority order: overdue > today > upcoming > future
    const priorityOrder = { overdue: 0, today: 1, upcoming: 2, future: 3 };
    const priorityDiff = priorityOrder[statusA] - priorityOrder[statusB];

    if (priorityDiff !== 0) return priorityDiff;

    // Within same priority, sort by date (earliest first)
    return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime();
  });
}

/**
 * Group follow-ups by status category
 */
export function groupFollowUpsByStatus(followUps: FollowUpDashboard[]): Record<FollowUpStatusCategory, FollowUpDashboard[]> {
  const groups: Record<FollowUpStatusCategory, FollowUpDashboard[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    future: [],
  };

  followUps.forEach(followUp => {
    const status = getFollowUpStatus(followUp.scheduled_date);
    groups[status].push(followUp);
  });

  return groups;
}

/**
 * Validate follow-up date (must be today or future)
 */
export function validateFollowUpDate(dateString: string): { valid: boolean; error?: string } {
  try {
    const date = parseISO(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date < today) {
      return { valid: false, error: 'Follow-up date cannot be in the past' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid date format' };
  }
}

/**
 * Get suggested follow-up dates
 */
export function getSuggestedDates(): { label: string; date: string }[] {
  const today = new Date();

  return [
    { label: 'Today', date: format(today, 'yyyy-MM-dd') },
    { label: 'Tomorrow', date: format(new Date(today.getTime() + 86400000), 'yyyy-MM-dd') },
    { label: 'In 3 days', date: format(new Date(today.getTime() + 86400000 * 3), 'yyyy-MM-dd') },
    { label: 'In 1 week', date: format(new Date(today.getTime() + 86400000 * 7), 'yyyy-MM-dd') },
    { label: 'In 2 weeks', date: format(new Date(today.getTime() + 86400000 * 14), 'yyyy-MM-dd') },
    { label: 'In 1 month', date: format(new Date(today.getTime() + 86400000 * 30), 'yyyy-MM-dd') },
  ];
}
