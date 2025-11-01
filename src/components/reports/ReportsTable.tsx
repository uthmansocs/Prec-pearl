import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Filter, Search, Edit } from 'lucide-react';
import { ProviderType, EscalationStatus } from '@/types/database';
import { format } from 'date-fns';

interface ReportsTableProps {
  provider?: ProviderType;
  title?: string;
}

interface EscalationWithReport {
  id: string;
  provider: ProviderType;
  site_a_id: string;
  site_b_id: string;
  link_id: string;
  ticket_id: string;
  mttr_hours: number;
  status: EscalationStatus;
  has_report: boolean;
  created_at: string;
  updated_at: string;
  cof?: string | null;
  pof?: string | null;

  reports?: {
    id: string;
    issue_description: string;
    reported_by: string;
    is_critical: boolean;
    status: EscalationStatus;
    created_at: string;
    updated_at: string;
  }[];
}

export const ReportsTable: React.FC<ReportsTableProps> = ({ provider, title = "All Reports" }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<EscalationWithReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>(provider || 'all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Modal state
  const [selectedReport, setSelectedReport] = useState<EscalationWithReport['reports'][0] | null>(null);

  const fetchData = async () => {
    try {
      let query = supabase
        .from('escalations')
        .select(`
          *,
          reports(*)
        `)
        .order('created_at', { ascending: false });

      if (provider) {
        query = query.eq('provider', provider);
      }

      const { data: escalations, error } = await query;

      if (error) throw error;
      setData(escalations || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch reports data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('reports-table-updates')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'escalations' },
        () => fetchData()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'reports' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [provider]);

  const filteredData = data.filter(item => {
    const matchesSearch =
      item.ticket_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.site_a_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.site_b_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.link_id.toLowerCase().includes(searchTerm.toLowerCase());

    const latestReport = item.reports?.[item.reports.length - 1];
    const statusToCheck = latestReport ? latestReport.status : item.status;

    const matchesStatus = statusFilter === 'all' || statusToCheck === statusFilter;
    const matchesProvider = providerFilter === 'all' || item.provider === providerFilter;
    const matchesPriority = priorityFilter === 'all' ||
      (priorityFilter === 'critical' && item.reports?.some(r => r.is_critical)) ||
      (priorityFilter === 'normal' && !item.reports?.some(r => r.is_critical));

    return matchesSearch && matchesStatus && matchesProvider && matchesPriority;
  });

  const getStatusBadge = (status: EscalationStatus) => {
    const variants = {
      pending: 'destructive',
      in_progress: 'default',
      resolved: 'secondary'
    } as const;

    return (
      <Badge variant={variants[status]}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getPriorityBadge = (reports: any[]) => {
    const isCritical = reports?.some(r => r.is_critical);
    return (
      <Badge variant={isCritical ? 'destructive' : 'outline'}>
        {isCritical ? 'CRITICAL' : 'NORMAL'}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            {title}
            <Badge variant="outline">{filteredData.length} items</Badge>
          </CardTitle>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tickets, sites..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>

            {!provider && (
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  <SelectItem value="mtn">MTN</SelectItem>
                  <SelectItem value="airtel">Airtel</SelectItem>
                  <SelectItem value="glo">Glo</SelectItem>
                </SelectContent>
              </Select>
            )}

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => {
              setSearchTerm('');
              setStatusFilter('all');
              setProviderFilter(provider || 'all');
              setPriorityFilter('all');
            }}>
              <Filter className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket ID</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>MTTR (hrs)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((item) => {
                  const latestReport = item.reports?.[item.reports.length - 1];
                  const statusToShow = latestReport ? latestReport.status : item.status;

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">{item.ticket_id}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{item.site_a_id} ↔ {item.site_b_id}</span>
                          <span className="text-xs text-muted-foreground">{item.link_id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase">
                          {item.provider}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.mttr_hours}</TableCell>
                      <TableCell>{getStatusBadge(statusToShow)}</TableCell>
                      <TableCell>{getPriorityBadge(item.reports || [])}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(item.created_at), 'MMM dd, HH:mm')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(item.updated_at), 'MMM dd, HH:mm')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {profile?.role === 'staff' && item.reports && item.reports.length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedReport(item.reports?.[0] || null)}
                            >
                              View
                            </Button>
                          )}
                          {profile?.role === 'fibre_network' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/escalations/edit/${item.id}`, '_blank')}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                          )}
                          {item.reports && item.reports.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {item.reports.length} report(s)
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {filteredData.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No reports found matching the current filters.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Modal */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Report Details</DialogTitle>
          </DialogHeader>
          {selectedReport && (
            <div className="space-y-2 text-sm">
              <p><span className="font-semibold">Issue:</span> {selectedReport.issue_description}</p>
              <p><span className="font-semibold">Reported By:</span> {selectedReport.reported_by}</p>
              <p><span className="font-semibold">Status:</span> {selectedReport.status}</p>
              <p><span className="font-semibold">Priority:</span> {selectedReport.is_critical ? "CRITICAL" : "NORMAL"}</p>
              <p><span className="font-semibold">Created:</span> {format(new Date(selectedReport.created_at), 'MMM dd, HH:mm')}</p>
              <p><span className="font-semibold">Updated:</span> {format(new Date(selectedReport.updated_at), 'MMM dd, HH:mm')}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
