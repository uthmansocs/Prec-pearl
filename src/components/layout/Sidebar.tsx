// src/components/Sidebar.tsx
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  Building2,
  FileText,
  TrendingUp,
  Settings,
  LogOut,
  Menu,
  X,
  MapPin,
  AlertTriangle,
  BarChart3,
  Plus,
  XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onCloseMobile }) => {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const navigation = [
    { name: 'Admin Dashboard', icon: TrendingUp, href: '/admin', roles: ['admin'] },
    {
      name: 'Site Data',
      icon: Building2,
      items: [
        { name: 'MTN', href: '/sites/mtn', roles: ['admin', 'fibre_network'] },
        { name: 'Airtel', href: '/sites/airtel', roles: ['admin', 'fibre_network'] },
        { name: 'Glo', href: '/sites/glo', roles: ['admin', 'fibre_network'] }
      ]
    },
    {
      name: 'Staff Workflow',
      icon: FileText,
      items: [
        { name: 'Create Report', href: '/staff/create-report', roles: ['staff'] },
        { name: 'In Progress', href: '/staff/in-progress', roles: ['staff'] },
        { name: 'Ready to Resolve', href: '/staff/resolved', roles: ['staff'] }
      ]
    },
    {
      name: 'Reports',
      icon: FileText,
      items: [
        { name: 'All Reports', href: '/reports', roles: ['admin', 'staff'] },
        { name: 'In Progress', href: '/reports/in-progress', roles: ['admin', 'staff'] },
        { name: 'Resolved', href: '/reports/resolved', roles: ['admin', 'staff'] },
        { name: 'Drafts', href: '/reports/drafts', roles: ['staff'] },
        { name: 'MTN Reports', href: '/reports/mtn', roles: ['admin', 'staff', 'fibre_network'] },
        { name: 'Airtel Reports', href: '/reports/airtel', roles: ['admin', 'staff', 'fibre_network'] },
        { name: 'Glo Reports', href: '/reports/glo', roles: ['admin', 'staff', 'fibre_network'] }
      ]
    },
    { name: 'Analytics', icon: BarChart3, href: '/analytics', roles: ['admin', 'staff', 'fibre_network'] },
    { name: 'Down Links', icon: AlertTriangle, href: '/down-links', roles: ['admin', 'fibre_network'] },
    { name: 'Close Link', icon: XCircle, href: '/close-link', roles: ['fibre_network'] },
    { name: 'Technician Map', icon: MapPin, href: '/technician-map', roles: ['admin', 'fibre_network'] },
    { name: 'Settings', icon: Settings, href: '/settings', roles: ['staff'] }
  ];

  const hasAccess = (roles: string[]) => profile && roles.includes(profile.role);
  const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(href + '/');

  const desktopClass = cn(
    "app-sidebar hidden sm:flex flex-col h-screen bg-card border-r border-border transition-all duration-300",
    isCollapsed ? "w-16" : "w-64"
  );

  return (
    <>
      {/* --- MOBILE DRAWER --- */}
      <div
        className={cn(
          "sm:hidden fixed inset-0 z-50 transition-opacity",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileOpen}
      >
        {/* overlay */}
        <div
          className={cn(
            "absolute inset-0 bg-black/40",
            mobileOpen ? "opacity-100" : "opacity-0",
            "transition-opacity"
          )}
          onClick={onCloseMobile}
        />

        {/* drawer panel */}
        <nav
          className={cn(
            "absolute top-0 left-0 h-full bg-card w-72 p-4 border-r border-border transform transition-transform",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Fibre Report Hub</h1>
                <p className="text-xs text-muted-foreground">Network Management</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onCloseMobile} className="p-0">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* user */}
          <div className="p-2 mb-3 border-b border-border">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-primary">
                  {profile?.full_name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{profile?.full_name}</p>
                <Badge variant="secondary" className="text-xs mt-1">
                  {profile?.role?.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>

          {/* nav items */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {profile?.role === 'staff' && (
              <Button asChild className="w-full justify-start mb-2">
                <Link to="/staff/create-report" onClick={onCloseMobile}>
                  <Plus className="h-4 w-4" />
                  <span className="ml-2">Create Report</span>
                </Link>
              </Button>
            )}

            {navigation.map((section) => {
              if (section.href) {
                if (!hasAccess(section.roles || [])) return null;
                const Icon = section.icon as any;
                return (
                  <Button
                    key={section.name}
                    asChild
                    variant={isActive(section.href) ? "default" : "ghost"}
                    className="w-full justify-start"
                  >
                    <Link to={section.href} onClick={onCloseMobile}>
                      <Icon className="h-4 w-4" />
                      <span className="ml-2">{section.name}</span>
                    </Link>
                  </Button>
                );
              }

              const accessibleItems = section.items?.filter(item => hasAccess(item.roles)) || [];
              if (accessibleItems.length === 0) return null;
              const SectionIcon = section.icon as any;

              return (
                <div key={section.name} className="space-y-1">
                  <h3 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {section.name}
                  </h3>
                  {accessibleItems.map(item => (
                    <Button
                      key={item.href}
                      asChild
                      variant={isActive(item.href) ? "default" : "ghost"}
                      className="w-full justify-start"
                    >
                      <Link to={item.href} onClick={onCloseMobile}>
                        <SectionIcon className="h-4 w-4" />
                        <span className="ml-2">{item.name}</span>
                      </Link>
                    </Button>
                  ))}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
            <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              <span className="ml-2">Sign Out</span>
            </Button>
          </div>
        </nav>
      </div>

      {/* --- DESKTOP SIDEBAR --- */}
      <aside className={desktopClass} aria-hidden={false}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          {!isCollapsed && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Fibre Report Hub</h1>
                <p className="text-xs text-muted-foreground">Network Management</p>
              </div>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => setIsCollapsed(!isCollapsed)} className="h-8 w-8 p-0">
            {isCollapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </Button>
        </div>

        {/* User Info */}
        {!isCollapsed && (
          <div className="p-4 border-b border-border">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-primary">
                  {profile?.full_name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{profile?.full_name}</p>
                <div className="flex items-center space-x-1">
                  <Badge variant="secondary" className="text-xs">
                    {profile?.role?.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {profile?.role === 'staff' && (
            <Button asChild className="w-full justify-start mb-4" size={isCollapsed ? "sm" : "default"}>
              <Link to="/staff/create-report">
                <Plus className="h-4 w-4" />
                {!isCollapsed && <span className="ml-2">Create Report</span>}
              </Link>
            </Button>
          )}

          {navigation.map((section) => {
            if (section.href) {
              if (!hasAccess(section.roles || [])) return null;
              const Icon = section.icon as any;
              return (
                <Button
                  key={section.name}
                  asChild
                  variant={isActive(section.href) ? "default" : "ghost"}
                  className="w-full justify-start"
                  size={isCollapsed ? "sm" : "default"}
                >
                  <Link to={section.href}>
                    <Icon className="h-4 w-4" />
                    {!isCollapsed && <span className="ml-2">{section.name}</span>}
                  </Link>
                </Button>
              );
            }

            const accessibleItems = section.items?.filter(item => hasAccess(item.roles)) || [];
            if (accessibleItems.length === 0) return null;
            const SectionIcon = section.icon as any;

            return (
              <div key={section.name} className="space-y-1">
                {!isCollapsed && (
                  <h3 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {section.name}
                  </h3>
                )}
                {accessibleItems.map((item) => (
                  <Button
                    key={item.href}
                    asChild
                    variant={isActive(item.href) ? "default" : "ghost"}
                    className="w-full justify-start"
                    size={isCollapsed ? "sm" : "default"}
                  >
                    <Link to={item.href}>
                      <SectionIcon className="h-4 w-4" />
                      {!isCollapsed && <span className="ml-2">{item.name}</span>}
                    </Link>
                  </Button>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-2">
          {!isCollapsed && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
          )}
          <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut} size={isCollapsed ? "sm" : "default"}>
            <LogOut className="h-4 w-4" />
            {!isCollapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
