import { useState, useMemo, useCallback } from 'react';
import { format, isPast, isToday, parseISO, startOfDay } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedAuftraege, EnrichedRechnungen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { makeT } from '@/i18n';
import { tc } from '@/i18n/common';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import {
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { AuftraegeDetails } from '@/components/details/AuftraegeDetails';
import { KundenDetails } from '@/components/details/KundenDetails';
import { FahrzeugeDetails } from '@/components/details/FahrzeugeDetails';
import { RechnungenDetails } from '@/components/details/RechnungenDetails';
import { JahresinspektionPlanenDetails } from '@/components/details/JahresinspektionPlanenDetails';
import { RechnungsPdfErstellenDetails } from '@/components/details/RechnungsPdfErstellenDetails';
import { AuftraegeDialog, type AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import { RechnungenDialog, type RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import { FahrzeugeDialog, type FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import { KundenDialog } from '@/components/dialogs/KundenDialog';
import { JahresinspektionPlanenDialog, type JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { RechnungsPdfErstellenDialog, type RechnungsPdfErstellenDialogDefaults } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { IconAlertCircle, IconPlus, IconCheck, IconClock } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

// i18n
const tt = makeT({
  de: {
    context_empty: 'Keine offenen Aufträge — bereit für neue Werkstattaufträge.',
    context_auftraege: 'Aktuell offen: {namen}.',
    hero_text: '{n} überfällige Rechnung — sofort begleichen.',
    hero_text_multi: '{n} überfällige Rechnungen — sofort begleichen.',
    hero_action: 'Als bezahlt markieren',
    kpi_offen: 'Offen',
    kpi_inbearbeitung: 'In Bearbeitung',
    kpi_abgeschlossen: 'Abgeschlossen',
    kpi_rechnungen_offen: 'Offene Rechnungen',
    kpi_ueberfaellig: 'Überfällige Rechnungen',
    worklist_heute: 'Heutige & dringende Aufträge',
    worklist_rechnungen: 'Ausstehende Rechnungen',
    worklist_empty_auftraege: 'Kein Auftrag ist heute fällig.',
    worklist_empty_rechnungen: 'Alle Rechnungen sind beglichen.',
    neuer_auftrag: 'Neuer Auftrag',
    action_abschliessen: 'Abschließen',
    action_bearbeiten: 'In Bearbeitung',
    als_bezahlt: 'Als bezahlt markieren',
    status_offen: 'Offen',
    status_inbearbeitung: 'In Bearbeitung',
    status_abgeschlossen: 'Abgeschlossen',
  },
  en: {
    context_empty: 'No open orders — ready for new workshop orders.',
    context_auftraege: 'Currently open: {namen}.',
    hero_text: '{n} overdue invoice — settle immediately.',
    hero_text_multi: '{n} overdue invoices — settle immediately.',
    hero_action: 'Mark as paid',
    kpi_offen: 'Open',
    kpi_inbearbeitung: 'In Progress',
    kpi_abgeschlossen: 'Completed',
    kpi_rechnungen_offen: 'Open Invoices',
    kpi_ueberfaellig: 'Overdue Invoices',
    worklist_heute: "Today's & Urgent Orders",
    worklist_rechnungen: 'Outstanding Invoices',
    worklist_empty_auftraege: 'No order is due today.',
    worklist_empty_rechnungen: 'All invoices are settled.',
    neuer_auftrag: 'New Order',
    action_abschliessen: 'Complete',
    action_bearbeiten: 'In Progress',
    als_bezahlt: 'Mark as paid',
    status_offen: 'Open',
    status_inbearbeitung: 'In Progress',
    status_abgeschlossen: 'Completed',
  },
});

type OverlayItem =
  | { type: 'auftrag'; id: string }
  | { type: 'kunde'; id: string }
  | { type: 'fahrzeug'; id: string }
  | { type: 'rechnung'; id: string }
  | { type: 'inspektion'; id: string }
  | { type: 'pdf'; id: string };

function toneForAuftragStatus(status: string | undefined): KanbanTone {
  if (status === 'in_bearbeitung') return 'primary';
  if (status === 'abgeschlossen') return 'default';
  return 'warning';
}

function toneForRechnungStatus(status: string | undefined): 'destructive' | 'warning' | 'default' {
  if (status === 'ueberfaellig') return 'destructive';
  if (status === 'offen') return 'warning';
  return 'default';
}

export default function DashboardOverview() {
  const {
    kunden, fahrzeuge, auftraege, rechnungen, jahresinspektionPlanen, rechnungsPdfErstellen,
    fahrzeugeMap, kundenMap, auftraegeMap, rechnungenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [auftragDialogOpen, setAuftragDialogOpen] = useState(false);
  const [auftragDefaults, setAuftragDefaults] = useState<AuftraegeDialogDefaults | undefined>(undefined);
  const [editingAuftrag, setEditingAuftrag] = useState<Auftraege | undefined>(undefined);

  const [rechnungDialogOpen, setRechnungDialogOpen] = useState(false);
  const [rechnungDefaults, setRechnungDefaults] = useState<RechnungenDialogDefaults | undefined>(undefined);
  const [editingRechnung, setEditingRechnung] = useState<Rechnungen | undefined>(undefined);

  const [fahrzeugDialogOpen, setFahrzeugDialogOpen] = useState(false);
  const [fahrzeugDefaults, setFahrzeugDefaults] = useState<FahrzeugeDialogDefaults | undefined>(undefined);
  const [editingFahrzeug, setEditingFahrzeug] = useState<Fahrzeuge | undefined>(undefined);

  const [kundenDialogOpen, setKundenDialogOpen] = useState(false);
  const [editingKunde, setEditingKunde] = useState<Kunden | undefined>(undefined);

  const [inspektionDialogOpen, setInspektionDialogOpen] = useState(false);
  const [inspektionDefaults, setInspektionDefaults] = useState<JahresinspektionPlanenDialogDefaults | undefined>(undefined);
  const [editingInspektion, setEditingInspektion] = useState<JahresinspektionPlanen | undefined>(undefined);

  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfDefaults, setPdfDefaults] = useState<RechnungsPdfErstellenDialogDefaults | undefined>(undefined);
  const [editingPdf, setEditingPdf] = useState<RechnungsPdfErstellen | undefined>(undefined);

  // Filter state for KPIs
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Enriched data
  const enrichedFahrzeuge = useMemo(() => enrichFahrzeuge(fahrzeuge, { kundenMap }), [fahrzeuge, kundenMap]);
  const enrichedAuftraege = useMemo(() => enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap }), [auftraege, fahrzeugeMap, kundenMap]);
  const enrichedRechnungen = useMemo(() => enrichRechnungen(rechnungen, { auftraegeMap, kundenMap }), [rechnungen, auftraegeMap, kundenMap]);
  const enrichedJahresinspektionPlanen = useMemo(() => enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap }), [jahresinspektionPlanen, fahrzeugeMap]);
  const enrichedRechnungsPdfErstellen = useMemo(() => enrichRechnungsPdfErstellen(rechnungsPdfErstellen, { rechnungenMap }), [rechnungsPdfErstellen, rechnungenMap]);

  // Kanban columns - INSIDE component body (locale-aware getters)
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Derived data
  const today = format(clock, 'yyyy-MM-dd');

  const offeneAuftraege = useMemo(() =>
    enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'offen'),
    [enrichedAuftraege],
  );
  const inBearbeitungAuftraege = useMemo(() =>
    enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung'),
    [enrichedAuftraege],
  );
  const abgeschlosseneAuftraege = useMemo(() =>
    enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'abgeschlossen'),
    [enrichedAuftraege],
  );

  const ueberfaelligeRechnungen = useMemo(() =>
    enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'ueberfaellig'),
    [enrichedRechnungen],
  );
  const offeneRechnungen = useMemo(() =>
    enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'offen'),
    [enrichedRechnungen],
  );

  // Today's / urgent orders for WorkList
  const dringendeAuftraege = useMemo(() => {
    const notDone = enrichedAuftraege.filter(a => lookupKey(a.fields.status) !== 'abgeschlossen');
    const todayOrOverdue = notDone.filter(a => {
      if (!a.fields.wunschtermin) return false;
      const d = a.fields.wunschtermin.slice(0, 10);
      return d <= today;
    });
    const hoch = notDone.filter(a => lookupKey(a.fields.prioritaet) === 'hoch' && !todayOrOverdue.find(x => x.record_id === a.record_id));
    return [...todayOrOverdue, ...hoch].slice(0, 8);
  }, [enrichedAuftraege, today]);

  // Kanban cards
  const kanbanCards = useMemo<KanbanCard[]>(() => {
    const source = statusFilter
      ? enrichedAuftraege.filter(a => lookupKey(a.fields.status) === statusFilter)
      : enrichedAuftraege;
    return source.map(a => {
      const status = lookupKey(a.fields.status) ?? COLUMNS[0]?.key ?? '';
      const kundeName = a.kundeName ?? a.fields.auftragsnummer ?? '—';
      const fahrzeugName = a.fahrzeugName ? ` · ${a.fahrzeugName}` : '';
      return {
        id: `auftrag:${a.record_id}`,
        column: status,
        title: kundeName + fahrzeugName,
        subtitle: a.fields.wunschtermin
          ? formatDate(a.fields.wunschtermin)
          : (a.fields.arbeitsbeschreibung?.slice(0, 60) ?? undefined),
        tone: toneForAuftragStatus(status),
      };
    });
  }, [enrichedAuftraege, COLUMNS, statusFilter]);

  // Status advance helper — shared by board, worklist, overlay footer
  const advanceAuftragStatus = useCallback(async (a: EnrichedAuftraege) => {
    const cur = lookupKey(a.fields.status);
    const next = cur === 'offen' ? 'in_bearbeitung' : cur === 'in_bearbeitung' ? 'abgeschlossen' : null;
    if (!next) return;
    const nextLabel = COLUMNS.find(c => c.key === next)?.label ?? next;
    undoToast(`${a.fields.auftragsnummer ?? a.kundeName ?? '—'} → ${nextLabel}`, async () => {
      await LivingAppsService.updateAuftraegeEntry(a.record_id, { status: cur ?? 'offen' });
      fetchAll();
    });
    try {
      await LivingAppsService.updateAuftraegeEntry(a.record_id, { status: next });
      fetchAll();
    } catch {
      fetchAll();
    }
  }, [COLUMNS, fetchAll]);

  // Mark Rechnung as paid
  const markRechnungBezahlt = useCallback(async (r: EnrichedRechnungen) => {
    const prev = lookupKey(r.fields.status_rechnung);
    undoToast(`${r.fields.rechnungsnummer ?? '—'} — ${tc('abgeschlossen')}`, async () => {
      await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: prev ?? 'offen' });
      fetchAll();
    });
    try {
      await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: 'bezahlt' });
      fetchAll();
    } catch {
      fetchAll();
    }
  }, [fetchAll]);

  // Kanban move
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const auftrag = enrichedAuftraege.find(a => a.record_id === rid);
    if (!auftrag) return;
    const prevKey = lookupKey(auftrag.fields.status) ?? 'offen';
    const _prevLabel = COLUMNS.find(c => c.key === prevKey)?.label ?? prevKey;
    undoToast(`${auftrag.fields.auftragsnummer ?? auftrag.kundeName ?? '—'} → ${COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn}`, async () => {
      await LivingAppsService.updateAuftraegeEntry(rid, { status: prevKey });
      fetchAll();
    });
    try {
      await LivingAppsService.updateAuftraegeEntry(rid, { status: newColumn });
      fetchAll();
    } catch {
      fetchAll();
    }
  }, [enrichedAuftraege, COLUMNS, fetchAll]);

  // Context line
  const contextLine = useMemo(() => {
    const activeNames = [...offeneAuftraege, ...inBearbeitungAuftraege]
      .map(a => a.kundeName ?? a.fields.auftragsnummer ?? '')
      .filter(Boolean);
    if (activeNames.length === 0) return tt('context_empty');
    return tt('context_auftraege', { namen: namen(activeNames) });
  }, [offeneAuftraege, inBearbeitungAuftraege]);

  // ─── ALL hooks above ─── early returns follow ───────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Overlay helpers
  const getAuftrag = (id: string) => enrichedAuftraege.find(a => a.record_id === id);
  const getKunde = (id: string) => kunden.find(k => k.record_id === id);
  const getFahrzeug = (id: string) => fahrzeuge.find(f => f.record_id === id);
  const getRechnung = (id: string) => enrichedRechnungen.find(r => r.record_id === id);
  const getInspektion = (id: string) => jahresinspektionPlanen.find(i => i.record_id === id);
  const getPdf = (id: string) => rechnungsPdfErstellen.find(p => p.record_id === id);

  // Hero: überfällige Rechnungen
  const heroContent = ueberfaelligeRechnungen.length > 0 ? (
    <HeroBanner
      icon={<IconAlertCircle size={18} />}
      action={{
        label: tt('hero_action'),
        onClick: () => {
          if (ueberfaelligeRechnungen[0]) {
            void markRechnungBezahlt(ueberfaelligeRechnungen[0]);
          }
        },
      }}
    >
      <b>{namen(ueberfaelligeRechnungen.map(r => r.kundeName ?? r.fields.rechnungsnummer ?? ''))}</b>{' '}
      — {ueberfaelligeRechnungen.length === 1
        ? tt('hero_text', { n: ueberfaelligeRechnungen.length })
        : tt('hero_text_multi', { n: ueberfaelligeRechnungen.length })}
    </HeroBanner>
  ) : undefined;

  // KPIs
  const kpis = (
    <StatStrip>
      <StatStripItem
        title={tt('kpi_offen')}
        value={offeneAuftraege.length}
        icon={<IconClock size={16} className="shrink-0" />}
        tone={offeneAuftraege.length > 0 ? 'warning' : 'default'}
        onClick={() => setStatusFilter(f => f === 'offen' ? null : 'offen')}
        active={statusFilter === 'offen'}
      />
      <StatStripItem
        title={tt('kpi_inbearbeitung')}
        value={inBearbeitungAuftraege.length}
        icon={<IconClock size={16} className="shrink-0" />}
        tone={inBearbeitungAuftraege.length > 0 ? 'primary' : 'default'}
        onClick={() => setStatusFilter(f => f === 'in_bearbeitung' ? null : 'in_bearbeitung')}
        active={statusFilter === 'in_bearbeitung'}
      />
      <StatStripItem
        title={tt('kpi_abgeschlossen')}
        value={abgeschlosseneAuftraege.length}
        tone="default"
        onClick={() => setStatusFilter(f => f === 'abgeschlossen' ? null : 'abgeschlossen')}
        active={statusFilter === 'abgeschlossen'}
      />
      <StatStripItem
        title={tt('kpi_rechnungen_offen')}
        value={offeneRechnungen.length}
        tone={offeneRechnungen.length > 0 ? 'warning' : 'default'}
      />
      <StatStripItem
        title={tt('kpi_ueberfaellig')}
        value={ueberfaelligeRechnungen.length}
        tone={ueberfaelligeRechnungen.length > 0 ? 'destructive' : 'default'}
      />
    </StatStrip>
  );

  // Primary: Kanban board for Auftraege
  const primary = (
    <KanbanWidget
      cards={kanbanCards}
      columns={COLUMNS}
      defaultCollapsed={['abgeschlossen']}
      onCardClick={card => overlay.replace({ type: 'auftrag', id: card.id.split(':')[1] ?? '' })}
      onCardMove={moveCard}
      onAddCard={column => {
        setAuftragDefaults({ status: column });
        setEditingAuftrag(undefined);
        setAuftragDialogOpen(true);
      }}
    />
  );

  // Aside: today's urgent orders + outstanding invoices
  const aside = (
    <>
      <WorkList
        title={tt('worklist_heute')}
        items={dringendeAuftraege.map(a => {
          const cur = lookupKey(a.fields.status);
          const isHoch = lookupKey(a.fields.prioritaet) === 'hoch';
          const overdueDate = a.fields.wunschtermin && a.fields.wunschtermin.slice(0, 10) < today;
          return {
            id: a.record_id,
            title: a.kundeName ?? a.fields.auftragsnummer ?? '—',
            secondLine: (
              <>
                {overdueDate
                  ? <span className="font-medium text-destructive">{tc('ueberfaellig')}</span>
                  : isHoch
                  ? <span className="font-medium text-warning">Hohe Priorität</span>
                  : <span className="text-muted-foreground">{tc('heute')}</span>
                }
                {a.fields.wunschtermin && (
                  <span className="text-muted-foreground"> · {formatDate(a.fields.wunschtermin)}</span>
                )}
              </>
            ),
            action: cur !== 'abgeschlossen'
              ? {
                  label: cur === 'offen' ? tt('action_bearbeiten') : tt('action_abschliessen'),
                  onClick: () => void advanceAuftragStatus(a),
                }
              : undefined,
          };
        })}
        onItemClick={id => overlay.replace({ type: 'auftrag', id })}
        empty={{
          text: tt('worklist_empty_auftraege'),
          action: { label: tt('neuer_auftrag'), onClick: () => { setAuftragDefaults(undefined); setEditingAuftrag(undefined); setAuftragDialogOpen(true); } },
        }}
      />
      <WorkList
        title={tt('worklist_rechnungen')}
        items={[...ueberfaelligeRechnungen, ...offeneRechnungen].slice(0, 6).map(r => {
          const status = lookupKey(r.fields.status_rechnung);
          const tone = toneForRechnungStatus(status);
          return {
            id: r.record_id,
            title: r.kundeName ?? r.fields.rechnungsnummer ?? '—',
            secondLine: (
              <>
                <span className={tone === 'destructive' ? 'font-medium text-destructive' : tone === 'warning' ? 'font-medium text-amber-600' : 'text-muted-foreground'}>
                  {r.fields.status_rechnung?.label ?? status}
                </span>
                {r.fields.bruttobetrag != null && (
                  <span className="text-muted-foreground"> · {formatCurrency(r.fields.bruttobetrag)}</span>
                )}
              </>
            ),
            action: status !== 'bezahlt'
              ? { label: tt('als_bezahlt'), onClick: () => void markRechnungBezahlt(r) }
              : undefined,
          };
        })}
        onItemClick={id => overlay.replace({ type: 'rechnung', id })}
        empty={{ text: tt('worklist_empty_rechnungen') }}
      />
    </>
  );

  return (
    <>
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{contextLine}</p>
        </div>
        <Button
          onClick={() => { setAuftragDefaults(undefined); setEditingAuftrag(undefined); setAuftragDialogOpen(true); }}
          className="shrink-0 self-start sm:self-auto"
        >
          <IconPlus size={16} className="mr-1.5 shrink-0" />
          {tt('neuer_auftrag')}
        </Button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroContent}
        kpis={kpis}
        primary={primary}
        aside={aside}
      />

      {/* Overlay stack — ONE shell */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftrag') {
            const a = getAuftrag(top.id);
            if (!a) return null;
            return (
              <>
                <RecordHeader
                  title={a.fields.auftragsnummer ?? a.kundeName ?? '—'}
                  subtitle={[a.fahrzeugName, a.fields.status?.label].filter(Boolean).join(' · ')}
                />
                <AuftraegeDetails
                  record={a}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', id: f.record_id })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnung', id: r.record_id })}
                  onAddRechnungen={() => {
                    setRechnungDefaults({ auftrag: a.record_id, kunde: extractRecordId(a.fields.kunde) ?? undefined });
                    setEditingRechnung(undefined);
                    setRechnungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = getKunde(top.id);
            if (!k) return null;
            return (
              <>
                <RecordHeader
                  title={[k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ')}
                  subtitle={[k.fields.email, k.fields.telefon].filter(Boolean).join(' · ')}
                />
                <KundenDetails
                  record={k}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', id: f.record_id })}
                  onAddFahrzeuge={() => {
                    setFahrzeugDefaults({ kunde: k.record_id });
                    setEditingFahrzeug(undefined);
                    setFahrzeugDialogOpen(true);
                  }}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  onAddAuftraege={() => {
                    setAuftragDefaults({ kunde: k.record_id });
                    setEditingAuftrag(undefined);
                    setAuftragDialogOpen(true);
                  }}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnung', id: r.record_id })}
                  onAddRechnungen={() => {
                    setRechnungDefaults({ kunde: k.record_id });
                    setEditingRechnung(undefined);
                    setRechnungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'fahrzeug') {
            const f = getFahrzeug(top.id);
            if (!f) return null;
            const ef = enrichedFahrzeuge.find(x => x.record_id === f.record_id);
            return (
              <>
                <RecordHeader
                  title={f.fields.kennzeichen ?? '—'}
                  subtitle={[f.fields.marke, f.fields.modell, f.fields.baujahr?.toString()].filter(Boolean).join(' ')}
                />
                <FahrzeugeDetails
                  record={f}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  onAddAuftraege={() => {
                    setAuftragDefaults({ fahrzeug: f.record_id });
                    setEditingAuftrag(undefined);
                    setAuftragDialogOpen(true);
                  }}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => overlay.push({ type: 'inspektion', id: i.record_id })}
                  onAddJahresinspektionPlanen={() => {
                    setInspektionDefaults({ fahrzeug: f.record_id });
                    setEditingInspektion(undefined);
                    setInspektionDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'rechnung') {
            const r = getRechnung(top.id);
            if (!r) return null;
            return (
              <>
                <RecordHeader
                  title={r.fields.rechnungsnummer ?? '—'}
                  subtitle={[r.kundeName, r.fields.status_rechnung?.label].filter(Boolean).join(' · ')}
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={p => overlay.push({ type: 'pdf', id: p.record_id })}
                  onAddRechnungsPdfErstellen={() => {
                    setPdfDefaults({ rechnung: r.record_id });
                    setEditingPdf(undefined);
                    setPdfDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'inspektion') {
            const i = getInspektion(top.id);
            if (!i) return null;
            return (
              <>
                <RecordHeader
                  title={jahresinspektionPlanen.find(x => x.record_id === i.record_id)
                    ? (fahrzeuge.find(f => f.record_id === extractRecordId(i.fields.fahrzeug))?.fields.kennzeichen ?? '—')
                    : '—'}
                  subtitle={i.fields.wunschtermin_inspektion ? formatDate(i.fields.wunschtermin_inspektion) : undefined}
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
            const p = getPdf(top.id);
            if (!p) return null;
            return (
              <>
                <RecordHeader
                  title={p.fields.pdf_rechnungsnummer ?? '—'}
                  subtitle={[p.fields.pdf_kunde_vorname, p.fields.pdf_kunde_nachname].filter(Boolean).join(' ')}
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
          if (top.type === 'auftrag') {
            const a = getAuftrag(top.id);
            if (!a) return undefined;
            const cur = lookupKey(a.fields.status);
            if (cur === 'abgeschlossen') return undefined;
            return {
              label: cur === 'offen' ? tt('action_bearbeiten') : tt('action_abschliessen'),
              onClick: () => void advanceAuftragStatus(a),
            };
          }
          if (top.type === 'rechnung') {
            const r = getRechnung(top.id);
            if (!r) return undefined;
            const cur = lookupKey(r.fields.status_rechnung);
            if (cur === 'bezahlt') return undefined;
            return {
              label: tt('als_bezahlt'),
              onClick: () => void markRechnungBezahlt(r),
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'auftrag') {
            const a = auftraege.find(x => x.record_id === top.id);
            if (a) { setEditingAuftrag(a); setAuftragDefaults(undefined); setAuftragDialogOpen(true); }
          } else if (top.type === 'kunde') {
            const k = kunden.find(x => x.record_id === top.id);
            if (k) { setEditingKunde(k); setKundenDialogOpen(true); }
          } else if (top.type === 'fahrzeug') {
            const f = fahrzeuge.find(x => x.record_id === top.id);
            if (f) { setEditingFahrzeug(f); setFahrzeugDefaults(undefined); setFahrzeugDialogOpen(true); }
          } else if (top.type === 'rechnung') {
            const r = rechnungen.find(x => x.record_id === top.id);
            if (r) { setEditingRechnung(r); setRechnungDefaults(undefined); setRechnungDialogOpen(true); }
          } else if (top.type === 'inspektion') {
            const i = jahresinspektionPlanen.find(x => x.record_id === top.id);
            if (i) { setEditingInspektion(i); setInspektionDefaults(undefined); setInspektionDialogOpen(true); }
          } else if (top.type === 'pdf') {
            const p = rechnungsPdfErstellen.find(x => x.record_id === top.id);
            if (p) { setEditingPdf(p); setPdfDefaults(undefined); setPdfDialogOpen(true); }
          }
        }}
      />

      {/* Dialogs */}
      <AuftraegeDialog
        open={auftragDialogOpen}
        onClose={() => { setAuftragDialogOpen(false); setEditingAuftrag(undefined); setAuftragDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingAuftrag) {
            await LivingAppsService.updateAuftraegeEntry(editingAuftrag.record_id, fields);
            undoToast(`${fields.auftragsnummer ?? '—'} — ${tc('aktualisiert')}`);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
            undoToast(`${fields.auftragsnummer ?? '—'} — ${tc('erstellt')}`);
          }
          fetchAll();
        }}
        defaultValues={editingAuftrag ? editingAuftrag.fields : auftragDefaults}
        recordId={editingAuftrag?.record_id}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />

      <RechnungenDialog
        open={rechnungDialogOpen}
        onClose={() => { setRechnungDialogOpen(false); setEditingRechnung(undefined); setRechnungDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingRechnung) {
            await LivingAppsService.updateRechnungenEntry(editingRechnung.record_id, fields);
            undoToast(`${fields.rechnungsnummer ?? '—'} — ${tc('aktualisiert')}`);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
            undoToast(`${fields.rechnungsnummer ?? '—'} — ${tc('erstellt')}`);
          }
          fetchAll();
        }}
        defaultValues={editingRechnung ? editingRechnung.fields : rechnungDefaults}
        recordId={editingRechnung?.record_id}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />

      <FahrzeugeDialog
        open={fahrzeugDialogOpen}
        onClose={() => { setFahrzeugDialogOpen(false); setEditingFahrzeug(undefined); setFahrzeugDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingFahrzeug) {
            await LivingAppsService.updateFahrzeugeEntry(editingFahrzeug.record_id, fields);
            undoToast(`${fields.kennzeichen ?? '—'} — ${tc('aktualisiert')}`);
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
            undoToast(`${fields.kennzeichen ?? '—'} — ${tc('erstellt')}`);
          }
          fetchAll();
        }}
        defaultValues={editingFahrzeug ? editingFahrzeug.fields : fahrzeugDefaults}
        recordId={editingFahrzeug?.record_id}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />

      <KundenDialog
        open={kundenDialogOpen}
        onClose={() => { setKundenDialogOpen(false); setEditingKunde(undefined); }}
        onSubmit={async fields => {
          if (editingKunde) {
            await LivingAppsService.updateKundenEntry(editingKunde.record_id, fields);
            undoToast(`${fields.vorname ?? '—'} — ${tc('aktualisiert')}`);
          } else {
            await LivingAppsService.createKundenEntry(fields);
            undoToast(`${fields.vorname ?? '—'} — ${tc('erstellt')}`);
          }
          fetchAll();
        }}
        defaultValues={editingKunde?.fields}
        recordId={editingKunde?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />

      <JahresinspektionPlanenDialog
        open={inspektionDialogOpen}
        onClose={() => { setInspektionDialogOpen(false); setEditingInspektion(undefined); setInspektionDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingInspektion) {
            await LivingAppsService.updateJahresinspektionPlanenEntry(editingInspektion.record_id, fields);
            undoToast(`${tc('aktualisiert')}`);
          } else {
            await LivingAppsService.createJahresinspektionPlanenEntry(fields);
            undoToast(`${tc('erstellt')}`);
          }
          fetchAll();
        }}
        defaultValues={editingInspektion ? editingInspektion.fields : inspektionDefaults}
        recordId={editingInspektion?.record_id}
        fahrzeugeList={fahrzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />

      <RechnungsPdfErstellenDialog
        open={pdfDialogOpen}
        onClose={() => { setPdfDialogOpen(false); setEditingPdf(undefined); setPdfDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingPdf) {
            await LivingAppsService.updateRechnungsPdfErstellenEntry(editingPdf.record_id, fields);
            undoToast(`${tc('aktualisiert')}`);
          } else {
            await LivingAppsService.createRechnungsPdfErstellenEntry(fields);
            undoToast(`${tc('erstellt')}`);
          }
          fetchAll();
        }}
        defaultValues={editingPdf ? editingPdf.fields : pdfDefaults}
        recordId={editingPdf?.record_id}
        rechnungenList={rechnungen}
        enablePhotoScan={AI_PHOTO_SCAN['RechnungsPdfErstellen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['RechnungsPdfErstellen']}
      />
    </>
  );
}
