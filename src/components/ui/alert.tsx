// Re-export from design system for backward compatibility
export { PlaceholderCard as Alert } from '../../design-system';

export const AlertDescription: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`text-sm ${className}`}>{children}</div>
);