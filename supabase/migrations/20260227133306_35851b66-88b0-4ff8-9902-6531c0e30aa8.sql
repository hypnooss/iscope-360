
-- Hotfix: Update params.timeout for all EXO PowerShell steps in the M365 Exchange blueprint
-- The deployed agent (1.3.4) reads params.timeout, not step-level timeout.
-- Most steps had params.timeout=30 which is too short for Connect-ExchangeOnline overhead.
-- Setting minimum 120s for simple steps, keeping higher values for heavy steps.
UPDATE device_blueprints
SET collection_steps = jsonb_set(
    collection_steps,
    '{steps}',
    (
        SELECT jsonb_agg(
            CASE
                -- Steps that already have adequate timeout (>=120), keep as-is
                WHEN (step->'params'->>'timeout')::int >= 120 THEN step
                -- Steps with params.timeout < 120: bump to 120
                WHEN step->'params'->>'timeout' IS NOT NULL 
                     AND (step->'params'->>'timeout')::int < 120 THEN
                    jsonb_set(step, '{params,timeout}', '120'::jsonb)
                -- Steps without params.timeout: add 120
                WHEN step->>'type' = 'powershell' AND step->'params'->>'timeout' IS NULL THEN
                    jsonb_set(step, '{params,timeout}', '120'::jsonb)
                ELSE step
            END
            ORDER BY ord
        )
        FROM jsonb_array_elements(collection_steps->'steps') WITH ORDINALITY AS s(step, ord)
    )
),
updated_at = now()
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';
