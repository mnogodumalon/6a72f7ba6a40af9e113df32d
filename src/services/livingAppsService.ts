// AUTOMATICALLY GENERATED SERVICE
import { APP_IDS, LOOKUP_OPTIONS, FIELD_TYPES } from '@/types/app';
import { ensureUploadableImage } from '@/lib/ai';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen, CreateKunden, CreateFahrzeuge, CreateAuftraege, CreateRechnungen, CreateJahresinspektionPlanen, CreateRechnungsPdfErstellen } from '@/types/app';

// Base Configuration
const API_BASE_URL = 'https://my.living-apps.de/rest';

// --- HELPER FUNCTIONS ---
export function extractRecordId(url: unknown): string | null {
  if (!url) return null;
  if (typeof url !== 'string') return null;
  const match = url.match(/([a-f0-9]{24})$/i);
  return match ? match[1] : null;
}

// multipleapplookup form-state is Array<URL>. The MultiCombobox picker
// works on record-ids; this helper maps a raw form value (which may be
// undefined, null, a single URL string from a legacy single-Combobox
// render, or the expected URL array) to a clean string[] of ids.
export function extractRecordIds(urls: unknown): string[] {
  if (!urls) return [];
  const arr = Array.isArray(urls) ? urls : [urls];
  const out: string[] = [];
  for (const u of arr) {
    const id = extractRecordId(u);
    if (id) out.push(id);
  }
  return out;
}

export function createRecordUrl(appId: string, recordId: string): string {
  return `https://my.living-apps.de/rest/apps/${appId}/records/${recordId}`;
}

export class LivingAppsApiError extends Error {
  status: number;
  type?: string;
  control_identifier?: string;
  control_type?: string;
  field_type?: string;
  detail?: string;
  constructor(message: string, status: number, raw?: Record<string, unknown>) {
    super(message);
    this.name = 'LivingAppsApiError';
    this.status = status;
    if (raw) {
      this.type = typeof raw.type === 'string' ? raw.type : undefined;
      this.control_identifier = typeof raw.control_identifier === 'string' ? raw.control_identifier : undefined;
      this.control_type = typeof raw.control_type === 'string' ? raw.control_type : undefined;
      this.field_type = typeof raw.field_type === 'string' ? raw.field_type : undefined;
      this.detail = typeof raw.detail === 'string' ? raw.detail : undefined;
    }
  }
}

async function parseErrorBody(response: Response): Promise<{ message: string; raw?: Record<string, unknown> }> {
  const text = await response.text();
  if (!text) return { message: `HTTP ${response.status}` };
  try {
    const raw = JSON.parse(text);
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      const message = typeof obj.detail === 'string' ? obj.detail
        : typeof obj.title === 'string' ? obj.title
        : text;
      return { message, raw: obj };
    }
  } catch { /* fall through to text */ }
  return { message: text };
}

export interface CallApiOptions {
  /** Skip errorbus dispatch for expected failures (e.g. optional-param 404s). */
  silent?: boolean;
}

/** What the create and update helpers resolve to. Same `record_id`
 *  the read helpers expose, so the whole family behaves alike — the
 *  raw REST answer only
 *  carries `id`, and code that guessed (e.g. Object.keys(res)[0]) built
 *  `/records/id` and got a 400 on the next write. */
export interface MutationResult {
  record_id: string;
  id: string;
  fields: Record<string, any>;
  [key: string]: any;
}

async function callApi(method: string, endpoint: string, data?: any, options?: CallApiOptions) {
  const silent = options?.silent === true;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',  // Nutze Session Cookies für Auth
      body: data ? JSON.stringify(data) : undefined
    });
  } catch (netErr) {
    const message = netErr instanceof Error ? netErr.message : String(netErr);
    if (!silent) {
      window.dispatchEvent(new CustomEvent('errorbus:emit', { detail: {
        source: 'network', message, status: 0,
      } }));
    }
    throw netErr;
  }
  if (!response.ok) {
    // 401/403 go to the login screen only — never to the errorbus (repair can't fix auth).
    const isAuthError = response.status === 401 || response.status === 403;
    if (isAuthError) window.dispatchEvent(new Event('auth-error'));
    const { message, raw } = await parseErrorBody(response);
    const err = new LivingAppsApiError(message, response.status, raw);
    if (!silent && !isAuthError) {
      window.dispatchEvent(new CustomEvent('errorbus:emit', { detail: {
        source: 'api',
        status: err.status,
        type: err.type,
        control_identifier: err.control_identifier,
        control_type: err.control_type,
        field_type: err.field_type,
        detail: err.detail,
        message: err.message,
      } }));
    }
    throw err;
  }
  // DELETE returns often empty body or simple status
  if (method === 'DELETE') return true;
  return response.json();
}

