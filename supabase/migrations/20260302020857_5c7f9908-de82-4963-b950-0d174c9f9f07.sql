
-- Function 1: get_posture_insights_lite
-- Returns insights with affectedEntities truncated (count + first 3 names only)
CREATE OR REPLACE FUNCTION public.get_posture_insights_lite(p_tenant_record_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record record;
  v_insights jsonb;
  v_agent_insights jsonb;
  v_result jsonb;
BEGIN
  -- Get the latest completed record
  SELECT id, score, classification, summary, category_breakdown,
         insights, agent_insights, agent_status, completed_at, created_at, errors
  INTO v_record
  FROM m365_posture_history
  WHERE tenant_record_id = p_tenant_record_id
    AND status = 'completed'
  ORDER BY completed_at DESC NULLS LAST
  LIMIT 1;

  IF v_record IS NULL THEN
    RETURN NULL;
  END IF;

  -- Strip affectedEntities from insights, keep only count + first 3 preview names
  SELECT COALESCE(jsonb_agg(
    (elem - 'affectedEntities' - 'evidencias') || jsonb_build_object(
      'affectedCount', COALESCE((elem->>'affectedCount')::int, jsonb_array_length(COALESCE(elem->'affectedEntities', '[]'::jsonb))),
      '_entitiesPreview', (
        SELECT COALESCE(jsonb_agg(e->>'displayName'), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(elem->'affectedEntities', '[]'::jsonb)) WITH ORDINALITY AS t(e, idx)
        WHERE idx <= 3
      )
    )
  ), '[]'::jsonb)
  INTO v_insights
  FROM jsonb_array_elements(COALESCE(v_record.insights, '[]'::jsonb)) AS elem;

  -- Same for agent_insights
  SELECT COALESCE(jsonb_agg(
    (elem - 'affectedEntities') || jsonb_build_object(
      '_entitiesPreview', (
        SELECT COALESCE(jsonb_agg(e->>'name'), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(elem->'affectedEntities', '[]'::jsonb)) WITH ORDINALITY AS t(e, idx)
        WHERE idx <= 3
      )
    )
  ), '[]'::jsonb)
  INTO v_agent_insights
  FROM jsonb_array_elements(COALESCE(v_record.agent_insights, '[]'::jsonb)) AS elem;

  v_result := jsonb_build_object(
    'id', v_record.id,
    'score', v_record.score,
    'classification', v_record.classification,
    'summary', v_record.summary,
    'category_breakdown', v_record.category_breakdown,
    'insights', v_insights,
    'agent_insights', v_agent_insights,
    'agent_status', v_record.agent_status,
    'completed_at', v_record.completed_at,
    'created_at', v_record.created_at,
    'errors', v_record.errors
  );

  RETURN v_result;
END;
$$;

-- Function 2: get_insight_affected_entities
-- Returns full affectedEntities for a specific insight by history_id and insight code
CREATE OR REPLACE FUNCTION public.get_insight_affected_entities(p_history_id uuid, p_insight_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_insights jsonb;
  v_agent_insights jsonb;
  v_result jsonb;
BEGIN
  SELECT insights, agent_insights
  INTO v_insights, v_agent_insights
  FROM m365_posture_history
  WHERE id = p_history_id;

  IF v_insights IS NULL AND v_agent_insights IS NULL THEN
    RETURN NULL;
  END IF;

  -- Search in insights array
  SELECT elem->'affectedEntities'
  INTO v_result
  FROM jsonb_array_elements(COALESCE(v_insights, '[]'::jsonb)) AS elem
  WHERE elem->>'code' = p_insight_code
     OR elem->>'id' = p_insight_code
  LIMIT 1;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- Search in agent_insights array
  SELECT elem->'affectedEntities'
  INTO v_result
  FROM jsonb_array_elements(COALESCE(v_agent_insights, '[]'::jsonb)) AS elem
  WHERE elem->>'id' = p_insight_code
     OR elem->>'name' = p_insight_code
  LIMIT 1;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
