import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

interface Escalation {
  id: string;
  provider: string;
  site_a_id: string;
  site_b_id: string;
  link_id: string;
  ticket_id: string;
  mttr_hours: number;
  status: string;
  created_at: string;
}

export default function EditEscalation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [escalation, setEscalation] = useState<Escalation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    mttrHours: "",
    description: "",
  });

  // 🔹 Load escalation on mount
  useEffect(() => {
    if (profile?.role !== "fibre_network") {
      navigate("/");
      return;
    }

    if (id) {
      loadEscalation();
    }
  }, [id, profile, navigate]);

  const loadEscalation = async () => {
    try {
      const { data, error } = await supabase
        .from("escalations")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      setEscalation(data);
      setFormData({
        mttrHours: data.mttr_hours.toString(),
        description: "",
      });
    } catch (error) {
      console.error("Error loading escalation:", error);
      toast({
        title: "Error",
        description: "Failed to load escalation details",
        variant: "destructive",
      });
      navigate("/reports");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!escalation) return;

    if (!formData.mttrHours || parseFloat(formData.mttrHours) < 0.1) {
      toast({
        title: "Error",
        description: "MTTR must be at least 0.1 hours",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("escalations")
        .update({
          mttr_hours: parseFloat(formData.mttrHours),
          updated_at: new Date().toISOString(),
        })
        .eq("id", escalation.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Escalation updated successfully",
      });

      navigate("/reports");
    } catch (error) {
      console.error("Error updating escalation:", error);
      toast({
        title: "Error",
        description: "Failed to update escalation",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!escalation) {
    return (
      <div className="text-center py-8">
        <p>Escalation not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          onClick={() => navigate("/reports")}
          className="flex items-center"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Reports
        </Button>
        <h1 className="text-3xl font-bold">Edit Escalation</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Escalation Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 🔹 Read-only escalation details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">
                Ticket ID
              </Label>
              <p className="font-mono">{escalation.ticket_id}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">
                Link
              </Label>
              <p className="font-mono">
                {escalation.site_a_id}-{escalation.site_b_id}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">
                Provider
              </Label>
              <p className="uppercase">{escalation.provider}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">
                Status
              </Label>
              <p className="capitalize">{escalation.status.replace("_", " ")}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">
                Site A
              </Label>
              <p>{escalation.site_a_id}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">
                Site B
              </Label>
              <p>{escalation.site_b_id}</p>
            </div>
          </div>

          {/* 🔹 Editable form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="mttr">MTTR (Hours) *</Label>
              <Input
                id="mttr"
                type="number"
                step="0.1"
                min="0.1"
                placeholder="e.g., 2.5"
                value={formData.mttrHours}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    mttrHours: e.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Update Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Add any additional notes about this escalation..."
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows={3}
              />
            </div>

            <div className="flex space-x-4">
              <Button type="submit" disabled={saving}>
                {saving ? "Updating..." : "Update Escalation"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/reports")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
