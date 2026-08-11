import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['rechnung', 'pdf_rechnungsnummer', { row: ['pdf_kunde_vorname', 'pdf_kunde_nachname'] }, 'pdf_nettobetrag', 'pdf_bruttobetrag'],
  defaults: {},
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
