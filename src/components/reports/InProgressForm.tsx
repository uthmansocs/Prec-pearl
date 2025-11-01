import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Upload, Save } from 'lucide-react';
import { format } from 'date-fns';

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
  escalations: {
    ticket_id: string;
    site_a_id: string;
    site_b_id: string;
    provider: string;
  };
}

interface InProgressFormProps {
  report: Report;
  onUpdate: () => void;
}

export const InProgressForm: React.FC<InProgressFormProps> = ({ report, onUpdate }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [etr, setEtr] = useState(report.status_notes || '');
  const [images, setImages] = useState<File[]>([]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + images.length > 3) {
      toast({
        title: "Too many files",
        description: "Maximum 3 images allowed",
        variant: "destructive",
      });
      return;
    }
    setImages(prev => [...prev, ...files]);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!etr.trim()) {
      toast({
        title: "ETR Required",
        description: "Please provide an Estimated Time to Repair",
        variant: "destructive",
      });
      return;
    }

    if (images.length === 0) {
      toast({
        title: "Images Required",
        description: "Please upload at least 1 image (max 3)",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // TODO: Upload images to Supabase Storage when implemented
      // For now, we'll just save the text data
      
      const { error } = await supabase
        .from('reports')
        .update({
          status_notes: etr,
          updated_at: new Date().toISOString()
        })
        .eq('id', report.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Report updated successfully",
      });

      onUpdate();
      setEtr('');
      setImages([]);
    } catch (error) {
      console.error('Error updating report:', error);
      toast({
        title: "Error",
        description: "Failed to update report",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div>
            <div className="font-mono text-sm text-muted-foreground">
              {report.escalations.ticket_id}
            </div>
            <div className="text-lg">
              {report.escalations.site_a_id} ↔ {report.escalations.site_b_id}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="uppercase">
              {report.escalations.provider}
            </Badge>
            {report.is_critical && (
              <Badge variant="destructive">CRITICAL</Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Issue:</span>
            <p className="text-muted-foreground mt-1">{report.issue_description}</p>
          </div>
          <div>
            <span className="font-medium">Reported by:</span>
            <p className="text-muted-foreground mt-1">{report.reported_by}</p>
            <p className="text-muted-foreground">{report.contact_info}</p>
          </div>
          <div>
            <span className="font-medium">Created:</span>
            <p className="text-muted-foreground mt-1">
              {format(new Date(report.created_at), 'MMM dd, yyyy HH:mm')}
            </p>
          </div>
          <div>
            <span className="font-medium">Last Updated:</span>
            <p className="text-muted-foreground mt-1">
              {format(new Date(report.updated_at), 'MMM dd, yyyy HH:mm')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
          <div>
            <Label htmlFor="etr">Estimated Time to Repair (ETR) *</Label>
            <Textarea
              id="etr"
              value={etr}
              onChange={(e) => setEtr(e.target.value)}
              placeholder="Provide estimated repair time and current status..."
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label htmlFor="images">Update Images (1-3 required) *</Label>
            <div className="mt-1">
              <Input
                id="images"
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="mb-2"
              />
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((image, index) => (
                    <div key={index} className="relative">
                      <Badge variant="outline" className="pr-6">
                        {image.name}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Images: {images.length}/3 (at least 1 required)
              </p>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Update Report
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};