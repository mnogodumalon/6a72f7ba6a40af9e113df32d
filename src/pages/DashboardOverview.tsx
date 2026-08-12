import { useMemo, useState, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen } from '@/lib/enrich';
import type { EnrichedFahrzeuge, EnrichedAuftraege, EnrichedRechnungen, EnrichedJahresinspektionPlanen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
} from '@/components/widgets/RecordView';
import { AuftraegeDetails } from '@/components/details/AuftraegeDetails';
import { FahrzeugeDetails } from '@/components/details/FahrzeugeDetails';
import { KundenDetails } from '@/components/details/KundenDetails';
import { RechnungenDetails } from '@/components/details/RechnungenDetails';
import { JahresinspektionPlanenDetails } from '@/components/details/JahresinspektionPlanenDetails';
import { RechnungsPdfErstellenDetails } from '@/components/details/RechnungsPdfErstellenDetails';
import { AuftraegeDialog } from '@/components/dialogs/AuftraegeDialog';
import { FahrzeugeDialog } from '@/components/dialogs/FahrzeugeDialog';
import { KundenDialog } from '@/components/dialogs/KundenDialog';
import { RechnungenDialog } from '@/components/dialogs/RechnungenDialog';
import { JahresinspektionPlanenDialog } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { RechnungsPdfErstellenDialog } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import type { AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import type { FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import type { RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import type { JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import type { RechnungsPdfErstellenDialogDefaults } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { makeT, appLabel } from '@/i18n';
import { tc } from '@/i18n/common';
import {
  IconAlertCircle,
  IconCar,
  IconClipboardList,
  IconReceipt,
  IconUser,
  IconCalendar,
  IconCircleCheck,
  IconPlus,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    ctx_none: 'Heute keine Termine.',
    ctx_auftraege: 'Aktive Aufträge: {names}.',
    ctx_inspektionen: 'Nächste Inspektion: {name} am {date}.',
    hero_ueberfaellig: '{n} Rechnung überfällig',
    hero_ueberfaellig_pl: '{n} Rechnungen überfällig',
    hero_ueberfaellig_hint: 'Kunden informieren und Zahlung anmahnen.',
    hero_action: 'Als bezahlt markieren',
    kpi_offen: 'Offen',
    kpi_in_bearbeitung: 'In Bearbeitung',
    kpi_abgeschlossen: 'Abgeschlossen',
    kpi_rechnungen: 'Offene Rechnungen',
    kpi_fahrzeuge: 'Fahrzeuge',
    aside_title: 'Anstehende Inspektionen',
    aside2_title: 'Offene Rechnungen',
    aside_empty: 'Keine anstehenden Inspektionen.',
    aside2_empty: 'Alle Rechnungen bezahlt.',
    new_auftrag: 'Neuer Auftrag',
    mark_bezahlt: 'Bezahlt',
    next_inspektion: 'Nächste Inspektion: {name}',
    rechnung_bezahlt_toast: '{nr} als bezahlt markiert',
    auftrag_status_toast: '{nr} → {status}',
  },
  en: {
    ctx_none: 'No appointments today.',
    ctx_auftraege: 'Active orders: {names}.',
    ctx_inspektionen: 'Next inspection: {name} on {date}.',
    hero_ueberfaellig: '{n} invoice overdue',
    hero_ueberfaellig_pl: '{n} invoices overdue',
    hero_ueberfaellig_hint: 'Notify customers and send payment reminders.',
    hero_action: 'Mark as paid',
    kpi_offen: 'Open',
    kpi_in_bearbeitung: 'In Progress',
    kpi_abgeschlossen: 'Done',
    kpi_rechnungen: 'Open Invoices',
    kpi_fahrzeuge: 'Vehicles',
    aside_title: 'Upcoming Inspections',
    aside2_title: 'Open Invoices',
    aside_empty: 'No upcoming inspections.',
    aside2_empty: 'All invoices paid.',
    new_auftrag: 'New Order',
    mark_bezahlt: 'Paid',
    next_inspektion: 'Next inspection: {name}',
    rechnung_bezahlt_toast: '{nr} marked as paid',
    auftrag_status_toast: '{nr} → {status}',
  },
});

type OverlayItem =
  | { type: 'auftrag'; id: string }
  | { type: 'fahrzeug'; id: string }
  | { type: 'kunde'; id: string }
  | { type: 'rechnung'; id: string }
  | { type: 'inspektion'; id: string }
  | { type: 'pdf'; id: string };

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'in_bearbeitung') return 'primary';
  if (status === 'abgeschlossen') return 'success';
  return 'warning';
}

