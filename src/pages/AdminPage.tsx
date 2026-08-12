import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { LivingAppsService, extractRecordId, cleanFieldsForApi } from '@/services/livingAppsService';
import { KundenDialog } from '@/components/dialogs/KundenDialog';
import { KundenViewDialog } from '@/components/dialogs/KundenViewDialog';
import { FahrzeugeDialog } from '@/components/dialogs/FahrzeugeDialog';
import { FahrzeugeViewDialog } from '@/components/dialogs/FahrzeugeViewDialog';
import { AuftraegeDialog } from '@/components/dialogs/AuftraegeDialog';
import { AuftraegeViewDialog } from '@/components/dialogs/AuftraegeViewDialog';
import { RechnungenDialog } from '@/components/dialogs/RechnungenDialog';
import { RechnungenViewDialog } from '@/components/dialogs/RechnungenViewDialog';
import { JahresinspektionPlanenDialog } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { JahresinspektionPlanenViewDialog } from '@/components/dialogs/JahresinspektionPlanenViewDialog';
import { RechnungsPdfErstellenDialog } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import { RechnungsPdfErstellenViewDialog } from '@/components/dialogs/RechnungsPdfErstellenViewDialog';
import { BulkEditDialog } from '@/components/dialogs/BulkEditDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageShell } from '@/components/PageShell';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { IconPencil, IconTrash, IconPlus, IconFilter, IconX, IconArrowsUpDown, IconArrowUp, IconArrowDown, IconSearch, IconCopy, IconFileText } from '@tabler/icons-react';
import { t, appLabel, fieldLabels, lookupLabel, dateFnsLocale, dateFormat } from '@/i18n';
import { format, parseISO } from 'date-fns';

function fmtDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), dateFormat(), { locale: dateFnsLocale() }); } catch { return d; }
}