/** Upload a file to LivingApps. Returns the file URL for use in record fields. */
export async function uploadFile(file: File | Blob, filename?: string): Promise<string> {
  // HEIC/HEIF (iPhone photos) crash the server-side image decoder (500).
  // Convert to JPEG in the browser BEFORE upload — every upload path routes
  // through here, so this one guard covers form fields AND attachments.
  if (file instanceof File) file = await ensureUploadableImage(file);
  const formData = new FormData();
  formData.append('file', file, filename ?? (file instanceof File ? file.name : 'upload'));
  const res = await fetch(`${API_BASE_URL}/files`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) window.dispatchEvent(new Event('auth-error'));
    throw new Error(`File upload failed: ${res.status}`);
  }
  const data = await res.json();
  return data.url;
}

// --- ATTACHMENT API ---
// Record-attachments: file/note/url/json blobs attached to a single record.
// `getAttachments` returns a dict keyed by attachment id; we flatten to an array.
export async function getRecordAttachments(appId: string, recordId: string) {
  const data = await callApi('GET', `/apps/${appId}/records/${recordId}/attachments`, undefined, { silent: true }).catch(() => ({}));
  if (!data || typeof data !== 'object') return [] as import('@/types/app').Attachment[];
  return Object.entries(data).map(([id, att]) => ({ id, ...(att as Record<string, unknown>) })) as import('@/types/app').Attachment[];
}

export async function createRecordAttachment(appId: string, recordId: string, input: import('@/types/app').AttachmentInput) {
  return callApi('POST', `/apps/${appId}/records/${recordId}/attachments`, input) as Promise<import('@/types/app').Attachment>;
}

export async function updateRecordAttachment(appId: string, recordId: string, attachmentId: string, input: Partial<import('@/types/app').AttachmentInput>) {
  return callApi('PATCH', `/apps/${appId}/records/${recordId}/attachments/${attachmentId}`, input) as Promise<import('@/types/app').Attachment>;
}

export async function deleteRecordAttachment(appId: string, recordId: string, attachmentId: string) {
  return callApi('DELETE', `/apps/${appId}/records/${recordId}/attachments/${attachmentId}`);
}

function enrichLookupFields<T extends { fields: Record<string, unknown> }>(
  records: T[], entityKey: string
): T[] {
  const opts = LOOKUP_OPTIONS[entityKey];
  if (!opts) return records;
  return records.map(r => {
    const fields = { ...r.fields };
    for (const [fieldKey, options] of Object.entries(opts)) {
      const val = fields[fieldKey];
      if (typeof val === 'string') {
        const m = options.find(o => o.key === val);
        fields[fieldKey] = m ?? { key: val, label: val };
      } else if (Array.isArray(val)) {
        fields[fieldKey] = val.map(v => {
          if (typeof v === 'string') {
            const m = options.find(o => o.key === v);
            return m ?? { key: v, label: v };
          }
          return v;
        });
      }
    }
    return { ...r, fields } as T;
  });
}

/** Normalize fields for API writes: strip lookup objects to keys, fix date formats. */
export function cleanFieldsForApi(
  fields: Record<string, unknown>,
  entityKey: string
): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...fields };
  // Strip virtual / unknown keys before they hit the API. Sub-agent invents
  // computed-only keys (e.g. `_netto`, `_bestellung_gesamtbetrag`) for the
  // 'Berechnungen' display, and a leaky submit-backfill would otherwise send
  // them to the Living-Apps backend which rejects with 'field does not exist'.
  const known = FIELD_TYPES[entityKey];
  if (known) {
    for (const k of Object.keys(clean)) {
      if (!(k in known)) delete clean[k];
    }
  }
  for (const [k, v] of Object.entries(clean)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'key' in v) clean[k] = (v as any).key;
    if (Array.isArray(v)) clean[k] = v.map((item: any) => item && typeof item === 'object' && 'key' in item ? item.key : item);
  }
  const types = FIELD_TYPES[entityKey];
  if (types) {
    for (const [k, ft] of Object.entries(types)) {
      if (!(k in clean)) continue;
      const val = clean[k];
      // applookup fields: undefined → null (clear single reference)
      if ((ft === 'applookup/select' || ft === 'applookup/choice') && val === undefined) { clean[k] = null; continue; }
      // multipleapplookup fields: undefined/null → [] (clear multi reference)
      if ((ft === 'multipleapplookup/select' || ft === 'multipleapplookup/choice') && (val === undefined || val === null)) { clean[k] = []; continue; }
      // lookup fields: undefined → null (clear single lookup)
      if ((ft.startsWith('lookup/')) && val === undefined) { clean[k] = null; continue; }
      // multiplelookup fields: undefined/null → [] (clear multi lookup)
      if ((ft.startsWith('multiplelookup/')) && (val === undefined || val === null)) { clean[k] = []; continue; }
      if (typeof val !== 'string' || !val) continue;
      if (ft === 'date/datetimeminute') clean[k] = val.slice(0, 16);
      else if (ft === 'date/date') clean[k] = val.slice(0, 10);
    }
  }
  return clean;
}

