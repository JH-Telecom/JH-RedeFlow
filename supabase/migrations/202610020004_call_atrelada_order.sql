ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS atrelada_order varchar(100);

CREATE OR REPLACE FUNCTION public.list_calls_page_with_atrelada(
  p_status text[],
  p_from date,
  p_to date,
  p_supervisor_id uuid,
  p_has_technician boolean,
  p_search text,
  p_region text,
  p_neighborhood text,
  p_olt text,
  p_sort text,
  p_direction text,
  p_page integer,
  p_page_size integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT page_result.data || jsonb_build_object(
    'calls', COALESCE((
      SELECT jsonb_agg(
        item.call_json || jsonb_strip_nulls(jsonb_build_object('atrelada', c.atrelada_order))
        ORDER BY item.ordinality
      )
      FROM jsonb_array_elements(page_result.data -> 'calls') WITH ORDINALITY AS item(call_json, ordinality)
      LEFT JOIN public.calls c ON c.id = (item.call_json ->> 'id')::uuid
    ), '[]'::jsonb)
  )
  FROM (
    SELECT public.list_calls_page_with_assignment(
      p_status, p_from, p_to, p_supervisor_id, p_has_technician, p_search,
      p_region, p_neighborhood, p_olt, p_sort, p_direction, p_page, p_page_size
    ) AS data
  ) AS page_result;
$$;