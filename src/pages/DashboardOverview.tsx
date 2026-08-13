import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedFahrzeuge, EnrichedAuftraege, EnrichedRechnungen, EnrichedJahresinspektionPlanen, EnrichedRechnungsPdfErstellen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard } from '@/components/widgets/KanbanWidget';
import { useRecordOverlayStack, RecordOverlayHost, RecordHeader } from '@/components/widgets/RecordView';
import { KundenDetails } from '@/components/details/KundenDetails';
import { FahrzeugeDetails } from '@/components/details/FahrzeugeDetails';
import { AuftraegeDetails } from '@/components/details/AuftraegeDetails';
import { RechnungenDetails } from '@/components/details/RechnungenDetails';
import { JahresinspektionPlanenDetails } from '@/components/details/JahresinspektionPlanenDetails';
import { RechnungsPdfErstellenDetails } from '@/components/details/RechnungsPdfErstellenDetails';
import { KundenDialog } from '@/components/dialogs/KundenDialog';
import type { KundenDialogDefaults } from '@/components/dialogs/KundenDialog';
import { FahrzeugeDialog } from '@/components/dialogs/FahrzeugeDialog';
import type { FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import { AuftraegeDialog } from '@/components/dialogs/AuftraegeDialog';
import type { AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import { RechnungenDialog } from '@/components/dialogs/RechnungenDialog';
import type { RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import { JahresinspektionPlanenDialog } from '@/components/dialogs/JahresinspektionPlanenDialog';
import type { JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { RechnungsPdfErstellenDialog } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import type { RechnungsPdfErstellenDialogDefaults } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import {
  IconAlertTriangle,
  IconPlus,
  IconCar,
  IconFileInvoice,
  IconTool,
  IconCalendarCheck,
  IconClipboardList,
} from '@tabler/icons-react';

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
    setAuftraege, setRechnungen,
    kundenMap, fahrzeugeMap, auftraegeMap, rechnungenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  // ── Dialog-State ──────────────────────────────────────────────────────────
  const [kundenDialog, setKundenDialog] = useState<{ open: boolean; defaults?: KundenDialogDefaults; recordId?: string }>({ open: false });
  const [fahrzeugeDialog, setFahrzeugeDialog] = useState<{ open: boolean; defaults?: FahrzeugeDialogDefaults; recordId?: string }>({ open: false });
  const [auftraegeDialog, setAuftraegeDialog] = useState<{ open: boolean; defaults?: AuftraegeDialogDefaults; recordId?: string }>({ open: false });
  const [rechnungenDialog, setRechnungenDialog] = useState<{ open: boolean; defaults?: RechnungenDialogDefaults; recordId?: string }>({ open: false });
  const [inspektionDialog, setInspektionDialog] = useState<{ open: boolean; defaults?: JahresinspektionPlanenDialogDefaults; recordId?: string }>({ open: false });
  const [pdfDialog, setPdfDialog] = useState<{ open: boolean; defaults?: RechnungsPdfErstellenDialogDefaults; recordId?: string }>({ open: false });

  const enrichedFahrzeuge = useMemo(() => enrichFahrzeuge(fahrzeuge, { kundenMap }), [fahrzeuge, kundenMap]);
  const enrichedAuftraege = useMemo(() => enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap }), [auftraege, fahrzeugeMap, kundenMap]);
  const enrichedRechnungen = useMemo(() => enrichRechnungen(rechnungen, { auftraegeMap, kundenMap }), [rechnungen, auftraegeMap, kundenMap]);
  const enrichedJahresinspektionPlanen = useMemo(() => enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap }), [jahresinspektionPlanen, fahrzeugeMap]);
  const enrichedRechnungsPdfErstellen = useMemo(() => enrichRechnungsPdfErstellen(rechnungsPdfErstellen, { rechnungenMap }), [rechnungsPdfErstellen, rechnungenMap]);

  const today = format(clock, 'yyyy-MM-dd');

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const offeneAuftraege = useMemo(() => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'offen'), [enrichedAuftraege]);
  const inBearbeitungAuftraege = useMemo(() => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung'), [enrichedAuftraege]);
  const ueberfaelligeRechnungen = useMemo(() =>
    enrichedRechnungen.filter(r => {
      const k = lookupKey(r.fields.status_rechnung);
      if (k === 'bezahlt') return false;
      return r.fields.faelligkeitsdatum ? r.fields.faelligkeitsdatum < today : false;
    }),
    [enrichedRechnungen, today]
  );
  const offeneRechnungen = useMemo(() => enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'offen'), [enrichedRechnungen]);
  const anstehendeInspektionen = useMemo(() =>
    enrichedJahresinspektionPlanen.filter(i => i.fields.wunschtermin_inspektion && i.fields.wunschtermin_inspektion >= today),
    [enrichedJahresinspektionPlanen, today]
  ).sort((a, b) => (a.fields.wunschtermin_inspektion ?? '').localeCompare(b.fields.wunschtermin_inspektion ?? ''));

  // ── Kanban Board Cards ─────────────────────────────────────────────────────
  const kanbanColumns = useMemo(() => (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({
    key: o.key,
    label: o.label,
    tone: o.key === 'abgeschlossen' ? ('success' as const) : o.key === 'in_bearbeitung' ? ('primary' as const) : ('default' as const),
  })), []);

  const kanbanCards: KanbanCard[] = useMemo(() => enrichedAuftraege.map(a => ({
    id: a.record_id,
    column: lookupKey(a.fields.status) ?? 'offen',
    title: `${a.fahrzeugName || tx('Fahrzeug')} — ${a.kundeName || tx('Kunde')}`,
    subtitle: a.fields.auftragsnummer
      ? `${a.fields.auftragsnummer}${a.fields.wunschtermin ? ' · ' + formatDate(a.fields.wunschtermin) : ''}`
      : a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : undefined,
    tone: lookupKey(a.fields.prioritaet) === 'hoch' ? ('warning' as const) : ('default' as const),
  })), [enrichedAuftraege]);

  // ── Write helpers ──────────────────────────────────────────────────────────
  const advanceAuftragStatus = useCallback(async (auftrag: EnrichedAuftraege) => {
    const currentKey = lookupKey(auftrag.fields.status);
    const nextKey = currentKey === 'offen' ? 'in_bearbeitung' : currentKey === 'in_bearbeitung' ? 'abgeschlossen' : null;
    if (!nextKey) return;
    const prev = auftraege.map(a => ({ ...a }));
    setAuftraege(auftraege.map(a =>
      a.record_id === auftrag.record_id
        ? { ...a, fields: { ...a.fields, status: lookupOption('auftraege', 'status', nextKey) } }
        : a
    ));
    undoToast(
      nextKey === 'in_bearbeitung' ? tx`${auftrag.fields.auftragsnummer ?? ''} — in Bearbeitung` : tx`${auftrag.fields.auftragsnummer ?? ''} — abgeschlossen`,
      async () => {
        setAuftraege(prev);
        await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: currentKey ?? undefined });
      }
    );
    try {
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: nextKey });
    } catch {
      setAuftraege(prev);
      fetchAll();
    }
  }, [auftraege, setAuftraege, fetchAll]);

  const markRechnungBezahlt = useCallback(async (rechnung: EnrichedRechnungen) => {
    const prev = rechnungen.map(r => ({ ...r }));
    setRechnungen(rechnungen.map(r =>
      r.record_id === rechnung.record_id
        ? { ...r, fields: { ...r.fields, status_rechnung: lookupOption('rechnungen', 'status_rechnung', 'bezahlt') } }
        : r
    ));
    undoToast(
      tx`${rechnung.fields.rechnungsnummer ?? ''} — als bezahlt markiert`,
      async () => {
        setRechnungen(prev);
        await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: lookupKey(rechnung.fields.status_rechnung) ?? undefined });
      }
    );
    try {
      await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: 'bezahlt' });
    } catch {
      setRechnungen(prev);
      fetchAll();
    }
  }, [rechnungen, setRechnungen, fetchAll]);

  const handleCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const auftrag = auftraege.find(a => a.record_id === cardId);
    if (!auftrag) return;
    const prev = auftraege.map(a => ({ ...a }));
    setAuftraege(auftraege.map(a =>
      a.record_id === cardId
        ? { ...a, fields: { ...a.fields, status: lookupOption('auftraege', 'status', newColumn) } }
        : a
    ));
    const colLabel = kanbanColumns.find(c => c.key === newColumn)?.label ?? newColumn;
    undoToast(
      tx`${auftrag.fields.auftragsnummer ?? ''} — ${colLabel}`,
      async () => {
        setAuftraege(prev);
        await LivingAppsService.updateAuftraegeEntry(cardId, { status: lookupKey(auftrag.fields.status) ?? undefined });
      }
    );
    try {
      await LivingAppsService.updateAuftraegeEntry(cardId, { status: newColumn });
    } catch {
      setAuftraege(prev);
      fetchAll();
    }
  }, [auftraege, setAuftraege, kanbanColumns, fetchAll]);

  // ── Context line ──────────────────────────────────────────────────────────
  const contextLine = useMemo(() => {
    const hochPrio = enrichedAuftraege.filter(a => lookupKey(a.fields.prioritaet) === 'hoch' && lookupKey(a.fields.status) !== 'abgeschlossen');
    if (hochPrio.length > 0) {
      const names = namen(hochPrio.map(a => a.kundeName || a.fahrzeugName || '').filter(Boolean));
      return tx`${names} mit hoher Priorität — heute im Blick behalten.`;
    }
    if (inBearbeitungAuftraege.length > 0) {
      const names = namen(inBearbeitungAuftraege.map(a => a.fahrzeugName || a.kundeName || '').filter(Boolean));
      return tx`${names} aktuell in der Werkstatt.`;
    }
    if (offeneAuftraege.length > 0) {
      return tx`${String(offeneAuftraege.length)} offene Aufträge warten auf die Zuteilung.`;
    }
    return tx`Alles im grünen Bereich — keine dringenden Aufgaben.`;
  }, [enrichedAuftraege, inBearbeitungAuftraege, offeneAuftraege]);

  // ─── Every hook goes ABOVE this line ──────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ── Empty state ───────────────────────────────────────────────────────────
  if (auftraege.length === 0 && kunden.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <IconTool size={48} className="text-muted-foreground" stroke={1.5} />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">{tx('Werkstatt einrichten')}</h2>
          <p className="text-muted-foreground max-w-sm">{tx('Lege deinen ersten Kunden an — dann kannst du Fahrzeuge, Aufträge und Rechnungen verwalten.')}</p>
        </div>
        <button
          onClick={() => setKundenDialog({ open: true })}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} />
          {tx('Ersten Kunden anlegen')}
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{contextLine}</p>
        </div>
        <button
          onClick={() => setAuftraegeDialog({ open: true })}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
        >
          <IconPlus size={16} />
          {tx('Neuer Auftrag')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaelligeRechnungen.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Als bezahlt markieren'),
              onClick: () => markRechnungBezahlt(ueberfaelligeRechnungen[0]),
            }}
          >
            <b>{namen(ueberfaelligeRechnungen.map(r => r.kundeName || r.fields.rechnungsnummer || ''))}</b>
            {' '}{ueberfaelligeRechnungen.length === 1
              ? tx`— Rechnung überfällig seit ${formatDate(ueberfaelligeRechnungen[0].fields.faelligkeitsdatum)}.`
              : tx`— ${String(ueberfaelligeRechnungen.length)} Rechnungen überfällig.`
            }
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Offen')}
              value={offeneAuftraege.length}
              icon={<IconClipboardList size={16} className="text-muted-foreground" />}
              tone={offeneAuftraege.length > 5 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('In Bearbeitung')}
              value={inBearbeitungAuftraege.length}
              icon={<IconTool size={16} className="text-muted-foreground" />}
              tone={inBearbeitungAuftraege.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Offene Rechnungen')}
              value={offeneRechnungen.length}
              icon={<IconFileInvoice size={16} className="text-muted-foreground" />}
              tone={ueberfaelligeRechnungen.length > 0 ? 'destructive' : offeneRechnungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Fahrzeuge')}
              value={fahrzeuge.length}
              icon={<IconCar size={16} className="text-muted-foreground" />}
            />
            <StatStripItem
              title={tx('Inspektionen')}
              value={anstehendeInspektionen.length}
              icon={<IconCalendarCheck size={16} className="text-muted-foreground" />}
              tone={anstehendeInspektionen.length > 0 ? 'primary' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kanbanColumns}
            cards={kanbanCards}
            defaultCollapsed={['abgeschlossen']}
            onCardClick={card => {
              const a = enrichedAuftraege.find(x => x.record_id === card.id);
              if (a) overlay.replace({ type: 'auftraege', record: a });
            }}
            onCardMove={handleCardMove}
            onAddCard={column => setAuftraegeDialog({ open: true, defaults: { status: column } })}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Überfällige & offene Rechnungen')}
              items={[...ueberfaelligeRechnungen, ...offeneRechnungen.filter(r => !ueberfaelligeRechnungen.find(u => u.record_id === r.record_id))]
                .slice(0, 8)
                .map(r => ({
                  id: r.record_id,
                  title: r.kundeName || r.fields.rechnungsnummer || tx('Rechnung'),
                  secondLine: (
                    <>
                      <span className={`font-medium ${lookupKey(r.fields.status_rechnung) === 'ueberfaellig' || ueberfaelligeRechnungen.find(u => u.record_id === r.record_id) ? 'text-destructive' : 'text-warning'}`}>
                        {r.fields.rechnungsnummer}
                      </span>
                      {r.fields.faelligkeitsdatum && (
                        <span className="text-muted-foreground"> · {tx('fällig')} {formatDate(r.fields.faelligkeitsdatum)}</span>
                      )}
                      {r.fields.bruttobetrag != null && (
                        <span className="text-muted-foreground"> · {formatCurrency(r.fields.bruttobetrag)}</span>
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
                text: tx('Alle Rechnungen bezahlt — keine offenen Posten.'),
                action: { label: tx('Neue Rechnung'), onClick: () => setRechnungenDialog({ open: true }) },
              }}
            />
            <WorkList
              title={tx('Anstehende Inspektionen')}
              items={anstehendeInspektionen.slice(0, 6).map(i => ({
                id: i.record_id,
                title: i.fahrzeugName || tx('Fahrzeug'),
                secondLine: (
                  <>
                    <span className="font-medium text-primary">{formatDate(i.fields.wunschtermin_inspektion)}</span>
                    {i.fields.arbeitsbeschreibung_inspektion && (
                      <span className="text-muted-foreground truncate"> · {i.fields.arbeitsbeschreibung_inspektion}</span>
                    )}
                  </>
                ),
                action: {
                  label: tx('Auftrag'),
                  onClick: () => {
                    const fahrzeugId = extractRecordId(i.fields.fahrzeug);
                    setAuftraegeDialog({
                      open: true,
                      defaults: fahrzeugId ? { fahrzeug: fahrzeugId } : {},
                    });
                  },
                },
              }))}
              onItemClick={id => {
                const i = enrichedJahresinspektionPlanen.find(x => x.record_id === id);
                if (i) overlay.replace({ type: 'jahresinspektion_planen', record: i });
              }}
              empty={{
                text: tx('Keine anstehenden Inspektionen.'),
                action: { label: tx('Inspektion planen'), onClick: () => setInspektionDialog({ open: true }) },
              }}
            />
          </>
        }
      />

      {/* Overlay stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'kunden') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={[r.fields.vorname, r.fields.nachname].filter(Boolean).join(' ') || appLabel('kunden')}
                  subtitle={r.fields.ort || r.fields.email}
                />
                <KundenDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeuge', record: enrichedFahrzeuge.find(x => x.record_id === f.record_id) ?? { ...f, kundeName: '' } })}
                  onAddFahrzeuge={() => setFahrzeugeDialog({ open: true, defaults: { kunde: r.record_id } })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftraege', record: enrichedAuftraege.find(x => x.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onAddAuftraege={() => setAuftraegeDialog({ open: true, defaults: { kunde: r.record_id } })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rech => overlay.push({ type: 'rechnungen', record: enrichedRechnungen.find(x => x.record_id === rech.record_id) ?? { ...rech, auftragName: '', kundeName: '' } })}
                  onAddRechnungen={() => setRechnungenDialog({ open: true, defaults: { kunde: r.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'fahrzeuge') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={[r.fields.kennzeichen, r.fields.marke, r.fields.modell].filter(Boolean).join(' · ') || appLabel('fahrzeuge')}
                  subtitle={r.kundeName || undefined}
                />
                <FahrzeugeDetails
                  record={r}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftraege', record: enrichedAuftraege.find(x => x.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onAddAuftraege={() => setAuftraegeDialog({ open: true, defaults: { fahrzeug: r.record_id } })}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => overlay.push({ type: 'jahresinspektion_planen', record: enrichedJahresinspektionPlanen.find(x => x.record_id === i.record_id) ?? { ...i, fahrzeugName: '' } })}
                  onAddJahresinspektionPlanen={() => setInspektionDialog({ open: true, defaults: { fahrzeug: r.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'auftraege') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fields.auftragsnummer || appLabel('auftraege')}
                  subtitle={[r.fahrzeugName, r.kundeName].filter(Boolean).join(' · ')}
                />
                <AuftraegeDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeuge', record: enrichedFahrzeuge.find(x => x.record_id === f.record_id) ?? { ...f, kundeName: '' } })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rech => overlay.push({ type: 'rechnungen', record: enrichedRechnungen.find(x => x.record_id === rech.record_id) ?? { ...rech, auftragName: '', kundeName: '' } })}
                  onAddRechnungen={() => {
                    const kundeId = extractRecordId(r.fields.kunde);
                    setRechnungenDialog({
                      open: true,
                      defaults: {
                        auftrag: r.record_id,
                        ...(kundeId ? { kunde: kundeId } : {}),
                      },
                    });
                  }}
                />
              </>
            );
          }
          if (top.type === 'rechnungen') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fields.rechnungsnummer || appLabel('rechnungen')}
                  subtitle={r.kundeName || undefined}
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftraege', record: enrichedAuftraege.find(x => x.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={pdf => overlay.push({ type: 'rechnungs_pdf_erstellen', record: enrichedRechnungsPdfErstellen.find(x => x.record_id === pdf.record_id) ?? { ...pdf, rechnungName: '' } })}
                  onAddRechnungsPdfErstellen={() => setPdfDialog({ open: true, defaults: { rechnung: r.record_id } })}
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
                  title={r.fields.pdf_rechnungsnummer || appLabel('rechnungs_pdf_erstellen')}
                  subtitle={r.rechnungName || undefined}
                />
                <RechnungsPdfErstellenDetails
                  record={r}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rech => overlay.push({ type: 'rechnungen', record: enrichedRechnungen.find(x => x.record_id === rech.record_id) ?? { ...rech, auftragName: '', kundeName: '' } })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'auftraege') {
            const a = enrichedAuftraege.find(x => x.record_id === top.record.record_id) ?? top.record;
            const nextKey = lookupKey(a.fields.status) === 'offen' ? 'in_bearbeitung' : lookupKey(a.fields.status) === 'in_bearbeitung' ? 'abgeschlossen' : null;
            if (!nextKey) return undefined;
            const label = nextKey === 'in_bearbeitung' ? tx('In Bearbeitung setzen') : tx('Abschließen');
            return { label, onClick: () => advanceAuftragStatus(a as EnrichedAuftraege) };
          }
          if (top.type === 'rechnungen') {
            const r = enrichedRechnungen.find(x => x.record_id === top.record.record_id) ?? top.record;
            if (lookupKey(r.fields.status_rechnung) === 'bezahlt') return undefined;
            return { label: tx('Als bezahlt markieren'), onClick: () => markRechnungBezahlt(r as EnrichedRechnungen) };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'kunden') setKundenDialog({ open: true, defaults: top.record.fields, recordId: top.record.record_id });
          if (top.type === 'fahrzeuge') setFahrzeugeDialog({ open: true, defaults: { ...top.record.fields, kunde: extractRecordId(top.record.fields.kunde) ?? undefined }, recordId: top.record.record_id });
          if (top.type === 'auftraege') setAuftraegeDialog({ open: true, defaults: { ...top.record.fields, fahrzeug: extractRecordId(top.record.fields.fahrzeug) ?? undefined, kunde: extractRecordId(top.record.fields.kunde) ?? undefined }, recordId: top.record.record_id });
          if (top.type === 'rechnungen') setRechnungenDialog({ open: true, defaults: { ...top.record.fields, auftrag: extractRecordId(top.record.fields.auftrag) ?? undefined, kunde: extractRecordId(top.record.fields.kunde) ?? undefined }, recordId: top.record.record_id });
          if (top.type === 'jahresinspektion_planen') setInspektionDialog({ open: true, defaults: { ...top.record.fields, fahrzeug: extractRecordId(top.record.fields.fahrzeug) ?? undefined }, recordId: top.record.record_id });
          if (top.type === 'rechnungs_pdf_erstellen') setPdfDialog({ open: true, defaults: { ...top.record.fields, rechnung: extractRecordId(top.record.fields.rechnung) ?? undefined }, recordId: top.record.record_id });
        }}
      />

      {/* Dialogs */}
      <KundenDialog
        open={kundenDialog.open}
        onClose={() => setKundenDialog({ open: false })}
        onSubmit={async fields => {
          if (kundenDialog.recordId) await LivingAppsService.updateKundenEntry(kundenDialog.recordId, fields);
          else await LivingAppsService.createKundenEntry(fields);
          fetchAll();
        }}
        defaultValues={kundenDialog.defaults}
        recordId={kundenDialog.recordId}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />
      <FahrzeugeDialog
        open={fahrzeugeDialog.open}
        onClose={() => setFahrzeugeDialog({ open: false })}
        onSubmit={async fields => {
          if (fahrzeugeDialog.recordId) await LivingAppsService.updateFahrzeugeEntry(fahrzeugeDialog.recordId, fields);
          else await LivingAppsService.createFahrzeugeEntry(fields);
          fetchAll();
        }}
        defaultValues={fahrzeugeDialog.defaults}
        recordId={fahrzeugeDialog.recordId}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />
      <AuftraegeDialog
        open={auftraegeDialog.open}
        onClose={() => setAuftraegeDialog({ open: false })}
        onSubmit={async fields => {
          if (auftraegeDialog.recordId) await LivingAppsService.updateAuftraegeEntry(auftraegeDialog.recordId, fields);
          else await LivingAppsService.createAuftraegeEntry(fields);
          fetchAll();
        }}
        defaultValues={auftraegeDialog.defaults}
        recordId={auftraegeDialog.recordId}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />
      <RechnungenDialog
        open={rechnungenDialog.open}
        onClose={() => setRechnungenDialog({ open: false })}
        onSubmit={async fields => {
          if (rechnungenDialog.recordId) await LivingAppsService.updateRechnungenEntry(rechnungenDialog.recordId, fields);
          else await LivingAppsService.createRechnungenEntry(fields);
          fetchAll();
        }}
        defaultValues={rechnungenDialog.defaults}
        recordId={rechnungenDialog.recordId}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />
      <JahresinspektionPlanenDialog
        open={inspektionDialog.open}
        onClose={() => setInspektionDialog({ open: false })}
        onSubmit={async fields => {
          if (inspektionDialog.recordId) await LivingAppsService.updateJahresinspektionPlanenEntry(inspektionDialog.recordId, fields);
          else await LivingAppsService.createJahresinspektionPlanenEntry(fields);
          fetchAll();
        }}
        defaultValues={inspektionDialog.defaults}
        recordId={inspektionDialog.recordId}
        fahrzeugeList={fahrzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />
      <RechnungsPdfErstellenDialog
        open={pdfDialog.open}
        onClose={() => setPdfDialog({ open: false })}
        onSubmit={async fields => {
          if (pdfDialog.recordId) await LivingAppsService.updateRechnungsPdfErstellenEntry(pdfDialog.recordId, fields);
          else await LivingAppsService.createRechnungsPdfErstellenEntry(fields);
          fetchAll();
        }}
        defaultValues={pdfDialog.defaults}
        recordId={pdfDialog.recordId}
        rechnungenList={rechnungen}
        enablePhotoScan={AI_PHOTO_SCAN['RechnungsPdfErstellen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['RechnungsPdfErstellen']}
      />
    </>
  );
}
