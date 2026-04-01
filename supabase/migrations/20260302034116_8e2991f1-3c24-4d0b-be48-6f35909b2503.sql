
-- Fix 1: Teams blueprint - remove dual $expand (only keep owners)
UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN step->>'id' = 'teams_list' THEN 
          jsonb_set(step, '{config,endpoint}', 
            '"/groups?$filter=resourceProvisioningOptions/Any(x:x eq ''Team'')&$select=id,displayName,visibility,createdDateTime,mail&$expand=owners($select=id,displayName)&$top=200"'::jsonb)
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
),
updated_at = now()
WHERE id = '0478d423-918d-4483-98af-f30df3ade0d3';

-- Add teams_members as a second step
UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(step) || jsonb_build_array(jsonb_build_object(
      'id', 'teams_members',
      'name', 'Membros dos Teams',
      'executor', 'edge_function',
      'runtime', 'graph_api',
      'category', 'teams_collaboration',
      'config', jsonb_build_object(
        'api_version', 'v1.0',
        'endpoint', '/groups?$filter=resourceProvisioningOptions/Any(x:x eq ''Team'')&$select=id,displayName&$expand=members($select=id,displayName,userType)&$top=200',
        'method', 'GET',
        'headers', jsonb_build_object('ConsistencyLevel', 'eventual')
      )
    ))
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
),
updated_at = now()
WHERE id = '0478d423-918d-4483-98af-f30df3ade0d3';

-- Fix 2: SharePoint blueprint - remove sharingCapability from $select
UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN step->>'id' = 'sharepoint_sites' THEN 
          jsonb_set(step, '{config,endpoint}', 
            '"/sites?search=*&$select=id,displayName,webUrl,createdDateTime,lastModifiedDateTime&$top=200"'::jsonb)
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
),
updated_at = now()
WHERE id = 'e794e61a-5613-46db-a1ee-ed26dbac1748';

-- Fix 3: PIM steps - add Accept-Language header  
UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN step->>'id' IN ('pim_role_assignments', 'pim_role_active_assignments') THEN 
          jsonb_set(step, '{config,headers}', '{"Accept-Language": "en-US"}'::jsonb)
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
),
updated_at = now()
WHERE id = '164ad4d2-35c6-46cd-9c70-bcd27b044b73';
