-- Vendor files now go from the browser straight to storage through a signed
-- upload URL (Vercel refuses request bodies over 4.5 MB, so three scanned
-- licences posted with the form failed with 413 FUNCTION_PAYLOAD_TOO_LARGE).
-- The bucket itself now enforces what the form accepts: 10 MB, PDF or image.

update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
 where id = 'vendor-uploads';
