import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedFahrzeuge, EnrichedAuftraege, EnrichedRechnungen, EnrichedJahresinspektionPlanen, EnrichedRechnungsPdfErstellen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { useMemo, useState, useCallback } from 'react';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import {
  KanbanWidget,
  type KanbanCard,
  type KanbanColumn,
  type KanbanTone,
} from '@/components/widgets/KanbanWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
  RecordOverlay,
} from '@/components/widgets/RecordView';
import { AuftraegeDetails } from '@/components/details/AuftraegeDetails';
import { KundenDetails } from '@/components/details/KundenDetails';
import { FahrzeugeDetails } from '@/components/details/FahrzeugeDetails';
import { RechnungenDetails } from '@/components/details/RechnungenDetails';
import { JahresinspektionPlanenDetails } from '@/components/details/JahresinspektionPlanenDetails';
import { RechnungsPdfErstellenDetails } from '@/components/details/RechnungsPdfErstellenDetails';
import { AuftraegeDialog, type AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import { KundenDialog } from '@/components/dialogs/KundenDialog';
import { FahrzeugeDialog, type FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import { RechnungenDialog, type RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import { JahresinspektionPlanenDialog, type JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { IconAlertCircle, IconCar, IconClipboardList, IconReceipt, IconPlus, IconCheck } from '@tabler/icons-react';
import { format, parseISO, isBefore, isToday, startOfDay } from 'date-fns';

export type OverlayItem =
  | { type: 'kunden'; record: Kunden }
  | { type: 'fahrzeuge'; record: EnrichedFahrzeuge }
  | { type: 'auftraege'; record: EnrichedAuftraege }
  | { type: 'rechnungen'; record: EnrichedRechnungen }
  | { type: 'jahresinspektion_planen'; record: EnrichedJahresinspektionPlanen }
  | { type: 'rechnungs_pdf_erstellen'; record: EnrichedRechnungsPdfErstellen };

function toneForAuftragStatus(status: string | undefined): KanbanTone {
  if (status === 'abgeschlossen') return 'success';
  if (status === 'in_bearbeitung') return 'primary';
  return 'warning';
}

function toneForRechnungStatus(status: string | undefined): KanbanTone {
  if (status === 'bezahlt') return 'success';
  if (status === 'ueberfaellig') return 'destructive';
  return 'warning';
}

export default function DashboardOverview() {
  const {
    kunden, setKunden, fahrzeuge, setFahrzeuge, auftraege, setAuftraege,
    rechnungen, setRechnungen, jahresinspektionPlanen, rechnungsPdfErstellen,
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

  // Dialog-States
  const [auftragDialogOpen, setAuftragDialogOpen] = useState(false);
  const [auftragDefaults, setAuftragDefaults] = useState<AuftraegeDialogDefaults | undefined>();
  const [editAuftrag, setEditAuftrag] = useState<EnrichedAuftraege | null>(null);

  const [kundeDialogOpen, setKundeDialogOpen] = useState(false);

  const [fahrzeugDialogOpen, setFahrzeugDialogOpen] = useState(false);
  const [fahrzeugDefaults, setFahrzeugDefaults] = useState<FahrzeugeDialogDefaults | undefined>();

  const [rechnungDialogOpen, setRechnungDialogOpen] = useState(false);
  const [rechnungDefaults, setRechnungDefaults] = useState<RechnungenDialogDefaults | undefined>();

  const [inspDialogOpen, setInspDialogOpen] = useState(false);
  const [inspDefaults, setInspDefaults] = useState<JahresinspektionPlanenDialogDefaults | undefined>();

  // Status-Filter
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Kanban-Spalten aus LOOKUP_OPTIONS
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Aufträge → KanbanCards
  const cards = useMemo<KanbanCard[]>(
    () => enrichedAuftraege.map(a => {
      const status = lookupKey(a.fields.status) ?? COLUMNS[0]?.key ?? '';
      const prioritaet = lookupKey(a.fields.prioritaet);
      const priorityLabel = prioritaet === 'hoch' ? ' ⚡' : '';
      return {
        id: `auftrag:${a.record_id}`,
        column: status,
        title: `${a.fields.auftragsnummer ?? tx('Auftrag')}${priorityLabel}`,
        subtitle: [a.kundeName || a.fahrzeugName, a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : ''].filter(Boolean).join(' · ') || undefined,
        tone: toneForAuftragStatus(status),
      };
    }),
    [enrichedAuftraege, COLUMNS],
  );

  // Heute fällige + überfällige Aufträge
  const heute = format(clock, 'yyyy-MM-dd');
  const faelligeAuftraege = useMemo(() =>
    enrichedAuftraege
      .filter(a => {
        if (!a.fields.wunschtermin) return false;
        const day = a.fields.wunschtermin.slice(0, 10);
        return day <= heute && lookupKey(a.fields.status) !== 'abgeschlossen';
      })
      .sort((a, b) => (a.fields.wunschtermin ?? '').localeCompare(b.fields.wunschtermin ?? '')),
    [enrichedAuftraege, heute],
  );

  // Überfällige Rechnungen
  const ueberfaelligeRechnungen = useMemo(() =>
    enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'ueberfaellig'),
    [enrichedRechnungen],
  );

  // KPI-Zahlen
  const offeneAuftraege = useMemo(() => auftraege.filter(a => lookupKey(a.fields.status) === 'offen').length, [auftraege]);
  const inBearbeitung = useMemo(() => auftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung').length, [auftraege]);
  const offeneRechnungen = useMemo(() => rechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'offen').length, [rechnungen]);
  const gesamtUmsatz = useMemo(() => rechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'bezahlt').reduce((s, r) => s + (r.fields.bruttobetrag ?? 0), 0), [rechnungen]);

  // Auftrag status weiterschalten
  const advanceAuftrag = useCallback(async (auftrag: EnrichedAuftraege) => {
    const currentStatus = lookupKey(auftrag.fields.status) ?? 'offen';
    const nextStatus = currentStatus === 'offen' ? 'in_bearbeitung' : currentStatus === 'in_bearbeitung' ? 'abgeschlossen' : null;
    if (!nextStatus) return;
    const snapshot = auftraege.map(a => a);
    setAuftraege(prev => prev.map(a =>
      a.record_id === auftrag.record_id
        ? { ...a, fields: { ...a.fields, status: lookupOption('auftraege', 'status', nextStatus) } }
        : a,
    ));
    const nextLabel = LOOKUP_OPTIONS['auftraege']?.['status']?.find(o => o.key === nextStatus)?.label ?? nextStatus;
    undoToast(tx`${auftrag.fields.auftragsnummer ?? tx('Auftrag')} → ${nextLabel}`, async () => {
      setAuftraege(snapshot);
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: currentStatus }).catch(() => fetchAll());
    });
    try {
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: nextStatus });
    } catch {
      await fetchAll();
    }
  }, [auftraege, setAuftraege, fetchAll, LOOKUP_OPTIONS]);

  // Rechnung als bezahlt markieren
  const markRechnungBezahlt = useCallback(async (rechnung: EnrichedRechnungen) => {
    const snapshot = rechnungen.map(r => r);
    setRechnungen(prev => prev.map(r =>
      r.record_id === rechnung.record_id
        ? { ...r, fields: { ...r.fields, status_rechnung: lookupOption('rechnungen', 'status_rechnung', 'bezahlt') } }
        : r,
    ));
    undoToast(tx`${rechnung.fields.rechnungsnummer ?? tx('Rechnung')} — ${tx('als bezahlt markiert')}`, async () => {
      setRechnungen(snapshot);
      await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: 'ueberfaellig' }).catch(() => fetchAll());
    });
    try {
      await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: 'bezahlt' });
    } catch {
      await fetchAll();
    }
  }, [rechnungen, setRechnungen, fetchAll]);

  // Karte-bewegen handler
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const auftrag = auftraege.find(a => a.record_id === rid);
    if (!auftrag) return;
    const oldStatus = lookupKey(auftrag.fields.status) ?? 'offen';
    const snapshot = auftraege.map(a => a);
    setAuftraege(prev => prev.map(a =>
      a.record_id === rid
        ? { ...a, fields: { ...a.fields, status: lookupOption('auftraege', 'status', newColumn) } }
        : a,
    ));
    const newLabel = LOOKUP_OPTIONS['auftraege']?.['status']?.find(o => o.key === newColumn)?.label ?? newColumn;
    undoToast(tx`${auftrag.fields.auftragsnummer ?? tx('Auftrag')} → ${newLabel}`, async () => {
      setAuftraege(snapshot);
      await LivingAppsService.updateAuftraegeEntry(rid, { status: oldStatus }).catch(() => fetchAll());
    });
    try {
      await LivingAppsService.updateAuftraegeEntry(rid, { status: newColumn });
    } catch {
      await fetchAll();
    }
  }, [auftraege, setAuftraege, fetchAll, LOOKUP_OPTIONS]);

  // ─── Every hook goes ABOVE this line ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below this line: plain derivations only ───

  const contextLine = (() => {
    const heute_auftraege = faelligeAuftraege.filter(a => a.fields.wunschtermin?.slice(0, 10) === heute);
    const kundenHeute = heute_auftraege.map(a => a.kundeName).filter(Boolean);
    if (kundenHeute.length > 0) {
      return tx`Heute: ${namen(kundenHeute)} ${tx('im Terminbuch')}`;
    }
    if (faelligeAuftraege.length > 0) {
      return tx`${namen(faelligeAuftraege.map(a => a.kundeName))} ${tx('warten auf ihre Fahrzeuge')}`;
    }
    if (auftraege.length === 0) {
      return tx('Noch keine Aufträge – lege den ersten an.');
    }
    return tx('Alle Aufträge im grünen Bereich.');
  })();

  // Hero: überfällige Rechnungen
  const hero = ueberfaelligeRechnungen.length > 0 ? (
    <HeroBanner
      icon={<IconAlertCircle size={18} />}
      action={{
        label: tx('Als bezahlt markieren'),
        onClick: () => markRechnungBezahlt(ueberfaelligeRechnungen[0]),
      }}
    >
      <b>{namen(ueberfaelligeRechnungen.map(r => r.kundeName))}</b>
      {' — '}
      {ueberfaelligeRechnungen.length === 1
        ? tx`Rechnung ${ueberfaelligeRechnungen[0].fields.rechnungsnummer ?? ''} ${tx('ist überfällig')}`
        : tx`${ueberfaelligeRechnungen.length} ${tx('Rechnungen sind überfällig')}`}
    </HeroBanner>
  ) : undefined;

  // Leerer State
  if (auftraege.length === 0 && kunden.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="rounded-2xl bg-primary/10 p-5">
          <IconCar size={48} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{tx('Werkstatt einrichten')}</h2>
          <p className="text-muted-foreground mt-1">{tx('Leg den ersten Kunden oder Auftrag an, um loszulegen.')}</p>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => setKundeDialogOpen(true)}
          >
            <IconPlus size={16} /> {tx('Ersten Kunden anlegen')}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium"
            onClick={() => { setAuftragDefaults(undefined); setEditAuftrag(null); setAuftragDialogOpen(true); }}
          >
            <IconClipboardList size={16} /> {tx('Ersten Auftrag erstellen')}
          </button>
        </div>
        <KundenDialog
          open={kundeDialogOpen}
          onClose={() => setKundeDialogOpen(false)}
          onSubmit={async (fields) => { await LivingAppsService.createKundenEntry(fields); fetchAll(); }}
          enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
        />
        <AuftraegeDialog
          open={auftragDialogOpen}
          onClose={() => setAuftragDialogOpen(false)}
          onSubmit={async (fields) => { await LivingAppsService.createAuftraegeEntry(fields); fetchAll(); }}
          fahrzeugeList={fahrzeuge}
          kundenList={kunden}
          enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
        />
      </div>
    );
  }

  const kpis = (
    <StatStrip>
      <StatStripItem
        title={tx('Offen')}
        value={offeneAuftraege}
        icon={<IconClipboardList size={16} className="shrink-0" />}
        tone={offeneAuftraege > 5 ? 'warning' : 'default'}
        onClick={() => setStatusFilter(f => f === 'offen' ? null : 'offen')}
        active={statusFilter === 'offen'}
      />
      <StatStripItem
        title={tx('In Bearbeitung')}
        value={inBearbeitung}
        icon={<IconCar size={16} className="shrink-0" />}
        tone={inBearbeitung > 0 ? 'primary' : 'default'}
        onClick={() => setStatusFilter(f => f === 'in_bearbeitung' ? null : 'in_bearbeitung')}
        active={statusFilter === 'in_bearbeitung'}
      />
      <StatStripItem
        title={tx('Offene Rechnungen')}
        value={offeneRechnungen}
        icon={<IconReceipt size={16} className="shrink-0" />}
        tone={ueberfaelligeRechnungen.length > 0 ? 'destructive' : offeneRechnungen > 0 ? 'warning' : 'default'}
      />
      <StatStripItem
        title={tx('Umsatz bezahlt')}
        value={formatCurrency(gesamtUmsatz)}
        tone={gesamtUmsatz > 0 ? 'success' : 'default'}
      />
    </StatStrip>
  );

  // Gefilterte Karten
  const filteredCards = statusFilter ? cards.filter(c => c.column === statusFilter) : cards;

  const primary = (
    <KanbanWidget
      cards={filteredCards}
      columns={COLUMNS}
      defaultCollapsed={['abgeschlossen']}
      onCardClick={card => {
        const rid = card.id.split(':')[1];
        const a = enrichedAuftraege.find(x => x.record_id === rid);
        if (a) overlay.replace({ type: 'auftraege', record: a });
      }}
      onCardMove={moveCard}
      onAddCard={column => {
        setAuftragDefaults({ status: column });
        setEditAuftrag(null);
        setAuftragDialogOpen(true);
      }}
    />
  );

  const aside = (
    <>
      <WorkList
        title={tx('Fällig & überfällig')}
        items={faelligeAuftraege.slice(0, 8).map(a => {
          const isOverdue = (a.fields.wunschtermin?.slice(0, 10) ?? '') < heute;
          const statusKey = lookupKey(a.fields.status) ?? 'offen';
          const nextStatus = statusKey === 'offen' ? 'in_bearbeitung' : statusKey === 'in_bearbeitung' ? 'abgeschlossen' : null;
          const nextLabel = nextStatus === 'in_bearbeitung' ? tx('Starten') : nextStatus === 'abgeschlossen' ? tx('Abschließen') : null;
          return {
            id: a.record_id,
            title: `${a.fields.auftragsnummer ?? tx('Auftrag')} — ${a.kundeName || a.fahrzeugName || '—'}`,
            secondLine: (
              <>
                <span className={`font-medium ${isOverdue ? 'text-destructive' : 'text-warning'}`}>
                  {isOverdue ? tx('Überfällig') : tx('Heute')}
                </span>
                <span className="text-muted-foreground"> · {a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : '—'}</span>
              </>
            ),
            action: nextLabel && nextStatus ? {
              label: nextLabel,
              onClick: () => advanceAuftrag(a),
            } : undefined,
          };
        })}
        onItemClick={id => {
          const a = enrichedAuftraege.find(x => x.record_id === id);
          if (a) overlay.replace({ type: 'auftraege', record: a });
        }}
        empty={{
          text: tx('Alles im Zeitplan — keine fälligen Aufträge'),
          action: { label: tx('Neuer Auftrag'), onClick: () => { setAuftragDefaults(undefined); setEditAuftrag(null); setAuftragDialogOpen(true); } },
        }}
      />
      <WorkList
        title={tx('Überfällige Rechnungen')}
        items={ueberfaelligeRechnungen.slice(0, 5).map(r => ({
          id: r.record_id,
          title: `${r.fields.rechnungsnummer ?? tx('Rechnung')} — ${r.kundeName || '—'}`,
          secondLine: (
            <>
              <span className="font-medium text-destructive">{tx('Überfällig')}</span>
              <span className="text-muted-foreground"> · {r.fields.faelligkeitsdatum ? formatDate(r.fields.faelligkeitsdatum) : '—'}</span>
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
          text: tx('Keine überfälligen Rechnungen'),
          action: { label: tx('Neue Rechnung'), onClick: () => { setRechnungDefaults(undefined); setRechnungDialogOpen(true); } },
        }}
      />
    </>
  );

  return (
    <>
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
            <p className="text-muted-foreground mt-1">{contextLine}</p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shrink-0"
            onClick={() => { setAuftragDefaults(undefined); setEditAuftrag(null); setAuftragDialogOpen(true); }}
          >
            <IconPlus size={16} className="shrink-0" /> {tx('Neuer Auftrag')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={hero}
        kpis={kpis}
        primary={primary}
        aside={aside}
      />

      {/* Dialoge */}
      <AuftraegeDialog
        open={auftragDialogOpen}
        onClose={() => { setAuftragDialogOpen(false); setEditAuftrag(null); }}
        onSubmit={async (fields) => {
          if (editAuftrag) {
            await LivingAppsService.updateAuftraegeEntry(editAuftrag.record_id, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editAuftrag?.fields ?? auftragDefaults}
        recordId={editAuftrag?.record_id}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />
      <KundenDialog
        open={kundeDialogOpen}
        onClose={() => setKundeDialogOpen(false)}
        onSubmit={async (fields) => { await LivingAppsService.createKundenEntry(fields); fetchAll(); }}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />
      <FahrzeugeDialog
        open={fahrzeugDialogOpen}
        onClose={() => setFahrzeugDialogOpen(false)}
        onSubmit={async (fields) => { await LivingAppsService.createFahrzeugeEntry(fields); fetchAll(); }}
        defaultValues={fahrzeugDefaults}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />
      <RechnungenDialog
        open={rechnungDialogOpen}
        onClose={() => setRechnungDialogOpen(false)}
        onSubmit={async (fields) => { await LivingAppsService.createRechnungenEntry(fields); fetchAll(); }}
        defaultValues={rechnungDefaults}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />
      <JahresinspektionPlanenDialog
        open={inspDialogOpen}
        onClose={() => setInspDialogOpen(false)}
        onSubmit={async (fields) => { await LivingAppsService.createJahresinspektionPlanenEntry(fields); fetchAll(); }}
        defaultValues={inspDefaults}
        fahrzeugeList={fahrzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />

      {/* Overlay-Stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftraege') {
            const a = top.record as EnrichedAuftraege;
            const statusKey = lookupKey(a.fields.status) ?? 'offen';
            const nextStatus = statusKey === 'offen' ? 'in_bearbeitung' : statusKey === 'in_bearbeitung' ? 'abgeschlossen' : null;
            const nextLabel = nextStatus === 'in_bearbeitung' ? tx('In Bearbeitung setzen') : nextStatus === 'abgeschlossen' ? tx('Abschließen') : null;
            return (
              <>
                <RecordHeader
                  title={a.fields.auftragsnummer ?? appLabel('auftraege')}
                  subtitle={[a.kundeName, a.fahrzeugName].filter(Boolean).join(' · ') || undefined}
                />
                <AuftraegeDetails
                  record={a}
                  fahrzeugeList={fahrzeuge}
                  kundenList={kunden}
                  rechnungenList={rechnungen}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeuge', record: enrichedFahrzeuge.find(x => x.record_id === f.record_id) ?? { ...f, kundeName: '' } })}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnungen', record: enrichedRechnungen.find(x => x.record_id === r.record_id) ?? { ...r, auftragName: '', kundeName: '' } })}
                  onAddRechnungen={() => {
                    setRechnungDefaults({ auftrag: a.record_id, kunde: extractRecordId(a.fields.kunde) ?? undefined });
                    setRechnungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunden') {
            const k = top.record as Kunden;
            return (
              <>
                <RecordHeader
                  title={[k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || appLabel('kunden')}
                  subtitle={k.fields.telefon ?? k.fields.email}
                />
                <KundenDetails
                  record={k}
                  fahrzeugeList={fahrzeuge}
                  auftraegeList={auftraege}
                  rechnungenList={rechnungen}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeuge', record: enrichedFahrzeuge.find(x => x.record_id === f.record_id) ?? { ...f, kundeName: '' } })}
                  onOpenAuftraege={a => overlay.push({ type: 'auftraege', record: enrichedAuftraege.find(x => x.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnungen', record: enrichedRechnungen.find(x => x.record_id === r.record_id) ?? { ...r, auftragName: '', kundeName: '' } })}
                  onAddFahrzeuge={() => {
                    setFahrzeugDefaults({ kunde: k.record_id });
                    setFahrzeugDialogOpen(true);
                  }}
                  onAddAuftraege={() => {
                    setAuftragDefaults({ kunde: k.record_id });
                    setEditAuftrag(null);
                    setAuftragDialogOpen(true);
                  }}
                  onAddRechnungen={() => {
                    setRechnungDefaults({ kunde: k.record_id });
                    setRechnungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'fahrzeuge') {
            const f = top.record as EnrichedFahrzeuge;
            return (
              <>
                <RecordHeader
                  title={f.fields.kennzeichen ?? appLabel('fahrzeuge')}
                  subtitle={[f.fields.marke, f.fields.modell].filter(Boolean).join(' ') || f.kundeName || undefined}
                />
                <FahrzeugeDetails
                  record={f}
                  kundenList={kunden}
                  auftraegeList={auftraege}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  onOpenAuftraege={a => overlay.push({ type: 'auftraege', record: enrichedAuftraege.find(x => x.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onOpenJahresinspektionPlanen={j => overlay.push({ type: 'jahresinspektion_planen', record: enrichedJahresinspektionPlanen.find(x => x.record_id === j.record_id) ?? { ...j, fahrzeugName: '' } })}
                  onAddAuftraege={() => {
                    setAuftragDefaults({ fahrzeug: f.record_id, kunde: extractRecordId(f.fields.kunde) ?? undefined });
                    setEditAuftrag(null);
                    setAuftragDialogOpen(true);
                  }}
                  onAddJahresinspektionPlanen={() => {
                    setInspDefaults({ fahrzeug: f.record_id });
                    setInspDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'rechnungen') {
            const r = top.record as EnrichedRechnungen;
            return (
              <>
                <RecordHeader
                  title={r.fields.rechnungsnummer ?? appLabel('rechnungen')}
                  subtitle={r.kundeName || r.auftragName || undefined}
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  kundenList={kunden}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenAuftraege={a => overlay.push({ type: 'auftraege', record: enrichedAuftraege.find(x => x.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  onOpenRechnungsPdfErstellen={p => overlay.push({ type: 'rechnungs_pdf_erstellen', record: enrichedRechnungsPdfErstellen.find(x => x.record_id === p.record_id) ?? { ...p, rechnungName: '' } })}
                  onAddRechnungsPdfErstellen={() => {
                    overlay.close();
                  }}
                />
              </>
            );
          }
          if (top.type === 'jahresinspektion_planen') {
            const j = top.record as EnrichedJahresinspektionPlanen;
            return (
              <>
                <RecordHeader
                  title={j.fahrzeugName || appLabel('jahresinspektion_planen')}
                  subtitle={j.fields.wunschtermin_inspektion ? formatDate(j.fields.wunschtermin_inspektion) : undefined}
                />
                <JahresinspektionPlanenDetails
                  record={j}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeuge', record: enrichedFahrzeuge.find(x => x.record_id === f.record_id) ?? { ...f, kundeName: '' } })}
                />
              </>
            );
          }
          if (top.type === 'rechnungs_pdf_erstellen') {
            const p = top.record as EnrichedRechnungsPdfErstellen;
            return (
              <>
                <RecordHeader
                  title={p.fields.pdf_rechnungsnummer ?? appLabel('rechnungs_pdf_erstellen')}
                  subtitle={p.rechnungName || undefined}
                />
                <RechnungsPdfErstellenDetails
                  record={p}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnungen', record: enrichedRechnungen.find(x => x.record_id === r.record_id) ?? { ...r, auftragName: '', kundeName: '' } })}
                />
              </>
            );
          }
          return null;
        }}
        onEdit={top => {
          if (top.type === 'auftraege') {
            const a = top.record as EnrichedAuftraege;
            setEditAuftrag(a);
            setAuftragDefaults(undefined);
            setAuftragDialogOpen(true);
          }
        }}
        footer={top => {
          if (top.type === 'auftraege') {
            const a = top.record as EnrichedAuftraege;
            const statusKey = lookupKey(a.fields.status) ?? 'offen';
            const nextStatus = statusKey === 'offen' ? 'in_bearbeitung' : statusKey === 'in_bearbeitung' ? 'abgeschlossen' : null;
            const nextLabel = nextStatus === 'in_bearbeitung' ? tx('In Bearbeitung setzen') : nextStatus === 'abgeschlossen' ? tx('Abschließen') : null;
            if (nextLabel && nextStatus) {
              return {
                label: nextLabel,
                onClick: () => advanceAuftrag(a),
              };
            }
          }
          if (top.type === 'rechnungen') {
            const r = top.record as EnrichedRechnungen;
            if (lookupKey(r.fields.status_rechnung) === 'ueberfaellig' || lookupKey(r.fields.status_rechnung) === 'offen') {
              return {
                label: tx('Als bezahlt markieren'),
                onClick: () => markRechnungBezahlt(r),
              };
            }
          }
          return undefined;
        }}
      />
    </>
  );
}
