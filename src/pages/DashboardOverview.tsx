import { useMemo, useState, useCallback } from 'react';
import { format, parseISO, isBefore, isAfter, addDays } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedFahrzeuge, EnrichedAuftraege, EnrichedRechnungen, EnrichedJahresinspektionPlanen, EnrichedRechnungsPdfErstellen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
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
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KundenDialog, type KundenDialogDefaults } from '@/components/dialogs/KundenDialog';
import { FahrzeugeDialog, type FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import { AuftraegeDialog, type AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import { RechnungenDialog, type RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import { JahresinspektionPlanenDialog, type JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { RechnungsPdfErstellenDialog, type RechnungsPdfErstellenDialogDefaults } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import {
  IconAlertTriangle,
  IconPlus,
  IconCar,
  IconClipboardList,
  IconReceipt,
  IconCalendarTime,
  IconCheck,
} from '@tabler/icons-react';

export type OverlayItem =
  | { type: 'kunden'; record: Kunden }
  | { type: 'fahrzeuge'; record: EnrichedFahrzeuge }
  | { type: 'auftraege'; record: EnrichedAuftraege }
  | { type: 'rechnungen'; record: EnrichedRechnungen }
  | { type: 'jahresinspektion_planen'; record: EnrichedJahresinspektionPlanen }
  | { type: 'rechnungs_pdf_erstellen'; record: EnrichedRechnungsPdfErstellen };

function toneForAuftragStatus(status: string | undefined): KanbanTone {
  if (status === 'abgeschlossen') return 'default';
  if (status === 'in_bearbeitung') return 'primary';
  return 'warning';
}

export default function DashboardOverview() {
  const clock = useClock();

  const {
    kunden, fahrzeuge, auftraege, rechnungen, jahresinspektionPlanen, rechnungsPdfErstellen,
    setAuftraege, setRechnungen,
    kundenMap, fahrzeugeMap, auftraegeMap, rechnungenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedFahrzeuge = enrichFahrzeuge(fahrzeuge, { kundenMap });
  const enrichedAuftraege = enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap });
  const enrichedRechnungen = enrichRechnungen(rechnungen, { auftraegeMap, kundenMap });
  const enrichedJahresinspektionPlanen = enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap });
  const enrichedRechnungsPdfErstellen = enrichRechnungsPdfErstellen(rechnungsPdfErstellen, { rechnungenMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [kundenDialogOpen, setKundenDialogOpen] = useState(false);
  const [kundenDefaults, setKundenDefaults] = useState<KundenDialogDefaults | undefined>();
  const [editingKunde, setEditingKunde] = useState<Kunden | null>(null);

  const [fahrzeugeDialogOpen, setFahrzeugeDialogOpen] = useState(false);
  const [fahrzeugeDefaults, setFahrzeugeDefaults] = useState<FahrzeugeDialogDefaults | undefined>();
  const [editingFahrzeug, setEditingFahrzeug] = useState<Fahrzeuge | null>(null);

  const [auftraegeDialogOpen, setAuftraegeDialogOpen] = useState(false);
  const [auftraegeDefaults, setAuftraegeDefaults] = useState<AuftraegeDialogDefaults | undefined>();
  const [editingAuftrag, setEditingAuftrag] = useState<Auftraege | null>(null);

  const [rechnungenDialogOpen, setRechnungenDialogOpen] = useState(false);
  const [rechnungenDefaults, setRechnungenDefaults] = useState<RechnungenDialogDefaults | undefined>();
  const [editingRechnung, setEditingRechnung] = useState<Rechnungen | null>(null);

  const [inspektionDialogOpen, setInspektionDialogOpen] = useState(false);
  const [inspektionDefaults, setInspektionDefaults] = useState<JahresinspektionPlanenDialogDefaults | undefined>();
  const [editingInspektion, setEditingInspektion] = useState<JahresinspektionPlanen | null>(null);

  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfDefaults, setPdfDefaults] = useState<RechnungsPdfErstellenDialogDefaults | undefined>();
  const [editingPdf, setEditingPdf] = useState<RechnungsPdfErstellen | null>(null);

  // Status filter
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Kanban columns — inside component body (locale-aware labels)
  const AUFTRAG_COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Move card — optimistic + undo
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const prev = auftraege.find(a => a.record_id === rid);
    if (!prev) return;
    const newLv = lookupOption('auftraege', 'status', newColumn);
    setAuftraege(all => all.map(a =>
      a.record_id === rid ? { ...a, fields: { ...a.fields, status: newLv } } : a
    ));
    const colLabel = AUFTRAG_COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    undoToast(tx`${prev.fields.auftragsnummer ?? ''} → ${colLabel}`, async () => {
      const oldKey = lookupKey(prev.fields.status) ?? 'offen';
      setAuftraege(all => all.map(a =>
        a.record_id === rid ? { ...a, fields: { ...a.fields, status: lookupOption('auftraege', 'status', oldKey) } } : a
      ));
      await LivingAppsService.updateAuftraegeEntry(rid, { status: oldKey });
    });
    try {
      await LivingAppsService.updateAuftraegeEntry(rid, { status: newColumn });
    } catch {
      await fetchAll();
    }
  }, [auftraege, setAuftraege, AUFTRAG_COLUMNS, fetchAll]);

  // Advance Rechnung to "bezahlt"
  const advanceRechnung = useCallback(async (r: EnrichedRechnungen) => {
    const prev = lookupKey(r.fields.status_rechnung) ?? 'offen';
    setRechnungen(all => all.map(x =>
      x.record_id === r.record_id
        ? { ...x, fields: { ...x.fields, status_rechnung: lookupOption('rechnungen', 'status_rechnung', 'bezahlt') } }
        : x
    ));
    undoToast(tx`${r.fields.rechnungsnummer ?? ''} — als bezahlt markiert`, async () => {
      setRechnungen(all => all.map(x =>
        x.record_id === r.record_id
          ? { ...x, fields: { ...x.fields, status_rechnung: lookupOption('rechnungen', 'status_rechnung', prev) } }
          : x
      ));
      await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: prev });
    });
    try {
      await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: 'bezahlt' });
    } catch {
      await fetchAll();
    }
  }, [setRechnungen, fetchAll]);

  // ─── Every hook goes ABOVE this line ───────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below: plain derivations only, no hooks ────────────────────────────

  const todayKey = format(clock, 'yyyy-MM-dd');

  // KPIs
  const offeneAuftraege = auftraege.filter(a => lookupKey(a.fields.status) === 'offen');
  const inBearbeitung = auftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung');
  const ueberfaelligeRechnungen = enrichedRechnungen.filter(r => {
    const s = lookupKey(r.fields.status_rechnung);
    if (s === 'bezahlt') return false;
    const fd = r.fields.faelligkeitsdatum;
    return fd ? isBefore(parseISO(fd), parseISO(todayKey)) : false;
  });

  // Upcoming inspections (next 30 days)
  const baldInspektion = enrichedJahresinspektionPlanen.filter(i => {
    const w = i.fields.wunschtermin_inspektion;
    if (!w) return false;
    const d = parseISO(w.slice(0, 10));
    return !isBefore(d, parseISO(todayKey)) && !isAfter(d, addDays(parseISO(todayKey), 30));
  }).sort((a, b) => (a.fields.wunschtermin_inspektion ?? '').localeCompare(b.fields.wunschtermin_inspektion ?? ''));

  // Kanban cards
  const cards: KanbanCard[] = enrichedAuftraege
    .filter(a => statusFilter == null || lookupKey(a.fields.status) === statusFilter)
    .sort((a, b) => (a.fields.wunschtermin ?? '').localeCompare(b.fields.wunschtermin ?? ''))
    .map(a => {
      const status = lookupKey(a.fields.status);
      return {
        id: `auftrag:${a.record_id}`,
        column: status ?? AUFTRAG_COLUMNS[0]?.key ?? '',
        title: a.fields.auftragsnummer ?? tx('Auftrag'),
        subtitle: [a.fahrzeugName, a.kundeName].filter(Boolean).join(' · ') || undefined,
        tone: toneForAuftragStatus(status),
      };
    });

  // Context line
  const auftraegeHeute = enrichedAuftraege.filter(a => {
    const w = a.fields.wunschtermin;
    return w ? w.startsWith(todayKey) : false;
  });
  const kundenNamen = namen(auftraegeHeute.map(a => a.kundeName).filter(Boolean));
  const contextLine = auftraegeHeute.length > 0
    ? tx`Heute: ${kundenNamen} — ${String(auftraegeHeute.length)} Auftrag/Aufträge geplant`
    : ueberfaelligeRechnungen.length > 0
    ? tx`${String(ueberfaelligeRechnungen.length)} Rechnung/Rechnungen überfällig — Nachfassen erforderlich`
    : tx('Alle Aufträge und Rechnungen auf dem neuesten Stand.');

  // Hero: überfällige Rechnungen
  const heroRechnung = ueberfaelligeRechnungen[0] ?? null;

  // Aside: überfällige Rechnungen worklist
  const rechnungenWorkItems = ueberfaelligeRechnungen.slice(0, 8).map(r => ({
    id: r.record_id,
    title: r.fields.rechnungsnummer ?? r.kundeName,
    secondLine: (
      <>
        <span className="font-medium text-destructive">{tx('Überfällig')}</span>
        {r.fields.faelligkeitsdatum && (
          <span className="text-muted-foreground"> · {formatDate(r.fields.faelligkeitsdatum)}</span>
        )}
        {r.fields.bruttobetrag != null && (
          <span className="text-muted-foreground"> · {formatCurrency(r.fields.bruttobetrag)}</span>
        )}
      </>
    ),
    action: {
      label: tx('✓ Bezahlt'),
      onClick: () => void advanceRechnung(r),
    },
  }));

  // Aside: upcoming inspections
  const inspektionWorkItems = baldInspektion.slice(0, 5).map(i => ({
    id: i.record_id,
    title: i.fahrzeugName || tx('Fahrzeug'),
    secondLine: (
      <>
        <span className="text-muted-foreground">{tx('Inspektion')}</span>
        {i.fields.wunschtermin_inspektion && (
          <span className="text-muted-foreground"> · {formatDate(i.fields.wunschtermin_inspektion)}</span>
        )}
      </>
    ),
  }));

  // Helper to find enriched record for overlay
  const findAuftrag = (id: string) => enrichedAuftraege.find(a => a.record_id === id);
  const findKunde = (id: string) => kunden.find(k => k.record_id === id);
  const findFahrzeug = (id: string) => enrichedFahrzeuge.find(f => f.record_id === id);
  const findRechnung = (id: string) => enrichedRechnungen.find(r => r.record_id === id);
  const findInspektion = (id: string) => enrichedJahresinspektionPlanen.find(i => i.record_id === id);
  const findPdf = (id: string) => enrichedRechnungsPdfErstellen.find(p => p.record_id === id);

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {gruss(clock)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => { setAuftraegeDefaults(undefined); setEditingAuftrag(null); setAuftraegeDialogOpen(true); }}
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neuer Auftrag')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroRechnung != null && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Als bezahlt markieren'),
              onClick: () => void advanceRechnung(heroRechnung),
            }}
          >
            <b>{namen(ueberfaelligeRechnungen.map(r => r.kundeName).filter(Boolean))}</b>
            {' '}{tx('— Rechnung überfällig seit')}{' '}
            {formatDate(heroRechnung.fields.faelligkeitsdatum)}.{' '}
            {ueberfaelligeRechnungen.length > 1 && tx`+ ${String(ueberfaelligeRechnungen.length - 1)} weitere`}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Offen')}
              value={offeneAuftraege.length}
              icon={<IconClipboardList size={16} className="shrink-0" />}
              tone={offeneAuftraege.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'offen' ? null : 'offen')}
              active={statusFilter === 'offen'}
            />
            <StatStripItem
              title={tx('In Bearbeitung')}
              value={inBearbeitung.length}
              icon={<IconCar size={16} className="shrink-0" />}
              tone={inBearbeitung.length > 0 ? 'primary' : 'default'}
              onClick={() => setStatusFilter(f => f === 'in_bearbeitung' ? null : 'in_bearbeitung')}
              active={statusFilter === 'in_bearbeitung'}
            />
            <StatStripItem
              title={tx('Überfällige Rechnungen')}
              value={ueberfaelligeRechnungen.length}
              icon={<IconReceipt size={16} className="shrink-0" />}
              tone={ueberfaelligeRechnungen.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tx('Inspektionen (30 Tage)')}
              value={baldInspektion.length}
              icon={<IconCalendarTime size={16} className="shrink-0" />}
              tone={baldInspektion.length > 0 ? 'warning' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={AUFTRAG_COLUMNS}
            defaultCollapsed={['abgeschlossen']}
            onCardClick={card => {
              const rid = card.id.split(':')[1] ?? '';
              const a = findAuftrag(rid);
              if (a) overlay.replace({ type: 'auftraege', record: a });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setAuftraegeDefaults({ status: column });
              setEditingAuftrag(null);
              setAuftraegeDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Überfällige Rechnungen')}
              items={rechnungenWorkItems}
              onItemClick={id => {
                const r = findRechnung(id);
                if (r) overlay.replace({ type: 'rechnungen', record: r });
              }}
              empty={{
                text: tx('Keine überfälligen Rechnungen — alles pünktlich bezahlt.'),
                action: {
                  label: tx('Neue Rechnung'),
                  onClick: () => { setRechnungenDefaults(undefined); setEditingRechnung(null); setRechnungenDialogOpen(true); },
                },
              }}
            />
            <WorkList
              title={tx('Anstehende Inspektionen (30 Tage)')}
              items={inspektionWorkItems}
              onItemClick={id => {
                const i = findInspektion(id);
                if (i) overlay.replace({ type: 'jahresinspektion_planen', record: i });
              }}
              empty={{
                text: tx('Keine Inspektionen in den nächsten 30 Tagen geplant.'),
                action: {
                  label: tx('Inspektion planen'),
                  onClick: () => { setInspektionDefaults(undefined); setEditingInspektion(null); setInspektionDialogOpen(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Overlay host — ONE shell per page */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftraege') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fields.auftragsnummer ?? appLabel('auftraege')}
                  subtitle={[r.fahrzeugName, r.kundeName].filter(Boolean).join(' · ') || undefined}
                  badges={r.fields.status ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{r.fields.status.label}</span> : undefined}
                />
                <AuftraegeDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={fz => {
                    const ef = findFahrzeug(fz.record_id);
                    if (ef) overlay.push({ type: 'fahrzeuge', record: ef });
                  }}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rech => {
                    const er = findRechnung(rech.record_id);
                    if (er) overlay.push({ type: 'rechnungen', record: er });
                  }}
                  onAddRechnungen={() => {
                    setRechnungenDefaults({ auftrag: r.record_id, kunde: extractRecordId(r.fields.kunde) ?? undefined });
                    setEditingRechnung(null);
                    setRechnungenDialogOpen(true);
                  }}
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
                  subtitle={r.fields.telefon ?? r.fields.email}
                />
                <KundenDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={fz => {
                    const ef = findFahrzeug(fz.record_id);
                    if (ef) overlay.push({ type: 'fahrzeuge', record: ef });
                  }}
                  onAddFahrzeuge={() => {
                    setFahrzeugeDefaults({ kunde: r.record_id });
                    setEditingFahrzeug(null);
                    setFahrzeugeDialogOpen(true);
                  }}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = findAuftrag(a.record_id);
                    if (ea) overlay.push({ type: 'auftraege', record: ea });
                  }}
                  onAddAuftraege={() => {
                    setAuftraegeDefaults({ kunde: r.record_id });
                    setEditingAuftrag(null);
                    setAuftraegeDialogOpen(true);
                  }}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rech => {
                    const er = findRechnung(rech.record_id);
                    if (er) overlay.push({ type: 'rechnungen', record: er });
                  }}
                  onAddRechnungen={() => {
                    setRechnungenDefaults({ kunde: r.record_id });
                    setEditingRechnung(null);
                    setRechnungenDialogOpen(true);
                  }}
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
                  onOpenAuftraege={a => {
                    const ea = findAuftrag(a.record_id);
                    if (ea) overlay.push({ type: 'auftraege', record: ea });
                  }}
                  onAddAuftraege={() => {
                    setAuftraegeDefaults({ fahrzeug: r.record_id, kunde: extractRecordId(r.fields.kunde) ?? undefined });
                    setEditingAuftrag(null);
                    setAuftraegeDialogOpen(true);
                  }}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => {
                    const ei = findInspektion(i.record_id);
                    if (ei) overlay.push({ type: 'jahresinspektion_planen', record: ei });
                  }}
                  onAddJahresinspektionPlanen={() => {
                    setInspektionDefaults({ fahrzeug: r.record_id });
                    setEditingInspektion(null);
                    setInspektionDialogOpen(true);
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
                  title={r.fields.rechnungsnummer ?? appLabel('rechnungen')}
                  subtitle={r.kundeName || undefined}
                  badges={r.fields.status_rechnung ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{r.fields.status_rechnung.label}</span> : undefined}
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = findAuftrag(a.record_id);
                    if (ea) overlay.push({ type: 'auftraege', record: ea });
                  }}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={p => {
                    const ep = findPdf(p.record_id);
                    if (ep) overlay.push({ type: 'rechnungs_pdf_erstellen', record: ep });
                  }}
                  onAddRechnungsPdfErstellen={() => {
                    setPdfDefaults({ rechnung: r.record_id });
                    setEditingPdf(null);
                    setPdfDialogOpen(true);
                  }}
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
                  onOpenFahrzeuge={fz => {
                    const ef = findFahrzeug(fz.record_id);
                    if (ef) overlay.push({ type: 'fahrzeuge', record: ef });
                  }}
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
                  subtitle={r.rechnungName || undefined}
                />
                <RechnungsPdfErstellenDetails
                  record={r}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rech => {
                    const er = findRechnung(rech.record_id);
                    if (er) overlay.push({ type: 'rechnungen', record: er });
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'auftraege') {
            const r = top.record;
            const statusKey = lookupKey(r.fields.status);
            if (statusKey === 'offen') {
              return {
                label: tx('In Bearbeitung setzen'),
                onClick: () => void moveCard(`auftrag:${r.record_id}`, 'in_bearbeitung'),
              };
            }
            if (statusKey === 'in_bearbeitung') {
              return {
                label: tx('Als abgeschlossen markieren'),
                onClick: () => void moveCard(`auftrag:${r.record_id}`, 'abgeschlossen'),
              };
            }
          }
          if (top.type === 'rechnungen') {
            const r = top.record;
            const statusKey = lookupKey(r.fields.status_rechnung);
            if (statusKey !== 'bezahlt') {
              return {
                label: tx('Als bezahlt markieren'),
                onClick: () => void advanceRechnung(r),
              };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'auftraege') {
            setAuftraegeDefaults(top.record.fields as AuftraegeDialogDefaults);
            setEditingAuftrag(top.record);
            setAuftraegeDialogOpen(true);
          } else if (top.type === 'kunden') {
            setKundenDefaults(top.record.fields as KundenDialogDefaults);
            setEditingKunde(top.record);
            setKundenDialogOpen(true);
          } else if (top.type === 'fahrzeuge') {
            setFahrzeugeDefaults(top.record.fields as FahrzeugeDialogDefaults);
            setEditingFahrzeug(top.record);
            setFahrzeugeDialogOpen(true);
          } else if (top.type === 'rechnungen') {
            setRechnungenDefaults(top.record.fields as RechnungenDialogDefaults);
            setEditingRechnung(top.record);
            setRechnungenDialogOpen(true);
          } else if (top.type === 'jahresinspektion_planen') {
            setInspektionDefaults(top.record.fields as JahresinspektionPlanenDialogDefaults);
            setEditingInspektion(top.record);
            setInspektionDialogOpen(true);
          } else if (top.type === 'rechnungs_pdf_erstellen') {
            setPdfDefaults(top.record.fields as RechnungsPdfErstellenDialogDefaults);
            setEditingPdf(top.record);
            setPdfDialogOpen(true);
          }
        }}
      />

      {/* Dialogs */}
      <KundenDialog
        open={kundenDialogOpen}
        onClose={() => setKundenDialogOpen(false)}
        defaultValues={kundenDefaults}
        recordId={editingKunde?.record_id}
        onSubmit={async fields => {
          if (editingKunde) {
            await LivingAppsService.updateKundenEntry(editingKunde.record_id, fields);
          } else {
            await LivingAppsService.createKundenEntry(fields);
          }
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />

      <FahrzeugeDialog
        open={fahrzeugeDialogOpen}
        onClose={() => setFahrzeugeDialogOpen(false)}
        defaultValues={fahrzeugeDefaults}
        recordId={editingFahrzeug?.record_id}
        kundenList={kunden}
        onSubmit={async fields => {
          if (editingFahrzeug) {
            await LivingAppsService.updateFahrzeugeEntry(editingFahrzeug.record_id, fields);
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
          }
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />

      <AuftraegeDialog
        open={auftraegeDialogOpen}
        onClose={() => setAuftraegeDialogOpen(false)}
        defaultValues={auftraegeDefaults}
        recordId={editingAuftrag?.record_id}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        onSubmit={async fields => {
          if (editingAuftrag) {
            await LivingAppsService.updateAuftraegeEntry(editingAuftrag.record_id, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />

      <RechnungenDialog
        open={rechnungenDialogOpen}
        onClose={() => setRechnungenDialogOpen(false)}
        defaultValues={rechnungenDefaults}
        recordId={editingRechnung?.record_id}
        auftraegeList={auftraege}
        kundenList={kunden}
        onSubmit={async fields => {
          if (editingRechnung) {
            await LivingAppsService.updateRechnungenEntry(editingRechnung.record_id, fields);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
          }
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />

      <JahresinspektionPlanenDialog
        open={inspektionDialogOpen}
        onClose={() => setInspektionDialogOpen(false)}
        defaultValues={inspektionDefaults}
        recordId={editingInspektion?.record_id}
        fahrzeugeList={fahrzeuge}
        onSubmit={async fields => {
          if (editingInspektion) {
            await LivingAppsService.updateJahresinspektionPlanenEntry(editingInspektion.record_id, fields);
          } else {
            await LivingAppsService.createJahresinspektionPlanenEntry(fields);
          }
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />

      <RechnungsPdfErstellenDialog
        open={pdfDialogOpen}
        onClose={() => setPdfDialogOpen(false)}
        defaultValues={pdfDefaults}
        recordId={editingPdf?.record_id}
        rechnungenList={rechnungen}
        onSubmit={async fields => {
          if (editingPdf) {
            await LivingAppsService.updateRechnungsPdfErstellenEntry(editingPdf.record_id, fields);
          } else {
            await LivingAppsService.createRechnungsPdfErstellenEntry(fields);
          }
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['RechnungsPdfErstellen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['RechnungsPdfErstellen']}
      />
    </>
  );
}
