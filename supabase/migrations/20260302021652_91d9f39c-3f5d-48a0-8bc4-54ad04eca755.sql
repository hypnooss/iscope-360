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

  SELECT COALESCE(jsonb_agg(
    (elem - 'affectedEntities' - 'evidencias') || jsonb_build_object(
      'affectedCount', COALESCE((elem->>'affectedCount')::numeric::int, jsonb_array_length(COALESCE(elem->'affectedEntities', '[]'::jsonb))),
      '_entitiesPreview', (
        SELECT COALESCE(jsonb_agg(e->>'displayName'), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(elem->'affectedEntities', '[]'::jsonb)) WITH ORDINALITY AS t(e, idx)
        WHERE idx <= 3
      )
    )
  ), '[]'::jsonb)
  INTO v_insights
  FROM jsonb_array_elements(COALESCE(v_record.insights, '[]'::jsonb)) AS elem;

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