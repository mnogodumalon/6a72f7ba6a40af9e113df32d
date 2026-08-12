import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'rechnungsnummer',
    'auftrag',
    'kunde',
    'nettobetrag',
    'mwst_satz',
    'bruttobetrag',
    'rechnungsdatum',
    'faelligkeitsdatum',
    'status_rechnung',
  ],
  defaults: {
    'rechnungsdatum': { kind: 'today' },
    'faelligkeitsdatum': { kind: 'todayOffset', days: 14 },
    'status_rechnung': { kind: 'lookup', key: 'offen', label: 'Offen' },
    'mwst_satz': { kind: 'lookup', key: 'mwst_19', label: '19 %' },
  },
  computed: {
    '_mwst_betrag_berechnet': (_fields, ctx) => {
      const k = ctx.lookupKey('mwst_satz');
      const satz = k === 'mwst_19' ? 0.19 : k === 'mwst_7' ? 0.07 : 0;
      return ctx.num('nettobetrag') * satz;
    },
  },
};

export const computedDeps: Record<string, string[]> = {
  '_mwst_betrag_berechnet': ['nettobetrag', 'mwst_satz'],
};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
