
-- Plans: each plan document in a project
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- structural, architectural, MEP, etc.
  current_version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Plan versions: each uploaded revision
CREATE TABLE public.plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.plans(id) ON DELETE CASCADE NOT NULL,
  version_number INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, version_number)
);
ALTER TABLE public.plan_versions ENABLE ROW LEVEL SECURITY;

-- Plan conformities: digital signatures per agent role
CREATE TABLE public.plan_conformities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_version_id UUID REFERENCES public.plan_versions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL, -- DO, DEO, CON, PRO, CSS
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  geo_location TEXT,
  UNIQUE(plan_version_id, user_id)
);
ALTER TABLE public.plan_conformities ENABLE ROW LEVEL SECURITY;

-- Storage bucket for plan files
INSERT INTO storage.buckets (id, name, public) VALUES ('plans', 'plans', false);

-- RLS for plans: project members can view
CREATE POLICY "Members can view plans" ON public.plans FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = plans.project_id AND pm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = plans.project_id AND p.created_by = auth.uid())
  );
CREATE POLICY "Members can create plans" ON public.plans FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = plans.project_id AND pm.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = plans.project_id AND p.created_by = auth.uid())
    )
  );
CREATE POLICY "Creator can update plans" ON public.plans FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

-- RLS for plan_versions
CREATE POLICY "Members can view plan versions" ON public.plan_versions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.plans pl
      JOIN public.project_members pm ON pm.project_id = pl.project_id
      WHERE pl.id = plan_versions.plan_id AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.plans pl
      JOIN public.projects p ON p.id = pl.project_id
      WHERE pl.id = plan_versions.plan_id AND p.created_by = auth.uid()
    )
  );
CREATE POLICY "Members can upload versions" ON public.plan_versions FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid() AND (
      EXISTS (
        SELECT 1 FROM public.plans pl
        JOIN public.project_members pm ON pm.project_id = pl.project_id
        WHERE pl.id = plan_versions.plan_id AND pm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.plans pl
        JOIN public.projects p ON p.id = pl.project_id
        WHERE pl.id = plan_versions.plan_id AND p.created_by = auth.uid()
      )
    )
  );

-- RLS for plan_conformities
CREATE POLICY "Members can view conformities" ON public.plan_conformities FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.plan_versions pv
      JOIN public.plans pl ON pl.id = pv.plan_id
      JOIN public.project_members pm ON pm.project_id = pl.project_id
      WHERE pv.id = plan_conformities.plan_version_id AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.plan_versions pv
      JOIN public.plans pl ON pl.id = pv.plan_id
      JOIN public.projects p ON p.id = pl.project_id
      WHERE pv.id = plan_conformities.plan_version_id AND p.created_by = auth.uid()
    )
  );
CREATE POLICY "Users can sign conformity" ON public.plan_conformities FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Storage policies for plans bucket
CREATE POLICY "Members can upload plans" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'plans');
CREATE POLICY "Members can view plan files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'plans');

-- Triggers
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
