import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'kennzeichen',
    'marke',
    'modell',
    'baujahr',
    'fin',
    'kilometerstand',
    'kunde',
  ],
  defaults: {
    'kilometerstand': { kind: 'literal', value: 0 },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
