
-- Function to compute next order number per project
CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT COALESCE(MAX(order_number), 0) + 1
    INTO NEW.order_number
    FROM public.orders
   WHERE project_id = NEW.project_id;
  RETURN NEW;
END;
$$;

-- Function to compute next incident number per project
CREATE OR REPLACE FUNCTION public.next_incident_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT COALESCE(MAX(incident_number), 0) + 1
    INTO NEW.incident_number
    FROM public.incidents
   WHERE project_id = NEW.project_id;
  RETURN NEW;
END;
$$;

-- Drop old defaults that use global sequences
ALTER TABLE public.orders ALTER COLUMN order_number DROP DEFAULT;
ALTER TABLE public.incidents ALTER COLUMN incident_number DROP DEFAULT;

-- Create triggers to auto-assign local numbers
CREATE TRIGGER trg_order_number_per_project
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.next_order_number();

CREATE TRIGGER trg_incident_number_per_project
  BEFORE INSERT ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.next_incident_number();

-- ===== RETROACTIVE FIX: re-number existing records per project =====

-- Fix orders: assign 1..N per project ordered by created_at
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at) AS rn
  FROM public.orders
)
UPDATE public.orders o
   SET order_number = r.rn
  FROM ranked r
 WHERE o.id = r.id;

-- Fix incidents: assign 1..N per project ordered by created_at
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at) AS rn
  FROM public.incidents
)
UPDATE public.incidents i
   SET incident_number = r.rn
  FROM ranked r
 WHERE i.id = r.id;
