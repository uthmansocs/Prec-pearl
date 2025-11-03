import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveLayoutProps {
  children: ReactNode;
  className?: string;
}

export function ResponsiveLayout({ children, className }: ResponsiveLayoutProps) {
  return (
    <div className={cn(
      "w-full min-h-screen",
      "px-4 py-6 sm:px-6 lg:px-8",
      "space-y-4 sm:space-y-6",
      "max-w-screen-xl mx-auto",
      className
    )}>
      {children}
    </div>
  );
}


export function ResponsiveGrid({ children, className }: ResponsiveLayoutProps) {
  return (
    <div className={cn(
      "grid gap-4 sm:gap-6",
      "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      className
    )}>
      {children}
    </div>
  );
}

export function ResponsiveTable({ children, className }: ResponsiveLayoutProps) {
  return (
    <div className={cn(
      "w-full overflow-auto",
      "table-responsive",
      className
    )}>
      <div className="min-w-full">
        {children}
      </div>
    </div>
  );
}