// src/pages/Analytics.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import {
  TrendingUp,
  AlertTriangle,
  FileText,
  CheckCircle,
  Play,
  Timer,
} from "lucide-react";
import {
  Report as ReportType,
  Escalation as EscalationType,
  EscalationStatus,
  ProviderType,
} from "@/types/database";

/**
 * Analytics.tsx
 * - Dark-mode friendly
 * - Provider-aware Area dropdown (Airtel: LGA, MTN: State)
 * - Click a bar in Links-by-Area to filter
 * - Exports CSV for currently filtered reports (with area suffix)
 * - Uses airtel_sites + mtn_sites mapping for area lookups
 */

// --- Local types
type RcaFormLite = {
  id: string;
  escalation_id: string | null;
  start_time?: string | null;
  end_time?: string | null;
  mttr_used?: number | null;
  mttr_status?: string | null;
  ofc?: string | null;
  jc?: string | null;
};

// --- Utilities
function toDateKey(dt: string | Date) {
  const d = typeof dt === "string" ? new Date(dt) : dt;
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function hoursBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  return (e.getTime() - s.getTime()) / (1000 * 60 * 60);
}

function formatHoursToHMS(hours?: number | null) {
  if (hours === null || typeof hours !== "number") return "—";
  const totalSeconds = Math.round(Math.max(0, hours) * 3600);
  const hh = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const mm = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function Analytics(): JSX.Element {
  // Raw datasets
  const [reports, setReports] = useState<ReportType[]>([]);
  const [escalations, setEscalations] = useState<EscalationType[]>([]);
  const [rcas, setRcas] = useState<RcaFormLite[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; full_name?: string | null; email?: string | null }[]>([]);
  const [airtelSites, setAirtelSites] = useState<any[]>([]);
  const [mtnSites, setMtnSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Global filters
  const [fromDate, setFromDate] = useState<string>(
    new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10)
  );
  const [toDate, setToDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [filterProvider, setFilterProvider] = useState<ProviderType | "all">("all");
  const [criticalOnly, setCriticalOnly] = useState<boolean>(false);

  // provider-prefixed selected area (e.g., "airtel::Ikeja" or "mtn::Lagos")
  const [selectedArea, setSelectedArea] = useState<string>("");

  // theme detection for charts (dark/light)
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });

  // chart color palette (auto-switch based on theme)
  const chartColors = useMemo(() => {
    if (isDark) {
      return {
        positive: "#34D399", // green
        warning: "#FBBF24", // amber
        danger: "#F87171", // red
        accent: "#60A5FA", // blue
        purple: "#8B5CF6",
        grid: "rgba(255,255,255,0.06)",
        text: "#E6EEF8",
      };
    }
    return {
      positive: "#10B981",
      warning: "#F59E0B",
      danger: "#EF4444",
      accent: "#3B82F6",
      purple: "#7C3AED",
      grid: "rgba(15,23,42,0.06)",
      text: "#0F172A",
    };
  }, [isDark]);

  useEffect(() => {
    // listen for theme changes
    const m = window.matchMedia?.("(prefers-color-scheme: dark)");
    const handler = (ev: MediaQueryListEvent) => setIsDark(ev.matches);
    if (m && "addEventListener" in m) m.addEventListener("change", handler);
    else if (m && "addListener" in m) (m as any).addListener(handler);
    return () => {
      if (m && "removeEventListener" in m) m.removeEventListener("change", handler);
      else if (m && "removeListener" in m) (m as any).removeListener(handler);
    };
  }, []);

  // --- Fetch & subscribe to Supabase tables
  useEffect(() => {
    let isSubscribed = true;

    const normalizeReports = (raw: any[]): ReportType[] =>
      Array.isArray(raw)
        ? raw.map((r: any) => ({
            id: String(r.id),
            escalation_id: r.escalation_id ?? null,
            issue_description: r.issue_description ?? "",
            reported_by: r.reported_by ?? null,
            contact_info: r.contact_info ?? null,
            is_critical: !!r.is_critical,
            image_url: r.image_url ?? null,
            resolution_photos: Array.isArray(r.resolution_photos) ? r.resolution_photos : null,
            staff_lat: typeof r.staff_lat === "number" ? r.staff_lat : null,
            staff_lng: typeof r.staff_lng === "number" ? r.staff_lng : null,
            status: (r.status as EscalationStatus) ?? "pending",
            status_notes: r.status_notes ?? null,
            resolution_notes: r.resolution_notes ?? null,
            created_by: r.created_by ?? null,
            created_at: r.created_at ?? new Date().toISOString(),
            updated_at: r.updated_at ?? new Date().toISOString(),
            cof: r.cof ?? null,
            pof: r.pof ?? null,
          }))
        : [];

    const normalizeEsc = (raw: any[]): EscalationType[] =>
      Array.isArray(raw)
        ? raw.map((e: any) => ({
            id: String(e.id),
            provider: (e.provider as ProviderType) ?? "mtn",
            site_a_id: e.site_a_id ?? "",
            site_b_id: e.site_b_id ?? "",
            link_id: e.link_id ?? "",
            ticket_id: e.ticket_id ?? "",
            mttr_hours: typeof e.mttr_hours === "number" ? e.mttr_hours : null,
            technician_lat: typeof e.technician_lat === "number" ? e.technician_lat : null,
            technician_lng: typeof e.technician_lng === "number" ? e.technician_lng : null,
            status: (e.status as EscalationStatus) ?? "pending",
            has_report: !!e.has_report,
            created_by: e.created_by ?? null,
            created_at: e.created_at ?? new Date().toISOString(),
            updated_at: e.updated_at ?? new Date().toISOString(),
            cof: e.cof ?? null,
            pof: e.pof ?? null,
            team_lead: e.team_lead ?? null,
            ...e,
          }))
        : [];

    const normalizeRcas = (raw: any[]): RcaFormLite[] =>
      Array.isArray(raw)
        ? raw.map((r: any) => ({
            id: String(r.id),
            escalation_id: r.escalation_id ?? null,
            start_time: r.start_time ?? null,
            end_time: r.end_time ?? null,
            mttr_used: typeof r.mttr_used === "number" ? r.mttr_used : null,
            mttr_status: r.mttr_status ?? null,
            ofc: typeof r.ofc === "string" ? r.ofc : r.ofc ?? null,
            jc: r.jc ?? null,
          }))
        : [];

    const fetchData = async () => {
      setLoading(true);
      try {
        const [
          { data: rawReports, error: reportError },
          { data: rawEscs, error: escError },
          { data: rawRcas, error: rcaError },
          { data: rawProfiles, error: profilesError },
          { data: rawAirtelSites, error: airtelSitesError },
          { data: rawMtnSites, error: mtnSitesError },
        ] = await Promise.all([
          supabase.from("reports").select("*"),
          supabase.from("escalations").select("*"),
          supabase.from("rca_forms").select("id, escalation_id, start_time, end_time, mttr_used, mttr_status, ofc, jc"),
          supabase.from("profiles").select("id, full_name, email"),
          supabase.from("airtel_sites").select("*"),
          supabase.from("mtn_sites").select("*"),
        ]);

        if (reportError) throw reportError;
        if (escError) throw escError;
        if (airtelSitesError) console.warn("airtel_sites fetch warning:", airtelSitesError);
        if (mtnSitesError) console.warn("mtn_sites fetch warning:", mtnSitesError);
        if (rcaError) console.warn("rca fetch warning:", rcaError);
        if (profilesError) console.warn("profiles fetch warning:", profilesError);

        if (isSubscribed) {
          setReports(normalizeReports(Array.isArray(rawReports) ? rawReports : []));
          setEscalations(normalizeEsc(Array.isArray(rawEscs) ? rawEscs : []));
          setRcas(normalizeRcas(Array.isArray(rawRcas) ? rawRcas : []));
          setProfiles(Array.isArray(rawProfiles) ? rawProfiles.map((p: any) => ({ id: String(p.id), full_name: p.full_name ?? null, email: p.email ?? null })) : []);
          setAirtelSites(Array.isArray(rawAirtelSites) ? rawAirtelSites : []);
          setMtnSites(Array.isArray(rawMtnSites) ? rawMtnSites : []);
        }
      } catch (err) {
        console.error("Failed to fetch analytics data:", err);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    };

    fetchData();

    // subscribe for realtime updates
    const channel = supabase
      .channel("analytics-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "escalations" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "rca_forms" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "airtel_sites" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "mtn_sites" }, () => fetchData())
      .subscribe();

    return () => {
      isSubscribed = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // --- Build siteId -> area maps (robust to different key names)
  const buildSiteId = (s: any) => {
    if (!s) return "";
    const candidates = [s.site_id, s["SITE ID"], s.siteId, s.id, s.site_name, s["Site ID"], s["Site A"]];
    const found = candidates.find((c) => c !== undefined && c !== null && String(c).trim() !== "");
    return found ? String(found).trim() : "";
  };

  const airtelSiteIdToArea = useMemo(() => {
    const map: Record<string, string> = {};
    const getLga = (s: any) => {
      if (!s) return "Unknown";
      const candidates = [s.LGA, s.lga, s["Local Government"], s.local_government, s.LOCAL_GOV];
      const found = candidates.find((c) => c !== undefined && c !== null && String(c).trim() !== "");
      return found ? String(found).trim() : "Unknown";
    };
    airtelSites.forEach((s: any) => {
      const id = buildSiteId(s);
      if (!id) return;
      map[id] = getLga(s);
    });
    return map;
  }, [airtelSites]);

  const mtnSiteIdToArea = useMemo(() => {
    const map: Record<string, string> = {};
    const getState = (s: any) => {
      if (!s) return "Unknown";
      const candidates = [s.state, s.STATE, s["State"], s.region];
      const found = candidates.find((c) => c !== undefined && c !== null && String(c).trim() !== "");
      return found ? String(found).trim() : "Unknown";
    };
    mtnSites.forEach((s: any) => {
      const id = buildSiteId(s);
      if (!id) return;
      map[id] = getState(s);
    });
    return map;
  }, [mtnSites]);

  // --- Selected area helpers
  const parseSelectedArea = (sel: string | null) => {
    if (!sel) return null;
    const parts = sel.split("::");
    if (parts.length === 2) return { provider: parts[0], area: parts[1] };
    return { provider: null, area: sel };
  };

  const escalationMatchesSelectedArea = (esc: EscalationType, sel: string | null) => {
    if (!sel) return true;
    const parsed = parseSelectedArea(sel);
    if (!parsed) return true;
    const siteIds = [ (esc as any).site_a_id, (esc as any).site_b_id ].filter(Boolean).map(String).map(s => s.trim());
    if (parsed.provider) {
      if ((esc as any).provider !== parsed.provider) return false;
      const areaMap = parsed.provider === "airtel" ? airtelSiteIdToArea : parsed.provider === "mtn" ? mtnSiteIdToArea : {};
      return siteIds.some(sid => (areaMap[sid] ?? "Unknown") === parsed.area);
    } else {
      return siteIds.some(sid => (airtelSiteIdToArea[sid] ?? "Unknown") === parsed.area || (mtnSiteIdToArea[sid] ?? "Unknown") === parsed.area);
    }
  };

  // --- Base filters (date + provider)
  const filteredEscalationsBase = useMemo(() => {
    return escalations.filter((e) => {
      const createdKey = toDateKey(e.created_at);
      if (createdKey === "Unknown") return false;
      if (createdKey < fromDate || createdKey > toDate) return false;
      if (filterProvider !== "all" && e.provider !== filterProvider) return false;
      return true;
    });
  }, [escalations, fromDate, toDate, filterProvider]);

  // apply area selection to escalations (when area is selected)
  const filteredEscalations = useMemo(() => {
    if (!selectedArea) return filteredEscalationsBase;
    return filteredEscalationsBase.filter((e) => escalationMatchesSelectedArea(e, selectedArea));
  }, [filteredEscalationsBase, selectedArea, airtelSiteIdToArea, mtnSiteIdToArea]);

  // reports filter (date/provider/critical + area via escalation mapping)
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const createdKey = toDateKey(r.created_at);
      if (createdKey === "Unknown") return false;
      if (createdKey < fromDate || createdKey > toDate) return false;
      if (criticalOnly && !r.is_critical) return false;
      if (filterProvider !== "all" && r.escalation_id) {
        const esc = escalations.find((x) => String(x.id) === String(r.escalation_id));
        if (esc && esc.provider !== filterProvider) return false;
      }
      if (selectedArea) {
        if (!r.escalation_id) return false;
        const esc = escalations.find((x) => String(x.id) === String(r.escalation_id));
        if (!esc) return false;
        if (!escalationMatchesSelectedArea(esc, selectedArea)) return false;
      }
      return true;
    });
  }, [reports, fromDate, toDate, criticalOnly, filterProvider, escalations, selectedArea, airtelSiteIdToArea, mtnSiteIdToArea]);

  // rcas filter (date/provider/area)
  const filteredRcas = useMemo(() => {
    return rcas.filter((r) => {
      if (!r.start_time) return false;
      const day = toDateKey(r.start_time);
      if (day === "Unknown") return false;
      if (day < fromDate || day > toDate) return false;
      if (filterProvider !== "all" && r.escalation_id) {
        const esc = escalations.find((e) => String(e.id) === String(r.escalation_id));
        if (esc && esc.provider !== filterProvider) return false;
      }
      if (selectedArea && r.escalation_id) {
        const esc = escalations.find((e) => String(e.id) === String(r.escalation_id));
        if (!esc) return false;
        if (!escalationMatchesSelectedArea(esc, selectedArea)) return false;
      }
      if (selectedArea && !r.escalation_id) return false;
      return true;
    });
  }, [rcas, fromDate, toDate, filterProvider, escalations, selectedArea, airtelSiteIdToArea, mtnSiteIdToArea]);

  // --- Core metrics
  const counts = useMemo(() => {
    const total = filteredReports.length;
    const critical = filteredReports.filter((r) => r.is_critical).length;
    const pending = filteredReports.filter((r) => r.status === "pending").length;
    const inProgress = filteredReports.filter((r) => r.status === "in_progress").length;
    const resolved = filteredReports.filter((r) => r.status === "resolved").length;
    return { total, critical, pending, inProgress, resolved };
  }, [filteredReports]);

  const statusDistribution = useMemo(() => {
    return [
      { name: "Pending", value: filteredReports.filter((r) => r.status === "pending").length, color: chartColors.danger },
      { name: "In Progress", value: filteredReports.filter((r) => r.status === "in_progress").length, color: chartColors.warning },
      { name: "Resolved", value: filteredReports.filter((r) => r.status === "resolved").length, color: chartColors.positive },
    ];
  }, [filteredReports, chartColors]);

  const incidentsOverTime = useMemo(() => {
    const map: Record<string, number> = {};
    filteredReports.forEach((r) => {
      const day = toDateKey(r.created_at);
      map[day] = (map[day] || 0) + 1;
    });
    return Object.entries(map).map(([day, count]) => ({ day, count })).sort((a, b) => (a.day > b.day ? 1 : -1));
  }, [filteredReports]);

  const linksByArea = useMemo(() => {
    // count areas from filteredEscalationsBase (so chart shows the available area distribution for date/provider)
    const map: Record<string, number> = {};
    filteredEscalationsBase.forEach((e) => {
      const siteIds = [ (e as any).site_a_id, (e as any).site_b_id ].filter(Boolean).map(String).map(s => s.trim());
      const seen = new Set<string>();
      siteIds.forEach(sid => {
        const lga = airtelSiteIdToArea[sid] ?? null;
        if (lga && lga !== "Unknown") {
          const key = `airtel::${lga}`;
          if (!seen.has(key)) { seen.add(key); map[key] = (map[key] || 0) + 1; }
        }
        const state = mtnSiteIdToArea[sid] ?? null;
        if (state && state !== "Unknown") {
          const key = `mtn::${state}`;
          if (!seen.has(key)) { seen.add(key); map[key] = (map[key] || 0) + 1; }
        }
      });
      if (siteIds.length === 0) {
        map["unknown::Unknown"] = (map["unknown::Unknown"] || 0) + 1;
      }
    });
    return Object.entries(map).map(([k, v]) => {
      const [prov, area] = k.split("::");
      return { value: k, provider: prov, area, count: v };
    }).sort((a, b) => b.count - a.count);
  }, [filteredEscalationsBase, airtelSiteIdToArea, mtnSiteIdToArea]);

  // MTTR / SLA
  const mttrByProvider = useMemo(() => {
    const providerAccumulator: Record<string, { totalHours: number; count: number }> = {};
    filteredRcas.forEach((r) => {
      if (!r.start_time || !r.end_time || !r.escalation_id) return;
      const hrs = hoursBetween(r.start_time, r.end_time);
      if (hrs === null) return;
      const esc = escalations.find((e) => String(e.id) === String(r.escalation_id));
      const provider = esc?.provider || "unknown";
      if (!providerAccumulator[provider]) providerAccumulator[provider] = { totalHours: 0, count: 0 };
      providerAccumulator[provider].totalHours += hrs;
      providerAccumulator[provider].count += 1;
    });
    return Object.entries(providerAccumulator).map(([provider, v]) => ({ provider, avgMttrHours: v.totalHours / v.count }));
  }, [filteredRcas, escalations]);

  const avgMttrOverall = useMemo(() => {
    const allHrs: number[] = filteredRcas.map((r) => hoursBetween(r.start_time, r.end_time)).filter((h): h is number => typeof h === "number");
    if (allHrs.length === 0) return null;
    const sum = allHrs.reduce((s, a) => s + a, 0);
    return sum / allHrs.length;
  }, [filteredRcas]);

  const slaCompliance = useMemo(() => {
    let within = 0;
    let total = 0;
    filteredRcas.forEach((r) => {
      if (!r.start_time || !r.end_time || !r.escalation_id) return;
      const hrs = hoursBetween(r.start_time, r.end_time);
      if (hrs === null) return;
      const esc = escalations.find((e) => String(e.id) === String(r.escalation_id));
      const limit = esc?.mttr_hours ?? 3;
      total += 1;
      if (hrs <= limit) within += 1;
    });
    if (total === 0) return null;
    return { within, total, percent: (within / total) * 100 };
  }, [filteredRcas, escalations]);

  // OFC & JC metrics
  const ofcMetrics = useMemo(() => {
    const total = filteredRcas.length;
    if (total === 0) return { percentWithOFC: null, avgJC: null, jcBuckets: { "0-2": 0, "3-5": 0, "6+": 0 } };
    let withOFC = 0;
    let jcSum = 0;
    let jcCount = 0;
    const buckets = { "0-2": 0, "3-5": 0, "6+": 0 };
    filteredRcas.forEach((r) => {
      if (r.ofc && String(r.ofc).trim() !== "") withOFC += 1;
      const jcNum = (() => {
        if (r.jc === null || r.jc === undefined) return 0;
        const parsed = parseInt(String(r.jc).replace(/[^0-9\-]/g, ""), 10);
        if (Number.isNaN(parsed)) return 0;
        return parsed;
      })();
      jcSum += jcNum;
      jcCount += 1;
      if (jcNum <= 2) buckets["0-2"] += 1;
      else if (jcNum <= 5) buckets["3-5"] += 1;
      else buckets["6+"] += 1;
    });
    return { percentWithOFC: (withOFC / total) * 100, avgJC: jcCount === 0 ? null : jcSum / jcCount, jcBuckets: buckets };
  }, [filteredRcas]);

  const ofcByAirtelZone = useMemo(() => {
    const map: Record<string, number> = {};
    filteredRcas.forEach((r) => {
      if (!r.ofc || String(r.ofc).trim() === "") return;
      const esc = escalations.find((e) => String(e.id) === String(r.escalation_id));
      if (!esc) return;
      if (esc.provider !== "airtel") return;
      const siteIds = [esc.site_a_id, esc.site_b_id].filter(Boolean).map(String);
      const zonesSeen = new Set<string>();
      siteIds.forEach((sid) => {
        const site = airtelSites.find((s) => {
          if (!s) return false;
          const sidStr = String(sid).trim();
          return String(s.site_id ?? s["SITE ID"] ?? s.site_name ?? "").trim() === sidStr;
        });
        let zone = (site && (site["AIRTEL ZONE"] || site.airtel_zone || site["Airtel Zone"] || site["AIRTEL_ZONE"])) || "Unknown";
        zone = (zone ?? "Unknown").toString();
        if (!zonesSeen.has(zone)) {
          zonesSeen.add(zone);
          map[zone] = (map[zone] || 0) + 1;
        }
      });
      if (siteIds.length === 0) map["Unknown"] = (map["Unknown"] || 0) + 1;
    });
    return Object.entries(map).map(([zone, count]) => ({ zone, count })).sort((a, b) => b.count - a.count);
  }, [filteredRcas, escalations, airtelSites]);

  // tech leaderboard
  const techLeaderboard = useMemo(() => {
    const resolvedReports = filteredReports.filter((r) => r.status === "resolved");
    const profilesById: Record<string, string> = {};
    profiles.forEach((p) => {
      profilesById[String(p.id)] = p.full_name ?? p.email ?? String(p.id);
    });
    type Acc = { count: number; mttrSum: number; mttrCount: number; withinSla: number; slaTotal: number };
    const map: Record<string, Acc> = {};
    resolvedReports.forEach((r) => {
      const esc = escalations.find((e) => String(e.id) === String(r.escalation_id));
      let leaderKey = "";
      if (esc) {
        const tl: any = (esc as any).team_lead;
        if (typeof tl === "string" && tl.trim() !== "") leaderKey = tl;
        else if ((esc as any).team_lead_id) leaderKey = String((esc as any).team_lead_id);
      }
      if (!leaderKey) leaderKey = (r as any).created_by ? String((r as any).created_by) : "Unassigned";
      const display = profilesById[leaderKey] ?? (leaderKey && leaderKey !== "Unassigned" && leaderKey.length <= 36 ? (profilesById[leaderKey] ?? leaderKey) : leaderKey) ?? "Unassigned";
      if (!map[display]) map[display] = { count: 0, mttrSum: 0, mttrCount: 0, withinSla: 0, slaTotal: 0 };
      map[display].count += 1;
      const rca = filteredRcas.find((x) => String(x.escalation_id) === String(esc?.id)) ?? rcas.find((x) => String(x.escalation_id) === String(esc?.id));
      if (rca && rca.start_time && rca.end_time) {
        const hrs = hoursBetween(rca.start_time, rca.end_time);
        if (hrs !== null) {
          map[display].mttrSum += hrs;
          map[display].mttrCount += 1;
          const limit = esc?.mttr_hours ?? 3;
          map[display].slaTotal += 1;
          if (hrs <= limit) map[display].withinSla += 1;
        }
      }
    });
    const arr = Object.entries(map).map(([lead, acc]) => {
      const avgMttrHours = acc.mttrCount > 0 ? acc.mttrSum / acc.mttrCount : null;
      const slaPercent = acc.slaTotal > 0 ? (acc.withinSla / acc.slaTotal) * 100 : null;
      return { lead, count: acc.count, avgMttrHours, slaPercent };
    });
    arr.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const as = a.slaPercent ?? -1; const bs = b.slaPercent ?? -1;
      return bs - as;
    });
    return arr.slice(0, 10);
  }, [filteredReports, escalations, profiles, filteredRcas, rcas]);

  const alerts = useMemo(() => {
    const out: string[] = [];
    const criticalOpen = filteredReports.filter((r) => r.is_critical && r.status !== "resolved");
    criticalOpen.forEach((r) => out.push(`Critical: ${r.issue_description?.slice(0, 80) || r.id}`));
    filteredRcas.forEach((r) => {
      if (!r.start_time || !r.end_time || !r.escalation_id) return;
      const hrs = hoursBetween(r.start_time, r.end_time);
      if (hrs === null) return;
      const esc = escalations.find((e) => String(e.id) === String(r.escalation_id));
      const limit = esc?.mttr_hours ?? 3;
      if (hrs > limit) out.push(`MTTR Breach: ${esc?.link_id ?? esc?.id ?? r.escalation_id} - ${formatHoursToHMS(hrs)}`);
    });
    return out.slice(0, 50);
  }, [filteredReports, filteredRcas, escalations]);

  // --- Area dropdown options: auto-filter when provider is selected
  const areaOptionsAll = useMemo(() => {
    const set = new Set<string>();
    Object.values(airtelSiteIdToArea).forEach((v) => { if (v && v !== "Unknown") set.add(`airtel::${v}`); });
    Object.values(mtnSiteIdToArea).forEach((v) => { if (v && v !== "Unknown") set.add(`mtn::${v}`); });
    return Array.from(set).sort((a, b) => {
      const [, aa] = a.split("::"); const [, bb] = b.split("::");
      return aa.localeCompare(bb);
    });
  }, [airtelSiteIdToArea, mtnSiteIdToArea]);

  const areaOptions = useMemo(() => {
    if (filterProvider === "all") return areaOptionsAll;
    return areaOptionsAll.filter((v) => v.startsWith(`${filterProvider}::`));
  }, [areaOptionsAll, filterProvider]);

  const escalationsInSelectedArea = useMemo(() => {
    if (!selectedArea) return [];
    return filteredEscalationsBase.filter((e) => escalationMatchesSelectedArea(e, selectedArea));
  }, [selectedArea, filteredEscalationsBase, airtelSiteIdToArea, mtnSiteIdToArea]);

  // --- CSV export
  const exportReportsCsv = () => {
    const header = [
      "id",
      "escalation_id",
      "created_at",
      "status",
      "is_critical",
      "reported_by",
      "contact_info",
      "issue_description",
    ];
    const rows = filteredReports.map((r) => [
      r.id,
      r.escalation_id ?? "",
      r.created_at,
      r.status,
      String(r.is_critical),
      r.reported_by ?? "",
      r.contact_info ?? "",
      `"${(r.issue_description || "").replace(/"/g, '""')}"`,
    ]);
    const areaSuffix = selectedArea ? `_${selectedArea.replace("::", "_")}` : "";
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reports_${fromDate}_to_${toDate}${areaSuffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: chartColors.accent }} />
      </div>
    );
  }

  const slaColor = (pct: number | null) => {
    if (pct === null) return chartColors.warning;
    if (pct >= 80) return chartColors.positive;
    if (pct >= 50) return chartColors.warning;
    return chartColors.danger;
  };

  // --- Render
  return (
    <div className="p-6 space-y-6 text-slate-900 dark:text-slate-100">
      <div>
        <h2 className="text-2xl font-semibold">Analytics Dashboard</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Reports & escalations — use filters to drill down</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center">
        <div className="flex gap-2 items-center">
          <label className="text-sm">From</label>
          <input className="input input-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>

        <div className="flex gap-2 items-center">
          <label className="text-sm">To</label>
          <input className="input input-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>

        <div className="flex gap-2 items-center">
          <label className="text-sm">Provider</label>
          <select className="input input-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" value={filterProvider} onChange={(e) => { setFilterProvider(e.target.value as any); setSelectedArea(""); }}>
            <option value="all">All</option>
            <option value="mtn">MTN</option>
            <option value="airtel">Airtel</option>
            <option value="glo">Glo</option>
          </select>
        </div>

        <div className="flex gap-2 items-center">
          <label className="text-sm">Critical only</label>
          <input type="checkbox" checked={criticalOnly} onChange={(e) => setCriticalOnly(e.target.checked)} />
        </div>

        <div className="flex gap-2 items-center">
          <label className="text-sm">Area</label>
          <select
            className="input input-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
          >
            <option value="">All</option>
            {areaOptions.map((val) => {
              const [prov, area] = val.split("::");
              const label = `${area} (${prov.toUpperCase()})`;
              return <option key={val} value={val}>{label}</option>;
            })}
          </select>
        </div>

        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={exportReportsCsv}>Export CSV</button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setFromDate(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0,10));
              setToDate(new Date().toISOString().slice(0,10));
              setFilterProvider("all");
              setCriticalOnly(false);
              setSelectedArea("");
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
        <Card className="lg:col-span-1 bg-white dark:bg-slate-800">
          <CardHeader className="flex justify-between pb-2">
            <CardTitle className="text-sm">Total Reports</CardTitle>
            <FileText className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.total}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{counts.critical} critical</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 bg-white dark:bg-slate-800">
          <CardHeader className="flex justify-between pb-2">
            <CardTitle className="text-sm">Avg MTTR</CardTitle>
            <Timer className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHoursToHMS(avgMttrOverall)}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">By provider: {mttrByProvider.map(m=> `${m.provider}:${formatHoursToHMS(m.avgMttrHours)}`).join(' • ')}</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 bg-white dark:bg-slate-800">
          <CardHeader className="flex justify-between pb-2">
            <CardTitle className="text-sm">SLA Compliance</CardTitle>
            <CheckCircle className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{slaCompliance ? `${slaCompliance.percent.toFixed(1)}%` : "—"}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Within MTTR: {slaCompliance ? `${slaCompliance.within}/${slaCompliance.total}` : '—'}</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 bg-white dark:bg-slate-800">
          <CardHeader className="flex justify-between pb-2">
            <CardTitle className="text-sm">Open / Resolved</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.inProgress} / {counts.resolved}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">In progress / Resolved</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 bg-white dark:bg-slate-800">
          <CardHeader className="flex justify-between pb-2">
            <CardTitle className="text-sm">% Incidents with OFC</CardTitle>
            <AlertTriangle className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ofcMetrics.percentWithOFC !== null ? `${ofcMetrics.percentWithOFC.toFixed(1)}%` : '—'}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Based on RCA forms</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 bg-white dark:bg-slate-800">
          <CardHeader className="flex justify-between pb-2">
            <CardTitle className="text-sm">Avg JC per Incident</CardTitle>
            <Play className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ofcMetrics.avgJC !== null ? ofcMetrics.avgJC.toFixed(2) : '—'}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Average joint closures</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-white dark:bg-slate-800">
          <CardHeader>
            <CardTitle>Incidents Over Time</CardTitle>
            <CardDescription>Reports per day</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={incidentsOverTime}>
                <CartesianGrid stroke={chartColors.grid} />
                <XAxis dataKey="day" stroke={chartColors.text} />
                <YAxis stroke={chartColors.text} />
                <Tooltip wrapperStyle={{ background: isDark ? "#0f1720" : "#fff" }} />
                <Line type="monotone" dataKey="count" stroke={chartColors.accent} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-800">
          <CardHeader>
            <CardTitle>Report Status Distribution</CardTitle>
            <CardDescription>Breakdown of report statuses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  dataKey="value"
                >
                  {statusDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip wrapperStyle={{ background: isDark ? "#0f1720" : "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Links by Area + OFC by Airtel Zone */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-white dark:bg-slate-800">
          <CardHeader>
            <CardTitle>Links by Area</CardTitle>
            <CardDescription>Counts by LGA (Airtel) / State (MTN). Click a bar to filter.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={linksByArea.map(x => ({ label: `${x.area} (${x.provider.toUpperCase()})`, value: x.count, raw: x }))}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload[0] && e.activePayload[0].payload && e.activePayload[0].payload.raw) {
                    const raw = e.activePayload[0].payload.raw;
                    if (raw && raw.value) setSelectedArea(raw.value);
                  }
                }}
              >
                <CartesianGrid stroke={chartColors.grid} />
                <XAxis dataKey="label" stroke={chartColors.text} />
                <YAxis stroke={chartColors.text} />
                <Tooltip wrapperStyle={{ background: isDark ? "#0f1720" : "#fff" }} />
                <Bar dataKey="value" fill={chartColors.positive} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Tip: click a bar to filter by that Area. Use provider filter to narrow area options.</div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-800">
          <CardHeader>
            <CardTitle>OFC by Airtel Zone</CardTitle>
            <CardDescription>RCA entries with OFC grouped by Airtel zone</CardDescription>
          </CardHeader>
          <CardContent>
            {ofcByAirtelZone.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">No OFC data for Airtel in selected range.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={ofcByAirtelZone}>
                  <CartesianGrid stroke={chartColors.grid} />
                  <XAxis dataKey="zone" stroke={chartColors.text} />
                  <YAxis stroke={chartColors.text} />
                  <Tooltip wrapperStyle={{ background: isDark ? "#0f1720" : "#fff" }} />
                  <Bar dataKey="count" fill={chartColors.danger} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Counts attributed by matching escalation site ids to Airtel site records' AIRTEL ZONE.</div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-800">
          <CardHeader>
            <CardTitle>JC Distribution</CardTitle>
            <CardDescription>Joint closures used (0-2, 3-5, 6+)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={[
                  { bucket: "0-2", value: ofcMetrics.jcBuckets["0-2"] },
                  { bucket: "3-5", value: ofcMetrics.jcBuckets["3-5"] },
                  { bucket: "6+", value: ofcMetrics.jcBuckets["6+"] },
                ]}
              >
                <CartesianGrid stroke={chartColors.grid} />
                <XAxis dataKey="bucket" stroke={chartColors.text} />
                <YAxis stroke={chartColors.text} />
                <Tooltip wrapperStyle={{ background: isDark ? "#0f1720" : "#fff" }} />
                <Bar dataKey="value" fill={chartColors.purple} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Selected area: links list */}
      {selectedArea && (
        <div className="grid grid-cols-1 gap-6">
          <Card className="bg-white dark:bg-slate-800">
            <CardHeader>
              <CardTitle>Links in {selectedArea.replace("::", " — ")}</CardTitle>
              <CardDescription>Escalations mapped to this area</CardDescription>
            </CardHeader>
            <CardContent>
              {escalationsInSelectedArea.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">No links found for this area in the selected range.</div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full">
                    <thead>
                      <tr className="text-left bg-slate-50 dark:bg-slate-900">
                        <th className="py-2 px-3 text-xs font-semibold">Link ID</th>
                        <th className="py-2 px-3 text-xs font-semibold">Site A</th>
                        <th className="py-2 px-3 text-xs font-semibold">Site B</th>
                        <th className="py-2 px-3 text-xs font-semibold">Provider</th>
                        <th className="py-2 px-3 text-xs font-semibold">Status</th>
                        <th className="py-2 px-3 text-xs font-semibold">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {escalationsInSelectedArea.map((esc) => (
                        <tr key={esc.id} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="py-2 px-3 text-sm">{esc.link_id ?? esc.id}</td>
                          <td className="py-2 px-3 text-sm">{(esc as any).site_a?.site_name ?? (esc as any).site_a_id ?? "N/A"}</td>
                          <td className="py-2 px-3 text-sm">{(esc as any).site_b?.site_name ?? (esc as any).site_b_id ?? "N/A"}</td>
                          <td className="py-2 px-3 text-sm">{esc.provider ?? "N/A"}</td>
                          <td className="py-2 px-3 text-sm">{esc.status ?? "N/A"}</td>
                          <td className="py-2 px-3 text-sm">{new Date(esc.created_at || "").toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alerts & Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-slate-800">
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
            <CardDescription>Critical & MTTR breaches</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-auto">
              {alerts.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">No alerts right now.</div>
              ) : (
                alerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-500 mt-1" />
                    <p className="text-sm">{a}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-800">
          <CardHeader>
            <CardTitle>Technician Leaderboard</CardTitle>
            <CardDescription>Top team leads by resolved tickets</CardDescription>
          </CardHeader>
          <CardContent>
            {techLeaderboard.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">No resolved tickets in the selected range.</div>
            ) : (
              <ol className="list-decimal list-inside">
                {techLeaderboard.map((t) => (
                  <li key={t.lead} className="flex justify-between items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700">
                    <div>
                      <div className="font-medium">{t.lead}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {t.count} resolved • Avg MTTR: {formatHoursToHMS(t.avgMttrHours ?? null)} • SLA:{" "}
                        {t.slaPercent !== null ? (
                          <span style={{ color: slaColor(t.slaPercent) }}>{t.slaPercent.toFixed(0)}%</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    </div>
                    <div><strong>{t.count}</strong></div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-slate-500 dark:text-slate-400">
        <p>Tip: use Date / Provider / Area filters to drill down. MTN uses State (mtn_sites). Airtel uses LGA (airtel_sites).</p>
      </div>
    </div>
  );
}