let _cachedUserProfile: Record<string, unknown> | null = null;

export async function getUserProfile(): Promise<Record<string, unknown>> {
  if (_cachedUserProfile) return _cachedUserProfile;
  const raw = await callApi('GET', '/user');
  const skip = new Set(['id', 'image', 'lang', 'gender', 'title', 'fax', 'menus', 'initials']);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v != null && !skip.has(k)) data[k] = v;
  }
  _cachedUserProfile = data;
  return data;
}

export interface HeaderProfile {
  firstname: string;
  surname: string;
  email: string;
  image: string | null;
  company: string | null;
}

let _cachedHeaderProfile: HeaderProfile | null = null;

export async function getHeaderProfile(): Promise<HeaderProfile> {
  if (_cachedHeaderProfile) return _cachedHeaderProfile;
  const raw = await callApi('GET', '/user');
  _cachedHeaderProfile = {
    firstname: raw.firstname ?? '',
    surname: raw.surname ?? '',
    email: raw.email ?? '',
    image: raw.image ?? null,
    company: raw.company ?? null,
  };
  return _cachedHeaderProfile;
}

export interface AppGroupInfo {
  id: string;
  name: string;
  image: string | null;
  createdat: string;
  /** Resolved link: /objects/{id}/ if the dashboard exists, otherwise /gateway/apps/{firstAppId}?template=list_page */
  href: string;
}

let _cachedAppGroups: AppGroupInfo[] | null = null;

export async function getAppGroups(): Promise<AppGroupInfo[]> {
  if (_cachedAppGroups) return _cachedAppGroups;
  const raw = await callApi('GET', '/appgroups?with=apps');
  const groups: AppGroupInfo[] = Object.values(raw)
    .map((g: any) => {
      const firstAppId = Object.keys(g.apps ?? {})[0] ?? g.id;
      return {
        id: g.id,
        name: g.name,
        image: g.image ?? null,
        // API field is created_at (snake_case) — the old camelCase read
        // left every group '', silently disabling the newest-first sort.
        createdat: g.created_at ?? g.createdat ?? '',
        href: `/gateway/apps/${firstAppId}?template=list_page`,
        _firstAppId: firstAppId,
      };
    })
    .sort((a, b) => b.createdat.localeCompare(a.createdat));

  // Check which appgroups have a deployed dashboard via app params
  const paramChecks = await Promise.allSettled(
    groups.map(g => callApi('GET', `/apps/${(g as any)._firstAppId}/params/la_page_header_additional_url`, undefined, { silent: true }))
  );
  paramChecks.forEach((result, i) => {
    if (result.status !== 'fulfilled' || !result.value) return;
    const url = result.value.value;
    if (typeof url === 'string' && url.length > 0) {
      try { groups[i].href = new URL(url).pathname; } catch { groups[i].href = url; }
    }
  });

  // Clean up internal helper property
  groups.forEach(g => delete (g as any)._firstAppId);

  _cachedAppGroups = groups;
  return _cachedAppGroups;
}

