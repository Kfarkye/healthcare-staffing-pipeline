import { useMemo } from 'react';
import type { ClinicianRow, TabId } from '../types/submittals';

type SortPreference = 'urgency' | 'alphabetical' | 'recent' | 'oldest';

interface SortConfig {
  tab: TabId;
  preference?: SortPreference;
}

export function useSortedCandidates(
  rows: ClinicianRow[],
  config: SortConfig
): ClinicianRow[] {
  const { tab, preference } = config;

  return useMemo(() => {
    if (rows.length === 0) return rows;

    const sorted = [...rows];

    switch (tab) {
      case 'SUBMITTED':
        return sorted.sort((a, b) => {
          const daysA = a.days_since_submitted ?? 0;
          const daysB = b.days_since_submitted ?? 0;
          return daysB - daysA;
        });

      case 'OFFER':
        return sorted.sort((a, b) => {
          const daysA = a.days_since_submitted ?? 0;
          const daysB = b.days_since_submitted ?? 0;
          return daysB - daysA;
        });

      case 'PRESTART':
        return sorted.sort((a, b) => {
          const dateA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
          const dateB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
          return dateA - dateB;
        });

      case 'READY':
      default:
        switch (preference) {
          case 'alphabetical':
            return sorted.sort((a, b) =>
              (a.full_name ?? '').localeCompare(b.full_name ?? '')
            );

          case 'oldest':
            return sorted.sort((a, b) => {
              const dateA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
              const dateB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
              return dateA - dateB;
            });

          case 'urgency':
            return sorted.sort((a, b) => {
              const scoreA = calculateUrgencyScore(a);
              const scoreB = calculateUrgencyScore(b);
              return scoreB - scoreA;
            });

          case 'recent':
          default:
            return sorted.sort((a, b) => {
              const dateA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
              const dateB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
              return dateB - dateA;
            });
        }
    }
  }, [rows, tab, preference]);
}

function calculateUrgencyScore(row: ClinicianRow): number {
  let score = 0;

  if (row.primary_specialty) score += 10;

  if (row.email) score += 5;
  if (row.phone) score += 5;

  if (row.licenses && row.licenses.length > 0) score += 10;

  if (row.is_active_submittal) score += 15;

  if (row.other_engagements_count && row.other_engagements_count > 1) {
    score += row.other_engagements_count * 3;
  }

  return score;
}

export function getUrgencyLevel(days: number | null | undefined):
  'critical' | 'warning' | 'attention' | 'normal' {
  if (!days || days < 3) return 'normal';
  if (days >= 14) return 'critical';
  if (days >= 7) return 'warning';
  return 'attention';
}

export function getUrgencyIndicator(level: ReturnType<typeof getUrgencyLevel>) {
  switch (level) {
    case 'critical':
      return {
        color: 'bg-red-500',
        ringColor: 'ring-red-500/20',
        bgTint: 'bg-red-50/50',
        borderColor: 'border-red-200',
        label: 'Action Required',
        icon: '!',
      };
    case 'warning':
      return {
        color: 'bg-amber-500',
        ringColor: 'ring-amber-500/20',
        bgTint: 'bg-amber-50/50',
        borderColor: 'border-amber-200',
        label: 'Follow Up Soon',
        icon: '!',
      };
    case 'attention':
      return {
        color: 'bg-blue-500',
        ringColor: 'ring-blue-500/20',
        bgTint: 'bg-blue-50/50',
        borderColor: 'border-blue-200',
        label: 'Monitor',
        icon: '',
      };
    default:
      return null;
  }
}