// Field metadata per entity for bulk edit and column filters. `label` is the
// BUILD-language fallback only — getFieldMeta() re-labels every entry (and every
// lookup option) through the runtime catalog before anything renders it.
const KUNDEN_FIELDS = [
  { key: 'vorname', label: 'Vorname', type: 'string/text' },
  { key: 'nachname', label: 'Nachname', type: 'string/text' },
  { key: 'email', label: 'E-Mail-Adresse', type: 'string/email' },
  { key: 'telefon', label: 'Telefonnummer', type: 'string/tel' },
  { key: 'strasse', label: 'Straße', type: 'string/text' },
  { key: 'hausnummer', label: 'Hausnummer', type: 'string/text' },
  { key: 'plz', label: 'Postleitzahl', type: 'string/text' },
  { key: 'ort', label: 'Ort', type: 'string/text' },
  { key: 'bemerkungen_kunde', label: 'Bemerkungen', type: 'string/textarea' },
];
const FAHRZEUGE_FIELDS = [
  { key: 'kennzeichen', label: 'Kennzeichen', type: 'string/text' },
  { key: 'marke', label: 'Marke', type: 'string/text' },
  { key: 'modell', label: 'Modell', type: 'string/text' },
  { key: 'baujahr', label: 'Baujahr', type: 'number' },
  { key: 'fin', label: 'Fahrzeugidentifikationsnummer (FIN)', type: 'string/text' },
  { key: 'kilometerstand', label: 'Kilometerstand (km)', type: 'number' },
  { key: 'kunde', label: 'Kunde', type: 'applookup/select', targetEntity: 'kunden', targetAppId: 'KUNDEN', displayField: 'vorname' },
];
const AUFTRAEGE_FIELDS = [
  { key: 'fahrzeug', label: 'Fahrzeug', type: 'applookup/select', targetEntity: 'fahrzeuge', targetAppId: 'FAHRZEUGE', displayField: 'kennzeichen' },
  { key: 'kunde', label: 'Kunde', type: 'applookup/select', targetEntity: 'kunden', targetAppId: 'KUNDEN', displayField: 'vorname' },
  { key: 'arbeitsbeschreibung', label: 'Arbeitsbeschreibung', type: 'string/textarea' },
  { key: 'wunschtermin', label: 'Wunschtermin', type: 'date/datetimeminute' },
  { key: 'status', label: 'Status', type: 'lookup/select', options: [{ key: 'offen', label: 'Offen' }, { key: 'in_bearbeitung', label: 'In Bearbeitung' }, { key: 'abgeschlossen', label: 'Abgeschlossen' }] },
  { key: 'prioritaet', label: 'Priorität', type: 'lookup/radio', options: [{ key: 'niedrig', label: 'Niedrig' }, { key: 'normal', label: 'Normal' }, { key: 'hoch', label: 'Hoch' }] },
  { key: 'bemerkungen_auftrag', label: 'Bemerkungen', type: 'string/textarea' },
  { key: 'auftragsnummer', label: 'Auftragsnummer', type: 'string/text' },
];
const RECHNUNGEN_FIELDS = [
  { key: 'rechnungsnummer', label: 'Rechnungsnummer', type: 'string/text' },
  { key: 'auftrag', label: 'Auftrag', type: 'applookup/select', targetEntity: 'auftraege', targetAppId: 'AUFTRAEGE', displayField: 'auftragsnummer' },
  { key: 'kunde', label: 'Kunde', type: 'applookup/select', targetEntity: 'kunden', targetAppId: 'KUNDEN', displayField: 'vorname' },
  { key: 'nettobetrag', label: 'Nettobetrag (€)', type: 'number' },
  { key: 'mwst_satz', label: 'MwSt.-Satz', type: 'lookup/radio', options: [{ key: 'mwst_19', label: '19 %' }, { key: 'mwst_7', label: '7 %' }, { key: 'mwst_0', label: '0 %' }] },
  { key: 'bruttobetrag', label: 'Bruttobetrag (€)', type: 'number' },
  { key: 'rechnungsdatum', label: 'Rechnungsdatum', type: 'date/date' },
  { key: 'faelligkeitsdatum', label: 'Fälligkeitsdatum', type: 'date/date' },
  { key: 'status_rechnung', label: 'Status', type: 'lookup/select', options: [{ key: 'offen', label: 'Offen' }, { key: 'bezahlt', label: 'Bezahlt' }, { key: 'ueberfaellig', label: 'Überfällig' }] },
  { key: 'pdf_anhang', label: 'PDF-Anhang', type: 'file' },
];
const JAHRESINSPEKTIONPLANEN_FIELDS = [
  { key: 'fahrzeug', label: 'Fahrzeug', type: 'applookup/select', targetEntity: 'fahrzeuge', targetAppId: 'FAHRZEUGE', displayField: 'kennzeichen' },
  { key: 'wunschtermin_inspektion', label: 'Wunschtermin', type: 'date/datetimeminute' },
  { key: 'arbeitsbeschreibung_inspektion', label: 'Arbeitsbeschreibung', type: 'string/textarea' },
  { key: 'bemerkungen_inspektion', label: 'Bemerkungen', type: 'string/textarea' },
];
const RECHNUNGSPDFERSTELLEN_FIELDS = [
  { key: 'rechnung', label: 'Rechnung', type: 'applookup/select', targetEntity: 'rechnungen', targetAppId: 'RECHNUNGEN', displayField: 'rechnungsnummer' },
  { key: 'pdf_rechnungsnummer', label: 'Rechnungsnummer', type: 'string/text' },
  { key: 'pdf_kunde_vorname', label: 'Vorname des Kunden', type: 'string/text' },
  { key: 'pdf_kunde_nachname', label: 'Nachname des Kunden', type: 'string/text' },
  { key: 'pdf_nettobetrag', label: 'Nettobetrag (€)', type: 'number' },
  { key: 'pdf_bruttobetrag', label: 'Bruttobetrag (€)', type: 'number' },
  { key: 'pdf_datei', label: 'PDF-Dokument', type: 'file' },
];

const ENTITY_TABS = [
  { key: 'kunden', pascal: 'Kunden' },
  { key: 'fahrzeuge', pascal: 'Fahrzeuge' },
  { key: 'auftraege', pascal: 'Auftraege' },
  { key: 'rechnungen', pascal: 'Rechnungen' },
  { key: 'jahresinspektion_planen', pascal: 'JahresinspektionPlanen' },
  { key: 'rechnungs_pdf_erstellen', pascal: 'RechnungsPdfErstellen' },
] as const;

type EntityKey = typeof ENTITY_TABS[number]['key'];

