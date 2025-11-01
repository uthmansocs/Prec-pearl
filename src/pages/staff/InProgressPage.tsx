// InProgressPage.tsx
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Clock, MapPin, Upload } from 'lucide-react';

interface ReportWithEscalation {
  id: string;
  escalation_id: string;
  issue_description: string;
  reported_by: string;
  contact_info: string;
  is_critical: boolean;
  status: string;
  status_notes?: string;
  created_at: string;
  escalation: {
    ticket_id: string;
    provider: string;
    site_a_id: string;
    site_b_id: string;
    link_id: string;
    mttr_hours: number;
  };
}

const MAX_IMAGES = 3;
const BUCKET = 'report_uploads';

export default function InProgressPage() {
  const [reports, setReports] = useState<ReportWithEscalation[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportWithEscalation | null>(null);
  const [updateData, setUpdateData] = useState<{ status_notes: string; selectedImages: File[] }>({
    status_notes: '',
    selectedImages: [],
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // Fetch reports
  useEffect(() => {
    fetchInProgressReports();
  }, []);

  const fetchInProgressReports = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          escalation:escalations(
            ticket_id,
            provider,
            site_a_id,
            site_b_id,
            link_id,
            mttr_hours
          )
        `)
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (err: any) {
      console.error('Error fetching reports:', err);
      toast({
        title: 'Error',
        description: 'Failed to fetch in-progress reports.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle image upload selection
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + updateData.selectedImages.length > MAX_IMAGES) {
      toast({
        title: 'Error',
        description: `Maximum ${MAX_IMAGES} images allowed.`,
        variant: 'destructive',
      });
      return;
    }
    setUpdateData(prev => ({ ...prev, selectedImages: [...prev.selectedImages, ...files] }));
  };

  const removeImage = (index: number) => {
    setUpdateData(prev => ({
      ...prev,
      selectedImages: prev.selectedImages.filter((_, i) => i !== index),
    }));
  };

  // Generate safe file path using link_id
  const makeSafeFilePath = (file: File, linkId: string) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    return `in_progress/${linkId}/${timestamp}_${safeName}`;
  };

  const uploadImageToSupabase = async (file: File, linkId: string) => {
    const path = makeSafeFilePath(file, linkId);
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (error) throw error;

    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return publicData.publicUrl;
  };

  const handleUpdateReport = async (report: ReportWithEscalation) => {
    if (!updateData.status_notes.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide status notes.',
        variant: 'destructive',
      });
      return;
    }

    if (updateData.selectedImages.length === 0) {
      toast({
        title: 'Error',
        description: 'Please upload at least one image.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);

      const linkId = report.escalation?.link_id;
      if (!linkId) {
        throw new Error('Link ID not found in escalation.');
      }

      const uploadedUrls: string[] = [];
      for (const file of updateData.selectedImages) {
        const url = await uploadImageToSupabase(file, linkId);
        uploadedUrls.push(url);
      }

      const { error } = await supabase
        .from('reports')
        .update({
          status_notes: updateData.status_notes,
          resolution_photos: uploadedUrls,
          updated_at: new Date().toISOString(),
        })
        .eq('id', report.id);

      if (error) throw error;

      toast({
        title: '✅ Success',
        description: 'Report updated successfully with link-based image storage.',
      });

      setUpdateData({ status_notes: '', selectedImages: [] });
      setSelectedReport(null);
      await fetchInProgressReports();
    } catch (err: any) {
      console.error('Error updating report:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to update report.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Rendering
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary" />
      </div>
    );
  }

  if (!reports.length) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-bold text-foreground">In Progress Reports</h1>
        <Card>
          <CardContent className="p-8 text-center">
            <h3 className="text-lg font-medium mb-2">No Reports In Progress</h3>
            <p className="text-muted-foreground">
              Reports will appear here after being created or updated.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">In Progress Reports</h1>
        <Badge variant="secondary">{reports.length} Active</Badge>
      </div>

      <div className="grid gap-6">
        {reports.map(report => (
          <Card key={report.id} className="border-l-4 border-l-yellow-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  {report.escalation.ticket_id}
                  {report.is_critical && <Badge variant="destructive" className="ml-2">Critical</Badge>}
                </CardTitle>
                <Badge variant="outline" className="text-xs">{report.escalation.provider.toUpperCase()}</Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1"><Clock className="h-4 w-4" /> Created: {format(new Date(report.created_at), 'PPp')}</div>
                <div className="flex items-center gap-1"><MapPin className="h-4 w-4" /> MTTR: {report.escalation.mttr_hours}h</div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium">Issue Description</h4>
                <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">{report.issue_description}</p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium text-sm mb-2">Link Details</h4>
                <p className="text-sm text-muted-foreground">{report.escalation.site_a_id} ↔ {report.escalation.site_b_id} <span className="ml-2 font-mono">{report.escalation.link_id}</span></p>
              </div>

              {selectedReport?.id === report.id ? (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-medium">Update Report (ETR)</h4>

                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="etr">Status Notes *</Label>
                      <Textarea
                        id="etr"
                        rows={3}
                        placeholder="Provide ETR details..."
                        value={updateData.status_notes}
                        onChange={e => setUpdateData(prev => ({ ...prev, status_notes: e.target.value }))}
                      />
                    </div>

                    <div>
                      <Label htmlFor="images">Upload Images (Max 3) *</Label>
                      <Input id="images" type="file" accept="image/*" multiple onChange={handleImageUpload} />
                      {updateData.selectedImages.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {updateData.selectedImages.map((file, i) => (
                            <div key={i} className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded">
                              <span>{file.name}</span>
                              <Button variant="ghost" size="sm" onClick={() => removeImage(i)}>Remove</Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={() => handleUpdateReport(report)} disabled={submitting} className="flex-1">
                        {submitting ? 'Updating...' : 'Update Report'}
                      </Button>
                      <Button variant="outline" onClick={() => setSelectedReport(null)} disabled={submitting}>Cancel</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Button onClick={() => setSelectedReport(report)} className="w-full" variant="secondary">
                  <Upload className="h-4 w-4 mr-2" /> Update with ETR
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
