// ============================================================================
// src/lib/dates.ts
// ULTIMATE PRODUCTION VERSION
// Date utilities for weekly priority reset logic
// ============================================================================

const WEEKLY_RESET_KEY = 'priority-board-last-reset';
const RESET_DAY = 1; // Monday (0 = Sunday, 1 = Monday, etc.)
const RESET_HOUR = 7; // 7 AM local time
const RESET_MINUTE = 0;

// ============================================================================
// WEEK CALCULATION
// ============================================================================

/**
 * Get the start of the current week (Monday at 7:00 AM local time)
 * This is when the weekly priority board resets
 */
export function getStartOfWeek(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  
  // Calculate how many days to go back to get to Monday
  // If today is Sunday (0), go back 6 days
  // If today is Monday (1), go back 0 days
  // If today is Tuesday (2), go back 1 day, etc.
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(RESET_HOUR, RESET_MINUTE, 0, 0);
  
  return monday;
}

/**
 * Get the start of the next week (next Monday at 7:00 AM local time)
 */
export function getStartOfNextWeek(): Date {
  const startOfWeek = getStartOfWeek();
  const nextWeek = new Date(startOfWeek);
  nextWeek.setDate(startOfWeek.getDate() + 7);
  return nextWeek;
}

/**
 * Check if current time is within the current week
 */
export function isThisWeek(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const weekStart = getStartOfWeek();
  const nextWeekStart = getStartOfNextWeek();
  
  return d >= weekStart && d < nextWeekStart;
}

// ============================================================================
// RESET LOGIC
// ============================================================================

/**
 * Check if we should run the weekly reset
 * Returns true if:
 * 1. We've never reset before, OR
 * 2. The last reset was before the current week's Monday 7 AM
 * 
 * This ensures the reset runs exactly once per week
 */
export function shouldResetThisWeek(): boolean {
  const lastResetStr = localStorage.getItem(WEEKLY_RESET_KEY);
  
  // If never reset before, we should reset
  if (!lastResetStr) {
    console.log('[Weekly Reset] No previous reset found - triggering first reset');
    return true;
  }
  
  try {
    const lastReset = new Date(lastResetStr);
    const currentWeekStart = getStartOfWeek();
    
    // If last reset was before this week's start, we should reset
    const shouldReset = lastReset < currentWeekStart;
    
    if (shouldReset) {
      console.log('[Weekly Reset] Last reset was before current week start - triggering reset');
      console.log(`  Last reset: ${lastReset.toLocaleString()}`);
      console.log(`  Week start: ${currentWeekStart.toLocaleString()}`);
    }
    
    return shouldReset;
  } catch (err) {
    console.error('[Weekly Reset] Error parsing last reset date:', err);
    // If there's an error, assume we should reset to be safe
    return true;
  }
}

/**
 * Mark the weekly reset as complete for the current week
 * Stores the current timestamp in localStorage
 */
export function markResetComplete(): void {
  const now = new Date().toISOString();
  localStorage.setItem(WEEKLY_RESET_KEY, now);
  console.log('[Weekly Reset] Marked complete:', now);
}

/**
 * Get a human-readable string for when the next reset will occur
 */
export function getNextResetTime(): string {
  const nextWeek = getStartOfNextWeek();
  const now = new Date();
  
  const diffMs = nextWeek.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Today at 7:00 AM';
  } else if (diffDays === 1) {
    return 'Tomorrow at 7:00 AM';
  } else {
    const dayName = nextWeek.toLocaleDateString('en-US', { weekday: 'long' });
    return `${dayName} at 7:00 AM (in ${diffDays} days)`;
  }
}

/**
 * Get days remaining until next reset
 */
export function getDaysUntilReset(): number {
  const nextWeek = getStartOfNextWeek();
  const now = new Date();
  
  const diffMs = nextWeek.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================================================
// RELATIVE TIME FORMATTING
// ============================================================================

/**
 * Format a date as a relative time string
 * Examples: "Just now", "5m ago", "3h ago", "2d ago", "Jan 15"
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffSecs < 10) {
    return 'Just now';
  } else if (diffSecs < 60) {
    return `${diffSecs}s ago`;
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}w ago`;
  } else {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

/**
 * Check if a date is within the last N days
 */
export function isWithinDays(date: Date | string, days: number): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  
  return diffDays >= 0 && diffDays <= days;
}

/**
 * Format a duration in milliseconds to a human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

// ============================================================================
// DEBUGGING UTILITIES
// ============================================================================

/**
 * Get detailed reset status for debugging
 */
export function getResetDebugInfo(): {
  lastReset: string | null;
  currentWeekStart: string;
  nextWeekStart: string;
  shouldReset: boolean;
  daysUntilReset: number;
} {
  const lastResetStr = localStorage.getItem(WEEKLY_RESET_KEY);
  
  return {
    lastReset: lastResetStr,
    currentWeekStart: getStartOfWeek().toISOString(),
    nextWeekStart: getStartOfNextWeek().toISOString(),
    shouldReset: shouldResetThisWeek(),
    daysUntilReset: getDaysUntilReset(),
  };
}

/**
 * Manually trigger a reset (for testing/admin purposes)
 * WARNING: This bypasses the weekly schedule
 */
export function forceResetNextLoad(): void {
  localStorage.removeItem(WEEKLY_RESET_KEY);
  console.warn('[Weekly Reset] Force reset triggered - will reset on next page load');
}