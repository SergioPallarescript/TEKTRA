
-- Orders Book (Libro de Órdenes)
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  order_number SERIAL,
  content TEXT NOT NULL,
  photos TEXT[] DEFAULT '{}',
  ai_flags JSONB DEFAULT '{}',
  requires_validation BOOLEAN DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view orders" ON public.orders
  FOR SELECT TO authenticated
  USING (is_project_member(auth.uid(), project_id) OR is_project_creator(auth.uid(), project_id));

CREATE POLICY "DEO can create orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    (is_project_member(auth.uid(), project_id) OR is_project_creator(auth.uid(), project_id))
  );

-- Order validations (CON and PRO must validate flagged orders)
CREATE TABLE public.order_validations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  validated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  geo_location TEXT,
  UNIQUE(order_id, user_id)
);

ALTER TABLE public.order_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view validations" ON public.order_validations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_id 
    AND (is_project_member(auth.uid(), o.project_id) OR is_project_creator(auth.uid(), o.project_id))
  ));

CREATE POLICY "Users can validate" ON public.order_validations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Incidents Book (Libro de Incidencias)
CREATE TABLE public.incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  incident_number SERIAL,
  content TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  photos TEXT[] DEFAULT '{}',
  remedial_actions TEXT,
  created_by UUID NOT NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view incidents" ON public.incidents
  FOR SELECT TO authenticated
  USING (is_project_member(auth.uid(), project_id) OR is_project_creator(auth.uid(), project_id));

CREATE POLICY "CSS can create incidents" ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    (is_project_member(auth.uid(), project_id) OR is_project_creator(auth.uid(), project_id))
  );

CREATE POLICY "CSS can update incidents" ON public.incidents
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

-- Cost Validations (Validación de Costes)
CREATE TABLE public.cost_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  claim_number SERIAL,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  file_url TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending_technical',
  submitted_by UUID NOT NULL,
  technical_approved_by UUID,
  technical_approved_at TIMESTAMP WITH TIME ZONE,
  payment_authorized_by UUID,
  payment_authorized_at TIMESTAMP WITH TIME ZONE,
  rejected_by UUID,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cost_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view claims" ON public.cost_claims
  FOR SELECT TO authenticated
  USING (is_project_member(auth.uid(), project_id) OR is_project_creator(auth.uid(), project_id));

CREATE POLICY "CON can submit claims" ON public.cost_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid() AND
    (is_project_member(auth.uid(), project_id) OR is_project_creator(auth.uid(), project_id))
  );

CREATE POLICY "Approvers can update claims" ON public.cost_claims
  FOR UPDATE TO authenticated
  USING (is_project_member(auth.uid(), project_id) OR is_project_creator(auth.uid(), project_id));

-- Enable realtime for orders (urgent alerts)
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents;
