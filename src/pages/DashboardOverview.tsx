import { useState, useMemo, useCallback } from 'react';
import { format, parseISO, isBefore, isAfter, startOfDay } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedFahrzeuge, EnrichedAuftraege, EnrichedRechnungen, EnrichedJahresinspektionPlanen, EnrichedRechnungsPdfErstellen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard, KanbanColumn } from '@/components/widgets/KanbanWidget';
import { useRecordOverlayStack } from '@/components/widgets/RecordView';
import { RecordOverlayHost, RecordHeader } from '@/components/widgets/RecordView';
import { KundenDetails } from '@/components/details/KundenDetails';
import { FahrzeugeDetails } from '@/components/details/FahrzeugeDetails';
import { AuftraegeDetails } from '@/components/details/AuftraegeDetails';
import { RechnungenDetails } from '@/components/details/RechnungenDetails';
import { JahresinspektionPlanenDetails } from '@/components/details/JahresinspektionPlanenDetails';
import { RechnungsPdfErstellenDetails } from '@/components/details/RechnungsPdfErstellenDetails';
import { KundenDialog } from '@/components/dialogs/KundenDialog';
import { FahrzeugeDialog } from '@/components/dialogs/FahrzeugeDialog';
import { AuftraegeDialog } from '@/components/dialogs/AuftraegeDialog';
import { RechnungenDialog } from '@/components/dialogs/RechnungenDialog';
import { JahresinspektionPlanenDialog } from '@/components/dialogs/JahresinspektionPlanenDialog';
import type { AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import type { FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import type { RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import type { JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import { IconAlertCircle, IconCar, IconClipboardList, IconReceipt, IconPlus, IconCalendar, IconUsers, IconTool } from '@tabler/icons-react';

// Re-export the OverlayItem union required by the scaffold
export type OverlayItem =
  | { type: 'kunden'; record: Kunden }
  | { type: 'fahrzeuge'; record: EnrichedFahrzeuge }
  | { type: 'auftraege'; record: EnrichedAuftraege }
  | { type: 'rechnungen'; record: EnrichedRechnungen }
  | { type: 'jahresinspektion_planen'; record: EnrichedJahresinspektionPlanen }
  | { type: 'rechnungs_pdf_erstellen'; record: EnrichedRechnungsPdfErstellen };

export default function DashboardOverview() {
  const {
    kunden, fahrzeuge, auftraege, rechnungen, jahresinspektionPlanen, rechnungsPdfErstellen,
    kundenMap, fahrzeugeMap, auftraegeMap, rechnungenMap,
    setAuftraege, setRechnungen,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();

  const enrichedFahrzeuge = enrichFahrzeuge(fahrzeuge, { kundenMap });
  const enrichedAuftraege = enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap });
  const enrichedRechnungen = enrichRechnungen(rechnungen, { auftraegeMap, kundenMap });
  const enrichedJahresinspektionPlanen = enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap });
  const enrichedRechnungsPdfErstellen = enrichRechnungsPdfErstellen(rechnungsPdfErstellen, { rechnungenMap });

  // Overlay stack
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [kundenDialogOpen, setKundenDialogOpen] = useState(false);
  const [fahrzeugeDialogOpen, setFahrzeugeDialogOpen] = useState(false);
  const [auftraegeDialogOpen, setAuftraegeDialogOpen] = useState(false);
  const [rechnungenDialogOpen, setRechnungenDialogOpen] = useState(false);
  const [inspektionDialogOpen, setInspektionDialogOpen] = useState(false);

  const [editAuftrag, setEditAuftrag] = useState<EnrichedAuftraege | null>(null);
  const [editRechnung, setEditRechnung] = useState<EnrichedRechnungen | null>(null);
  const [editFahrzeug, setEditFahrzeug] = useState<EnrichedFahrzeuge | null>(null);
  const [editKunde, setEditKunde] = useState<Kunden | null>(null);

  // Dialog defaults for pre-filling
  const [auftraegeDefaults, setAuftraegeDefaults] = useState<AuftraegeDialogDefaults | undefined>();
  const [fahrzeugeDefaults, setFahrzeugeDefaults] = useState<FahrzeugeDialogDefaults | undefined>();
  const [rechnungenDefaults, setRechnungenDefaults] = useState<RechnungenDialogDefaults | undefined>();
  const [inspektionDefaults, setInspektionDefaults] = useState<JahresinspektionPlanenDialogDefaults | undefined>();

  // KPI filter state
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Today
  const today = format(clock, 'yyyy-MM-dd');

  // Derived data
  const ueberfaelligeRechnungen = useMemo(
    () => enrichedRechnungen.filter(r =>
      lookupKey(r.fields.status_rechnung) === 'ueberfaellig' ||
      (lookupKey(r.fields.status_rechnung) === 'offen' &&
        r.fields.faelligkeitsdatum &&
        r.fields.faelligkeitsdatum < today)
    ),
    [enrichedRechnungen, today]
  );

  const offeneAuftraege = useMemo(
    () => enrichedAuftraege.filter(r => lookupKey(r.fields.status) === 'offen'),
    [enrichedAuftraege]
  );

  const inBearbeitungAuftraege = useMemo(
    () => enrichedAuftraege.filter(r => lookupKey(r.fields.status) === 'in_bearbeitung'),
    [enrichedAuftraege]
  );

  const anstehendeInspektionen = useMemo(
    () => enrichedJahresinspektionPlanen.filter(r =>
      r.fields.wunschtermin_inspektion &&
      r.fields.wunschtermin_inspektion >= today
    ).sort((a, b) => (a.fields.wunschtermin_inspektion ?? '') < (b.fields.wunschtermin_inspektion ?? '') ? -1 : 1),
    [enrichedJahresinspektionPlanen, today]
  );

  const offeneRechnungen = useMemo(
    () => enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'offen'),
    [enrichedRechnungen]
  );

  const gesamtUmsatz = useMemo(
    () => enrichedRechnungen
      .filter(r => lookupKey(r.fields.status_rechnung) === 'bezahlt')
      .reduce((sum, r) => sum + (r.fields.bruttobetrag ?? 0), 0),
    [enrichedRechnungen]
  );

  // Advance Auftrag status helper (shared for board + overlay + worklist)
  const advanceAuftragStatus = useCallback(async (auftrag: EnrichedAuftraege) => {
    const currentKey = lookupKey(auftrag.fields.status);
    const nextKey = currentKey === 'offen' ? 'in_bearbeitung' : currentKey === 'in_bearbeitung' ? 'abgeschlossen' : null;
    if (!nextKey) return;
    const nextOpt = (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).find(o => o.key === nextKey);
    const nextLabel = nextOpt?.label ?? nextKey;
    const snapshot = [...auftraege];
    // Optimistic update
    setAuftraege(prev => prev.map(a =>
      a.record_id === auftrag.record_id
        ? { ...a, fields: { ...a.fields, status: { key: nextKey, label: nextLabel } } }
        : a
    ));
    try {
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: nextKey });
      undoToast(tx`${auftrag.fields.auftragsnummer ?? ''} — Status: ${nextLabel}`, async () => {
        setAuftraege(snapshot);
        await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: currentKey ?? 'offen' });
      });
    } catch {
      setAuftraege(snapshot);
      await fetchAll();
    }
  }, [auftraege, setAuftraege, fetchAll]);

  // Mark Rechnung as bezahlt
  const markRechnungBezahlt = useCallback(async (rechnung: EnrichedRechnungen) => {
    const snapshot = [...rechnungen];
    const bezahltOpt = (LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? []).find(o => o.key === 'bezahlt');
    setRechnungen(prev => prev.map(r =>
      r.record_id === rechnung.record_id
        ? { ...r, fields: { ...r.fields, status_rechnung: { key: 'bezahlt', label: bezahltOpt?.label ?? tx('Bezahlt') } } }
        : r
    ));
    try {
      await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: 'bezahlt' });
      undoToast(tx`${rechnung.fields.rechnungsnummer ?? ''} — als bezahlt markiert`, async () => {
        setRechnungen(snapshot);
        const prevKey = lookupKey(rechnung.fields.status_rechnung) ?? 'offen';
        await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: prevKey });
      });
    } catch {
      setRechnungen(snapshot);
      await fetchAll();
    }
  }, [rechnungen, setRechnungen, fetchAll]);

  // Kanban board callbacks
  const handleCardMove = useCallback(async (cardId: string, newColumn: string): Promise<void | string> => {
    const id = cardId.split(':')[1];
    const auftrag = enrichedAuftraege.find(a => a.record_id === id);
    if (!auftrag) return;
    const nextOpt = (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).find(o => o.key === newColumn);
    const nextLabel = nextOpt?.label ?? newColumn;
    const snapshot = [...auftraege];
    setAuftraege(prev => prev.map(a =>
      a.record_id === id
        ? { ...a, fields: { ...a.fields, status: { key: newColumn, label: nextLabel } } }
        : a
    ));
    try {
      await LivingAppsService.updateAuftraegeEntry(id, { status: newColumn });
      undoToast(tx`${auftrag.fields.auftragsnummer ?? ''} — ${nextLabel}`, async () => {
        setAuftraege(snapshot);
        const prevKey = lookupKey(auftrag.fields.status) ?? 'offen';
        await LivingAppsService.updateAuftraegeEntry(id, { status: prevKey });
      });
    } catch {
      setAuftraege(snapshot);
      await fetchAll();
    }
  }, [enrichedAuftraege, auftraege, setAuftraege, fetchAll]);

  // ─── ALL hooks ABOVE — early returns below ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Kanban columns & cards
  const kanbanColumns: KanbanColumn[] = (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({
    key: o.key,
    label: o.label,
    tone: o.key === 'abgeschlossen' ? 'success' : o.key === 'offen' ? 'default' : 'primary',
  }));

  const filteredAuftraege = statusFilter
    ? enrichedAuftraege.filter(a => lookupKey(a.fields.status) === statusFilter)
    : enrichedAuftraege;

  const kanbanCards: KanbanCard[] = filteredAuftraege.map(a => ({
    id: `auftrag:${a.record_id}`,
    column: lookupKey(a.fields.status) ?? '',
    title: a.fields.auftragsnummer ?? tx('Auftrag'),
    subtitle: (
      <span className="flex flex-col gap-0.5">
        <span className="truncate text-muted-foreground">{a.kundeName || '—'}</span>
        {a.fields.wunschtermin && (
          <span className="text-xs text-muted-foreground">{formatDate(a.fields.wunschtermin)}</span>
        )}
      </span>
    ),
    tone: lookupKey(a.fields.prioritaet) === 'hoch' ? 'warning' : 'default',
  }));

  // Context line
  const auftragsNamen = namen(inBearbeitungAuftraege.map(a => a.kundeName).filter(Boolean));
  const contextLine = enrichedAuftraege.length === 0
    ? tx('Noch keine Aufträge — leg den ersten an.')
    : inBearbeitungAuftraege.length > 0
      ? tx`${auftragsNamen} ${inBearbeitungAuftraege.length === 1 ? tx('ist in Bearbeitung') : tx('sind in Bearbeitung')} — ${offeneAuftraege.length} ${tx('offen')}.`
      : offeneAuftraege.length > 0
        ? tx`${offeneAuftraege.length} ${tx('offene Aufträge warten auf Bearbeitung')}.`
        : tx('Alle Aufträge abgeschlossen — gute Arbeit!');

  // Hero: überfällige Rechnungen
  const heroRechnung = ueberfaelligeRechnungen[0];

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-0.5">{contextLine}</p>
        </div>
        <button
          onClick={() => { setAuftraegeDefaults(undefined); setEditAuftrag(null); setAuftraegeDialogOpen(true); }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0 self-start mt-2 sm:mt-0"
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neuer Auftrag')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroRechnung ? (
          <HeroBanner
            icon={<IconAlertCircle size={18} />}
            action={{
              label: tx('Als bezahlt markieren'),
              onClick: () => markRechnungBezahlt(heroRechnung),
            }}
          >
            <b>{ueberfaelligeRechnungen.length === 1
              ? tx`Rechnung ${heroRechnung.fields.rechnungsnummer ?? ''}`
              : tx`${ueberfaelligeRechnungen.length} Rechnungen`
            }</b>{' '}
            {tx('überfällig')} — {heroRechnung.kundeName && <b>{heroRechnung.kundeName}</b>}
            {heroRechnung.fields.bruttobetrag != null && (
              <> · <b>{formatCurrency(heroRechnung.fields.bruttobetrag)}</b></>
            )}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Aufträge offen')}
              value={offeneAuftraege.length}
              icon={<IconClipboardList size={16} className="shrink-0" />}
              tone={offeneAuftraege.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'offen' ? null : 'offen')}
              active={statusFilter === 'offen'}
            />
            <StatStripItem
              title={tx('In Bearbeitung')}
              value={inBearbeitungAuftraege.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={inBearbeitungAuftraege.length > 0 ? 'primary' : 'default'}
              onClick={() => setStatusFilter(f => f === 'in_bearbeitung' ? null : 'in_bearbeitung')}
              active={statusFilter === 'in_bearbeitung'}
            />
            <StatStripItem
              title={tx('Rechnungen offen')}
              value={offeneRechnungen.length}
              icon={<IconReceipt size={16} className="shrink-0" />}
              tone={ueberfaelligeRechnungen.length > 0 ? 'destructive' : offeneRechnungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Umsatz (bezahlt)')}
              value={formatCurrency(gesamtUmsatz)}
              icon={<IconReceipt size={16} className="shrink-0" />}
              tone="success"
            />
            <StatStripItem
              title={appLabel('fahrzeuge')}
              value={fahrzeuge.length}
              icon={<IconCar size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={appLabel('kunden')}
              value={kunden.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              onClick={() => { setEditKunde(null); setKundenDialogOpen(true); }}
            />
          </StatStrip>
        }
        primary={
          auftraege.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 py-24 gap-4 text-center px-4">
              <IconClipboardList size={48} className="text-muted-foreground" />
              <div>
                <p className="font-semibold text-foreground">{tx('Noch keine Aufträge')}</p>
                <p className="text-sm text-muted-foreground mt-1">{tx('Lege den ersten Auftrag an und behalte die Werkstatt im Überblick.')}</p>
              </div>
              <button
                onClick={() => { setAuftraegeDefaults(undefined); setEditAuftrag(null); setAuftraegeDialogOpen(true); }}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <IconPlus size={16} className="shrink-0" />
                {tx('Ersten Auftrag anlegen')}
              </button>
            </div>
          ) : (
            <KanbanWidget
              columns={kanbanColumns}
              cards={kanbanCards}
              defaultCollapsed={[]}
              onCardClick={card => {
                const id = card.id.split(':')[1];
                const a = enrichedAuftraege.find(x => x.record_id === id);
                if (a) overlay.replace({ type: 'auftraege', record: a });
              }}
              onCardMove={handleCardMove}
              onAddCard={colKey => {
                setAuftraegeDefaults({ status: colKey });
                setEditAuftrag(null);
                setAuftraegeDialogOpen(true);
              }}
            />
          )
        }
        aside={
          <>
            <WorkList
              title={tx('Überfällige Rechnungen')}
              items={ueberfaelligeRechnungen.map(r => ({
                id: r.record_id,
                title: r.fields.rechnungsnummer ?? tx('Rechnung'),
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{tx('Überfällig')}</span>
                    {r.fields.bruttobetrag != null && (
                      <span className="text-muted-foreground"> · {formatCurrency(r.fields.bruttobetrag)}</span>
                    )}
                    {r.kundeName && (
                      <span className="text-muted-foreground"> · {r.kundeName}</span>
                    )}
                  </>
                ),
                action: {
                  label: tx('Bezahlt'),
                  onClick: () => markRechnungBezahlt(r),
                },
              }))}
              onItemClick={id => {
                const r = enrichedRechnungen.find(x => x.record_id === id);
                if (r) overlay.replace({ type: 'rechnungen', record: r });
              }}
              empty={{
                text: tx('Keine überfälligen Rechnungen — alles im grünen Bereich.'),
                action: { label: tx('Neue Rechnung'), onClick: () => { setRechnungenDefaults(undefined); setEditRechnung(null); setRechnungenDialogOpen(true); } },
              }}
            />
            <WorkList
              title={tx('Anstehende Inspektionen')}
              items={anstehendeInspektionen.slice(0, 5).map(i => ({
                id: i.record_id,
                title: i.fahrzeugName || tx('Fahrzeug'),
                secondLine: (
                  <>
                    <span className="text-muted-foreground">
                      {i.fields.wunschtermin_inspektion ? formatDate(i.fields.wunschtermin_inspektion) : '—'}
                    </span>
                  </>
                ),
                action: {
                  label: tx('Details'),
                  onClick: () => overlay.replace({ type: 'jahresinspektion_planen', record: i }),
                },
              }))}
              onItemClick={id => {
                const i = enrichedJahresinspektionPlanen.find(x => x.record_id === id);
                if (i) overlay.replace({ type: 'jahresinspektion_planen', record: i });
              }}
              empty={{
                text: tx('Keine Inspektionen geplant.'),
                action: { label: tx('Inspektion planen'), onClick: () => { setInspektionDefaults(undefined); setInspektionDialogOpen(true); } },
              }}
            />
          </>
        }
      />

      {/* Overlay host */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftraege') {
            const r = top.record;
            const auftragFahrzeug = fahrzeuge.find(f => f.record_id === extractRecordId(r.fields.fahrzeug));
            const statusKey = lookupKey(r.fields.status);
            const nextKey = statusKey === 'offen' ? 'in_bearbeitung' : statusKey === 'in_bearbeitung' ? 'abgeschlossen' : null;
            const nextOpt = nextKey ? (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).find(o => o.key === nextKey) : null;
            return (
              <>
                <RecordHeader
                  title={r.fields.auftragsnummer ?? appLabel('auftraege')}
                  subtitle={r.kundeName || undefined}
                  badges={r.fields.status ? (
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                      {r.fields.status.label}
                    </span>
                  ) : undefined}
                  actions={
                    <button
                      onClick={() => { setEditAuftrag(r); setAuftraegeDefaults(r.fields as AuftraegeDialogDefaults); setAuftraegeDialogOpen(true); }}
                      className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <AuftraegeDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeuge', record: enrichedFahrzeuge.find(x => x.record_id === f.record_id) ?? { ...f, kundeName: '' } })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={re => overlay.push({ type: 'rechnungen', record: enrichedRechnungen.find(x => x.record_id === re.record_id) ?? { ...re, auftragName: '', kundeName: '' } })}
                  onAddRechnungen={() => { setRechnungenDefaults({ auftrag: r.record_id, kunde: extractRecordId(r.fields.kunde) ?? undefined }); setEditRechnung(null); setRechnungenDialogOpen(true); }}
                />
              </>
            );
          }
          if (top.type === 'fahrzeuge') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={`${r.fields.kennzeichen ?? ''} — ${r.fields.marke ?? ''} ${r.fields.modell ?? ''}`.trim()}
                  subtitle={r.kundeName || undefined}
                  actions={
                    <button
                      onClick={() => { setEditFahrzeug(r); setFahrzeugeDefaults(r.fields as FahrzeugeDialogDefaults); setFahrzeugeDialogOpen(true); }}
                      className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <FahrzeugeDetails
                  record={r}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftraege', record: enrichedAuftraege.find(x => x.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onAddAuftraege={() => { setAuftraegeDefaults({ fahrzeug: r.record_id, kunde: extractRecordId(r.fields.kunde) ?? undefined }); setEditAuftrag(null); setAuftraegeDialogOpen(true); }}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => overlay.push({ type: 'jahresinspektion_planen', record: enrichedJahresinspektionPlanen.find(x => x.record_id === i.record_id) ?? { ...i, fahrzeugName: '' } })}
                  onAddJahresinspektionPlanen={() => { setInspektionDefaults({ fahrzeug: r.record_id }); setInspektionDialogOpen(true); }}
                />
              </>
            );
          }
          if (top.type === 'kunden') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={[r.fields.vorname, r.fields.nachname].filter(Boolean).join(' ') || appLabel('kunden')}
                  subtitle={r.fields.telefon ?? r.fields.email ?? undefined}
                  actions={
                    <button
                      onClick={() => { setEditKunde(r); setKundenDialogOpen(true); }}
                      className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <KundenDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeuge', record: enrichedFahrzeuge.find(x => x.record_id === f.record_id) ?? { ...f, kundeName: '' } })}
                  onAddFahrzeuge={() => { setFahrzeugeDefaults({ kunde: r.record_id }); setEditFahrzeug(null); setFahrzeugeDialogOpen(true); }}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftraege', record: enrichedAuftraege.find(x => x.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onAddAuftraege={() => { setAuftraegeDefaults({ kunde: r.record_id }); setEditAuftrag(null); setAuftraegeDialogOpen(true); }}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={re => overlay.push({ type: 'rechnungen', record: enrichedRechnungen.find(x => x.record_id === re.record_id) ?? { ...re, auftragName: '', kundeName: '' } })}
                  onAddRechnungen={() => { setRechnungenDefaults({ kunde: r.record_id }); setEditRechnung(null); setRechnungenDialogOpen(true); }}
                />
              </>
            );
          }
          if (top.type === 'rechnungen') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fields.rechnungsnummer ?? appLabel('rechnungen')}
                  subtitle={r.kundeName || undefined}
                  badges={r.fields.status_rechnung ? (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      lookupKey(r.fields.status_rechnung) === 'bezahlt' ? 'bg-success/10 text-success' :
                      lookupKey(r.fields.status_rechnung) === 'ueberfaellig' ? 'bg-destructive/10 text-destructive' :
                      'bg-warning/10 text-warning'
                    }`}>
                      {r.fields.status_rechnung.label}
                    </span>
                  ) : undefined}
                  actions={
                    <button
                      onClick={() => { setEditRechnung(r); setRechnungenDefaults(r.fields as RechnungenDialogDefaults); setRechnungenDialogOpen(true); }}
                      className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftraege', record: enrichedAuftraege.find(x => x.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={p => overlay.push({ type: 'rechnungs_pdf_erstellen', record: enrichedRechnungsPdfErstellen.find(x => x.record_id === p.record_id) ?? { ...p, rechnungName: '' } })}
                  onAddRechnungsPdfErstellen={() => overlay.push({ type: 'rechnungen', record: r })}
                />
              </>
            );
          }
          if (top.type === 'jahresinspektion_planen') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fahrzeugName || appLabel('jahresinspektion_planen')}
                  subtitle={r.fields.wunschtermin_inspektion ? formatDate(r.fields.wunschtermin_inspektion) : undefined}
                />
                <JahresinspektionPlanenDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeuge', record: enrichedFahrzeuge.find(x => x.record_id === f.record_id) ?? { ...f, kundeName: '' } })}
                />
              </>
            );
          }
          if (top.type === 'rechnungs_pdf_erstellen') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fields.pdf_rechnungsnummer ?? appLabel('rechnungs_pdf_erstellen')}
                  subtitle={[r.fields.pdf_kunde_vorname, r.fields.pdf_kunde_nachname].filter(Boolean).join(' ') || undefined}
                />
                <RechnungsPdfErstellenDetails
                  record={r}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={re => overlay.push({ type: 'rechnungen', record: enrichedRechnungen.find(x => x.record_id === re.record_id) ?? { ...re, auftragName: '', kundeName: '' } })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'auftraege') {
            const statusKey = lookupKey(top.record.fields.status);
            const nextKey = statusKey === 'offen' ? 'in_bearbeitung' : statusKey === 'in_bearbeitung' ? 'abgeschlossen' : null;
            const nextOpt = nextKey ? (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).find(o => o.key === nextKey) : null;
            if (!nextOpt) return undefined;
            return { label: tx`→ ${nextOpt.label}`, onClick: () => advanceAuftragStatus(top.record) };
          }
          if (top.type === 'rechnungen') {
            const statusKey = lookupKey(top.record.fields.status_rechnung);
            if (statusKey === 'bezahlt') return undefined;
            return { label: tx('Als bezahlt markieren'), onClick: () => markRechnungBezahlt(top.record) };
          }
          return undefined;
        }}
      />

      {/* Dialogs */}
      <KundenDialog
        open={kundenDialogOpen}
        onClose={() => { setKundenDialogOpen(false); setEditKunde(null); }}
        onSubmit={async fields => {
          if (editKunde) {
            await LivingAppsService.updateKundenEntry(editKunde.record_id, fields);
          } else {
            await LivingAppsService.createKundenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editKunde?.fields}
        recordId={editKunde?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />

      <FahrzeugeDialog
        open={fahrzeugeDialogOpen}
        onClose={() => { setFahrzeugeDialogOpen(false); setEditFahrzeug(null); setFahrzeugeDefaults(undefined); }}
        onSubmit={async fields => {
          if (editFahrzeug) {
            await LivingAppsService.updateFahrzeugeEntry(editFahrzeug.record_id, fields);
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editFahrzeug ? editFahrzeug.fields : fahrzeugeDefaults}
        recordId={editFahrzeug?.record_id}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />

      <AuftraegeDialog
        open={auftraegeDialogOpen}
        onClose={() => { setAuftraegeDialogOpen(false); setEditAuftrag(null); setAuftraegeDefaults(undefined); }}
        onSubmit={async fields => {
          if (editAuftrag) {
            await LivingAppsService.updateAuftraegeEntry(editAuftrag.record_id, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editAuftrag ? editAuftrag.fields : auftraegeDefaults}
        recordId={editAuftrag?.record_id}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />

      <RechnungenDialog
        open={rechnungenDialogOpen}
        onClose={() => { setRechnungenDialogOpen(false); setEditRechnung(null); setRechnungenDefaults(undefined); }}
        onSubmit={async fields => {
          if (editRechnung) {
            await LivingAppsService.updateRechnungenEntry(editRechnung.record_id, fields);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editRechnung ? editRechnung.fields : rechnungenDefaults}
        recordId={editRechnung?.record_id}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />

      <JahresinspektionPlanenDialog
        open={inspektionDialogOpen}
        onClose={() => { setInspektionDialogOpen(false); setInspektionDefaults(undefined); }}
        onSubmit={async fields => {
          await LivingAppsService.createJahresinspektionPlanenEntry(fields);
          fetchAll();
        }}
        defaultValues={inspektionDefaults}
        fahrzeugeList={fahrzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />
    </>
  );
}
