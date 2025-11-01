// CreateReportPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { Clock, MapPin, AlertTriangle } from "lucide-react";

type ProviderType = "airtel" | "mtn" | "glo";
type EscalationStatus = "pending" | "in_progress" | "resolved" | "closed";

interface EscalationRow {
  id: string;
  provider: ProviderType;
  site_a_id: string;
  site_b_id: string;
  link_id: string;
  ticket_id: string;
  mttr_hours?: number | null;
  status: EscalationStatus;
  has_report?: boolean;
  created_at?: string | null;
}

const BUCKET = "report_uploads";
const ROOT_FOLDER = "report_upload/reports";
const MAX_IMAGES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function CreateReportPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [escalations, setEscalations] = useState<EscalationRow[]>([]);
  const [selectedEscalation, setSelectedEscalation] = useState<EscalationRow | null>(null);
  const [formData, setFormData] = useState({
    issue_description: "",
    reported_by: "",
    contact_info: "",
    is_critical: false,
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Fetch pending escalations
  const fetchEscalations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("escalations")
        .select("*")
        .eq("has_report", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEscalations(data || []);
    } catch (err: any) {
      console.error("Error fetching escalations:", err);
      toast({
        title: "Error",
        description: "Failed to fetch escalations.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscalations();
    return () => previews.forEach((p) => URL.revokeObjectURL(p));
  }, []);

  // Handle file input
  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + selectedFiles.length > MAX_IMAGES) {
      toast({
        title: "Too many files",
        description: `Maximum ${MAX_IMAGES} images allowed.`,
        variant: "destructive",
      });
      return;
    }

    const validFiles: File[] = [];
    const newPreviews: string[] = [];

    files.forEach((file) => {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file",
          description: `${file.name} is not an image.`,
          variant: "destructive",
        });
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 5MB.`,
          variant: "destructive",
        });
        return;
      }
      validFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    });

    setSelectedFiles((prev) => [...prev, ...validFiles]);
    setPreviews((prev) => [...prev, ...newPreviews]);
    e.currentTarget.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Upload a single file into report_upload/reports/{link_id}/
  const uploadSingleFile = async (file: File, linkId: string): Promise<string> => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniquePath = `${ROOT_FOLDER}/${linkId}/${Date.now()}_${safeName}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(uniquePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type ?? undefined,
      });

    if (error) throw new Error(error.message);

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uniquePath);
    return urlData.publicUrl;
  };

  const uploadAllFiles = async (files: File[], linkId: string) => {
    const results = await Promise.allSettled(
      files.map((file) => uploadSingleFile(file, linkId))
    );

    const successes = results
      .filter((r) => r.status === "fulfilled")
      .map((r: any) => r.value);

    const failures = results
      .filter((r) => r.status === "rejected")
      .map((r: any) => r.reason);

    return { successes, failures };
  };

  // Submit report
  const handleSubmitReport = async (esc: EscalationRow) => {
    if (
      !formData.issue_description.trim() ||
      !formData.reported_by.trim() ||
      !formData.contact_info.trim()
    ) {
      toast({
        title: "Missing info",
        description: "Please fill required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);

      let uploadedUrls: string[] = [];
      if (selectedFiles.length > 0) {
        const { successes, failures } = await uploadAllFiles(selectedFiles, esc.link_id);
        if (failures.length > 0) {
          toast({
            title: "Partial upload",
            description: `${failures.length} image(s) failed.`,
            variant: "destructive",
          });
        }
        uploadedUrls = successes;
      }

      const payload = {
        escalation_id: esc.id,
        issue_description: formData.issue_description,
        reported_by: formData.reported_by,
        contact_info: formData.contact_info,
        is_critical: formData.is_critical,
        resolution_photos: uploadedUrls.length ? uploadedUrls : null,
        image_url: uploadedUrls.length ? uploadedUrls[0] : null,
        status: "in_progress",
        created_by: profile?.id ?? null,
      };

      const { data: createdReport, error: reportError } = await supabase
        .from("reports")
        .insert(payload)
        .select()
        .single();

      if (reportError) throw reportError;

      await supabase
        .from("escalations")
        .update({ has_report: true, status: "in_progress" })
        .eq("id", esc.id);

      setEscalations((prev) => prev.filter((e) => e.id !== esc.id));

      toast({ title: "Success", description: "Report created successfully." });

      setFormData({
        issue_description: "",
        reported_by: "",
        contact_info: "",
        is_critical: false,
      });
      previews.forEach((p) => URL.revokeObjectURL(p));
      setPreviews([]);
      setSelectedFiles([]);
      setSelectedEscalation(null);
    } catch (err: any) {
      console.error("Error creating report:", err);
      toast({
        title: "Error",
        description: err?.message ?? "Failed to create report",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Render
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-primary" />
      </div>
    );
  }

  if (escalations.length === 0) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <h3 className="text-lg font-semibold mb-2">
              No Escalations Pending Reports
            </h3>
            <p className="text-muted-foreground">
              All current escalations already have reports assigned.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Create Report</h1>
        <Badge variant="secondary">{escalations.length} Pending</Badge>
      </div>

      <div className="grid gap-6">
        {escalations.map((esc) => (
          <Card key={esc.id} className="border-l-4 border-l-primary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  {esc.ticket_id}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {esc.provider.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />{" "}
                  {format(new Date(esc.created_at || Date.now()), "PPp")}
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> MTTR: {esc.mttr_hours ?? "N/A"}h
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium">Site A: {esc.site_a_id}</h4>
                </div>
                <div>
                  <h4 className="font-medium">Site B: {esc.site_b_id}</h4>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium">Link ID: {esc.link_id}</p>
              </div>

              {selectedEscalation?.id === esc.id ? (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-medium">Create Report</h4>

                  <div className="grid gap-4">
                    <div>
                      <Label>Issue Description *</Label>
                      <Textarea
                        value={formData.issue_description}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            issue_description: e.target.value,
                          }))
                        }
                        rows={4}
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label>Reported By *</Label>
                        <Input
                          value={formData.reported_by}
                          onChange={(e) =>
                            setFormData((p) => ({
                              ...p,
                              reported_by: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Contact Info *</Label>
                        <Input
                          value={formData.contact_info}
                          onChange={(e) =>
                            setFormData((p) => ({
                              ...p,
                              contact_info: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Attach Images (optional, max {MAX_IMAGES})</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFilesChange}
                      />
                      {previews.length > 0 && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {previews.map((src, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 bg-muted/50 p-2 rounded"
                            >
                              <img
                                src={src}
                                alt={`preview-${i}`}
                                className="h-20 object-cover rounded"
                              />
                              <div className="flex-1 text-sm truncate">
                                <div>{selectedFiles[i]?.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {Math.round(
                                    (selectedFiles[i]?.size ?? 0) / 1024
                                  )}{" "}
                                  KB
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFile(i)}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={formData.is_critical}
                        onCheckedChange={(checked) =>
                          setFormData((p) => ({
                            ...p,
                            is_critical: checked,
                          }))
                        }
                      />
                      <Label>Mark as Critical</Label>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSubmitReport(esc)}
                        disabled={submitting}
                        className="flex-1"
                      >
                        {submitting ? "Creating..." : "Create Report"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedEscalation(null);
                          setFormData({
                            issue_description: "",
                            reported_by: "",
                            contact_info: "",
                            is_critical: false,
                          });
                          setSelectedFiles([]);
                          setPreviews([]);
                        }}
                        disabled={submitting}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => setSelectedEscalation(esc)}
                  className="w-full"
                >
                  Create Report for this Escalation
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
