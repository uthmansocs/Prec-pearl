import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { InProgressForm } from '@/components/reports/InProgressForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Report {
  id: string;
  escalation_id: string;
  issue_description: string;
  reported_by: string;
  contact_info: string;
  is_critical: boolean;
  status: string;
  status_notes?: string;
  created_at: string;
  updated_at: string;
  resolution_photos?: string[]; // Added for storing uploaded image URLs
  escalations: {
    ticket_id: string;
    site_a_id: string;
    site_b_id: string;
    provider: string;
    mttr_hours?: number;
    created_at?: string;
  };
}

export default function InProgressReports() {
  const { toast } = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

  /** ==============================
   * FETCH IN-PROGRESS REPORTS
   * ============================== */
  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          escalations(ticket_id, site_a_id, site_b_id, provider, mttr_hours, created_at)
        `)
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        data.forEach((report: any) => {
          const escalation = report.escalations;
          if (escalation?.mttr_hours && escalation?.created_at) {
            const etrExpiry = new Date(escalation.created_at);
            etrExpiry.setHours(
              etrExpiry.getHours() + parseFloat(escalation.mttr_hours)
            );

            if (new Date() > etrExpiry) {
              toast({
                title: '⚠️ ETR Exhausted',
                description: `Link ${escalation.site_a_id} - ${escalation.site_b_id} (Ticket: ${escalation.ticket_id}) has exceeded its MTTR.`,
                variant: 'destructive',
              });
            }
          }
        });
      }

      setReports(data || []);
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch in-progress reports',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  /** ==============================
   * UPLOAD IMAGE TO SUPABASE
   * ============================== */
  const uploadImageToSupabase = async (file: File, reportId: string) => {
    const filePath = `in_progress/${reportId}/${Date.now()}_${file.name}`;
    console.log('📤 Uploading:', file.name, '→', filePath);

    const { data, error } = await supabase.storage
      .from('report_uploads')
      .upload(filePath, file);

    if (error) {
      console.error('❌ Upload error:', error.message);
      throw error;
    }

    console.log('✅ Upload success:', data);

    const { data: publicUrlData } = supabase.storage
      .from('report_uploads')
      .getPublicUrl(filePath);

    console.log('🌐 Public URL:', publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  };

  /** ==============================
   * HANDLE IMAGE UPLOAD + UPDATE
   * ============================== */
  const handleUpdateReport = async (report: Report) => {
    if (!selectedReport || selectedImages.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select images to upload first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUploading(true);
      const uploadedUrls: string[] = [];

      for (const file of selectedImages) {
        const url = await uploadImageToSupabase(file, report.id);
        uploadedUrls.push(url);
      }

      const { error } = await supabase
        .from('reports')
        .update({
          resolution_photos: uploadedUrls,
          updated_at: new Date().toISOString(),
        })
        .eq('id', report.id);

      if (error) throw error;

      toast({
        title: '✅ Success',
        description: 'Images uploaded successfully and report updated!',
      });

      setSelectedImages([]);
      setSelectedReport(null);
      fetchReports();
    } catch (error: any) {
      console.error('❌ Update error:', error.message);
      toast({
        title: 'Error',
        description: error.message || 'Upload failed.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  /** ==============================
   * SUBSCRIBE TO REAL-TIME UPDATES
   * ============================== */
  useEffect(() => {
    fetchReports();

    const channel = supabase
      .channel('in-progress-reports-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reports', filter: 'status=eq.in_progress' },
        () => fetchReports()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /** ==============================
   * CHECK IF ETR EXHAUSTED
   * ============================== */
  const checkETRExhausted = (report: Report) => {
    const escalation = report.escalations;
    if (escalation?.mttr_hours && escalation?.created_at) {
      const etrExpiry = new Date(escalation.created_at);
      etrExpiry.setHours(etrExpiry.getHours() + escalation.mttr_hours);
      return new Date() > etrExpiry;
    }
    return false;
  };

  /** ==============================
   * RENDER UI
   * ============================== */
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
        <h1 className="text-3xl font-bold">In Progress Reports</h1>
        <Badge variant="outline">{reports.length} reports</Badge>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">
              No reports currently in progress.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {reports.map((report) => (
            <Card key={report.id} className="border-l-4 border-l-yellow-500">
              <CardHeader>
                <CardTitle>{report.escalations.ticket_id}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>{report.issue_description}</p>

                {checkETRExhausted(report) && (
                  <Badge variant="destructive">ETR Exhausted</Badge>
                )}

                <div className="space-y-2">
                  <Label htmlFor="images">Upload Images (Max 3)</Label>
                  <Input
                    id="images"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) =>
                      setSelectedImages(Array.from(e.target.files || []))
                    }
                  />
                </div>

                {selectedImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {selectedImages.map((file, i) => (
                      <p key={i} className="text-xs truncate">
                        📎 {file.name}
                      </p>
                    ))}
                  </div>
                )}

                {report.resolution_photos && report.resolution_photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    {report.resolution_photos.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Uploaded-${i}`}
                        className="rounded-md border object-cover w-full h-32"
                      />
                    ))}
                  </div>
                )}

                <Button
                  disabled={uploading}
                  onClick={() => handleUpdateReport(report)}
                  className="w-full mt-3"
                >
                  {uploading ? 'Uploading...' : 'Upload & Update Report'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
