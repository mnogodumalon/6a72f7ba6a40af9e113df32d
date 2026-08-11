import { useState, useMemo, useCallback } from 'react';
import { format, parseISO, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedAuftraege, EnrichedRechnungen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard, KanbanColumn } from '@/components/widgets/KanbanWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
  RecordAttachments,
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
import type { RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import type { JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { makeT, appLabel } from '@/i18n';
import {
  IconAlertTriangle,
  IconPlus,
  IconCheck,
  IconCar,
  IconFileInvoice,
  IconTool,
  IconCalendarEvent,
  IconUsers,
  IconClock,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    hero_overdue: 'Überfällige Rechnungen',
    hero_action: 'Jetzt als bezahlt markieren',
    kpi_open: 'Offene Aufträge',
    kpi_inprogress: 'In Bearbeitung',
    kpi_done: 'Abgeschlossen',
    kpi_overdue_inv: 'Überfällige Rechnungen',
    kpi_inspections: 'Bevorstehende Inspektionen',
    aside_overdue: 'Überfällige Rechnungen',
    aside_today: 'Heutige Wunschtermine',
    aside_inspection: 'Nächste Inspektionen',
    empty_invoices: 'Keine überfälligen Rechnungen — alles im grünen Bereich',
    empty_today: 'Keine Wunschtermine heute',
    empty_inspection: 'Keine Inspektionen geplant',
    new_order: 'Neuer Auftrag',
    new_invoice: 'Neue Rechnung',
    new_inspection: 'Neue Inspektion',
    mark_paid: '✓ Bezahlt',
    advance_done: 'Abschließen',
    context_line: '{gruss} — {text}',
    no_data: 'Kein aktueller Auftrag',
  },
  en: {
    hero_overdue: 'Overdue Invoices',
    hero_action: 'Mark as paid now',
    kpi_open: 'Open Orders',
    kpi_inprogress: 'In Progress',
    kpi_done: 'Completed',
    kpi_overdue_inv: 'Overdue Invoices',
    kpi_inspections: 'Upcoming Inspections',
    aside_overdue: 'Overdue Invoices',
    aside_today: 'Today\'s Appointments',
    aside_inspection: 'Next Inspections',
    empty_invoices: 'No overdue invoices — everything looks good',
    empty_today: 'No appointments today',
    empty_inspection: 'No inspections scheduled',
    new_order: 'New Order',
    new_invoice: 'New Invoice',
    new_inspection: 'New Inspection',
    mark_paid: '✓ Paid',
    advance_done: 'Complete',
    context_line: '{gruss} — {text}',
    no_data: 'No current order',
  },
});

type OverlayItem =
  | { type: 'auftrag'; record: EnrichedAuftraege }
  | { type: 'fahrzeug'; record: Fahrzeuge }
  | { type: 'kunde'; record: Kunden }
  | { type: 'rechnung'; record: EnrichedRechnungen }
  | { type: 'inspektion'; record: JahresinspektionPlanen }
  | { type: 'pdfErstellen'; record: RechnungsPdfErstellen };

