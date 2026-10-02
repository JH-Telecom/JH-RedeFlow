CREATE OR REPLACE FUNCTION public.redeflow_normalize_search(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT translate(
    lower(coalesce(input, '')),
    'áàâãäåéèêëíìîïóòôõöøúùûüçñýÿ',
    'aaaaaaeeeeiiiioooooouuuucnyy'
  );
$$;

CREATE OR REPLACE FUNCTION public.list_calls_page(
  p_status text[],
  p_from date,
  p_to date,
  p_supervisor_id uuid,
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
  WITH matching AS MATERIALIZED (
    SELECT
      c.id,
      c.opened_at,
      c.status,
      c.region,
      c.client,
      c.order_number,
      c.olt,
      c.bairro,
      c.technician_id,
      t.name AS technician_name,
      s.name AS supervisor_name
    FROM calls c
    LEFT JOIN technicians t ON t.id = c.technician_id
    LEFT JOIN supervisors s ON s.id = t.supervisor_id
    WHERE (p_status IS NULL OR cardinality(p_status) = 0 OR c.status = ANY(p_status))
      AND (p_from IS NULL OR (CASE WHEN c.status IN ('Finalizado', 'Cancelado', 'Baixar') THEN COALESCE(c.executed_at, c.opened_at) ELSE c.opened_at END)::date >= p_from)
      AND (p_to IS NULL OR (CASE WHEN c.status IN ('Finalizado', 'Cancelado', 'Baixar') THEN COALESCE(c.executed_at, c.opened_at) ELSE c.opened_at END)::date <= p_to)
      AND (p_supervisor_id IS NULL OR t.supervisor_id = p_supervisor_id)
      AND (p_region IS NULL OR c.region = p_region)
      AND (p_neighborhood IS NULL OR c.bairro = p_neighborhood)
      AND (
        NULLIF(btrim(p_search), '') IS NULL
        OR strpos(
          public.redeflow_normalize_search(concat_ws(' ', c.order_number, c.client, c.bdesk, c.region, c.city, c.bairro, c.address, c.type, t.name, s.name, c.olt)),
          public.redeflow_normalize_search(p_search)
        ) > 0
      )
  ),
  filtered AS MATERIALIZED (
    SELECT *
    FROM matching
    WHERE p_olt IS NULL OR upper(btrim(COALESCE(olt, ''))) = upper(btrim(p_olt))
  ),
  totals AS (
    SELECT count(*)::integer AS total FROM filtered
  ),
  page_info AS (
    SELECT
      total,
      LEAST(GREATEST(COALESCE(p_page_size, 100), 1), 100) AS page_size,
      GREATEST(1, CEIL(total::numeric / LEAST(GREATEST(COALESCE(p_page_size, 100), 1), 100))::integer) AS total_pages,
      LEAST(
        GREATEST(COALESCE(p_page, 1), 1),
        GREATEST(1, CEIL(total::numeric / LEAST(GREATEST(COALESCE(p_page_size, 100), 1), 100))::integer)
      ) AS page
    FROM totals
  ),
  ordered AS MATERIALIZED (
    SELECT
      f.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN p_sort = 'openedAt' AND p_direction = 'asc' THEN f.opened_at END ASC,
          CASE WHEN p_sort = 'openedAt' AND p_direction <> 'asc' THEN f.opened_at END DESC,
          CASE WHEN p_sort = 'status' AND p_direction = 'asc' THEN f.status END ASC,
          CASE WHEN p_sort = 'status' AND p_direction <> 'asc' THEN f.status END DESC,
          CASE WHEN p_sort = 'region' AND p_direction = 'asc' THEN f.region END ASC,
          CASE WHEN p_sort = 'region' AND p_direction <> 'asc' THEN f.region END DESC,
          CASE WHEN p_sort = 'technicianName' AND p_direction = 'asc' THEN f.technician_name END ASC,
          CASE WHEN p_sort = 'technicianName' AND p_direction <> 'asc' THEN f.technician_name END DESC,
          CASE WHEN p_sort = 'client' AND p_direction = 'asc' THEN f.client END ASC,
          CASE WHEN p_sort = 'client' AND p_direction <> 'asc' THEN f.client END DESC,
          CASE WHEN p_sort = 'orderNumber' AND p_direction = 'asc' THEN f.order_number END ASC,
          CASE WHEN p_sort = 'orderNumber' AND p_direction <> 'asc' THEN f.order_number END DESC,
          f.opened_at DESC,
          f.id ASC
      ) AS page_row
    FROM filtered f
  ),
  page_rows AS (
    SELECT o.*
    FROM ordered o
    CROSS JOIN page_info p
    WHERE o.page_row > (p.page - 1) * p.page_size
      AND o.page_row <= p.page * p.page_size
  ),
  page_calls AS (
    SELECT
      p.page_row,
      jsonb_strip_nulls(jsonb_build_object(
        'id', c.id,
        'orderNumber', c.order_number,
        'bdesk', COALESCE(c.bdesk, ''),
        'officeTrack', COALESCE(c.office_track, ''),
        'client', COALESCE(c.client, ''),
        'type', COALESCE(c.type, ''),
        'reason', COALESCE(c.reason, ''),
        'region', COALESCE(c.region, ''),
        'city', COALESCE(c.city, ''),
        'address', COALESCE(c.address, ''),
        'bairro', COALESCE(c.bairro, ''),
        'ofsStatus', c.ofs_status,
        'olt', COALESCE(c.olt, ''),
        'slotPon', COALESCE(c.slot_pon, ''),
        'status', c.status,
        'technicianId', c.technician_id,
        'technicianName', t.name,
        'supervisorName', s.name,
        'openedAt', c.opened_at,
        'assignedAt', c.assigned_at,
        'executedAt', c.executed_at,
        'result', c.result,
        'cancellationReason', c.cancellation_reason,
        'notes', COALESCE(c.notes, ''),
        'lastObservationAt', latest_observation.created_at
      )) AS payload
    FROM page_rows p
    JOIN calls c ON c.id = p.id
    LEFT JOIN technicians t ON t.id = c.technician_id
    LEFT JOIN supervisors s ON s.id = t.supervisor_id
    LEFT JOIN LATERAL (
      SELECT created_at
      FROM call_observations
      WHERE call_id = c.id
      ORDER BY created_at DESC
      LIMIT 1
    ) latest_observation ON true
  ),
  available_olts AS (
    SELECT COALESCE(jsonb_agg(olt ORDER BY olt), '[]'::jsonb) AS olts
    FROM (SELECT DISTINCT btrim(olt) AS olt FROM matching WHERE NULLIF(btrim(olt), '') IS NOT NULL) values_by_olt
  )
  SELECT jsonb_build_object(
    'calls', COALESCE((SELECT jsonb_agg(payload ORDER BY page_row) FROM page_calls), '[]'::jsonb),
    'total', page_info.total,
    'page', page_info.page,
    'pageSize', page_info.page_size,
    'totalPages', page_info.total_pages,
    'olts', available_olts.olts
  )
  FROM page_info CROSS JOIN available_olts;
$$;

CREATE INDEX IF NOT EXISTS calls_opened_id_idx ON calls(opened_at DESC, id ASC);
CREATE INDEX IF NOT EXISTS calls_status_opened_id_idx ON calls(status, opened_at DESC, id ASC);
CREATE INDEX IF NOT EXISTS calls_region_status_opened_id_idx ON calls(region, status, opened_at DESC, id ASC) WHERE region IS NOT NULL;
CREATE INDEX IF NOT EXISTS calls_olt_status_opened_id_idx ON calls(olt, status, opened_at DESC, id ASC) WHERE olt IS NOT NULL;