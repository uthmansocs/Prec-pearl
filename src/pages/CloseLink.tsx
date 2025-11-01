// src/pages/CloseLink.tsx
import React, { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Database, EscalationWithReports } from "@/types/database";

type Escalation = Database["public"]["Tables"]["escalations"]["Row"];
type Report = Database["public"]["Tables"]["reports"]["Row"];
type NotificationLog = Database["public"]["Tables"]["notification_log"]["Row"];
type RcaFormRow = Database["public"]["Tables"]["rca_forms"]["Row"];

/* ---------- Config / static options ---------- */
const LINK_TYPES = ["BB", "EL", "BB/EL", "METRO", "SDH", "IPRAN"] as const;
type LinkType = typeof LINK_TYPES[number];

const ACTUAL_COF_OPTIONS = ["Fibre", "Non-Fibre"] as const;
type ActualCof = typeof ACTUAL_COF_OPTIONS[number];

const PROVIDERS = ["mtn", "airtel", "glo"] as const;
type Provider = typeof PROVIDERS[number];

interface CloseLinkFormData {
  link_type: LinkType;
  start_time: string;
  end_time: string;
  mttr_used: number;
  mttr_status: "Exceeded MTTR" | "Within MTTR";
  pof: string;
  cof: string;
  cof_custom?: string;
  actual_cof: ActualCof;
  detailed_cof: string;
  resolution: string;
  ofc: string;
  jc: string;
  cod: string;
  cod_custom?: string;
  team_lead: string;
  team_manager: string;
  bottle_cassette_tray: string;
  segment: string;
  time_to_pof: string;
  time_to_test: string;
  tt_number: string;
}

