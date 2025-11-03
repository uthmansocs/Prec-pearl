// src/layouts/AppLayout.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Responsive enhancement: copy table headers into td[data-label]
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const enhanceTables = () => {
      const wrappers = Array.from(document.querySelectorAll<HTMLElement>('.table-responsive'));
      wrappers.forEach((wrapper) => {
        const table = wrapper.querySelector('table');
        if (!table) return;

        const ths = Array.from(table.querySelectorAll('thead th')).map(h => h.textContent?.trim() || '');
        table.querySelectorAll('tbody tr').forEach((tr) => {
          Array.from(tr.children).forEach((cell, idx) => {
            const el = cell as HTMLElement;
            const label = ths[idx] || '';
            if (!el.hasAttribute('data-label') && label) {
              el.setAttribute('data-label', label);
            }
          });
        });
      });
    };

    enhanceTables();
    window.addEventListener('resize', enhanceTables);
    return () => window.removeEventListener('resize', enhanceTables);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-background overflow-x-hidden">
      {/* Sidebar: desktop + mobile drawer */}
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col w-full">
        {/* Mobile header */}
        <header className="sm:hidden z-20 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="p-2" onClick={() => setMobileOpen(true)} aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
              <div className="text-lg font-semibold">Fibre Report Hub</div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">v1.0</div>
          </div>
        </header>

        {/* Content section */}
        <main className="flex-1 overflow-y-auto w-full">
          <div className="max-w-screen-xl w-full mx-auto px-4 sm:px-6 py-4">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
