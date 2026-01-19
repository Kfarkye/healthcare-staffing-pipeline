export const TYPOGRAPHY = {
  h1: 'text-xl font-semibold tracking-tight',
  h2: 'text-lg font-semibold tracking-tight',
  h3: 'text-base font-semibold',
  h4: 'text-sm font-semibold',
  h5: 'text-xs font-semibold uppercase tracking-wider',

  body: 'text-sm text-slate-700',
  bodySmall: 'text-xs text-slate-600',
  caption: 'text-xs text-slate-500',

  button: 'text-sm font-medium',
  buttonSmall: 'text-xs font-semibold',
  link: 'text-sm font-medium text-blue-600 hover:text-blue-700',

  label: 'text-sm font-medium text-slate-700',
  labelSmall: 'text-xs font-medium text-slate-600',

  mono: 'font-mono tabular-nums',
} as const;

export const MICROCOPY = {
  formatDaysAgo: (days: number) => `${days}d ago`,
  formatDaysUntil: (days: number) => `${days} days until start`,

  noData: 'No data available',
  loading: 'Loading...',
  error: 'Something went wrong',
  success: 'Success!',

  noCandidates: 'No candidates found',
  noResults: 'No results match your search',

  viewDetails: 'View details',
  edit: 'Edit',
  delete: 'Delete',
  save: 'Save',
  cancel: 'Cancel',
  confirm: 'Confirm',

  goBack: 'Go back',
  next: 'Next',
  previous: 'Previous',

  candidate: 'candidate',
  candidates: 'candidates',
  submission: 'submission',
  submissions: 'submissions',
  offer: 'offer',
  offers: 'offers',
} as const;

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return singular;
  return plural || `${singular}s`;
}

export function toSentenceCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
