import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['fahrzeug', 'kunde', 'status', 'prioritaet', 'wunschtermin', 'auftragsnummer', 'arbeitsbeschreibung', 'bemerkungen_auftrag'],
  defaults: {
    status: { kind: 'lookup', key: 'offen', label: 'Offen' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
