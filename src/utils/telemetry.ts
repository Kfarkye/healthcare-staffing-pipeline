// ============================================================================
// src/utils/telemetry.ts
// Centralized telemetry service with debouncing for high-frequency events.
// ============================================================================

/**
 * Debounce helper to prevent duplicate events from rapid interactions
 */
const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };
  
  return debounced as (...args: Parameters<F>) => void;
};

/**
 * Internal analytics implementation
 * Replace with your actual analytics provider (Segment, Mixpanel, etc.)
 */
const trackAnalyticsEvent = (
  eventName: string,
  properties: Record<string, unknown>
) => {
  // Development logging
  if (import.meta.env.DEV) {
    console.log('[Telemetry]', eventName, properties);
  }

  // Production analytics
  try {
    // @ts-ignore - Replace with your analytics provider
    if (typeof window !== 'undefined' && window.analytics?.track) {
      // @ts-ignore
      window.analytics.track(eventName, properties);
    }
  } catch (error) {
    console.error('[Telemetry] Error tracking event:', error);
  }
};

// Debounced version for modal open events (prevents double-logging on rapid clicks)
const debouncedOpenEvent = debounce(trackAnalyticsEvent, 1000);

/**
 * Track a custom event with automatic debouncing for specific event types.
 * 
 * Events:
 * - email_modal_opened: { kind, route, source_type, candidate_id, template? }
 * - email_modal_sent: { kind, with_attachments?, template? }
 * - email_modal_closed: { kind, reason }
 * - email_extraction_used: { kind, extraction_type, success }
 */
export const trackEvent = (
  eventName: string,
  properties: Record<string, unknown>
) => {
  // Debounce modal open events to prevent duplicates
  if (eventName === 'email_modal_opened') {
    debouncedOpenEvent(eventName, properties);
  } else {
    trackAnalyticsEvent(eventName, properties);
  }
};