export default function AdminPage() {
  const data = useDashboardData();
  const { loading, error, fetchAll } = data;

  const [activeTab, setActiveTab] = useState<EntityKey>('kunden');
  const [selectedIds, setSelectedIds] = useState<Record<EntityKey, Set<string>>>(() => ({
    'kunden': new Set(),
    'fahrzeuge': new Set(),
    'auftraege': new Set(),
    'rechnungen': new Set(),
    'jahresinspektion_planen': new Set(),
    'rechnungs_pdf_erstellen': new Set(),
  }));
  const [filters, setFilters] = useState<Record<EntityKey, Record<string, string>>>(() => ({
    'kunden': {},
    'fahrzeuge': {},
    'auftraege': {},
    'rechnungen': {},
    'jahresinspektion_planen': {},
    'rechnungs_pdf_erstellen': {},
  }));
  const [showFilters, setShowFilters] = useState(false);
  const [dialogState, setDialogState] = useState<{ entity: EntityKey; record: any } | null>(null);
  const [createEntity, setCreateEntity] = useState<EntityKey | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<{ entity: EntityKey; ids: string[] } | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState<EntityKey | null>(null);
  const [viewState, setViewState] = useState<{ entity: EntityKey; record: any } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');

  const getRecords = useCallback((entity: EntityKey) => {
    switch (entity) {
      case 'kunden': return (data as any).kunden as Kunden[] ?? [];
      case 'fahrzeuge': return (data as any).fahrzeuge as Fahrzeuge[] ?? [];
      case 'auftraege': return (data as any).auftraege as Auftraege[] ?? [];
      case 'rechnungen': return (data as any).rechnungen as Rechnungen[] ?? [];
      case 'jahresinspektion_planen': return (data as any).jahresinspektionPlanen as JahresinspektionPlanen[] ?? [];
      case 'rechnungs_pdf_erstellen': return (data as any).rechnungsPdfErstellen as RechnungsPdfErstellen[] ?? [];
      default: return [];
    }
  }, [data]);

  const getLookupLists = useCallback((entity: EntityKey) => {
    const lists: Record<string, any[]> = {};
    switch (entity) {
      case 'fahrzeuge':
        lists.kundenList = (data as any).kunden ?? [];
        break;
      case 'auftraege':
        lists.fahrzeugeList = (data as any).fahrzeuge ?? [];
        lists.kundenList = (data as any).kunden ?? [];
        break;
      case 'rechnungen':
        lists.auftraegeList = (data as any).auftraege ?? [];
        lists.kundenList = (data as any).kunden ?? [];
        break;
      case 'jahresinspektion_planen':
        lists.fahrzeugeList = (data as any).fahrzeuge ?? [];
        break;
      case 'rechnungs_pdf_erstellen':
        lists.rechnungenList = (data as any).rechnungen ?? [];
        break;
    }
    return lists;
  }, [data]);

  const getApplookupDisplay = useCallback((entity: EntityKey, fieldKey: string, url?: unknown) => {
    if (!url) return '—';
    const id = extractRecordId(url);
    if (!id) return '—';
    const lists = getLookupLists(entity);
    void fieldKey; // ensure used for noUnusedParameters
    if (entity === 'fahrzeuge' && fieldKey === 'kunde') {
      const match = (lists.kundenList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.vorname ?? '—';
    }
    if (entity === 'auftraege' && fieldKey === 'fahrzeug') {
      const match = (lists.fahrzeugeList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.kennzeichen ?? '—';
    }
    if (entity === 'auftraege' && fieldKey === 'kunde') {
      const match = (lists.kundenList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.vorname ?? '—';
    }
    if (entity === 'rechnungen' && fieldKey === 'auftrag') {
      const match = (lists.auftraegeList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.auftragsnummer ?? '—';
    }
    if (entity === 'rechnungen' && fieldKey === 'kunde') {
      const match = (lists.kundenList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.vorname ?? '—';
    }
    if (entity === 'jahresinspektion_planen' && fieldKey === 'fahrzeug') {
      const match = (lists.fahrzeugeList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.kennzeichen ?? '—';
    }
    if (entity === 'rechnungs_pdf_erstellen' && fieldKey === 'rechnung') {
      const match = (lists.rechnungenList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.rechnungsnummer ?? '—';
    }
    return String(url);
  }, [getLookupLists]);

  // An EntityKey IS the app key, so the runtime catalog can re-label the static
  // field metadata on every render (the tree remounts on a language switch).
  // Only display labels change here — keys, types and option keys stay as built.
  const getFieldMeta = useCallback((entity: EntityKey) => {
    const raw: any[] = (() => {
      switch (entity) {
        case 'kunden': return KUNDEN_FIELDS as any[];
        case 'fahrzeuge': return FAHRZEUGE_FIELDS as any[];
        case 'auftraege': return AUFTRAEGE_FIELDS as any[];
        case 'rechnungen': return RECHNUNGEN_FIELDS as any[];
        case 'jahresinspektion_planen': return JAHRESINSPEKTIONPLANEN_FIELDS as any[];
        case 'rechnungs_pdf_erstellen': return RECHNUNGSPDFERSTELLEN_FIELDS as any[];
        default: return [];
      }
    })();
    const labels = fieldLabels(entity);
    return raw.map((f: any) => ({
      ...f,
      label: labels[f.key] ?? f.label,
      ...(f.options
        ? { options: f.options.map((o: any) => ({ ...o, label: lookupLabel(entity, f.key, o.key) ?? o.label })) }
        : {}),
    }));
  }, []);

  const getFilteredRecords = useCallback((entity: EntityKey) => {
    const records = getRecords(entity);
    const s = search.toLowerCase();
    const searched = !s ? records : records.filter((r: any) => {
      return Object.values(r.fields).some((v: any) => {
        if (v == null) return false;
        if (Array.isArray(v)) return v.some((item: any) => typeof item === 'object' && item !== null && 'label' in item ? String((item as any).label).toLowerCase().includes(s) : String(item).toLowerCase().includes(s));
        if (typeof v === 'object' && 'label' in (v as any)) return String((v as any).label).toLowerCase().includes(s);
        return String(v).toLowerCase().includes(s);
      });
    });
    const entityFilters = filters[entity] ?? {};
    const fieldMeta = getFieldMeta(entity);
    return searched.filter((r: any) => {
      return fieldMeta.every((fm: any) => {
        const fv = entityFilters[fm.key];
        if (!fv || fv === '') return true;
        const val = r.fields?.[fm.key];
        if (fm.type === 'bool') {
          if (fv === 'true') return val === true;
          if (fv === 'false') return val !== true;
          return true;
        }
        if (fm.type === 'lookup/select' || fm.type === 'lookup/radio') {
          // The filter select carries the option KEY, which is locale-independent —
          // the record's own label is in the build language and must not be matched.
          const key = val && typeof val === 'object' && 'key' in val ? val.key : '';
          return String(key) === fv;
        }
        if (fm.type.includes('multiplelookup')) {
          if (!Array.isArray(val)) return false;
          return val.some((item: any) => String(lookupLabel(entity, fm.key, item?.key) ?? item?.label ?? '').toLowerCase().includes(fv.toLowerCase()));
        }
        if (fm.type.includes('applookup')) {
          const display = getApplookupDisplay(entity, fm.key, val);
          return String(display).toLowerCase().includes(fv.toLowerCase());
        }
        return String(val ?? '').toLowerCase().includes(fv.toLowerCase());
      });
    });
  }, [getRecords, filters, getFieldMeta, getApplookupDisplay, search]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(''); setSortDir('asc'); }
    } else { setSortKey(key); setSortDir('asc'); }
  }

  function sortRecords<T extends { fields: Record<string, any> }>(recs: T[]): T[] {
    if (!sortKey) return recs;
    return [...recs].sort((a, b) => {
      let va: any = a.fields[sortKey], vb: any = b.fields[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'object' && 'label' in va) va = va.label;
      if (typeof vb === 'object' && 'label' in vb) vb = vb.label;
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  const toggleSelect = useCallback((entity: EntityKey, id: string) => {
    setSelectedIds(prev => {
      const next = { ...prev, [entity]: new Set(prev[entity]) };
      if (next[entity].has(id)) next[entity].delete(id);
      else next[entity].add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((entity: EntityKey) => {
    const filtered = getFilteredRecords(entity);
    setSelectedIds(prev => {
      const allSelected = filtered.every((r: any) => prev[entity].has(r.record_id));
      const next = { ...prev, [entity]: new Set(prev[entity]) };
      if (allSelected) {
        filtered.forEach((r: any) => next[entity].delete(r.record_id));
      } else {
        filtered.forEach((r: any) => next[entity].add(r.record_id));
      }
      return next;
    });
  }, [getFilteredRecords]);

  const clearSelection = useCallback((entity: EntityKey) => {
    setSelectedIds(prev => ({ ...prev, [entity]: new Set() }));
  }, []);

  const getServiceMethods = useCallback((entity: EntityKey) => {
    switch (entity) {
      case 'kunden': return {
        create: (fields: any) => LivingAppsService.createKundenEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateKundenEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteKundenEntry(id),
      };
      case 'fahrzeuge': return {
        create: (fields: any) => LivingAppsService.createFahrzeugeEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateFahrzeugeEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteFahrzeugeEntry(id),
      };
      case 'auftraege': return {
        create: (fields: any) => LivingAppsService.createAuftraegeEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateAuftraegeEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteAuftraegeEntry(id),
      };
      case 'rechnungen': return {
        create: (fields: any) => LivingAppsService.createRechnungenEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateRechnungenEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteRechnungenEntry(id),
      };
      case 'jahresinspektion_planen': return {
        create: (fields: any) => LivingAppsService.createJahresinspektionPlanenEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateJahresinspektionPlanenEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteJahresinspektionPlanenEntry(id),
      };
      case 'rechnungs_pdf_erstellen': return {
        create: (fields: any) => LivingAppsService.createRechnungsPdfErstellenEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateRechnungsPdfErstellenEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteRechnungsPdfErstellenEntry(id),
      };
      default: return null;
    }
  }, []);

  async function handleCreate(entity: EntityKey, fields: any) {
    const svc = getServiceMethods(entity);
    if (!svc) return;
    await svc.create(fields);
    fetchAll();
    setCreateEntity(null);
  }

  async function handleUpdate(fields: any) {
    if (!dialogState) return;
    const svc = getServiceMethods(dialogState.entity);
    if (!svc) return;
    await svc.update(dialogState.record.record_id, fields);
    fetchAll();
    setDialogState(null);
  }

  async function handleBulkDelete() {
    if (!deleteTargets) return;
    const svc = getServiceMethods(deleteTargets.entity);
    if (!svc) return;
    setBulkLoading(true);
    try {
      for (const id of deleteTargets.ids) {
        await svc.remove(id);
      }
      clearSelection(deleteTargets.entity);
      fetchAll();
    } finally {
      setBulkLoading(false);
      setDeleteTargets(null);
    }
  }

  async function handleBulkClone() {
    const svc = getServiceMethods(activeTab);
    if (!svc) return;
    setBulkLoading(true);
    try {
      const records = getRecords(activeTab);
      const ids = Array.from(selectedIds[activeTab]);
      for (const id of ids) {
        const rec = records.find((r: any) => r.record_id === id);
        if (!rec) continue;
        const clean = cleanFieldsForApi(rec.fields, activeTab);
        await svc.create(clean as any);
      }
      clearSelection(activeTab);
      fetchAll();
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkEdit(fieldKey: string, value: any) {
    if (!bulkEditOpen) return;
    const svc = getServiceMethods(bulkEditOpen);
    if (!svc) return;
    setBulkLoading(true);
    try {
      const ids = Array.from(selectedIds[bulkEditOpen]);
      for (const id of ids) {
        await svc.update(id, { [fieldKey]: value });
      }
      clearSelection(bulkEditOpen);
      fetchAll();
    } finally {
      setBulkLoading(false);
      setBulkEditOpen(null);
    }
  }

  function updateFilter(entity: EntityKey, fieldKey: string, value: string) {
    setFilters(prev => ({
      ...prev,
      [entity]: { ...prev[entity], [fieldKey]: value },
    }));
  }

  function clearEntityFilters(entity: EntityKey) {
    setFilters(prev => ({ ...prev, [entity]: {} }));
  }

  const activeFilterCount = useMemo(() => {
    const f = filters[activeTab] ?? {};
    return Object.values(f).filter(v => v && v !== '').length;
  }, [filters, activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-destructive">{error.message}</p>
        <Button onClick={fetchAll}>{t('retry')}</Button>
      </div>
    );
  }

  const filtered = getFilteredRecords(activeTab);
  const sel = selectedIds[activeTab];
  const allFiltered = filtered.every((r: any) => sel.has(r.record_id)) && filtered.length > 0;
  const fieldMeta = getFieldMeta(activeTab);

  return (
    <PageShell
      title={t('admin')}
      subtitle={t('admin_subtitle')}
      action={
        <Button onClick={() => setCreateEntity(activeTab)} className="shrink-0">
          <IconPlus className="h-4 w-4 mr-2" /> {t('add')}
        </Button>
      }
    >
      <div className="flex gap-2 flex-wrap">
        {ENTITY_TABS.map(tab => {
          const count = getRecords(tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearch(''); setSortKey(''); setSortDir('asc'); fetchAll(); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {appLabel(tab.key)}
              <Badge variant="secondary" className="ml-1 text-xs">{count}</Badge>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)} className="gap-2">
            <IconFilter className="h-4 w-4" />
            {t('filter')}
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => clearEntityFilters(activeTab)}>
              {t('clear_filters')}
            </Button>
          )}
        </div>
        {sel.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap bg-muted/60 rounded-lg px-3 py-1.5">
            <span className="text-sm font-medium">{sel.size} {t('selected')}</span>
            <Button variant="outline" size="sm" onClick={() => setBulkEditOpen(activeTab)}>
              <IconPencil className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">{t('bulk_edit')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkClone()}>
              <IconCopy className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">{t('bulk_clone')}</span>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteTargets({ entity: activeTab, ids: Array.from(sel) })}>
              <IconTrash className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">{t('bulk_delete')}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => clearSelection(activeTab)}>
              <IconX className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">{t('deselect_all')}</span>
            </Button>
          </div>
        )}
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 rounded-lg border bg-muted/30">
          {fieldMeta.map((fm: any) => (
            <div key={fm.key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{fm.label}</label>
              {fm.type === 'bool' ? (
                <Select value={filters[activeTab]?.[fm.key] ?? ''} onValueChange={v => updateFilter(activeTab, fm.key, v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('all_values')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all_values')}</SelectItem>
                    <SelectItem value="true">{t('yes')}</SelectItem>
                    <SelectItem value="false">{t('no')}</SelectItem>
                  </SelectContent>
                </Select>
              ) : fm.type === 'lookup/select' || fm.type === 'lookup/radio' ? (
                <Select value={filters[activeTab]?.[fm.key] ?? ''} onValueChange={v => updateFilter(activeTab, fm.key, v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('all_values')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all_values')}</SelectItem>
                    {fm.options?.map((o: any) => (
                      <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 text-xs"
                  placeholder={`${t('filter')}...`}
                  value={filters[activeTab]?.[fm.key] ?? ''}
                  onChange={e => updateFilter(activeTab, fm.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-[27px] bg-card shadow-lg overflow-x-auto">
        <Table className="[&_tbody_td]:px-6 [&_tbody_td]:py-2 [&_tbody_td]:text-base [&_tbody_td]:font-medium [&_tbody_tr:first-child_td]:pt-6 [&_tbody_tr:last-child_td]:pb-10">
          <TableHeader className="bg-secondary">
            <TableRow className="border-b border-input">
              <TableHead className="w-10 px-6">
                <Checkbox
                  checked={allFiltered}
                  onCheckedChange={() => toggleSelectAll(activeTab)}
                />
              </TableHead>
              {fieldMeta.map((fm: any) => (
                <TableHead key={fm.key} className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort(fm.key)}>
                  <span className="inline-flex items-center gap-1">
                    {fm.label}
                    {sortKey === fm.key ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                  </span>
                </TableHead>
              ))}
              <TableHead className="w-24 uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortRecords(filtered).map((record: any) => (
              <TableRow key={record.record_id} className={`transition-colors cursor-pointer ${sel.has(record.record_id) ? "bg-primary/5" : "hover:bg-muted/50"}`} onClick={(e) => { if ((e.target as HTMLElement).closest('button, [role="checkbox"]')) return; setViewState({ entity: activeTab, record }); }}>
                <TableCell>
                  <Checkbox
                    checked={sel.has(record.record_id)}
                    onCheckedChange={() => toggleSelect(activeTab, record.record_id)}
                  />
                </TableCell>
                {fieldMeta.map((fm: any) => {
                  const val = record.fields?.[fm.key];
                  if (fm.type === 'bool') {
                    return (
                      <TableCell key={fm.key}>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          val ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}>
                          {val ? t('yes') : t('no')}
                        </span>
                      </TableCell>
                    );
                  }
                  if (fm.type === 'lookup/select' || fm.type === 'lookup/radio') {
                    return <TableCell key={fm.key}><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{lookupLabel(activeTab, fm.key, val?.key) ?? val?.label ?? '—'}</span></TableCell>;
                  }
                  if (fm.type.startsWith('multiplelookup')) {
                    return <TableCell key={fm.key}>{Array.isArray(val) ? val.map((v: any) => lookupLabel(activeTab, fm.key, v?.key) ?? v?.label ?? v).join(', ') : '—'}</TableCell>;
                  }
                  if (fm.type.startsWith('multipleapplookup')) {
                    return (
                      <TableCell key={fm.key}>
                        {Array.isArray(val) && val.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {val.map((url: any, i: number) => (
                              <span key={i} className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{getApplookupDisplay(activeTab, fm.key, url)}</span>
                            ))}
                          </div>
                        ) : '—'}
                      </TableCell>
                    );
                  }
                  if (fm.type.startsWith('applookup')) {
                    return <TableCell key={fm.key}><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{getApplookupDisplay(activeTab, fm.key, val)}</span></TableCell>;
                  }
                  if (fm.type.includes('date')) {
                    return <TableCell key={fm.key} className="text-muted-foreground">{fmtDate(val)}</TableCell>;
                  }
                  if (fm.type.startsWith('file')) {
                    return (
                      <TableCell key={fm.key}>
                        {val ? (
                          <div className="relative h-8 w-8 rounded bg-muted overflow-hidden">
                            <img src={val} alt="" className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        ) : '—'}
                      </TableCell>
                    );
                  }
                  if (fm.type === 'string/textarea') {
                    return <TableCell key={fm.key} className="max-w-xs"><span className="truncate block">{val ?? '—'}</span></TableCell>;
                  }
                  if (fm.type === 'geo') {
                    return (
                      <TableCell key={fm.key} className="max-w-[200px]">
                        <span className="truncate block" title={val ? `${val.lat}, ${val.long}` : undefined}>
                          {val?.info ?? (val ? `${val.lat?.toFixed(4)}, ${val.long?.toFixed(4)}` : '—')}
                        </span>
                      </TableCell>
                    );
                  }
                  return <TableCell key={fm.key}>{val ?? '—'}</TableCell>;
                })}
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setDialogState({ entity: activeTab, record })}>
                      <IconPencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTargets({ entity: activeTab, ids: [record.record_id] })}>
                      <IconTrash className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={fieldMeta.length + 2} className="text-center py-16 text-muted-foreground">
                  {t('no_results')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {(createEntity === 'kunden' || dialogState?.entity === 'kunden') && (
        <KundenDialog
          open={createEntity === 'kunden' || dialogState?.entity === 'kunden'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'kunden' ? handleUpdate : (fields: any) => handleCreate('kunden', fields)}
          defaultValues={dialogState?.entity === 'kunden' ? dialogState.record?.fields : undefined}
          enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
        />
      )}
      {(createEntity === 'fahrzeuge' || dialogState?.entity === 'fahrzeuge') && (
        <FahrzeugeDialog
          open={createEntity === 'fahrzeuge' || dialogState?.entity === 'fahrzeuge'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'fahrzeuge' ? handleUpdate : (fields: any) => handleCreate('fahrzeuge', fields)}
          defaultValues={dialogState?.entity === 'fahrzeuge' ? dialogState.record?.fields : undefined}
          kundenList={(data as any).kunden ?? []}
          enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
        />
      )}
      {(createEntity === 'auftraege' || dialogState?.entity === 'auftraege') && (
        <AuftraegeDialog
          open={createEntity === 'auftraege' || dialogState?.entity === 'auftraege'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'auftraege' ? handleUpdate : (fields: any) => handleCreate('auftraege', fields)}
          defaultValues={dialogState?.entity === 'auftraege' ? dialogState.record?.fields : undefined}
          fahrzeugeList={(data as any).fahrzeuge ?? []}
          kundenList={(data as any).kunden ?? []}
          enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
        />
      )}
      {(createEntity === 'rechnungen' || dialogState?.entity === 'rechnungen') && (
        <RechnungenDialog
          open={createEntity === 'rechnungen' || dialogState?.entity === 'rechnungen'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'rechnungen' ? handleUpdate : (fields: any) => handleCreate('rechnungen', fields)}
          defaultValues={dialogState?.entity === 'rechnungen' ? dialogState.record?.fields : undefined}
          auftraegeList={(data as any).auftraege ?? []}
          kundenList={(data as any).kunden ?? []}
          enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
        />
      )}
      {(createEntity === 'jahresinspektion_planen' || dialogState?.entity === 'jahresinspektion_planen') && (
        <JahresinspektionPlanenDialog
          open={createEntity === 'jahresinspektion_planen' || dialogState?.entity === 'jahresinspektion_planen'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'jahresinspektion_planen' ? handleUpdate : (fields: any) => handleCreate('jahresinspektion_planen', fields)}
          defaultValues={dialogState?.entity === 'jahresinspektion_planen' ? dialogState.record?.fields : undefined}
          fahrzeugeList={(data as any).fahrzeuge ?? []}
          enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
          enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
        />
      )}
      {(createEntity === 'rechnungs_pdf_erstellen' || dialogState?.entity === 'rechnungs_pdf_erstellen') && (
        <RechnungsPdfErstellenDialog
          open={createEntity === 'rechnungs_pdf_erstellen' || dialogState?.entity === 'rechnungs_pdf_erstellen'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'rechnungs_pdf_erstellen' ? handleUpdate : (fields: any) => handleCreate('rechnungs_pdf_erstellen', fields)}
          defaultValues={dialogState?.entity === 'rechnungs_pdf_erstellen' ? dialogState.record?.fields : undefined}
          rechnungenList={(data as any).rechnungen ?? []}
          enablePhotoScan={AI_PHOTO_SCAN['RechnungsPdfErstellen']}
          enablePhotoLocation={AI_PHOTO_LOCATION['RechnungsPdfErstellen']}
        />
      )}
      {viewState?.entity === 'kunden' && (
        <KundenViewDialog
          open={viewState?.entity === 'kunden'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'kunden', record: r }); }}
        />
      )}
      {viewState?.entity === 'fahrzeuge' && (
        <FahrzeugeViewDialog
          open={viewState?.entity === 'fahrzeuge'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'fahrzeuge', record: r }); }}
          kundenList={(data as any).kunden ?? []}
        />
      )}
      {viewState?.entity === 'auftraege' && (
        <AuftraegeViewDialog
          open={viewState?.entity === 'auftraege'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'auftraege', record: r }); }}
          fahrzeugeList={(data as any).fahrzeuge ?? []}
          kundenList={(data as any).kunden ?? []}
        />
      )}
      {viewState?.entity === 'rechnungen' && (
        <RechnungenViewDialog
          open={viewState?.entity === 'rechnungen'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'rechnungen', record: r }); }}
          auftraegeList={(data as any).auftraege ?? []}
          kundenList={(data as any).kunden ?? []}
        />
      )}
      {viewState?.entity === 'jahresinspektion_planen' && (
        <JahresinspektionPlanenViewDialog
          open={viewState?.entity === 'jahresinspektion_planen'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'jahresinspektion_planen', record: r }); }}
          fahrzeugeList={(data as any).fahrzeuge ?? []}
        />
      )}
      {viewState?.entity === 'rechnungs_pdf_erstellen' && (
        <RechnungsPdfErstellenViewDialog
          open={viewState?.entity === 'rechnungs_pdf_erstellen'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'rechnungs_pdf_erstellen', record: r }); }}
          rechnungenList={(data as any).rechnungen ?? []}
        />
      )}

      <BulkEditDialog
        open={!!bulkEditOpen}
        onClose={() => setBulkEditOpen(null)}
        onApply={handleBulkEdit}
        fields={bulkEditOpen ? getFieldMeta(bulkEditOpen) : []}
        selectedCount={bulkEditOpen ? selectedIds[bulkEditOpen].size : 0}
        loading={bulkLoading}
        lookupLists={bulkEditOpen ? getLookupLists(bulkEditOpen) : {}}
      />

      <ConfirmDialog
        open={!!deleteTargets}
        onClose={() => setDeleteTargets(null)}
        onConfirm={handleBulkDelete}
        title={t('bulk_delete')}
        description={t('confirm_bulk_delete', { n: deleteTargets?.ids.length ?? 0 })}
      />
    </PageShell>
  );
}