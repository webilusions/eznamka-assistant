
-- Povoľ anon (a authenticated) prístup cez Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO anon, authenticated;
GRANT SELECT, INSERT ON public.task_logs TO anon, authenticated;
GRANT SELECT, INSERT ON public.task_screenshots TO anon, authenticated;

-- Drop staré reštriktívne policies
DROP POLICY IF EXISTS "Users can manage their own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can view logs of their own tasks" ON public.task_logs;
DROP POLICY IF EXISTS "Users can insert logs for their own tasks" ON public.task_logs;
DROP POLICY IF EXISTS "Users can view screenshots of their own tasks" ON public.task_screenshots;
DROP POLICY IF EXISTS "Users can insert screenshots for their own tasks" ON public.task_screenshots;

-- Otvorené policies pre PHP backend
CREATE POLICY "Public can manage tasks" ON public.tasks
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Public can read task logs" ON public.task_logs
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can insert task logs" ON public.task_logs
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Public can read task screenshots" ON public.task_screenshots
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can insert task screenshots" ON public.task_screenshots
  FOR INSERT TO anon, authenticated WITH CHECK (true);
