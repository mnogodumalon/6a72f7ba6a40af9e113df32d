import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

/** Dashboard data + the OPTIMISTIC-WRITE API.
 *
 *  The per-entity setters (`set<Entity>`) are exported for exactly one job:
 *  optimistic updates on drag writes (onEventDrop / onEventResize /
 *  onCardMove). Call the setter FIRST — the bar/card lands instantly — then
 *  fire the PATCH in the background and call `fetchAll()` ONLY in the catch.
 *  Never await the PATCH before updating state (the UI freezes for the full
 *  round-trip on every drag) and never refetch after a successful write.
 *  There is no other mechanism (no `__optimistic`, no `mutate`).
 */
export function useDashboardData() {
  const [kunden, setKunden] = useState<Kunden[]>([]);
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeuge[]>([]);
  const [auftraege, setAuftraege] = useState<Auftraege[]>([]);
  const [rechnungen, setRechnungen] = useState<Rechnungen[]>([]);
  const [jahresinspektionPlanen, setJahresinspektionPlanen] = useState<JahresinspektionPlanen[]>([]);
  const [rechnungsPdfErstellen, setRechnungsPdfErstellen] = useState<RechnungsPdfErstellen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [kundenData, fahrzeugeData, auftraegeData, rechnungenData, jahresinspektionPlanenData, rechnungsPdfErstellenData] = await Promise.all([
        LivingAppsService.getKunden(),
        LivingAppsService.getFahrzeuge(),
        LivingAppsService.getAuftraege(),
        LivingAppsService.getRechnungen(),
        LivingAppsService.getJahresinspektionPlanen(),
        LivingAppsService.getRechnungsPdfErstellen(),
      ]);
      setKunden(kundenData);
      setFahrzeuge(fahrzeugeData);
      setAuftraege(auftraegeData);
      setRechnungen(rechnungenData);
      setJahresinspektionPlanen(jahresinspektionPlanenData);
      setRechnungsPdfErstellen(rechnungsPdfErstellenData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    async function silentRefresh() {
      try {
        const [kundenData, fahrzeugeData, auftraegeData, rechnungenData, jahresinspektionPlanenData, rechnungsPdfErstellenData] = await Promise.all([
          LivingAppsService.getKunden(),
          LivingAppsService.getFahrzeuge(),
          LivingAppsService.getAuftraege(),
          LivingAppsService.getRechnungen(),
          LivingAppsService.getJahresinspektionPlanen(),
          LivingAppsService.getRechnungsPdfErstellen(),
        ]);
        setKunden(kundenData);
        setFahrzeuge(fahrzeugeData);
        setAuftraege(auftraegeData);
        setRechnungen(rechnungenData);
        setJahresinspektionPlanen(jahresinspektionPlanenData);
        setRechnungsPdfErstellen(rechnungsPdfErstellenData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  const kundenMap = useMemo(() => {
    const m = new Map<string, Kunden>();
    kunden.forEach(r => m.set(r.record_id, r));
    return m;
  }, [kunden]);

  const fahrzeugeMap = useMemo(() => {
    const m = new Map<string, Fahrzeuge>();
    fahrzeuge.forEach(r => m.set(r.record_id, r));
    return m;
  }, [fahrzeuge]);

  const auftraegeMap = useMemo(() => {
    const m = new Map<string, Auftraege>();
    auftraege.forEach(r => m.set(r.record_id, r));
    return m;
  }, [auftraege]);

  const rechnungenMap = useMemo(() => {
    const m = new Map<string, Rechnungen>();
    rechnungen.forEach(r => m.set(r.record_id, r));
    return m;
  }, [rechnungen]);

  return { kunden, setKunden, fahrzeuge, setFahrzeuge, auftraege, setAuftraege, rechnungen, setRechnungen, jahresinspektionPlanen, setJahresinspektionPlanen, rechnungsPdfErstellen, setRechnungsPdfErstellen, loading, error, fetchAll, kundenMap, fahrzeugeMap, auftraegeMap, rechnungenMap };
}