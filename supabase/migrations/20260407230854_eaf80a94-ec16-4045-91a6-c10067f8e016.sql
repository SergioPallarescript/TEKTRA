
-- Add partida-specific columns to cost_claims
ALTER TABLE public.cost_claims 
  ADD COLUMN IF NOT EXISTS unidad_medida text,
  ADD COLUMN IF NOT EXISTS uds numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longitud numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anchura numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS altura numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_percent numeric DEFAULT 21,
  ADD COLUMN IF NOT EXISTS pem numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comentario text;

-- Add rejection_reason to cfo_items for reject flow
ALTER TABLE public.cfo_items
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
