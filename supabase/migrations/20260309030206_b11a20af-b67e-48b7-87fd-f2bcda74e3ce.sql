-- Reset next_run_at for all active schedules
UPDATE analyzer_schedules SET next_run_at = NOW() + INTERVAL '1 minute' WHERE is_active = true;
UPDATE analysis_schedules SET next_run_at = NOW() + INTERVAL '1 minute' WHERE is_active = true;
UPDATE external_domain_schedules SET next_run_at = NOW() + INTERVAL '1 minute' WHERE is_active = true;
UPDATE attack_surface_schedules SET next_run_at = NOW() + INTERVAL '1 minute' WHERE is_active = true AND next_run_at < NOW();
UPDATE m365_analyzer_schedules SET next_run_at = NOW() + INTERVAL '1 minute' WHERE is_active = true AND next_run_at < NOW();