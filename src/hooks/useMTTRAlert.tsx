import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Escalation } from '@/types/database';

export const useMTTRAlert = (escalations: Escalation[]) => {
  const [urgentEscalations, setUrgentEscalations] = useState<Set<string>>(new Set());

  useEffect(() => {
    const checkMTTRBreaches = async () => {
      const urgent = new Set<string>();
      const now = new Date();

      for (const escalation of escalations) {
        if (escalation.status === 'resolved' || escalation.status === 'closed') continue;

        const createdAt = new Date(escalation.created_at);
        const elapsedHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        const thresholdHours = escalation.mttr_hours * 0.7; // 70% threshold

        if (elapsedHours >= thresholdHours) {
          urgent.add(escalation.id);

          // Check if we already logged this breach
          const { data: existingLog } = await supabase
            .from('notification_log')
            .select('id')
            .eq('escalation_id', escalation.id)
            .eq('message', 'MTTR 70% threshold breach')
            .single();

          if (!existingLog) {
            // Create notification log entry
            await supabase.from('notification_log').insert({
              escalation_id: escalation.id,
              message: `MTTR 70% threshold breach - Ticket ${escalation.ticket_id}`,
              recipient_id: escalation.created_by || 'system'
            });
          }
        }
      }

      setUrgentEscalations(urgent);
    };

    if (escalations.length > 0) {
      checkMTTRBreaches();
    }
  }, [escalations]);

  return urgentEscalations;
};