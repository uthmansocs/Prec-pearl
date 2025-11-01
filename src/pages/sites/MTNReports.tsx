// src/pages/MTNReports.tsx
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Site } from "@/types/database";
import { ReportsTable } from "@/components/reports/ReportsTable";
import { EscalationForm } from "@/components/escalation/EscalationForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

/**
 * ✅ MTNReports (Optimized)
 * - Fetches MTN site data from `mtn_sites`
 * - Cleans, deduplicates, and validates all rows
 * - Adds unique React-safe keys and prevents empty Select values
 * - Handles loading, error, and role-based views
 */

export default function MTNReports() {
  const { profile } = useAuth();

  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedSites, setSelectedSites] = useState<{
    siteA?: Site;
    siteB?: Site;
    linkId?: string;
  }>({});

  /** Helper: safely sanitize strings for stable React keys */
  const sanitizeKeyPart = (s?: string) =>
    String(s ?? "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^A-Za-z0-9\-_]/g, "")
      .slice(0, 80);

  /** Remove duplicates based on `network_type + list_of_segment` combo */
  const dedupeBySegment = (rows: any[]) => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      const key = `${String(r.network_type ?? "").trim()}|${String(
        r.list_of_segment ?? ""
      ).trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  /** Fetch data from Supabase */
  const loadSites = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("mtn_sites")
        .select("id, list_of_segment, network_type, distance_km, imported_at")
        .order("list_of_segment", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as any[];

      // Deduplicate to prevent repeated Select items
      const uniqueRows = dedupeBySegment(rows);

      // Normalize and ensure safe, non-empty keys
      const normalized = uniqueRows.map((r, idx) => {
        const listSegment = r.list_of_segment || `Unknown-${idx}`;
        const network = r.network_type || "MTN";
        const importedAt = r.imported_at || "";

        // Generate a guaranteed unique and stable key
        const unique_key = `mtn-${sanitizeKeyPart(network)}-${sanitizeKeyPart(
          listSegment
        )}-${sanitizeKeyPart(importedAt || idx.toString())}`;

        return {
          ...r,
          id: r.id ?? idx,
          network_type: network,
          list_of_segment: listSegment,
          distance_km: r.distance_km ?? 0,
          imported_at: importedAt,
          unique_key,
        } as Site & { unique_key: string };
      });

      setSites(normalized);
    } catch (err: any) {
      console.error("Error loading MTN sites:", err);
      try {
        if (typeof toast.error === "function") toast.error("Failed to load MTN sites");
        else toast("Failed to load MTN sites");
      } catch {}
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  const handleEscalationSuccess = useCallback(() => {
    loadSites();
  }, [loadSites]);

  /** Non-fibre-network users: show only ReportsTable */
  if (profile?.role !== "fibre_network") {
    return (
      <div className="space-y-6">
        <ReportsTable provider="mtn" title="MTN Reports" />
      </div>
    );
  }

  /** Fibre-network users: show Reports + EscalationForm tabs */
  return (
    <div className="space-y-6">
      <Tabs defaultValue="reports" className="space-y-6">
        <TabsList>
          <TabsTrigger value="reports">MTN Reports</TabsTrigger>
          <TabsTrigger value="escalate">Create Escalation</TabsTrigger>
        </TabsList>

        <TabsContent value="reports">
          <ReportsTable provider="mtn" title="MTN Reports" />
        </TabsContent>

        <TabsContent value="escalate">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : sites.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No MTN site data available.
            </div>
          ) : (
            <EscalationForm
              provider="mtn"
              sites={sites}
              selectedSites={selectedSites}
              setSelectedSites={setSelectedSites}
              onSuccess={handleEscalationSuccess}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
