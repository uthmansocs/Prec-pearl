-- =====================
-- ENUMS
-- =====================
CREATE TYPE public.user_role AS ENUM ('admin', 'staff', 'fibre_network');
CREATE TYPE public.provider_type AS ENUM ('mtn', 'airtel', 'glo');
CREATE TYPE public.escalation_status AS ENUM ('pending', 'in_progress', 'resolved');

-- =====================
-- TABLES
-- =====================

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL,
  providers provider_type[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- MTN Sites
CREATE TABLE public.mtn_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id TEXT UNIQUE NOT NULL,
  site_name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Airtel Sites
CREATE TABLE public.airtel_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id TEXT UNIQUE NOT NULL,
  site_name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Glo Sites
CREATE TABLE public.glo_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id TEXT UNIQUE NOT NULL,
  site_name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Escalations
CREATE TABLE public.escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider provider_type NOT NULL,
  site_a_id TEXT NOT NULL,
  site_b_id TEXT NOT NULL,
  link_id TEXT NOT NULL, -- SITE_A–SITE_B format
  ticket_id TEXT NOT NULL,
  mttr_hours DECIMAL(5,2) NOT NULL CHECK (mttr_hours >= 0.1),
  technician_lat DECIMAL(10,8),
  technician_lng DECIMAL(11,8),
  status escalation_status DEFAULT 'pending',
  has_report BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reports
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id UUID REFERENCES public.escalations(id) ON DELETE CASCADE,
  issue_description TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  contact_info TEXT NOT NULL,
  is_critical BOOLEAN DEFAULT FALSE,
  image_url TEXT,
  staff_lat DECIMAL(10,8),
  staff_lng DECIMAL(11,8),
  status escalation_status DEFAULT 'in_progress',
  status_notes TEXT,
  resolution_notes TEXT,
  pof_url TEXT,
  cof_url TEXT,
  resolution_photos TEXT[],
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RCA Forms
CREATE TABLE public.rca_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id UUID REFERENCES public.escalations(id) ON DELETE CASCADE UNIQUE,
  link_type TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  mttr_used DECIMAL(5,2),
  mttr_status TEXT NOT NULL,
  pof TEXT,
  cof TEXT,
  actual_cof TEXT NOT NULL,
  detailed_cof TEXT NOT NULL,
  resolution TEXT NOT NULL,
  ofc TEXT,
  jc TEXT,
  cod TEXT,
  team_lead TEXT NOT NULL,
  team_manager TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification Log
CREATE TABLE public.notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES auth.users(id),
  escalation_id UUID REFERENCES public.escalations(id),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================
-- ROW LEVEL SECURITY
-- =====================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mtn_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airtel_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glo_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rca_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- =====================
-- POLICIES
-- =====================

-- Profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Sites: all can read
CREATE POLICY "Authenticated users can view MTN sites" ON public.mtn_sites
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view Airtel sites" ON public.airtel_sites
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view Glo sites" ON public.glo_sites
  FOR SELECT TO authenticated USING (true);

-- Sites: admin/staff can manage
CREATE POLICY "Admin and Staff can manage MTN sites" ON public.mtn_sites
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','staff')));
CREATE POLICY "Admin and Staff can manage Airtel sites" ON public.airtel_sites
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','staff')));
CREATE POLICY "Admin and Staff can manage Glo sites" ON public.glo_sites
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','staff')));

-- Escalations
CREATE POLICY "All authenticated users can view escalations" ON public.escalations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Fibre Network can create escalations" ON public.escalations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'fibre_network'));
CREATE POLICY "Admin and Fibre Network can update/delete escalations" ON public.escalations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','fibre_network')));

-- Reports
CREATE POLICY "All authenticated users can view reports" ON public.reports
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can create and manage reports" ON public.reports
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'staff'));

-- RCA Forms
CREATE POLICY "Admin and Staff can manage RCA forms" ON public.rca_forms
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','staff')));
CREATE POLICY "Authenticated users can view RCA forms" ON public.rca_forms
  FOR SELECT TO authenticated USING (true);

-- Notifications
CREATE POLICY "Users can view their own notifications" ON public.notification_log
  FOR SELECT TO authenticated USING (auth.uid() = recipient_id);
CREATE POLICY "System can create notifications" ON public.notification_log
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update their own notifications" ON public.notification_log
  FOR UPDATE TO authenticated USING (auth.uid() = recipient_id);

-- =====================
-- TRIGGERS
-- =====================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mtn_sites_updated_at BEFORE UPDATE ON public.mtn_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_airtel_sites_updated_at BEFORE UPDATE ON public.airtel_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_glo_sites_updated_at BEFORE UPDATE ON public.glo_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_escalations_updated_at BEFORE UPDATE ON public.escalations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rca_forms_updated_at BEFORE UPDATE ON public.rca_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- REALTIME
-- =====================
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.escalations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rca_forms;

-- REPLICA IDENTITY
ALTER TABLE public.notification_log REPLICA IDENTITY FULL;
ALTER TABLE public.escalations REPLICA IDENTITY FULL;
ALTER TABLE public.reports REPLICA IDENTITY FULL;
ALTER TABLE public.rca_forms REPLICA IDENTITY FULL;