export default function DashboardOverview() {
  const {
    kunden, fahrzeuge, auftraege, rechnungen, jahresinspektionPlanen, rechnungsPdfErstellen,
    kundenMap, fahrzeugeMap, auftraegeMap, rechnungenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();

  const enrichedFahrzeuge = enrichFahrzeuge(fahrzeuge, { kundenMap });
  const enrichedAuftraege = enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap });
  const enrichedRechnungen = enrichRechnungen(rechnungen, { auftraegeMap, kundenMap });
  const enrichedJahresinspektionPlanen = enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap });
  const enrichedRechnungsPdfErstellen = enrichRechnungsPdfErstellen(rechnungsPdfErstellen, { rechnungenMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [auftragDialog, setAuftragDialog] = useState<{ open: boolean; defaults?: AuftraegeDialogDefaults; editRecord?: EnrichedAuftraege }>({ open: false });
  const [fahrzeugDialog, setFahrzeugDialog] = useState<{ open: boolean; editRecord?: Fahrzeuge; kundeId?: string }>({ open: false });
  const [kundeDialog, setKundeDialog] = useState<{ open: boolean; editRecord?: Kunden }>({ open: false });
  const [rechnungDialog, setRechnungDialog] = useState<{ open: boolean; defaults?: RechnungenDialogDefaults; editRecord?: EnrichedRechnungen }>({ open: false });
  const [inspektionDialog, setInspektionDialog] = useState<{ open: boolean; defaults?: JahresinspektionPlanenDialogDefaults; editRecord?: JahresinspektionPlanen }>({ open: false });
  const [pdfDialog, setPdfDialog] = useState<{ open: boolean; editRecord?: RechnungsPdfErstellen; rechnungId?: string }>({ open: false });

  // Filters
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // ── Derived data ──
  const today = format(clock, 'yyyy-MM-dd');
  const todayStart = startOfDay(clock);
  const todayEnd = endOfDay(clock);

  const ueberfaelligeRechnungen = useMemo(
    () => enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'ueberfaellig'),
    [enrichedRechnungen]
  );

  const heutigeAuftraege = useMemo(
    () => enrichedAuftraege.filter(a => {
      if (!a.fields.wunschtermin) return false;
      const d = parseISO(a.fields.wunschtermin);
      return !isBefore(d, todayStart) && !isAfter(d, todayEnd);
    }),
    [enrichedAuftraege, todayStart, todayEnd]
  );

  const naechsteInspektionen = useMemo(
    () => enrichedJahresinspektionPlanen
      .filter(i => {
        if (!i.fields.wunschtermin_inspektion) return false;
        const d = parseISO(i.fields.wunschtermin_inspektion);
        return !isBefore(d, todayStart);
      })
      .sort((a, b) => {
        const da = a.fields.wunschtermin_inspektion ?? '';
        const db = b.fields.wunschtermin_inspektion ?? '';
        return da.localeCompare(db);
      }),
    [enrichedJahresinspektionPlanen, todayStart]
  );

  const offeneAuftraege = useMemo(() => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'offen'), [enrichedAuftraege]);
  const inBearbeitung = useMemo(() => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung'), [enrichedAuftraege]);
  const abgeschlossen = useMemo(() => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'abgeschlossen'), [enrichedAuftraege]);

  // Kanban columns from schema
  const kanbanColumns = useMemo((): KanbanColumn[] =>
    (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({
      key: o.key,
      label: o.label,
      tone: o.key === 'abgeschlossen' ? 'success' as const
        : o.key === 'in_bearbeitung' ? 'primary' as const
        : 'default' as const,
    })),
    []
  );

  // Kanban cards (filtered by statusFilter if set)
  const kanbanCards = useMemo((): KanbanCard[] => {
    const source = statusFilter
      ? enrichedAuftraege.filter(a => lookupKey(a.fields.status) === statusFilter)
      : enrichedAuftraege;
    return source.map(a => ({
      id: `auftrag:${a.record_id}`,
      column: lookupKey(a.fields.status) ?? 'offen',
      title: a.fields.auftragsnummer ?? appLabel('auftraege'),
      subtitle: [
        a.fahrzeugName || a.kundeName,
        a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : undefined,
      ].filter(Boolean).join(' · '),
      tone: lookupKey(a.fields.prioritaet) === 'hoch' ? 'warning' as const
        : lookupKey(a.fields.status) === 'abgeschlossen' ? 'success' as const
        : 'default' as const,
    }));
  }, [enrichedAuftraege, statusFilter]);

  // Context line — names people with appointments today
  const contextText = useMemo(() => {
    const names = heutigeAuftraege.map(a => a.kundeName || a.fahrzeugName || '').filter(Boolean);
    if (names.length > 0) return `Heute: ${namen(names)}`;
    const nextAuftrag = enrichedAuftraege
      .filter(a => lookupKey(a.fields.status) !== 'abgeschlossen')
      .sort((a, b) => (a.fields.wunschtermin ?? '').localeCompare(b.fields.wunschtermin ?? ''))[0];
    if (nextAuftrag) return `Nächster Termin: ${nextAuftrag.fahrzeugName || nextAuftrag.kundeName || ''}`;
    return tt('no_data');
  }, [heutigeAuftraege, enrichedAuftraege]);

  // ── Write helpers ──
  const markRechnungBezahlt = useCallback(async (rechnung: EnrichedRechnungen) => {
    const prev = lookupKey(rechnung.fields.status_rechnung);
    const label = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung']?.find(o => o.key === 'bezahlt')?.label ?? 'Bezahlt';
    rechnung.fields.status_rechnung = { key: 'bezahlt', label };
    undoToast(`${rechnung.fields.rechnungsnummer ?? ''} als bezahlt markiert`, async () => {
      rechnung.fields.status_rechnung = { key: prev ?? 'offen', label: prev ?? 'Offen' };
      await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: prev ?? 'offen' });
      fetchAll();
    });
    try {
      await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: 'bezahlt' });
    } catch {
      fetchAll();
    }
  }, [fetchAll]);

  const advanceAuftrag = useCallback(async (auftrag: EnrichedAuftraege, newStatus: string) => {
    const prevStatus = lookupKey(auftrag.fields.status);
    const newLabel = LOOKUP_OPTIONS['auftraege']?.['status']?.find(o => o.key === newStatus)?.label ?? newStatus;
    auftrag.fields.status = { key: newStatus, label: newLabel };
    undoToast(`Auftrag ${auftrag.fields.auftragsnummer ?? ''} → ${newLabel}`, async () => {
      auftrag.fields.status = { key: prevStatus ?? 'offen', label: prevStatus ?? 'Offen' };
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: prevStatus ?? 'offen' });
      fetchAll();
    });
    try {
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: newStatus });
    } catch {
      fetchAll();
    }
  }, [fetchAll]);

  const handleCardMove = useCallback(async (cardId: string, newColumn: string): Promise<void | string> => {
    const id = cardId.split(':')[1];
    const auftrag = enrichedAuftraege.find(a => a.record_id === id);
    if (!auftrag) return;
    await advanceAuftrag(auftrag, newColumn);
  }, [enrichedAuftraege, advanceAuftrag]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ── Overlay render helpers ──
  const findAuftrag = (id: string) => enrichedAuftraege.find(a => a.record_id === id);

  return (
    <>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-1">{contextText}</p>
        </div>
        <button
          onClick={() => setAuftragDialog({ open: true })}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          <IconPlus size={16} className="shrink-0" />
          {tt('new_order')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaelligeRechnungen.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tt('hero_action'),
              onClick: () => markRechnungBezahlt(ueberfaelligeRechnungen[0]),
            }}
          >
            <b>{namen(ueberfaelligeRechnungen.map(r => r.kundeName ?? r.fields.rechnungsnummer ?? ''))}</b>
            {' '}— {ueberfaelligeRechnungen.length === 1 ? '1 Rechnung überfällig' : `${ueberfaelligeRechnungen.length} Rechnungen überfällig`}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_open')}
              value={offeneAuftraege.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={offeneAuftraege.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'offen' ? null : 'offen')}
              active={statusFilter === 'offen'}
            />
            <StatStripItem
              title={tt('kpi_inprogress')}
              value={inBearbeitung.length}
              icon={<IconCar size={16} className="shrink-0" />}
              tone={inBearbeitung.length > 0 ? 'primary' : 'default'}
              onClick={() => setStatusFilter(f => f === 'in_bearbeitung' ? null : 'in_bearbeitung')}
              active={statusFilter === 'in_bearbeitung'}
            />
            <StatStripItem
              title={tt('kpi_done')}
              value={abgeschlossen.length}
              icon={<IconCheck size={16} className="shrink-0" />}
              tone="default"
              onClick={() => setStatusFilter(f => f === 'abgeschlossen' ? null : 'abgeschlossen')}
              active={statusFilter === 'abgeschlossen'}
            />
            <StatStripItem
              title={tt('kpi_overdue_inv')}
              value={ueberfaelligeRechnungen.length}
              icon={<IconFileInvoice size={16} className="shrink-0" />}
              tone={ueberfaelligeRechnungen.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_inspections')}
              value={naechsteInspektionen.length}
              icon={<IconCalendarEvent size={16} className="shrink-0" />}
              tone={naechsteInspektionen.length > 0 ? 'primary' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kanbanColumns}
            cards={kanbanCards}
            defaultCollapsed={['abgeschlossen']}
            onCardClick={card => {
              const id = card.id.split(':')[1];
              const a = enrichedAuftraege.find(x => x.record_id === id);
              if (a) overlay.replace({ type: 'auftrag', record: a });
            }}
            onCardMove={handleCardMove}
            onAddCard={column => setAuftragDialog({ open: true, defaults: { status: column } })}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('aside_overdue')}
              items={ueberfaelligeRechnungen.slice(0, 5).map(r => ({
                id: r.record_id,
                title: r.fields.rechnungsnummer ?? appLabel('rechnungen'),
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{tt('aside_overdue')}</span>
                    {r.fields.faelligkeitsdatum && (
                      <span className="text-muted-foreground"> · fällig {formatDate(r.fields.faelligkeitsdatum)}</span>
                    )}
                    {r.kundeName && <span className="text-muted-foreground"> · {r.kundeName}</span>}
                  </>
                ),
                action: {
                  label: tt('mark_paid'),
                  onClick: () => markRechnungBezahlt(r),
                },
              }))}
              onItemClick={id => {
                const r = enrichedRechnungen.find(x => x.record_id === id);
                if (r) overlay.replace({ type: 'rechnung', record: r });
              }}
              empty={{
                text: tt('empty_invoices'),
                action: { label: tt('new_invoice'), onClick: () => setRechnungDialog({ open: true }) },
              }}
            />

            <WorkList
              title={tt('aside_inspection')}
              items={naechsteInspektionen.slice(0, 5).map(i => {
                const fz = fahrzeuge.find(f => f.record_id === extractRecordId(i.fields.fahrzeug));
                return {
                  id: i.record_id,
                  title: fz ? `${fz.fields.kennzeichen ?? ''} ${fz.fields.marke ?? ''}`.trim() : appLabel('jahresinspektion_planen'),
                  secondLine: i.fields.wunschtermin_inspektion ? (
                    <span className="text-muted-foreground">
                      <IconClock size={12} className="inline mr-1 shrink-0" />
                      {formatDate(i.fields.wunschtermin_inspektion)}
                    </span>
                  ) : undefined,
                  action: {
                    label: tt('advance_done'),
                    onClick: () => overlay.replace({ type: 'inspektion', record: i }),
                  },
                };
              })}
              onItemClick={id => {
                const i = jahresinspektionPlanen.find(x => x.record_id === id);
                if (i) overlay.replace({ type: 'inspektion', record: i });
              }}
              empty={{
                text: tt('empty_inspection'),
                action: { label: tt('new_inspection'), onClick: () => setInspektionDialog({ open: true }) },
              }}
            />
          </>
        }
      />

      {/* ── Overlay stack ── */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftrag') {
            const a = top.record;
            const nextStatus = lookupKey(a.fields.status) === 'offen' ? 'in_bearbeitung'
              : lookupKey(a.fields.status) === 'in_bearbeitung' ? 'abgeschlossen'
              : null;
            const nextLabel = nextStatus
              ? (LOOKUP_OPTIONS['auftraege']?.['status']?.find(o => o.key === nextStatus)?.label ?? nextStatus)
              : null;
            return (
              <>
                <RecordHeader
                  title={a.fields.auftragsnummer ?? appLabel('auftraege')}
                  subtitle={[a.fahrzeugName, a.kundeName].filter(Boolean).join(' · ')}
                  badges={a.fields.status && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                      {a.fields.status.label}
                    </span>
                  )}
                />
                <AuftraegeDetails
                  record={a}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={fz => overlay.push({ type: 'fahrzeug', record: fz })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', record: k })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => {
                    const er = enrichedRechnungen.find(x => x.record_id === r.record_id);
                    if (er) overlay.push({ type: 'rechnung', record: er });
                  }}
                  onAddRechnungen={() => setRechnungDialog({ open: true, defaults: { auftrag: a.record_id, kunde: a.fields.kunde ? extractRecordId(a.fields.kunde) ?? undefined : undefined } })}
                />
              </>
            );
          }
          if (top.type === 'fahrzeug') {
            const fz = top.record;
            const kunde = kunden.find(k => k.record_id === extractRecordId(fz.fields.kunde));
            return (
              <>
                <RecordHeader
                  title={fz.fields.kennzeichen ?? appLabel('fahrzeuge')}
                  subtitle={[fz.fields.marke, fz.fields.modell, fz.fields.baujahr?.toString()].filter(Boolean).join(' · ')}
                />
                <FahrzeugeDetails
                  record={fz}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', record: k })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = enrichedAuftraege.find(x => x.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'auftrag', record: ea });
                  }}
                  onAddAuftraege={() => setAuftragDialog({ open: true, defaults: { fahrzeug: fz.record_id, kunde: kunde?.record_id } })}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => overlay.push({ type: 'inspektion', record: i })}
                  onAddJahresinspektionPlanen={() => setInspektionDialog({ open: true, defaults: { fahrzeug: fz.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = top.record;
            return (
              <>
                <RecordHeader
                  title={`${k.fields.vorname ?? ''} ${k.fields.nachname ?? ''}`.trim() || appLabel('kunden')}
                  subtitle={[k.fields.email, k.fields.telefon].filter(Boolean).join(' · ')}
                />
                <KundenDetails
                  record={k}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={fz => overlay.push({ type: 'fahrzeug', record: fz })}
                  onAddFahrzeuge={() => setFahrzeugDialog({ open: true, kundeId: k.record_id })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = enrichedAuftraege.find(x => x.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'auftrag', record: ea });
                  }}
                  onAddAuftraege={() => setAuftragDialog({ open: true, defaults: { kunde: k.record_id } })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => {
                    const er = enrichedRechnungen.find(x => x.record_id === r.record_id);
                    if (er) overlay.push({ type: 'rechnung', record: er });
                  }}
                  onAddRechnungen={() => setRechnungDialog({ open: true, defaults: { kunde: k.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'rechnung') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fields.rechnungsnummer ?? appLabel('rechnungen')}
                  subtitle={r.kundeName}
                  badges={r.fields.status_rechnung && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      lookupKey(r.fields.status_rechnung) === 'ueberfaellig' ? 'bg-destructive/10 text-destructive'
                        : lookupKey(r.fields.status_rechnung) === 'bezahlt' ? 'bg-success/10 text-success'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {r.fields.status_rechnung.label}
                    </span>
                  )}
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = enrichedAuftraege.find(x => x.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'auftrag', record: ea });
                  }}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', record: k })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={p => overlay.push({ type: 'pdfErstellen', record: p })}
                  onAddRechnungsPdfErstellen={() => setPdfDialog({ open: true, rechnungId: r.record_id })}
                />
              </>
            );
          }
          if (top.type === 'inspektion') {
            const i = top.record;
            return (
              <>
                <RecordHeader
                  title={appLabel('jahresinspektion_planen')}
                  subtitle={i.fields.wunschtermin_inspektion ? formatDate(i.fields.wunschtermin_inspektion) : undefined}
                />
                <JahresinspektionPlanenDetails
                  record={i}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={fz => overlay.push({ type: 'fahrzeug', record: fz })}
                />
              </>
            );
          }
          if (top.type === 'pdfErstellen') {
            const p = top.record;
            return (
              <>
                <RecordHeader
                  title={p.fields.pdf_rechnungsnummer ?? appLabel('rechnungs_pdf_erstellen')}
                  subtitle={[p.fields.pdf_kunde_vorname, p.fields.pdf_kunde_nachname].filter(Boolean).join(' ')}
                />
                <RechnungsPdfErstellenDetails
                  record={p}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => {
                    const er = enrichedRechnungen.find(x => x.record_id === r.record_id);
                    if (er) overlay.push({ type: 'rechnung', record: er });
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'auftrag') {
            const a = top.record;
            const nextStatus = lookupKey(a.fields.status) === 'offen' ? 'in_bearbeitung'
              : lookupKey(a.fields.status) === 'in_bearbeitung' ? 'abgeschlossen'
              : null;
            if (!nextStatus) return null;
            const nextLabel = LOOKUP_OPTIONS['auftraege']?.['status']?.find(o => o.key === nextStatus)?.label ?? nextStatus;
            return { label: `→ ${nextLabel}`, onClick: () => advanceAuftrag(a, nextStatus) };
          }
          if (top.type === 'rechnung') {
            const r = top.record;
            if (lookupKey(r.fields.status_rechnung) !== 'bezahlt') {
              return { label: tt('mark_paid'), onClick: () => markRechnungBezahlt(r) };
            }
          }
          return null;
        }}
      />

      {/* ── Dialogs ── */}
      <AuftraegeDialog
        open={auftragDialog.open}
        onClose={() => setAuftragDialog({ open: false })}
        onSubmit={async fields => {
          if (auftragDialog.editRecord) {
            await LivingAppsService.updateAuftraegeEntry(auftragDialog.editRecord.record_id, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={auftragDialog.editRecord?.fields ?? auftragDialog.defaults}
        recordId={auftragDialog.editRecord?.record_id}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />

      <FahrzeugeDialog
        open={fahrzeugDialog.open}
        onClose={() => setFahrzeugDialog({ open: false })}
        onSubmit={async fields => {
          if (fahrzeugDialog.editRecord) {
            await LivingAppsService.updateFahrzeugeEntry(fahrzeugDialog.editRecord.record_id, fields);
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={fahrzeugDialog.editRecord?.fields ?? (fahrzeugDialog.kundeId ? { kunde: fahrzeugDialog.kundeId } : undefined)}
        recordId={fahrzeugDialog.editRecord?.record_id}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />

      <KundenDialog
        open={kundeDialog.open}
        onClose={() => setKundeDialog({ open: false })}
        onSubmit={async fields => {
          if (kundeDialog.editRecord) {
            await LivingAppsService.updateKundenEntry(kundeDialog.editRecord.record_id, fields);
          } else {
            await LivingAppsService.createKundenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={kundeDialog.editRecord?.fields}
        recordId={kundeDialog.editRecord?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />

      <RechnungenDialog
        open={rechnungDialog.open}
        onClose={() => setRechnungDialog({ open: false })}
        onSubmit={async fields => {
          if (rechnungDialog.editRecord) {
            await LivingAppsService.updateRechnungenEntry(rechnungDialog.editRecord.record_id, fields);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={rechnungDialog.editRecord?.fields ?? rechnungDialog.defaults}
        recordId={rechnungDialog.editRecord?.record_id}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />

      <JahresinspektionPlanenDialog
        open={inspektionDialog.open}
        onClose={() => setInspektionDialog({ open: false })}
        onSubmit={async fields => {
          if (inspektionDialog.editRecord) {
            await LivingAppsService.updateJahresinspektionPlanenEntry(inspektionDialog.editRecord.record_id, fields);
          } else {
            await LivingAppsService.createJahresinspektionPlanenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={inspektionDialog.editRecord?.fields ?? inspektionDialog.defaults}
        recordId={inspektionDialog.editRecord?.record_id}
        fahrzeugeList={fahrzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />

      <RechnungsPdfErstellenDialog
        open={pdfDialog.open}
        onClose={() => setPdfDialog({ open: false })}
        onSubmit={async fields => {
          if (pdfDialog.editRecord) {
            await LivingAppsService.updateRechnungsPdfErstellenEntry(pdfDialog.editRecord.record_id, fields);
          } else {
            await LivingAppsService.createRechnungsPdfErstellenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={pdfDialog.editRecord?.fields ?? (pdfDialog.rechnungId ? { rechnung: pdfDialog.rechnungId } : undefined)}
        recordId={pdfDialog.editRecord?.record_id}
        rechnungenList={rechnungen}
        enablePhotoScan={AI_PHOTO_SCAN['RechnungsPdfErstellen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['RechnungsPdfErstellen']}
      />
    </>
  );
}
