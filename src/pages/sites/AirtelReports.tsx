import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Site } from "@/types/database";
import { ReportsTable } from "@/components/reports/ReportsTable";
import { EscalationForm } from "@/components/escalation/EscalationForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import debounce from "lodash.debounce";

export default function AirtelReports() {
  const { profile } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedSites, setSelectedSites] = useState<{ siteA?: Site; siteB?: Site; linkId?: string }>({});

  // Fetch Airtel sites from Supabase with search filter
  const fetchSites = useCallback(
    async (term: string) => {
      try {
        setLoading(true);
        let query = supabase
          .from("airtel_sites")
          .select("*")
          .order("site_name");

        if (term.trim()) {
          query = query.or(`site_name.ilike.%${term}%,site_id.ilike.%${term}%`);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Error fetching sites:", error);
          return;
        }

        setSites(data || []);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Debounce search for instant filtering
  const debouncedFetch = useCallback(
    debounce((term: string) => {
      fetchSites(term);
    }, 400),
    [fetchSites]
  );

  useEffect(() => {
    fetchSites(""); // load initial sites
  }, [fetchSites]);

  useEffect(() => {
    debouncedFetch(search);
  }, [search, debouncedFetch]);

  // Auto-generate Link ID when both sites are selected
  useEffect(() => {
    if (selectedSites.siteA && selectedSites.siteB) {
      setSelectedSites(prev => ({
        ...prev,
        linkId: `${prev.siteA!.site_name}-${prev.siteB!.site_name}`,
      }));
    }
  }, [selectedSites.siteA, selectedSites.siteB]);

  const handleEscalationSuccess = () => setSelectedSites({});

  // Non-fibre_network users only see the table
  if (profile?.role !== "fibre_network") {
    return <ReportsTable provider="airtel" title="Airtel Reports" />;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="reports" className="space-y-6">
        <TabsList>
          <TabsTrigger value="reports">Airtel Reports</TabsTrigger>
          <TabsTrigger value="escalate">Create Escalation</TabsTrigger>
        </TabsList>

        <TabsContent value="reports">
          <ReportsTable provider="airtel" title="Airtel Reports" />
        </TabsContent>

        <TabsContent value="escalate">
          {/* Search Input */}
          <Input
            placeholder="Search by site name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md mb-4"
          />

          {loading && <p>Loading sites...</p>}

          <EscalationForm
            provider="airtel"
            onSuccess={handleEscalationSuccess}
            selectedSites={selectedSites}
            setSelectedSites={setSelectedSites}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
