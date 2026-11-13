-- Mapa da rede (13/11/2026): search_path fixo na funcao network_clusters (nova migracao, a 202611130001 ja foi aplicada).
ALTER FUNCTION public.network_clusters(double precision, double precision, double precision, double precision, double precision) SET search_path = '';
