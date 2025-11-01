import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Site, Escalation } from '@/types/database';
import { SiteDataTable } from '@/components/sites/SiteDataTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import debounce from 'lodash.debounce';

const PAGE_SIZE = 50;

export default function AirtelSites() {
  const { profile } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingEscalations, setLoadingEscalations] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const loadSites = useCallback(
    async (term: string, pageNum: number) => {
      try {
        setLoadingSites(true);
        const start = pageNum * PAGE_SIZE;
        const end = start + PAGE_SIZE - 1;

        let query = supabase
          .from('airtel_sites')
          .select('*', { count: 'exact' })
          .order('site_name');

        if (term.trim()) {
          query = query.or(
            `site_name.ilike.%${term}%,CITY.ilike.%${term}%,STATE.ilike.%${term}%,SUB VENDOR.ilike.%${term}%`
          );
        }

        const { data, error, count } = await query.range(start, end);

        if (error) throw error;

        setSites(data || []);
        setTotalCount(count ?? 0);
      } catch (error) {
        console.error('Error loading Airtel sites:', error);
        toast.error('Failed to load Airtel sites');
      } finally {
        setLoadingSites(false);
      }
    },
    []
  );

  const loadEscalations = async () => {
    try {
      setLoadingEscalations(true);
      const { data, error } = await supabase
        .from('escalations')
        .select('*')
        .eq('provider', 'airtel')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setEscalations(data || []);
    } catch (error) {
      console.error('Error loading escalations:', error);
    } finally {
      setLoadingEscalations(false);
    }
  };

  const debouncedSearch = useCallback(
    debounce((term: string, pageNum: number) => {
      loadSites(term, pageNum);
    }, 400),
    [loadSites]
  );

  useEffect(() => {
    loadSites('', 0);
    loadEscalations();
  }, [loadSites]);

  useEffect(() => {
    setPage(0);
    debouncedSearch(searchTerm, 0);
  }, [searchTerm, debouncedSearch]);

  useEffect(() => {
    debouncedSearch(searchTerm, page);
  }, [page, searchTerm, debouncedSearch]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-provider-airtel/10 rounded-lg flex items-center justify-center">
            <span className="text-provider-airtel font-bold text-lg">A</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Airtel Sites</h1>
            <p className="text-muted-foreground">
              {totalCount.toLocaleString()} sites available • Provider: Airtel
            </p>
          </div>
        </div>
        <Badge
          style={{ backgroundColor: 'hsl(var(--airtel-red))', color: 'white' }}
          className="text-sm px-3 py-1"
        >
          Airtel Network
        </Badge>
      </div>

      {/* Search Input */}
      <Input
        placeholder="Search sites by name, city, state, sub vendor..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-md"
        autoFocus
      />

      {/* Sites Table */}
      <Card>
        <CardHeader>
          <CardTitle>Site Directory (Page {page + 1})</CardTitle>
        </CardHeader>
        <CardContent>
          <SiteDataTable
            sites={sites}
            loading={loadingSites}
            provider="airtel"
            onSitesUpdate={() => loadSites(searchTerm, page)}
          />

          {/* Pagination */}
          <div className="flex justify-between mt-4">
            <button
              className="btn"
              disabled={page === 0 || loadingSites}
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
            >
              Previous
            </button>
            <button
              className="btn"
              disabled={loadingSites || (page + 1) * PAGE_SIZE >= totalCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Escalations */}
      {escalations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Link Escalations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {escalations.map((escalation) => (
                <div
                  key={escalation.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div>
                    <p className="font-medium">{escalation.link_id}</p>
                    <p className="text-sm text-muted-foreground">
                      Ticket: {escalation.ticket_id} • MTTR: {escalation.mttr_hours}h
                    </p>
                  </div>
                  <Badge
                    variant={
                      escalation.status === 'pending'
                        ? 'secondary'
                        : escalation.status === 'in_progress'
                        ? 'default'
                        : 'outline'
                    }
                  >
                    {escalation.status.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