/* ---------- Helpers ---------- */
const msToHuman = (minutes: number) => {
  if (minutes < 60) return `${minutes} min${minutes !== 1 ? "s" : ""}`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} hr${h !== 1 ? "s" : ""}` : `${h} hr ${m} min`;
};

const isImageFileName = (name?: string) =>
  !!name && /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(name);

/* ---------- Component ---------- */
export default function CloseLinkForm({ onClose }: { onClose?: () => void }) {
  const { toast } = useToast();
  const location = useLocation();
  const params = useParams<{ escalation_id?: string; id?: string }>();
  const paramId = params.escalation_id ?? params.id;

  const [provider, setProvider] = useState<Provider>("mtn");
  const [escalation, setEscalation] = useState<EscalationWithReports | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [formData, setFormData] = useState<CloseLinkFormData>({
    link_type: "BB",
    start_time: "",
    end_time: "",
    mttr_used: 0,
    mttr_status: "Within MTTR",
    pof: "",
    cof: "",
    cof_custom: "",
    actual_cof: "Fibre",
    detailed_cof: "",
    resolution: "",
    ofc: "",
    jc: "",
    cod: "",
    cod_custom: "",
    team_lead: "",
    team_manager: "",
    bottle_cassette_tray: "",
    segment: "",
    time_to_pof: "",
    time_to_test: "",
    tt_number: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  // added "report" drawer mode to support viewing full report (not RCA)
  const [drawerMode, setDrawerMode] = useState<"create" | "view" | "edit" | "report">("create");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [selectedRca, setSelectedRca] = useState<RcaFormRow | null>(null);

  // image modal
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);

  /* ---------- Format helpers ---------- */
  const formatEscalationLink = (e?: Partial<Escalation> | null) => {
    if (!e) return "";
    if (e.link_id) return String(e.link_id);
    const a = e.site_a_id ? String(e.site_a_id).trim() : "";
    const b = e.site_b_id ? String(e.site_b_id).trim() : "";
    if (a && b) return `${a}-${b}`;
    return "";
  };

  /* ---------- Data fetching ---------- */
  const fetchAllResolvedReports = async (mounted: { val: boolean }, forProvider: Provider) => {
    try {
      const { data, error } = await supabase
        .from("reports")
        .select("*, escalation:escalations(id, ticket_id, provider, link_id, site_a_id, site_b_id, rca_forms(*))")
        .eq("status", "resolved")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!mounted.val) return;

      const rows = ((data as any[]) ?? []).filter((row) => {
        const esc = (row as any).escalation;
        if (!esc) return false;
        return String(esc.provider ?? "").toLowerCase() === String(forProvider).toLowerCase();
      });

      setReports(rows as Report[]);
      setEscalation(null);
    } catch (err: any) {
      console.error("fetchAllResolvedReports error:", err);
      toast({ title: "Error", description: err?.message ?? "Failed fetching resolved reports.", variant: "destructive" });
    }
  };

  const fetchEscalationAndResolvedReports = async (escalationId: string, mounted: { val: boolean }) => {
    try {
      const { data: escRow, error: escErr } = await supabase
        .from("escalations")
        .select("*, reports(*), rca_forms(*)")
        .eq("id", escalationId)
        .maybeSingle();

      if (escErr) throw escErr;
      if (!escRow) {
        if (mounted.val) {
          setEscalation(null);
          setReports([]);
          toast({ title: "Not found", description: "Escalation not found.", variant: "destructive" });
        }
        return;
      }

      if (mounted.val) {
        setEscalation(escRow as EscalationWithReports);
        escRow.reports = escRow.reports ?? [];
        const resolvedReports = (escRow.reports as Report[]).filter((r) => r.status === "resolved");
        setReports(resolvedReports);
      }
    } catch (err: any) {
      console.error("fetchEscalationAndResolvedReports error:", err);
      toast({ title: "Error", description: err?.message ?? "Failed fetching escalation data.", variant: "destructive" });
    }
  };

  /* ---------- component mount & realtime (no async return) ---------- */
  useEffect(() => {
    let mounted = { val: true };
    setIsLoading(true);

    const resolveAndFetch = async () => {
      try {
        if (!paramId) {
          await fetchAllResolvedReports(mounted, provider);
          setIsLoading(false);
          return;
        }

        const { data: reportRow, error: reportErr } =
          await supabase.from("reports").select("*").eq("id", paramId).maybeSingle();
        if (reportErr) throw reportErr;

        if (reportRow) {
          const escId = reportRow.escalation_id;
          if (!escId) {
            if (mounted.val) {
              setEscalation(null);
              setReports([]);
              toast({ title: "Error", description: "Report found but has no escalation_id.", variant: "destructive" });
            }
            setIsLoading(false);
            return;
          }
          await fetchEscalationAndResolvedReports(escId, mounted);
        } else {
          await fetchEscalationAndResolvedReports(paramId, mounted);
        }
      } catch (err: any) {
        console.error("resolveAndFetch error:", err);
        toast({ title: "Error", description: err?.message ?? "Failed resolving id.", variant: "destructive" });
      } finally {
        if (mounted.val) setIsLoading(false);
      }
    };

    resolveAndFetch();

    // set up realtime subscriptions (non-async cleanup)
    let channelRef: any = null;
    const setupRealtime = async () => {
      try {
        if (!paramId) {
          channelRef = supabase
            .channel(`close-link-resolved-${provider}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "reports", filter: `status=eq.resolved` },
              async () => {
                if (!mounted.val) return;
                await fetchAllResolvedReports(mounted, provider);
              }
            )
            .subscribe();
        } else {
          const { data: reportRow } = await supabase.from("reports").select("escalation_id").eq("id", paramId).maybeSingle();
          let escId: string | null = null;
          if (reportRow) escId = reportRow.escalation_id ?? null;
          else escId = paramId;

          if (!escId) return;

          channelRef = supabase
            .channel(`close-link-${escId}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "reports", filter: `escalation_id=eq.${escId}` },
              async () => {
                if (!mounted.val) return;
                await fetchEscalationAndResolvedReports(escId!, mounted);
              }
            )
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "escalations", filter: `id=eq.${escId}` },
              async () => {
                if (!mounted.val) return;
                await fetchEscalationAndResolvedReports(escId!, mounted);
              }
            )
            .subscribe();
        }
      } catch (e) {
        console.warn("Realtime setup failed:", e);
      }
    };

    setupRealtime();

    return () => {
      mounted.val = false;
      try {
        if (channelRef) supabase.removeChannel(channelRef);
      } catch (e) {
        console.warn("Failed to remove channel:", e);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId, provider]);

  /* ---------- Fill RCA form initial values when escalation loaded ---------- */
  useEffect(() => {
    if (!escalation) return;

    const populate = async () => {
      try {
        // notification log + first report reporter as team lead fallback
        const { data: notificationLogRaw, error: logError } = await supabase
          .from("notification_log")
          .select("pof, cof, resolution_notes")
          .eq("escalation_id", escalation.id)
          .maybeSingle();
        if (logError) throw logError;

        const { data: reportRowRaw, error: reportError } = await supabase
          .from("reports")
          .select("reported_by")
          .eq("escalation_id", escalation.id)
          .limit(1)
          .maybeSingle();
        if (reportError) throw reportError;

        const notificationLog = notificationLogRaw as Partial<NotificationLog> | null;
        const reportRow = reportRowRaw as Partial<Report> | null;

        // Use escalation.end_time only as fallback — end_time for RCA will be filled manually by user
        let start = new Date();
        try {
          start = escalation.created_at ? parseISO(escalation.created_at) : new Date();
        } catch {}
        let end = new Date();
        try {
          end = escalation.end_time ? parseISO(escalation.end_time) : new Date();
        } catch {}

        const initialMttr = Math.max(0, Math.round(differenceInMinutes(end, start)));
        const mttrStatus = initialMttr > (escalation.mttr_hours ?? 180) ? "Exceeded MTTR" : "Within MTTR";

        setFormData((prev) => ({
          ...prev,
          link_type: (escalation.link_type as LinkType) ?? prev.link_type,
          start_time: format(start, "yyyy-MM-dd'T'HH:mm"),
          // keep end_time empty so user must fill exact end time
          end_time: "",
          mttr_used: 0,
          mttr_status: mttrStatus,
          pof: notificationLog?.pof ?? "",
          cof: (notificationLog?.cof ?? escalation.cof) ?? "",
          cof_custom: "",
          actual_cof: (escalation.actual_cof as ActualCof) ?? "Fibre",
          detailed_cof: escalation.detailed_cof ?? "",
          resolution: notificationLog?.resolution_notes ?? "",
          ofc: escalation.ofc ?? "",
          jc: escalation.jc ?? "",
          cod: escalation.cod ?? "",
          cod_custom: "",
          team_lead: reportRow?.reported_by ?? "",
          team_manager: escalation.team_manager ?? "",
        }));
      } catch (err: any) {
        console.error("Populate form error:", err);
        toast({ title: "Error", description: err?.message ?? "Failed to populate form data.", variant: "destructive" });
      }
    };

    populate();
  }, [escalation, toast]);

  /* ---------- Utilities: compute MTTR for a report (created_at -> updated_at) ---------- */
  const computeReportMttr = (r: Report) => {
    if (!r.created_at || !r.updated_at) return { minutes: 0, human: "—", status: "Within MTTR" };
    try {
      const start = parseISO(r.created_at);
      const end = parseISO(r.updated_at);
      const minutes = Math.max(0, differenceInMinutes(end, start));
      const thresholdMins = (escalation?.mttr_hours ?? 3) * 60;
      const status = minutes > thresholdMins ? "Exceeded MTTR" : "Within MTTR";
      return { minutes, human: msToHuman(minutes), status };
    } catch {
      return { minutes: 0, human: "—", status: "Within MTTR" };
    }
  };

  /* ---------- RCA helpers (unchanged logic but kept tidy) ---------- */
  const setFormDataFromRca = (rca: RcaFormRow | null) => {
    if (!rca) return;

    const COD_OPTIONS = [
      "Night Failure",
      "Security Issue",
      "Vehicle Breakdown",
      "No Fuel",
      "Community Issue",
      "Rainfall",
      "Prolonged Civil Work",
      "Traffic",
      "Access Issue",
      "Bad Road",
      "Others",
    ];

    let codVal = rca.cod ?? "";
    let codCustomVal = "";
    if (rca.cod && !COD_OPTIONS.includes(rca.cod)) {
      codVal = "Others";
      codCustomVal = rca.cod;
    }

    const COF_OPTIONS = [
      "Vandalism",
      "Core Failure",
      "Sabotage",
      "Animal Infestation",
      "Core Break",
      "Force Majuere",
      "Construction",
      "Highloss",
      "PC Issue",
      "Power Issue",
      "Planned Work",
      "Others",
    ];

    let cofVal = rca.cof ?? "";
    let cofCustomVal = "";
    if (rca.cof && !COF_OPTIONS.includes(rca.cof)) {
      cofVal = "Others";
      cofCustomVal = rca.cof;
    }

    setFormData({
      link_type: (rca.link_type as LinkType) ?? "BB",
      start_time: rca.start_time ?? "",
      end_time: rca.end_time ?? "",
      mttr_used: rca.mttr_used ?? 0,
      mttr_status: rca.mttr_status ?? "Within MTTR",
      pof: (rca.pof as string) ?? "",
      cof: cofVal,
      cof_custom: cofCustomVal,
      actual_cof: (rca.actual_cof as ActualCof) ?? "Fibre",
      detailed_cof: rca.detailed_cof ?? "",
      resolution: rca.resolution ?? "",
      ofc: rca.ofc ?? "",
      jc: rca.jc ?? "",
      cod: codVal,
      cod_custom: codCustomVal,
      team_lead: rca.team_lead ?? "",
      team_manager: rca.team_manager ?? "",
      bottle_cassette_tray: rca.bottle_cassette_tray ?? "",
      segment: rca.segment ?? "",
      time_to_pof: rca.time_to_pof !== null && rca.time_to_pof !== undefined ? String(rca.time_to_pof) : "",
      time_to_test: rca.time_to_test !== null && rca.time_to_test !== undefined ? String(rca.time_to_test) : "",
      tt_number: rca.tt_number ?? "",
    });
  };

  /* ---------- Open/Create/View/Edit RCA handlers (fixed Create behavior) ---------- */
  // improved: checks for existing RCA (embedded or via query) and opens in view mode instead of allow duplicate
  const handleOpenCreateForReport = async (report: Report) => {
    if (!report.escalation_id) {
      toast({ title: "Error", description: "Selected report has no escalation_id.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      // fetch escalation + reports + any embedded rca_forms (if available)
      const { data: escRow, error: escErr } = await supabase
        .from("escalations")
        .select("*, reports(*), rca_forms(*)")
        .eq("id", report.escalation_id)
        .maybeSingle();
      if (escErr) throw escErr;
      if (!escRow) {
        toast({ title: "Not found", description: "Escalation not found for selected report.", variant: "destructive" });
        return;
      }

      escRow.reports = escRow.reports ?? [];
      setEscalation(escRow as EscalationWithReports);
      setReports((escRow.reports as Report[]).filter((r) => r.status === "resolved"));

      // If escalation already has an RCA, open that RCA in view mode instead of allowing create.
      const embeddedRcas = (escRow as any).rca_forms;
      if (Array.isArray(embeddedRcas) && embeddedRcas.length > 0) {
        const existingRca = embeddedRcas[0] as RcaFormRow;
        setSelectedReport(report);
        setSelectedRca(existingRca);
        setFormDataFromRca(existingRca);
        setDrawerMode("view");
        setDrawerOpen(true);
        toast({ title: "RCA exists", description: "An RCA already exists for this escalation — opening it in view mode.", variant: "default" });
        return;
      }

      // Fallback: check rca_forms table if not embedded
      const { data: fetchedRca, error: rcaErr } = await supabase
        .from("rca_forms")
        .select("*")
        .eq("escalation_id", report.escalation_id)
        .maybeSingle();
      if (rcaErr) throw rcaErr;
      if (fetchedRca) {
        setSelectedReport(report);
        setSelectedRca(fetchedRca as RcaFormRow);
        setFormDataFromRca(fetchedRca as RcaFormRow);
        setDrawerMode("view");
        setDrawerOpen(true);
        toast({ title: "RCA exists", description: "An RCA already exists for this escalation — opening it in view mode.", variant: "default" });
        return;
      }

      // No existing RCA — open Create form. Do NOT auto-fill end_time (user must enter exact resolved time).
      let startTime = new Date();
      try {
        startTime = escRow.created_at ? parseISO(escRow.created_at) : new Date();
      } catch {}

      setSelectedReport(report);
      setSelectedRca(null);

      setFormData((prev) => ({
        ...prev,
        link_type: (escRow.link_type as LinkType) ?? prev.link_type,
        start_time: format(startTime, "yyyy-MM-dd'T'HH:mm"),
        end_time: "",
        mttr_used: 0,
        mttr_status: "Within MTTR",
        team_lead: report.reported_by ?? prev.team_lead,
        team_manager: escRow.team_manager ?? prev.team_manager,
      }));

      setDrawerMode("create");
      setDrawerOpen(true);
    } catch (err: any) {
      console.error("handleOpenCreateForReport error:", err);
      toast({ title: "Error", description: err?.message ?? "Failed to open RCA form.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewRca = async (report: Report) => {
    if (!report.escalation_id) return toast({ title: "Error", description: "No escalation referenced.", variant: "destructive" });

    setIsLoading(true);
    try {
      // fetch rca form by escalation_id
      const { data: rcaRow, error: rcaErr } = await supabase
        .from("rca_forms")
        .select("*")
        .eq("escalation_id", report.escalation_id)
        .maybeSingle();
      if (rcaErr) throw rcaErr;
      if (!rcaRow) {
        toast({ title: "No RCA", description: "No RCA found for this escalation.", variant: "destructive" });
        return;
      }

      const { data: escRow, error: escErr } = await supabase
        .from("escalations")
        .select("*, reports(*), rca_forms(*)")
        .eq("id", report.escalation_id)
        .maybeSingle();
      if (escErr) throw escErr;
      if (escRow) {
        escRow.reports = escRow.reports ?? [];
        setEscalation(escRow as EscalationWithReports);
        setReports((escRow.reports as Report[]).filter((r) => r.status === "resolved"));
      }

      setSelectedReport(report);
      setSelectedRca(rcaRow);
      setFormDataFromRca(rcaRow);
      setDrawerMode("view");
      setDrawerOpen(true);
    } catch (err: any) {
      console.error("handleViewRca error:", err);
      toast({ title: "Error", description: err?.message ?? "Failed to load RCA.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditRca = async (report: Report) => {
    if (!report.escalation_id) return toast({ title: "Error", description: "No escalation referenced.", variant: "destructive" });

    setIsLoading(true);
    try {
      const { data: rcaRow, error: rcaErr } = await supabase
        .from("rca_forms")
        .select("*")
        .eq("escalation_id", report.escalation_id)
        .maybeSingle();
      if (rcaErr) throw rcaErr;
      if (!rcaRow) {
        toast({ title: "No RCA", description: "No RCA found for this escalation.", variant: "destructive" });
        return;
      }

      const { data: escRow, error: escErr } = await supabase
        .from("escalations")
        .select("*, reports(*), rca_forms(*)")
        .eq("id", report.escalation_id)
        .maybeSingle();
      if (escErr) throw escErr;
      if (escRow) {
        escRow.reports = escRow.reports ?? [];
        setEscalation(escRow as EscalationWithReports);
        setReports((escRow.reports as Report[]).filter((r) => r.status === "resolved"));
      }

      setSelectedReport(report);
      setSelectedRca(rcaRow);
      setFormDataFromRca(rcaRow);
      setDrawerMode("edit");
      setDrawerOpen(true);
    } catch (err: any) {
      console.error("handleEditRca error:", err);
      toast({ title: "Error", description: err?.message ?? "Failed to load RCA for edit.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  /* ---------- Submit RCA (unchanged core logic with MTTR calc from form fields) ---------- */
  const updateReportsWithRca = (rca: RcaFormRow) => {
    setReports((prev) =>
      prev.map((r) => {
        if (r.escalation_id && r.escalation_id === rca.escalation_id) {
          const esc = (r as any).escalation || {};
          esc.rca_forms = esc.rca_forms && esc.rca_forms.length ? esc.rca_forms : [];
          const existsIndex = esc.rca_forms.findIndex((x: any) => String(x.id) === String((rca as any).id));
          if (existsIndex >= 0) esc.rca_forms[existsIndex] = rca;
          else esc.rca_forms.unshift(rca);
          return { ...r, escalation: esc } as Report;
        }
        return r;
      })
    );
  };

  const handleSubmit = async () => {
    if (!formData.actual_cof || !formData.detailed_cof.trim() || !formData.resolution.trim()) {
      toast({ title: "Validation Error", description: "Please fill Actual COF, Detailed COF, and Resolution.", variant: "destructive" });
      return;
    }
    if (!escalation?.id) {
      toast({ title: "Missing escalation", description: "Open this page for an escalation to close the link.", variant: "destructive" });
      return;
    }

    // compute MTTR from form start_time and end_time (user-supplied)
    let computedMinutes = 0;
    try {
      if (formData.start_time && formData.end_time) {
        const start = parseISO(formData.start_time);
        const end = parseISO(formData.end_time);
        computedMinutes = Math.max(0, differenceInMinutes(end, start));
      }
    } catch (e) {
      computedMinutes = 0;
    }
    const computedHours = Math.floor(computedMinutes / 60);
    const computedStatus = computedMinutes > (escalation.mttr_hours ?? 3) * 60 ? "Exceeded MTTR" : "Within MTTR";

    setSubmitting(true);
    try {
      const { data: existingRca, error: selectErr } = await supabase
        .from("rca_forms")
        .select("*")
        .eq("escalation_id", escalation.id)
        .maybeSingle();
      if (selectErr) throw selectErr;

      const payload = {
        escalation_id: escalation.id,
        link_type: formData.link_type,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        mttr_used: computedHours,
        mttr_status: computedStatus,
        cof: formData.cof === "Others" ? (formData.cof_custom || null) : (formData.cof || null),
        pof: formData.pof || null,
        actual_cof: formData.actual_cof,
        detailed_cof: formData.detailed_cof,
        resolution: formData.resolution,
        ofc: formData.ofc || null,
        jc: formData.jc || null,
        cod: formData.cod === "Others" ? (formData.cod_custom || null) : (formData.cod || null),
        team_lead: formData.team_lead ?? null,
        team_manager: formData.team_manager ?? null,
        bottle_cassette_tray: formData.bottle_cassette_tray ?? null,
        segment: formData.segment ?? null,
        time_to_pof: formData.time_to_pof ? parseFloat(formData.time_to_pof) : null,
        time_to_test: formData.time_to_test ? parseFloat(formData.time_to_test) : null,
        tt_number: formData.tt_number ?? null,
        updated_at: new Date().toISOString(),
      } as any;

      let savedRca: RcaFormRow | null = null;

      if (existingRca && (existingRca as any).id) {
        const { data: updated, error: updateErr } = await supabase
          .from("rca_forms")
          .update(payload)
          .eq("id", (existingRca as any).id)
          .select()
          .maybeSingle();
        if (updateErr) throw updateErr;
        savedRca = updated as RcaFormRow;
      } else {
        const toInsert = { ...payload, created_at: new Date().toISOString() };
        const { data: inserted, error: insertErr } = await supabase
          .from("rca_forms")
          .insert(toInsert)
          .select()
          .maybeSingle();
        if (insertErr) throw insertErr;
        savedRca = inserted as RcaFormRow;
      }

      if (savedRca && savedRca.escalation_id) {
        setSelectedRca(savedRca);
        updateReportsWithRca(savedRca);

        setReports((prev) =>
          prev.map((r) => {
            if (r.escalation_id && r.escalation_id === savedRca!.escalation_id) {
              const esc = (r as any).escalation || {};
              esc.rca_forms = esc.rca_forms && esc.rca_forms.length ? esc.rca_forms : [];
              const existsIndex = esc.rca_forms.findIndex((x: any) => String(x.id) === String((savedRca as any).id));
              if (existsIndex === -1) esc.rca_forms.unshift(savedRca);
              else esc.rca_forms[existsIndex] = savedRca;
              return { ...r, escalation: esc } as Report;
            }
            return r;
          })
        );
      }

      // mark reports closed for this escalation
      const { error: escError } = await supabase
        .from("reports")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("escalation_id", escalation.id);

      if (escError) throw escError;

      toast({ title: "Success", description: "Link closed and RCA saved successfully." });

      setDrawerMode("view");
      setDrawerOpen(true);

      // refresh server-side data to ensure canonical state
      const mounted = { val: true };
      if (paramId) {
        await fetchEscalationAndResolvedReports(escalation.id, mounted);
      } else {
        await fetchAllResolvedReports(mounted, provider);
      }
    } catch (err: any) {
      console.error("Submit error:", err);
      toast({ title: "Error", description: err?.message ?? "Failed to save RCA.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = <K extends keyof CloseLinkFormData>(field: K, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value as CloseLinkFormData[K] }));
  };

  const handleEndTimeChange = (value: string) => {
    setFormData((prev) => {
      let next = { ...prev, end_time: value };
      try {
        if (prev.start_time && value) {
          const start = parseISO(prev.start_time);
          const end = parseISO(value);
          const minutes = Math.max(0, differenceInMinutes(end, start));
          const hours = Math.floor(minutes / 60);
          next.mttr_used = hours;
          next.mttr_status = minutes > (escalation?.mttr_hours ?? 3) * 60 ? "Exceeded MTTR" : "Within MTTR";
        } else {
          next.mttr_used = 0;
          next.mttr_status = "Within MTTR";
        }
      } catch {}
      return next;
    });
  };

  /* ---------- Export helpers (kept) ---------- */
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportRcaFormsAsExcel = async () => {
    try {
      let rcaQuery: any = supabase.from("rca_forms").select("*, escalation:escalations(ticket_id, provider, link_id, site_a_id, site_b_id)");
      if (escalation?.id) {
        rcaQuery = rcaQuery.eq("escalation_id", escalation.id);
      } else {
        const escIds = Array.from(new Set(reports.map((r) => r.escalation_id).filter(Boolean))) as string[];
        if (escIds.length === 0) {
          toast({ title: "No RCA forms", description: "No RCA forms available for current view.", variant: "destructive" });
          return;
        }
        // @ts-ignore
        rcaQuery = (rcaQuery as any).in("escalation_id", escIds);
      }

      const { data: rcaRows, error: rcaErr } = await rcaQuery.order("created_at", { ascending: false });
      if (rcaErr) throw rcaErr;
      if (!rcaRows || rcaRows.length === 0) {
        toast({ title: "No RCA forms", description: "No RCA forms found to download.", variant: "destructive" });
        return;
      }

      // Build rows with UPPER-CASE column keys and remove unwanted fields
      const rowsForExport = (rcaRows as (RcaFormRow & { escalation?: Partial<Escalation> })[]).map((r) => {
        const esc = r.escalation ?? {};
        return {
          TICKET_ID: esc.ticket_id ?? "",
          PROVIDER: esc.provider ?? "",
          LINK_ID: esc.link_id ?? "",
          LINK_TYPE: r.link_type ?? "",
          START_TIME: r.start_time ?? "",
          END_TIME: r.end_time ?? "",
          MTTR_USED: r.mttr_used ?? "",
          MTTR_STATUS: r.mttr_status ?? "",
          COF: r.cof ?? "",
          POF: r.pof ?? "",
          ACTUAL_COF: r.actual_cof ?? "",
          DETAILED_COF: r.detailed_cof ?? "",
          RESOLUTION: r.resolution ?? "",
          OFC: r.ofc ?? "",
          JC: r.jc ?? "",
          COD: r.cod ?? "",
          TEAM_LEAD: r.team_lead ?? "",
          TEAM_MANAGER: r.team_manager ?? "",
          BOTTLE_CASSETTE_TRAY: r.bottle_cassette_tray ?? "",
          SEGMENT: r.segment ?? "",
          TIME_TO_POF: r.time_to_pof ?? "",
          TIME_TO_TEST: r.time_to_test ?? "",
          TT_NUMBER: r.tt_number ?? "",
        };
      });

      const timestamp = format(new Date(), "yyyyMMdd_HHmmss");
      const filename = `rca_forms_${timestamp}.xlsx`;

      try {
        // dynamic import if xlsx lib present
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const XLSX = await import("xlsx");
        if (XLSX && XLSX.utils) {
          const ws = XLSX.utils.json_to_sheet(rowsForExport);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "RCA_FORMS");
          const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
          const blob = new Blob([wbout], { type: "application/octet-stream" });
          downloadBlob(blob, filename);
          toast({ title: "Download ready", description: `Downloaded ${filename}` });
          return;
        }
      } catch (e) {
        console.warn("xlsx import failed, falling back to CSV:", e);
      }

      // Fallback CSV (headers will be the uppercase keys)
      const header = Object.keys(rowsForExport[0]);
      const csvLines = [header.join(",")];
      for (const r of rowsForExport) {
        const line = header
          .map((h) => {
            const cell = (r as any)[h];
            if (cell === null || cell === undefined) return "";
            const s = String(cell).replace(/"/g, '""');
            return `"${s}"`;
          })
          .join(",");
        csvLines.push(line);
      }
      const csv = csvLines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const csvFilename = filename.replace(/\.xlsx$/, ".csv");
      downloadBlob(blob, csvFilename);
      toast({ title: "Downloaded (CSV)", description: `Downloaded ${csvFilename} (xlsx lib not installed).` });
    } catch (err: any) {
      console.error("exportRcaFormsAsExcel error:", err);
      toast({ title: "Error", description: err?.message ?? "Failed to export RCA forms.", variant: "destructive" });
    }
  };

  const inputsDisabled = (drawerMode === "view" || drawerMode === "report") || submitting;

  /* ---------- UI pieces: report detail viewer (Create / In Progress / Resolved) ---------- */
  const ReportDetailPanel: React.FC<{ r: Report }> = ({ r }) => {
    const createdAt = r.created_at ? format(new Date(r.created_at), "PPpp") : "—";
    const updatedAt = r.updated_at ? format(new Date(r.updated_at), "PPpp") : "—";
    const mttr = r.status === "resolved" ? computeReportMttr(r) : null;

    const photos: string[] =
      (r as any).resolution_photos ??
      (r as any).report_photos ??
      (r as any).images ??
      (r as any).photos ??
      [];

    const createFields = {
      issue: r.issue_description ?? r.description ?? "—",
      reportedBy: r.reported_by ?? r.reported_by_name ?? "—",
      contact: (r as any).contact_info ?? (r as any).contact ?? "—",
      critical: (r as any).is_critical ? "Critical" : "Normal",
    };

    const inProgressFields = {
      status_notes: (r as any).status_notes ?? (r as any).in_progress_notes ?? "",
      assigned_to: (r as any).assigned_to ?? "",
      technician_notes: (r as any).technician_notes ?? "",
      in_progress_images: (r as any).in_progress_photos ?? [],
    };

    const resolvedFields = {
      resolution_notes: r.resolution_notes ?? "",
      pof_url: (r as any).pof_url ?? null,
      cof_url: (r as any).cof_url ?? null,
      resolved_images: (r as any).resolution_photos ?? photos,
    };

    return (
      <div className="grid gap-4">
        {/* Create Report */}
        <div className="p-4 bg-white border rounded-lg shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-semibold">Create Report</h4>
              <p className="text-xs text-muted-foreground">What the reporter submitted initially</p>
            </div>
            <Badge variant="outline">{createFields.critical}</Badge>
          </div>

          <div className="mt-3 grid gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Issue</div>
              <div className="text-sm">{createFields.issue}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Reported By</div>
                <div>{createFields.reportedBy}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Contact</div>
                <div>{createFields.contact}</div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">Created</div>
            <div className="text-sm">{createdAt}</div>
          </div>
        </div>

        {/* In Progress */}
        <div className="p-4 bg-white border rounded-lg shadow-sm">
          <h4 className="font-semibold">In Progress</h4>
          <p className="text-xs text-muted-foreground">What staff filled while working the fault</p>

          <div className="mt-3 grid gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Notes</div>
              <div className="text-sm">{inProgressFields.status_notes || <span className="text-muted-foreground">No notes</span>}</div>
            </div>

            {Array.isArray(inProgressFields.in_progress_images) && inProgressFields.in_progress_images.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground">In Progress Photos</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {inProgressFields.in_progress_images.map((u: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => setImageModalUrl(u)}
                      className="overflow-hidden rounded-md border"
                      aria-label={`Open image ${i + 1}`}
                    >
                      <img src={u} alt={`in-progress-${i}`} className="w-full h-20 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resolved */}
        <div className="p-4 bg-white border rounded-lg shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-semibold">Resolved</h4>
              <p className="text-xs text-muted-foreground">Final resolution details</p>
            </div>

            <div className="text-right">
              <div className="text-xs text-muted-foreground">Resolved at</div>
              <div className="text-sm">{updatedAt}</div>
            </div>
          </div>

          <div className="mt-3 grid gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Resolution Notes</div>
              <div className="text-sm">{resolvedFields.resolution_notes || <span className="text-muted-foreground">No resolution notes</span>}</div>
            </div>

            <div className="flex gap-3 items-center">
              {resolvedFields.pof_url && (
                <a href={resolvedFields.pof_url} target="_blank" rel="noopener noreferrer" className="text-sm underline">
                  View POF
                </a>
              )}
              {resolvedFields.cof_url && (
                <a href={resolvedFields.cof_url} target="_blank" rel="noopener noreferrer" className="text-sm underline">
                  View COF
                </a>
              )}
            </div>

            {Array.isArray(resolvedFields.resolved_images) && resolvedFields.resolved_images.length > 0 ? (
              <>
                <div className="text-xs text-muted-foreground">Resolution Photos</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {resolvedFields.resolved_images.map((u: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => setImageModalUrl(u)}
                      className="overflow-hidden rounded-md border"
                      aria-label={`Open resolved image ${i + 1}`}
                    >
                      <img src={u} alt={`resolved-${i}`} className="w-full h-20 object-cover" />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No resolution photos uploaded.</div>
            )}

            {/* MTTR box */}
            {mttr && (
              <div className="mt-3 p-3 bg-gray-50 rounded-md border flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">MTTR (created → resolved)</div>
                  <div className="text-lg font-semibold">{mttr.human}</div>
                </div>
                <div>
                  <span
                    className={
                      "inline-block px-3 py-1 rounded-full text-sm font-medium " +
                      (mttr.status === "Within MTTR" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")
                    }
                  >
                    {mttr.status}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ---------- Render ---------- */
  if (isLoading) {
    return (
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader>
          <CardTitle>Loading...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Fetching escalation and reports...</div>
        </CardContent>
      </Card>
    );
  }

  const escalationLinkLabel = escalation ? formatEscalationLink(escalation) : "";
  const headerTitle = escalation
    ? `Close Link - ${escalation.ticket_id ?? "Unknown"}${escalationLinkLabel ? ` — ${escalationLinkLabel}` : ""}`
    : `Resolved Reports (${reports.length})`;

  /* ---------- RCA form UI (used for create/view/edit) ---------- */
  const RcaFormUI = (
    <div className="grid gap-4">
      <div>
        <Label htmlFor="link_type">Link Type</Label>
        <Select value={formData.link_type} onValueChange={(val) => handleChange("link_type", val)} disabled={inputsDisabled}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {LINK_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Start Time</Label>
          <Input className="w-full text-base" type="datetime-local" value={formData.start_time} disabled />
        </div>
        <div>
          <Label>End Time (enter exact resolved time)</Label>
          <Input
            className="w-full text-base"
            type="datetime-local"
            value={formData.end_time}
            onChange={(e) => handleEndTimeChange(e.target.value)}
            disabled={inputsDisabled}
          />
          <div className="text-xs text-muted-foreground mt-1">End time must be set by user — MTTR will be computed from start → end.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>MTTR Used (h)</Label>
          <Input className="w-full" value={String(formData.mttr_used)} disabled />
        </div>
        <div>
          <Label>MTTR Status</Label>
          <Input className="w-full" value={formData.mttr_status} disabled />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>COF</Label>
          <Select value={formData.cof || ""} onValueChange={(val) => handleChange("cof", val)} disabled={inputsDisabled}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select COF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Vandalism">Vandalism</SelectItem>
              <SelectItem value="Core Failure">Core Failure</SelectItem>
              <SelectItem value="Sabotage">Sabotage</SelectItem>
              <SelectItem value="Animal Infestation">Animal Infestation</SelectItem>
              <SelectItem value="Core Break">Core Break</SelectItem>
              <SelectItem value="Force Majuere">Force Majuere</SelectItem>
              <SelectItem value="Construction">Construction</SelectItem>
              <SelectItem value="Highloss">Highloss</SelectItem>
              <SelectItem value="PC Issue">PC Issue</SelectItem>
              <SelectItem value="Power Issue">Power Issue</SelectItem>
              <SelectItem value="Planned Work">Planned Work</SelectItem>
              <SelectItem value="Others">Others</SelectItem>
            </SelectContent>
          </Select>

          {formData.cof === "Others" && (
            <Input
              className="w-full mt-2"
              placeholder="Specify COF"
              value={formData.cof_custom || ""}
              onChange={(e) => handleChange("cof_custom", e.target.value)}
              disabled={inputsDisabled}
            />
          )}
        </div>

        <div>
          <Label>POF</Label>
          <Input className="w-full" value={formData.pof} onChange={(e) => handleChange("pof", e.target.value)} disabled={inputsDisabled} />
        </div>
      </div>

      <div>
        <Label htmlFor="actual_cof">Actual COF *</Label>
        <Select value={formData.actual_cof} onValueChange={(val) => handleChange("actual_cof", val)} disabled={inputsDisabled}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {ACTUAL_COF_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Detailed COF *</Label>
        <Textarea className="w-full text-base" rows={3} value={formData.detailed_cof} onChange={(e) => handleChange("detailed_cof", e.target.value)} disabled={inputsDisabled} />
      </div>

      <div>
        <Label>Resolution *</Label>
        <Textarea className="w-full text-base" rows={3} value={formData.resolution} onChange={(e) => handleChange("resolution", e.target.value)} disabled={inputsDisabled} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Input className="w-full" placeholder="OFC" value={formData.ofc} onChange={(e) => handleChange("ofc", e.target.value)} disabled={inputsDisabled} />
        <Input className="w-full" placeholder="JC" value={formData.jc} onChange={(e) => handleChange("jc", e.target.value)} disabled={inputsDisabled} />

        <div>
          <Label>COD</Label>
          <Select
            value={formData.cod || ""}
            onValueChange={(val) => handleChange("cod", val)}
            disabled={inputsDisabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select COD" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Night Failure">Night Failure</SelectItem>
              <SelectItem value="Security Issue">Security Issue</SelectItem>
              <SelectItem value="Vehicle Breakdown">Vehicle Breakdown</SelectItem>
              <SelectItem value="No Fuel">No Fuel</SelectItem>
              <SelectItem value="Community Issue">Community Issue</SelectItem>
              <SelectItem value="Rainfall">Rainfall</SelectItem>
              <SelectItem value="Prolonged Civil Work">Prolonged Civil Work</SelectItem>
              <SelectItem value="Traffic">Traffic</SelectItem>
              <SelectItem value="Access Issue">Access Issue</SelectItem>
              <SelectItem value="Bad Road">Bad Road</SelectItem>
              <SelectItem value="Others">Others</SelectItem>
            </SelectContent>
          </Select>

          {formData.cod === "Others" && (
            <Input
              className="w-full mt-2"
              placeholder="Specify COD"
              value={formData.cod_custom || ""}
              onChange={(e) => handleChange("cod_custom", e.target.value)}
              disabled={inputsDisabled}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Bottle Cassette Tray</Label>
          <Input className="w-full" value={formData.bottle_cassette_tray} onChange={(e) => handleChange("bottle_cassette_tray", e.target.value)} disabled={inputsDisabled} />
        </div>
        <div>
          <Label>Segment</Label>
          <Input className="w-full" value={formData.segment} onChange={(e) => handleChange("segment", e.target.value)} disabled={inputsDisabled} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <Label>Time to POF</Label>
          <Input className="w-full" type="number" value={formData.time_to_pof} onChange={(e) => handleChange("time_to_pof", e.target.value)} disabled={inputsDisabled} />
        </div>
        <div>
          <Label>Time to Test</Label>
          <Input className="w-full" type="number" value={formData.time_to_test} onChange={(e) => handleChange("time_to_test", e.target.value)} disabled={inputsDisabled} />
        </div>
        <div>
          <Label>TT Number</Label>
          <Input className="w-full" value={formData.tt_number} onChange={(e) => handleChange("tt_number", e.target.value)} disabled={inputsDisabled} />
        </div>
      </div>

      <div>
        <Label>Team Lead</Label>
        <Input className="w-full" value={formData.team_lead} onChange={(e) => handleChange("team_lead", e.target.value)} disabled={inputsDisabled} />
      </div>

      <div>
        <Label>Team Manager</Label>
        <Input className="w-full" value={formData.team_manager} onChange={(e) => handleChange("team_manager", e.target.value)} disabled={inputsDisabled} />
      </div>

      <div className="flex gap-2 mt-2">
        {drawerMode === "view" ? (
          <>
            <Button
              onClick={() => {
                setDrawerMode("edit");
              }}
              className="flex-1 min-h-[44px]"
            >
              Edit
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDrawerOpen(false);
              }}
              className="min-h-[44px]"
            >
              Close
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleSubmit} disabled={submitting || !escalation} className="flex-1 min-h-[44px]">
              {submitting ? "Saving..." : "Save RCA"}
            </Button>
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={submitting} className="min-h-[44px]">
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      {/* Top header and provider tabs */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">{headerTitle}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Viewing reports for <strong>{provider.toUpperCase()}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Tabs value={provider} onValueChange={(v) => setProvider(v as Provider)}>
            <TabsList>
              <TabsTrigger value="mtn">MTN</TabsTrigger>
              <TabsTrigger value="airtel">Airtel</TabsTrigger>
              <TabsTrigger value="glo">GLO</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                const mounted = { val: true };
                fetchAllResolvedReports(mounted, provider);
              }}
            >
              Refresh
            </Button>

            <Button size="sm" onClick={exportRcaFormsAsExcel} aria-label="Download RCA forms as Excel">
              Download RCA Forms
            </Button>
          </div>
        </div>
      </div>

      {/* Reports list (clean, grouped, premium feel) */}
      <div className="grid gap-4">
        {reports.length === 0 && <Card><CardContent>No resolved reports.</CardContent></Card>}

        {reports.map((r) => {
          const esc = (r as any).escalation as Partial<Escalation> | undefined;
          const ticket = esc?.ticket_id ?? "";
          const linkLabel = formatEscalationLink(esc ?? null);

          const rcaEmbedded: RcaFormRow | undefined =
            esc && Array.isArray((esc as any).rca_forms) && (esc as any).rca_forms.length ? (esc as any).rca_forms[0] as RcaFormRow : undefined;
          const hasRca = !!rcaEmbedded;
          const mttr = r.status === "resolved" ? computeReportMttr(r) : null;

          return (
            <Card key={r.id} className="p-4 shadow-sm">
              <div className="flex flex-col md:flex-row md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-sm font-medium">{r.issue_description ?? "No description"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {r.created_at ? format(new Date(r.created_at), "PPp") : "—"} • Status: <strong>{r.status}</strong>
                        {ticket && <> • Ticket: {ticket}</>}
                        {linkLabel && <> • Link: {linkLabel}</>}
                      </div>
                    </div>

                    <div className="ml-auto hidden sm:flex items-center gap-2">
                      {mttr && (
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">MTTR</div>
                          <div className="text-sm font-semibold">{mttr.human}</div>
                          <div className="text-xs">
                            <span className={mttr.status === "Within MTTR" ? "text-green-600" : "text-red-600"}>{mttr.status}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Small summary preview of stages */}
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 border rounded-lg bg-gray-50">
                      <div className="text-xs text-muted-foreground">Create</div>
                      <div className="text-sm font-medium mt-1">{r.issue_description ?? "—"}</div>
                      <div className="text-xs text-muted-foreground mt-1">By: {r.reported_by ?? "—"}</div>
                    </div>

                    <div className="p-3 border rounded-lg bg-white">
                      <div className="text-xs text-muted-foreground">In Progress</div>
                      <div className="text-sm mt-1">{(r as any).status_notes ? (r as any).status_notes : <span className="text-muted-foreground">No notes</span>}</div>
                    </div>

                    <div className="p-3 border rounded-lg bg-white">
                      <div className="text-xs text-muted-foreground">Resolved</div>
                      <div className="text-sm mt-1">{r.resolution_notes ?? <span className="text-muted-foreground">No resolution notes</span>}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end gap-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleViewRca(r)} disabled={!r.escalation_id}>
                      View RCA
                    </Button>
                    <Button size="sm" onClick={() => handleOpenCreateForReport(r)} disabled={hasRca}>
                      {hasRca ? "RCA exists" : "Create RCA"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleEditRca(r)} disabled={!r.escalation_id}>
                      Edit RCA
                    </Button>
                  </div>

                  {/* MTTR visible on mobile as well */}
                  {mttr && (
                    <div className="mt-2 md:mt-4 text-right">
                      <div className="text-xs text-muted-foreground">MTTR</div>
                      <div className="text-sm font-semibold">{mttr.human}</div>
                      <div className="text-xs">
                        <span className={mttr.status === "Within MTTR" ? "text-green-600" : "text-red-600"}>{mttr.status}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Expandable detailed view (button toggles drawer) */}
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedReport(r);
                    setSelectedRca(null);
                    setDrawerMode("report"); // open the report viewer mode (full report)
                    setDrawerOpen(true);
                  }}
                >
                  View details
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Drawer: RCA form / Report viewer */}
      <Drawer open={drawerOpen} onOpenChange={(open) => setDrawerOpen(open)}>
        <DrawerContent className="h-full">
          <DrawerHeader>
            <DrawerTitle>
              {drawerMode === "report"
                ? selectedReport
                  ? `Report — ${selectedReport.id}`
                  : "Report"
                : escalation
                ? `${drawerMode === "create" ? "Create RCA" : drawerMode === "view" ? "View RCA" : "Edit RCA"} — ${escalation.ticket_id ?? "Unknown"}${escalationLinkLabel ? ` — ${escalationLinkLabel}` : ""}`
                : drawerMode === "create"
                ? "Create RCA"
                : drawerMode === "view"
                ? "View RCA"
                : "Edit RCA"}
            </DrawerTitle>
            <DrawerDescription>
              {drawerMode === "report"
                ? "Viewing report details"
                : drawerMode === "view"
                ? "Viewing submitted RCA"
                : drawerMode === "edit"
                ? "Edit RCA"
                : "Create RCA"}
            </DrawerDescription>
          </DrawerHeader>

          <div className="p-4 overflow-auto max-h-[80vh]">
            {drawerMode === "report" && selectedReport ? (
              <>
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">Report details</h3>
                  <div className="text-sm text-muted-foreground">ID: {selectedReport.id} • Status: {selectedReport.status}</div>
                </div>

                <ReportDetailPanel r={selectedReport} />

                <div className="mt-4 flex gap-2">
                  <Button onClick={() => handleOpenCreateForReport(selectedReport)} disabled={!!((selectedReport as any).escalation && Array.isArray(((selectedReport as any).escalation).rca_forms) && ((selectedReport as any).escalation).rca_forms.length > 0)}>
                    Create RCA
                  </Button>
                  <Button variant="outline" onClick={() => selectedReport && handleViewRca(selectedReport)}>View RCA</Button>
                  <Button variant="ghost" onClick={() => selectedReport && handleEditRca(selectedReport)}>Edit RCA</Button>
                </div>
              </>
            ) : drawerMode === "create" ? (
              // Create mode: always show form (prefilled)
              <>
                <h3 className="text-lg font-semibold mb-2">Create RCA</h3>
                {RcaFormUI}
              </>
            ) : (drawerMode === "view" || drawerMode === "edit") ? (
              // View/Edit mode: show RCA form. If selectedRca exists use it, otherwise show a helpful message
              selectedRca ? (
                <>
                  <h3 className="text-lg font-semibold mb-2">{drawerMode === "view" ? "View RCA" : "Edit RCA"}</h3>
                  {RcaFormUI}
                </>
              ) : (
                <div>
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">No RCA found</h3>
                    <div className="text-sm text-muted-foreground">There is no RCA associated with this escalation yet.</div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => setDrawerMode("create")}>Create RCA</Button>
                    <Button variant="outline" onClick={() => setDrawerOpen(false)}>Close</Button>
                  </div>
                </div>
              )
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-2">RCA</h3>
                {RcaFormUI}
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Image modal (simple lightweight viewer) */}
      {imageModalUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setImageModalUrl(null)}
        >
          <div className="max-w-3xl w-full bg-white rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-2 flex items-center justify-between border-b">
              <div className="text-sm font-medium">Image preview</div>
              <div className="flex gap-2">
                <a href={imageModalUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                  Open
                </a>
                <a
                  href={imageModalUrl}
                  download
                  className="text-sm underline"
                >
                  Download
                </a>
                <button className="text-sm" onClick={() => setImageModalUrl(null)}>Close</button>
              </div>
            </div>
            <div className="p-4">
              <img src={imageModalUrl} alt="preview" className="w-full h-auto object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
