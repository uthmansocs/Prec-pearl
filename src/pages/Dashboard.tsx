import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, FileText, AlertTriangle, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const { profile } = useAuth();

  const getWelcomeMessage = () => {
    const roleMessages = {
      admin: "You have full access to all system features including analytics and technician tracking.",
      staff: "You can manage reports, view site data, and track escalation progress.",
      fibre_network: "You can escalate links, view site data, and manage down links."
    };
    
    return roleMessages[profile?.role as keyof typeof roleMessages] || "Welcome to the system.";
  };

  const getRoleFeatures = () => {
    const features = {
      admin: [
        { icon: Building2, title: "Site Management", description: "View and manage MTN, Airtel, and Glo sites" },
        { icon: FileText, title: "Report Oversight", description: "Monitor all reports and their progress" },
        { icon: AlertTriangle, title: "Down Links", description: "View and manage all escalated links" },
        { icon: TrendingUp, title: "Analytics", description: "Access comprehensive system analytics" }
      ],
      staff: [
        { icon: Building2, title: "Site Data", description: "Access MTN, Airtel, and Glo site information" },
        { icon: FileText, title: "Report Management", description: "Create and manage incident reports" },
        { icon: TrendingUp, title: "Analytics", description: "View system performance metrics" }
      ],
      fibre_network: [
        { icon: Building2, title: "Site Access", description: "View MTN, Airtel, and Glo site data" },
        { icon: AlertTriangle, title: "Link Escalation", description: "Escalate network link issues" },
        { icon: AlertTriangle, title: "Down Links", description: "Monitor escalated link status" }
      ]
    };
    
    return features[profile?.role as keyof typeof features] || [];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Welcome back, {profile?.full_name}
          </h1>
          <p className="text-muted-foreground mt-2">
            {getWelcomeMessage()}
          </p>
        </div>
        <Badge variant="secondary" className="text-sm px-3 py-1">
          {profile?.role?.replace('_', ' ').toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {getRoleFeatures().map((feature, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center space-y-0 pb-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mr-3">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>{feature.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks based on your role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profile?.role === 'staff' && (
              <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
                <FileText className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium">Create New Report</p>
                  <p className="text-sm text-muted-foreground">Document network incidents</p>
                </div>
              </div>
            )}
            
            {(profile?.role === 'admin' || profile?.role === 'fibre_network') && (
              <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <div>
                  <p className="font-medium">View Down Links</p>
                  <p className="text-sm text-muted-foreground">Monitor escalated links</p>
                </div>
              </div>
            )}
            
            {(profile?.role === 'admin' || profile?.role === 'staff') && (
              <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
                <TrendingUp className="w-5 h-5 text-success" />
                <div>
                  <p className="font-medium">View Analytics</p>
                  <p className="text-sm text-muted-foreground">System performance insights</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}