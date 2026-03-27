
-- 1. Project Documents table (knowledge base for Brain)
CREATE TABLE public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  file_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view project docs" ON public.project_documents
  FOR SELECT TO authenticated
  USING (is_project_member(auth.uid(), project_id) OR is_project_creator(auth.uid(), project_id));

CREATE POLICY "DO/DEO can upload project docs" ON public.project_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (is_project_member(auth.uid(), project_id) OR is_project_creator(auth.uid(), project_id))
  );

CREATE POLICY "Uploader can delete project docs" ON public.project_documents
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

-- 2. DWG Files table (separate from plans)
CREATE TABLE public.dwg_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dwg_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view dwg files" ON public.dwg_files
  FOR SELECT TO authenticated
  USING (is_project_member(auth.uid(), project_id) OR is_project_creator(auth.uid(), project_id));

CREATE POLICY "DO/DEO can upload dwg files" ON public.dwg_files
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (is_project_member(auth.uid(), project_id) OR is_project_creator(auth.uid(), project_id))
  );

CREATE POLICY "Uploader can delete dwg files" ON public.dwg_files
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

-- 3. Drop and recreate cfo_items with the new 16-point structure
-- First clear existing data
DELETE FROM public.cfo_items;

-- Add new columns for permission control and claim tracking
ALTER TABLE public.cfo_items ADD COLUMN IF NOT EXISTS allowed_roles text[] DEFAULT '{}';
ALTER TABLE public.cfo_items ADD COLUMN IF NOT EXISTS item_number integer DEFAULT 0;
ALTER TABLE public.cfo_items ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.cfo_items ADD COLUMN IF NOT EXISTS claimed_by uuid;
ALTER TABLE public.cfo_items ADD COLUMN IF NOT EXISTS validated_by_deo boolean DEFAULT false;
ALTER TABLE public.cfo_items ADD COLUMN IF NOT EXISTS validated_at timestamptz;
