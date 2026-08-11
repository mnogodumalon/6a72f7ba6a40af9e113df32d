import { lookupLabel } from '@/i18n';

// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Kunden {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    email?: string;
    telefon?: string;
    strasse?: string;
    hausnummer?: string;
    plz?: string;
    ort?: string;
    bemerkungen_kunde?: string;
  };
}

export interface Fahrzeuge {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    kennzeichen?: string;
    marke?: string;
    modell?: string;
    baujahr?: number;
    fin?: string;
    kilometerstand?: number;
    kunde?: string; // applookup -> URL zu 'Kunden' Record
  };
}

export interface Auftraege {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    fahrzeug?: string; // applookup -> URL zu 'Fahrzeuge' Record
    kunde?: string; // applookup -> URL zu 'Kunden' Record
    arbeitsbeschreibung?: string;
    wunschtermin?: string; // Format: YYYY-MM-DD oder ISO String
    status?: LookupValue;
    prioritaet?: LookupValue;
    bemerkungen_auftrag?: string;
    auftragsnummer?: string;
  };
}

export interface Rechnungen {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    rechnungsnummer?: string;
    auftrag?: string; // applookup -> URL zu 'Auftraege' Record
    kunde?: string; // applookup -> URL zu 'Kunden' Record
    nettobetrag?: number;
    mwst_satz?: LookupValue;
    bruttobetrag?: number;
    rechnungsdatum?: string; // Format: YYYY-MM-DD oder ISO String
    faelligkeitsdatum?: string; // Format: YYYY-MM-DD oder ISO String
    status_rechnung?: LookupValue;
    pdf_anhang?: string;
  };
}

export interface JahresinspektionPlanen {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    fahrzeug?: string; // applookup -> URL zu 'Fahrzeuge' Record
    wunschtermin_inspektion?: string; // Format: YYYY-MM-DD oder ISO String
    arbeitsbeschreibung_inspektion?: string;
    bemerkungen_inspektion?: string;
  };
}

export interface RechnungsPdfErstellen {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    rechnung?: string; // applookup -> URL zu 'Rechnungen' Record
    pdf_rechnungsnummer?: string;
    pdf_kunde_vorname?: string;
    pdf_kunde_nachname?: string;
    pdf_nettobetrag?: number;
    pdf_bruttobetrag?: number;
    pdf_datei?: string;
  };
}

export const APP_IDS = {
  KUNDEN: '6a72f781de936e1d254dc6ed',
  FAHRZEUGE: '6a72f788338628c33dae785b',
  AUFTRAEGE: '6a72f7889aafee219a9f50a8',
  RECHNUNGEN: '6a72f7897299d4ffe60e7b38',
  JAHRESINSPEKTION_PLANEN: '6a72f78a1d1159b7dce978e4',
  RECHNUNGS_PDF_ERSTELLEN: '6a72f78ac9f11ddcdfa67a30',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'auftraege': {
    status: [{ key: "offen", get label() { return lookupLabel('auftraege', 'status', "offen") ?? "Offen"; } }, { key: "in_bearbeitung", get label() { return lookupLabel('auftraege', 'status', "in_bearbeitung") ?? "In Bearbeitung"; } }, { key: "abgeschlossen", get label() { return lookupLabel('auftraege', 'status', "abgeschlossen") ?? "Abgeschlossen"; } }],
    prioritaet: [{ key: "niedrig", get label() { return lookupLabel('auftraege', 'prioritaet', "niedrig") ?? "Niedrig"; } }, { key: "normal", get label() { return lookupLabel('auftraege', 'prioritaet', "normal") ?? "Normal"; } }, { key: "hoch", get label() { return lookupLabel('auftraege', 'prioritaet', "hoch") ?? "Hoch"; } }],
  },
  'rechnungen': {
    mwst_satz: [{ key: "mwst_19", get label() { return lookupLabel('rechnungen', 'mwst_satz', "mwst_19") ?? "19 %"; } }, { key: "mwst_7", get label() { return lookupLabel('rechnungen', 'mwst_satz', "mwst_7") ?? "7 %"; } }, { key: "mwst_0", get label() { return lookupLabel('rechnungen', 'mwst_satz', "mwst_0") ?? "0 %"; } }],
    status_rechnung: [{ key: "offen", get label() { return lookupLabel('rechnungen', 'status_rechnung', "offen") ?? "Offen"; } }, { key: "bezahlt", get label() { return lookupLabel('rechnungen', 'status_rechnung', "bezahlt") ?? "Bezahlt"; } }, { key: "ueberfaellig", get label() { return lookupLabel('rechnungen', 'status_rechnung', "ueberfaellig") ?? "Überfällig"; } }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'kunden': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'email': 'string/email',
    'telefon': 'string/tel',
    'strasse': 'string/text',
    'hausnummer': 'string/text',
    'plz': 'string/text',
    'ort': 'string/text',
    'bemerkungen_kunde': 'string/textarea',
  },
  'fahrzeuge': {
    'kennzeichen': 'string/text',
    'marke': 'string/text',
    'modell': 'string/text',
    'baujahr': 'number',
    'fin': 'string/text',
    'kilometerstand': 'number',
    'kunde': 'applookup/select',
  },
  'auftraege': {
    'fahrzeug': 'applookup/select',
    'kunde': 'applookup/select',
    'arbeitsbeschreibung': 'string/textarea',
    'wunschtermin': 'date/datetimeminute',
    'status': 'lookup/select',
    'prioritaet': 'lookup/radio',
    'bemerkungen_auftrag': 'string/textarea',
    'auftragsnummer': 'string/text',
  },
  'rechnungen': {
    'rechnungsnummer': 'string/text',
    'auftrag': 'applookup/select',
    'kunde': 'applookup/select',
    'nettobetrag': 'number',
    'mwst_satz': 'lookup/radio',
    'bruttobetrag': 'number',
    'rechnungsdatum': 'date/date',
    'faelligkeitsdatum': 'date/date',
    'status_rechnung': 'lookup/select',
    'pdf_anhang': 'file',
  },
  'jahresinspektion_planen': {
    'fahrzeug': 'applookup/select',
    'wunschtermin_inspektion': 'date/datetimeminute',
    'arbeitsbeschreibung_inspektion': 'string/textarea',
    'bemerkungen_inspektion': 'string/textarea',
  },
  'rechnungs_pdf_erstellen': {
    'rechnung': 'applookup/select',
    'pdf_rechnungsnummer': 'string/text',
    'pdf_kunde_vorname': 'string/text',
    'pdf_kunde_nachname': 'string/text',
    'pdf_nettobetrag': 'number',
    'pdf_bruttobetrag': 'number',
    'pdf_datei': 'file',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
  'kunden': [
    { field: 'kunde', entity: 'fahrzeuge' },
    { field: 'kunde', entity: 'auftraege' },
    { field: 'kunde', entity: 'rechnungen' },
  ],
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateKunden = StripLookup<Kunden['fields']>;
export type CreateFahrzeuge = StripLookup<Fahrzeuge['fields']>;
export type CreateAuftraege = StripLookup<Auftraege['fields']>;
export type CreateRechnungen = StripLookup<Rechnungen['fields']>;
export type CreateJahresinspektionPlanen = StripLookup<JahresinspektionPlanen['fields']>;
export type CreateRechnungsPdfErstellen = StripLookup<RechnungsPdfErstellen['fields']>;