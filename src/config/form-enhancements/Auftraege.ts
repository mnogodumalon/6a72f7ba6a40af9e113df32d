import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'fahrzeug',
    'kunde',
    'auftragsnummer',
    'arbeitsbeschreibung',
    'wunschtermin',
    'status',
    'prioritaet',
    'bemerkungen_auftrag',
  ],
  defaults: {
    'status': { kind: 'lookup', key: 'offen', label: 'Offen' },
    'wunschtermin': { kind: 'today', withTime: true },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};

export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
