-- Add logo_path to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logo_path TEXT;

-- Public bucket for client logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-logos', 'client-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Client logos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-logos');

-- Creator can insert
CREATE POLICY "Creator can upload client logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-logos'
  AND NOT public.is_guest()
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND c.created_by = auth.uid()
  )
);

-- Creator can update
CREATE POLICY "Creator can update client logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-logos'
  AND NOT public.is_guest()
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND c.created_by = auth.uid()
  )
);

-- Creator can delete
CREATE POLICY "Creator can delete client logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-logos'
  AND NOT public.is_guest()
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND c.created_by = auth.uid()
  )
);