import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['rechnungsnummer', 'auftrag', 'kunde', 'rechnungsdatum', 'faelligkeitsdatum', 'nettobetrag', 'mwst_satz', 'bruttobetrag', 'status_rechnung'],
  defaults: {
    rechnungsdatum: { kind: 'today' },
    faelligkeitsdatum: { kind: 'todayOffset', days: 14 },
    status_rechnung: { kind: 'lookup', key: 'offen', label: 'Offen' },
  },
  computed: {
    'mwst_betrag': (_fields, ctx) => {
      const netto = ctx.num('nettobetrag');
      const satzKey = ctx.lookupKey('mwst_satz');
      const satz = satzKey === 'mwst_19' ? 0.19 : satzKey === 'mwst_7' ? 0.07 : 0;
      return netto * satz;
    },
    'bruttobetrag': (_fields, ctx) => {
      const netto = ctx.num('nettobetrag');
      const satzKey = ctx.lookupKey('mwst_satz');
      const satz = satzKey === 'mwst_19' ? 0.19 : satzKey === 'mwst_7' ? 0.07 : 0;
      return netto + netto * satz;
    },
  },
};

export const computedDeps: Record<string, string[]> = {
  'mwst_betrag': ['nettobetrag', 'mwst_satz'],
  'bruttobetrag': ['nettobetrag', 'mwst_satz'],
};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
