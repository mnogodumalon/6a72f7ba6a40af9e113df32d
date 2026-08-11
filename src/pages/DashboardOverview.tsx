import { useMemo, useState, useCallback } from 'react';
import { format, isAfter, isBefore, parseISO, startOfDay, endOfDay } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { Auftraege, Rechnungen, Fahrzeuge, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
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
import { AuftraegeDialog, type AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import { RechnungenDialog, type RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import { FahrzeugeDialog, type FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import { JahresinspektionPlanenDialog, type JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { makeT } from '@/i18n';
import { tc } from '@/i18n/common';
import {
  IconAlertTriangle,
  IconPlus,
  IconCheck,
  IconCar,
  IconFileInvoice,
  IconClockHour4,
  IconTool,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    context_zero: 'Werkstatt-Übersicht — alles im Zeitplan.',
    context_one: 'Guten Start! {name} hat heute einen Termin.',
    context_many: 'Heute sind Aufträge für {names} geplant.',
    hero_ueberfaellig: '{n} überfällige {what}',
    hero_rechnung: 'Rechnung jetzt als bezahlt markieren',
    hero_auftrag: 'Auftrag abschließen',
    kpi_offen: 'Offen',
    kpi_inarbeit: 'In Bearbeitung',
    kpi_abgeschlossen: 'Abgeschlossen',
    kpi_rechnungen: 'Offene Rechnungen',
    kpi_ueberfaellig: 'Überfällig',
    aside_heute: 'Heute fällig',
    aside_rechnungen: 'Offene Rechnungen',
    aside_empty_auftraege: 'Keine Aufträge heute — guter Tag!',
    aside_empty_rechnungen: 'Keine offenen Rechnungen',
    btn_neuer_auftrag: 'Neuer Auftrag',
    abschliessen: 'Abschließen',
    als_bezahlt: 'Als bezahlt markieren',
    inspektion_faellig: '{n} Inspektion(en) demnächst fällig',
  },
  en: {
    context_zero: 'Workshop overview — everything on schedule.',
    context_one: 'Good start! {name} has an appointment today.',
    context_many: 'Orders scheduled today for {names}.',
    hero_ueberfaellig: '{n} overdue {what}',
    hero_rechnung: 'Mark invoice as paid now',
    hero_auftrag: 'Complete order',
    kpi_offen: 'Open',
    kpi_inarbeit: 'In Progress',
    kpi_abgeschlossen: 'Completed',
    kpi_rechnungen: 'Open Invoices',
    kpi_ueberfaellig: 'Overdue',
    aside_heute: 'Due today',
    aside_rechnungen: 'Open Invoices',
    aside_empty_auftraege: 'No orders today — enjoy the calm!',
    aside_empty_rechnungen: 'No open invoices',
    btn_neuer_auftrag: 'New Order',
    abschliessen: 'Complete',
    als_bezahlt: 'Mark as paid',
    inspektion_faellig: '{n} inspection(s) due soon',
  },
});

type OverlayItem =
  | { type: 'auftrag'; id: string }
  | { type: 'rechnung'; id: string }
  | { type: 'fahrzeug'; id: string }
  | { type: 'kunde'; id: string }
  | { type: 'inspektion'; id: string }
  | { type: 'pdferstellen'; id: string };

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'abgeschlossen') return 'success';
  if (status === 'in_bearbeitung') return 'primary';
  return 'warning';
}

function toneForPriority(prioritaet: string | undefined): KanbanTone {
  if (prioritaet === 'hoch') return 'destructive';
  if (prioritaet === 'normal') return 'primary';
  return 'default';
}

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
  const [auftraegeDialogOpen, setAuftraegeDialogOpen] = useState(false);
  const [auftraegeDefaults, setAuftraegeDefaults] = useState<AuftraegeDialogDefaults | undefined>();
  const [auftraegeEditId, setAuftraegeEditId] = useState<string | undefined>();

  const [rechnungenDialogOpen, setRechnungenDialogOpen] = useState(false);
  const [rechnungenDefaults, setRechnungenDefaults] = useState<RechnungenDialogDefaults | undefined>();
  const [rechnungenEditId, setRechnungenEditId] = useState<string | undefined>();

  const [fahrzeugeDialogOpen, setFahrzeugeDialogOpen] = useState(false);
  const [fahrzeugeDefaults, setFahrzeugeDefaults] = useState<FahrzeugeDialogDefaults | undefined>();
  const [fahrzeugeEditId, setFahrzeugeEditId] = useState<string | undefined>();

  const [inspektionDialogOpen, setInspektionDialogOpen] = useState(false);
  const [inspektionDefaults, setInspektionDefaults] = useState<JahresinspektionPlanenDialogDefaults | undefined>();
  const [inspektionEditId, setInspektionEditId] = useState<string | undefined>();

  // Kanban columns from schema (inside component body — locale-aware getter)
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Today range
  const todayStart = useMemo(() => startOfDay(clock), [clock]);
  const todayEnd = useMemo(() => endOfDay(clock), [clock]);
  const todayKey = format(clock, 'yyyy-MM-dd');

  // Derived data
  const auftraegeHeute = useMemo(
    () => enrichedAuftraege.filter(a => {
      if (!a.fields.wunschtermin) return false;
      const d = parseISO(a.fields.wunschtermin);
      return !isBefore(d, todayStart) && !isAfter(d, todayEnd);
    }),
    [enrichedAuftraege, todayStart, todayEnd],
  );

  const auftraegeOffen = useMemo(
    () => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'offen'),
    [enrichedAuftraege],
  );

  const auftraegeInArbeit = useMemo(
    () => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung'),
    [enrichedAuftraege],
  );

  const auftraegeAbgeschlossen = useMemo(
    () => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'abgeschlossen'),
    [enrichedAuftraege],
  );

  const rechnungenOffen = useMemo(
    () => enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'offen'),
    [enrichedRechnungen],
  );

  const rechnungenUeberfaellig = useMemo(
    () => enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'ueberfaellig'),
    [enrichedRechnungen],
  );

  // Inspektionen demnächst (nächste 30 Tage)
  const inspektionenDemnaechst = useMemo(() => {
    const in30 = new Date(clock);
    in30.setDate(in30.getDate() + 30);
    return enrichedJahresinspektionPlanen.filter(i => {
      if (!i.fields.wunschtermin_inspektion) return false;
      const d = parseISO(i.fields.wunschtermin_inspektion);
      return !isBefore(d, todayStart) && !isAfter(d, in30);
    });
  }, [enrichedJahresinspektionPlanen, todayStart, clock]);

  // Context line
  const contextLine = useMemo(() => {
    const heuteKunden = [...new Set(auftraegeHeute.map(a => a.kundeName).filter(Boolean) as string[])];
    if (heuteKunden.length === 0) return tt('context_zero');
    if (heuteKunden.length === 1) return tt('context_one', { name: heuteKunden[0] });
    return tt('context_many', { names: namen(heuteKunden) });
  }, [auftraegeHeute]);

  // Kanban cards
  const cards = useMemo<KanbanCard[]>(
    () =>
      enrichedAuftraege.map(a => {
        const status = lookupKey(a.fields.status) ?? COLUMNS[0]?.key ?? '';
        const prio = lookupKey(a.fields.prioritaet);
        return {
          id: `auftrag:${a.record_id}`,
          column: status,
          title: `${a.kundeName ?? '—'} · ${a.fahrzeugName ?? '—'}`,
          subtitle: a.fields.wunschtermin
            ? formatDate(a.fields.wunschtermin)
            : (a.fields.auftragsnummer ?? undefined),
          tone: prio === 'hoch' ? toneForPriority(prio) : toneForStatus(status),
        };
      }),
    [enrichedAuftraege, COLUMNS],
  );

  // Advance Auftrag status
  const advanceAuftrag = useCallback(async (auftrag: Auftraege) => {
    const current = lookupKey(auftrag.fields.status);
    const next = current === 'offen' ? 'in_bearbeitung' : current === 'in_bearbeitung' ? 'abgeschlossen' : null;
    if (!next) return;
    const label = LOOKUP_OPTIONS['auftraege']?.['status']?.find(o => o.key === next)?.label ?? next;
    const prevStatus = auftrag.fields.status;
    // optimistic
    fetchAll(); // will re-fetch; do patch immediately
    try {
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: next });
      undoToast(
        `${auftrag.fields.auftragsnummer ?? 'Auftrag'} → ${label}`,
        async () => {
          await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, {
            status: lookupKey(prevStatus) ?? current ?? 'offen',
          });
          fetchAll();
        },
      );
      fetchAll();
    } catch {
      fetchAll();
    }
  }, [fetchAll]);

  // Mark Rechnung as bezahlt
  const markBezahlt = useCallback(async (rechnung: Rechnungen) => {
    const prevStatus = rechnung.fields.status_rechnung;
    try {
      await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: 'bezahlt' });
      undoToast(
        `${rechnung.fields.rechnungsnummer ?? 'Rechnung'} — ${tc('abgeschlossen')}`,
        async () => {
          await LivingAppsService.updateRechnungenEntry(rechnung.record_id, {
            status_rechnung: lookupKey(prevStatus) ?? 'offen',
          });
          fetchAll();
        },
      );
      fetchAll();
    } catch {
      fetchAll();
    }
  }, [fetchAll]);

  // Kanban card move
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const label = LOOKUP_OPTIONS['auftraege']?.['status']?.find(o => o.key === newColumn)?.label ?? newColumn;
    const auftrag = auftraege.find(a => a.record_id === rid);
    const prevStatus = auftrag?.fields.status;
    try {
      await LivingAppsService.updateAuftraegeEntry(rid, { status: newColumn });
      undoToast(
        `${auftrag?.fields.auftragsnummer ?? 'Auftrag'} → ${label}`,
        async () => {
          await LivingAppsService.updateAuftraegeEntry(rid, {
            status: lookupKey(prevStatus) ?? 'offen',
          });
          fetchAll();
        },
      );
      fetchAll();
    } catch {
      fetchAll();
    }
  }, [auftraege, fetchAll]);

  // ─── All hooks above early returns ───────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Plain derivations below ─────────────────────────────────────────────────

  const erstesUeberfaellig = rechnungenUeberfaellig[0];
  const ersterOffenerAuftrag = rechnungenUeberfaellig.length === 0
    ? auftraegeOffen.find(a => {
        if (!a.fields.wunschtermin) return false;
        return isBefore(parseISO(a.fields.wunschtermin), todayStart);
      })
    : undefined;

  // Hero: überfällige Rechnungen first, dann überfällige Aufträge
  const heroContent = erstesUeberfaellig ? (
    <HeroBanner
      icon={<IconAlertTriangle size={18} />}
      action={{ label: tt('hero_rechnung'), onClick: () => void markBezahlt(erstesUeberfaellig) }}
    >
      <b>{rechnungenUeberfaellig.length === 1
        ? (erstesUeberfaellig.fields.rechnungsnummer ?? 'Rechnung')
        : namen(rechnungenUeberfaellig.map(r => r.fields.rechnungsnummer ?? ''))
      }</b>{' '}
      {tt('hero_ueberfaellig', { n: rechnungenUeberfaellig.length, what: 'Rechnung(en)' })} — fällig {formatDate(erstesUeberfaellig.fields.faelligkeitsdatum ?? '')}
    </HeroBanner>
  ) : ersterOffenerAuftrag ? (
    <HeroBanner
      icon={<IconTool size={18} />}
      action={{ label: tt('hero_auftrag'), onClick: () => void advanceAuftrag(ersterOffenerAuftrag) }}
    >
      Auftrag <b>{ersterOffenerAuftrag.fields.auftragsnummer ?? ''}</b> für <b>{ersterOffenerAuftrag.kundeName ?? '—'}</b> ist überfällig — Wunschtermin war {formatDate(ersterOffenerAuftrag.fields.wunschtermin ?? '')}
    </HeroBanner>
  ) : null;

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          onClick={() => { setAuftraegeDefaults(undefined); setAuftraegeEditId(undefined); setAuftraegeDialogOpen(true); }}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <IconPlus size={16} className="shrink-0" />
          {tt('btn_neuer_auftrag')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroContent ?? undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_offen')}
              value={auftraegeOffen.length}
              icon={<IconClockHour4 size={16} />}
              tone={auftraegeOffen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_inarbeit')}
              value={auftraegeInArbeit.length}
              icon={<IconTool size={16} />}
              tone={auftraegeInArbeit.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_abgeschlossen')}
              value={auftraegeAbgeschlossen.length}
              icon={<IconCheck size={16} />}
              tone="default"
            />
            <StatStripItem
              title={tt('kpi_rechnungen')}
              value={rechnungenOffen.length}
              icon={<IconFileInvoice size={16} />}
              tone={rechnungenOffen.length > 0 ? 'warning' : 'default'}
            />
            {rechnungenUeberfaellig.length > 0 && (
              <StatStripItem
                title={tt('kpi_ueberfaellig')}
                value={rechnungenUeberfaellig.length}
                tone="destructive"
              />
            )}
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['abgeschlossen']}
            onCardClick={card => overlay.replace({ type: 'auftrag', id: card.id.split(':')[1] ?? '' })}
            onCardMove={moveCard}
            onAddCard={column => {
              setAuftraegeDefaults({ status: column });
              setAuftraegeEditId(undefined);
              setAuftraegeDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('aside_heute')}
              items={auftraegeHeute.map(a => ({
                id: a.record_id,
                title: `${a.kundeName ?? '—'} · ${a.fahrzeugName ?? '—'}`,
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(a.fields.status) === 'offen' ? 'text-warning' : lookupKey(a.fields.status) === 'in_bearbeitung' ? 'text-primary' : 'text-success'}`}>
                      {a.fields.status?.label ?? '—'}
                    </span>
                    {a.fields.wunschtermin && (
                      <span className="text-muted-foreground"> · {formatDate(a.fields.wunschtermin)}</span>
                    )}
                  </>
                ),
                action: lookupKey(a.fields.status) !== 'abgeschlossen'
                  ? { label: tt('abschliessen'), onClick: () => void advanceAuftrag(a) }
                  : undefined,
              }))}
              onItemClick={id => overlay.replace({ type: 'auftrag', id })}
              empty={{
                text: tt('aside_empty_auftraege'),
                action: { label: tt('btn_neuer_auftrag'), onClick: () => { setAuftraegeDefaults({ wunschtermin: `${todayKey}T08:00` }); setAuftraegeEditId(undefined); setAuftraegeDialogOpen(true); } },
              }}
            />
            <WorkList
              title={tt('aside_rechnungen')}
              items={[...rechnungenUeberfaellig, ...rechnungenOffen.filter(r => lookupKey(r.fields.status_rechnung) !== 'ueberfaellig')].slice(0, 8).map(r => ({
                id: r.record_id,
                title: r.fields.rechnungsnummer ?? '—',
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(r.fields.status_rechnung) === 'ueberfaellig' ? 'text-destructive' : 'text-warning'}`}>
                      {r.fields.status_rechnung?.label ?? '—'}
                    </span>
                    {r.fields.faelligkeitsdatum && (
                      <span className="text-muted-foreground"> · fällig {formatDate(r.fields.faelligkeitsdatum)}</span>
                    )}
                    {r.fields.bruttobetrag != null && (
                      <span className="ml-auto text-muted-foreground">{formatCurrency(r.fields.bruttobetrag)}</span>
                    )}
                  </>
                ),
                action: { label: tt('als_bezahlt'), onClick: () => void markBezahlt(r) },
              }))}
              onItemClick={id => overlay.replace({ type: 'rechnung', id })}
              empty={{ text: tt('aside_empty_rechnungen') }}
            />
          </>
        }
      />

      {/* Dialogs */}
      <AuftraegeDialog
        open={auftraegeDialogOpen}
        onClose={() => setAuftraegeDialogOpen(false)}
        onSubmit={async fields => {
          if (auftraegeEditId) {
            await LivingAppsService.updateAuftraegeEntry(auftraegeEditId, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={auftraegeDefaults}
        recordId={auftraegeEditId}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />

      <RechnungenDialog
        open={rechnungenDialogOpen}
        onClose={() => setRechnungenDialogOpen(false)}
        onSubmit={async fields => {
          if (rechnungenEditId) {
            await LivingAppsService.updateRechnungenEntry(rechnungenEditId, fields);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={rechnungenDefaults}
        recordId={rechnungenEditId}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />

      <FahrzeugeDialog
        open={fahrzeugeDialogOpen}
        onClose={() => setFahrzeugeDialogOpen(false)}
        onSubmit={async fields => {
          if (fahrzeugeEditId) {
            await LivingAppsService.updateFahrzeugeEntry(fahrzeugeEditId, fields);
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={fahrzeugeDefaults}
        recordId={fahrzeugeEditId}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />

      <JahresinspektionPlanenDialog
        open={inspektionDialogOpen}
        onClose={() => setInspektionDialogOpen(false)}
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

      {/* Record Overlay Stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftrag') {
            const auftrag = auftraege.find(a => a.record_id === top.id);
            if (!auftrag) return null;
            return (
              <>
                <RecordHeader
                  title={auftrag.fields.auftragsnummer ?? '—'}
                  subtitle={auftrag.fields.status?.label}
                  badges={
                    auftrag.fields.prioritaet ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {auftrag.fields.prioritaet.label}
                      </span>
                    ) : undefined
                  }
                />
                <AuftraegeDetails
                  record={auftrag}
                  fahrzeugeList={fahrzeuge}
                  kundenList={kunden}
                  rechnungenList={rechnungen}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', id: f.record_id })}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnung', id: r.record_id })}
                  onAddRechnungen={() => {
                    setRechnungenDefaults({ auftrag: auftrag.record_id, kunde: extractRecordId(auftrag.fields.kunde) ?? undefined });
                    setRechnungenEditId(undefined);
                    setRechnungenDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'fahrzeug') {
            const fahrzeug = fahrzeuge.find(f => f.record_id === top.id);
            if (!fahrzeug) return null;
            return (
              <>
                <RecordHeader
                  title={fahrzeug.fields.kennzeichen ?? '—'}
                  subtitle={[fahrzeug.fields.marke, fahrzeug.fields.modell].filter(Boolean).join(' ')}
                  badges={<IconCar size={16} className="text-muted-foreground shrink-0" />}
                />
                <FahrzeugeDetails
                  record={fahrzeug}
                  kundenList={kunden}
                  auftraegeList={auftraege}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  onAddAuftraege={() => {
                    setAuftraegeDefaults({ fahrzeug: fahrzeug.record_id });
                    setAuftraegeEditId(undefined);
                    setAuftraegeDialogOpen(true);
                  }}
                  onOpenJahresinspektionPlanen={i => overlay.push({ type: 'inspektion', id: i.record_id })}
                  onAddJahresinspektionPlanen={() => {
                    setInspektionDefaults({ fahrzeug: fahrzeug.record_id });
                    setInspektionEditId(undefined);
                    setInspektionDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const kunde = kunden.find(k => k.record_id === top.id);
            if (!kunde) return null;
            return (
              <>
                <RecordHeader
                  title={[kunde.fields.vorname, kunde.fields.nachname].filter(Boolean).join(' ')}
                  subtitle={kunde.fields.telefon ?? kunde.fields.email}
                />
                <KundenDetails
                  record={kunde}
                  fahrzeugeList={fahrzeuge}
                  auftraegeList={auftraege}
                  rechnungenList={rechnungen}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', id: f.record_id })}
                  onAddFahrzeuge={() => {
                    setFahrzeugeDefaults({ kunde: kunde.record_id });
                    setFahrzeugeEditId(undefined);
                    setFahrzeugeDialogOpen(true);
                  }}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  onAddAuftraege={() => {
                    setAuftraegeDefaults({ kunde: kunde.record_id });
                    setAuftraegeEditId(undefined);
                    setAuftraegeDialogOpen(true);
                  }}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnung', id: r.record_id })}
                  onAddRechnungen={() => {
                    setRechnungenDefaults({ kunde: kunde.record_id });
                    setRechnungenEditId(undefined);
                    setRechnungenDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'rechnung') {
            const rechnung = rechnungen.find(r => r.record_id === top.id);
            if (!rechnung) return null;
            return (
              <>
                <RecordHeader
                  title={rechnung.fields.rechnungsnummer ?? '—'}
                  subtitle={rechnung.fields.status_rechnung?.label}
                />
                <RechnungenDetails
                  record={rechnung}
                  auftraegeList={auftraege}
                  kundenList={kunden}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  onOpenRechnungsPdfErstellen={p => overlay.push({ type: 'pdferstellen', id: p.record_id })}
                  onAddRechnungsPdfErstellen={() => {
                    overlay.close();
                  }}
                />
              </>
            );
          }
          if (top.type === 'inspektion') {
            const inspektion = jahresinspektionPlanen.find(i => i.record_id === top.id);
            if (!inspektion) return null;
            return (
              <>
                <RecordHeader
                  title={enrichedJahresinspektionPlanen.find(e => e.record_id === top.id)?.fahrzeugName ?? '—'}
                  subtitle={formatDate(inspektion.fields.wunschtermin_inspektion ?? '')}
                />
                <JahresinspektionPlanenDetails
                  record={inspektion}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', id: f.record_id })}
                />
              </>
            );
          }
          if (top.type === 'pdferstellen') {
            const pdf = rechnungsPdfErstellen.find(p => p.record_id === top.id);
            if (!pdf) return null;
            return (
              <>
                <RecordHeader
                  title={pdf.fields.pdf_rechnungsnummer ?? '—'}
                  subtitle={`${pdf.fields.pdf_kunde_vorname ?? ''} ${pdf.fields.pdf_kunde_nachname ?? ''}`.trim()}
                />
                <RechnungsPdfErstellenDetails
                  record={pdf}
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
            const auftrag = auftraege.find(a => a.record_id === top.id);
            if (!auftrag || lookupKey(auftrag.fields.status) === 'abgeschlossen') return undefined;
            return { label: tt('abschliessen'), onClick: () => void advanceAuftrag(auftrag) };
          }
          if (top.type === 'rechnung') {
            const rechnung = rechnungen.find(r => r.record_id === top.id);
            if (!rechnung || lookupKey(rechnung.fields.status_rechnung) === 'bezahlt') return undefined;
            return { label: tt('als_bezahlt'), onClick: () => void markBezahlt(rechnung) };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'auftrag') {
            const auftrag = auftraege.find(a => a.record_id === top.id);
            if (!auftrag) return;
            setAuftraegeDefaults(auftrag.fields as AuftraegeDialogDefaults);
            setAuftraegeEditId(auftrag.record_id);
            setAuftraegeDialogOpen(true);
          } else if (top.type === 'fahrzeug') {
            const fahrzeug = fahrzeuge.find(f => f.record_id === top.id);
            if (!fahrzeug) return;
            setFahrzeugeDefaults(fahrzeug.fields as FahrzeugeDialogDefaults);
            setFahrzeugeEditId(fahrzeug.record_id);
            setFahrzeugeDialogOpen(true);
          } else if (top.type === 'rechnung') {
            const rechnung = rechnungen.find(r => r.record_id === top.id);
            if (!rechnung) return;
            setRechnungenDefaults(rechnung.fields as RechnungenDialogDefaults);
            setRechnungenEditId(rechnung.record_id);
            setRechnungenDialogOpen(true);
          } else if (top.type === 'inspektion') {
            const inspektion = jahresinspektionPlanen.find(i => i.record_id === top.id);
            if (!inspektion) return;
            setInspektionDefaults(inspektion.fields as JahresinspektionPlanenDialogDefaults);
            setInspektionEditId(inspektion.record_id);
            setInspektionDialogOpen(true);
          }
        }}
      />
    </>
  );
}
