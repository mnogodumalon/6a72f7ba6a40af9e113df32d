import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'rechnungsnummer',
    'auftrag',
    'kunde',
    'nettobetrag',
    'mwst_satz',
    'bruttobetrag',
    { row: ['rechnungsdatum', 'faelligkeitsdatum'] },
    'status_rechnung',
  ],
  defaults: {
    'rechnungsdatum': { kind: 'today' },
    'faelligkeitsdatum': { kind: 'todayOffset', days: 14 },
    'status_rechnung': { kind: 'lookup', key: 'offen', label: 'Offen' },
    'mwst_satz': { kind: 'lookup', key: 'mwst_19', label: '19 %' },
  },
  computed: {
    '_mwst_betrag': (_fields, ctx) => {
      const netto = ctx.num('nettobetrag');
      const satz = ctx.lookupKey('mwst_satz');
      const prozent = satz === 'mwst_19' ? 0.19 : satz === 'mwst_7' ? 0.07 : 0;
      return netto * prozent;
    },
    'bruttobetrag': (_fields, ctx) => {
      const netto = ctx.num('nettobetrag');
      const satz = ctx.lookupKey('mwst_satz');
      const prozent = satz === 'mwst_19' ? 0.19 : satz === 'mwst_7' ? 0.07 : 0;
      const mwst = netto * prozent;
      return netto + mwst;
    },
  },
};

export const computedDeps: Record<string, string[]> = {
  '_mwst_betrag': ['nettobetrag', 'mwst_satz'],
  'bruttobetrag': ['nettobetrag', 'mwst_satz'],
};

export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
