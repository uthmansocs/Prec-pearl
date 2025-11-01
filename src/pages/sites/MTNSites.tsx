import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { SiteDataTable } from "@/components/sites/SiteDataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import debounce from "lodash.debounce";

const PAGE_SIZE = 50;

export default function MtnSites() {
  const { profile } = useAuth();
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  /** 🔹 Load MTN Sites */
  const loadSites = useCallback(
    async (term: string, pageNum: number) => {
      try {
        setLoading(true);
        const start = pageNum * PAGE_SIZE;
        const end = start + PAGE_SIZE - 1;

        let query = supabase
          .from("mtn_sites")
          .select("*", { count: "exact" })
          .order("imported_at", { ascending: false });

        if (term.trim()) {
          query = query.or(
            `list_of_segment.ilike.%${term}%,network_type.ilike.%${term}%,state.ilike.%${term}%`
          );
        }

        const { data, error, count } = await query.range(start, end);

        if (error) throw error;

        console.log("✅ MTN Sites Loaded:", data?.length, "records");
        setSites(data || []);
        setTotalCount(count ?? 0);
      } catch (error) {
        console.error("❌ Error loading MTN sites:", error);
        toast.error("Failed to load MTN sites");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /** Debounced search */
  const debouncedSearch = useCallback(
    debounce((term: string, pageNum: number) => {
      loadSites(term, pageNum);
    }, 400),
    [loadSites]
  );

  /** Initial load */
  useEffect(() => {
    loadSites("", 0);
  }, [loadSites]);

  /** Search + pagination watchers */
  useEffect(() => {
    setPage(0);
    debouncedSearch(searchTerm, 0);
  }, [searchTerm, debouncedSearch]);

  useEffect(() => {
    debouncedSearch(searchTerm, page);
  }, [page, searchTerm, debouncedSearch]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-provider-mtn/10 rounded-lg flex items-center justify-center">
            <span className="text-provider-mtn font-bold text-lg">M</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">MTN Fibre Sites</h1>
            <p className="text-muted-foreground">
              {totalCount.toLocaleString()} sites • Provider: MTN
            </p>
          </div>
        </div>
        <Badge
          style={{ backgroundColor: "hsl(var(--mtn-yellow))", color: "black" }}
          className="text-sm px-3 py-1"
        >
          MTN Network
        </Badge>
      </div>

      {/* Search */}
      <Input
        placeholder="Search by site, network type, or state..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-md"
        autoFocus
      />

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sites Directory (Page {page + 1})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p>Loading MTN Sites...</p>}
          {!loading && sites.length === 0 && (
            <p className="text-muted-foreground">No MTN site data found.</p>
          )}
          {sites.length > 0 && (
            <SiteDataTable
              sites={sites}
              loading={loading}
              provider="mtn"
              onSitesUpdate={() => loadSites(searchTerm, page)}
            />
          )}

          {/* Pagination */}
          {sites.length > 0 && (
            <div className="flex justify-between mt-4">
              <button
                className="btn"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
              >
                Previous
              </button>
              <button
                className="btn"
                disabled={loading || (page + 1) * PAGE_SIZE >= totalCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
