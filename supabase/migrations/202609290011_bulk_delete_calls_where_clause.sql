CREATE OR REPLACE FUNCTION public.delete_all_calls()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM public.call_logs WHERE call_id IS NOT NULL;
  DELETE FROM public.call_observations WHERE call_id IS NOT NULL;
  DELETE FROM public.calls WHERE id IS NOT NULL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_all_calls() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_calls() TO service_role;