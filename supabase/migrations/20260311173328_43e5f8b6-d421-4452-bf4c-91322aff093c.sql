-- Delete all analyzer_snapshots records
-- analyzer_config_changes.snapshot_id will be SET NULL automatically (FK ON DELETE SET NULL)
DELETE FROM analyzer_snapshots;