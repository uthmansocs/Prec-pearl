import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Edit3, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface DraftReport {
  id: string;
  escalation_id: string;
  issue_description: string;
  reported_by: string;
  is_critical: boolean;
  created_at: string;
  updated_at: string;
  escalations: {
    ticket_id: string;
    site_a_id: string;
    site_b_id: string;
    provider: string;
  };
}

export default function Drafts() {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<DraftReport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDrafts = async () => {
    try {
      // Note: Adding draft column to reports table would be ideal
      // For now, we'll simulate by checking for incomplete reports
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          escalations(ticket_id, site_a_id, site_b_id, provider)
        `)
        .is('status_notes', null)
        .eq('status', 'in_progress')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setDrafts(data || []);
    } catch (error) {
      console.error('Error fetching drafts:', error);
      toast({
        title: "Error",
        description: "Failed to fetch draft reports",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrafts();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('drafts-updates')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'reports' }, 
        () => fetchDrafts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleResume = (draftId: string) => {
    // Navigate to edit form or open modal
    window.open(`/reports/in-progress?focus=${draftId}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Draft Reports</h1>
        <Badge variant="outline">{drafts.length} drafts</Badge>
      </div>

      {drafts.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">No draft reports found.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Draft reports are incomplete reports that need additional information.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Incomplete Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket ID</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((draft) => (
                  <TableRow key={draft.id}>
                    <TableCell className="font-mono text-sm">
                      {draft.escalations.ticket_id}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {draft.escalations.site_a_id} ↔ {draft.escalations.site_b_id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase">
                        {draft.escalations.provider}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs">
                        <p className="text-sm truncate">{draft.issue_description}</p>
                        <p className="text-xs text-muted-foreground">
                          By: {draft.reported_by}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={draft.is_critical ? 'destructive' : 'outline'}>
                        {draft.is_critical ? 'CRITICAL' : 'NORMAL'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>{format(new Date(draft.updated_at), 'MMM dd, HH:mm')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResume(draft.id)}
                      >
                        <Edit3 className="h-3 w-3 mr-1" />
                        Resume
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}