CREATE TYPE public.task_status AS ENUM ('pending', 'running', 'paused_before_payment', 'completed', 'failed', 'cancelled');

CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    license_plate TEXT NOT NULL,
    country_code TEXT NOT NULL,
    vignette_type TEXT NOT NULL,
    validity_date DATE NOT NULL,
    email TEXT NOT NULL,
    status public.task_status NOT NULL DEFAULT 'pending',
    eznamka_order_id TEXT,
    eznamka_checkout_url TEXT,
    error_message TEXT,
    error_screenshot_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.task_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    step TEXT NOT NULL,
    message TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.task_screenshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    step TEXT NOT NULL,
    screenshot_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own tasks" ON public.tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.task_logs TO authenticated;
GRANT ALL ON public.task_logs TO service_role;
ALTER TABLE public.task_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view logs of their own tasks" ON public.task_logs FOR SELECT USING (EXISTS (SELECT 1 FROM public.tasks WHERE tasks.id = task_logs.task_id AND tasks.user_id = auth.uid()));
CREATE POLICY "Users can insert logs for their own tasks" ON public.task_logs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.tasks WHERE tasks.id = task_logs.task_id AND tasks.user_id = auth.uid()));

GRANT SELECT, INSERT ON public.task_screenshots TO authenticated;
GRANT ALL ON public.task_screenshots TO service_role;
ALTER TABLE public.task_screenshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view screenshots of their own tasks" ON public.task_screenshots FOR SELECT USING (EXISTS (SELECT 1 FROM public.tasks WHERE tasks.id = task_screenshots.task_id AND tasks.user_id = auth.uid()));
CREATE POLICY "Users can insert screenshots for their own tasks" ON public.task_screenshots FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.tasks WHERE tasks.id = task_screenshots.task_id AND tasks.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();