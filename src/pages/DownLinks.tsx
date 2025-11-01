// DownLinks.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Search, Filter, Trash2, Eye, Download, Clock, CheckCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { EscalationStatus } from "@/types/database";

interface ReportRow {
  id: string;
  escalation_id?: string;
  issue_description?: string | null;
  reported_by?: string | null;
  contact_info?: string | null;
  is_critical?: boolean | null;
  status?: EscalationStatus | null;
  status_notes?: string | null;
  resolution_notes?: string | null;
  resolution_photos?: string[] | null;
  image_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface EscalationWithReport {
  id: string;
  provider: string;
  site_a_id: string;
  site_b_id: string;
  link_id: string;
  ticket_id: string;
  mttr_hours: number;
  created_at: string;
  updated_at: string;
  reports?: ReportRow[];
}

type ImageGroups = { "In Progress": string[]; Reports: string[]; Resolved: string[] };

export default function DownLinks() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [data, setData] = useState<EscalationWithReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const [viewEscalation, setViewEscalation] = useState<EscalationWithReport | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [reportImages, setReportImages] = useState<ImageGroups>({ "In Progress": [], Reports: [], Resolved: [] });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // load escalations (with reports)
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: escalations, error } = await supabase
        .from("escalations")
        .select("*, reports(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setData((escalations as EscalationWithReport[]) || []);
    } catch (err) {
      console.error("Fetch escalations error", err);
      toast({ title: "Error", description: "Failed to load escalations", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // build public URLs for files in report_uploads/{path}
  const listPublicUrls = async (path: string) => {
    try {
      // list path inside single bucket "report_uploads"
      const { data: files, error } = await supabase.storage.from("report_uploads").list(path, { limit: 200 });
      if (error) {
        // when path empty Supabase might return an error — handle gracefully
        console.debug("Storage list error for", path, error?.message ?? error);
        return [];
      }
      if (!files || files.length === 0) return [];

      return files
        .filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f.name))
        .map((f) => {
          const { data } = supabase.storage.from("report_uploads").getPublicUrl(`${path}/${f.name}`);
          return data.publicUrl;
        });
    } catch (err) {
      console.error("listPublicUrls error", err);
      return [];
    }
  };

  // fetch images grouped by your folder naming convention
  const fetchAllImagesByLinkId = async (link_id: string): Promise<ImageGroups> => {
    const cleaned = (link_id || "").trim();
    if (!cleaned) return { "In Progress": [], Reports: [], Resolved: [] };

    // your bucket = "report_uploads"
    // folders inside:
    // in_progress/{link_id}
    // report_upload/reports/{link_id}
    // report_upload/resolved/{link_id}
    const inProgressPath = `in_progress/${cleaned}`;
    const reportsPath = `report_upload/reports/${cleaned}`;
    const resolvedPath = `report_upload/resolved/${cleaned}`;

    const [inProgressUrls, reportsUrls, resolvedUrls] = await Promise.all([
      listPublicUrls(inProgressPath),
      listPublicUrls(reportsPath),
      listPublicUrls(resolvedPath),
    ]);

    return { "In Progress": inProgressUrls, Reports: reportsUrls, Resolved: resolvedUrls };
  };

  // handle view click — fetch images and open modal
  const handleView = async (esc: EscalationWithReport) => {
    setViewEscalation(esc);
    setViewModalOpen(true);

    // optimistic clear while loading
    setReportImages({ "In Progress": [], Reports: [], Resolved: [] });
    try {
      const groups = await fetchAllImagesByLinkId(esc.link_id);
      setReportImages(groups);
    } catch (err) {
      console.error("Error loading images", err);
      toast({ title: "Error", description: "Failed to load images for this link", variant: "destructive" });
    }
  };

  // delete escalation (and its reports records)
  const canDelete = profile?.role === "admin" || profile?.role === "fibre_network";
  const handleDelete = async (id: string) => {
    try {
      await supabase.from("reports").delete().eq("escalation_id", id);
      await supabase.from("escalations").delete().eq("id", id);
      toast({ title: "Deleted", description: "Escalation removed" });
      fetchData();
    } catch (err) {
      console.error("Delete error", err);
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const getLinkStatus = (reports?: ReportRow[]): EscalationStatus => {
    if (!reports || reports.length === 0) return "pending";
    if (reports.every((r) => r.status === "closed")) return "closed";
    if (reports.some((r) => r.status === "in_progress")) return "in_progress";
    if (reports.some((r) => r.status === "resolved")) return "resolved";
    return "pending";
  };

  const getStatusBadge = (status: EscalationStatus) => {
    const variants = {
      pending: "destructive",
      in_progress: "default",
      resolved: "secondary",
      closed: "outline",
    } as const;
    return <Badge variant={variants[status]}>{status.toUpperCase()}</Badge>;
  };

  // initial load + realtime subscription; cleanup synchronously
  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("down-links")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "escalations" }, fetchData)
      .subscribe();

    // synchronous cleanup
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return data.filter((d) => {
      const matches = !q ||
        d.ticket_id.toLowerCase().includes(q) ||
        d.site_a_id.toLowerCase().includes(q) ||
        d.site_b_id.toLowerCase().includes(q) ||
        d.link_id.toLowerCase().includes(q);

      const status = getLinkStatus(d.reports);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesProv = providerFilter === "all" || d.provider === providerFilter;

      return matches && matchesStatus && matchesProv;
    });
  }, [data, searchTerm, statusFilter, providerFilter]);

  // utility: extract staged report info (Initial -> InProgress -> Resolved)
  const getStageData = (reports?: ReportRow[]) => {
    if (!reports || reports.length === 0) {
      return { initial: null, inProgress: null, resolved: null } as { initial: ReportRow | null; inProgress: ReportRow | null; resolved: ReportRow | null; };
    }

    // Prefer picking by status when available
    const initial = reports.slice().sort((a, b) => (new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()))[0] ?? null;
    const inProgress = reports.find((r) => r.status === "in_progress") ?? null;
    const resolved = reports.find((r) => r.status === "resolved") ?? null;

    // If statuses not set (report updated in-place), fallback:
    const finalInitial = initial ?? (reports[0] ?? null);
    return { initial: finalInitial, inProgress, resolved };
  };

  // image preview open
  const openPreview = (url: string) => setPreviewUrl(url);
  const closePreview = () => setPreviewUrl(null);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Down Links</h1>
          <p className="text-sm text-muted-foreground mt-1">Clear timeline view of what staff filled at each stage — Create, In-Progress, Resolved.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground hidden md:block">{filtered.length} results</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Escalations</span>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search link, site, ticket..." className="pl-9 w-[320px]" />
              </div>
            </div>
          </CardTitle>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                <SelectItem value="mtn">MTN</SelectItem>
                <SelectItem value="airtel">Airtel</SelectItem>
                <SelectItem value="glo">GLO</SelectItem>
              </SelectContent>
            </Select>

            <div className="md:col-span-2 flex justify-end">
              <Button variant="outline" onClick={() => { setSearchTerm(""); setStatusFilter("all"); setProviderFilter("all"); }}>
                <Filter className="mr-2 h-4 w-4" /> Clear Filters
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Link ID</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>MTTR</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((esc) => (
                  <TableRow key={esc.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono">{esc.ticket_id}</TableCell>
                    <TableCell>{esc.link_id}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase">{esc.provider}</Badge></TableCell>
                    <TableCell>{esc.mttr_hours}h</TableCell>
                    <TableCell>{getStatusBadge(getLinkStatus(esc.reports))}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(esc.created_at), "MMM dd, HH:mm")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => handleView(esc)}>
                          <Eye className="mr-1 h-4 w-4" /> View
                        </Button>
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive"><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Delete Escalation</AlertDialogTitle></AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <Button onClick={() => handleDelete(esc.id)}>Confirm</Button>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal: Inspector + Gallery */}
      {viewEscalation && (
        <AlertDialog open={viewModalOpen} onOpenChange={(v) => { setViewModalOpen(v); if (!v) setViewEscalation(null); }}>
          <AlertDialogContent className="max-w-6xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">Ticket {viewEscalation.ticket_id}</div>
                  <div className="text-sm text-muted-foreground">Link: <span className="font-mono">{viewEscalation.link_id}</span> • {viewEscalation.site_a_id} ↔ {viewEscalation.site_b_id}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Provider</div>
                  <div className="font-medium">{viewEscalation.provider.toUpperCase()}</div>
                </div>
              </AlertDialogTitle>
            </AlertDialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4">
              {/* left: gallery column (spans 2 cols on large screens) */}
              <div className="md:col-span-2 space-y-4">
                {(["In Progress", "Reports", "Resolved"] as (keyof ImageGroups)[]).map((label) => {
                  const urls = reportImages[label] || [];
                  return (
                    <div key={label} className="bg-white/60 p-3 rounded-lg border">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {label === "In Progress" && <Loader2 className="h-5 w-5 text-yellow-600" />}
                          {label === "Reports" && <Clock className="h-5 w-5 text-blue-600" />}
                          {label === "Resolved" && <CheckCircle className="h-5 w-5 text-green-600" />}
                          <h4 className="font-semibold">{label}</h4>
                        </div>
                        <div className="text-xs text-muted-foreground">{urls.length} image(s)</div>
                      </div>

                      {urls.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {urls.map((u, i) => (
                            <div key={i} className="relative group">
                              <img src={u} alt={`${label}-${i}`} className="w-full h-36 object-cover rounded cursor-pointer border" onClick={() => openPreview(u)} />
                              <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition">
                                <a href={u} download className="inline-flex items-center gap-1 rounded bg-white/95 px-2 py-1 text-xs shadow" onClick={(e) => e.stopPropagation()}>
                                  <Download className="h-3 w-3" /> Download
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground italic">No images found for {label.toLowerCase()}.</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* right: inspector / timeline */}
              <div className="space-y-4">
                <div className="bg-muted p-3 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Created</div>
                      <div className="font-medium">{format(new Date(viewEscalation.created_at), "PPP p")}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">MTTR</div>
                      <div className="font-medium">{viewEscalation.mttr_hours}h</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h5 className="font-semibold">Staff Submission Timeline</h5>
                  <div className="text-xs text-muted-foreground mb-2">Separated by stage — tap images to preview full size.</div>

                  {/* timeline entries */}
                  {(() => {
                    const { initial, inProgress, resolved } = getStageData(viewEscalation.reports);

                    const timeline = [
                      { title: "Initial Report", icon: <Clock className="h-4 w-4" />, data: initial },
                      { title: "In-Progress Update", icon: <Loader2 className="h-4 w-4" />, data: inProgress },
                      { title: "Resolution", icon: <CheckCircle className="h-4 w-4" />, data: resolved },
                    ];

                    return timeline.map((t, idx) => {
                      const r = t.data;
                      return (
                        <div key={idx} className="p-3 border rounded-md bg-white/50">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-muted">
                                {t.icon}
                              </div>
                              <div>
                                <div className="font-medium">{t.title}</div>
                                <div className="text-xs text-muted-foreground">{r?.created_at ? format(new Date(r.created_at), "PPP p") : "No submission"}</div>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">Status</div>
                              <div className="font-medium">{r?.status ? r.status.toUpperCase() : "—"}</div>
                            </div>
                          </div>

                          {/* details */}
                          {r ? (
                            <div className="mt-3 text-sm text-muted-foreground space-y-2">
                              {r.issue_description && <div><strong>Issue:</strong> <span className="text-foreground">{r.issue_description}</span></div>}
                              <div><strong>Reported By:</strong> {r.reported_by ?? "—"} {r.contact_info ? `(${r.contact_info})` : ""}</div>
                              {r.status_notes && <div><strong>ETR / Status Notes:</strong> <span className="text-foreground">{r.status_notes}</span></div>}
                              {r.resolution_notes && <div><strong>Resolution Notes:</strong> <span className="text-foreground">{r.resolution_notes}</span></div>}
                              {r.image_url && <div><strong>Primary Image:</strong> <a className="text-blue-600 underline" href={r.image_url} target="_blank" rel="noreferrer">Open</a></div>}
                              {r.resolution_photos && r.resolution_photos.length > 0 && (
                                <div>
                                  <strong>Attached Photos:</strong>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {r.resolution_photos.map((p, i) => (
                                      <img key={i} src={p} alt={`r-${r.id}-p-${i}`} className="w-16 h-16 object-cover rounded border cursor-pointer" onClick={() => openPreview(p)} />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="mt-3 text-sm text-muted-foreground italic">No submission at this stage.</div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Full-size preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-5xl w-full">
            <img src={previewUrl} alt="preview" className="w-full h-auto max-h-[85vh] object-contain rounded" />
            <div className="absolute top-3 right-3 flex gap-2">
              <a href={previewUrl} download className="inline-flex items-center gap-2 rounded bg-white px-3 py-1 text-sm shadow" onClick={(e) => e.stopPropagation()}>
                <Download className="h-4 w-4" /> Download
              </a>
              <button onClick={(e) => { e.stopPropagation(); setPreviewUrl(null); }} className="inline-flex items-center gap-2 rounded bg-white px-3 py-1 text-sm shadow">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
