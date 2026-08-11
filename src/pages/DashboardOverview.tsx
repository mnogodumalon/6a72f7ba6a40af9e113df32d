import { useState, useMemo, useCallback } from 'react';
import { format, isAfter, isBefore, startOfDay, endOfDay, parseISO } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedAuftraege, EnrichedRechnungen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { lookupKey, formatDate, formatCurrency } from '@/lib/formatters';
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
  RecordAttachments,
} from '@/components/widgets/RecordView';
import { AuftraegeDetails } from '@/components/details/AuftraegeDetails';
import { FahrzeugeDetails } from '@/components/details/FahrzeugeDetails';
import { KundenDetails } from '@/components/details/KundenDetails';
import { RechnungenDetails } from '@/components/details/RechnungenDetails';
import { JahresinspektionPlanenDetails } from '@/components/details/JahresinspektionPlanenDetails';
import { RechnungsPdfErstellenDetails } from '@/components/details/RechnungsPdfErstellenDetails';
import { AuftraegeDialog, type AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import { FahrzeugeDialog, type FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import { KundenDialog, type KundenDialogDefaults } from '@/components/dialogs/KundenDialog';
import { RechnungenDialog, type RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import { JahresinspektionPlanenDialog, type JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { makeT } from '@/i18n';
import {
  IconAlertTriangle,
  IconPlus,
  IconReceipt,
  IconTool,
  IconCar,
  IconUsers,
  IconCalendarEvent,
  IconCheck,
} from '@tabler/icons-react';

// ─── i18n ────────────────────────────────────────────────────────────────────
const tt = makeT({
  de: {
    auftraege_heute: 'Heute fällig',
    ueberfallig_rechnung: 'Überfällige Rechnungen',
    neuer_auftrag: 'Neuer Auftrag',
    inspektion_heute: 'Inspektionen heute',
    kein_auftrag: 'Alles erledigt — nächster Wunschtermin',
    kein_inspektion: 'Keine Inspektionen heute geplant',
    offen: 'Offen',
    in_bearbeitung: 'In Bearbeitung',
    abgeschlossen: 'Abgeschlossen',
    auftraege_offen: 'Aufträge offen',
    auftraege_aktiv: 'In Bearbeitung',
    ueberfaellig: 'Rechnungen überfällig',
    umsatz_monat: 'Umsatz (Brutto)',
    auftrag_abschliessen: 'Als abgeschlossen markieren',
    rechnung_bezahlt: 'Als bezahlt markieren',
    hero_msg: '{n} überfällige {n, plural, one {Rechnung} other {Rechnungen}}',
    hero_btn: 'Rechnung öffnen',
    context_auftraege: '{n} {n, plural, one {Auftrag} other {Aufträge}} offen',
    context_inspektionen: '{n} {n, plural, one {Inspektion} other {Inspektionen}} heute',
    keine_daten: 'Noch keine Aufträge — Werkstatt einrichten',
    ersten_auftrag: 'Ersten Auftrag anlegen',
    alles_ruhig: 'Alles ruhig heute — keine dringenden Aufträge.',
    onboarding_hint: 'Kunden, Fahrzeuge und Aufträge anlegen, um loszulegen.',
    in_bearbeitung_btn: '→ In Bearbeitung',
  },
  en: {
    auftraege_heute: 'Due today',
    ueberfallig_rechnung: 'Overdue invoices',
    neuer_auftrag: 'New order',
    inspektion_heute: 'Inspections today',
    kein_auftrag: 'All done — next appointment',
    kein_inspektion: 'No inspections scheduled today',
    offen: 'Open',
    in_bearbeitung: 'In Progress',
    abgeschlossen: 'Completed',
    auftraege_offen: 'Orders open',
    auftraege_aktiv: 'In progress',
    ueberfaellig: 'Invoices overdue',
    umsatz_monat: 'Revenue (gross)',
    auftrag_abschliessen: 'Mark as completed',
    rechnung_bezahlt: 'Mark as paid',
    hero_msg: '{n} overdue {n, plural, one {invoice} other {invoices}}',
    hero_btn: 'Open invoice',
    context_auftraege: '{n} {n, plural, one {order} other {orders}} open',
    context_inspektionen: '{n} {n, plural, one {inspection} other {inspections}} today',
    keine_daten: 'No orders yet — set up your workshop',
    ersten_auftrag: 'Create first order',
    alles_ruhig: 'All quiet today — no urgent orders.',
    onboarding_hint: 'Add customers, vehicles and orders to get started.',
    in_bearbeitung_btn: '→ In Progress',
  },
});

// Key-only base — safe at module scope (no locale-aware label reads)
const AUFTRAG_STATUS_KEYS = (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => o.key);

function toneForAuftrag(status: string | undefined, prioritaet: string | undefined): KanbanTone {
  if (status === 'abgeschlossen') return 'success';
  if (status === 'in_bearbeitung') return 'primary';
  if (prioritaet === 'hoch') return 'warning';
  return 'default';
}

// ─── Overlay item union ───────────────────────────────────────────────────────
type OverlayItem =
  | { type: 'auftrag'; id: string }
  | { type: 'fahrzeug'; id: string }
  | { type: 'kunde'; id: string }
  | { type: 'rechnung'; id: string }
  | { type: 'inspektion'; id: string }
  | { type: 'pdf'; id: string };

export default function DashboardOverview() {
  const {
    kunden, fahrzeuge, auftraege, rechnungen, jahresinspektionPlanen, rechnungsPdfErstellen,
    kundenMap, fahrzeugeMap, auftraegeMap, rechnungenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();

  // Locale-aware labels built inside component (locale-aware getters)
  const AUFTRAG_COLUMNS: KanbanColumn[] = useMemo(
    () => (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const enrichedFahrzeuge = enrichFahrzeuge(fahrzeuge, { kundenMap });
  const enrichedAuftraege = enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap });
  const enrichedRechnungen = enrichRechnungen(rechnungen, { auftraegeMap, kundenMap });
  const enrichedJahresinspektionPlanen = enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap });
  const enrichedRechnungsPdfErstellen = enrichRechnungsPdfErstellen(rechnungsPdfErstellen, { rechnungenMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [auftragDialog, setAuftragDialog] = useState<{ open: boolean; defaults?: AuftraegeDialogDefaults; recordId?: string }>({ open: false });
  const [fahrzeugDialog, setFahrzeugDialog] = useState<{ open: boolean; defaults?: FahrzeugeDialogDefaults; recordId?: string }>({ open: false });
  const [kundeDialog, setKundeDialog] = useState<{ open: boolean; defaults?: KundenDialogDefaults; recordId?: string }>({ open: false });
  const [rechnungDialog, setRechnungDialog] = useState<{ open: boolean; defaults?: RechnungenDialogDefaults; recordId?: string }>({ open: false });
  const [inspektionDialog, setInspektionDialog] = useState<{ open: boolean; defaults?: JahresinspektionPlanenDialogDefaults; recordId?: string }>({ open: false });

  // ─── Derived data ─────────────────────────────────────────────────────────
  const today = format(clock, 'yyyy-MM-dd');
  const todayStart = startOfDay(clock);
  const todayEnd = endOfDay(clock);

  const auftraegeOffen = useMemo(
    () => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'offen'),
    [enrichedAuftraege],
  );
  const auftraegeAktiv = useMemo(
    () => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung'),
    [enrichedAuftraege],
  );

  const auftraegeFaelligHeute = useMemo(
    () =>
      enrichedAuftraege.filter(a => {
        if (!a.fields.wunschtermin) return false;
        const d = parseISO(a.fields.wunschtermin);
        return !isBefore(d, todayStart) && !isAfter(d, todayEnd);
      }),
    [enrichedAuftraege, todayStart, todayEnd],
  );

  const rechnungenUeberfaellig = useMemo(
    () =>
      enrichedRechnungen.filter(r => {
        const key = lookupKey(r.fields.status_rechnung);
        if (key === 'bezahlt') return false;
        if (r.fields.faelligkeitsdatum && r.fields.faelligkeitsdatum < today) return true;
        return key === 'ueberfaellig';
      }),
    [enrichedRechnungen, today],
  );

  const inspektionenHeute = useMemo(
    () =>
      enrichedJahresinspektionPlanen.filter(i => {
        if (!i.fields.wunschtermin_inspektion) return false;
        const d = parseISO(i.fields.wunschtermin_inspektion);
        return !isBefore(d, todayStart) && !isAfter(d, todayEnd);
      }),
    [enrichedJahresinspektionPlanen, todayStart, todayEnd],
  );

  const umsatzMonat = useMemo(() => {
    const monthStart = format(clock, 'yyyy-MM-01');
    return rechnungen
      .filter(r => lookupKey(r.fields.status_rechnung) === 'bezahlt' && r.fields.rechnungsdatum && r.fields.rechnungsdatum >= monthStart)
      .reduce((sum, r) => sum + (r.fields.bruttobetrag ?? 0), 0);
  }, [rechnungen, clock]);

  // ─── Kanban cards ─────────────────────────────────────────────────────────
  const kanbanCards = useMemo<KanbanCard[]>(
    () =>
      enrichedAuftraege.map(a => {
        const status = lookupKey(a.fields.status) ?? AUFTRAG_COLUMNS[0]?.key ?? '';
        return {
          id: `auftrag:${a.record_id}`,
          column: status,
          title: `${a.fahrzeugName}${a.kundeName ? ` · ${a.kundeName}` : ''}`,
          subtitle: a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : a.fields.arbeitsbeschreibung?.slice(0, 60),
          tone: toneForAuftrag(status, lookupKey(a.fields.prioritaet)),
        };
      }),
    [enrichedAuftraege],
  );

  // ─── Write helpers ────────────────────────────────────────────────────────
  const advanceAuftrag = useCallback(
    async (a: EnrichedAuftraege, toStatus: string) => {
      const label = AUFTRAG_COLUMNS.find(c => c.key === toStatus)?.label ?? toStatus;
      const prev = a.fields.status;
      // Optimistic
      fetchAll(); // we do a full re-fetch; for Kanban the local patch is done in moveCard
      try {
        await LivingAppsService.updateAuftraegeEntry(a.record_id, { status: toStatus });
        await fetchAll();
        undoToast(`Auftrag → ${label}`, async () => {
          await LivingAppsService.updateAuftraegeEntry(a.record_id, { status: prev?.key ?? 'offen' });
          await fetchAll();
        });
      } catch {
        await fetchAll();
      }
    },
    [fetchAll],
  );

  const markRechnungBezahlt = useCallback(
    async (r: EnrichedRechnungen) => {
      const prev = r.fields.status_rechnung;
      try {
        await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: 'bezahlt' });
        await fetchAll();
        undoToast(tt('rechnung_bezahlt'), async () => {
          await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: prev?.key ?? 'offen' });
          await fetchAll();
        });
      } catch {
        await fetchAll();
      }
    },
    [fetchAll],
  );

  const moveCard = useCallback(
    async (cardId: string, newColumn: string) => {
      const rid = cardId.split(':')[1];
      if (!rid) return;
      const label = AUFTRAG_COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
      const a = auftraege.find(x => x.record_id === rid);
      if (!a) return;
      const prevKey = lookupKey(a.fields.status) ?? 'offen';
      // Optimistic local patch
      try {
        await LivingAppsService.updateAuftraegeEntry(rid, { status: newColumn });
        await fetchAll();
        undoToast(`→ ${label}`, async () => {
          await LivingAppsService.updateAuftraegeEntry(rid, { status: prevKey });
          await fetchAll();
        });
      } catch {
        await fetchAll();
      }
    },
    [auftraege, fetchAll],
  );

  // ─── Early returns (hooks all done above) ─────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ─── Context line ─────────────────────────────────────────────────────────
  const contextLine = (() => {
    const parts: string[] = [];
    if (auftraegeOffen.length > 0) parts.push(tt('context_auftraege', { n: auftraegeOffen.length }));
    if (inspektionenHeute.length > 0) parts.push(tt('context_inspektionen', { n: inspektionenHeute.length }));
    if (parts.length === 0 && auftraegeAktiv.length > 0) return `${auftraegeAktiv.length} Aufträge in Bearbeitung.`;
    if (parts.length === 0) return tt('alles_ruhig');
    const names = auftraegeFaelligHeute.map(a => a.kundeName ?? a.fahrzeugName ?? '').filter(Boolean);
    return parts.join(', ') + (names.length > 0 ? ` — ${namen(names)} heute fällig.` : '.');
  })();

  // ─── Hero: overdue invoices ───────────────────────────────────────────────
  const heroRechnung = rechnungenUeberfaellig[0];

  // ─── Empty state ──────────────────────────────────────────────────────────
  if (auftraege.length === 0 && kunden.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
        <IconTool size={48} className="text-muted-foreground" stroke={1.5} />
        <div>
          <h2 className="text-lg font-semibold">{tt('keine_daten')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{tt('onboarding_hint')}</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => setAuftragDialog({ open: true })}
        >
          <IconPlus size={16} className="shrink-0" />
          {tt('ersten_auftrag')}
        </button>
        <AuftraegeDialog
          open={auftragDialog.open}
          onClose={() => setAuftragDialog({ open: false })}
          onSubmit={async (fields) => { await LivingAppsService.createAuftraegeEntry(fields); await fetchAll(); }}
          fahrzeugeList={fahrzeuge}
          kundenList={kunden}
          enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
        />
      </div>
    );
  }

  // ─── Overlay render helper ────────────────────────────────────────────────
  const overlayFindAuftrag = (id: string) => enrichedAuftraege.find(a => a.record_id === id);
  const overlayFindFahrzeug = (id: string) => fahrzeuge.find(f => f.record_id === id);
  const overlayFindKunde = (id: string) => kunden.find(k => k.record_id === id);
  const overlayFindRechnung = (id: string) => enrichedRechnungen.find(r => r.record_id === id);
  const overlayFindInspektion = (id: string) => jahresinspektionPlanen.find(i => i.record_id === id);
  const overlayFindPdf = (id: string) => rechnungsPdfErstellen.find(p => p.record_id === id);

  return (
    <>
      {/* ─── Page header ────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
          onClick={() => setAuftragDialog({ open: true })}
        >
          <IconPlus size={16} className="shrink-0" />
          {tt('neuer_auftrag')}
        </button>
      </div>

      {/* ─── Dashboard grid ─────────────────────────────────────────────── */}
      <DashboardGrid
        variant="wide"
        hero={
          heroRechnung ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tt('hero_btn'),
                onClick: () => overlay.replace({ type: 'rechnung', id: heroRechnung.record_id }),
              }}
            >
              <b>{rechnungenUeberfaellig.length} überfällige {rechnungenUeberfaellig.length === 1 ? 'Rechnung' : 'Rechnungen'}</b>
              {rechnungenUeberfaellig[0] && ` — ${rechnungenUeberfaellig[0].kundeName ?? rechnungenUeberfaellig[0].fields.rechnungsnummer} fällig seit ${formatDate(rechnungenUeberfaellig[0].fields.faelligkeitsdatum)}`}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('auftraege_offen')}
              value={auftraegeOffen.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={auftraegeOffen.length > 5 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('auftraege_aktiv')}
              value={auftraegeAktiv.length}
              icon={<IconCar size={16} className="shrink-0" />}
              tone={auftraegeAktiv.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('ueberfaellig')}
              value={rechnungenUeberfaellig.length}
              icon={<IconReceipt size={16} className="shrink-0" />}
              tone={rechnungenUeberfaellig.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tt('umsatz_monat')}
              value={formatCurrency(umsatzMonat)}
              icon={<IconCheck size={16} className="shrink-0" />}
              tone="success"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={kanbanCards}
            columns={AUFTRAG_COLUMNS}
            defaultCollapsed={['abgeschlossen']}
            onCardClick={card => overlay.replace({ type: 'auftrag', id: card.id.split(':')[1] ?? '' })}
            onCardMove={moveCard}
            onAddCard={column => setAuftragDialog({ open: true, defaults: { status: column } })}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('auftraege_heute')}
              items={auftraegeFaelligHeute.map(a => ({
                id: a.record_id,
                title: a.kundeName ?? a.fahrzeugName ?? a.fields.auftragsnummer ?? '—',
                secondLine: (
                  <>
                    <span className="text-muted-foreground">{a.fahrzeugName}</span>
                    {a.fields.wunschtermin && (
                      <span className="text-muted-foreground"> · {formatDate(a.fields.wunschtermin)}</span>
                    )}
                  </>
                ),
                action: lookupKey(a.fields.status) !== 'abgeschlossen'
                  ? {
                      label: '✓',
                      onClick: () => void advanceAuftrag(a, lookupKey(a.fields.status) === 'offen' ? 'in_bearbeitung' : 'abgeschlossen'),
                    }
                  : undefined,
              }))}
              onItemClick={id => overlay.replace({ type: 'auftrag', id })}
              empty={{
                text: tt('kein_auftrag'),
                action: { label: tt('neuer_auftrag'), onClick: () => setAuftragDialog({ open: true }) },
              }}
            />
            <WorkList
              title={tt('inspektion_heute')}
              items={inspektionenHeute.map(i => {
                const f = fahrzeugeMap.get(extractRecordId(i.fields.fahrzeug) ?? '');
                return {
                  id: i.record_id,
                  title: f?.fields.kennzeichen ?? '—',
                  secondLine: (
                    <span className="text-muted-foreground">
                      {f ? `${f.fields.marke ?? ''} ${f.fields.modell ?? ''}`.trim() : ''}
                      {i.fields.wunschtermin_inspektion ? ` · ${formatDate(i.fields.wunschtermin_inspektion)}` : ''}
                    </span>
                  ),
                };
              })}
              onItemClick={id => overlay.replace({ type: 'inspektion', id })}
              empty={{
                text: tt('kein_inspektion'),
                action: { label: tt('neuer_auftrag'), onClick: () => setInspektionDialog({ open: true }) },
              }}
            />
          </>
        }
      />

      {/* ─── Overlay host ────────────────────────────────────────────────── */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftrag') {
            const a = overlayFindAuftrag(top.id);
            if (!a) return null;
            return (
              <>
                <RecordHeader
                  title={a.fields.auftragsnummer ?? a.kundeName ?? '—'}
                  subtitle={a.fields.status?.label}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      lookupKey(a.fields.prioritaet) === 'hoch'
                        ? 'bg-destructive/10 text-destructive'
                        : lookupKey(a.fields.prioritaet) === 'normal'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {a.fields.prioritaet?.label ?? 'Normal'}
                    </span>
                  }
                />
                <AuftraegeDetails
                  record={a}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', id: f.record_id })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnung', id: r.record_id })}
                  onAddRechnungen={() => setRechnungDialog({ open: true, defaults: { auftrag: a.record_id, kunde: extractRecordId(a.fields.kunde) ?? undefined } })}
                />
              </>
            );
          }
          if (top.type === 'fahrzeug') {
            const f = overlayFindFahrzeug(top.id);
            if (!f) return null;
            return (
              <>
                <RecordHeader
                  title={f.fields.kennzeichen ?? '—'}
                  subtitle={[f.fields.marke, f.fields.modell, f.fields.baujahr].filter(Boolean).join(' ')}
                />
                <FahrzeugeDetails
                  record={f}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  onAddAuftraege={() => setAuftragDialog({ open: true, defaults: { fahrzeug: f.record_id } })}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => overlay.push({ type: 'inspektion', id: i.record_id })}
                  onAddJahresinspektionPlanen={() => setInspektionDialog({ open: true, defaults: { fahrzeug: f.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = overlayFindKunde(top.id);
            if (!k) return null;
            return (
              <>
                <RecordHeader
                  title={[k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || '—'}
                  subtitle={[k.fields.email, k.fields.telefon].filter(Boolean).join(' · ')}
                />
                <KundenDetails
                  record={k}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', id: f.record_id })}
                  onAddFahrzeuge={() => setFahrzeugDialog({ open: true, defaults: { kunde: k.record_id } })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  onAddAuftraege={() => setAuftragDialog({ open: true, defaults: { kunde: k.record_id } })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnung', id: r.record_id })}
                  onAddRechnungen={() => setRechnungDialog({ open: true, defaults: { kunde: k.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'rechnung') {
            const r = overlayFindRechnung(top.id);
            if (!r) return null;
            return (
              <>
                <RecordHeader
                  title={r.fields.rechnungsnummer ?? '—'}
                  subtitle={r.fields.status_rechnung?.label}
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={p => overlay.push({ type: 'pdf', id: p.record_id })}
                  onAddRechnungsPdfErstellen={() => setRechnungDialog({ open: true, defaults: { rechnung: r.record_id } as any })}
                />
              </>
            );
          }
          if (top.type === 'inspektion') {
            const i = overlayFindInspektion(top.id);
            if (!i) return null;
            const f = fahrzeugeMap.get(extractRecordId(i.fields.fahrzeug) ?? '');
            return (
              <>
                <RecordHeader
                  title={f?.fields.kennzeichen ?? '—'}
                  subtitle={formatDate(i.fields.wunschtermin_inspektion)}
                />
                <JahresinspektionPlanenDetails
                  record={i}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={fv => overlay.push({ type: 'fahrzeug', id: fv.record_id })}
                />
              </>
            );
          }
          if (top.type === 'pdf') {
            const p = overlayFindPdf(top.id);
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
            const a = overlayFindAuftrag(top.id);
            if (!a) return undefined;
            const status = lookupKey(a.fields.status);
            if (status === 'offen') return { label: tt('in_bearbeitung_btn'), onClick: () => void advanceAuftrag(a, 'in_bearbeitung') };
            if (status === 'in_bearbeitung') return { label: tt('auftrag_abschliessen'), onClick: () => void advanceAuftrag(a, 'abgeschlossen') };
          }
          if (top.type === 'rechnung') {
            const r = overlayFindRechnung(top.id);
            if (!r) return undefined;
            if (lookupKey(r.fields.status_rechnung) !== 'bezahlt') {
              return { label: tt('rechnung_bezahlt'), onClick: () => void markRechnungBezahlt(r) };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'auftrag') {
            const a = overlayFindAuftrag(top.id);
            if (a) setAuftragDialog({ open: true, defaults: a.fields as any, recordId: a.record_id });
          } else if (top.type === 'fahrzeug') {
            const f = overlayFindFahrzeug(top.id);
            if (f) setFahrzeugDialog({ open: true, defaults: f.fields as any, recordId: f.record_id });
          } else if (top.type === 'kunde') {
            const k = overlayFindKunde(top.id);
            if (k) setKundeDialog({ open: true, defaults: k.fields as any, recordId: k.record_id });
          } else if (top.type === 'rechnung') {
            const r = overlayFindRechnung(top.id);
            if (r) setRechnungDialog({ open: true, defaults: r.fields as any, recordId: r.record_id });
          } else if (top.type === 'inspektion') {
            const i = overlayFindInspektion(top.id);
            if (i) setInspektionDialog({ open: true, defaults: i.fields as any, recordId: i.record_id });
          }
        }}
      />

      {/* ─── Dialogs ─────────────────────────────────────────────────────── */}
      <AuftraegeDialog
        open={auftragDialog.open}
        onClose={() => setAuftragDialog({ open: false })}
        onSubmit={async (fields) => {
          if (auftragDialog.recordId) {
            await LivingAppsService.updateAuftraegeEntry(auftragDialog.recordId, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={auftragDialog.defaults}
        recordId={auftragDialog.recordId}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />
      <FahrzeugeDialog
        open={fahrzeugDialog.open}
        onClose={() => setFahrzeugDialog({ open: false })}
        onSubmit={async (fields) => {
          if (fahrzeugDialog.recordId) {
            await LivingAppsService.updateFahrzeugeEntry(fahrzeugDialog.recordId, fields);
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={fahrzeugDialog.defaults}
        recordId={fahrzeugDialog.recordId}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />
      <KundenDialog
        open={kundeDialog.open}
        onClose={() => setKundeDialog({ open: false })}
        onSubmit={async (fields) => {
          if (kundeDialog.recordId) {
            await LivingAppsService.updateKundenEntry(kundeDialog.recordId, fields);
          } else {
            await LivingAppsService.createKundenEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={kundeDialog.defaults}
        recordId={kundeDialog.recordId}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />
      <RechnungenDialog
        open={rechnungDialog.open}
        onClose={() => setRechnungDialog({ open: false })}
        onSubmit={async (fields) => {
          if (rechnungDialog.recordId) {
            await LivingAppsService.updateRechnungenEntry(rechnungDialog.recordId, fields);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={rechnungDialog.defaults}
        recordId={rechnungDialog.recordId}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />
      <JahresinspektionPlanenDialog
        open={inspektionDialog.open}
        onClose={() => setInspektionDialog({ open: false })}
        onSubmit={async (fields) => {
          if (inspektionDialog.recordId) {
            await LivingAppsService.updateJahresinspektionPlanenEntry(inspektionDialog.recordId, fields);
          } else {
            await LivingAppsService.createJahresinspektionPlanenEntry(fields);
          }
          await fetchAll();
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
