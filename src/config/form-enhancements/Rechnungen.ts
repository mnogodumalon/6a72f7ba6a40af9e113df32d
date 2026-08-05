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
    'mwst_satz': { kind: 'lookup', key: 'mwst_19', label: '19 %' },
    'status_rechnung': { kind: 'lookup', key: 'offen', label: 'Offen' },
  },
  computed: {
    'mwst_betrag': (_fields, ctx) => {
      const netto = ctx.num('nettobetrag');
      const satzKey = ctx.lookupKey('mwst_satz');
      const satz = satzKey === 'mwst_19' ? 0.19 : satzKey === 'mwst_7' ? 0.07 : 0;
      return netto * satz;
    },
    '_gesamt_betrag': { op: 'add', left: { kind: 'field', key: 'nettobetrag' }, right: { kind: 'field', key: 'mwst_betrag' } },
  },
};

export const computedDeps: Record<string, string[]> = {
  'mwst_betrag': ['nettobetrag', 'mwst_satz'],
};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
