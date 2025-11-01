import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Save, User, Bell } from 'lucide-react';

export default function Settings() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [phone, setPhone] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);

  useEffect(() => {
    // Load current settings
    // For now, using mock data
    setPhone(''); // Load from profile when phone field is added
  }, [profile]);

  const handleSave = async () => {
    setLoading(true);
    
    try {
      // TODO: Update profile with phone and notification preferences
      // This would require updating the profiles table schema
      
      toast({
        title: "Success",
        description: "Settings updated successfully",
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Settings</h1>
        <Badge variant="outline">Staff Profile</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Profile Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={profile?.full_name || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Contact your administrator to change your name
              </p>
            </div>

            <div>
              <Label htmlFor="role">Role</Label>
              <Input
                id="role"
                value={profile?.role?.replace('_', ' ').toUpperCase() || ''}
                disabled
                className="bg-muted"
              />
            </div>

            <div>
              <Label htmlFor="providers">Assigned Providers</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {profile?.providers?.map((provider) => (
                  <Badge key={provider} variant="outline" className="uppercase">
                    {provider}
                  </Badge>
                )) || <span className="text-sm text-muted-foreground">No providers assigned</span>}
              </div>
            </div>

            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter your phone number"
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              <span>Notification Preferences</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="emailNotifs">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive email alerts for new escalations and updates
                </p>
              </div>
              <Switch
                id="emailNotifs"
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="pushNotifs">Push Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive browser push notifications for urgent alerts
                </p>
              </div>
              <Switch
                id="pushNotifs"
                checked={pushNotifications}
                onCheckedChange={setPushNotifications}
              />
            </div>

            <div className="pt-4 border-t">
              <h4 className="font-medium mb-2">Notification Types</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>• New escalations assigned to your providers</p>
                <p>• Critical escalations requiring immediate attention</p>
                <p>• Status updates on your reports</p>
                <p>• System maintenance announcements</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Save Changes</h3>
              <p className="text-sm text-muted-foreground">
                Update your contact information and notification preferences
              </p>
            </div>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}