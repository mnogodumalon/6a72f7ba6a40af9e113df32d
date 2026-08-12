// Auto-generated. Per-entity form-enhancements config for "Rechnungen".
// The sandbox sub-agent (Step 0) may overwrite this file with a richer config.
// Schema: see ./types.ts.

import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'rechnungsnummer',
    'auftrag',
    'kunde',
    'rechnungsdatum',
    'nettobetrag',
    'mwst_satz',
    'bruttobetrag',
    'faelligkeitsdatum',
    'status_rechnung',
  ],
  defaults: {
    'rechnungsdatum': { kind: 'today' },
    'faelligkeitsdatum': { kind: 'todayOffset', days: 14 },
    'status_rechnung': { kind: 'lookup', key: 'offen', label: 'Offen' },
  },
  computed: {
    '_mwst_betrag': (_fields, ctx) => {
      const netto = ctx.num('nettobetrag');
      const satzKey = ctx.lookupKey('mwst_satz');
      const satz = satzKey === 'mwst_19' ? 0.19 : satzKey === 'mwst_7' ? 0.07 : 0;
      return netto * satz;
    },
    'bruttobetrag': (_fields, ctx) => {
      const netto = ctx.num('nettobetrag');
      const satzKey = ctx.lookupKey('mwst_satz');
      const satz = satzKey === 'mwst_19' ? 0.19 : satzKey === 'mwst_7' ? 0.07 : 0;
      return netto + (netto * satz);
    },
  },
};

// Build-time-populated field dependencies for MODUS-2 arrow functions in
// `computed`. The sub-agent leaves this empty; scripts/parse-formulas.mjs
// fills it after Step 0 by regex-extracting ctx.* calls from each function
// body. The dialog feeds these into classifyComputed so MODUS-2 entries get
// inline anchors instead of always landing in the aggregate section.
export const computedDeps: Record<string, string[]> = {
  '_mwst_betrag': ['nettobetrag', 'mwst_satz'],
  'bruttobetrag': ['nettobetrag', 'mwst_satz'],
};

// Build-time-populated applookup (ownKey → lookupKey) pairs found in MODUS-2
// arrow functions. Filled by scripts/parse-formulas.mjs from regex matches
// on `ctx.applookup('x','y')` and `ctx.applookupAny('x','y')`. The dialog
// merges this with MODUS-1 refs extracted at render time, so every numeric
// field the formula pulls from a selected lookup is surfaced as an inline
// hint next to the lookup combobox.
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
