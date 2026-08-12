import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'fahrzeug',
    'kunde',
    'auftragsnummer',
    'wunschtermin',
    'status',
    'prioritaet',
    'arbeitsbeschreibung',
    'bemerkungen_auftrag',
  ],
  defaults: {
    'wunschtermin': { kind: 'today', withTime: true },
    'status': { kind: 'lookup', key: 'offen', label: 'Offen' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
