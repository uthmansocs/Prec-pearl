import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useMTTRAlert } from "@/hooks/useMTTRAlert";
import { Escalation, ProviderType, EscalationStatus } from "@/types/database";
import { AlertTriangle, Users, Building, FileText, Activity } from "lucide-react";
import { format } from "date-fns";

interface User {
  id: string;
  full_name: string | null;
  email?: string | null;
  role: string;
  staff_type?: string | null;
  is_team_lead?: boolean | null;
  is_regional_manager?: boolean | null;
  created_at?: string | null;
}

interface SiteData {
  airtel: any[];
  mtn: any[];
  glo: any[];
}

interface EscalationData {
  id: string;
  provider: ProviderType;
  site_a_id: string;
  site_b_id: string;
  link_id: string;
  ticket_id: string;
  status: EscalationStatus;
  created_at: string;
  updated_at: string;
  mttr_hours: number;
  has_report: boolean;
}

interface ReportData {
  id: string;
  issue_description: string;
  reported_by: string;
  status: string;
  is_critical: boolean;
  created_at: string;
}

interface NotificationData {
  id: string;
  message: string;
  created_at: string;
  recipient_id: string;
}

interface AnalyticsData {
  totalEscalations: number;
  totalReports: number;
  inProgress: number;
  resolved: number;
  mttrCompliance: number;
  hotZones: { site_id: string; count: number }[];
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [siteData, setSiteData] = useState<SiteData>({ airtel: [], mtn: [], glo: [] });
  const [escalations, setEscalations] = useState<EscalationData[]>([]);
  const [reports, setReports] = useState<ReportData[]>([]);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalEscalations: 0,
    totalReports: 0,
    inProgress: 0,
    resolved: 0,
    mttrCompliance: 0,
    hotZones: []
  });
  const [loading, setLoading] = useState(true);

  // User / filter state
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | string>("all");

  // generic search / filter used for escalations & reports
  const [searchTerm, setSearchTerm] = useState("");
  const [providerFilter, setProviderFilter] = useState<"all" | ProviderType | string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | string>("all");

  const urgentEscalations = useMTTRAlert(escalations);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      // Fetch users (profiles) — select explicit fields to guarantee shape
      const { data: usersData, error: usersError } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, staff_type, is_team_lead, is_regional_manager, created_at")
        .order("created_at", { ascending: false });

      if (usersError) {
        console.error("Error fetching users:", usersError);
      }

      // Fetch site data
      const [airtelSitesRes, mtnSitesRes, gloSitesRes] = await Promise.all([
        supabase.from("airtel_sites").select("*"),
        supabase.from("mtn_sites").select("*"),
        supabase.from("glo_sites").select("*")
      ]);

      // Fetch escalations and reports + notifications
      const [escalationsRes, reportsRes, notificationsRes] = await Promise.all([
        supabase.from("escalations").select("*").order("created_at", { ascending: false }),
        supabase.from("reports").select("*").order("created_at", { ascending: false }),
        supabase.from("notification_log").select("*").order("created_at", { ascending: false })
      ]);

      setUsers(usersData || []);
      setSiteData({
        airtel: airtelSitesRes.data || [],
        mtn: mtnSitesRes.data || [],
        glo: gloSitesRes.data || []
      });
      setEscalations(escalationsRes.data || []);
      setReports(reportsRes.data || []);
      setNotifications(notificationsRes.data || []);

      // Analytics
      const totalEscalations = escalationsRes.data?.length || 0;
      const totalReports = reportsRes.data?.length || 0;
      const inProgress = reportsRes.data?.filter(r => r.status === 'in_progress').length || 0;
      const resolved = reportsRes.data?.filter(r => r.status === 'resolved').length || 0;

      // Hot zones: sites with >= 3 incidents in last 24h
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentEscalations = escalationsRes.data?.filter((e: any) => e?.created_at && new Date(e.created_at) > last24h) || [];
      const siteCounts: Record<string, number> = {};
      recentEscalations.forEach((e: any) => {
        siteCounts[e.site_a_id] = (siteCounts[e.site_a_id] || 0) + 1;
        siteCounts[e.site_b_id] = (siteCounts[e.site_b_id] || 0) + 1;
      });
      const hotZones = Object.entries(siteCounts)
        .filter(([, count]) => count >= 3)
        .map(([site_id, count]) => ({ site_id, count }))
        .sort((a, b) => b.count - a.count);

      setAnalytics({
        totalEscalations,
        totalReports,
        inProgress,
        resolved,
        mttrCompliance: totalEscalations > 0 ? (resolved / totalEscalations) * 100 : 0,
        hotZones
      });
    } catch (err) {
      console.error("Error fetching admin data:", err);
    } finally {
      setLoading(false);
    }
  };
  

  // Users filtering
  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    return users.filter(u => {
      const matchesRole = userRoleFilter === "all" || (u.role || "").toLowerCase() === (userRoleFilter || "").toLowerCase();
      if (!term) return matchesRole;
      const inName = (u.full_name || "").toLowerCase().includes(term);
      const inEmail = (u.email || "").toLowerCase().includes(term);
      const inRole = (u.role || "").toLowerCase().includes(term);
      const inStaffType = (u.staff_type || "").toLowerCase().includes(term);
      return matchesRole && (inName || inEmail || inRole || inStaffType);
    });
  }, [users, userSearch, userRoleFilter]);

  const filteredEscalations = escalations.filter(escalation => {
    const matchesSearch = searchTerm === '' ||
      escalation.ticket_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      escalation.site_a_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      escalation.site_b_id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesProvider = providerFilter === 'all' || escalation.provider === providerFilter;
    const matchesStatus = statusFilter === 'all' || escalation.status === statusFilter;

    return matchesSearch && matchesProvider && matchesStatus;
  });

  const filteredReports = reports.filter(report => {
    const matchesSearch = searchTerm === '' ||
      (report.issue_description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (report.reported_by || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || report.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <Badge variant="secondary" className="text-sm">View Only</Badge>
      </div>

      {/* Analytics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Escalations</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalEscalations}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.inProgress}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.resolved}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTTR Compliance</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.mttrCompliance.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Hot Zones Alert */}
      {analytics.hotZones.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Hot Zones Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {analytics.hotZones.map(zone => (
                <div key={zone.site_id} className="flex justify-between items-center p-3 bg-destructive/10 rounded-lg">
                  <span className="font-medium">{zone.site_id}</span>
                  <Badge variant="destructive">{zone.count} incidents</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="sites">Site Data</TabsTrigger>
          <TabsTrigger value="escalations">Escalations</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Users Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <Input
                  placeholder="Search users by name, email, role or staff type..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="max-w-lg"
                />
                <Select value={userRoleFilter} onValueChange={(val) => setUserRoleFilter(val)}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="fibre_network">Fibre Network</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Staff Type</TableHead>
                      <TableHead>Regional Manager</TableHead>
                      <TableHead>Team Lead</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.full_name ?? "—"}</TableCell>
                        <TableCell>{user.email ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {(user.role || "").replace("_", " ").toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>{user.staff_type ?? "—"}</TableCell>
                        <TableCell>
                          {user.is_regional_manager ? <Badge variant="destructive">YES</Badge> : <span>—</span>}
                        </TableCell>
                        <TableCell>
                          {user.is_team_lead ? <Badge variant="secondary">YES</Badge> : <span>—</span>}
                        </TableCell>
                        <TableCell>
                          {user.created_at ? format(new Date(user.created_at), "PPp") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sites" className="space-y-4">
          <Tabs defaultValue="airtel">
            <TabsList>
              <TabsTrigger value="airtel">Airtel Sites ({siteData.airtel.length})</TabsTrigger>
              <TabsTrigger value="mtn">MTN Sites ({siteData.mtn.length})</TabsTrigger>
              <TabsTrigger value="glo">Glo Sites ({siteData.glo.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="airtel">
              <Card>
                <CardHeader>
                  <CardTitle>Airtel Sites</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Site Name</TableHead>
                          <TableHead>City</TableHead>
                          <TableHead>State</TableHead>
                          <TableHead>Address</TableHead>
                          <TableHead>Vendor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {siteData.airtel.slice(0, 50).map((site, index) => (
                          <TableRow key={index}>
                            <TableCell>{site.site_name}</TableCell>
                            <TableCell>{site.CITY}</TableCell>
                            <TableCell>{site.STATE}</TableCell>
                            <TableCell>{site["SITE ADDRESS"]}</TableCell>
                            <TableCell>{site.VENDOR}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mtn">
              <Card>
                <CardHeader>
                  <CardTitle>MTN Sites</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site ID</TableHead>
                        <TableHead>Site Name</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Address</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {siteData.mtn.slice(0, 50).map((site) => (
                        <TableRow key={site.id}>
                          <TableCell>{site.site_id}</TableCell>
                          <TableCell>{site.site_name}</TableCell>
                          <TableCell>{site.city}</TableCell>
                          <TableCell>{site.state}</TableCell>
                          <TableCell>{site.address}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="glo">
              <Card>
                <CardHeader>
                  <CardTitle>Glo Sites</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site ID</TableHead>
                        <TableHead>Site Name</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Address</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {siteData.glo.slice(0, 50).map((site) => (
                        <TableRow key={site.id}>
                          <TableCell>{site.site_id}</TableCell>
                          <TableCell>{site.site_name}</TableCell>
                          <TableCell>{site.city}</TableCell>
                          <TableCell>{site.state}</TableCell>
                          <TableCell>{site.address}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="escalations" className="space-y-4">
          <div className="flex gap-4 mb-4">
            <Input
              placeholder="Search escalations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={providerFilter} onValueChange={(val) => setProviderFilter(val)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                <SelectItem value="mtn">MTN</SelectItem>
                <SelectItem value="airtel">Airtel</SelectItem>
                <SelectItem value="glo">Glo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Escalations ({filteredEscalations.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket ID</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Site A</TableHead>
                    <TableHead>Site B</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>MTTR (hrs)</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEscalations.map((escalation) => (
                    <TableRow key={escalation.id}>
                      <TableCell className="font-medium">{escalation.ticket_id}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{escalation.provider.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell>{escalation.site_a_id}</TableCell>
                      <TableCell>{escalation.site_b_id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={escalation.status === 'resolved' ? 'default' : 
                                    escalation.status === 'in_progress' ? 'secondary' : 'destructive'}
                            className={urgentEscalations.has(escalation.id) ? 'animate-pulse border-red-500' : ''}
                          >
                            {escalation.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                          {urgentEscalations.has(escalation.id) && (
                            <Badge variant="destructive" className="text-xs animate-pulse">
                              URGENT
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{escalation.mttr_hours}</TableCell>
                      <TableCell>{format(new Date(escalation.created_at), 'PPp')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <div className="flex gap-4 mb-4">
            <Input
              placeholder="Search reports..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Reports ({filteredReports.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Reported By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Critical</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="max-w-xs truncate">{report.issue_description}</TableCell>
                      <TableCell>{report.reported_by}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={report.status === 'resolved' ? 'default' : 'secondary'}
                        >
                          {report.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {report.is_critical && <Badge variant="destructive">Critical</Badge>}
                      </TableCell>
                      <TableCell>{format(new Date(report.created_at), 'PPp')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Logs ({notifications.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Message</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.slice(0, 100).map((notification) => (
                    <TableRow key={notification.id}>
                      <TableCell className="max-w-md truncate">{notification.message}</TableCell>
                      <TableCell>{notification.recipient_id}</TableCell>
                      <TableCell>{format(new Date(notification.created_at), 'PPp')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
