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

export const Sidebar = () => {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const navigation = [
    {
      name: 'Admin Dashboard',
      icon: TrendingUp,
      href: '/admin',
      roles: ['admin']
    },
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
    {
      name: 'Analytics',
      icon: BarChart3,
      href: '/analytics',
      roles: ['admin', 'staff','fibre_network' ]
    },
    {
      name: 'Down Links',
      icon: AlertTriangle,
      href: '/down-links',
      roles: ['admin', 'fibre_network']
    },
    {
      name: 'Close Link',
      icon: XCircle,
      href: '/close-link',
      roles: ['fibre_network']
    },
    {
      name: 'Technician Map',
      icon: MapPin,
      href: '/technician-map',
      roles: ['admin', 'fibre_network']
    },
    {
      name: 'Settings',
      icon: Settings,
      href: '/settings',
      roles: ['staff']
    }
  ];

  const hasAccess = (roles: string[]) => {
    return profile && roles.includes(profile.role);
  };

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  return (
    <div className={cn(
      "flex flex-col h-screen bg-card border-r border-border transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-8 w-8 p-0"
        >
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
              <p className="text-sm font-medium text-foreground truncate">
                {profile?.full_name}
              </p>
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
        {/* Quick Action Button for Staff */}
        {profile?.role === 'staff' && (
          <Button
            asChild
            className="w-full justify-start mb-4"
            size={isCollapsed ? "sm" : "default"}
          >
            <Link to="/staff/create-report">
              <Plus className="h-4 w-4" />
              {!isCollapsed && <span className="ml-2">Create Report</span>}
            </Link>
          </Button>
        )}

        {navigation.map((section) => {
          if (section.href) {
            // Single item navigation
            if (!hasAccess(section.roles || [])) return null;
            
            return (
              <Button
                key={section.name}
                asChild
                variant={isActive(section.href) ? "default" : "ghost"}
                className="w-full justify-start"
                size={isCollapsed ? "sm" : "default"}
              >
                <Link to={section.href}>
                  <section.icon className="h-4 w-4" />
                  {!isCollapsed && <span className="ml-2">{section.name}</span>}
                </Link>
              </Button>
            );
          }

          // Section with multiple items
          const accessibleItems = section.items?.filter(item => hasAccess(item.roles)) || [];
          if (accessibleItems.length === 0) return null;

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
                    <section.icon className="h-4 w-4" />
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
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={handleSignOut}
          size={isCollapsed ? "sm" : "default"}
        >
          <LogOut className="h-4 w-4" />
          {!isCollapsed && <span className="ml-2">Sign Out</span>}
        </Button>
      </div>
    </div>
  );
};