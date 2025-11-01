import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Report {
  id: string;
  escalation_id: string;
  issue_description: string;
  reported_by: string;
  contact_info: string;
  is_critical: boolean;
  status: string;
  status_notes?: string;
  resolution_notes?: string;
  resolution_photos?: string[]; // array of public URLs
  created_at: string;
  updated_at: string;
  escalations: {
    ticket_id: string;
    site_a_id: string;
    site_b_id: string;
    provider: string;
    link_id: string;
  };
}

export default function ResolvedReports() {
  const { toast } = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  // ==========================
  // FETCH RESOLVED REPORTS
  // ==========================
  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          escalations(ticket_id, site_a_id, site_b_id, provider, link_id)
        `)
        .eq('status', 'resolved')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // ✅ Build public URLs for each image
      const enrichedReports = await Promise.all(
        (data || []).map(async (report: any) => {
          const linkId = report.escalations?.link_id;
          if (!linkId) return report;

          // get all image files from the folder of this link_id
          const { data: files } = await supabase.storage
            .from('report_uploads')
            .list(`resolved/${linkId}`);

          if (files && files.length > 0) {
            const urls = files.map((file) =>
              supabase.storage
                .from('report_uploads')
                .getPublicUrl(`resolved/${linkId}/${file.name}`).data.publicUrl
            );
            report.resolution_photos = urls;
          } else {
            report.resolution_photos = [];
          }
          return report;
        })
      );

      setReports(enrichedReports);
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch resolved reports',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // ==========================
  // REALTIME UPDATES
  // ==========================
  useEffect(() => {
    fetchReports();

    const channel = supabase
      .channel('resolved-reports-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reports',
          filter: 'status=eq.resolved',
        },
        () => fetchReports()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ==========================
  // LOADING STATE
  // ==========================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // ==========================
  // RENDER REPORTS
  // ==========================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Resolved Reports</h1>
        <Badge variant="outline">{reports.length} reports</Badge>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">No resolved reports found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {reports.map((report) => (
            <Card key={report.id} className="shadow-sm border">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>🎫 Ticket: {report.escalations.ticket_id}</span>
                  <Badge
                    variant={report.is_critical ? 'destructive' : 'outline'}
                  >
                    {report.is_critical ? 'Critical' : 'Normal'}
                  </Badge>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-2 text-sm">
                <p>
                  <strong>Issue:</strong> {report.issue_description}
                </p>
                <p>
                  <strong>Reported By:</strong> {report.reported_by} (
                  {report.contact_info})
                </p>
                <p>
                  <strong>Provider:</strong> {report.escalations.provider}
                </p>
                <p>
                  <strong>Sites:</strong> {report.escalations.site_a_id} ⇄{' '}
                  {report.escalations.site_b_id}
                </p>
                <p>
                  <strong>Link ID:</strong> {report.escalations.link_id}
                </p>
                <p>
                  <strong>Status:</strong> {report.status}
                </p>

                {/* Notes */}
                {report.status_notes && (
                  <p>
                    <strong>Status Notes:</strong> {report.status_notes}
                  </p>
                )}
                {report.resolution_notes && (
                  <p>
                    <strong>Resolution Notes:</strong>{' '}
                    {report.resolution_notes}
                  </p>
                )}

                {/* Resolution Photos */}
                {report.resolution_photos &&
                report.resolution_photos.length > 0 ? (
                  <div className="mt-4">
                    <p className="font-semibold mb-2">📸 Resolution Photos:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {report.resolution_photos.map((url, index) => (
                        <a
                          key={index}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={url}
                            alt={`Resolution photo ${index + 1}`}
                            className="rounded-lg border w-full h-32 object-cover hover:opacity-80 transition"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-2 italic">
                    No resolution photos uploaded for this link.
                  </p>
                )}

                {/* Timestamps */}
                <p className="text-xs text-muted-foreground mt-3">
                  Resolved at:{' '}
                  {new Date(report.updated_at).toLocaleString('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
