import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'fahrzeug',
    'wunschtermin_inspektion',
    'arbeitsbeschreibung_inspektion',
    'bemerkungen_inspektion',
  ],
  defaults: {
    'wunschtermin_inspektion': { kind: 'todayOffset', days: 7, withTime: true },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
