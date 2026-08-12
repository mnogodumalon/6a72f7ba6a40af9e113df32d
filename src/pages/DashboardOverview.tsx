import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedFahrzeuge, EnrichedAuftraege, EnrichedRechnungen, EnrichedJahresinspektionPlanen, EnrichedRechnungsPdfErstellen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard } from '@/components/widgets/KanbanWidget';
import {
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { AuftraegeDetails } from '@/components/details/AuftraegeDetails';
import { FahrzeugeDetails } from '@/components/details/FahrzeugeDetails';
import { KundenDetails } from '@/components/details/KundenDetails';
import { RechnungenDetails } from '@/components/details/RechnungenDetails';
import { JahresinspektionPlanenDetails } from '@/components/details/JahresinspektionPlanenDetails';
import { RechnungsPdfErstellenDetails } from '@/components/details/RechnungsPdfErstellenDetails';
import { AuftraegeDialog } from '@/components/dialogs/AuftraegeDialog';
import type { AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import { FahrzeugeDialog } from '@/components/dialogs/FahrzeugeDialog';
import type { FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import { KundenDialog } from '@/components/dialogs/KundenDialog';
import { RechnungenDialog } from '@/components/dialogs/RechnungenDialog';
import type { RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import { JahresinspektionPlanenDialog } from '@/components/dialogs/JahresinspektionPlanenDialog';
import type { JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { RechnungsPdfErstellenDialog } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import type { RechnungsPdfErstellenDialogDefaults } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconAlertCircle, IconPlus, IconCar, IconUsers, IconFileInvoice,
  IconCalendar, IconCheck, IconCurrencyEuro,
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

  const enrichedFahrzeuge = useMemo(() => enrichFahrzeuge(fahrzeuge, { kundenMap }), [fahrzeuge, kundenMap]);
  const enrichedAuftraege = useMemo(() => enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap }), [auftraege, fahrzeugeMap, kundenMap]);
  const enrichedRechnungen = useMemo(() => enrichRechnungen(rechnungen, { auftraegeMap, kundenMap }), [rechnungen, auftraegeMap, kundenMap]);
  const enrichedJahresinspektionPlanen = useMemo(() => enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap }), [jahresinspektionPlanen, fahrzeugeMap]);
  const enrichedRechnungsPdfErstellen = useMemo(() => enrichRechnungsPdfErstellen(rechnungsPdfErstellen, { rechnungenMap }), [rechnungsPdfErstellen, rechnungenMap]);

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [auftragDialog, setAuftragDialog] = useState<{ open: boolean; defaults?: AuftraegeDialogDefaults; recordId?: string }>({ open: false });
  const [fahrzeugeDialogState, setFahrzeugeDialogState] = useState<{ open: boolean; defaults?: FahrzeugeDialogDefaults; recordId?: string }>({ open: false });
  const [kundenDialogOpen, setKundenDialogOpen] = useState(false);
  const [rechnungenDialog, setRechnungenDialog] = useState<{ open: boolean; defaults?: RechnungenDialogDefaults; recordId?: string }>({ open: false });
  const [inspektionDialog, setInspektionDialog] = useState<{ open: boolean; defaults?: JahresinspektionPlanenDialogDefaults; recordId?: string }>({ open: false });
  const [pdfDialog, setPdfDialog] = useState<{ open: boolean; defaults?: RechnungsPdfErstellenDialogDefaults; recordId?: string }>({ open: false });

  // Derived KPIs
  const today = format(clock, 'yyyy-MM-dd');
  const offeneAuftraege = useMemo(() => auftraege.filter(a => lookupKey(a.fields.status) === 'offen'), [auftraege]);
  const inBearbeitungAuftraege = useMemo(() => auftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung'), [auftraege]);
  const ueberfaelligeRechnungen = useMemo(() =>
    enrichedRechnungen.filter(r => {
      const key = lookupKey(r.fields.status_rechnung);
      if (key === 'bezahlt') return false;
      if (key === 'ueberfaellig') return true;
      return r.fields.faelligkeitsdatum != null && r.fields.faelligkeitsdatum < today;
    }),
    [enrichedRechnungen, today]
  );
  const offeneRechnungen = useMemo(() => enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'offen'), [enrichedRechnungen]);
  const naechsteInspektionen = useMemo(() =>
    enrichedJahresinspektionPlanen
      .filter(i => i.fields.wunschtermin_inspektion != null && i.fields.wunschtermin_inspektion >= today)
      .sort((a, b) => (a.fields.wunschtermin_inspektion ?? '') < (b.fields.wunschtermin_inspektion ?? '') ? -1 : 1),
    [enrichedJahresinspektionPlanen, today]
  );

  // Status advance for Aufträge
  const advanceAuftragStatus = useCallback(async (auftrag: Auftraege | EnrichedAuftraege) => {
    const curKey = lookupKey(auftrag.fields.status);
    const nextKey = curKey === 'offen' ? 'in_bearbeitung' : curKey === 'in_bearbeitung' ? 'abgeschlossen' : null;
    if (!nextKey) return;
    const prevStatus = auftrag.fields.status;
    const nextOption = lookupOption('auftraege', 'status', nextKey);
    const displayName = (auftrag as EnrichedAuftraege).fahrzeugName ?? auftrag.fields.auftragsnummer ?? '';
    setAuftraege(prev => prev.map(a => a.record_id === auftrag.record_id ? { ...a, fields: { ...a.fields, status: nextOption } } : a));
    undoToast(tx`${displayName} — ${nextOption.label}`, async () => {
      setAuftraege(prev => prev.map(a => a.record_id === auftrag.record_id ? { ...a, fields: { ...a.fields, status: prevStatus } } : a));
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: prevStatus ? (typeof prevStatus === 'object' ? prevStatus.key : prevStatus) : undefined }).catch(() => fetchAll());
    });
    LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: nextKey }).catch(() => fetchAll());
  }, [setAuftraege, fetchAll]);

  // Mark Rechnung as bezahlt
  const markRechnungBezahlt = useCallback(async (rechnung: EnrichedRechnungen) => {
    const prev = rechnung.fields.status_rechnung;
    const nextOption = lookupOption('rechnungen', 'status_rechnung', 'bezahlt');
    setRechnungen(prev2 => prev2.map(r => r.record_id === rechnung.record_id ? { ...r, fields: { ...r.fields, status_rechnung: nextOption } } : r));
    undoToast(tx`${rechnung.fields.rechnungsnummer ?? ''} — ${nextOption.label}`, async () => {
      setRechnungen(prev2 => prev2.map(r => r.record_id === rechnung.record_id ? { ...r, fields: { ...r.fields, status_rechnung: prev } } : r));
      await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: typeof prev === 'object' ? prev?.key : prev }).catch(() => fetchAll());
    });
    LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: 'bezahlt' }).catch(() => fetchAll());
  }, [setRechnungen, fetchAll]);

  // Context line
  const inBearbeitungNames = useMemo(() =>
    namen(inBearbeitungAuftraege.map(a => {
      const e = enrichedAuftraege.find(ea => ea.record_id === a.record_id);
      return e?.fahrzeugName ?? e?.kundeName ?? a.fields.auftragsnummer ?? '';
    })),
    [inBearbeitungAuftraege, enrichedAuftraege]
  );

  // ─── Every hook goes ABOVE this line ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Kanban columns & cards
  const auftragColumns = (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label }));
  const auftragCards: KanbanCard[] = enrichedAuftraege.map(a => ({
    id: a.record_id,
    column: lookupKey(a.fields.status) ?? 'offen',
    title: a.fahrzeugName || a.fields.auftragsnummer || appLabel('auftraege'),
    subtitle: [
      a.kundeName,
      a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : null,
    ].filter(Boolean).join(' · '),
    tone: lookupKey(a.fields.prioritaet) === 'hoch' ? 'destructive' as const
      : lookupKey(a.fields.prioritaet) === 'normal' ? 'warning' as const
      : 'default' as const,
  }));

  const contextLine = inBearbeitungAuftraege.length > 0
    ? tx`${inBearbeitungNames} ${tx('in Bearbeitung')}`
    : auftraege.length === 0
      ? tx('Noch keine Aufträge — starte jetzt.')
      : tx('Alle Aufträge im Plan.');

  return (
    <>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-1">{contextLine}</p>
        </div>
        <button
          onClick={() => setAuftragDialog({ open: true })}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neuer Auftrag')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaelligeRechnungen.length > 0 && (
          <HeroBanner
            icon={<IconAlertCircle size={18} />}
            action={{
              label: tx('Als bezahlt markieren'),
              onClick: () => markRechnungBezahlt(ueberfaelligeRechnungen[0]),
            }}
          >
            <b>{namen(ueberfaelligeRechnungen.map(r => r.kundeName || r.fields.rechnungsnummer || ''))}</b>
            {' — '}{tx('Rechnung überfällig')}{ueberfaelligeRechnungen[0].fields.faelligkeitsdatum ? ` (${tx('fällig')}: ${formatDate(ueberfaelligeRechnungen[0].fields.faelligkeitsdatum)})` : ''}.
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Offen')}
              value={offeneAuftraege.length}
              icon={<IconCar size={16} />}
              tone={offeneAuftraege.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('In Bearbeitung')}
              value={inBearbeitungAuftraege.length}
              icon={<IconCar size={16} />}
              tone={inBearbeitungAuftraege.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Offene Rechnungen')}
              value={offeneRechnungen.length}
              icon={<IconFileInvoice size={16} />}
              tone={offeneRechnungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Nächste Inspektion')}
              value={naechsteInspektionen[0] ? formatDate(naechsteInspektionen[0].fields.wunschtermin_inspektion) : tx('keine')}
              icon={<IconCalendar size={16} />}
            />
            <StatStripItem
              title={appLabel('kunden')}
              value={kunden.length}
              icon={<IconUsers size={16} />}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={auftragColumns}
            cards={auftragCards}
            defaultCollapsed={['abgeschlossen']}
            onCardClick={card => {
              const a = enrichedAuftraege.find(a => a.record_id === card.id);
              if (a) overlay.replace({ type: 'auftraege', record: a });
            }}
            onCardMove={async (cardId, newColumn) => {
              const auftrag = auftraege.find(a => a.record_id === cardId);
              if (!auftrag) return;
              const prevStatus = auftrag.fields.status;
              const nextOption = lookupOption('auftraege', 'status', newColumn);
              setAuftraege(prev => prev.map(a => a.record_id === cardId ? { ...a, fields: { ...a.fields, status: nextOption } } : a));
              const displayName = enrichedAuftraege.find(a => a.record_id === cardId)?.fahrzeugName ?? auftrag.fields.auftragsnummer ?? '';
              undoToast(tx`${displayName} — ${nextOption.label}`, async () => {
                setAuftraege(prev => prev.map(a => a.record_id === cardId ? { ...a, fields: { ...a.fields, status: prevStatus } } : a));
                await LivingAppsService.updateAuftraegeEntry(cardId, { status: typeof prevStatus === 'object' ? prevStatus?.key : prevStatus }).catch(() => fetchAll());
              });
              LivingAppsService.updateAuftraegeEntry(cardId, { status: newColumn }).catch(() => fetchAll());
            }}
            onAddCard={column => setAuftragDialog({ open: true, defaults: { status: column } })}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Heute & überfällig')}
              items={[
                ...auftraege
                  .filter(a => {
                    const k = lookupKey(a.fields.status);
                    if (k === 'abgeschlossen') return false;
                    return a.fields.wunschtermin != null && a.fields.wunschtermin.slice(0, 10) <= today;
                  })
                  .sort((a, b) => (a.fields.wunschtermin ?? '') < (b.fields.wunschtermin ?? '') ? -1 : 1)
                  .map(a => {
                    const ea = enrichedAuftraege.find(e => e.record_id === a.record_id);
                    const isOverdue = a.fields.wunschtermin != null && a.fields.wunschtermin.slice(0, 10) < today;
                    const statusKey = lookupKey(a.fields.status);
                    const nextLabel = statusKey === 'offen' ? tx('Starten') : statusKey === 'in_bearbeitung' ? tx('Abschließen') : null;
                    return {
                      id: a.record_id,
                      title: ea?.fahrzeugName || a.fields.auftragsnummer || appLabel('auftraege'),
                      secondLine: (
                        <>
                          <span className={`font-medium ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {isOverdue ? tx('Überfällig') : tx('Heute')}
                          </span>
                          {ea?.kundeName ? <span className="text-muted-foreground"> · {ea.kundeName}</span> : null}
                        </>
                      ),
                      action: nextLabel ? {
                        label: nextLabel,
                        onClick: () => advanceAuftragStatus(a),
                      } : undefined,
                    };
                  }),
              ]}
              onItemClick={id => {
                const a = enrichedAuftraege.find(a => a.record_id === id);
                if (a) overlay.replace({ type: 'auftraege', record: a });
              }}
              empty={{
                text: tx('Keine Aufträge für heute — alles auf dem neuesten Stand.'),
                action: { label: tx('Neuer Auftrag'), onClick: () => setAuftragDialog({ open: true }) },
              }}
            />
            <WorkList
              title={tx('Offene Rechnungen')}
              items={offeneRechnungen.map(r => ({
                id: r.record_id,
                title: r.fields.rechnungsnummer || appLabel('rechnungen'),
                secondLine: (
                  <>
                    <span className="text-muted-foreground">{r.kundeName}</span>
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
                const r = enrichedRechnungen.find(r => r.record_id === id);
                if (r) overlay.replace({ type: 'rechnungen', record: r });
              }}
              empty={{
                text: tx('Alle Rechnungen bezahlt.'),
                action: { label: tx('Neue Rechnung'), onClick: () => setRechnungenDialog({ open: true }) },
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
            return (
              <>
                <RecordHeader
                  title={r.fahrzeugName || r.fields.auftragsnummer || appLabel('auftraege')}
                  subtitle={r.kundeName}
                  badges={r.fields.status ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">{r.fields.status.label}</span>
                  ) : undefined}
                />
                <AuftraegeDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => {
                    const ef = enrichedFahrzeuge.find(ef => ef.record_id === f.record_id);
                    if (ef) overlay.push({ type: 'fahrzeuge', record: ef });
                  }}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rech => {
                    const er = enrichedRechnungen.find(er => er.record_id === rech.record_id);
                    if (er) overlay.push({ type: 'rechnungen', record: er });
                  }}
                  onAddRechnungen={() => setRechnungenDialog({ open: true, defaults: { auftrag: r.record_id, kunde: extractRecordId(r.fields.kunde) ?? undefined } })}
                />
              </>
            );
          }
          if (top.type === 'fahrzeuge') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fields.kennzeichen || appLabel('fahrzeuge')}
                  subtitle={[r.fields.marke, r.fields.modell].filter(Boolean).join(' ')}
                />
                <FahrzeugeDetails
                  record={r}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = enrichedAuftraege.find(ea => ea.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'auftraege', record: ea });
                  }}
                  onAddAuftraege={() => setAuftragDialog({ open: true, defaults: { fahrzeug: r.record_id, kunde: extractRecordId(r.fields.kunde) ?? undefined } })}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => {
                    const ei = enrichedJahresinspektionPlanen.find(ei => ei.record_id === i.record_id);
                    if (ei) overlay.push({ type: 'jahresinspektion_planen', record: ei });
                  }}
                  onAddJahresinspektionPlanen={() => setInspektionDialog({ open: true, defaults: { fahrzeug: r.record_id } })}
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
                  subtitle={r.fields.email ?? r.fields.telefon}
                />
                <KundenDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => {
                    const ef = enrichedFahrzeuge.find(ef => ef.record_id === f.record_id);
                    if (ef) overlay.push({ type: 'fahrzeuge', record: ef });
                  }}
                  onAddFahrzeuge={() => setFahrzeugeDialogState({ open: true, defaults: { kunde: r.record_id } })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = enrichedAuftraege.find(ea => ea.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'auftraege', record: ea });
                  }}
                  onAddAuftraege={() => setAuftragDialog({ open: true, defaults: { kunde: r.record_id } })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rech => {
                    const er = enrichedRechnungen.find(er => er.record_id === rech.record_id);
                    if (er) overlay.push({ type: 'rechnungen', record: er });
                  }}
                  onAddRechnungen={() => setRechnungenDialog({ open: true, defaults: { kunde: r.record_id } })}
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
                  subtitle={r.kundeName}
                  badges={r.fields.status_rechnung ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">{r.fields.status_rechnung.label}</span>
                  ) : undefined}
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = enrichedAuftraege.find(ea => ea.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'auftraege', record: ea });
                  }}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={p => {
                    const ep = enrichedRechnungsPdfErstellen.find(ep => ep.record_id === p.record_id);
                    if (ep) overlay.push({ type: 'rechnungs_pdf_erstellen', record: ep });
                  }}
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
                  onOpenFahrzeuge={f => {
                    const ef = enrichedFahrzeuge.find(ef => ef.record_id === f.record_id);
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
                  title={r.fields.pdf_rechnungsnummer || appLabel('rechnungs_pdf_erstellen')}
                  subtitle={r.rechnungName}
                />
                <RechnungsPdfErstellenDetails
                  record={r}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={rech => {
                    const er = enrichedRechnungen.find(er => er.record_id === rech.record_id);
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
            const a = top.record;
            const statusKey = lookupKey(a.fields.status);
            if (statusKey === 'abgeschlossen') return undefined;
            return {
              label: statusKey === 'offen' ? tx('In Bearbeitung setzen') : tx('Abschließen'),
              onClick: () => { advanceAuftragStatus(a); overlay.close(); },
            };
          }
          if (top.type === 'rechnungen') {
            const r = top.record;
            if (lookupKey(r.fields.status_rechnung) === 'bezahlt') return undefined;
            return {
              label: tx('Als bezahlt markieren'),
              onClick: () => { markRechnungBezahlt(r); overlay.close(); },
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'auftraege') {
            setAuftragDialog({ open: true, defaults: top.record.fields as AuftraegeDialogDefaults, recordId: top.record.record_id });
            overlay.close();
          } else if (top.type === 'fahrzeuge') {
            setFahrzeugeDialogState({ open: true, defaults: top.record.fields as FahrzeugeDialogDefaults, recordId: top.record.record_id });
            overlay.close();
          } else if (top.type === 'kunden') {
            setKundenDialogOpen(true);
            overlay.close();
          } else if (top.type === 'rechnungen') {
            setRechnungenDialog({ open: true, defaults: top.record.fields as RechnungenDialogDefaults, recordId: top.record.record_id });
            overlay.close();
          } else if (top.type === 'jahresinspektion_planen') {
            setInspektionDialog({ open: true, defaults: top.record.fields as JahresinspektionPlanenDialogDefaults, recordId: top.record.record_id });
            overlay.close();
          } else if (top.type === 'rechnungs_pdf_erstellen') {
            setPdfDialog({ open: true, defaults: top.record.fields as RechnungsPdfErstellenDialogDefaults, recordId: top.record.record_id });
            overlay.close();
          }
        }}
      />

      {/* Dialogs */}
      <AuftraegeDialog
        open={auftragDialog.open}
        onClose={() => setAuftragDialog({ open: false })}
        onSubmit={async fields => {
          if (auftragDialog.recordId) {
            await LivingAppsService.updateAuftraegeEntry(auftragDialog.recordId, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={auftragDialog.defaults}
        recordId={auftragDialog.recordId}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />

      <FahrzeugeDialog
        open={fahrzeugeDialogState.open}
        onClose={() => setFahrzeugeDialogState({ open: false })}
        onSubmit={async fields => {
          if (fahrzeugeDialogState.recordId) {
            await LivingAppsService.updateFahrzeugeEntry(fahrzeugeDialogState.recordId, fields);
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={fahrzeugeDialogState.defaults}
        recordId={fahrzeugeDialogState.recordId}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />

      <KundenDialog
        open={kundenDialogOpen}
        onClose={() => setKundenDialogOpen(false)}
        onSubmit={async fields => {
          await LivingAppsService.createKundenEntry(fields);
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />

      <RechnungenDialog
        open={rechnungenDialog.open}
        onClose={() => setRechnungenDialog({ open: false })}
        onSubmit={async fields => {
          if (rechnungenDialog.recordId) {
            await LivingAppsService.updateRechnungenEntry(rechnungenDialog.recordId, fields);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
          }
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
          if (inspektionDialog.recordId) {
            await LivingAppsService.updateJahresinspektionPlanenEntry(inspektionDialog.recordId, fields);
          } else {
            await LivingAppsService.createJahresinspektionPlanenEntry(fields);
          }
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
          if (pdfDialog.recordId) {
            await LivingAppsService.updateRechnungsPdfErstellenEntry(pdfDialog.recordId, fields);
          } else {
            await LivingAppsService.createRechnungsPdfErstellenEntry(fields);
          }
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
