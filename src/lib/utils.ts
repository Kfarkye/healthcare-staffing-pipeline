// ============================================================================
// Shared Utilities
// Common helper functions used across dashboards
// ============================================================================

export const cn = (...classes: Array<string | boolean | null | undefined>) =>
  classes.filter(Boolean).join(' ');

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
