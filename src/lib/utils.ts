// ============================================================================
// Shared Utilities
// Common helper functions used across dashboards
// ============================================================================

type ClassValue = string | boolean | null | undefined | Record<string, boolean | undefined>;

export const cn = (...classes: ClassValue[]): string => {
  const result: string[] = [];

  for (const cls of classes) {
    if (!cls) continue;

    if (typeof cls === 'string') {
      result.push(cls);
    } else if (typeof cls === 'object') {
      for (const [key, value] of Object.entries(cls)) {
        if (value) result.push(key);
      }
    }
  }

  return result.join(' ');
};

export const formatPhoneLink = (phone?: string | null) =>
  phone ? `tel:${phone.replace(/\D/g, '')}` : '';

export const getFirstName = (name?: string | null) =>
  (name?.trim()?.split(' ')[0] ?? '').replace(/[^A-Za-z'-]/g, '') || 'there';

export const formatNovaLink = (id?: number | null) =>
  id ? `https://nova.ayahealthcare.com/#/recruiting/candidates/${id}/new-profile/about` : '';

export const formatDate = (dateString: string | null): string => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
