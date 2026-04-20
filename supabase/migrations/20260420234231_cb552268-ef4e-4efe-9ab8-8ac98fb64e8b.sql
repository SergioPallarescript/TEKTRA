
-- Drop the 4 broad policies that only check bucket_id
DROP POLICY IF EXISTS "Members can upload plans" ON storage.objects;
DROP POLICY IF EXISTS "Members can view plan files" ON storage.objects;
DROP POLICY IF EXISTS "Members can update plan files" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete plan files" ON storage.objects;
