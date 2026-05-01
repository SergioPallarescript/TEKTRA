-- Drop old complex subcontracting tables (replaced by simpler workflow)
DROP TABLE IF EXISTS public.subcontracting_entries CASCADE;
DROP TABLE IF EXISTS public.subcontracting_books CASCADE;

-- Scanned pages of the physical book
CREATE TABLE public.subcontracting_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'entry_sheet',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_subcontracting_pages_project ON public.subcontracting_pages(project_id, page_index);

ALTER TABLE public.subcontracting_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view subcontracting pages"
  ON public.subcontracting_pages FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_project_creator(auth.uid(), project_id));

CREATE POLICY "Members insert subcontracting pages"
  ON public.subcontracting_pages FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (public.is_project_member(auth.uid(), project_id) OR public.is_project_creator(auth.uid(), project_id))
  );

CREATE POLICY "Members delete subcontracting pages"
  ON public.subcontracting_pages FOR DELETE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_project_creator(auth.uid(), project_id));

CREATE POLICY "Members update subcontracting pages"
  ON public.subcontracting_pages FOR UPDATE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_project_creator(auth.uid(), project_id));

-- Adhesion acts to safety plan
CREATE TABLE public.subcontracting_adhesion_acts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  work_name TEXT NOT NULL,
  location TEXT NOT NULL,
  promoter_name TEXT NOT NULL,
  contractor_name TEXT,
  subcontractor_name TEXT NOT NULL,
  subcontractor_representative TEXT,
  subcontractor_task TEXT NOT NULL,
  act_date DATE NOT NULL DEFAULT CURRENT_DATE,
  file_path TEXT,
  file_name TEXT,
  generated_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_subcontracting_acts_project ON public.subcontracting_adhesion_acts(project_id, created_at DESC);

ALTER TABLE public.subcontracting_adhesion_acts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view adhesion acts"
  ON public.subcontracting_adhesion_acts FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_project_creator(auth.uid(), project_id));

CREATE POLICY "Members insert adhesion acts"
  ON public.subcontracting_adhesion_acts FOR INSERT TO authenticated
  WITH CHECK (
    generated_by = auth.uid()
    AND (public.is_project_member(auth.uid(), project_id) OR public.is_project_creator(auth.uid(), project_id))
  );

CREATE POLICY "Members delete adhesion acts"
  ON public.subcontracting_adhesion_acts FOR DELETE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_project_creator(auth.uid(), project_id));