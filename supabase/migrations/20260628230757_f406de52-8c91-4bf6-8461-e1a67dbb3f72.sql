
CREATE POLICY "Anyone can upload task screenshots"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'task-screenshots');

CREATE POLICY "Anyone can read task screenshots"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'task-screenshots');

CREATE POLICY "Anyone can update task screenshots"
ON storage.objects FOR UPDATE TO anon, authenticated
USING (bucket_id = 'task-screenshots');
