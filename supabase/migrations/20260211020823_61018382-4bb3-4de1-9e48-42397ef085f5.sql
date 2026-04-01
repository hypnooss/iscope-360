
-- Add scheduling detail columns to analysis_schedules
ALTER TABLE public.analysis_schedules ADD COLUMN scheduled_hour INTEGER DEFAULT 0;
ALTER TABLE public.analysis_schedules ADD COLUMN scheduled_day_of_week INTEGER DEFAULT 1;
ALTER TABLE public.analysis_schedules ADD COLUMN scheduled_day_of_month INTEGER DEFAULT 1;

-- Set existing daily schedules to run at 2am by default
UPDATE public.analysis_schedules 
SET scheduled_hour = 2 
WHERE frequency = 'daily';

-- Calculate next_run_at for existing schedules
UPDATE public.analysis_schedules 
SET next_run_at = 
  CASE 
    WHEN frequency = 'daily' THEN 
      CASE 
        WHEN (CURRENT_DATE + (scheduled_hour * INTERVAL '1 hour')) > NOW() 
        THEN CURRENT_DATE + (scheduled_hour * INTERVAL '1 hour')
        ELSE (CURRENT_DATE + INTERVAL '1 day') + (scheduled_hour * INTERVAL '1 hour')
      END
    WHEN frequency = 'weekly' THEN
      CASE 
        WHEN (CURRENT_DATE + ((scheduled_day_of_week - EXTRACT(DOW FROM CURRENT_DATE)::integer + 7)::integer % 7) * INTERVAL '1 day' + scheduled_hour * INTERVAL '1 hour') > NOW()
        THEN CURRENT_DATE + ((scheduled_day_of_week - EXTRACT(DOW FROM CURRENT_DATE)::integer + 7)::integer % 7) * INTERVAL '1 day' + scheduled_hour * INTERVAL '1 hour'
        ELSE CURRENT_DATE + ((scheduled_day_of_week - EXTRACT(DOW FROM CURRENT_DATE)::integer + 7)::integer % 7 + 7) * INTERVAL '1 day' + scheduled_hour * INTERVAL '1 hour'
      END
    WHEN frequency = 'monthly' THEN
      CASE 
        WHEN (DATE_TRUNC('month', CURRENT_DATE) + (scheduled_day_of_month - 1) * INTERVAL '1 day' + scheduled_hour * INTERVAL '1 hour') > NOW()
        THEN DATE_TRUNC('month', CURRENT_DATE) + (scheduled_day_of_month - 1) * INTERVAL '1 day' + scheduled_hour * INTERVAL '1 hour'
        ELSE DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month') + (scheduled_day_of_month - 1) * INTERVAL '1 day' + scheduled_hour * INTERVAL '1 hour'
      END
    ELSE next_run_at
  END
WHERE is_active = true AND frequency != 'manual';
