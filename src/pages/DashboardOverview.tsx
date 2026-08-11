import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedFahrzeuge, EnrichedAuftraege, EnrichedRechnungen, EnrichedJahresinspektionPlanen, EnrichedRechnungsPdfErstellen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard, KanbanColumn } from '@/components/widgets/KanbanWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
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
import { RechnungsPdfErstellenDialog } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import type { AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import type { RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import type { JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import type { FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import type { RechnungsPdfErstellenDialogDefaults } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { makeT } from '@/i18n';
import { tc } from '@/i18n/common';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { format } from 'date-fns';
import {
  IconCar,
  IconAlertTriangle,
  IconPlus,
  IconClipboardList,
  IconFileInvoice,
  IconTool,
  IconUsers,
  IconCalendarEvent,
  IconCheck,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    contextNone: 'Keine offenen Aufträge — alles erledigt.',
    contextWork: 'In Bearbeitung: {names}.',
    newAuftrag: 'Neuer Auftrag',
    newKunde: 'Neuer Kunde',
    newFahrzeug: 'Neues Fahrzeug',
    newRechnung: 'Neue Rechnung',
    heroMsg: '{count} überfällige Rechnung{pl} — {names}.',
    heroAction: 'Als bezahlt markieren',
    auftraegeHeute: 'Termine heute',
    auftraegeNaechste: 'Nächste Termine',
    ueberfaelligeRechnungen: 'Offene Rechnungen',
    inspektionen: 'Anstehende Inspektionen',
    keineMwst: 'Kein Termin',
    naechsterTermin: 'Nächster Termin: {date}',
    ersteKunde: 'Ersten Kunden anlegen',
    erstesFahrzeug: 'Erstes Fahrzeug anlegen',
    ersteFahrt: 'Ersten Auftrag anlegen',
    alleAktuell: 'Alle Rechnungen bezahlt',
    keineInspektion: 'Keine Inspektion geplant',
    auftragAbschliessen: '✓ Abschließen',
    auftragStarten: '→ In Bearbeitung',
    inspektionFaellig: '{count} Inspektion{pl} in den nächsten 7 Tagen',
    bezahlt: 'Bezahlt',
    in_bearbeitung: 'In Bearbeitung',
    bezahlt_2: '✓ Bezahlt',
    als_bezahlt_markieren: '✓ Als bezahlt markieren',
  },
  en: {
    contextNone: 'No open orders — everything done.',
    contextWork: 'In progress: {names}.',
    newAuftrag: 'New Order',
    newKunde: 'New Customer',
    newFahrzeug: 'New Vehicle',
    newRechnung: 'New Invoice',
    heroMsg: '{count} overdue invoice{pl} — {names}.',
    heroAction: 'Mark as paid',
    auftraegeHeute: 'Appointments today',
    auftraegeNaechste: 'Next appointments',
    ueberfaelligeRechnungen: 'Open invoices',
    inspektionen: 'Upcoming inspections',
    keineMwst: 'No appointment',
    naechsterTermin: 'Next appointment: {date}',
    ersteKunde: 'Add first customer',
    erstesFahrzeug: 'Add first vehicle',
    ersteFahrt: 'Add first order',
    alleAktuell: 'All invoices paid',
    keineInspektion: 'No inspection planned',
    auftragAbschliessen: '✓ Complete',
    auftragStarten: '→ Start',
    inspektionFaellig: '{count} inspection{pl} in the next 7 days',
    bezahlt: 'Paid',
    in_bearbeitung: 'In Progress',
    bezahlt_2: '✓ Paid',
    als_bezahlt_markieren: '✓ Mark as Paid',
  },
});

type OverlayItem =
  | { type: 'kunde'; record: Kunden }
  | { type: 'fahrzeug'; record: EnrichedFahrzeuge }
  | { type: 'auftrag'; record: EnrichedAuftraege }
  | { type: 'rechnung'; record: EnrichedRechnungen }
  | { type: 'inspektion'; record: EnrichedJahresinspektionPlanen }
  | { type: 'pdferstellen'; record: EnrichedRechnungsPdfErstellen };

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

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [kundeDialog, setKundeDialog] = useState(false);
  const [fahrzeugDialog, setFahrzeugDialog] = useState<{ open: boolean; defaults?: FahrzeugeDialogDefaults; editId?: string }>({ open: false });
  const [auftragDialog, setAuftragDialog] = useState<{ open: boolean; defaults?: AuftraegeDialogDefaults; editId?: string }>({ open: false });
  const [rechnungDialog, setRechnungDialog] = useState<{ open: boolean; defaults?: RechnungenDialogDefaults; editId?: string }>({ open: false });
  const [inspektionDialog, setInspektionDialog] = useState<{ open: boolean; defaults?: JahresinspektionPlanenDialogDefaults; editId?: string }>({ open: false });
  const [pdfDialog, setPdfDialog] = useState<{ open: boolean; defaults?: RechnungsPdfErstellenDialogDefaults; editId?: string }>({ open: false });

  // Derived data
  const today = format(clock, 'yyyy-MM-dd');

  const auftraegeColumns: KanbanColumn[] = useMemo(
    () => (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    []
  );

  const auftraegeCards: KanbanCard[] = useMemo(() =>
    enrichedAuftraege
      .sort((a, b) => (a.fields.wunschtermin ?? '').localeCompare(b.fields.wunschtermin ?? ''))
      .map(r => ({
        id: `auftrag:${r.record_id}`,
        column: r.fields.status?.key ?? '',
        title: r.fahrzeugName || r.fields.auftragsnummer || '—',
        subtitle: [r.kundeName, r.fields.wunschtermin ? formatDate(r.fields.wunschtermin) : null]
          .filter(Boolean).join(' · '),
        tone: r.fields.prioritaet?.key === 'hoch' ? 'warning' as const : 'default' as const,
      })),
    [enrichedAuftraege]
  );

  const offeneRechnungen = useMemo(
    () => enrichedRechnungen.filter(r => r.fields.status_rechnung?.key === 'offen' || r.fields.status_rechnung?.key === 'ueberfaellig'),
    [enrichedRechnungen]
  );

  const ueberfaelligeRechnungen = useMemo(
    () => enrichedRechnungen.filter(r => r.fields.status_rechnung?.key === 'ueberfaellig'),
    [enrichedRechnungen]
  );

  const auftraegeHeute = useMemo(
    () => enrichedAuftraege.filter(r => r.fields.wunschtermin?.slice(0, 10) === today && r.fields.status?.key !== 'abgeschlossen'),
    [enrichedAuftraege, today]
  );

  const inspektionenBald = useMemo(() => {
    const in7 = format(new Date(clock.getTime() + 7 * 86400000), 'yyyy-MM-dd');
    return enrichedJahresinspektionPlanen.filter(r => {
      const d = r.fields.wunschtermin_inspektion?.slice(0, 10);
      return d && d >= today && d <= in7;
    });
  }, [enrichedJahresinspektionPlanen, today, clock]);

  const inBearbeitung = useMemo(
    () => enrichedAuftraege.filter(r => r.fields.status?.key === 'in_bearbeitung'),
    [enrichedAuftraege]
  );

  // Context line
  const contextLine = useMemo(() => {
    if (inBearbeitung.length > 0) {
      const names = namen(inBearbeitung.map(r => r.fahrzeugName || r.kundeName || ''));
      return tt('contextWork', { names });
    }
    return tt('contextNone');
  }, [inBearbeitung]);

  // Advance auftrag status
  const advanceAuftrag = useCallback(async (r: EnrichedAuftraege) => {
    const currentKey = r.fields.status?.key;
    const nextKey = currentKey === 'offen' ? 'in_bearbeitung' : currentKey === 'in_bearbeitung' ? 'abgeschlossen' : null;
    if (!nextKey) return;
    const nextLabel = auftraegeColumns.find(c => c.key === nextKey)?.label ?? nextKey;
    const prevStatus = r.fields.status;
    setAuftraege(prev => prev.map(a => a.record_id === r.record_id
      ? { ...a, fields: { ...a.fields, status: { key: nextKey, label: nextLabel } } }
      : a
    ));
    try {
      await LivingAppsService.updateAuftraegeEntry(r.record_id, { status: nextKey });
      undoToast(`${r.fahrzeugName || r.fields.auftragsnummer} — ${nextLabel}`, async () => {
        setAuftraege(prev => prev.map(a => a.record_id === r.record_id
          ? { ...a, fields: { ...a.fields, status: prevStatus } }
          : a
        ));
        await LivingAppsService.updateAuftraegeEntry(r.record_id, { status: prevStatus?.key });
      });
    } catch {
      await fetchAll();
    }
  }, [auftraegeColumns, setAuftraege, fetchAll]);

  // Mark invoice as paid
  const markRechnungBezahlt = useCallback(async (r: EnrichedRechnungen) => {
    const prevStatus = r.fields.status_rechnung;
    setRechnungen(prev => prev.map(re => re.record_id === r.record_id
      ? { ...re, fields: { ...re.fields, status_rechnung: { key: 'bezahlt', label: tt('bezahlt') } } }
      : re
    ));
    try {
      await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: 'bezahlt' });
      undoToast(`${r.fields.rechnungsnummer} — ${tc('abgeschlossen')}`, async () => {
        setRechnungen(prev => prev.map(re => re.record_id === r.record_id
          ? { ...re, fields: { ...re.fields, status_rechnung: prevStatus } }
          : re
        ));
        await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: prevStatus?.key });
      });
    } catch {
      await fetchAll();
    }
  }, [setRechnungen, fetchAll]);

  // ─── Every hook goes ABOVE this line ───────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below this line: plain derivations and JSX only ───────────────────

  const handleCardMove = async (cardId: string, newColumn: string) => {
    const id = cardId.split(':')[1];
    const auftrag = enrichedAuftraege.find(a => a.record_id === id);
    if (!auftrag) return;
    const newLabel = auftraegeColumns.find(c => c.key === newColumn)?.label ?? newColumn;
    const prevStatus = auftrag.fields.status;
    setAuftraege(prev => prev.map(a => a.record_id === id
      ? { ...a, fields: { ...a.fields, status: { key: newColumn, label: newLabel } } }
      : a
    ));
    try {
      await LivingAppsService.updateAuftraegeEntry(id, { status: newColumn });
      undoToast(`${auftrag.fahrzeugName || auftrag.fields.auftragsnummer} — ${newLabel}`, async () => {
        setAuftraege(prev => prev.map(a => a.record_id === id
          ? { ...a, fields: { ...a.fields, status: prevStatus } }
          : a
        ));
        await LivingAppsService.updateAuftraegeEntry(id, { status: prevStatus?.key });
      });
    } catch {
      await fetchAll();
    }
  };

  const handleCardClick = (card: KanbanCard) => {
    const id = card.id.split(':')[1];
    const auftrag = enrichedAuftraege.find(a => a.record_id === id);
    if (auftrag) overlay.replace({ type: 'auftrag', record: auftrag });
  };

  const heroRechnung = ueberfaelligeRechnungen[0];

  // Empty state
  if (auftraege.length === 0 && kunden.length === 0 && fahrzeuge.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <IconTool size={48} className="text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold mb-2">{gruss(clock)}</h1>
          <p className="text-muted-foreground">{tt('ersteKunde')}</p>
        </div>
        <button
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          onClick={() => setKundeDialog(true)}
        >
          <IconUsers size={16} className="shrink-0" />
          {tt('newKunde')}
        </button>
        <KundenDialog
          open={kundeDialog}
          onClose={() => setKundeDialog(false)}
          onSubmit={async (fields) => { await LivingAppsService.createKundenEntry(fields); fetchAll(); }}
          enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
        />
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-0.5">{contextLine}</p>
        </div>
        <button
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium shrink-0"
          onClick={() => setAuftragDialog({ open: true })}
        >
          <IconPlus size={16} className="shrink-0" />
          {tt('newAuftrag')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaelligeRechnungen.length > 0 ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tt('heroAction'),
              onClick: () => heroRechnung && markRechnungBezahlt(heroRechnung),
            }}
          >
            <b>{namen(ueberfaelligeRechnungen.map(r => r.kundeName || r.fields.rechnungsnummer || ''))}</b>
            {' '}—{' '}
            {tt('heroMsg', {
              count: String(ueberfaelligeRechnungen.length),
              pl: ueberfaelligeRechnungen.length !== 1 ? 'en' : '',
              names: '',
            })}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tc('offen')}
              value={auftraegeCards.filter(c => c.column === 'offen').length}
              icon={<IconClipboardList size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tt('in_bearbeitung')}
              value={auftraegeCards.filter(c => c.column === 'in_bearbeitung').length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={inBearbeitung.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tc('ueberfaellig')}
              value={ueberfaelligeRechnungen.length}
              icon={<IconFileInvoice size={16} className="shrink-0" />}
              tone={ueberfaelligeRechnungen.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={appLabel_Fahrzeuge()}
              value={fahrzeuge.length}
              icon={<IconCar size={16} className="shrink-0" />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={auftraegeColumns}
            cards={auftraegeCards}
            onCardClick={handleCardClick}
            onCardMove={handleCardMove}
            onAddCard={(column) => setAuftragDialog({ open: true, defaults: { status: column } })}
            defaultCollapsed={['abgeschlossen']}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('auftraegeHeute')}
              items={auftraegeHeute.map(r => ({
                id: r.record_id,
                title: r.fahrzeugName || r.fields.auftragsnummer || '—',
                secondLine: (
                  <>
                    <span className={r.fields.status?.key === 'in_bearbeitung' ? 'font-medium text-primary' : 'text-muted-foreground'}>
                      {r.fields.status?.label ?? '—'}
                    </span>
                    {r.kundeName ? <span className="text-muted-foreground"> · {r.kundeName}</span> : null}
                  </>
                ),
                action: r.fields.status?.key !== 'abgeschlossen'
                  ? {
                    label: r.fields.status?.key === 'offen' ? tt('auftragStarten') : tt('auftragAbschliessen'),
                    onClick: () => advanceAuftrag(r),
                  }
                  : undefined,
              }))}
              onItemClick={(id) => {
                const r = enrichedAuftraege.find(a => a.record_id === id);
                if (r) overlay.replace({ type: 'auftrag', record: r });
              }}
              empty={{
                text: (() => {
                  const next = enrichedAuftraege
                    .filter(r => r.fields.wunschtermin && r.fields.status?.key !== 'abgeschlossen')
                    .sort((a, b) => (a.fields.wunschtermin ?? '').localeCompare(b.fields.wunschtermin ?? ''))[0];
                  return next
                    ? tt('naechsterTermin', { date: formatDate(next.fields.wunschtermin) })
                    : tt('keineMwst');
                })(),
                action: { label: tt('newAuftrag'), onClick: () => setAuftragDialog({ open: true }) },
              }}
            />
            <WorkList
              title={tt('ueberfaelligeRechnungen')}
              items={offeneRechnungen
                .sort((a, b) => (a.fields.faelligkeitsdatum ?? '').localeCompare(b.fields.faelligkeitsdatum ?? ''))
                .map(r => ({
                  id: r.record_id,
                  title: r.fields.rechnungsnummer || '—',
                  secondLine: (
                    <>
                      <span className={r.fields.status_rechnung?.key === 'ueberfaellig' ? 'font-medium text-destructive' : 'font-medium text-warning'}>
                        {r.fields.status_rechnung?.label ?? '—'}
                      </span>
                      {r.kundeName ? <span className="text-muted-foreground"> · {r.kundeName}</span> : null}
                      {r.fields.bruttobetrag != null
                        ? <span className="text-muted-foreground"> · {formatCurrency(r.fields.bruttobetrag)}</span>
                        : null}
                    </>
                  ),
                  action: {
                    label: tt('bezahlt_2'),
                    onClick: () => markRechnungBezahlt(r),
                  },
                }))}
              onItemClick={(id) => {
                const r = enrichedRechnungen.find(re => re.record_id === id);
                if (r) overlay.replace({ type: 'rechnung', record: r });
              }}
              empty={{
                text: tt('alleAktuell'),
                action: { label: tt('newRechnung'), onClick: () => setRechnungDialog({ open: true }) },
              }}
            />
          </>
        }
      />

      {/* Record Overlay Stack — ONE shell for all types */}
      <RecordOverlayHost
        overlay={overlay}
        render={(top) => {
          if (top.type === 'kunde') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={[r.fields.vorname, r.fields.nachname].filter(Boolean).join(' ') || '—'}
                  subtitle={r.fields.ort}
                  badges={r.fields.telefon ? (
                    <a href={`tel:${r.fields.telefon}`} className="text-sm text-primary underline-offset-2 hover:underline">{r.fields.telefon}</a>
                  ) : undefined}
                />
                <KundenDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={(fz) => overlay.push({ type: 'fahrzeug', record: enrichedFahrzeuge.find(ef => ef.record_id === fz.record_id) ?? { ...fz, kundeName: '' } })}
                  onAddFahrzeuge={() => setFahrzeugDialog({ open: true, defaults: { kunde: r.record_id } })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={(a) => overlay.push({ type: 'auftrag', record: enrichedAuftraege.find(ea => ea.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onAddAuftraege={() => setAuftragDialog({ open: true, defaults: { kunde: r.record_id } })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={(re) => overlay.push({ type: 'rechnung', record: enrichedRechnungen.find(er => er.record_id === re.record_id) ?? { ...re, auftragName: '', kundeName: '' } })}
                  onAddRechnungen={() => setRechnungDialog({ open: true, defaults: { kunde: r.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'fahrzeug') {
            const r = top.record;
            const kunde = kundenMap.get(extractRecordId(r.fields.kunde) ?? '');
            return (
              <>
                <RecordHeader
                  title={[r.fields.marke, r.fields.modell, r.fields.kennzeichen].filter(Boolean).join(' ') || '—'}
                  subtitle={r.kundeName || undefined}
                />
                <FahrzeugeDetails
                  record={r}
                  kundenList={kunden}
                  onOpenKunden={(k) => overlay.push({ type: 'kunde', record: k })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={(a) => overlay.push({ type: 'auftrag', record: enrichedAuftraege.find(ea => ea.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  onAddAuftraege={() => setAuftragDialog({ open: true, defaults: { fahrzeug: r.record_id } })}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={(ip) => overlay.push({ type: 'inspektion', record: enrichedJahresinspektionPlanen.find(ei => ei.record_id === ip.record_id) ?? { ...ip, fahrzeugName: '' } })}
                  onAddJahresinspektionPlanen={() => setInspektionDialog({ open: true, defaults: { fahrzeug: r.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'auftrag') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fahrzeugName || r.fields.auftragsnummer || '—'}
                  subtitle={r.kundeName || undefined}
                  badges={r.fields.status ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {r.fields.status.label}
                    </span>
                  ) : undefined}
                />
                <AuftraegeDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={(fz) => overlay.push({ type: 'fahrzeug', record: enrichedFahrzeuge.find(ef => ef.record_id === fz.record_id) ?? { ...fz, kundeName: '' } })}
                  kundenList={kunden}
                  onOpenKunden={(k) => overlay.push({ type: 'kunde', record: k })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={(re) => overlay.push({ type: 'rechnung', record: enrichedRechnungen.find(er => er.record_id === re.record_id) ?? { ...re, auftragName: '', kundeName: '' } })}
                  onAddRechnungen={() => setRechnungDialog({ open: true, defaults: { auftrag: r.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'rechnung') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fields.rechnungsnummer || '—'}
                  subtitle={r.kundeName || undefined}
                  badges={r.fields.status_rechnung ? (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.fields.status_rechnung.key === 'ueberfaellig' ? 'bg-destructive/10 text-destructive' : r.fields.status_rechnung.key === 'bezahlt' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                      {r.fields.status_rechnung.label}
                    </span>
                  ) : undefined}
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={(a) => overlay.push({ type: 'auftrag', record: enrichedAuftraege.find(ea => ea.record_id === a.record_id) ?? { ...a, fahrzeugName: '', kundeName: '' } })}
                  kundenList={kunden}
                  onOpenKunden={(k) => overlay.push({ type: 'kunde', record: k })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={(pdf) => overlay.push({ type: 'pdferstellen', record: enrichedRechnungsPdfErstellen.find(ep => ep.record_id === pdf.record_id) ?? { ...pdf, rechnungName: '' } })}
                  onAddRechnungsPdfErstellen={() => setPdfDialog({ open: true, defaults: { rechnung: r.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'inspektion') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fahrzeugName || '—'}
                  subtitle={r.fields.wunschtermin_inspektion ? formatDate(r.fields.wunschtermin_inspektion) : undefined}
                />
                <JahresinspektionPlanenDetails
                  record={r}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={(fz) => overlay.push({ type: 'fahrzeug', record: enrichedFahrzeuge.find(ef => ef.record_id === fz.record_id) ?? { ...fz, kundeName: '' } })}
                />
              </>
            );
          }
          if (top.type === 'pdferstellen') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fields.pdf_rechnungsnummer || '—'}
                  subtitle={[r.fields.pdf_kunde_vorname, r.fields.pdf_kunde_nachname].filter(Boolean).join(' ') || undefined}
                />
                <RechnungsPdfErstellenDetails
                  record={r}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={(re) => overlay.push({ type: 'rechnung', record: enrichedRechnungen.find(er => er.record_id === re.record_id) ?? { ...re, auftragName: '', kundeName: '' } })}
                />
              </>
            );
          }
          return null;
        }}
        footer={(top) => {
          if (top.type === 'auftrag' && top.record.fields.status?.key !== 'abgeschlossen') {
            return {
              label: top.record.fields.status?.key === 'offen' ? tt('auftragStarten') : tt('auftragAbschliessen'),
              onClick: () => advanceAuftrag(top.record),
            };
          }
          if (top.type === 'rechnung' && top.record.fields.status_rechnung?.key !== 'bezahlt') {
            return {
              label: tt('als_bezahlt_markieren'),
              onClick: () => markRechnungBezahlt(top.record),
            };
          }
          return undefined;
        }}
        onEdit={(top) => {
          if (top.type === 'auftrag') {
            setAuftragDialog({ open: true, defaults: top.record.fields as AuftraegeDialogDefaults, editId: top.record.record_id });
            overlay.close();
          } else if (top.type === 'rechnung') {
            setRechnungDialog({ open: true, defaults: top.record.fields as RechnungenDialogDefaults, editId: top.record.record_id });
            overlay.close();
          } else if (top.type === 'fahrzeug') {
            setFahrzeugDialog({ open: true, defaults: top.record.fields as FahrzeugeDialogDefaults, editId: top.record.record_id });
            overlay.close();
          }
        }}
      />

      {/* Dialogs */}
      <KundenDialog
        open={kundeDialog}
        onClose={() => setKundeDialog(false)}
        onSubmit={async (fields) => { await LivingAppsService.createKundenEntry(fields); undoToast(tc('erstellt')); fetchAll(); }}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />

      <FahrzeugeDialog
        open={fahrzeugDialog.open}
        onClose={() => setFahrzeugDialog({ open: false })}
        onSubmit={async (fields) => {
          if (fahrzeugDialog.editId) {
            await LivingAppsService.updateFahrzeugeEntry(fahrzeugDialog.editId, fields);
            undoToast(tc('aktualisiert'));
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
            undoToast(tc('erstellt'));
          }
          fetchAll();
        }}
        defaultValues={fahrzeugDialog.defaults}
        recordId={fahrzeugDialog.editId}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />

      <AuftraegeDialog
        open={auftragDialog.open}
        onClose={() => setAuftragDialog({ open: false })}
        onSubmit={async (fields) => {
          if (auftragDialog.editId) {
            await LivingAppsService.updateAuftraegeEntry(auftragDialog.editId, fields);
            undoToast(tc('aktualisiert'));
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
            undoToast(tc('erstellt'));
          }
          fetchAll();
        }}
        defaultValues={auftragDialog.defaults}
        recordId={auftragDialog.editId}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />

      <RechnungenDialog
        open={rechnungDialog.open}
        onClose={() => setRechnungDialog({ open: false })}
        onSubmit={async (fields) => {
          if (rechnungDialog.editId) {
            await LivingAppsService.updateRechnungenEntry(rechnungDialog.editId, fields);
            undoToast(tc('aktualisiert'));
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
            undoToast(tc('erstellt'));
          }
          fetchAll();
        }}
        defaultValues={rechnungDialog.defaults}
        recordId={rechnungDialog.editId}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />

      <JahresinspektionPlanenDialog
        open={inspektionDialog.open}
        onClose={() => setInspektionDialog({ open: false })}
        onSubmit={async (fields) => {
          if (inspektionDialog.editId) {
            await LivingAppsService.updateJahresinspektionPlanenEntry(inspektionDialog.editId, fields);
            undoToast(tc('aktualisiert'));
          } else {
            await LivingAppsService.createJahresinspektionPlanenEntry(fields);
            undoToast(tc('erstellt'));
          }
          fetchAll();
        }}
        defaultValues={inspektionDialog.defaults}
        recordId={inspektionDialog.editId}
        fahrzeugeList={fahrzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />

      <RechnungsPdfErstellenDialog
        open={pdfDialog.open}
        onClose={() => setPdfDialog({ open: false })}
        onSubmit={async (fields) => {
          if (pdfDialog.editId) {
            await LivingAppsService.updateRechnungsPdfErstellenEntry(pdfDialog.editId, fields);
            undoToast(tc('aktualisiert'));
          } else {
            await LivingAppsService.createRechnungsPdfErstellenEntry(fields);
            undoToast(tc('erstellt'));
          }
          fetchAll();
        }}
        defaultValues={pdfDialog.defaults}
        recordId={pdfDialog.editId}
        rechnungenList={rechnungen}
        enablePhotoScan={AI_PHOTO_SCAN['RechnungsPdfErstellen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['RechnungsPdfErstellen']}
      />
    </>
  );
}

function appLabel_Fahrzeuge() {
  return 'Fahrzeuge'; /* i18n-exempt — entity name used as label */
}
