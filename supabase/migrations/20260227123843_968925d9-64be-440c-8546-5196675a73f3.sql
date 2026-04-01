
-- Hotfix: Set exo_mailbox_forwarding timeout to 960s (safety for legacy agents)
-- and remove duplicate exo_auth_policy entry
UPDATE device_blueprints
SET collection_steps = jsonb_set(
    collection_steps,
    '{steps}',
    (
        SELECT jsonb_agg(
            CASE
                WHEN step ->> 'id' = 'exo_mailbox_forwarding' THEN
                    step || '{"timeout": 960}'::jsonb
                ELSE
                    step
            END
        )
        FROM (
            SELECT step, row_number() OVER (PARTITION BY step ->> 'id' ORDER BY ordinality) as rn
            FROM jsonb_array_elements(collection_steps -> 'steps') WITH ORDINALITY AS step(step, ordinality)
        ) numbered
        WHERE NOT (step ->> 'id' = 'exo_auth_policy' AND rn > 1)
    )
),
updated_at = now()
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';