export default function DashboardOverview() {
  const clock = useClock();

  const {
    kunden, fahrzeuge, auftraege, rechnungen, jahresinspektionPlanen, rechnungsPdfErstellen,
    kundenMap, fahrzeugeMap, auftraegeMap, rechnungenMap,
    setAuftraege, setRechnungen,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedFahrzeuge = useMemo(() => enrichFahrzeuge(fahrzeuge, { kundenMap }), [fahrzeuge, kundenMap]);
  const enrichedAuftraege = useMemo(() => enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap }), [auftraege, fahrzeugeMap, kundenMap]);
  const enrichedRechnungen = useMemo(() => enrichRechnungen(rechnungen, { auftraegeMap, kundenMap }), [rechnungen, auftraegeMap, kundenMap]);
  const enrichedInspektionen = useMemo(() => enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap }), [jahresinspektionPlanen, fahrzeugeMap]);

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog states
  const [auftragOpen, setAuftragOpen] = useState(false);
  const [auftragDefaults, setAuftragDefaults] = useState<AuftraegeDialogDefaults | undefined>();
  const [auftragEditId, setAuftragEditId] = useState<string | undefined>();

  const [fahrzeugOpen, setFahrzeugOpen] = useState(false);
  const [fahrzeugDefaults, setFahrzeugDefaults] = useState<FahrzeugeDialogDefaults | undefined>();
  const [fahrzeugEditId, setFahrzeugEditId] = useState<string | undefined>();

  const [kundeOpen, setKundeOpen] = useState(false);
  const [kundeEditId, setKundeEditId] = useState<string | undefined>();

  const [rechnungOpen, setRechnungOpen] = useState(false);
  const [rechnungDefaults, setRechnungDefaults] = useState<RechnungenDialogDefaults | undefined>();
  const [rechnungEditId, setRechnungEditId] = useState<string | undefined>();

  const [inspektionOpen, setInspektionOpen] = useState(false);
  const [inspektionDefaults, setInspektionDefaults] = useState<JahresinspektionPlanenDialogDefaults | undefined>();
  const [inspektionEditId, setInspektionEditId] = useState<string | undefined>();

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfDefaults, setPdfDefaults] = useState<RechnungsPdfErstellenDialogDefaults | undefined>();
  const [pdfEditId, setPdfEditId] = useState<string | undefined>();

  // Kanban columns — INSIDE component body (locale-aware getters)
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Cards for KanbanWidget
  const cards = useMemo<KanbanCard[]>(
    () =>
      enrichedAuftraege.map(a => {
        const status = lookupKey(a.fields.status) ?? 'offen';
        return {
          id: `auftrag:${a.record_id}`,
          column: status,
          title: a.fahrzeugName || a.fields.auftragsnummer || appLabel('auftraege'),
          subtitle: a.kundeName || a.fields.arbeitsbeschreibung?.slice(0, 60),
          tone: toneForStatus(status),
        };
      }),
    [enrichedAuftraege],
  );

  // Overdue invoices — urgent signal
  const today = clock;
  const ueberfaelligRechnungen = useMemo(
    () => enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'ueberfaellig'),
    [enrichedRechnungen],
  );

  // Open invoices (offen + ueberfaellig)
  const offeneRechnungen = useMemo(
    () => enrichedRechnungen.filter(r => {
      const s = lookupKey(r.fields.status_rechnung);
      return s === 'offen' || s === 'ueberfaellig';
    }),
    [enrichedRechnungen],
  );

  // Upcoming inspections (sorted by date)
  const anstehendeInspektionen = useMemo(
    () => enrichedInspektionen
      .filter(i => i.fields.wunschtermin_inspektion)
      .sort((a, b) => (a.fields.wunschtermin_inspektion ?? '').localeCompare(b.fields.wunschtermin_inspektion ?? '')),
    [enrichedInspektionen],
  );

  // KPI counts
  const countOffen = useMemo(() => auftraege.filter(a => lookupKey(a.fields.status) === 'offen').length, [auftraege]);
  const countInBearbeitung = useMemo(() => auftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung').length, [auftraege]);
  const countAbgeschlossen = useMemo(() => auftraege.filter(a => lookupKey(a.fields.status) === 'abgeschlossen').length, [auftraege]);

  // Context line
  const contextLine = useMemo(() => {
    const activeAuftraege = enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung');
    if (activeAuftraege.length > 0) {
      const nameList = namen(activeAuftraege.map(a => a.fahrzeugName || a.kundeName || ''));
      return tt('ctx_auftraege', { names: nameList });
    }
    const nextInspektion = anstehendeInspektionen[0];
    if (nextInspektion) {
      return tt('ctx_inspektionen', {
        name: nextInspektion.fahrzeugName || appLabel('fahrzeuge'),
        date: formatDateTime(nextInspektion.fields.wunschtermin_inspektion),
      });
    }
    return tt('ctx_none');
  }, [enrichedAuftraege, anstehendeInspektionen]);

  // Advance Rechnung to bezahlt
  const markBezahlt = useCallback(async (r: EnrichedRechnungen) => {
    const prev = rechnungen.find(x => x.record_id === r.record_id);
    // Optimistic
    setRechnungen(prev_ =>
      prev_.map(x =>
        x.record_id === r.record_id
          ? { ...x, fields: { ...x.fields, status_rechnung: { key: 'bezahlt', label: 'Bezahlt' } } }
          : x,
      ),
    );
    const undo = async () => {
      if (prev) {
        setRechnungen(prev_ =>
          prev_.map(x =>
            x.record_id === r.record_id
              ? prev
              : x,
          ),
        );
        await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: 'ueberfaellig' }).catch(() => fetchAll());
      }
    };
    undoToast(tt('rechnung_bezahlt_toast', { nr: r.fields.rechnungsnummer ?? appLabel('rechnungen') }), undo);
    LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: 'bezahlt' }).catch(() => fetchAll());
  }, [rechnungen, setRechnungen, fetchAll]);

  // Kanban move
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const auftrag = auftraege.find(a => a.record_id === rid);
    if (!auftrag) return;
    const prevStatus = lookupKey(auftrag.fields.status);
    const newLabel = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;

    // Optimistic
    setAuftraege(prev =>
      prev.map(a =>
        a.record_id === rid
          ? { ...a, fields: { ...a.fields, status: { key: newColumn, label: newLabel } } }
          : a,
      ),
    );
    const undo = async () => {
      if (prevStatus) {
        setAuftraege(prev =>
          prev.map(a =>
            a.record_id === rid
              ? { ...a, fields: { ...a.fields, status: { key: prevStatus, label: COLUMNS.find(c => c.key === prevStatus)?.label ?? prevStatus } } }
              : a,
          ),
        );
        await LivingAppsService.updateAuftraegeEntry(rid, { status: prevStatus }).catch(() => fetchAll());
      }
    };
    undoToast(
      tt('auftrag_status_toast', { nr: auftrag.fields.auftragsnummer ?? appLabel('auftraege'), status: newLabel }),
      undo,
    );
    LivingAppsService.updateAuftraegeEntry(rid, { status: newColumn }).catch(() => fetchAll());
  }, [auftraege, setAuftraege, COLUMNS, fetchAll]);

  // ─── hooks above, early returns below ───────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── plain derivations only below ───────────────────────────────────────────

  // Overlay helpers
  function openAuftragCreate(defaults?: AuftraegeDialogDefaults) {
    setAuftragDefaults(defaults);
    setAuftragEditId(undefined);
    setAuftragOpen(true);
  }
  function openAuftragEdit(a: Auftraege) {
    setAuftragDefaults(undefined);
    setAuftragEditId(a.record_id);
    setAuftragOpen(true);
  }
  function openRechnungCreate(defaults?: RechnungenDialogDefaults) {
    setRechnungDefaults(defaults);
    setRechnungEditId(undefined);
    setRechnungOpen(true);
  }
  function openRechnungEdit(r: Rechnungen) {
    setRechnungDefaults(undefined);
    setRechnungEditId(r.record_id);
    setRechnungOpen(true);
  }
  function openFahrzeugCreate(defaults?: FahrzeugeDialogDefaults) {
    setFahrzeugDefaults(defaults);
    setFahrzeugEditId(undefined);
    setFahrzeugOpen(true);
  }
  function openFahrzeugEdit(f: Fahrzeuge) {
    setFahrzeugDefaults(undefined);
    setFahrzeugEditId(f.record_id);
    setFahrzeugOpen(true);
  }
  function openInspektionCreate(defaults?: JahresinspektionPlanenDialogDefaults) {
    setInspektionDefaults(defaults);
    setInspektionEditId(undefined);
    setInspektionOpen(true);
  }
  function openInspektionEdit(i: JahresinspektionPlanen) {
    setInspektionDefaults(undefined);
    setInspektionEditId(i.record_id);
    setInspektionOpen(true);
  }
  function openPdfCreate(defaults?: RechnungsPdfErstellenDialogDefaults) {
    setPdfDefaults(defaults);
    setPdfEditId(undefined);
    setPdfOpen(true);
  }
  function openPdfEdit(p: RechnungsPdfErstellen) {
    setPdfDefaults(undefined);
    setPdfEditId(p.record_id);
    setPdfOpen(true);
  }

  // Hero: show first overdue invoice
  const heroRechnung = ueberfaelligRechnungen[0];

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
        <p className="text-muted-foreground mt-1">{contextLine}</p>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          heroRechnung ? (
            <HeroBanner
              icon={<IconAlertCircle size={18} />}
              action={{
                label: tt('hero_action'),
                onClick: () => markBezahlt(heroRechnung),
              }}
            >
              <b>{ueberfaelligRechnungen.length === 1
                ? tt('hero_ueberfaellig', { n: 1 })
                : tt('hero_ueberfaellig_pl', { n: ueberfaelligRechnungen.length })}
              </b>
              {' — '}{tt('hero_ueberfaellig_hint')}
              {' '}{namen(ueberfaelligRechnungen.map(r => r.kundeName || r.fields.rechnungsnummer || ''))}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_offen')}
              value={countOffen}
              icon={<IconClipboardList size={16} />}
              tone={countOffen > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_in_bearbeitung')}
              value={countInBearbeitung}
              icon={<IconCar size={16} />}
              tone={countInBearbeitung > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_abgeschlossen')}
              value={countAbgeschlossen}
              icon={<IconCircleCheck size={16} />}
              tone="success"
            />
            <StatStripItem
              title={tt('kpi_rechnungen')}
              value={offeneRechnungen.length}
              icon={<IconReceipt size={16} />}
              tone={ueberfaelligRechnungen.length > 0 ? 'destructive' : offeneRechnungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_fahrzeuge')}
              value={fahrzeuge.length}
              icon={<IconCar size={16} />}
              tone="default"
            />
          </StatStrip>
        }
        aside={
          <>
            <WorkList
              title={tt('aside_title')}
              items={anstehendeInspektionen.slice(0, 8).map(i => ({
                id: i.record_id,
                title: i.fahrzeugName || appLabel('fahrzeuge'),
                secondLine: (
                  <>
                    <span className="text-muted-foreground">{formatDateTime(i.fields.wunschtermin_inspektion)}</span>
                  </>
                ),
                action: {
                  label: tc('bearbeiten'),
                  onClick: () => openInspektionEdit(i),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'inspektion', id })}
              empty={{
                text: tt('aside_empty'),
                action: { label: appLabel('jahresinspektion_planen'), onClick: () => openInspektionCreate() },
              }}
            />
            <WorkList
              title={tt('aside2_title')}
              items={offeneRechnungen.slice(0, 8).map(r => ({
                id: r.record_id,
                title: r.fields.rechnungsnummer ?? appLabel('rechnungen'),
                secondLine: (
                  <>
                    <span className={
                      lookupKey(r.fields.status_rechnung) === 'ueberfaellig'
                        ? 'font-medium text-destructive'
                        : 'text-muted-foreground'
                    }>
                      {r.fields.status_rechnung?.label ?? ''}
                    </span>
                    {r.kundeName ? <span className="text-muted-foreground"> · {r.kundeName}</span> : null}
                  </>
                ),
                action: {
                  label: tt('mark_bezahlt'),
                  onClick: () => markBezahlt(r),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'rechnung', id })}
              empty={{
                text: tt('aside2_empty'),
                action: { label: appLabel('rechnungen'), onClick: () => openRechnungCreate() },
              }}
            />
          </>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['abgeschlossen']}
            onCardClick={card => overlay.replace({ type: 'auftrag', id: card.id.split(':')[1] ?? '' })}
            onCardMove={moveCard}
            onAddCard={column => openAuftragCreate({ status: column })}
          />
        }
      />

      {/* Action button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => openAuftragCreate()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} />
          {tt('new_auftrag')}
        </button>
      </div>

      {/* ONE RecordOverlayHost for the entire overlay stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (!top) return null;
          if (top.type === 'auftrag') {
            const r = auftraege.find(a => a.record_id === top.id);
            if (!r) return null;
            return (
              <>
                <RecordHeader
                  title={r.fields.auftragsnummer ?? appLabel('auftraege')}
                  subtitle={r.fields.status?.label}
                  actions={
                    <button
                      onClick={() => openAuftragEdit(r)}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                    >
                      {tc('bearbeiten')}
                    </button>
                  }
                />
                <AuftraegeDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', id: f.record_id })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rech => overlay.push({ type: 'rechnung', id: rech.record_id })}
                  onAddRechnungen={() => openRechnungCreate({ auftrag: top.id, kunde: extractRecordId(r.fields.kunde) ?? undefined })}
                />
              </>
            );
          }
          if (top.type === 'fahrzeug') {
            const f = fahrzeuge.find(x => x.record_id === top.id);
            if (!f) return null;
            return (
              <>
                <RecordHeader
                  title={f.fields.kennzeichen ?? appLabel('fahrzeuge')}
                  subtitle={[f.fields.marke, f.fields.modell].filter(Boolean).join(' ')}
                  actions={
                    <button
                      onClick={() => openFahrzeugEdit(f)}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                    >
                      {tc('bearbeiten')}
                    </button>
                  }
                />
                <FahrzeugeDetails
                  record={f}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  onAddAuftraege={() => openAuftragCreate({ fahrzeug: top.id, kunde: extractRecordId(f.fields.kunde) ?? undefined })}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => overlay.push({ type: 'inspektion', id: i.record_id })}
                  onAddJahresinspektionPlanen={() => openInspektionCreate({ fahrzeug: top.id })}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = kunden.find(x => x.record_id === top.id);
            if (!k) return null;
            return (
              <>
                <RecordHeader
                  title={[k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || appLabel('kunden')}
                  subtitle={k.fields.email ?? k.fields.telefon}
                  actions={
                    <button
                      onClick={() => { setKundeEditId(k.record_id); setKundeOpen(true); }}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                    >
                      {tc('bearbeiten')}
                    </button>
                  }
                />
                <KundenDetails
                  record={k}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', id: f.record_id })}
                  onAddFahrzeuge={() => openFahrzeugCreate({ kunde: top.id })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  onAddAuftraege={() => openAuftragCreate({ kunde: top.id })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnung', id: r.record_id })}
                  onAddRechnungen={() => openRechnungCreate({ kunde: top.id })}
                />
              </>
            );
          }
          if (top.type === 'rechnung') {
            const r = rechnungen.find(x => x.record_id === top.id);
            if (!r) return null;
            return (
              <>
                <RecordHeader
                  title={r.fields.rechnungsnummer ?? appLabel('rechnungen')}
                  subtitle={r.fields.status_rechnung?.label}
                  actions={
                    <button
                      onClick={() => openRechnungEdit(r)}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                    >
                      {tc('bearbeiten')}
                    </button>
                  }
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={p => overlay.push({ type: 'pdf', id: p.record_id })}
                  onAddRechnungsPdfErstellen={() => openPdfCreate({ rechnung: top.id })}
                />
              </>
            );
          }
          if (top.type === 'inspektion') {
            const i = jahresinspektionPlanen.find(x => x.record_id === top.id);
            if (!i) return null;
            return (
              <>
                <RecordHeader
                  title={appLabel('jahresinspektion_planen')}
                  subtitle={formatDateTime(i.fields.wunschtermin_inspektion)}
                  actions={
                    <button
                      onClick={() => openInspektionEdit(i)}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                    >
                      {tc('bearbeiten')}
                    </button>
                  }
                />
                <JahresinspektionPlanenDetails
                  record={i}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', id: f.record_id })}
                />
              </>
            );
          }
          if (top.type === 'pdf') {
            const p = rechnungsPdfErstellen.find(x => x.record_id === top.id);
            if (!p) return null;
            return (
              <>
                <RecordHeader
                  title={p.fields.pdf_rechnungsnummer ?? appLabel('rechnungs_pdf_erstellen')}
                  subtitle={[p.fields.pdf_kunde_vorname, p.fields.pdf_kunde_nachname].filter(Boolean).join(' ')}
                  actions={
                    <button
                      onClick={() => openPdfEdit(p)}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                    >
                      {tc('bearbeiten')}
                    </button>
                  }
                />
                <RechnungsPdfErstellenDetails
                  record={p}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnung', id: r.record_id })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (!top) return undefined;
          if (top.type === 'rechnung') {
            const r = rechnungen.find(x => x.record_id === top.id);
            const s = lookupKey(r?.fields.status_rechnung);
            if (r && (s === 'offen' || s === 'ueberfaellig')) {
              return { label: tt('mark_bezahlt'), onClick: () => { markBezahlt(enrichedRechnungen.find(x => x.record_id === r.record_id)!); overlay.close(); } };
            }
          }
          if (top.type === 'auftrag') {
            const a = auftraege.find(x => x.record_id === top.id);
            const s = lookupKey(a?.fields.status);
            if (a && s === 'offen') {
              return {
                label: COLUMNS.find(c => c.key === 'in_bearbeitung')?.label ?? tt('kpi_in_bearbeitung'),
                onClick: () => { moveCard(`auftrag:${a.record_id}`, 'in_bearbeitung'); overlay.close(); },
              };
            }
            if (a && s === 'in_bearbeitung') {
              return {
                label: COLUMNS.find(c => c.key === 'abgeschlossen')?.label ?? tt('kpi_abgeschlossen'),
                onClick: () => { moveCard(`auftrag:${a.record_id}`, 'abgeschlossen'); overlay.close(); },
              };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (!top) return;
          if (top.type === 'auftrag') {
            const a = auftraege.find(x => x.record_id === top.id);
            if (a) openAuftragEdit(a);
          }
        }}
      />

      {/* Dialogs */}
      <AuftraegeDialog
        open={auftragOpen}
        onClose={() => setAuftragOpen(false)}
        onSubmit={async fields => {
          if (auftragEditId) {
            await LivingAppsService.updateAuftraegeEntry(auftragEditId, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={auftragDefaults}
        recordId={auftragEditId}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />

      <FahrzeugeDialog
        open={fahrzeugOpen}
        onClose={() => setFahrzeugOpen(false)}
        onSubmit={async fields => {
          if (fahrzeugEditId) {
            await LivingAppsService.updateFahrzeugeEntry(fahrzeugEditId, fields);
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={fahrzeugDefaults}
        recordId={fahrzeugEditId}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />

      <KundenDialog
        open={kundeOpen}
        onClose={() => setKundeOpen(false)}
        onSubmit={async fields => {
          if (kundeEditId) {
            await LivingAppsService.updateKundenEntry(kundeEditId, fields);
          } else {
            await LivingAppsService.createKundenEntry(fields);
          }
          fetchAll();
        }}
        recordId={kundeEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />

      <RechnungenDialog
        open={rechnungOpen}
        onClose={() => setRechnungOpen(false)}
        onSubmit={async fields => {
          if (rechnungEditId) {
            await LivingAppsService.updateRechnungenEntry(rechnungEditId, fields);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={rechnungDefaults}
        recordId={rechnungEditId}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />

      <JahresinspektionPlanenDialog
        open={inspektionOpen}
        onClose={() => setInspektionOpen(false)}
        onSubmit={async fields => {
          if (inspektionEditId) {
            await LivingAppsService.updateJahresinspektionPlanenEntry(inspektionEditId, fields);
          } else {
            await LivingAppsService.createJahresinspektionPlanenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={inspektionDefaults}
        recordId={inspektionEditId}
        fahrzeugeList={fahrzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />

      <RechnungsPdfErstellenDialog
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        onSubmit={async fields => {
          if (pdfEditId) {
            await LivingAppsService.updateRechnungsPdfErstellenEntry(pdfEditId, fields);
          } else {
            await LivingAppsService.createRechnungsPdfErstellenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={pdfDefaults}
        recordId={pdfEditId}
        rechnungenList={rechnungen}
        enablePhotoScan={AI_PHOTO_SCAN['RechnungsPdfErstellen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['RechnungsPdfErstellen']}
      />
    </>
  );
}
