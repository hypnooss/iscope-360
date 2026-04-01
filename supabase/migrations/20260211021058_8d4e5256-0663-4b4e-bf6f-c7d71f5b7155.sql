
SELECT cron.schedule(
  'run-scheduled-analyses',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://akbosdbyheezghieiefz.supabase.co/functions/v1/run-scheduled-analyses',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrYm9zZGJ5aGVlemdoaWVpZWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTEyODAsImV4cCI6MjA4NTE4NzI4MH0.9n-nUenSCwYIGztsfgVAbgis9wEakQDKX3Oe2xBiNvo"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
