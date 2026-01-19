import { Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface LoadingSpinnerProps {
  size?: number;
  message?: string;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 32,
  message = 'Loading...',
  className = '',
}) => {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className="text-center">
        <Loader2 size={size} className="text-slate-400 animate-spin mx-auto mb-3" />
        {message && <p className="text-sm text-slate-600 font-medium">{message}</p>}
      </div>
    </div>
  );
};
