import { useState, useMemo, useCallback } from 'react';
import { format, parseISO, isBefore, isToday } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen } from '@/lib/enrich';
import type { EnrichedAuftraege, EnrichedRechnungen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen } from '@/types/app';
import { LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard, KanbanColumn } from '@/components/widgets/KanbanWidget';
import {
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { AuftraegeDetails } from '@/components/details/AuftraegeDetails';
import { FahrzeugeDetails } from '@/components/details/FahrzeugeDetails';
import { KundenDetails } from '@/components/details/KundenDetails';
import { RechnungenDetails } from '@/components/details/RechnungenDetails';
import { JahresinspektionPlanenDetails } from '@/components/details/JahresinspektionPlanenDetails';
import { AuftraegeDialog } from '@/components/dialogs/AuftraegeDialog';
import type { AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import { RechnungenDialog } from '@/components/dialogs/RechnungenDialog';
import type { RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import { KundenDialog } from '@/components/dialogs/KundenDialog';
import { FahrzeugeDialog } from '@/components/dialogs/FahrzeugeDialog';
import type { FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import { JahresinspektionPlanenDialog } from '@/components/dialogs/JahresinspektionPlanenDialog';
import type { JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { makeT, appLabel } from '@/i18n';
import { tc } from '@/i18n/common';
import {
  IconAlertCircle,
  IconCar,
  IconClipboardList,
  IconReceiptOff,
  IconCheck,
  IconPlus,
  IconCalendarEvent,
  IconUser,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    context_all_ok: 'Alle Aufträge sind im Plan — guter Tag!',
    context_one: '{n} offener Auftrag wartet auf Bearbeitung.',
    context_many: '{n} offene Aufträge warten auf Bearbeitung.',
    hero_ueberfaellig: '{n} Rechnung überfällig',
    hero_ueberfaellig_many: '{n} Rechnungen überfällig',
    hero_hint: 'sofort klären',
    btn_bezahlt: 'Als bezahlt markieren',
    btn_neuer_auftrag: 'Neuer Auftrag',
    aside_heute: 'Fällig & Aktiv',
    aside_inspektion: 'Anstehende Inspektionen',
    empty_heute: 'Keine aktiven Aufträge',
    empty_inspektion: 'Keine Inspektionen geplant',
    auftrag_abgeschlossen: '{nr} abgeschlossen',
    auftrag_in_bearbeitung: '{nr} in Bearbeitung',
    rechnung_bezahlt: '{nr} als bezahlt markiert',
    kpis_offen: 'Offen',
    kpis_in_bearbeitung: 'In Bearbeitung',
    kpis_ueberfaellig: 'Überfällige Rechnungen',
    kpis_fahrzeuge: 'Fahrzeuge',
    bezahlt: 'Bezahlt',
    einrichten: 'einrichten',
    lege_zunaechst_kunden_und_fahrze: 'Lege zunächst Kunden und Fahrzeuge an, um den ersten Auftrag zu erfassen.',
  },
  en: {
    context_all_ok: 'All orders are on track — have a great day!',
    context_one: '{n} open order waiting to be processed.',
    context_many: '{n} open orders waiting to be processed.',
    hero_ueberfaellig: '{n} invoice overdue',
    hero_ueberfaellig_many: '{n} invoices overdue',
    hero_hint: 'resolve immediately',
    btn_bezahlt: 'Mark as paid',
    btn_neuer_auftrag: 'New Order',
    aside_heute: 'Due & Active',
    aside_inspektion: 'Upcoming Inspections',
    empty_heute: 'No active orders',
    empty_inspektion: 'No inspections planned',
    auftrag_abgeschlossen: '{nr} completed',
    auftrag_in_bearbeitung: '{nr} in progress',
    rechnung_bezahlt: '{nr} marked as paid',
    kpis_offen: 'Open',
    kpis_in_bearbeitung: 'In Progress',
    kpis_ueberfaellig: 'Overdue Invoices',
    kpis_fahrzeuge: 'Vehicles',
    bezahlt: 'Paid',
    einrichten: 'set up',
    lege_zunaechst_kunden_und_fahrze: 'First, add customers and vehicles to create the first order.',
  },
});

type OverlayItem =
  | { type: 'auftrag'; record: EnrichedAuftraege }
  | { type: 'rechnung'; record: EnrichedRechnungen }
  | { type: 'fahrzeug'; record: Fahrzeuge }
  | { type: 'kunde'; record: Kunden }
  | { type: 'inspektion'; record: JahresinspektionPlanen };

export default function DashboardOverview() {
  const {
    kunden, setKunden,
    fahrzeuge, setFahrzeuge,
    auftraege, setAuftraege,
    rechnungen, setRechnungen,
    jahresinspektionPlanen,
    kundenMap, fahrzeugeMap, auftraegeMap, rechnungenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  // --- Dialog state ---
  const [auftragDialog, setAuftragDialog] = useState<{
    open: boolean;
    defaults?: AuftraegeDialogDefaults;
    recordId?: string;
  }>({ open: false });
  const [rechnungDialog, setRechnungDialog] = useState<{
    open: boolean;
    defaults?: RechnungenDialogDefaults;
    recordId?: string;
  }>({ open: false });
  const [kundeDialog, setKundeDialog] = useState(false);
  const [fahrzeugDialog, setFahrzeugDialog] = useState<{
    open: boolean;
    defaults?: FahrzeugeDialogDefaults;
    recordId?: string;
  }>({ open: false });
  const [inspektionDialog, setInspektionDialog] = useState<{
    open: boolean;
    defaults?: JahresinspektionPlanenDialogDefaults;
    recordId?: string;
  }>({ open: false });

  // --- Status filter for KPI strip ---
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // ─── Enrichment ─────────────────────────────────────────────────────────
  const enrichedFahrzeuge = useMemo(
    () => enrichFahrzeuge(fahrzeuge, { kundenMap }),
    [fahrzeuge, kundenMap]
  );
  const enrichedAuftraege = useMemo(
    () => enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap }),
    [auftraege, fahrzeugeMap, kundenMap]
  );
  const enrichedRechnungen = useMemo(
    () => enrichRechnungen(rechnungen, { auftraegeMap, kundenMap }),
    [rechnungen, auftraegeMap, kundenMap]
  );
  const enrichedInspektion = useMemo(
    () => enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap }),
    [jahresinspektionPlanen, fahrzeugeMap]
  );

  // ─── KPI derivations ────────────────────────────────────────────────────
  const today = format(clock, 'yyyy-MM-dd');

  const auftraegeOffen = useMemo(
    () => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'offen'),
    [enrichedAuftraege]
  );
  const auftraegeInBearbeitung = useMemo(
    () => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung'),
    [enrichedAuftraege]
  );
  const rechnungenUeberfaellig = useMemo(
    () => enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'ueberfaellig'),
    [enrichedRechnungen]
  );
  const aktiveAuftraege = useMemo(
    () => enrichedAuftraege.filter(
      a => lookupKey(a.fields.status) === 'offen' || lookupKey(a.fields.status) === 'in_bearbeitung'
    ).sort((a, b) => {
      const aDate = a.fields.wunschtermin ?? '';
      const bDate = b.fields.wunschtermin ?? '';
      return aDate.localeCompare(bDate);
    }),
    [enrichedAuftraege]
  );
  const anstehendeInspektionen = useMemo(
    () => enrichedInspektion
      .filter(i => {
        if (!i.fields.wunschtermin_inspektion) return true;
        try {
          return !isBefore(parseISO(i.fields.wunschtermin_inspektion), parseISO(today));
        } catch {
          return true;
        }
      })
      .sort((a, b) => (a.fields.wunschtermin_inspektion ?? '').localeCompare(b.fields.wunschtermin_inspektion ?? '')),
    [enrichedInspektion, today]
  );

  // ─── Advance helper (shared across board + overlay + aside) ─────────────
  const advanceAuftragStatus = useCallback(async (a: EnrichedAuftraege) => {
    const currentKey = lookupKey(a.fields.status) ?? 'offen';
    const nextKey = currentKey === 'offen' ? 'in_bearbeitung' : 'abgeschlossen';
    const nextLabel = LOOKUP_OPTIONS['auftraege']?.['status']?.find(o => o.key === nextKey)?.label ?? nextKey;
    const prevStatus = a.fields.status;
    // Optimistic update
    setAuftraege(prev => prev.map(x =>
      x.record_id === a.record_id
        ? { ...x, fields: { ...x.fields, status: { key: nextKey, label: nextLabel } } }
        : x
    ));
    const msg = nextKey === 'abgeschlossen'
      ? tt('auftrag_abgeschlossen', { nr: a.fields.auftragsnummer ?? '' })
      : tt('auftrag_in_bearbeitung', { nr: a.fields.auftragsnummer ?? '' });
    undoToast(msg, async () => {
      setAuftraege(prev => prev.map(x =>
        x.record_id === a.record_id
          ? { ...x, fields: { ...x.fields, status: prevStatus } }
          : x
      ));
      try {
        await LivingAppsService.updateAuftraegeEntry(a.record_id, { status: currentKey });
      } catch {
        await fetchAll();
      }
    });
    try {
      await LivingAppsService.updateAuftraegeEntry(a.record_id, { status: nextKey });
    } catch {
      await fetchAll();
    }
  }, [setAuftraege, fetchAll]);

  const markRechnungBezahlt = useCallback(async (r: EnrichedRechnungen) => {
    const prevStatus = r.fields.status_rechnung;
    setRechnungen(prev => prev.map(x =>
      x.record_id === r.record_id
        ? { ...x, fields: { ...x.fields, status_rechnung: { key: 'bezahlt', label: tt('bezahlt') } } }
        : x
    ));
    undoToast(tt('rechnung_bezahlt', { nr: r.fields.rechnungsnummer ?? '' }), async () => {
      setRechnungen(prev => prev.map(x =>
        x.record_id === r.record_id
          ? { ...x, fields: { ...x.fields, status_rechnung: prevStatus } }
          : x
      ));
      try {
        await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: prevStatus ? (typeof prevStatus === 'object' ? prevStatus.key : prevStatus) : 'offen' });
      } catch {
        await fetchAll();
      }
    });
    try {
      await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: 'bezahlt' });
    } catch {
      await fetchAll();
    }
  }, [setRechnungen, fetchAll]);

  // ─── Kanban columns & cards ─────────────────────────────────────────────
  const kanbanColumns = useMemo((): KanbanColumn[] => {
    return (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({
      key: o.key,
      label: o.label,
      tone: o.key === 'abgeschlossen' ? 'success' as const
        : o.key === 'offen' ? 'warning' as const
        : 'default' as const,
    }));
  }, []);

  const visibleAuftraege = useMemo(() => {
    if (!statusFilter) return enrichedAuftraege;
    return enrichedAuftraege.filter(a => lookupKey(a.fields.status) === statusFilter);
  }, [enrichedAuftraege, statusFilter]);

  const kanbanCards = useMemo((): KanbanCard[] =>
    visibleAuftraege
      .sort((a, b) => (a.fields.wunschtermin ?? '').localeCompare(b.fields.wunschtermin ?? ''))
      .map(a => ({
        id: `auftrag:${a.record_id}`,
        column: lookupKey(a.fields.status) ?? 'offen',
        title: a.fields.auftragsnummer ?? appLabel('auftraege'),
        subtitle: [
          a.fahrzeugName,
          a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : null,
        ].filter(Boolean).join(' · '),
        tone: lookupKey(a.fields.prioritaet) === 'hoch' ? 'destructive' as const
          : lookupKey(a.fields.prioritaet) === 'normal' ? 'warning' as const
          : 'default' as const,
      })),
    [visibleAuftraege]
  );

  const onCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const recordId = cardId.split(':')[1];
    const auftrag = auftraege.find(a => a.record_id === recordId);
    if (!auftrag) return;
    const newLabel = LOOKUP_OPTIONS['auftraege']?.['status']?.find(o => o.key === newColumn)?.label ?? newColumn;
    const prevStatus = auftrag.fields.status;
    setAuftraege(prev => prev.map(x =>
      x.record_id === recordId
        ? { ...x, fields: { ...x.fields, status: { key: newColumn, label: newLabel } } }
        : x
    ));
    undoToast(`${auftrag.fields.auftragsnummer ?? appLabel('auftraege')} → ${newLabel}`, async () => {
      setAuftraege(prev => prev.map(x =>
        x.record_id === recordId
          ? { ...x, fields: { ...x.fields, status: prevStatus } }
          : x
      ));
      try {
        await LivingAppsService.updateAuftraegeEntry(recordId, { status: prevStatus ? (typeof prevStatus === 'object' ? prevStatus.key : prevStatus) : 'offen' });
      } catch {
        await fetchAll();
      }
    });
    try {
      await LivingAppsService.updateAuftraegeEntry(recordId, { status: newColumn });
    } catch {
      await fetchAll();
    }
  }, [auftraege, setAuftraege, fetchAll]);

  // ─── Context line ────────────────────────────────────────────────────────
  const contextLine = useMemo(() => {
    const n = auftraegeOffen.length + auftraegeInBearbeitung.length;
    if (n === 0) return tt('context_all_ok');
    if (n === 1) return tt('context_one', { n: 1 });
    return tt('context_many', { n });
  }, [auftraegeOffen.length, auftraegeInBearbeitung.length]);

  // ─── Early returns ────────────────────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ─── Hero ────────────────────────────────────────────────────────────────
  const topUeberfaellig = rechnungenUeberfaellig[0];
  const hero = rechnungenUeberfaellig.length > 0 && topUeberfaellig ? (
    <HeroBanner
      icon={<IconReceiptOff size={18} />}
      action={{
        label: tt('btn_bezahlt'),
        onClick: () => markRechnungBezahlt(topUeberfaellig),
      }}
    >
      <b>{namen(rechnungenUeberfaellig.map(r => r.kundeName ?? r.fields.rechnungsnummer ?? ''))}</b>
      {' — '}
      {rechnungenUeberfaellig.length === 1
        ? tt('hero_ueberfaellig', { n: 1 })
        : tt('hero_ueberfaellig_many', { n: rechnungenUeberfaellig.length })},{' '}
      {tt('hero_hint')}.
    </HeroBanner>
  ) : undefined;

  // ─── Empty state ─────────────────────────────────────────────────────────
  if (auftraege.length === 0 && kunden.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <IconCar size={48} className="text-muted-foreground" stroke={1.5} />
        <h2 className="text-xl font-semibold">{appLabel('auftraege')} {tt('einrichten')}</h2>
        <p className="text-muted-foreground max-w-sm">
          {tt('lege_zunaechst_kunden_und_fahrze')}
        </p>
        <button
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          onClick={() => setKundeDialog(true)}
        >
          <IconPlus size={16} />
          {tc('neu')} {appLabel('kunden')}
        </button>
        <KundenDialog
          open={kundeDialog}
          onClose={() => setKundeDialog(false)}
          onSubmit={async fields => { await LivingAppsService.createKundenEntry(fields); fetchAll(); }}
          enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
        />
      </div>
    );
  }

  // ─── KPI strip ────────────────────────────────────────────────────────────
  const kpis = (
    <StatStrip>
      <StatStripItem
        title={tt('kpis_offen')}
        value={auftraegeOffen.length}
        icon={<IconClipboardList size={16} className="shrink-0" />}
        tone={auftraegeOffen.length > 0 ? 'warning' : 'default'}
        onClick={() => setStatusFilter(f => f === 'offen' ? null : 'offen')}
        active={statusFilter === 'offen'}
      />
      <StatStripItem
        title={tt('kpis_in_bearbeitung')}
        value={auftraegeInBearbeitung.length}
        icon={<IconClipboardList size={16} className="shrink-0" />}
        tone="primary"
        onClick={() => setStatusFilter(f => f === 'in_bearbeitung' ? null : 'in_bearbeitung')}
        active={statusFilter === 'in_bearbeitung'}
      />
      <StatStripItem
        title={tt('kpis_ueberfaellig')}
        value={rechnungenUeberfaellig.length}
        icon={<IconAlertCircle size={16} className="shrink-0" />}
        tone={rechnungenUeberfaellig.length > 0 ? 'destructive' : 'default'}
      />
      <StatStripItem
        title={tt('kpis_fahrzeuge')}
        value={fahrzeuge.length}
        icon={<IconCar size={16} className="shrink-0" />}
        tone="default"
      />
    </StatStrip>
  );

  // ─── Aside ────────────────────────────────────────────────────────────────
  const aside = (
    <>
      <WorkList
        title={tt('aside_heute')}
        items={aktiveAuftraege.map(a => {
          const statusKey = lookupKey(a.fields.status);
          const isDueToday = a.fields.wunschtermin
            ? isToday(parseISO(a.fields.wunschtermin))
            : false;
          return {
            id: a.record_id,
            title: `${a.fields.auftragsnummer ?? appLabel('auftraege')} · ${a.fahrzeugName || '—'}`,
            secondLine: (
              <>
                <span className={`font-medium ${statusKey === 'in_bearbeitung' ? 'text-primary' : 'text-warning-foreground'}`}>
                  {a.fields.status?.label ?? statusKey}
                </span>
                {a.fields.wunschtermin && (
                  <span className="text-muted-foreground">
                    {' · '}{isDueToday ? 'Heute' : formatDate(a.fields.wunschtermin)}
                  </span>
                )}
              </>
            ),
            action: statusKey !== 'abgeschlossen'
              ? {
                  label: statusKey === 'offen' ? tc('weiter') : tc('abschliessen'),
                  onClick: () => advanceAuftragStatus(a),
                }
              : undefined,
          };
        })}
        onItemClick={id => {
          const a = enrichedAuftraege.find(x => x.record_id === id);
          if (a) overlay.replace({ type: 'auftrag', record: a });
        }}
        empty={{
          text: tt('empty_heute'),
          action: { label: tt('btn_neuer_auftrag'), onClick: () => setAuftragDialog({ open: true }) },
        }}
      />
      <WorkList
        title={tt('aside_inspektion')}
        items={anstehendeInspektionen.map(i => ({
          id: i.record_id,
          title: i.fahrzeugName || appLabel('fahrzeuge'),
          secondLine: (
            <span className="text-muted-foreground">
              {i.fields.wunschtermin_inspektion ? formatDate(i.fields.wunschtermin_inspektion) : '—'}
            </span>
          ),
          action: {
            label: tc('bearbeiten'),
            onClick: () => setInspektionDialog({ open: true, defaults: { fahrzeug: extractRecordId(i.fields.fahrzeug) ?? undefined }, recordId: i.record_id }),
          },
        }))}
        onItemClick={id => {
          const i = enrichedInspektion.find(x => x.record_id === id);
          if (i) overlay.replace({ type: 'inspektion', record: i });
        }}
        empty={{
          text: tt('empty_inspektion'),
          action: {
            label: `${tc('neu')} ${appLabel('jahresinspektion_planen')}`,
            onClick: () => setInspektionDialog({ open: true }),
          },
        }}
      />
    </>
  );

  return (
    <>
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
            <p className="text-muted-foreground mt-1">{contextLine}</p>
          </div>
          <button
            onClick={() => setAuftragDialog({ open: true })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium shrink-0"
          >
            <IconPlus size={16} className="shrink-0" />
            {tt('btn_neuer_auftrag')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={hero}
        kpis={kpis}
        primary={
          <KanbanWidget
            columns={kanbanColumns}
            cards={kanbanCards}
            onCardClick={card => {
              const recordId = card.id.split(':')[1];
              const a = enrichedAuftraege.find(x => x.record_id === recordId);
              if (a) overlay.replace({ type: 'auftrag', record: a });
            }}
            onCardMove={onCardMove}
            onAddCard={column => setAuftragDialog({ open: true, defaults: { status: column } })}
            defaultCollapsed={['abgeschlossen']}
          />
        }
        aside={aside}
      />

      {/* ─── Record overlay ─────────────────────────────────────────────────── */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftrag') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fields.auftragsnummer ?? appLabel('auftraege')}
                  subtitle={[r.fahrzeugName, r.kundeName].filter(Boolean).join(' · ')}
                  badges={
                    r.fields.status ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {r.fields.status.label}
                      </span>
                    ) : undefined
                  }
                />
                <AuftraegeDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={fahr => overlay.push({ type: 'fahrzeug', record: fahr })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', record: k })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rech => overlay.push({ type: 'rechnung', record: enrichedRechnungen.find(x => x.record_id === rech.record_id) ?? { ...rech, auftragName: '', kundeName: '' } })}
                  onAddRechnungen={() => {
                    const auftragId = r.record_id;
                    const kundeId = extractRecordId(r.fields.kunde);
                    setRechnungDialog({
                      open: true,
                      defaults: {
                        auftrag: auftragId,
                        kunde: kundeId ?? undefined,
                      },
                    });
                  }}
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
                  subtitle={r.kundeName || undefined}
                  badges={
                    r.fields.status_rechnung ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        lookupKey(r.fields.status_rechnung) === 'ueberfaellig'
                          ? 'bg-destructive/10 text-destructive'
                          : lookupKey(r.fields.status_rechnung) === 'bezahlt'
                          ? 'bg-success/10 text-success-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {r.fields.status_rechnung.label}
                      </span>
                    ) : undefined
                  }
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', record: enrichedAuftraege.find(x => x.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', record: k })}
                  rechnungsPdfErstellenList={[]}
                  onOpenRechnungsPdfErstellen={() => {}}
                  onAddRechnungsPdfErstellen={() => {}}
                />
              </>
            );
          }
          if (top.type === 'fahrzeug') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={[r.fields.marke, r.fields.modell].filter(Boolean).join(' ') || appLabel('fahrzeuge')}
                  subtitle={r.fields.kennzeichen}
                />
                <FahrzeugeDetails
                  record={r}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', record: k })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', record: enrichedAuftraege.find(x => x.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onAddAuftraege={() => setAuftragDialog({ open: true, defaults: { fahrzeug: r.record_id } })}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => overlay.push({ type: 'inspektion', record: i })}
                  onAddJahresinspektionPlanen={() => setInspektionDialog({ open: true, defaults: { fahrzeug: r.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={[r.fields.vorname, r.fields.nachname].filter(Boolean).join(' ') || appLabel('kunden')}
                  subtitle={r.fields.email ?? r.fields.telefon}
                  meta={
                    r.fields.ort ? (
                      <span className="flex items-center gap-1 text-muted-foreground text-sm">
                        <IconUser size={14} className="shrink-0" />
                        {[r.fields.strasse, r.fields.hausnummer, r.fields.plz, r.fields.ort].filter(Boolean).join(' ')}
                      </span>
                    ) : undefined
                  }
                />
                <KundenDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', record: f })}
                  onAddFahrzeuge={() => setFahrzeugDialog({ open: true, defaults: { kunde: r.record_id } })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', record: enrichedAuftraege.find(x => x.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onAddAuftraege={() => setAuftragDialog({ open: true, defaults: { kunde: r.record_id } })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rech => overlay.push({ type: 'rechnung', record: enrichedRechnungen.find(x => x.record_id === rech.record_id) ?? { ...rech, auftragName: '', kundeName: '' } })}
                  onAddRechnungen={() => setRechnungDialog({ open: true, defaults: { kunde: r.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'inspektion') {
            const r = top.record;
            const fahrzeugRecord = fahrzeuge.find(f => f.record_id === extractRecordId(r.fields.fahrzeug));
            return (
              <>
                <RecordHeader
                  title={appLabel('jahresinspektion_planen')}
                  subtitle={fahrzeugRecord
                    ? [fahrzeugRecord.fields.kennzeichen, fahrzeugRecord.fields.marke, fahrzeugRecord.fields.modell].filter(Boolean).join(' · ')
                    : undefined}
                  meta={r.fields.wunschtermin_inspektion ? (
                    <span className="flex items-center gap-1 text-muted-foreground text-sm">
                      <IconCalendarEvent size={14} className="shrink-0" />
                      {formatDate(r.fields.wunschtermin_inspektion)}
                    </span>
                  ) : undefined}
                />
                <JahresinspektionPlanenDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', record: f })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'auftrag') {
            const statusKey = lookupKey(top.record.fields.status);
            if (statusKey === 'abgeschlossen') return undefined;
            return {
              label: statusKey === 'offen' ? tc('weiter') : tc('abschliessen'),
              onClick: () => advanceAuftragStatus(top.record),
            };
          }
          if (top.type === 'rechnung') {
            const statusKey = lookupKey(top.record.fields.status_rechnung);
            if (statusKey === 'bezahlt') return undefined;
            return {
              label: tt('btn_bezahlt'),
              onClick: () => markRechnungBezahlt(top.record),
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'auftrag') {
            setAuftragDialog({ open: true, defaults: top.record.fields as AuftraegeDialogDefaults, recordId: top.record.record_id });
          } else if (top.type === 'rechnung') {
            setRechnungDialog({ open: true, defaults: top.record.fields as RechnungenDialogDefaults, recordId: top.record.record_id });
          } else if (top.type === 'fahrzeug') {
            setFahrzeugDialog({ open: true, defaults: top.record.fields as FahrzeugeDialogDefaults, recordId: top.record.record_id });
          } else if (top.type === 'inspektion') {
            setInspektionDialog({ open: true, defaults: top.record.fields as JahresinspektionPlanenDialogDefaults, recordId: top.record.record_id });
          }
        }}
      />

      {/* ─── Dialogs ─────────────────────────────────────────────────────────── */}
      <AuftraegeDialog
        open={auftragDialog.open}
        onClose={() => setAuftragDialog({ open: false })}
        onSubmit={async fields => {
          if (auftragDialog.recordId) {
            await LivingAppsService.updateAuftraegeEntry(auftragDialog.recordId, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={auftragDialog.defaults}
        recordId={auftragDialog.recordId}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />
      <RechnungenDialog
        open={rechnungDialog.open}
        onClose={() => setRechnungDialog({ open: false })}
        onSubmit={async fields => {
          if (rechnungDialog.recordId) {
            await LivingAppsService.updateRechnungenEntry(rechnungDialog.recordId, fields);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={rechnungDialog.defaults}
        recordId={rechnungDialog.recordId}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />
      <KundenDialog
        open={kundeDialog}
        onClose={() => setKundeDialog(false)}
        onSubmit={async fields => { await LivingAppsService.createKundenEntry(fields); fetchAll(); }}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />
      <FahrzeugeDialog
        open={fahrzeugDialog.open}
        onClose={() => setFahrzeugDialog({ open: false })}
        onSubmit={async fields => {
          if (fahrzeugDialog.recordId) {
            await LivingAppsService.updateFahrzeugeEntry(fahrzeugDialog.recordId, fields);
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={fahrzeugDialog.defaults}
        recordId={fahrzeugDialog.recordId}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />
      <JahresinspektionPlanenDialog
        open={inspektionDialog.open}
        onClose={() => setInspektionDialog({ open: false })}
        onSubmit={async fields => {
          if (inspektionDialog.recordId) {
            await LivingAppsService.updateJahresinspektionPlanenEntry(inspektionDialog.recordId, fields);
          } else {
            await LivingAppsService.createJahresinspektionPlanenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={inspektionDialog.defaults}
        recordId={inspektionDialog.recordId}
        fahrzeugeList={fahrzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />
    </>
  );
}
