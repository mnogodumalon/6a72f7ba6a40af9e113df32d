import { useState, useMemo, useCallback } from 'react';
import { format, parseISO, isAfter, isBefore, startOfDay, endOfDay, addDays } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { EnrichedFahrzeuge, EnrichedAuftraege, EnrichedRechnungen, EnrichedJahresinspektionPlanen, EnrichedRechnungsPdfErstellen } from '@/types/enriched';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
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
  RecordOverlay,
} from '@/components/widgets/RecordView';
import { AuftraegeDetails } from '@/components/details/AuftraegeDetails';
import { FahrzeugeDetails } from '@/components/details/FahrzeugeDetails';
import { KundenDetails } from '@/components/details/KundenDetails';
import { RechnungenDetails } from '@/components/details/RechnungenDetails';
import { JahresinspektionPlanenDetails } from '@/components/details/JahresinspektionPlanenDetails';
import { RechnungsPdfErstellenDetails } from '@/components/details/RechnungsPdfErstellenDetails';
import { AuftraegeDialog, type AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import { KundenDialog } from '@/components/dialogs/KundenDialog';
import { FahrzeugeDialog, type FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import { RechnungenDialog, type RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import { JahresinspektionPlanenDialog, type JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { RechnungsPdfErstellenDialog } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import { IconTool, IconAlertTriangle, IconPlus, IconCar, IconReceipt } from '@tabler/icons-react';

// Pre-generated overlay union
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

  // Dialog state
  const [auftragDialogOpen, setAuftragDialogOpen] = useState(false);
  const [auftragDefaults, setAuftragDefaults] = useState<AuftraegeDialogDefaults | undefined>(undefined);
  const [editingAuftrag, setEditingAuftrag] = useState<EnrichedAuftraege | undefined>(undefined);

  const [kundenDialogOpen, setKundenDialogOpen] = useState(false);
  const [editingKunde, setEditingKunde] = useState<Kunden | undefined>(undefined);

  const [fahrzeugDialogOpen, setFahrzeugDialogOpen] = useState(false);
  const [fahrzeugDefaults, setFahrzeugDefaults] = useState<FahrzeugeDialogDefaults | undefined>(undefined);
  const [editingFahrzeug, setEditingFahrzeug] = useState<EnrichedFahrzeuge | undefined>(undefined);

  const [rechnungDialogOpen, setRechnungDialogOpen] = useState(false);
  const [rechnungDefaults, setRechnungDefaults] = useState<RechnungenDialogDefaults | undefined>(undefined);
  const [editingRechnung, setEditingRechnung] = useState<EnrichedRechnungen | undefined>(undefined);

  const [inspektionDialogOpen, setInspektionDialogOpen] = useState(false);
  const [inspektionDefaults, setInspektionDefaults] = useState<JahresinspektionPlanenDialogDefaults | undefined>(undefined);
  const [editingInspektion, setEditingInspektion] = useState<EnrichedJahresinspektionPlanen | undefined>(undefined);

  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [editingPdf, setEditingPdf] = useState<EnrichedRechnungsPdfErstellen | undefined>(undefined);

  // Overlay stack
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Columns from LOOKUP_OPTIONS — inside component body for locale-awareness
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Kanban cards
  const kanbanCards = useMemo<KanbanCard[]>(
    () =>
      enrichedAuftraege
        .sort((a, b) => (a.fields.wunschtermin ?? '').localeCompare(b.fields.wunschtermin ?? ''))
        .map(a => {
          const status = lookupKey(a.fields.status) ?? 'offen';
          return {
            id: `auftrag:${a.record_id}`,
            column: status,
            title: a.fahrzeugName || a.fields.auftragsnummer || tx('Auftrag'),
            subtitle: [
              a.kundeName,
              a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : undefined,
              a.fields.prioritaet?.label,
            ].filter(Boolean).join(' · '),
            tone: toneForStatus(status),
          };
        }),
    [enrichedAuftraege],
  );

  // Status-advance helper
  const advanceStatus = useCallback(async (auftrag: EnrichedAuftraege) => {
    const current = lookupKey(auftrag.fields.status) ?? 'offen';
    const next = current === 'offen' ? 'in_bearbeitung' : current === 'in_bearbeitung' ? 'abgeschlossen' : null;
    if (!next) return;
    const nextLabel = COLUMNS.find(c => c.key === next)?.label ?? next;
    const snapshot = auftrag.fields.status;
    setAuftraege(prev =>
      prev.map(a =>
        a.record_id === auftrag.record_id
          ? { ...a, fields: { ...a.fields, status: { key: next, label: nextLabel } } }
          : a,
      ),
    );
    try {
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: next });
      undoToast(tx`${auftrag.fahrzeugName || auftrag.fields.auftragsnummer || ''} — ${nextLabel}`, async () => {
        setAuftraege(prev =>
          prev.map(a =>
            a.record_id === auftrag.record_id
              ? { ...a, fields: { ...a.fields, status: snapshot } }
              : a,
          ),
        );
        await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: lookupKey(snapshot) ?? current });
      });
    } catch {
      await fetchAll();
    }
  }, [COLUMNS, setAuftraege, fetchAll]);

  // Mark invoice as paid
  const markRechnungBezahlt = useCallback(async (rechnung: EnrichedRechnungen) => {
    const snapshot = rechnung.fields.status_rechnung;
    setRechnungen(prev =>
      prev.map(r =>
        r.record_id === rechnung.record_id
          ? { ...r, fields: { ...r.fields, status_rechnung: { key: 'bezahlt', label: tx('Bezahlt') } } }
          : r,
      ),
    );
    try {
      await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: 'bezahlt' });
      undoToast(tx`${rechnung.fields.rechnungsnummer || ''} — ${tx('als bezahlt markiert')}`, async () => {
        setRechnungen(prev =>
          prev.map(r =>
            r.record_id === rechnung.record_id
              ? { ...r, fields: { ...r.fields, status_rechnung: snapshot } }
              : r,
          ),
        );
        await LivingAppsService.updateRechnungenEntry(rechnung.record_id, { status_rechnung: lookupKey(snapshot) ?? 'offen' });
      });
    } catch {
      await fetchAll();
    }
  }, [setRechnungen, fetchAll]);

  // Move card on kanban drag
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const auftrag = enrichedAuftraege.find(a => a.record_id === rid);
    if (!auftrag) return;
    const newLabel = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    const snapshot = auftrag.fields.status;
    setAuftraege(prev =>
      prev.map(a =>
        a.record_id === rid
          ? { ...a, fields: { ...a.fields, status: { key: newColumn, label: newLabel } } }
          : a,
      ),
    );
    try {
      await LivingAppsService.updateAuftraegeEntry(rid, { status: newColumn });
      undoToast(tx`${auftrag.fahrzeugName || auftrag.fields.auftragsnummer || ''} — ${newLabel}`, async () => {
        setAuftraege(prev =>
          prev.map(a =>
            a.record_id === rid
              ? { ...a, fields: { ...a.fields, status: snapshot } }
              : a,
          ),
        );
        await LivingAppsService.updateAuftraegeEntry(rid, { status: lookupKey(snapshot) ?? 'offen' });
      });
    } catch {
      await fetchAll();
    }
  }, [enrichedAuftraege, COLUMNS, setAuftraege, fetchAll]);

  // ─── All hooks above, early returns below ───────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ─── Plain derivations only below ───────────────────────────────────────────
  const today = format(clock, 'yyyy-MM-dd');
  const todayStart = startOfDay(clock);
  const todayEnd = endOfDay(clock);
  const tomorrowEnd = endOfDay(addDays(clock, 1));

  // Überfällige Rechnungen
  const ueberfaelligeRechnungen = enrichedRechnungen.filter(r => {
    const key = lookupKey(r.fields.status_rechnung);
    if (key === 'bezahlt') return false;
    if (!r.fields.faelligkeitsdatum) return false;
    try {
      return isBefore(parseISO(r.fields.faelligkeitsdatum), todayStart);
    } catch { return false; }
  });

  // Offene Aufträge
  const offeneAuftraege = enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'offen');
  const inBearbeitungAuftraege = enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung');
  const abgeschlosseneAuftraege = enrichedAuftraege.filter(a => lookupKey(a.fields.status) === 'abgeschlossen');

  // Heutige und morgige Termine
  const heutigeTermine = enrichedAuftraege.filter(a => {
    if (!a.fields.wunschtermin) return false;
    try {
      const d = parseISO(a.fields.wunschtermin);
      return isAfter(d, todayStart) && isBefore(d, todayEnd);
    } catch { return false; }
  });

  const morgigeTermine = enrichedAuftraege.filter(a => {
    if (!a.fields.wunschtermin) return false;
    try {
      const d = parseISO(a.fields.wunschtermin);
      return isAfter(d, todayEnd) && isBefore(d, tomorrowEnd);
    } catch { return false; }
  });

  // Kontext-Zeile
  const kontextPersonen = namen(enrichedAuftraege.filter(a => {
    if (!a.fields.wunschtermin) return false;
    try {
      const d = parseISO(a.fields.wunschtermin);
      return isAfter(d, todayStart) && isBefore(d, todayEnd);
    } catch { return false; }
  }).map(a => a.kundeName || a.fahrzeugName || ''));

  // Helper: find enriched record from overlay id
  const findAuftrag = (id: string) => enrichedAuftraege.find(a => a.record_id === id);
  const findRechnung = (id: string) => enrichedRechnungen.find(r => r.record_id === id);
  const findFahrzeug = (id: string) => enrichedFahrzeuge.find(f => f.record_id === id);
  const findKunde = (id: string) => kunden.find(k => k.record_id === id);
  const findInspektion = (id: string) => enrichedJahresinspektionPlanen.find(i => i.record_id === id);
  const findPdf = (id: string) => enrichedRechnungsPdfErstellen.find(p => p.record_id === id);

  // Next advance label for overlay footer
  function nextStatusLabel(auftrag: EnrichedAuftraege): string | null {
    const cur = lookupKey(auftrag.fields.status) ?? 'offen';
    if (cur === 'offen') return tx('In Bearbeitung setzen');
    if (cur === 'in_bearbeitung') return tx('Abschließen');
    return null;
  }

  // Umsatz offene Rechnungen
  const offeneRechnungenSumme = enrichedRechnungen
    .filter(r => lookupKey(r.fields.status_rechnung) !== 'bezahlt')
    .reduce((s, r) => s + (r.fields.bruttobetrag ?? 0), 0);

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
        <p className="text-muted-foreground mt-1">
          {heutigeTermine.length > 0
            ? tx`Heute ${String(heutigeTermine.length)} Termin${heutigeTermine.length !== 1 ? 'e' : ''} — ${kontextPersonen || tx('Werkstatt im Einsatz')}`
            : inBearbeitungAuftraege.length > 0
            ? tx`${String(inBearbeitungAuftraege.length)} ${inBearbeitungAuftraege.length !== 1 ? tx('Aufträge in Bearbeitung') : tx('Auftrag in Bearbeitung')}`
            : tx('Keine Termine heute — ruhiger Tag in der Werkstatt.')}
        </p>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          ueberfaelligeRechnungen.length > 0
            ? (
              <HeroBanner
                icon={<IconAlertTriangle size={18} />}
                action={{
                  label: tx('Als bezahlt markieren'),
                  onClick: () => markRechnungBezahlt(ueberfaelligeRechnungen[0]),
                }}
              >
                <b>{namen(ueberfaelligeRechnungen.map(r => r.kundeName || r.fields.rechnungsnummer || ''))}</b>
                {' '}{ueberfaelligeRechnungen.length === 1 ? tx('hat eine überfällige Rechnung') : tx('haben überfällige Rechnungen')}
                {ueberfaelligeRechnungen[0].fields.faelligkeitsdatum && (
                  <> — {tx('fällig seit')} {formatDate(ueberfaelligeRechnungen[0].fields.faelligkeitsdatum)}</>
                )}
              </HeroBanner>
            )
            : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Offen')}
              value={offeneAuftraege.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={offeneAuftraege.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('In Bearbeitung')}
              value={inBearbeitungAuftraege.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={inBearbeitungAuftraege.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Abgeschlossen')}
              value={abgeschlosseneAuftraege.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone="success"
            />
            <StatStripItem
              title={tx('Offene Forderungen')}
              value={formatCurrency(offeneRechnungenSumme)}
              icon={<IconReceipt size={16} className="shrink-0" />}
              tone={ueberfaelligeRechnungen.length > 0 ? 'destructive' : offeneRechnungenSumme > 0 ? 'warning' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={kanbanCards}
            columns={COLUMNS}
            defaultCollapsed={['abgeschlossen']}
            onCardClick={card => {
              const rid = card.id.split(':')[1] ?? '';
              const a = findAuftrag(rid);
              if (a) overlay.replace({ type: 'auftraege', record: a });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setAuftragDefaults({ status: column });
              setEditingAuftrag(undefined);
              setAuftragDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Heutige Termine')}
              items={heutigeTermine.map(a => ({
                id: a.record_id,
                title: a.fahrzeugName || a.fields.auftragsnummer || tx('Auftrag'),
                secondLine: (
                  <>
                    <span className="font-medium text-primary">{a.kundeName}</span>
                    {a.fields.wunschtermin && (
                      <span className="text-muted-foreground"> · {formatDate(a.fields.wunschtermin)}</span>
                    )}
                    {a.fields.status && (
                      <span className="text-muted-foreground"> · {a.fields.status.label}</span>
                    )}
                  </>
                ),
                action: nextStatusLabel(a) ? {
                  label: nextStatusLabel(a)!,
                  onClick: () => advanceStatus(a),
                } : undefined,
              }))}
              onItemClick={id => {
                const a = findAuftrag(id);
                if (a) overlay.replace({ type: 'auftraege', record: a });
              }}
              empty={{
                text: morgigeTermine.length > 0
                  ? tx`Morgen: ${namen(morgigeTermine.map(a => a.fahrzeugName || a.kundeName || ''))}`
                  : tx('Keine Termine heute'),
                action: {
                  label: tx('Neuer Auftrag'),
                  onClick: () => { setAuftragDefaults(undefined); setEditingAuftrag(undefined); setAuftragDialogOpen(true); },
                },
              }}
            />
            <WorkList
              title={tx('Überfällige & offene Rechnungen')}
              items={[...ueberfaelligeRechnungen, ...enrichedRechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'offen' && !ueberfaelligeRechnungen.find(u => u.record_id === r.record_id))]
                .slice(0, 8)
                .map(r => ({
                  id: r.record_id,
                  title: r.fields.rechnungsnummer || tx('Rechnung'),
                  secondLine: (
                    <>
                      <span className={lookupKey(r.fields.status_rechnung) === 'ueberfaellig' || (r.fields.faelligkeitsdatum && isBefore(parseISO(r.fields.faelligkeitsdatum), todayStart)) ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                        {r.kundeName}
                      </span>
                      {r.fields.bruttobetrag != null && (
                        <span className="text-muted-foreground"> · {formatCurrency(r.fields.bruttobetrag)}</span>
                      )}
                      {r.fields.faelligkeitsdatum && (
                        <span className="text-muted-foreground"> · {formatDate(r.fields.faelligkeitsdatum)}</span>
                      )}
                    </>
                  ),
                  action: lookupKey(r.fields.status_rechnung) !== 'bezahlt' ? {
                    label: tx('Bezahlt'),
                    onClick: () => markRechnungBezahlt(r),
                  } : undefined,
                }))}
              onItemClick={id => {
                const r = findRechnung(id);
                if (r) overlay.replace({ type: 'rechnungen', record: r });
              }}
              empty={{
                text: tx('Alle Rechnungen bezahlt'),
                action: {
                  label: tx('Neue Rechnung'),
                  onClick: () => { setRechnungDefaults(undefined); setEditingRechnung(undefined); setRechnungDialogOpen(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Primary action button */}
      <div className="fixed bottom-6 right-6 z-10">
        <button
          onClick={() => { setAuftragDefaults(undefined); setEditingAuftrag(undefined); setAuftragDialogOpen(true); }}
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={18} className="shrink-0" />
          {tx('Neuer Auftrag')}
        </button>
      </div>

      {/* RecordOverlayHost — ONE shell for the whole stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftraege') {
            const rec = findAuftrag(top.record.record_id) ?? top.record;
            return (
              <>
                <RecordHeader
                  title={rec.fahrzeugName || rec.fields.auftragsnummer || appLabel('auftraege')}
                  subtitle={rec.fields.status?.label}
                  badges={rec.fields.prioritaet ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {rec.fields.prioritaet.label}
                    </span>
                  ) : undefined}
                  actions={
                    <button
                      onClick={() => { setEditingAuftrag(rec); setAuftragDefaults(rec.fields as AuftraegeDialogDefaults); setAuftragDialogOpen(true); overlay.close(); }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <AuftraegeDetails
                  record={rec}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => {
                    const ef = enrichedFahrzeuge.find(ef => ef.record_id === f.record_id);
                    if (ef) overlay.push({ type: 'fahrzeuge', record: ef });
                  }}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => {
                    const er = findRechnung(r.record_id);
                    if (er) overlay.push({ type: 'rechnungen', record: er });
                  }}
                  onAddRechnungen={() => {
                    setRechnungDefaults({ auftrag: rec.record_id, kunde: extractRecordId(rec.fields.kunde) ?? undefined });
                    setEditingRechnung(undefined);
                    setRechnungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'fahrzeuge') {
            const rec = findFahrzeug(top.record.record_id) ?? top.record;
            return (
              <>
                <RecordHeader
                  title={[rec.fields.kennzeichen, rec.fields.marke, rec.fields.modell].filter(Boolean).join(' · ') || appLabel('fahrzeuge')}
                  subtitle={rec.kundeName}
                  badges={<IconCar size={16} className="text-muted-foreground shrink-0" />}
                  actions={
                    <button
                      onClick={() => { setEditingFahrzeug(rec); setFahrzeugDefaults(rec.fields as FahrzeugeDialogDefaults); setFahrzeugDialogOpen(true); overlay.close(); }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <FahrzeugeDetails
                  record={rec}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunden', record: k })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = findAuftrag(a.record_id);
                    if (ea) overlay.push({ type: 'auftraege', record: ea });
                  }}
                  onAddAuftraege={() => {
                    setAuftragDefaults({ fahrzeug: rec.record_id });
                    setEditingAuftrag(undefined);
                    setAuftragDialogOpen(true);
                  }}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => {
                    const ei = findInspektion(i.record_id);
                    if (ei) overlay.push({ type: 'jahresinspektion_planen', record: ei });
                  }}
                  onAddJahresinspektionPlanen={() => {
                    setInspektionDefaults({ fahrzeug: rec.record_id });
                    setEditingInspektion(undefined);
                    setInspektionDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunden') {
            const rec = findKunde(top.record.record_id) ?? top.record;
            return (
              <>
                <RecordHeader
                  title={[rec.fields.vorname, rec.fields.nachname].filter(Boolean).join(' ') || appLabel('kunden')}
                  subtitle={rec.fields.telefon ?? rec.fields.email}
                  actions={
                    <button
                      onClick={() => { setEditingKunde(rec); setKundenDialogOpen(true); overlay.close(); }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <KundenDetails
                  record={rec}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => {
                    const ef = findFahrzeug(f.record_id);
                    if (ef) overlay.push({ type: 'fahrzeuge', record: ef });
                  }}
                  onAddFahrzeuge={() => {
                    setFahrzeugDefaults({ kunde: rec.record_id });
                    setEditingFahrzeug(undefined);
                    setFahrzeugDialogOpen(true);
                  }}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => {
                    const ea = findAuftrag(a.record_id);
                    if (ea) overlay.push({ type: 'auftraege', record: ea });
                  }}
                  onAddAuftraege={() => {
                    setAuftragDefaults({ kunde: rec.record_id });
                    setEditingAuftrag(undefined);
                    setAuftragDialogOpen(true);
                  }}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => {
                    const er = findRechnung(r.record_id);
                    if (er) overlay.push({ type: 'rechnungen', record: er });
                  }}
                  onAddRechnungen={() => {
                    setRechnungDefaults({ kunde: rec.record_id });
                    setEditingRechnung(undefined);
                    setRechnungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'rechnungen') {
            const rec = findRechnung(top.record.record_id) ?? top.record;
            return (
              <>
                <RecordHeader
                  title={rec.fields.rechnungsnummer || appLabel('rechnungen')}
                  subtitle={rec.kundeName}
                  actions={
                    <button
                      onClick={() => { setEditingRechnung(rec); setRechnungDefaults(rec.fields as RechnungenDialogDefaults); setRechnungDialogOpen(true); overlay.close(); }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <RechnungenDetails
                  record={rec}
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
                    setPdfDialogOpen(true);
                    setEditingPdf(undefined);
                  }}
                />
              </>
            );
          }
          if (top.type === 'jahresinspektion_planen') {
            const rec = findInspektion(top.record.record_id) ?? top.record;
            return (
              <>
                <RecordHeader
                  title={rec.fahrzeugName || appLabel('jahresinspektion_planen')}
                  subtitle={rec.fields.wunschtermin_inspektion ? formatDate(rec.fields.wunschtermin_inspektion) : undefined}
                  actions={
                    <button
                      onClick={() => { setEditingInspektion(rec); setInspektionDefaults(rec.fields as JahresinspektionPlanenDialogDefaults); setInspektionDialogOpen(true); overlay.close(); }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <JahresinspektionPlanenDetails
                  record={rec}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => {
                    const ef = findFahrzeug(f.record_id);
                    if (ef) overlay.push({ type: 'fahrzeuge', record: ef });
                  }}
                />
              </>
            );
          }
          if (top.type === 'rechnungs_pdf_erstellen') {
            const rec = findPdf(top.record.record_id) ?? top.record;
            return (
              <>
                <RecordHeader
                  title={rec.fields.pdf_rechnungsnummer || appLabel('rechnungs_pdf_erstellen')}
                  subtitle={rec.rechnungName}
                  actions={
                    <button
                      onClick={() => { setEditingPdf(rec); setPdfDialogOpen(true); overlay.close(); }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <RechnungsPdfErstellenDetails
                  record={rec}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => {
                    const er = findRechnung(r.record_id);
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
            const rec = findAuftrag(top.record.record_id) ?? top.record;
            const label = nextStatusLabel(rec);
            if (!label) return undefined;
            return { label, onClick: () => { void advanceStatus(rec); overlay.close(); } };
          }
          if (top.type === 'rechnungen') {
            const rec = findRechnung(top.record.record_id) ?? top.record;
            if (lookupKey(rec.fields.status_rechnung) !== 'bezahlt') {
              return { label: tx('Als bezahlt markieren'), onClick: () => { void markRechnungBezahlt(rec); overlay.close(); } };
            }
          }
          return undefined;
        }}
      />

      {/* Dialogs */}
      <AuftraegeDialog
        open={auftragDialogOpen}
        onClose={() => { setAuftragDialogOpen(false); setEditingAuftrag(undefined); setAuftragDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingAuftrag) {
            await LivingAppsService.updateAuftraegeEntry(editingAuftrag.record_id, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={auftragDefaults}
        recordId={editingAuftrag?.record_id}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />

      <KundenDialog
        open={kundenDialogOpen}
        onClose={() => { setKundenDialogOpen(false); setEditingKunde(undefined); }}
        onSubmit={async fields => {
          if (editingKunde) {
            await LivingAppsService.updateKundenEntry(editingKunde.record_id, fields);
          } else {
            await LivingAppsService.createKundenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editingKunde?.fields}
        recordId={editingKunde?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />

      <FahrzeugeDialog
        open={fahrzeugDialogOpen}
        onClose={() => { setFahrzeugDialogOpen(false); setEditingFahrzeug(undefined); setFahrzeugDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingFahrzeug) {
            await LivingAppsService.updateFahrzeugeEntry(editingFahrzeug.record_id, fields);
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={fahrzeugDefaults}
        recordId={editingFahrzeug?.record_id}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />

      <RechnungenDialog
        open={rechnungDialogOpen}
        onClose={() => { setRechnungDialogOpen(false); setEditingRechnung(undefined); setRechnungDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingRechnung) {
            await LivingAppsService.updateRechnungenEntry(editingRechnung.record_id, fields);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={rechnungDefaults}
        recordId={editingRechnung?.record_id}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />

      <JahresinspektionPlanenDialog
        open={inspektionDialogOpen}
        onClose={() => { setInspektionDialogOpen(false); setEditingInspektion(undefined); setInspektionDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingInspektion) {
            await LivingAppsService.updateJahresinspektionPlanenEntry(editingInspektion.record_id, fields);
          } else {
            await LivingAppsService.createJahresinspektionPlanenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={inspektionDefaults}
        recordId={editingInspektion?.record_id}
        fahrzeugeList={fahrzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />

      <RechnungsPdfErstellenDialog
        open={pdfDialogOpen}
        onClose={() => { setPdfDialogOpen(false); setEditingPdf(undefined); }}
        onSubmit={async fields => {
          if (editingPdf) {
            await LivingAppsService.updateRechnungsPdfErstellenEntry(editingPdf.record_id, fields);
          } else {
            await LivingAppsService.createRechnungsPdfErstellenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editingPdf?.fields}
        recordId={editingPdf?.record_id}
        rechnungenList={rechnungen}
        enablePhotoScan={AI_PHOTO_SCAN['RechnungsPdfErstellen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['RechnungsPdfErstellen']}
      />
    </>
  );
}
