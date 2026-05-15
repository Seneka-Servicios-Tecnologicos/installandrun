
DROP POLICY IF EXISTS "Creator can upload client logo" ON storage.objects;
DROP POLICY IF EXISTS "Creator can update client logo" ON storage.objects;
DROP POLICY IF EXISTS "Creator can delete client logo" ON storage.objects;

CREATE POLICY "Creator can upload client logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-logos'
  AND NOT public.is_guest()
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
      AND c.created_by = auth.uid()
  )
);

CREATE POLICY "Creator can update client logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-logos'
  AND NOT public.is_guest()
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
      AND c.created_by = auth.uid()
  )
);

CREATE POLICY "Creator can delete client logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-logos'
  AND NOT public.is_guest()
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
      AND c.created_by = auth.uid()
  )
);
