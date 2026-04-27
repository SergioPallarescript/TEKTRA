CREATE TABLE IF NOT EXISTS public.native_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'unknown',
  device_id text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

ALTER TABLE public.native_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own native push tokens" ON public.native_push_tokens;
CREATE POLICY "Users manage own native push tokens"
ON public.native_push_tokens
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_native_push_tokens_user_active
ON public.native_push_tokens (user_id, is_active);

DROP TRIGGER IF EXISTS update_native_push_tokens_updated_at ON public.native_push_tokens;
CREATE TRIGGER update_native_push_tokens_updated_at
BEFORE UPDATE ON public.native_push_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();