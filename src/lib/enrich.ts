import type { EnrichedAuftraege, EnrichedFahrzeuge, EnrichedJahresinspektionPlanen, EnrichedRechnungen, EnrichedRechnungsPdfErstellen } from '@/types/enriched';
import type { Auftraege, Fahrzeuge, JahresinspektionPlanen, Kunden, Rechnungen, RechnungsPdfErstellen } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface FahrzeugeMaps {
  kundenMap: Map<string, Kunden>;
}

export function enrichFahrzeuge(
  fahrzeuge: Fahrzeuge[],
  maps: FahrzeugeMaps
): EnrichedFahrzeuge[] {
  return fahrzeuge.map(r => ({
    ...r,
    kundeName: resolveDisplay(r.fields.kunde, maps.kundenMap, 'vorname', 'nachname'),
  }));
}

interface AuftraegeMaps {
  fahrzeugeMap: Map<string, Fahrzeuge>;
  kundenMap: Map<string, Kunden>;
}

export function enrichAuftraege(
  auftraege: Auftraege[],
  maps: AuftraegeMaps
): EnrichedAuftraege[] {
  return auftraege.map(r => ({
    ...r,
    fahrzeugName: resolveDisplay(r.fields.fahrzeug, maps.fahrzeugeMap, 'kennzeichen'),
    kundeName: resolveDisplay(r.fields.kunde, maps.kundenMap, 'vorname', 'nachname'),
  }));
}

interface RechnungenMaps {
  auftraegeMap: Map<string, Auftraege>;
  kundenMap: Map<string, Kunden>;
}

export function enrichRechnungen(
  rechnungen: Rechnungen[],
  maps: RechnungenMaps
): EnrichedRechnungen[] {
  return rechnungen.map(r => ({
    ...r,
    auftragName: resolveDisplay(r.fields.auftrag, maps.auftraegeMap, 'auftragsnummer'),
    kundeName: resolveDisplay(r.fields.kunde, maps.kundenMap, 'vorname', 'nachname'),
  }));
}

interface JahresinspektionPlanenMaps {
  fahrzeugeMap: Map<string, Fahrzeuge>;
}

export function enrichJahresinspektionPlanen(
  jahresinspektionPlanen: JahresinspektionPlanen[],
  maps: JahresinspektionPlanenMaps
): EnrichedJahresinspektionPlanen[] {
  return jahresinspektionPlanen.map(r => ({
    ...r,
    fahrzeugName: resolveDisplay(r.fields.fahrzeug, maps.fahrzeugeMap, 'kennzeichen'),
  }));
}

interface RechnungsPdfErstellenMaps {
  rechnungenMap: Map<string, Rechnungen>;
}

export function enrichRechnungsPdfErstellen(
  rechnungsPdfErstellen: RechnungsPdfErstellen[],
  maps: RechnungsPdfErstellenMaps
): EnrichedRechnungsPdfErstellen[] {
  return rechnungsPdfErstellen.map(r => ({
    ...r,
    rechnungName: resolveDisplay(r.fields.rechnung, maps.rechnungenMap, 'rechnungsnummer'),
  }));
}
