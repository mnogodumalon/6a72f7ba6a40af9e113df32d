import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedAuftraege, EnrichedRechnungen, EnrichedJahresinspektionPlanen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { lookupKey } from '@/lib/formatters';
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
} from '@/components/widgets/RecordView';
import { AuftraegeDetails } from '@/components/details/AuftraegeDetails';
import { KundenDetails } from '@/components/details/KundenDetails';
import { FahrzeugeDetails } from '@/components/details/FahrzeugeDetails';
import { RechnungenDetails } from '@/components/details/RechnungenDetails';
import { JahresinspektionPlanenDetails } from '@/components/details/JahresinspektionPlanenDetails';
import { RechnungsPdfErstellenDetails } from '@/components/details/RechnungsPdfErstellenDetails';
import { AuftraegeDialog } from '@/components/dialogs/AuftraegeDialog';
import { KundenDialog } from '@/components/dialogs/KundenDialog';
import { FahrzeugeDialog } from '@/components/dialogs/FahrzeugeDialog';
import { RechnungenDialog } from '@/components/dialogs/RechnungenDialog';
import { JahresinspektionPlanenDialog } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { RechnungsPdfErstellenDialog } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import type { AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import type { RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import type { JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconAlertCircle,
  IconPlus,
  IconCalendar,
  IconReceipt,
  IconCar,
  IconTool,
  IconUsers,
  IconCheck,
} from '@tabler/icons-react';

// ─── Overlay-Stack-Item-Types ───────────────────────────────────────────────
type OverlayItem =
  | { type: 'auftrag'; record: EnrichedAuftraege }
  | { type: 'kunde'; record: Kunden }
  | { type: 'fahrzeug'; record: Fahrzeuge }
  | { type: 'rechnung'; record: EnrichedRechnungen }
  | { type: 'inspektion'; record: EnrichedJahresinspektionPlanen }
  | { type: 'rechnungspdf'; record: RechnungsPdfErstellen };

export default function DashboardOverview() {
  const {
    kunden, setKunden,
    fahrzeuge, setFahrzeuge,
    auftraege, setAuftraege,
    rechnungen, setRechnungen,
    jahresinspektionPlanen, setJahresinspektionPlanen,
    rechnungsPdfErstellen, setRechnungsPdfErstellen,
    kundenMap, fahrzeugeMap, auftraegeMap, rechnungenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();

  // Overlay stack
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog states
  const [auftragDialog, setAuftragDialog] = useState<{ open: boolean; defaults?: AuftraegeDialogDefaults; editId?: string }>({ open: false });
  const [kundenDialogOpen, setKundenDialogOpen] = useState(false);
  const [fahrzeugDialog, setFahrzeugDialog] = useState<{ open: boolean; defaults?: { kunde?: string }; editRecord?: Fahrzeuge }>({ open: false });
  const [rechnungDialog, setRechnungDialog] = useState<{ open: boolean; defaults?: RechnungenDialogDefaults; editRecord?: Rechnungen }>({ open: false });
  const [inspektionDialog, setInspektionDialog] = useState<{ open: boolean; defaults?: JahresinspektionPlanenDialogDefaults; editRecord?: JahresinspektionPlanen }>({ open: false });
  const [rechnungsPdfDialog, setRechnungsPdfDialog] = useState<{ open: boolean; defaults?: { rechnung?: string }; editRecord?: RechnungsPdfErstellen }>({ open: false });

  // Enrichment (must be before early returns — these are plain function calls, not hooks)
  const enrichedFahrzeuge = useMemo(() => enrichFahrzeuge(fahrzeuge, { kundenMap }), [fahrzeuge, kundenMap]);
  const enrichedAuftraege = useMemo(() => enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap }), [auftraege, fahrzeugeMap, kundenMap]);
  const enrichedRechnungen = useMemo(() => enrichRechnungen(rechnungen, { auftraegeMap, kundenMap }), [rechnungen, auftraegeMap, kundenMap]);
  const enrichedJahresinspektionPlanen = useMemo(() => enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap }), [jahresinspektionPlanen, fahrzeugeMap]);
  const enrichedRechnungsPdfErstellen = useMemo(() => enrichRechnungsPdfErstellen(rechnungsPdfErstellen, { rechnungenMap }), [rechnungsPdfErstellen, rechnungenMap]);

  // Derived KPIs (clock-aware)
  const todayStr = format(clock, 'yyyy-MM-dd');

  const offeneAuftraege = useMemo(() => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'offen'), [enrichedAuftraege]);
  const inBearbeitungAuftraege = useMemo(() => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung'), [enrichedAuftraege]);

  const ueberfaelligeRechnungen = useMemo(() =>
    enrichedRechnungen.filter(r => {
      const status = lookupKey(r.fields.status_rechnung);
      if (status === 'bezahlt') return false;
      return r.fields.faelligkeitsdatum && r.fields.faelligkeitsdatum < todayStr;
    }),
    [enrichedRechnungen, todayStr]
  );

  const bevorstehendInspektionen = useMemo(() =>
    enrichedJahresinspektionPlanen
      .filter(i => i.fields.wunschtermin_inspektion && i.fields.wunschtermin_inspektion >= todayStr)
      .sort((a, b) => (a.fields.wunschtermin_inspektion ?? '').localeCompare(b.fields.wunschtermin_inspektion ?? ''))
      .slice(0, 5),
    [enrichedJahresinspektionPlanen, todayStr]
  );

  const offeneRechnungen = useMemo(() =>
    enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'offen'),
    [enrichedRechnungen]
  );

  // Context line names
  const inBearbeitungNames = useMemo(
    () => namen(inBearbeitungAuftraege.map(a => a.kundeName || a.fahrzeugName || '')),
    [inBearbeitungAuftraege]
  );

  // ── Advance Auftrag Status (shared helper) ──────────────────────────────
  const advanceAuftragStatus = useCallback(async (auftrag: EnrichedAuftraege) => {
    const currentStatus = lookupKey(auftrag.fields.status);
    let nextStatus: string;
    if (currentStatus === 'offen') nextStatus = 'in_bearbeitung';
    else if (currentStatus === 'in_bearbeitung') nextStatus = 'abgeschlossen';
    else return;

    const nextLabel = LOOKUP_OPTIONS['auftraege']?.['status']?.find(o => o.key === nextStatus)?.label ?? nextStatus;
    const prev = [...auftraege];

    // Optimistic update
    setAuftraege(auftraege.map(a =>
      a.record_id === auftrag.record_id
        ? { ...a, fields: { ...a.fields, status: { key: nextStatus, label: nextLabel } } }
        : a
    ));

    try {
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: nextStatus });
      undoToast(
        tx`${auftrag.fields.auftragsnummer || auftrag.record_id} — ${nextLabel}`,
        async () => {
          setAuftraege(prev);
          await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: currentStatus ?? 'offen' });
        }
      );
    } catch {
      setAuftraege(prev);
      await fetchAll();
    }
  }, [auftraege, setAuftraege, fetchAll]);

  // ── Mark Rechnung bezahlt ───────────────────────────────────────────────
  const markRechnungBezahlt = useCallback(async (rechnung: EnrichedRechnungen) => {
    const prev = [...rechnungen];
    setRechnungen(rechnungen.map(r =>
      r.record_id === rechnung.record_id
        ? { ...r, fields: { ...r.fields, status_rechnung: { key: 'bezahlt', label: tx('Bezahlt') } } }
        : r
    ));
    try {
      await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: 'bezahlt' });
      undoToast(
        tx`${rechnung.fields.rechnungsnummer || ''} — bezahlt`,
        async () => {
          setRechnungen(prev);
          const prevStatus = lookupKey(rechnung.fields.status_rechnung) ?? 'offen';
          await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: prevStatus });
        }
      );
    } catch {
      setRechnungen(prev);
      await fetchAll();
    }
  }, [rechnungen, setRechnungen, fetchAll]);

  // ── Early returns AFTER hooks ───────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ── Kanban Columns & Cards ──────────────────────────────────────────────
  const kanbanColumns: KanbanColumn[] = (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({
    key: o.key,
    label: o.label,
    tone: o.key === 'abgeschlossen' ? 'success' : o.key === 'offen' ? 'warning' : 'primary',
  }));

  const kanbanCards: KanbanCard[] = enrichedAuftraege
    .sort((a, b) => (a.fields.wunschtermin ?? '').localeCompare(b.fields.wunschtermin ?? ''))
    .map(a => ({
      id: `auftrag:${a.record_id}`,
      column: lookupKey(a.fields.status) ?? '',
      title: a.fahrzeugName || a.fields.auftragsnummer || appLabel('auftraege'),
      subtitle: [
        a.kundeName,
        a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : null,
      ].filter(Boolean).join(' · '),
      tone: lookupKey(a.fields.prioritaet) === 'hoch' ? 'destructive' as const
        : lookupKey(a.fields.prioritaet) === 'normal' ? 'default' as const
        : 'default' as const,
    }));

  // ── Context line ───────────────────────────────────────────────────────
  let contextLine: string;
  if (auftraege.length === 0) {
    contextLine = tx('Noch keine Aufträge erfasst — starte jetzt mit dem ersten Auftrag.');
  } else if (inBearbeitungAuftraege.length > 0) {
    contextLine = tx`${inBearbeitungNames} in Bearbeitung — ${String(offeneAuftraege.length)} offen.`;
  } else if (offeneAuftraege.length > 0) {
    contextLine = tx`${String(offeneAuftraege.length)} offene Aufträge warten auf Bearbeitung.`;
  } else {
    contextLine = tx('Alle Aufträge abgeschlossen — super!');
  }

  // ── Aside: Überfällige Rechnungen WorkList ─────────────────────────────
  const rechnungenWorkItems = ueberfaelligeRechnungen.slice(0, 6).map(r => ({
    id: r.record_id,
    title: r.fields.rechnungsnummer ?? appLabel('rechnungen'),
    secondLine: (
      <span className="flex gap-1 flex-wrap">
        <span className="font-medium text-destructive">{tx('Überfällig')}</span>
        {r.kundeName && <span className="text-muted-foreground">· {r.kundeName}</span>}
        {r.fields.bruttobetrag != null && (
          <span className="text-muted-foreground">· {formatCurrency(r.fields.bruttobetrag)}</span>
        )}
      </span>
    ),
    action: {
      label: tx('✓ Bezahlt'),
      onClick: () => markRechnungBezahlt(r),
    },
  }));

  const nextOffeneRechnung = offeneRechnungen.find(r => r.fields.faelligkeitsdatum);
  const rechnungenEmptyText = ueberfaelligeRechnungen.length === 0
    ? nextOffeneRechnung
      ? tx`Nächste Fälligkeit: ${formatDate(nextOffeneRechnung.fields.faelligkeitsdatum)}`
      : tx('Keine offenen Rechnungen')
    : undefined;

  // ── Aside: Bevorstehende Inspektionen WorkList ─────────────────────────
  const inspektionWorkItems = bevorstehendInspektionen.map(i => ({
    id: i.record_id,
    title: i.fahrzeugName || appLabel('jahresinspektion_planen'),
    secondLine: (
      <span className="text-muted-foreground">
        {i.fields.wunschtermin_inspektion ? formatDate(i.fields.wunschtermin_inspektion) : '—'}
      </span>
    ),
    action: undefined,
  }));

  // ── Empty state ─────────────────────────────────────────────────────────
  const isEmpty = auftraege.length === 0 && rechnungen.length === 0 && kunden.length === 0;

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground truncate">{contextLine}</p>
        </div>
        <button
          onClick={() => setAuftragDialog({ open: true })}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neuer Auftrag')}
        </button>
      </div>

      {isEmpty ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <IconTool size={48} className="text-muted-foreground" stroke={1.5} />
          <div>
            <h2 className="text-lg font-semibold">{tx('Werkstatt einrichten')}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {tx('Lege deinen ersten Kunden und Auftrag an, um loszulegen.')}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            <button
              onClick={() => setKundenDialogOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <IconUsers size={16} className="shrink-0" />
              {tx('Ersten Kunden anlegen')}
            </button>
            <button
              onClick={() => setAuftragDialog({ open: true })}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <IconTool size={16} className="shrink-0" />
              {tx('Ersten Auftrag erstellen')}
            </button>
          </div>
        </div>
      ) : (
        <DashboardGrid
          variant="wide"
          hero={
            ueberfaelligeRechnungen.length > 0 ? (
              <HeroBanner
                icon={<IconAlertCircle size={18} />}
                action={{
                  label: tx('✓ Als bezahlt markieren'),
                  onClick: () => markRechnungBezahlt(ueberfaelligeRechnungen[0]),
                }}
              >
                <b>{namen(ueberfaelligeRechnungen.map(r => r.kundeName || r.fields.rechnungsnummer || ''))}</b>
                {' '}{tx('— Rechnung überfällig seit')}{' '}
                {formatDate(ueberfaelligeRechnungen[0].fields.faelligkeitsdatum)}.
              </HeroBanner>
            ) : undefined
          }
          kpis={
            <StatStrip>
              <StatStripItem
                title={tx('Offen')}
                value={offeneAuftraege.length}
                icon={<IconTool size={14} />}
                tone={offeneAuftraege.length > 0 ? 'warning' : 'default'}
              />
              <StatStripItem
                title={tx('In Bearbeitung')}
                value={inBearbeitungAuftraege.length}
                icon={<IconTool size={14} />}
                tone={inBearbeitungAuftraege.length > 0 ? 'primary' : 'default'}
              />
              <StatStripItem
                title={tx('Rechnungen offen')}
                value={offeneRechnungen.length}
                icon={<IconReceipt size={14} />}
                tone={ueberfaelligeRechnungen.length > 0 ? 'destructive' : offeneRechnungen.length > 0 ? 'warning' : 'default'}
              />
              <StatStripItem
                title={tx('Fahrzeuge')}
                value={fahrzeuge.length}
                icon={<IconCar size={14} />}
                tone="default"
              />
              <StatStripItem
                title={tx('Kunden')}
                value={kunden.length}
                icon={<IconUsers size={14} />}
                tone="default"
              />
            </StatStrip>
          }
          primary={
            <KanbanWidget
              columns={kanbanColumns}
              cards={kanbanCards}
              defaultCollapsed={[]}
              onCardClick={card => {
                const id = card.id.split(':')[1];
                const rec = enrichedAuftraege.find(a => a.record_id === id);
                if (rec) overlay.replace({ type: 'auftrag', record: rec });
              }}
              onCardMove={async (cardId, newColumn) => {
                const id = cardId.split(':')[1];
                const auftrag = enrichedAuftraege.find(a => a.record_id === id);
                if (!auftrag) return;

                const newLabel = LOOKUP_OPTIONS['auftraege']?.['status']?.find(o => o.key === newColumn)?.label ?? newColumn;
                const prevStatus = lookupKey(auftrag.fields.status) ?? 'offen';
                const prevLabel = LOOKUP_OPTIONS['auftraege']?.['status']?.find(o => o.key === prevStatus)?.label ?? prevStatus;
                const prev = [...auftraege];

                setAuftraege(auftraege.map(a =>
                  a.record_id === id
                    ? { ...a, fields: { ...a.fields, status: { key: newColumn, label: newLabel } } }
                    : a
                ));

                try {
                  await LivingAppsService.updateAuftraegeEntry(id, { status: newColumn });
                  undoToast(
                    tx`${auftrag.fields.auftragsnummer || id} — ${newLabel}`,
                    async () => {
                      setAuftraege(prev);
                      await LivingAppsService.updateAuftraegeEntry(id, { status: prevStatus });
                    }
                  );
                } catch {
                  setAuftraege(prev);
                  await fetchAll();
                }
              }}
              onAddCard={column => setAuftragDialog({ open: true, defaults: { status: column } })}
            />
          }
          aside={
            <>
              <WorkList
                title={tx('Überfällige Rechnungen')}
                items={rechnungenWorkItems}
                onItemClick={id => {
                  const rec = enrichedRechnungen.find(r => r.record_id === id);
                  if (rec) overlay.replace({ type: 'rechnung', record: rec });
                }}
                empty={{
                  text: rechnungenEmptyText ?? tx('Keine überfälligen Rechnungen'),
                  action: { label: tx('Neue Rechnung'), onClick: () => setRechnungDialog({ open: true }) },
                }}
              />
              <WorkList
                title={tx('Bevorstehende Inspektionen')}
                items={inspektionWorkItems}
                onItemClick={id => {
                  const rec = enrichedJahresinspektionPlanen.find(i => i.record_id === id);
                  if (rec) overlay.replace({ type: 'inspektion', record: rec });
                }}
                empty={{
                  text: tx('Keine geplanten Inspektionen'),
                  action: { label: tx('Inspektion planen'), onClick: () => setInspektionDialog({ open: true }) },
                }}
              />
            </>
          }
        />
      )}

      {/* ── Single RecordOverlayHost ─────────────────────────────────────── */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftrag') {
            const a = top.record;
            return (
              <>
                <RecordHeader
                  title={a.fahrzeugName || a.fields.auftragsnummer || appLabel('auftraege')}
                  subtitle={a.kundeName}
                  badges={
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                      {a.fields.status?.label ?? '—'}
                    </span>
                  }
                />
                <AuftraegeDetails
                  record={a}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => {
                    const ef = enrichedFahrzeuge.find(ef => ef.record_id === f.record_id);
                    overlay.push({ type: 'fahrzeug', record: ef ?? f });
                  }}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', record: k })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => {
                    const er = enrichedRechnungen.find(er => er.record_id === r.record_id);
                    if (er) overlay.push({ type: 'rechnung', record: er });
                  }}
                  onAddRechnungen={() => setRechnungDialog({
                    open: true,
                    defaults: {
                      auftrag: a.record_id,
                      kunde: extractRecordId(a.fields.kunde) ?? undefined,
                    },
                  })}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = top.record;
            return (
              <>
                <RecordHeader
                  title={[k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || appLabel('kunden')}
                  subtitle={k.fields.telefon ?? k.fields.email}
                />
                <KundenDetails
                  record={k}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => {
                    const ef = enrichedFahrzeuge.find(ef => ef.record_id === f.record_id);
                    overlay.push({ type: 'fahrzeug', record: ef ?? f });
                  }}
                  onAddFahrzeuge={() => setFahrzeugDialog({ open: true, defaults: { kunde: k.record_id } })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = enrichedAuftraege.find(ea => ea.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'auftrag', record: ea });
                  }}
                  onAddAuftraege={() => setAuftragDialog({ open: true, defaults: { kunde: k.record_id } })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => {
                    const er = enrichedRechnungen.find(er => er.record_id === r.record_id);
                    if (er) overlay.push({ type: 'rechnung', record: er });
                  }}
                  onAddRechnungen={() => setRechnungDialog({ open: true, defaults: { kunde: k.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'fahrzeug') {
            const f = top.record;
            return (
              <>
                <RecordHeader
                  title={f.fields.kennzeichen || appLabel('fahrzeuge')}
                  subtitle={[f.fields.marke, f.fields.modell].filter(Boolean).join(' ')}
                />
                <FahrzeugeDetails
                  record={f}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', record: k })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = enrichedAuftraege.find(ea => ea.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'auftrag', record: ea });
                  }}
                  onAddAuftraege={() => setAuftragDialog({ open: true, defaults: { fahrzeug: f.record_id } })}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => {
                    const ei = enrichedJahresinspektionPlanen.find(ei => ei.record_id === i.record_id);
                    if (ei) overlay.push({ type: 'inspektion', record: ei });
                  }}
                  onAddJahresinspektionPlanen={() => setInspektionDialog({ open: true, defaults: { fahrzeug: f.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'rechnung') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fields.rechnungsnummer || appLabel('rechnungen')}
                  subtitle={r.kundeName}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      lookupKey(r.fields.status_rechnung) === 'bezahlt'
                        ? 'bg-green-100 text-green-800'
                        : lookupKey(r.fields.status_rechnung) === 'ueberfaellig'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {r.fields.status_rechnung?.label ?? '—'}
                    </span>
                  }
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = enrichedAuftraege.find(ea => ea.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'auftrag', record: ea });
                  }}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', record: k })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={p => {
                    const ep = enrichedRechnungsPdfErstellen.find(ep => ep.record_id === p.record_id);
                    if (ep) overlay.push({ type: 'rechnungspdf', record: ep });
                  }}
                  onAddRechnungsPdfErstellen={() => setRechnungsPdfDialog({ open: true, defaults: { rechnung: r.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'inspektion') {
            const i = top.record;
            return (
              <>
                <RecordHeader
                  title={i.fahrzeugName || appLabel('jahresinspektion_planen')}
                  subtitle={i.fields.wunschtermin_inspektion ? formatDate(i.fields.wunschtermin_inspektion) : undefined}
                />
                <JahresinspektionPlanenDetails
                  record={i}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => {
                    const ef = enrichedFahrzeuge.find(ef => ef.record_id === f.record_id);
                    overlay.push({ type: 'fahrzeug', record: ef ?? f });
                  }}
                />
              </>
            );
          }
          if (top.type === 'rechnungspdf') {
            const p = top.record;
            return (
              <>
                <RecordHeader
                  title={p.fields.pdf_rechnungsnummer || appLabel('rechnungs_pdf_erstellen')}
                  subtitle={enrichedRechnungsPdfErstellen.find(ep => ep.record_id === p.record_id)?.rechnungName}
                />
                <RechnungsPdfErstellenDetails
                  record={p}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => {
                    const er = enrichedRechnungen.find(er => er.record_id === r.record_id);
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
            const currentStatus = lookupKey(top.record.fields.status);
            if (currentStatus === 'offen') {
              return { label: tx('In Bearbeitung nehmen'), onClick: () => advanceAuftragStatus(top.record) };
            }
            if (currentStatus === 'in_bearbeitung') {
              return { label: tx('Abschließen'), onClick: () => advanceAuftragStatus(top.record) };
            }
          }
          if (top.type === 'rechnung') {
            const status = lookupKey(top.record.fields.status_rechnung);
            if (status !== 'bezahlt') {
              return { label: tx('Als bezahlt markieren'), onClick: () => markRechnungBezahlt(top.record) };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'auftrag') {
            setAuftragDialog({ open: true, defaults: top.record.fields as AuftraegeDialogDefaults, editId: top.record.record_id });
            overlay.close();
          } else if (top.type === 'rechnung') {
            setRechnungDialog({ open: true, defaults: top.record.fields as RechnungenDialogDefaults, editRecord: top.record });
            overlay.close();
          }
        }}
      />

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <AuftraegeDialog
        open={auftragDialog.open}
        onClose={() => setAuftragDialog({ open: false })}
        onSubmit={async fields => {
          if (auftragDialog.editId) {
            await LivingAppsService.updateAuftraegeEntry(auftragDialog.editId, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={auftragDialog.defaults}
        recordId={auftragDialog.editId}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />

      <KundenDialog
        open={kundenDialogOpen}
        onClose={() => setKundenDialogOpen(false)}
        onSubmit={async fields => {
          await LivingAppsService.createKundenEntry(fields);
          await fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
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
          await fetchAll();
        }}
        defaultValues={fahrzeugDialog.defaults}
        recordId={fahrzeugDialog.editRecord?.record_id}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
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
          await fetchAll();
        }}
        defaultValues={rechnungDialog.defaults}
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
          await fetchAll();
        }}
        defaultValues={inspektionDialog.defaults}
        recordId={inspektionDialog.editRecord?.record_id}
        fahrzeugeList={fahrzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />

      <RechnungsPdfErstellenDialog
        open={rechnungsPdfDialog.open}
        onClose={() => setRechnungsPdfDialog({ open: false })}
        onSubmit={async fields => {
          if (rechnungsPdfDialog.editRecord) {
            await LivingAppsService.updateRechnungsPdfErstellenEntry(rechnungsPdfDialog.editRecord.record_id, fields);
          } else {
            await LivingAppsService.createRechnungsPdfErstellenEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={rechnungsPdfDialog.defaults}
        recordId={rechnungsPdfDialog.editRecord?.record_id}
        rechnungenList={rechnungen}
        enablePhotoScan={AI_PHOTO_SCAN['RechnungsPdfErstellen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['RechnungsPdfErstellen']}
      />
    </>
  );
}
