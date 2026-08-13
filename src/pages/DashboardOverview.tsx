import { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedFahrzeuge, EnrichedAuftraege, EnrichedRechnungen, EnrichedJahresinspektionPlanen, EnrichedRechnungsPdfErstellen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import {
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
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
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import type { AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import type { RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import type { FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import type { JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconAlertTriangle,
  IconTools,
  IconFileInvoice,
  IconCar,
  IconCalendarCheck,
  IconPlus,
  IconCheck,
} from '@tabler/icons-react';

export type OverlayItem =
  | { type: 'kunden'; record: Kunden }
  | { type: 'fahrzeuge'; record: EnrichedFahrzeuge }
  | { type: 'auftraege'; record: EnrichedAuftraege }
  | { type: 'rechnungen'; record: EnrichedRechnungen }
  | { type: 'jahresinspektion_planen'; record: EnrichedJahresinspektionPlanen }
  | { type: 'rechnungs_pdf_erstellen'; record: EnrichedRechnungsPdfErstellen };

function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'abgeschlossen') return 'success';
  if (status === 'in_bearbeitung') return 'primary';
  return 'warning';
}

function toneForRechnung(status: string | undefined): KanbanTone {
  if (status === 'ueberfaellig') return 'destructive';
  if (status === 'bezahlt') return 'success';
  return 'warning';
}

export default function DashboardOverview() {
  const {
    kunden, fahrzeuge, auftraege, rechnungen, jahresinspektionPlanen, rechnungsPdfErstellen,
    setAuftraege, setRechnungen,
    kundenMap, fahrzeugeMap, auftraegeMap, rechnungenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();

  const enrichedFahrzeuge = useMemo(
    () => enrichFahrzeuge(fahrzeuge, { kundenMap }),
    [fahrzeuge, kundenMap],
  );
  const enrichedAuftraege = useMemo(
    () => enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap }),
    [auftraege, fahrzeugeMap, kundenMap],
  );
  const enrichedRechnungen = useMemo(
    () => enrichRechnungen(rechnungen, { auftraegeMap, kundenMap }),
    [rechnungen, auftraegeMap, kundenMap],
  );
  const enrichedJahresinspektionPlanen = useMemo(
    () => enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap }),
    [jahresinspektionPlanen, fahrzeugeMap],
  );
  const enrichedRechnungsPdfErstellen = useMemo(
    () => enrichRechnungsPdfErstellen(rechnungsPdfErstellen, { rechnungenMap }),
    [rechnungsPdfErstellen, rechnungenMap],
  );

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [auftragDialog, setAuftragDialog] = useState(false);
  const [auftragDefaults, setAuftragDefaults] = useState<AuftraegeDialogDefaults | undefined>(undefined);
  const [auftragEditId, setAuftragEditId] = useState<string | undefined>(undefined);

  const [rechnungDialog, setRechnungDialog] = useState(false);
  const [rechnungDefaults, setRechnungDefaults] = useState<RechnungenDialogDefaults | undefined>(undefined);
  const [rechnungEditId, setRechnungEditId] = useState<string | undefined>(undefined);

  const [kundenDialog, setKundenDialog] = useState(false);

  const [fahrzeugeDialog, setFahrzeugeDialog] = useState(false);
  const [fahrzeugeDefaults, setFahrzeugeDefaults] = useState<FahrzeugeDialogDefaults | undefined>(undefined);
  const [fahrzeugeEditId, setFahrzeugeEditId] = useState<string | undefined>(undefined);

  const [inspektionDialog, setInspektionDialog] = useState(false);
  const [inspektionDefaults, setInspektionDefaults] = useState<JahresinspektionPlanenDialogDefaults | undefined>(undefined);
  const [inspektionEditId, setInspektionEditId] = useState<string | undefined>(undefined);

  // Status-filter for KPI strip
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const today = format(clock, 'yyyy-MM-dd');

  // Derived KPI data
  const offeneAuftraege = useMemo(
    () => enrichedAuftraege.filter(a => lookupKey(a.fields.status) !== 'abgeschlossen'),
    [enrichedAuftraege],
  );
  const inBearbeitungCount = useMemo(
    () => enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung').length,
    [enrichedAuftraege],
  );
  const offeneRechnungen = useMemo(
    () => enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) !== 'bezahlt'),
    [enrichedRechnungen],
  );
  const ueberfaelligeRechnungen = useMemo(
    () => enrichedRechnungen.filter(r =>
      lookupKey(r.fields.status_rechnung) === 'ueberfaellig' ||
      (lookupKey(r.fields.status_rechnung) === 'offen' &&
        r.fields.faelligkeitsdatum && r.fields.faelligkeitsdatum < today)
    ),
    [enrichedRechnungen, today],
  );

  // Aufträge with overdue wunschtermin (still open)
  const ueberfaelligeAuftraege = useMemo(
    () => enrichedAuftraege.filter(a =>
      lookupKey(a.fields.status) !== 'abgeschlossen' &&
      a.fields.wunschtermin &&
      a.fields.wunschtermin.slice(0, 10) < today
    ).sort((a, b) => (a.fields.wunschtermin ?? '').localeCompare(b.fields.wunschtermin ?? '')),
    [enrichedAuftraege, today],
  );

  // Aufträge fällig heute
  const heuteAuftraege = useMemo(
    () => enrichedAuftraege.filter(a =>
      lookupKey(a.fields.status) !== 'abgeschlossen' &&
      a.fields.wunschtermin &&
      a.fields.wunschtermin.slice(0, 10) === today
    ),
    [enrichedAuftraege, today],
  );

  // Upcoming Jahresinspektionen (next 30 days)
  const inspektionenDemnächst = useMemo(() => {
    const in30 = format(new Date(clock.getTime() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    return enrichedJahresinspektionPlanen.filter(j =>
      j.fields.wunschtermin_inspektion &&
      j.fields.wunschtermin_inspektion.slice(0, 10) >= today &&
      j.fields.wunschtermin_inspektion.slice(0, 10) <= in30
    );
  }, [enrichedJahresinspektionPlanen, today, clock]);

  // Kanban columns
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Kanban cards — filtered by KPI strip if active
  const kanbanCards = useMemo<KanbanCard[]>(
    () => {
      const filtered = statusFilter
        ? enrichedAuftraege.filter(a => lookupKey(a.fields.status) === statusFilter)
        : enrichedAuftraege;
      return filtered.map(a => {
        const status = lookupKey(a.fields.status) ?? COLUMNS[0]?.key ?? '';
        const isOverdue = a.fields.wunschtermin && a.fields.wunschtermin.slice(0, 10) < today && status !== 'abgeschlossen';
        return {
          id: `auftrag:${a.record_id}`,
          column: status,
          title: a.kundeName || a.fahrzeugName || a.fields.auftragsnummer || appLabel('auftraege'),
          subtitle: [
            a.fahrzeugName,
            a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : undefined,
          ].filter(Boolean).join(' · ') || undefined,
          tone: isOverdue ? 'destructive' as KanbanTone : toneForStatus(status),
        };
      });
    },
    [enrichedAuftraege, COLUMNS, today, statusFilter],
  );

  // Shared advance helper: Auftrag status voranbringen
  const advanceAuftrag = useCallback(async (auftrag: EnrichedAuftraege) => {
    const currentStatus = lookupKey(auftrag.fields.status) ?? 'offen';
    const next = currentStatus === 'offen' ? 'in_bearbeitung'
      : currentStatus === 'in_bearbeitung' ? 'abgeschlossen'
      : null;
    if (!next) return;
    const prev = auftrag.fields.status;
    const nextOption = lookupOption('auftraege', 'status', next);
    setAuftraege(prev2 => prev2.map(a =>
      a.record_id === auftrag.record_id
        ? { ...a, fields: { ...a.fields, status: nextOption } }
        : a
    ));
    try {
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: next });
      undoToast(tx`${auftrag.kundeName || auftrag.record_id} — Status aktualisiert`, async () => {
        setAuftraege(prev2 => prev2.map(a =>
          a.record_id === auftrag.record_id
            ? { ...a, fields: { ...a.fields, status: prev } }
            : a
        ));
        await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: currentStatus });
      });
    } catch {
      await fetchAll();
    }
  }, [setAuftraege, fetchAll]);

  // Rechnung als bezahlt markieren
  const markRechnungBezahlt = useCallback(async (rechnung: EnrichedRechnungen) => {
    const prev = rechnung.fields.status_rechnung;
    const nextOption = lookupOption('rechnungen', 'status_rechnung', 'bezahlt');
    setRechnungen(prev2 => prev2.map(r =>
      r.record_id === rechnung.record_id
        ? { ...r, fields: { ...r.fields, status_rechnung: nextOption } }
        : r
    ));
    try {
      await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: 'bezahlt' });
      undoToast(tx`${rechnung.kundeName || rechnung.fields.rechnungsnummer || ''} — als bezahlt markiert`, async () => {
        setRechnungen(prev2 => prev2.map(r =>
          r.record_id === rechnung.record_id
            ? { ...r, fields: { ...r.fields, status_rechnung: prev } }
            : r
        ));
        const prevKey = lookupKey(prev) ?? 'offen';
        await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: prevKey });
      });
    } catch {
      await fetchAll();
    }
  }, [setRechnungen, fetchAll]);

  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const auftrag = auftraege.find(a => a.record_id === rid);
    if (!auftrag) return;
    const prev = auftrag.fields.status;
    const nextOption = lookupOption('auftraege', 'status', newColumn);
    setAuftraege(prev2 => prev2.map(a =>
      a.record_id === rid
        ? { ...a, fields: { ...a.fields, status: nextOption } }
        : a
    ));
    try {
      await LivingAppsService.updateAuftraegeEntry(rid, { status: newColumn });
      undoToast(tx`Status aktualisiert`, async () => {
        setAuftraege(prev2 => prev2.map(a =>
          a.record_id === rid
            ? { ...a, fields: { ...a.fields, status: prev } }
            : a
        ));
        const prevKey = lookupKey(prev) ?? 'offen';
        await LivingAppsService.updateAuftraegeEntry(rid, { status: prevKey });
      });
    } catch {
      await fetchAll();
    }
  }, [auftraege, setAuftraege, fetchAll]);

  // ─── Every hook goes ABOVE this line ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below: plain derivations only ───

  const contextName = namen(ueberfaelligeAuftraege.map(a => a.kundeName).filter(Boolean));
  const contextLine = ueberfaelligeAuftraege.length > 0
    ? tx`${contextName} — Wunschtermin überschritten.`
    : heuteAuftraege.length > 0
      ? tx`Heute ${heuteAuftraege.length} Aufträge mit Wunschtermin.`
      : offeneAuftraege.length > 0
        ? tx`${offeneAuftraege.length} offene Aufträge in Bearbeitung.`
        : tx`Alle Aufträge erledigt — Werkstatt bereit.`;

  const nextInspektion = inspektionenDemnächst[0];

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{contextLine}</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
          onClick={() => { setAuftragDefaults(undefined); setAuftragEditId(undefined); setAuftragDialog(true); }}
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neuer Auftrag')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaelligeAuftraege.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('In Bearbeitung setzen'),
              onClick: () => advanceAuftrag(ueberfaelligeAuftraege[0]),
            }}
          >
            <b>{namen(ueberfaelligeAuftraege.slice(0, 3).map(a => a.kundeName).filter(Boolean))}</b>
            {' '}{tx('— Wunschtermin überschritten. Bitte priorisieren.')}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Offen')}
              value={enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'offen').length}
              icon={<IconTools size={16} />}
              tone={enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'offen').length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'offen' ? null : 'offen')}
              active={statusFilter === 'offen'}
            />
            <StatStripItem
              title={tx('In Bearbeitung')}
              value={inBearbeitungCount}
              icon={<IconCar size={16} />}
              tone={inBearbeitungCount > 0 ? 'primary' : 'default'}
              onClick={() => setStatusFilter(f => f === 'in_bearbeitung' ? null : 'in_bearbeitung')}
              active={statusFilter === 'in_bearbeitung'}
            />
            <StatStripItem
              title={tx('Offene Rechnungen')}
              value={offeneRechnungen.length}
              icon={<IconFileInvoice size={16} />}
              tone={ueberfaelligeRechnungen.length > 0 ? 'destructive' : offeneRechnungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Inspektionen (30 Tage)')}
              value={inspektionenDemnächst.length}
              icon={<IconCalendarCheck size={16} />}
              tone={inspektionenDemnächst.length > 0 ? 'warning' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={kanbanCards}
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
              setAuftragEditId(undefined);
              setAuftragDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Überfällig & Heute')}
              items={[...ueberfaelligeAuftraege, ...heuteAuftraege.filter(a =>
                !ueberfaelligeAuftraege.find(u => u.record_id === a.record_id)
              )].slice(0, 8).map(a => {
                const isOverdue = a.fields.wunschtermin && a.fields.wunschtermin.slice(0, 10) < today;
                const nextStatus = lookupKey(a.fields.status) === 'offen' ? tx('In Bearbeitung')
                  : lookupKey(a.fields.status) === 'in_bearbeitung' ? tx('Abschließen') : null;
                return {
                  id: a.record_id,
                  title: a.kundeName || a.fahrzeugName || a.record_id,
                  secondLine: (
                    <>
                      <span className={isOverdue ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                        {isOverdue ? tx('Überfällig') : tx('Heute')}
                      </span>
                      {a.fields.wunschtermin && (
                        <span className="text-muted-foreground"> · {formatDate(a.fields.wunschtermin)}</span>
                      )}
                      {a.fahrzeugName && (
                        <span className="text-muted-foreground"> · {a.fahrzeugName}</span>
                      )}
                    </>
                  ),
                  action: nextStatus ? {
                    label: nextStatus,
                    onClick: () => advanceAuftrag(a),
                  } : undefined,
                };
              })}
              onItemClick={id => {
                const a = enrichedAuftraege.find(x => x.record_id === id);
                if (a) overlay.replace({ type: 'auftraege', record: a });
              }}
              empty={{
                text: nextInspektion
                  ? tx`Nächste Inspektion: ${enrichedJahresinspektionPlanen.find(j => j.record_id === nextInspektion.record_id)?.fahrzeugName ?? ''} am ${formatDate(nextInspektion.fields.wunschtermin_inspektion ?? '')}`
                  : tx('Keine überfälligen Aufträge — alles im Zeitplan.'),
                action: { label: tx('Neuer Auftrag'), onClick: () => { setAuftragDefaults(undefined); setAuftragDialog(true); } },
              }}
            />
            <WorkList
              title={tx('Offene Rechnungen')}
              items={offeneRechnungen.slice(0, 6).map(r => ({
                id: r.record_id,
                title: r.kundeName || r.fields.rechnungsnummer || appLabel('rechnungen'),
                secondLine: (
                  <>
                    <span className={lookupKey(r.fields.status_rechnung) === 'ueberfaellig' ? 'font-medium text-destructive' : 'text-amber-600 font-medium'}>
                      {r.fields.status_rechnung?.label ?? tx('Offen')}
                    </span>
                    {r.fields.bruttobetrag != null && (
                      <span className="text-muted-foreground"> · {formatCurrency(r.fields.bruttobetrag)}</span>
                    )}
                    {r.fields.faelligkeitsdatum && (
                      <span className="text-muted-foreground"> · {formatDate(r.fields.faelligkeitsdatum)}</span>
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
                text: tx('Alle Rechnungen bezahlt.'),
                action: { label: tx('Neue Rechnung'), onClick: () => { setRechnungDefaults(undefined); setRechnungDialog(true); } },
              }}
            />
          </>
        }
      />

      {/* Overlay stack — ONE host for the whole page */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftraege') {
            const rec = top.record as EnrichedAuftraege;
            const nextStatus = lookupKey(rec.fields.status) === 'offen' ? tx('In Bearbeitung setzen')
              : lookupKey(rec.fields.status) === 'in_bearbeitung' ? tx('Auftrag abschließen') : undefined;
            return (
              <>
                <RecordHeader
                  title={rec.kundeName || rec.fahrzeugName || appLabel('auftraege')}
                  subtitle={rec.fields.auftragsnummer}
                  badges={rec.fields.status && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                      {rec.fields.status.label}
                    </span>
                  )}
                />
                <AuftraegeDetails
                  record={rec}
                  fahrzeugeList={fahrzeuge}
                  kundenList={kunden}
                  rechnungenList={rechnungen}
                  onOpenFahrzeuge={f => {
                    const ef = enrichedFahrzeuge.find(x => x.record_id === f.record_id);
                    if (ef) overlay.push({ type: 'fahrzeuge', record: ef });
                  }}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  onOpenRechnungen={r => {
                    const er = enrichedRechnungen.find(x => x.record_id === r.record_id);
                    if (er) overlay.push({ type: 'rechnungen', record: er });
                  }}
                  onAddRechnungen={() => {
                    setRechnungDefaults({ auftrag: rec.record_id, kunde: extractRecordId(rec.fields.kunde) ?? undefined });
                    setRechnungEditId(undefined);
                    setRechnungDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunden') {
            const rec = top.record as Kunden;
            return (
              <>
                <RecordHeader
                  title={[rec.fields.vorname, rec.fields.nachname].filter(Boolean).join(' ') || appLabel('kunden')}
                  subtitle={rec.fields.email}
                />
                <KundenDetails
                  record={rec}
                  fahrzeugeList={fahrzeuge}
                  auftraegeList={auftraege}
                  rechnungenList={rechnungen}
                  onOpenFahrzeuge={f => {
                    const ef = enrichedFahrzeuge.find(x => x.record_id === f.record_id);
                    if (ef) overlay.push({ type: 'fahrzeuge', record: ef });
                  }}
                  onAddFahrzeuge={() => {
                    setFahrzeugeDefaults({ kunde: rec.record_id });
                    setFahrzeugeEditId(undefined);
                    setFahrzeugeDialog(true);
                  }}
                  onOpenAuftraege={a => {
                    const ea = enrichedAuftraege.find(x => x.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'auftraege', record: ea });
                  }}
                  onAddAuftraege={() => {
                    setAuftragDefaults({ kunde: rec.record_id });
                    setAuftragEditId(undefined);
                    setAuftragDialog(true);
                  }}
                  onOpenRechnungen={r => {
                    const er = enrichedRechnungen.find(x => x.record_id === r.record_id);
                    if (er) overlay.push({ type: 'rechnungen', record: er });
                  }}
                  onAddRechnungen={() => {
                    setRechnungDefaults({ kunde: rec.record_id });
                    setRechnungEditId(undefined);
                    setRechnungDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'fahrzeuge') {
            const rec = top.record as EnrichedFahrzeuge;
            return (
              <>
                <RecordHeader
                  title={rec.fields.kennzeichen || appLabel('fahrzeuge')}
                  subtitle={[rec.fields.marke, rec.fields.modell].filter(Boolean).join(' ')}
                />
                <FahrzeugeDetails
                  record={rec}
                  kundenList={kunden}
                  auftraegeList={auftraege}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  onOpenAuftraege={a => {
                    const ea = enrichedAuftraege.find(x => x.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'auftraege', record: ea });
                  }}
                  onAddAuftraege={() => {
                    setAuftragDefaults({ fahrzeug: rec.record_id });
                    setAuftragEditId(undefined);
                    setAuftragDialog(true);
                  }}
                  onOpenJahresinspektionPlanen={j => {
                    const ej = enrichedJahresinspektionPlanen.find(x => x.record_id === j.record_id);
                    if (ej) overlay.push({ type: 'jahresinspektion_planen', record: ej });
                  }}
                  onAddJahresinspektionPlanen={() => {
                    setInspektionDefaults({ fahrzeug: rec.record_id });
                    setInspektionEditId(undefined);
                    setInspektionDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'rechnungen') {
            const rec = top.record as EnrichedRechnungen;
            const isUnbezahlt = lookupKey(rec.fields.status_rechnung) !== 'bezahlt';
            return (
              <>
                <RecordHeader
                  title={rec.kundeName || rec.fields.rechnungsnummer || appLabel('rechnungen')}
                  subtitle={rec.fields.rechnungsnummer}
                  badges={rec.fields.status_rechnung && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      lookupKey(rec.fields.status_rechnung) === 'ueberfaellig' ? 'bg-destructive/10 text-destructive'
                      : lookupKey(rec.fields.status_rechnung) === 'bezahlt' ? 'bg-success/10 text-success'
                      : 'bg-warning/10 text-warning'
                    }`}>
                      {rec.fields.status_rechnung.label}
                    </span>
                  )}
                />
                <RechnungenDetails
                  record={rec}
                  auftraegeList={auftraege}
                  kundenList={kunden}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenAuftraege={a => {
                    const ea = enrichedAuftraege.find(x => x.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'auftraege', record: ea });
                  }}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  onOpenRechnungsPdfErstellen={p => {
                    const ep = enrichedRechnungsPdfErstellen.find(x => x.record_id === p.record_id);
                    if (ep) overlay.push({ type: 'rechnungs_pdf_erstellen', record: ep });
                  }}
                  onAddRechnungsPdfErstellen={() => {
                    overlay.close();
                  }}
                />
              </>
            );
          }
          if (top.type === 'jahresinspektion_planen') {
            const rec = top.record as EnrichedJahresinspektionPlanen;
            return (
              <>
                <RecordHeader
                  title={rec.fahrzeugName || appLabel('jahresinspektion_planen')}
                  subtitle={rec.fields.wunschtermin_inspektion ? formatDate(rec.fields.wunschtermin_inspektion) : undefined}
                />
                <JahresinspektionPlanenDetails
                  record={rec}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => {
                    const ef = enrichedFahrzeuge.find(x => x.record_id === f.record_id);
                    if (ef) overlay.push({ type: 'fahrzeuge', record: ef });
                  }}
                />
              </>
            );
          }
          if (top.type === 'rechnungs_pdf_erstellen') {
            const rec = top.record as EnrichedRechnungsPdfErstellen;
            return (
              <>
                <RecordHeader
                  title={rec.rechnungName || rec.fields.pdf_rechnungsnummer || appLabel('rechnungs_pdf_erstellen')}
                />
                <RechnungsPdfErstellenDetails
                  record={rec}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => {
                    const er = enrichedRechnungen.find(x => x.record_id === r.record_id);
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
            const rec = top.record as EnrichedAuftraege;
            const status = lookupKey(rec.fields.status);
            if (status === 'abgeschlossen') return undefined;
            return {
              label: status === 'offen' ? tx('In Bearbeitung setzen') : tx('Auftrag abschließen'),
              onClick: () => {
                advanceAuftrag(rec).then(() => {
                  overlay.close();
                });
              },
            };
          }
          if (top.type === 'rechnungen') {
            const rec = top.record as EnrichedRechnungen;
            if (lookupKey(rec.fields.status_rechnung) === 'bezahlt') return undefined;
            return {
              label: tx('Als bezahlt markieren'),
              onClick: () => {
                markRechnungBezahlt(rec).then(() => overlay.close());
              },
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'auftraege') {
            const rec = top.record as EnrichedAuftraege;
            setAuftragDefaults(rec.fields as AuftraegeDialogDefaults);
            setAuftragEditId(rec.record_id);
            setAuftragDialog(true);
          } else if (top.type === 'rechnungen') {
            const rec = top.record as EnrichedRechnungen;
            setRechnungDefaults(rec.fields as RechnungenDialogDefaults);
            setRechnungEditId(rec.record_id);
            setRechnungDialog(true);
          } else if (top.type === 'fahrzeuge') {
            const rec = top.record as EnrichedFahrzeuge;
            setFahrzeugeDefaults(rec.fields as FahrzeugeDialogDefaults);
            setFahrzeugeEditId(rec.record_id);
            setFahrzeugeDialog(true);
          } else if (top.type === 'jahresinspektion_planen') {
            const rec = top.record as EnrichedJahresinspektionPlanen;
            setInspektionDefaults(rec.fields as JahresinspektionPlanenDialogDefaults);
            setInspektionEditId(rec.record_id);
            setInspektionDialog(true);
          }
        }}
      />

      {/* Dialogs */}
      <AuftraegeDialog
        open={auftragDialog}
        onClose={() => setAuftragDialog(false)}
        onSubmit={async fields => {
          if (auftragEditId) {
            await LivingAppsService.updateAuftraegeEntry(auftragEditId, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={auftragDefaults}
        recordId={auftragEditId}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />
      <RechnungenDialog
        open={rechnungDialog}
        onClose={() => setRechnungDialog(false)}
        onSubmit={async fields => {
          if (rechnungEditId) {
            await LivingAppsService.updateRechnungenEntry(rechnungEditId, fields);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={rechnungDefaults}
        recordId={rechnungEditId}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />
      <KundenDialog
        open={kundenDialog}
        onClose={() => setKundenDialog(false)}
        onSubmit={async fields => {
          await LivingAppsService.createKundenEntry(fields);
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />
      <FahrzeugeDialog
        open={fahrzeugeDialog}
        onClose={() => setFahrzeugeDialog(false)}
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
        open={inspektionDialog}
        onClose={() => setInspektionDialog(false)}
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
    </>
  );
}
