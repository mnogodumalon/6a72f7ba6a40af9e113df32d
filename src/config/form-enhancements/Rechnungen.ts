import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'rechnungsnummer',
    'auftrag',
    'kunde',
    'rechnungsdatum',
    'faelligkeitsdatum',
    'nettobetrag',
    'mwst_satz',
    'bruttobetrag',
    'status_rechnung',
  ],
  defaults: {
    'rechnungsdatum': { kind: 'today' },
    'faelligkeitsdatum': { kind: 'todayOffset', days: 14 },
    'status_rechnung': { kind: 'lookup', key: 'offen', label: 'Offen' },
  },
  computed: {
    'bruttobetrag': (_fields, ctx) => {
      const netto = ctx.num('nettobetrag');
      const satzKey = ctx.lookupKey('mwst_satz');
      const faktor = satzKey === 'mwst_19' ? 1.19 : satzKey === 'mwst_7' ? 1.07 : 1.0;
      return netto * faktor;
    },
  },
};

export const computedDeps: Record<string, string[]> = {
  'bruttobetrag': ['nettobetrag', 'mwst_satz'],
};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
