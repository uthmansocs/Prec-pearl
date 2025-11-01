import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { CheckCircle, Clock, MapPin, AlertTriangle } from 'lucide-react';
import { Database } from '@/types/database';

type EscalationShape = Database['public']['Tables']['escalations']['Row'];
type NotificationLogShape = Database['public']['Tables']['notification_log']['Row'];

interface ReportWithEscalation {
  id: string;
  escalation_id: string;
  issue_description: string;
  reported_by?: string;
  contact_info?: string;
  is_critical: boolean;
  status: string;
  status_notes?: string | null;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;
  escalation?: EscalationShape | null;
}

export default function ResolvedPage() {
  const [reports, setReports] = useState<ReportWithEscalation[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportWithEscalation | null>(null);
  const [resolutionData, setResolutionData] = useState({
    resolution_notes: '',
    cof: '',
    pof: '',
    selectedImages: [] as File[],
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // === Fetch reports ready for resolution ===
  useEffect(() => {
    fetchReportsReadyForResolution();
  }, []);

  const fetchReportsReadyForResolution = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          escalation:escalations (
            id,
            ticket_id,
            provider,
            site_a_id,
            site_b_id,
            link_id,
            mttr_hours,
            cof,
            pof,
            created_by
          )
        `)
        .eq('status', 'in_progress')
        .not('status_notes', 'is', null)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const sanitized: ReportWithEscalation[] = (data || []).map((r: any) => ({
        id: r.id,
        escalation_id: r.escalation_id,
        issue_description: r.issue_description,
        reported_by: r.reported_by ?? r.created_by,
        contact_info: r.contact_info ?? '',
        is_critical: !!r.is_critical,
        status: r.status,
        status_notes: r.status_notes ?? null,
        resolution_notes: r.resolution_notes ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        escalation: Array.isArray(r.escalation) ? r.escalation[0] : r.escalation ?? null,
      }));

      setReports(sanitized);
    } catch (err) {
      console.error('Fetch error:', err);
      toast({ title: 'Error', description: 'Failed to fetch reports', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // === Handle image upload selection ===
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 3) {
      toast({ title: 'Error', description: 'Maximum 3 images allowed', variant: 'destructive' });
      return;
    }
    setResolutionData(prev => ({ ...prev, selectedImages: files }));
  };

  const removeImage = (index: number) => {
    setResolutionData(prev => ({
      ...prev,
      selectedImages: prev.selectedImages.filter((_, i) => i !== index),
    }));
  };

  // === Upload to Supabase Storage ===
  const uploadImagesToSupabase = async (files: File[], linkId: string) => {
    const uploadedUrls: string[] = [];

    for (const file of files) {
      const filePath = `report_upload/resolved/${linkId}/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('report_uploads')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error('Image upload error:', uploadError);
        throw uploadError;
      }

      const { data: publicData } = supabase.storage
        .from('report_uploads')
        .getPublicUrl(filePath);

      if (publicData?.publicUrl) uploadedUrls.push(publicData.publicUrl);
    }

    return uploadedUrls;
  };

  // === Handle resolve action ===
  const handleResolveReport = async (report: ReportWithEscalation) => {
    if (!resolutionData.resolution_notes.trim() || !resolutionData.cof.trim() || !resolutionData.pof.trim()) {
      toast({ title: 'Error', description: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    if (resolutionData.selectedImages.length === 0) {
      toast({ title: 'Error', description: 'Please upload at least one image', variant: 'destructive' });
      return;
    }

    try {
      setSubmitting(true);

      const linkId = report.escalation?.link_id || report.id;
      const uploadedImageUrls = await uploadImagesToSupabase(resolutionData.selectedImages, linkId);

      // Update report
      const { error: reportError } = await supabase
        .from('reports')
        .update({
          status: 'resolved',
          resolution_notes: resolutionData.resolution_notes,
          resolution_photos: uploadedImageUrls,
          updated_at: new Date().toISOString(),
        })
        .eq('id', report.id);
      if (reportError) throw reportError;

      // Update escalation
      const { error: escalationError } = await supabase
        .from('escalations')
        .update({
          status: 'resolved',
          cof: resolutionData.cof,
          pof: resolutionData.pof,
          updated_at: new Date().toISOString(),
        })
        .eq('id', report.escalation_id);
      if (escalationError) throw escalationError;

      // Log notification
      const notification: Partial<NotificationLogShape> = {
        escalation_id: report.escalation_id,
        ticket_id: report.escalation?.ticket_id ?? null,
        provider: report.escalation?.provider ?? null,
        site_a_id: report.escalation?.site_a_id ?? null,
        site_b_id: report.escalation?.site_b_id ?? null,
        link_id: report.escalation?.link_id ?? null,
        mttr_hours: report.escalation?.mttr_hours ?? null,
        cof: resolutionData.cof,
        pof: resolutionData.pof,
        resolution_notes: resolutionData.resolution_notes,
        resolution_photos: uploadedImageUrls,
        resolved_at: new Date().toISOString(),
        recipient_id: report.escalation?.created_by ?? null,
        message: `Ticket ${report.escalation?.ticket_id ?? report.escalation_id} resolved — COF: ${resolutionData.cof}, POF: ${resolutionData.pof}`,
        is_read: false,
        created_at: new Date().toISOString(),
      };

      const { error: notificationError } = await supabase
        .from('notification_log')
        .insert([notification]);
      if (notificationError) throw notificationError;

      toast({ title: 'Success', description: 'Report resolved successfully!' });
      setResolutionData({ resolution_notes: '', cof: '', pof: '', selectedImages: [] });
      setSelectedReport(null);
      await fetchReportsReadyForResolution();
    } catch (err: any) {
      console.error('Resolve error:', err);
      toast({
        title: 'Error',
        description: `Failed to resolve report: ${err.message || JSON.stringify(err)}`,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // === UI ===
  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary" />
      </div>
    );

  if (!reports.length)
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-bold">Ready for Resolution</h1>
        <Card>
          <CardContent className="p-8 text-center">
            <h3 className="text-lg font-medium mb-2">No Reports Ready</h3>
            <p className="text-muted-foreground">
              Reports appear here once ETR has been provided.
            </p>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Ready for Resolution</h1>
        <Badge variant="secondary">{reports.length} Ready</Badge>
      </div>

      <div className="grid gap-6">
        {reports.map(report => (
          <Card key={report.id} className="border-l-4 border-l-green-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  {report.escalation?.ticket_id ?? '—'}
                  {report.is_critical && (
                    <Badge variant="destructive" className="ml-2">
                      Critical
                    </Badge>
                  )}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {(report.escalation?.provider ?? '—').toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Created:{' '}
                  {format(new Date(report.created_at), 'PPp')}
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> MTTR:{' '}
                  {report.escalation?.mttr_hours ?? '—'}h
                </div>
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Updated:{' '}
                  {format(new Date(report.updated_at), 'PPp')}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium">Issue Description</h4>
                <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
                  {report.issue_description}
                </p>
              </div>

              {selectedReport?.id === report.id ? (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-medium">Complete Resolution</h4>
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="resolution_notes">Action Taken *</Label>
                      <Textarea
                        id="resolution_notes"
                        placeholder="Describe actions taken..."
                        value={resolutionData.resolution_notes}
                        onChange={e =>
                          setResolutionData(prev => ({
                            ...prev,
                            resolution_notes: e.target.value,
                          }))
                        }
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label htmlFor="cof">Cause of Failure (COF) *</Label>
                      <Input
                        id="cof"
                        placeholder="Fibre Cut"
                        value={resolutionData.cof}
                        onChange={e =>
                          setResolutionData(prev => ({
                            ...prev,
                            cof: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor="pof">Point of Failure (POF) *</Label>
                      <Input
                        id="pof"
                        placeholder="Between Site A & B"
                        value={resolutionData.pof}
                        onChange={e =>
                          setResolutionData(prev => ({
                            ...prev,
                            pof: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor="resolution_images">
                        Resolution Images (Max 3) *
                      </Label>
                      <Input
                        id="resolution_images"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageUpload}
                      />
                      {resolutionData.selectedImages.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {resolutionData.selectedImages.map((file, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded"
                            >
                              <span>{file.name}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeImage(i)}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() => handleResolveReport(report)}
                        disabled={submitting}
                      >
                        {submitting ? 'Resolving...' : 'Mark as Resolved'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedReport(null)}
                        disabled={submitting}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => setSelectedReport(report)}
                  className="w-full"
                >
                  <CheckCircle className="h-4 w-4 mr-2" /> Complete Resolution
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
