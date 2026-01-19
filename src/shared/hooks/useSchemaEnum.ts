/**
 * Hook for fetching ENUM values dynamically from Postgres schema
 * Provides type-safe select options for UI components
 *
 * Example usage:
 * ```tsx
 * const { data: statusOptions, isLoading } = useSchemaEnum('prospects', 'status');
 * <Select options={statusOptions} disabled={isLoading} />
 * ```
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

export interface EnumOption {
  value: string;
  label: string;
}

/**
 * Fetches ENUM values from a Postgres table column and caches them
 * @param tableName - The name of the table (e.g., 'prospects')
 * @param columnName - The name of the column with an ENUM type (e.g., 'status')
 * @param options - Optional configuration for formatting and caching
 */
export function useSchemaEnum(
  tableName: string,
  columnName: string,
  options?: {
    /** Custom label formatter (default: capitalize and replace underscores) */
    formatLabel?: (value: string) => string;
    /** Cache time in ms (default: 1 hour) */
    staleTime?: number;
  }
) {
  const formatLabel = options?.formatLabel || defaultFormatLabel;
  const staleTime = options?.staleTime ?? 1000 * 60 * 60; // 1 hour default

  return useQuery({
    queryKey: ['schema-enum', tableName, columnName],
    queryFn: async (): Promise<EnumOption[]> => {
      const { data, error } = await supabase.rpc('get_enum_values', {
        table_name: tableName,
        column_name: columnName,
      });

      if (error) {
        console.error('[useSchemaEnum] Error fetching ENUMs:', error);
        throw new Error(
          `Failed to fetch ENUM values for ${tableName}.${columnName}: ${error.message}`
        );
      }

      if (!data || !Array.isArray(data)) {
        console.warn('[useSchemaEnum] No ENUM values returned for', tableName, columnName);
        return [];
      }

      return data.map((value: string) => ({
        value,
        label: formatLabel(value),
      }));
    },
    staleTime, // Cache ENUMs for specified time
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
    retry: 2, // Retry twice on failure
  });
}

/**
 * Default label formatter: capitalize first letter and replace underscores with spaces
 * Examples:
 *   'active' → 'Active'
 *   'not_interested' → 'Not interested'
 *   'profile_updates' → 'Profile updates'
 */
function defaultFormatLabel(value: string): string {
  return value
    .split('_')
    .map((word, idx) =>
      idx === 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()
    )
    .join(' ');
}

/**
 * Utility hook for multiple ENUMs at once
 * Useful when a form needs several ENUM dropdowns
 *
 * Example:
 * ```tsx
 * const enums = useMultipleEnums([
 *   ['prospects', 'status'],
 *   ['prospects', 'profession'],
 *   ['engagements', 'engagement_status']
 * ]);
 * ```
 */
export function useMultipleEnums(
  specs: Array<[tableName: string, columnName: string]>
) {
  const results = specs.map(([table, column]) => useSchemaEnum(table, column));

  return {
    data: results.map((r) => r.data),
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
    errors: results.map((r) => r.error).filter(Boolean),
  };
}
