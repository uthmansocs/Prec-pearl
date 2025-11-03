// src/layouts/AppLayout.tsx
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

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
    <div className="flex min-h-screen bg-background">
      {/* Sidebar: desktop + mobile drawer */}
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Topbar for mobile (only visible on small screens) */}
        <header className="sm:hidden z-20 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="p-2" onClick={() => setMobileOpen(true)} aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
              <div className="text-lg font-semibold">Fibre Report Hub</div>
            </div>

            <div className="flex items-center gap-2">
              {/* space for small actions or notifications */}
              <div className="text-sm text-muted-foreground">v1.0</div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-screen-xl mx-auto p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
