import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Site } from '@/types/database';
import { ReportsTable } from '@/components/reports/ReportsTable';
import { EscalationForm } from '@/components/escalation/EscalationForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function GloReports() {
  const { profile } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSites();
  }, []);

  const loadSites = async () => {
    try {
      const { data, error } = await supabase
        .from('glo_sites')
        .select('*')
        .order('site_name');

      if (error) throw error;
      setSites(data || []);
    } catch (error) {
      console.error('Error loading Glo sites:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEscalationSuccess = () => {
    // Refresh will be handled by real-time updates in ReportsTable
  };

  if (profile?.role !== 'fibre_network') {
    return (
      <div className="space-y-6">
        <ReportsTable provider="glo" title="Glo Reports" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="reports" className="space-y-6">
        <TabsList>
          <TabsTrigger value="reports">Glo Reports</TabsTrigger>
          <TabsTrigger value="escalate">Create Escalation</TabsTrigger>
        </TabsList>
        
        <TabsContent value="reports">
          <ReportsTable provider="glo" title="Glo Reports" />
        </TabsContent>
        
        <TabsContent value="escalate">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <EscalationForm
              provider="glo"
              sites={sites}
              onSuccess={handleEscalationSuccess}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}