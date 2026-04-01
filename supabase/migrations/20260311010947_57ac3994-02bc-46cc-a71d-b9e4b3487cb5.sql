
-- Adjust scheduled_hour from UTC to BRT (subtract 3 hours) across all schedule tables
-- This is needed because the new run-scheduled-analyses edge function now treats scheduled_hour as BRT

-- analysis_schedules (firewall compliance)
UPDATE analysis_schedules
SET scheduled_hour = (scheduled_hour - 3 + 24) % 24,
    next_run_at = NULL;

-- analyzer_schedules (firewall analyzer)
UPDATE analyzer_schedules
SET scheduled_hour = (scheduled_hour - 3 + 24) % 24,
    next_run_at = NULL;

-- m365_compliance_schedules
UPDATE m365_compliance_schedules
SET scheduled_hour = (scheduled_hour - 3 + 24) % 24,
    next_run_at = NULL;

-- m365_analyzer_schedules
UPDATE m365_analyzer_schedules
SET scheduled_hour = (scheduled_hour - 3 + 24) % 24,
    next_run_at = NULL;

-- attack_surface_schedules
UPDATE attack_surface_schedules
SET scheduled_hour = (scheduled_hour - 3 + 24) % 24,
    next_run_at = NULL;

-- external_domain_schedules
UPDATE external_domain_schedules
SET scheduled_hour = (scheduled_hour - 3 + 24) % 24,
    next_run_at = NULL;