export class LivingAppsService {
  // --- KUNDEN ---
  static async getKunden(): Promise<Kunden[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.KUNDEN}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec,
      createdat: rec.created_at ?? '', updatedat: rec.updated_at ?? null,
    })) as Kunden[];
    return enrichLookupFields(records, 'kunden');
  }
  static async getKundenEntry(id: string): Promise<Kunden | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.KUNDEN}/records/${id}`);
    const record = { record_id: data.id, ...data, createdat: data.created_at ?? '', updatedat: data.updated_at ?? null } as Kunden;
    return enrichLookupFields([record], 'kunden')[0];
  }
  static async createKundenEntry(fields: CreateKunden): Promise<MutationResult> {
    const data = await callApi('POST', `/apps/${APP_IDS.KUNDEN}/records`, { fields: cleanFieldsForApi(fields as any, 'kunden') });
    return { ...data, record_id: data.id };
  }
  static async updateKundenEntry(id: string, fields: Partial<CreateKunden>): Promise<MutationResult> {
    const data = await callApi('PATCH', `/apps/${APP_IDS.KUNDEN}/records/${id}`, { fields: cleanFieldsForApi(fields as any, 'kunden') });
    return { ...data, record_id: data.id };
  }
  static async deleteKundenEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.KUNDEN}/records/${id}`);
  }

  // --- FAHRZEUGE ---
  static async getFahrzeuge(): Promise<Fahrzeuge[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.FAHRZEUGE}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec,
      createdat: rec.created_at ?? '', updatedat: rec.updated_at ?? null,
    })) as Fahrzeuge[];
    return enrichLookupFields(records, 'fahrzeuge');
  }
  static async getFahrzeugeEntry(id: string): Promise<Fahrzeuge | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.FAHRZEUGE}/records/${id}`);
    const record = { record_id: data.id, ...data, createdat: data.created_at ?? '', updatedat: data.updated_at ?? null } as Fahrzeuge;
    return enrichLookupFields([record], 'fahrzeuge')[0];
  }
  static async createFahrzeugeEntry(fields: CreateFahrzeuge): Promise<MutationResult> {
    const data = await callApi('POST', `/apps/${APP_IDS.FAHRZEUGE}/records`, { fields: cleanFieldsForApi(fields as any, 'fahrzeuge') });
    return { ...data, record_id: data.id };
  }
  static async updateFahrzeugeEntry(id: string, fields: Partial<CreateFahrzeuge>): Promise<MutationResult> {
    const data = await callApi('PATCH', `/apps/${APP_IDS.FAHRZEUGE}/records/${id}`, { fields: cleanFieldsForApi(fields as any, 'fahrzeuge') });
    return { ...data, record_id: data.id };
  }
  static async deleteFahrzeugeEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.FAHRZEUGE}/records/${id}`);
  }

  // --- AUFTRAEGE ---
  static async getAuftraege(): Promise<Auftraege[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.AUFTRAEGE}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec,
      createdat: rec.created_at ?? '', updatedat: rec.updated_at ?? null,
    })) as Auftraege[];
    return enrichLookupFields(records, 'auftraege');
  }
  static async getAuftraegeEntry(id: string): Promise<Auftraege | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.AUFTRAEGE}/records/${id}`);
    const record = { record_id: data.id, ...data, createdat: data.created_at ?? '', updatedat: data.updated_at ?? null } as Auftraege;
    return enrichLookupFields([record], 'auftraege')[0];
  }
  static async createAuftraegeEntry(fields: CreateAuftraege): Promise<MutationResult> {
    const data = await callApi('POST', `/apps/${APP_IDS.AUFTRAEGE}/records`, { fields: cleanFieldsForApi(fields as any, 'auftraege') });
    return { ...data, record_id: data.id };
  }
  static async updateAuftraegeEntry(id: string, fields: Partial<CreateAuftraege>): Promise<MutationResult> {
    const data = await callApi('PATCH', `/apps/${APP_IDS.AUFTRAEGE}/records/${id}`, { fields: cleanFieldsForApi(fields as any, 'auftraege') });
    return { ...data, record_id: data.id };
  }
  static async deleteAuftraegeEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.AUFTRAEGE}/records/${id}`);
  }

  // --- RECHNUNGEN ---
  static async getRechnungen(): Promise<Rechnungen[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.RECHNUNGEN}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec,
      createdat: rec.created_at ?? '', updatedat: rec.updated_at ?? null,
    })) as Rechnungen[];
    return enrichLookupFields(records, 'rechnungen');
  }
  static async getRechnungenEntry(id: string): Promise<Rechnungen | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.RECHNUNGEN}/records/${id}`);
    const record = { record_id: data.id, ...data, createdat: data.created_at ?? '', updatedat: data.updated_at ?? null } as Rechnungen;
    return enrichLookupFields([record], 'rechnungen')[0];
  }
  static async createRechnungenEntry(fields: CreateRechnungen): Promise<MutationResult> {
    const data = await callApi('POST', `/apps/${APP_IDS.RECHNUNGEN}/records`, { fields: cleanFieldsForApi(fields as any, 'rechnungen') });
    return { ...data, record_id: data.id };
  }
  static async updateRechnungenEntry(id: string, fields: Partial<CreateRechnungen>): Promise<MutationResult> {
    const data = await callApi('PATCH', `/apps/${APP_IDS.RECHNUNGEN}/records/${id}`, { fields: cleanFieldsForApi(fields as any, 'rechnungen') });
    return { ...data, record_id: data.id };
  }
  static async deleteRechnungenEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.RECHNUNGEN}/records/${id}`);
  }

  // --- JAHRESINSPEKTION_PLANEN ---
  static async getJahresinspektionPlanen(): Promise<JahresinspektionPlanen[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.JAHRESINSPEKTION_PLANEN}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec,
      createdat: rec.created_at ?? '', updatedat: rec.updated_at ?? null,
    })) as JahresinspektionPlanen[];
    return enrichLookupFields(records, 'jahresinspektion_planen');
  }
  static async getJahresinspektionPlanenEntry(id: string): Promise<JahresinspektionPlanen | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.JAHRESINSPEKTION_PLANEN}/records/${id}`);
    const record = { record_id: data.id, ...data, createdat: data.created_at ?? '', updatedat: data.updated_at ?? null } as JahresinspektionPlanen;
    return enrichLookupFields([record], 'jahresinspektion_planen')[0];
  }
  static async createJahresinspektionPlanenEntry(fields: CreateJahresinspektionPlanen): Promise<MutationResult> {
    const data = await callApi('POST', `/apps/${APP_IDS.JAHRESINSPEKTION_PLANEN}/records`, { fields: cleanFieldsForApi(fields as any, 'jahresinspektion_planen') });
    return { ...data, record_id: data.id };
  }
  static async updateJahresinspektionPlanenEntry(id: string, fields: Partial<CreateJahresinspektionPlanen>): Promise<MutationResult> {
    const data = await callApi('PATCH', `/apps/${APP_IDS.JAHRESINSPEKTION_PLANEN}/records/${id}`, { fields: cleanFieldsForApi(fields as any, 'jahresinspektion_planen') });
    return { ...data, record_id: data.id };
  }
  static async deleteJahresinspektionPlanenEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.JAHRESINSPEKTION_PLANEN}/records/${id}`);
  }

  // --- RECHNUNGS_PDF_ERSTELLEN ---
  static async getRechnungsPdfErstellen(): Promise<RechnungsPdfErstellen[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.RECHNUNGS_PDF_ERSTELLEN}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec,
      createdat: rec.created_at ?? '', updatedat: rec.updated_at ?? null,
    })) as RechnungsPdfErstellen[];
    return enrichLookupFields(records, 'rechnungs_pdf_erstellen');
  }
  static async getRechnungsPdfErstellenEntry(id: string): Promise<RechnungsPdfErstellen | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.RECHNUNGS_PDF_ERSTELLEN}/records/${id}`);
    const record = { record_id: data.id, ...data, createdat: data.created_at ?? '', updatedat: data.updated_at ?? null } as RechnungsPdfErstellen;
    return enrichLookupFields([record], 'rechnungs_pdf_erstellen')[0];
  }
  static async createRechnungsPdfErstellenEntry(fields: CreateRechnungsPdfErstellen): Promise<MutationResult> {
    const data = await callApi('POST', `/apps/${APP_IDS.RECHNUNGS_PDF_ERSTELLEN}/records`, { fields: cleanFieldsForApi(fields as any, 'rechnungs_pdf_erstellen') });
    return { ...data, record_id: data.id };
  }
  static async updateRechnungsPdfErstellenEntry(id: string, fields: Partial<CreateRechnungsPdfErstellen>): Promise<MutationResult> {
    const data = await callApi('PATCH', `/apps/${APP_IDS.RECHNUNGS_PDF_ERSTELLEN}/records/${id}`, { fields: cleanFieldsForApi(fields as any, 'rechnungs_pdf_erstellen') });
    return { ...data, record_id: data.id };
  }
  static async deleteRechnungsPdfErstellenEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.RECHNUNGS_PDF_ERSTELLEN}/records/${id}`);
  }

}