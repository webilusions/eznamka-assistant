ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'unpaid';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'paid';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS variable_symbol TEXT;
CREATE INDEX IF NOT EXISTS tasks_variable_symbol_idx ON public.tasks(variable_symbol);