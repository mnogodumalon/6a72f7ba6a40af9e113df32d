import type { Auftraege, Fahrzeuge, JahresinspektionPlanen, Rechnungen, RechnungsPdfErstellen } from './app';

export type EnrichedFahrzeuge = Fahrzeuge & {
  kundeName: string;
};

export type EnrichedAuftraege = Auftraege & {
  fahrzeugName: string;
  kundeName: string;
};

export type EnrichedRechnungen = Rechnungen & {
  auftragName: string;
  kundeName: string;
};

export type EnrichedJahresinspektionPlanen = JahresinspektionPlanen & {
  fahrzeugName: string;
};

export type EnrichedRechnungsPdfErstellen = RechnungsPdfErstellen & {
  rechnungName: string;
};
