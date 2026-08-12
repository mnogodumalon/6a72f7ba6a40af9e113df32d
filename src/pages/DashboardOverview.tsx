import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedFahrzeuge, EnrichedAuftraege, EnrichedRechnungen, EnrichedJahresinspektionPlanen, EnrichedRechnungsPdfErstellen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import {
  KanbanWidget,
  type KanbanCard,
  type KanbanColumn,
} from '@/components/widgets/KanbanWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
} from '@/components/widgets/RecordView';
import { AuftraegeDetails } from '@/components/details/AuftraegeDetails';
import { FahrzeugeDetails } from '@/components/details/FahrzeugeDetails';
import { KundenDetails } from '@/components/details/KundenDetails';
import { RechnungenDetails } from '@/components/details/RechnungenDetails';
import { JahresinspektionPlanenDetails } from '@/components/details/JahresinspektionPlanenDetails';
import { RechnungsPdfErstellenDetails } from '@/components/details/RechnungsPdfErstellenDetails';
import { AuftraegeDialog } from '@/components/dialogs/AuftraegeDialog';
import { type AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import { FahrzeugeDialog } from '@/components/dialogs/FahrzeugeDialog';
import { type FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import { KundenDialog } from '@/components/dialogs/KundenDialog';
import { RechnungenDialog } from '@/components/dialogs/RechnungenDialog';
import { type RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import { JahresinspektionPlanenDialog } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { type JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { RechnungsPdfErstellenDialog } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import { type RechnungsPdfErstellenDialogDefaults } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import { format, isAfter, isBefore, startOfDay, parseISO } from 'date-fns';
import { IconAlertCircle, IconPlus, IconCar, IconClipboardList, IconReceipt, IconCalendarStats } from '@tabler/icons-react';

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
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [auftraegeDialogOpen, setAuftraegeDialogOpen] = useState(false);
  const [auftraegeDefaults, setAuftraegeDefaults] = useState<AuftraegeDialogDefaults | undefined>(undefined);
  const [auftraegeEditId, setAuftraegeEditId] = useState<string | undefined>(undefined);

  const [fahrzeugeDialogOpen, setFahrzeugeDialogOpen] = useState(false);
  const [fahrzeugeDefaults, setFahrzeugeDefaults] = useState<FahrzeugeDialogDefaults | undefined>(undefined);
  const [fahrzeugeEditId, setFahrzeugeEditId] = useState<string | undefined>(undefined);

  const [kundenDialogOpen, setKundenDialogOpen] = useState(false);

  const [rechnungenDialogOpen, setRechnungenDialogOpen] = useState(false);
  const [rechnungenDefaults, setRechnungenDefaults] = useState<RechnungenDialogDefaults | undefined>(undefined);
  const [rechnungenEditId, setRechnungenEditId] = useState<string | undefined>(undefined);

  const [inspektionDialogOpen, setInspektionDialogOpen] = useState(false);
  const [inspektionDefaults, setInspektionDefaults] = useState<JahresinspektionPlanenDialogDefaults | undefined>(undefined);
  const [inspektionEditId, setInspektionEditId] = useState<string | undefined>(undefined);

  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfDefaults, setPdfDefaults] = useState<RechnungsPdfErstellenDialogDefaults | undefined>(undefined);
  const [pdfEditId, setPdfEditId] = useState<string | undefined>(undefined);

  // Status filter
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Rechnungen status advance: Offen → Bezahlt (must be above early returns)
  const advanceRechnung = useCallback(async (r: EnrichedRechnungen) => {
    const prevKey = lookupKey(r.fields.status_rechnung);
    if (prevKey === 'bezahlt') return;
    setRechnungen(prev =>
      prev.map(rec =>
        rec.record_id === r.record_id
          ? { ...rec, fields: { ...rec.fields, status_rechnung: lookupOption('rechnungen', 'status_rechnung', 'bezahlt') } }
          : rec
      )
    );
    undoToast(
      tx`${r.fields.rechnungsnummer ?? ''} — als bezahlt markiert`,
      () => {
        setRechnungen(prev =>
          prev.map(rec =>
            rec.record_id === r.record_id
              ? { ...rec, fields: { ...rec.fields, status_rechnung: prevKey ? lookupOption('rechnungen', 'status_rechnung', prevKey) : undefined } }
              : rec
          )
        );
        LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: prevKey ?? undefined }).catch(() => fetchAll());
      }
    );
    try {
      await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: 'bezahlt' });
    } catch {
      fetchAll();
    }
  }, [setRechnungen, fetchAll]);

  // ─── All hooks above this line ───────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Plain derivations below ─────────────────────────────────────────────

  const enrichedFahrzeuge = enrichFahrzeuge(fahrzeuge, { kundenMap });
  const enrichedAuftraege = enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap });
  const enrichedRechnungen = enrichRechnungen(rechnungen, { auftraegeMap, kundenMap });
  const enrichedJahresinspektionPlanen = enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap });
  const enrichedRechnungsPdfErstellen = enrichRechnungsPdfErstellen(rechnungsPdfErstellen, { rechnungenMap });

  const today = startOfDay(clock);
  const todayStr = format(clock, 'yyyy-MM-dd');

  // Kanban columns from schema
  const COLUMNS: KanbanColumn[] = (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label }));

  // Cards for kanban
  const cards: KanbanCard[] = enrichedAuftraege
    .filter(a => !statusFilter || lookupKey(a.fields.status) === statusFilter)
    .sort((a, b) => {
      const da = a.fields.wunschtermin ?? '';
      const db = b.fields.wunschtermin ?? '';
      return da.localeCompare(db);
    })
    .map(a => {
      const st = lookupKey(a.fields.status);
      const tone =
        st === 'abgeschlossen' ? 'default' :
        st === 'in_bearbeitung' ? 'success' :
        'warning';
      return {
        id: `auftrag:${a.record_id}`,
        column: st ?? COLUMNS[0]?.key ?? '',
        title: a.kundeName || a.fahrzeugName || tx('Ohne Angabe'),
        subtitle: [a.fahrzeugName, a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : null].filter(Boolean).join(' · '),
        tone,
      };
    });

  // Kanban move handler
  const moveCard = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const prev = auftraege.find(a => a.record_id === rid);
    const prevStatus = lookupKey(prev?.fields.status);
    if (prevStatus === newColumn) return;
    // Optimistic update
    setAuftraege(prev2 =>
      prev2.map(a =>
        a.record_id === rid
          ? { ...a, fields: { ...a.fields, status: lookupOption('auftraege', 'status', newColumn) } }
          : a
      )
    );
    const col = COLUMNS.find(c => c.key === newColumn);
    undoToast(
      tx`Auftrag → ${col?.label ?? newColumn}`,
      () => {
        setAuftraege(prev2 =>
          prev2.map(a =>
            a.record_id === rid
              ? { ...a, fields: { ...a.fields, status: prevStatus ? lookupOption('auftraege', 'status', prevStatus) : undefined } }
              : a
          )
        );
        LivingAppsService.updateAuftraegeEntry(rid, { status: prevStatus ?? undefined }).catch(() => fetchAll());
      }
    );
    try {
      await LivingAppsService.updateAuftraegeEntry(rid, { status: newColumn });
    } catch {
      fetchAll();
    }
  };

  // Open/overdue invoices
  const offeneRechnungen = enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) !== 'bezahlt');
  const ueberfaelligeRechnungen = offeneRechnungen.filter(r => {
    if (!r.fields.faelligkeitsdatum) return false;
    try { return isBefore(parseISO(r.fields.faelligkeitsdatum), today); } catch { return false; }
  });

  // Upcoming inspections (next 30 days)
  const naechsteInspektionen = enrichedJahresinspektionPlanen
    .filter(i => {
      if (!i.fields.wunschtermin_inspektion) return false;
      try {
        const d = parseISO(i.fields.wunschtermin_inspektion);
        return isAfter(d, today);
      } catch { return false; }
    })
    .sort((a, b) => (a.fields.wunschtermin_inspektion ?? '').localeCompare(b.fields.wunschtermin_inspektion ?? ''));

  // Context greeting
  const offeneAuftraege = enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'offen');
  const inBearbeitung = enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung');
  const ctxKunden = offeneAuftraege.map(a => a.kundeName).filter(Boolean);
  const ctxLine = offeneAuftraege.length > 0
    ? tx`${namen(ctxKunden)} ${offeneAuftraege.length === 1 ? tx('wartet auf Bearbeitung') : tx('warten auf Bearbeitung')}`
    : inBearbeitung.length > 0
    ? tx`${inBearbeitung.length} ${tx('Aufträge in Bearbeitung')}`
    : tx('Alles erledigt — super!');

  // Hero: overdue invoices
  const heroRechnung = ueberfaelligeRechnungen[0];

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {gruss(clock)} {tx('Werkstatt-Manager')} {/* i18n-exempt: app name */}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{ctxLine}</p>
        </div>
        <div className="flex shrink-0 gap-2 flex-wrap">
          <button
            onClick={() => { setAuftraegeDefaults(undefined); setAuftraegeEditId(undefined); setAuftraegeDialogOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <IconPlus size={16} className="shrink-0" />
            {tx('Neuer Auftrag')}
          </button>
          <button
            onClick={() => { setKundenDialogOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <IconPlus size={16} className="shrink-0" />
            {tx('Kunde')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroRechnung != null && (
          <HeroBanner
            icon={<IconAlertCircle size={18} />}
            action={{
              label: tx('Als bezahlt markieren'),
              onClick: () => advanceRechnung(heroRechnung),
            }}
          >
            <b>{namen(ueberfaelligeRechnungen.map(r => r.kundeName).filter(Boolean))}</b>
            {' '}{tx('— Rechnung überfällig seit')}{' '}
            {formatDate(heroRechnung.fields.faelligkeitsdatum)}.
            {ueberfaelligeRechnungen.length > 1 && (
              <>{' '}{tx`+ ${ueberfaelligeRechnungen.length - 1} weitere`}</>
            )}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Offen')}
              value={offeneAuftraege.length}
              icon={<IconClipboardList size={16} />}
              tone={offeneAuftraege.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'offen' ? null : 'offen')}
              active={statusFilter === 'offen'}
            />
            <StatStripItem
              title={tx('In Bearbeitung')}
              value={inBearbeitung.length}
              icon={<IconCar size={16} />}
              tone={inBearbeitung.length > 0 ? 'primary' : 'default'}
              onClick={() => setStatusFilter(f => f === 'in_bearbeitung' ? null : 'in_bearbeitung')}
              active={statusFilter === 'in_bearbeitung'}
            />
            <StatStripItem
              title={tx('Offene Rechnungen')}
              value={offeneRechnungen.length}
              icon={<IconReceipt size={16} />}
              tone={ueberfaelligeRechnungen.length > 0 ? 'destructive' : offeneRechnungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Fahrzeuge')}
              value={fahrzeuge.length}
              icon={<IconCar size={16} />}
              tone="default"
            />
            <StatStripItem
              title={tx('Inspektionen')}
              value={naechsteInspektionen.length}
              icon={<IconCalendarStats size={16} />}
              tone={naechsteInspektionen.length > 0 ? 'primary' : 'default'}
              onClick={() => { setInspektionDefaults(undefined); setInspektionDialogOpen(true); }}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={statusFilter
              ? cards
              : enrichedAuftraege
                  .sort((a, b) => (a.fields.wunschtermin ?? '').localeCompare(b.fields.wunschtermin ?? ''))
                  .map(a => {
                    const st = lookupKey(a.fields.status);
                    const tone =
                      st === 'abgeschlossen' ? 'default' :
                      st === 'in_bearbeitung' ? 'success' :
                      'warning';
                    return {
                      id: `auftrag:${a.record_id}`,
                      column: st ?? COLUMNS[0]?.key ?? '',
                      title: a.kundeName || a.fahrzeugName || tx('Ohne Angabe'),
                      subtitle: [a.fahrzeugName, a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : null].filter(Boolean).join(' · '),
                      tone,
                    } as KanbanCard;
                  })}
            columns={COLUMNS}
            defaultCollapsed={['abgeschlossen']}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              const found = enrichedAuftraege.find(a => a.record_id === rid);
              if (found) overlay.replace({ type: 'auftraege', record: found });
            }}
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
              title={tx('Offene Rechnungen')}
              items={offeneRechnungen
                .sort((a, b) => (a.fields.faelligkeitsdatum ?? '').localeCompare(b.fields.faelligkeitsdatum ?? ''))
                .slice(0, 8)
                .map(r => {
                  const isUeberfaellig = ueberfaelligeRechnungen.some(u => u.record_id === r.record_id);
                  return {
                    id: r.record_id,
                    title: r.kundeName || r.fields.rechnungsnummer || tx('Rechnung'),
                    secondLine: (
                      <>
                        <span className={isUeberfaellig ? 'font-medium text-destructive' : 'font-medium text-warning-foreground'}>
                          {isUeberfaellig ? tx('Überfällig') : tx('Offen')}
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
                      label: tx('✓ Bezahlt'),
                      onClick: () => advanceRechnung(r),
                    },
                  };
                })}
              onItemClick={id => {
                const found = enrichedRechnungen.find(r => r.record_id === id);
                if (found) overlay.replace({ type: 'rechnungen', record: found });
              }}
              empty={{
                text: tx('Alle Rechnungen bezahlt — super!'),
                action: {
                  label: tx('Neue Rechnung'),
                  onClick: () => { setRechnungenDefaults(undefined); setRechnungenEditId(undefined); setRechnungenDialogOpen(true); },
                },
              }}
            />

            <WorkList
              title={tx('Nächste Inspektionen')}
              items={naechsteInspektionen.slice(0, 5).map(i => ({
                id: i.record_id,
                title: i.fahrzeugName || tx('Fahrzeug'),
                secondLine: (
                  <>
                    <span className="text-muted-foreground">
                      {formatDate(i.fields.wunschtermin_inspektion)}
                    </span>
                    {i.fields.arbeitsbeschreibung_inspektion && (
                      <span className="text-muted-foreground"> · {i.fields.arbeitsbeschreibung_inspektion.slice(0, 40)}</span>
                    )}
                  </>
                ),
              }))}
              onItemClick={id => {
                const found = enrichedJahresinspektionPlanen.find(i => i.record_id === id);
                if (found) overlay.replace({ type: 'jahresinspektion_planen', record: found });
              }}
              empty={{
                text: tx('Keine Inspektionen geplant'),
                action: {
                  label: tx('Inspektion planen'),
                  onClick: () => { setInspektionDefaults(undefined); setInspektionEditId(undefined); setInspektionDialogOpen(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Dialogs */}
      <AuftraegeDialog
        open={auftraegeDialogOpen}
        onClose={() => setAuftraegeDialogOpen(false)}
        onSubmit={async (fields) => {
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

      <FahrzeugeDialog
        open={fahrzeugeDialogOpen}
        onClose={() => setFahrzeugeDialogOpen(false)}
        onSubmit={async (fields) => {
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

      <KundenDialog
        open={kundenDialogOpen}
        onClose={() => setKundenDialogOpen(false)}
        onSubmit={async (fields) => {
          await LivingAppsService.createKundenEntry(fields);
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />

      <RechnungenDialog
        open={rechnungenDialogOpen}
        onClose={() => setRechnungenDialogOpen(false)}
        onSubmit={async (fields) => {
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

      <JahresinspektionPlanenDialog
        open={inspektionDialogOpen}
        onClose={() => setInspektionDialogOpen(false)}
        onSubmit={async (fields) => {
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

      <RechnungsPdfErstellenDialog
        open={pdfDialogOpen}
        onClose={() => setPdfDialogOpen(false)}
        onSubmit={async (fields) => {
          if (pdfEditId) {
            await LivingAppsService.updateRechnungsPdfErstellenEntry(pdfEditId, fields);
          } else {
            await LivingAppsService.createRechnungsPdfErstellenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={pdfDefaults}
        recordId={pdfEditId}
        rechnungenList={rechnungen}
        enablePhotoScan={AI_PHOTO_SCAN['RechnungsPdfErstellen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['RechnungsPdfErstellen']}
      />

      {/* Record Overlay Host */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftraege') {
            const r = top.record as EnrichedAuftraege;
            return (
              <>
                <RecordHeader
                  title={r.kundeName || r.fahrzeugName || appLabel('auftraege')}
                  subtitle={r.fields.status?.label}
                  meta={r.fields.auftragsnummer ? <span className="text-xs text-muted-foreground">{r.fields.auftragsnummer}</span> : undefined}
                />
                <AuftraegeDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeuge', record: enrichedFahrzeuge.find(ef => ef.record_id === f.record_id) ?? { ...f, kundeName: '' } })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rec => overlay.push({ type: 'rechnungen', record: enrichedRechnungen.find(er => er.record_id === rec.record_id) ?? { ...rec, auftragName: '', kundeName: '' } })}
                  onAddRechnungen={() => {
                    setRechnungenDefaults({ auftrag: r.record_id, kunde: extractRecordId(r.fields.kunde) ?? undefined });
                    setRechnungenEditId(undefined);
                    setRechnungenDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'fahrzeuge') {
            const r = top.record as EnrichedFahrzeuge;
            return (
              <>
                <RecordHeader
                  title={[r.fields.marke, r.fields.modell].filter(Boolean).join(' ') || r.fields.kennzeichen || appLabel('fahrzeuge')}
                  subtitle={r.fields.kennzeichen}
                />
                <FahrzeugeDetails
                  record={r}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftraege', record: enrichedAuftraege.find(ea => ea.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onAddAuftraege={() => {
                    setAuftraegeDefaults({ fahrzeug: r.record_id });
                    setAuftraegeEditId(undefined);
                    setAuftraegeDialogOpen(true);
                  }}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => overlay.push({ type: 'jahresinspektion_planen', record: enrichedJahresinspektionPlanen.find(ei => ei.record_id === i.record_id) ?? { ...i, fahrzeugName: '' } })}
                  onAddJahresinspektionPlanen={() => {
                    setInspektionDefaults({ fahrzeug: r.record_id });
                    setInspektionEditId(undefined);
                    setInspektionDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunden') {
            const r = top.record as Kunden;
            return (
              <>
                <RecordHeader
                  title={[r.fields.vorname, r.fields.nachname].filter(Boolean).join(' ') || appLabel('kunden')}
                  subtitle={r.fields.email ?? r.fields.telefon}
                />
                <KundenDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeuge', record: enrichedFahrzeuge.find(ef => ef.record_id === f.record_id) ?? { ...f, kundeName: '' } })}
                  onAddFahrzeuge={() => {
                    setFahrzeugeDefaults({ kunde: r.record_id });
                    setFahrzeugeEditId(undefined);
                    setFahrzeugeDialogOpen(true);
                  }}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftraege', record: enrichedAuftraege.find(ea => ea.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onAddAuftraege={() => {
                    setAuftraegeDefaults({ kunde: r.record_id });
                    setAuftraegeEditId(undefined);
                    setAuftraegeDialogOpen(true);
                  }}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rec => overlay.push({ type: 'rechnungen', record: enrichedRechnungen.find(er => er.record_id === rec.record_id) ?? { ...rec, auftragName: '', kundeName: '' } })}
                  onAddRechnungen={() => {
                    setRechnungenDefaults({ kunde: r.record_id });
                    setRechnungenEditId(undefined);
                    setRechnungenDialogOpen(true);
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
                  title={r.fields.rechnungsnummer || appLabel('rechnungen')}
                  subtitle={r.kundeName}
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftraege', record: enrichedAuftraege.find(ea => ea.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={pdf => overlay.push({ type: 'rechnungs_pdf_erstellen', record: enrichedRechnungsPdfErstellen.find(ep => ep.record_id === pdf.record_id) ?? { ...pdf, rechnungName: '' } })}
                  onAddRechnungsPdfErstellen={() => {
                    setPdfDefaults({ rechnung: r.record_id });
                    setPdfEditId(undefined);
                    setPdfDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'jahresinspektion_planen') {
            const r = top.record as EnrichedJahresinspektionPlanen;
            return (
              <>
                <RecordHeader
                  title={r.fahrzeugName || appLabel('jahresinspektion_planen')}
                  subtitle={formatDate(r.fields.wunschtermin_inspektion)}
                />
                <JahresinspektionPlanenDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeuge', record: enrichedFahrzeuge.find(ef => ef.record_id === f.record_id) ?? { ...f, kundeName: '' } })}
                />
              </>
            );
          }
          if (top.type === 'rechnungs_pdf_erstellen') {
            const r = top.record as EnrichedRechnungsPdfErstellen;
            return (
              <>
                <RecordHeader
                  title={r.fields.pdf_rechnungsnummer || appLabel('rechnungs_pdf_erstellen')}
                  subtitle={[r.fields.pdf_kunde_vorname, r.fields.pdf_kunde_nachname].filter(Boolean).join(' ')}
                />
                <RechnungsPdfErstellenDetails
                  record={r}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rec => overlay.push({ type: 'rechnungen', record: enrichedRechnungen.find(er => er.record_id === rec.record_id) ?? { ...rec, auftragName: '', kundeName: '' } })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'auftraege') {
            const r = top.record as EnrichedAuftraege;
            const st = lookupKey(r.fields.status);
            if (st === 'offen') {
              return {
                label: tx('→ In Bearbeitung'),
                onClick: () => moveCard(`auftrag:${r.record_id}`, 'in_bearbeitung'),
              };
            }
            if (st === 'in_bearbeitung') {
              return {
                label: tx('✓ Abschließen'),
                onClick: () => moveCard(`auftrag:${r.record_id}`, 'abgeschlossen'),
              };
            }
          }
          if (top.type === 'rechnungen') {
            const r = top.record as EnrichedRechnungen;
            if (lookupKey(r.fields.status_rechnung) !== 'bezahlt') {
              return {
                label: tx('✓ Als bezahlt markieren'),
                onClick: () => advanceRechnung(r),
              };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'auftraege') {
            const r = top.record as EnrichedAuftraege;
            setAuftraegeDefaults(r.fields as AuftraegeDialogDefaults);
            setAuftraegeEditId(r.record_id);
            setAuftraegeDialogOpen(true);
          } else if (top.type === 'fahrzeuge') {
            const r = top.record as EnrichedFahrzeuge;
            setFahrzeugeDefaults(r.fields as FahrzeugeDialogDefaults);
            setFahrzeugeEditId(r.record_id);
            setFahrzeugeDialogOpen(true);
          } else if (top.type === 'rechnungen') {
            const r = top.record as EnrichedRechnungen;
            setRechnungenDefaults(r.fields as RechnungenDialogDefaults);
            setRechnungenEditId(r.record_id);
            setRechnungenDialogOpen(true);
          } else if (top.type === 'jahresinspektion_planen') {
            const r = top.record as EnrichedJahresinspektionPlanen;
            setInspektionDefaults(r.fields as JahresinspektionPlanenDialogDefaults);
            setInspektionEditId(r.record_id);
            setInspektionDialogOpen(true);
          } else if (top.type === 'rechnungs_pdf_erstellen') {
            const r = top.record as EnrichedRechnungsPdfErstellen;
            setPdfDefaults(r.fields as RechnungsPdfErstellenDialogDefaults);
            setPdfEditId(r.record_id);
            setPdfDialogOpen(true);
          }
        }}
      />
    </>
  );
}
