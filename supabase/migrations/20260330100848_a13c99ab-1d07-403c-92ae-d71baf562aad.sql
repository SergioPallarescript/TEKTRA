
ALTER TABLE public.cost_claims ADD COLUMN IF NOT EXISTS doc_type text DEFAULT 'certificacion';
ALTER TABLE public.cost_claims ADD COLUMN IF NOT EXISTS dem_signed_by uuid;
ALTER TABLE public.cost_claims ADD COLUMN IF NOT EXISTS dem_signed_at timestamptz;
ALTER TABLE public.cost_claims ADD COLUMN IF NOT EXISTS do_signed_by uuid;
ALTER TABLE public.cost_claims ADD COLUMN IF NOT EXISTS do_signed_at timestamptz;
ALTER TABLE public.cost_claims ADD COLUMN IF NOT EXISTS pro_signed_by uuid;
ALTER TABLE public.cost_claims ADD COLUMN IF NOT EXISTS pro_signed_at timestamptz;
ALTER TABLE public.cost_claims ADD COLUMN IF NOT EXISTS signed_file_path text;
ALTER TABLE public.cost_claims ADD COLUMN IF NOT EXISTS validation_hash text;
