import { useMemo, useState } from 'react';
import { format, isAfter, isBefore, parseISO, startOfDay, endOfDay, addDays } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { Auftraege, Rechnungen, Fahrzeuge, Kunden, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { LOOKUP_OPTIONS, APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { lookupKey, formatDate, formatCurrency } from '@/lib/formatters';
import { makeT } from '@/i18n';
import { tc } from '@/i18n/common';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
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
  RecordAttachments,
} from '@/components/widgets/RecordView';
import { AuftraegeDialog, type AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import { RechnungenDialog, type RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import { FahrzeugeDialog, type FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import { KundenDialog } from '@/components/dialogs/KundenDialog';
import { JahresinspektionPlanenDialog, type JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { AuftraegeDetails } from '@/components/details/AuftraegeDetails';
import { RechnungenDetails } from '@/components/details/RechnungenDetails';
import { FahrzeugeDetails } from '@/components/details/FahrzeugeDetails';
import { KundenDetails } from '@/components/details/KundenDetails';
import { JahresinspektionPlanenDetails } from '@/components/details/JahresinspektionPlanenDetails';
import { RechnungsPdfErstellenDetails } from '@/components/details/RechnungsPdfErstellenDetails';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { IconPlus, IconAlertTriangle, IconReceipt, IconTool, IconCar } from '@tabler/icons-react';

const tt = makeT({
  de: {
    headline: 'Werkstatt-Manager',
    ctx_empty: 'Noch keine Aufträge — leg gleich los.',
    ctx_auftraege: 'Heute sind {n} Aufträge in Bearbeitung.',
    ctx_single: 'Aktuell wird {name} bearbeitet.',
    neuer_auftrag: 'Neuer Auftrag',
    heute_faellig: 'Heute & Überfällig',
    naechste_termine: 'Nächste Inspektionen',
    hero_rechnungen: '{n} überfällige {label} — sofort nachfassen.',
    rechnung_mahnen: 'Rechnung mahnen',
    faellig_label: 'Fällig {date}',
    empty_auftraege: 'Keine dringenden Aufträge — alles im Zeitplan.',
    empty_inspektionen: 'Keine bevorstehenden Inspektionen.',
    neuer_kunde: 'Neuer Kunde',
    neue_rechnung: 'Neue Rechnung',
    neue_inspektion: 'Neue Inspektion',
    neues_fahrzeug: 'Neues Fahrzeug',
    offen_label: 'Offen',
    in_bearbeitung_label: 'In Bearbeitung',
    abgeschlossen_label: 'Abgeschlossen',
    ueberfaellig_rechnungen: 'Überfällige Rechnungen',
    offene_rechnungen: 'Offene Rechnungen',
    bezahlt_rechnungen: 'Bezahlt',
    auftrag: 'Auftrag',
  },
  en: {
    headline: 'Workshop Manager',
    ctx_empty: 'No orders yet — get started!',
    ctx_auftraege: '{n} orders in progress today.',
    ctx_single: 'Currently working on {name}.',
    neuer_auftrag: 'New Order',
    heute_faellig: 'Due Today & Overdue',
    naechste_termine: 'Next Inspections',
    hero_rechnungen: '{n} overdue {label} — follow up now.',
    rechnung_mahnen: 'Send reminder',
    faellig_label: 'Due {date}',
    empty_auftraege: 'No urgent orders — everything on schedule.',
    empty_inspektionen: 'No upcoming inspections.',
    neuer_kunde: 'New Customer',
    neue_rechnung: 'New Invoice',
    neue_inspektion: 'New Inspection',
    neues_fahrzeug: 'New Vehicle',
    offen_label: 'Open',
    in_bearbeitung_label: 'In Progress',
    abgeschlossen_label: 'Completed',
    ueberfaellig_rechnungen: 'Overdue Invoices',
    offene_rechnungen: 'Open Invoices',
    bezahlt_rechnungen: 'Paid',
    auftrag: 'Order',
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
  if (status === 'in_bearbeitung') return 'primary';
  if (status === 'abgeschlossen') return 'default';
  return 'warning';
}

export default function DashboardOverview() {
  const {
    kunden, fahrzeuge, auftraege, rechnungen, jahresinspektionPlanen, rechnungsPdfErstellen,
    kundenMap, fahrzeugeMap, auftraegeMap, rechnungenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedFahrzeuge = enrichFahrzeuge(fahrzeuge, { kundenMap });
  const enrichedAuftraege = enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap });
  const enrichedRechnungen = enrichRechnungen(rechnungen, { auftraegeMap, kundenMap });
  const enrichedJahresinspektionPlanen = enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap });
  const enrichedRechnungsPdfErstellen = enrichRechnungsPdfErstellen(rechnungsPdfErstellen, { rechnungenMap });

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [auftragDialog, setAuftragDialog] = useState(false);
  const [auftragDefaults, setAuftragDefaults] = useState<AuftraegeDialogDefaults | undefined>();
  const [editAuftrag, setEditAuftrag] = useState<Auftraege | null>(null);

  const [rechnungDialog, setRechnungDialog] = useState(false);
  const [rechnungDefaults, setRechnungDefaults] = useState<RechnungenDialogDefaults | undefined>();
  const [editRechnung, setEditRechnung] = useState<Rechnungen | null>(null);

  const [fahrzeugDialog, setFahrzeugDialog] = useState(false);
  const [fahrzeugDefaults, setFahrzeugDefaults] = useState<FahrzeugeDialogDefaults | undefined>();
  const [editFahrzeug, setEditFahrzeug] = useState<Fahrzeuge | null>(null);

  const [kundeDialog, setKundeDialog] = useState(false);

  const [inspektionDialog, setInspektionDialog] = useState(false);
  const [inspektionDefaults, setInspektionDefaults] = useState<JahresinspektionPlanenDialogDefaults | undefined>();
  const [editInspektion, setEditInspektion] = useState<JahresinspektionPlanen | null>(null);

  // Kanban columns — inside component body (locale-aware getters)
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const cards = useMemo<KanbanCard[]>(
    () =>
      enrichedAuftraege.map(a => {
        const status = lookupKey(a.fields.status) ?? 'offen';
        const kundenname = a.kundeName ?? a.fields.auftragsnummer ?? '—';
        const fahrzeugname = a.fahrzeugName ?? '';
        return {
          id: `auftrag:${a.record_id}`,
          column: status,
          title: kundenname,
          subtitle: fahrzeugname ? `${fahrzeugname}${a.fields.wunschtermin ? ' · ' + formatDate(a.fields.wunschtermin) : ''}` : a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : undefined,
          tone: toneForStatus(status),
        };
      }),
    [enrichedAuftraege],
  );

  const today = format(clock, 'yyyy-MM-dd');
  const todayStart = startOfDay(clock);
  const weekEnd = endOfDay(addDays(clock, 7));

  // Überfällige Rechnungen
  const ueberfaelligeRechnungen = useMemo(
    () => rechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'ueberfaellig'),
    [rechnungen],
  );

  // Offene Rechnungen
  const offeneRechnungen = useMemo(
    () => rechnungen.filter(r => lookupKey(r.fields.status_rechnung) === 'offen'),
    [rechnungen],
  );

  // Aufträge in Bearbeitung
  const inBearbeitung = useMemo(
    () => auftraege.filter(a => lookupKey(a.fields.status) === 'in_bearbeitung'),
    [auftraege],
  );

  // Dringende Aufträge: offen + in_bearbeitung mit heutigem Wunschtermin oder überfällig
  const dringendeAuftraege = useMemo(() => {
    return enrichedAuftraege
      .filter(a => {
        const status = lookupKey(a.fields.status);
        if (status === 'abgeschlossen') return false;
        if (!a.fields.wunschtermin) return status === 'in_bearbeitung';
        const termin = parseISO(a.fields.wunschtermin);
        return !isAfter(termin, endOfDay(clock));
      })
      .sort((a, b) => {
        const da = a.fields.wunschtermin ?? '';
        const db = b.fields.wunschtermin ?? '';
        return da < db ? -1 : da > db ? 1 : 0;
      });
  }, [enrichedAuftraege, clock]);

  // Nächste Inspektionen (nächste 7 Tage)
  const naechsteInspektionen = useMemo(() => {
    return enrichedJahresinspektionPlanen
      .filter(i => {
        if (!i.fields.wunschtermin_inspektion) return false;
        const t = parseISO(i.fields.wunschtermin_inspektion);
        return !isBefore(t, todayStart) && isBefore(t, weekEnd);
      })
      .sort((a, b) => {
        const da = a.fields.wunschtermin_inspektion ?? '';
        const db = b.fields.wunschtermin_inspektion ?? '';
        return da < db ? -1 : da > db ? 1 : 0;
      });
  }, [enrichedJahresinspektionPlanen, todayStart, weekEnd]);

  // Context line
  const contextLine = useMemo(() => {
    if (inBearbeitung.length === 0) return tt('ctx_empty');
    const names = inBearbeitung
      .map(a => {
        const enriched = enrichedAuftraege.find(e => e.record_id === a.record_id);
        return enriched?.kundeName ?? enriched?.fahrzeugName ?? null;
      })
      .filter(Boolean) as string[];
    if (names.length === 1) return tt('ctx_single', { name: namen(names) });
    return tt('ctx_auftraege', { n: inBearbeitung.length });
  }, [inBearbeitung, enrichedAuftraege]);

  // Advance auftrag status
  const advanceAuftrag = async (a: Auftraege) => {
    const cur = lookupKey(a.fields.status) ?? 'offen';
    const next = cur === 'offen' ? 'in_bearbeitung' : cur === 'in_bearbeitung' ? 'abgeschlossen' : null;
    if (!next) return;
    const nextLabel = COLUMNS.find(c => c.key === next)?.label ?? next;
    const prevStatus = a.fields.status;
    // optimistic
    // Note: we call fetchAll only on error; optimistic updates go through useDashboardData set methods
    try {
      await LivingAppsService.updateAuftraegeEntry(a.record_id, { status: next });
      undoToast(`${a.fields.auftragsnummer ?? tc('aktualisiert')} → ${nextLabel}`, async () => {
        await LivingAppsService.updateAuftraegeEntry(a.record_id, { status: prevStatus?.key ?? cur });
        fetchAll();
      });
      fetchAll();
    } catch {
      fetchAll();
    }
  };

  // Move card on kanban drag
  const moveCard = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const a = auftraege.find(x => x.record_id === rid);
    if (!a) return;
    const prevKey = lookupKey(a.fields.status) ?? 'offen';
    const newLabel = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    try {
      await LivingAppsService.updateAuftraegeEntry(rid, { status: newColumn });
      undoToast(`${a.fields.auftragsnummer ?? tt('auftrag')} → ${newLabel}`, async () => {
        await LivingAppsService.updateAuftraegeEntry(rid, { status: prevKey });
        fetchAll();
      });
      fetchAll();
    } catch {
      fetchAll();
    }
  };

  // Mark rechnung as mahnen (mark overdue → offen for follow-up)
  const mahneRechnung = async (r: Rechnungen) => {
    const prev = r.fields.status_rechnung;
    try {
      await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: 'offen' });
      undoToast(`${r.fields.rechnungsnummer ?? tc('aktualisiert')} — ${tc('zurueckgegeben')}`, async () => {
        await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: prev?.key ?? 'ueberfaellig' });
        fetchAll();
      });
      fetchAll();
    } catch {
      fetchAll();
    }
  };

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const ueberfaelligNames = ueberfaelligeRechnungen
    .map(r => {
      const enriched = enrichedRechnungen.find(e => e.record_id === r.record_id);
      return enriched?.kundeName ?? r.fields.rechnungsnummer ?? null;
    })
    .filter(Boolean) as string[];

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground truncate">{contextLine}</p>
        </div>
        <button
          onClick={() => { setAuftragDefaults(undefined); setEditAuftrag(null); setAuftragDialog(true); }}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} className="shrink-0" />
          <span>{tt('neuer_auftrag')}</span>
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          ueberfaelligeRechnungen.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tt('rechnung_mahnen'),
                onClick: () => mahneRechnung(ueberfaelligeRechnungen[0]),
              }}
            >
              <b>{namen(ueberfaelligNames)}</b> — {tt('hero_rechnungen', { n: ueberfaelligeRechnungen.length, label: tt('ueberfaellig_rechnungen').toLowerCase() })}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('offen_label')}
              value={auftraege.filter(a => lookupKey(a.fields.status) === 'offen').length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone="warning"
            />
            <StatStripItem
              title={tt('in_bearbeitung_label')}
              value={inBearbeitung.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone="primary"
            />
            <StatStripItem
              title={tt('abgeschlossen_label')}
              value={auftraege.filter(a => lookupKey(a.fields.status) === 'abgeschlossen').length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tt('ueberfaellig_rechnungen')}
              value={ueberfaelligeRechnungen.length}
              icon={<IconReceipt size={16} className="shrink-0" />}
              tone={ueberfaelligeRechnungen.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tt('offene_rechnungen')}
              value={offeneRechnungen.length}
              icon={<IconReceipt size={16} className="shrink-0" />}
              tone="default"
            />
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
              setAuftragDefaults({ status: column });
              setEditAuftrag(null);
              setAuftragDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('heute_faellig')}
              items={dringendeAuftraege.map(a => {
                const status = lookupKey(a.fields.status) ?? 'offen';
                const nextAction = status === 'offen' ? tt('in_bearbeitung_label') : status === 'in_bearbeitung' ? tc('abschliessen') : null;
                return {
                  id: a.record_id,
                  title: a.kundeName ?? a.fields.auftragsnummer ?? '—',
                  secondLine: (
                    <span className="flex gap-1 flex-wrap">
                      <span className={status === 'offen' ? 'text-warning font-medium' : 'text-primary font-medium'}>
                        {a.fields.status?.label ?? status}
                      </span>
                      {a.fields.wunschtermin && (
                        <span className="text-muted-foreground"> · {formatDate(a.fields.wunschtermin)}</span>
                      )}
                      {a.fahrzeugName && (
                        <span className="text-muted-foreground"> · {a.fahrzeugName}</span>
                      )}
                    </span>
                  ),
                  action: nextAction ? { label: nextAction, onClick: () => advanceAuftrag(a) } : undefined,
                };
              })}
              onItemClick={id => overlay.replace({ type: 'auftrag', id })}
              empty={{
                text: tt('empty_auftraege'),
                action: { label: tt('neuer_auftrag'), onClick: () => { setAuftragDefaults(undefined); setEditAuftrag(null); setAuftragDialog(true); } },
              }}
            />
            <WorkList
              title={tt('naechste_termine')}
              items={naechsteInspektionen.map(i => ({
                id: i.record_id,
                title: i.fahrzeugName ?? '—',
                secondLine: (
                  <span className="text-muted-foreground">
                    {i.fields.wunschtermin_inspektion ? formatDate(i.fields.wunschtermin_inspektion) : '—'}
                    {i.fields.arbeitsbeschreibung_inspektion
                      ? ` · ${i.fields.arbeitsbeschreibung_inspektion.slice(0, 40)}`
                      : ''}
                  </span>
                ),
                action: {
                  label: tc('bearbeiten'),
                  onClick: () => {
                    setEditInspektion(i);
                    setInspektionDefaults({ fahrzeug: extractRecordId(i.fields.fahrzeug) ?? undefined, wunschtermin_inspektion: i.fields.wunschtermin_inspektion, arbeitsbeschreibung_inspektion: i.fields.arbeitsbeschreibung_inspektion, bemerkungen_inspektion: i.fields.bemerkungen_inspektion });
                    setInspektionDialog(true);
                  },
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'inspektion', id })}
              empty={{
                text: tt('empty_inspektionen'),
                action: { label: tt('neue_inspektion'), onClick: () => { setEditInspektion(null); setInspektionDefaults(undefined); setInspektionDialog(true); } },
              }}
            />
          </>
        }
      />

      {/* RecordOverlayHost — ONE shell for the whole stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftrag') {
            const a = auftraege.find(x => x.record_id === top.id);
            if (!a) return null;
            const status = lookupKey(a.fields.status) ?? 'offen';
            return (
              <>
                <RecordHeader
                  title={a.fields.auftragsnummer ?? '—'}
                  subtitle={enrichedAuftraege.find(e => e.record_id === a.record_id)?.kundeName}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      status === 'abgeschlossen' ? 'bg-muted text-muted-foreground' :
                      status === 'in_bearbeitung' ? 'bg-primary/10 text-primary' :
                      'bg-warning/10 text-warning'
                    }`}>
                      {a.fields.status?.label ?? status}
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
                  onAddRechnungen={() => {
                    setRechnungDefaults({ auftrag: a.record_id, kunde: extractRecordId(a.fields.kunde) ?? undefined });
                    setEditRechnung(null);
                    setRechnungDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'rechnung') {
            const r = rechnungen.find(x => x.record_id === top.id);
            if (!r) return null;
            return (
              <>
                <RecordHeader
                  title={r.fields.rechnungsnummer ?? '—'}
                  subtitle={enrichedRechnungen.find(e => e.record_id === r.record_id)?.kundeName ?? undefined}
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={p => overlay.push({ type: 'pdferstellen', id: p.record_id })}
                  onAddRechnungsPdfErstellen={() => {
                    overlay.close();
                  }}
                />
              </>
            );
          }
          if (top.type === 'fahrzeug') {
            const f = fahrzeuge.find(x => x.record_id === top.id);
            if (!f) return null;
            return (
              <>
                <RecordHeader
                  title={f.fields.kennzeichen ?? '—'}
                  subtitle={[f.fields.marke, f.fields.modell].filter(Boolean).join(' ')}
                  badges={
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <IconCar size={14} />
                      {f.fields.baujahr}
                    </span>
                  }
                />
                <FahrzeugeDetails
                  record={f}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', id: k.record_id })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  onAddAuftraege={() => {
                    setAuftragDefaults({ fahrzeug: f.record_id, kunde: extractRecordId(f.fields.kunde) ?? undefined });
                    setEditAuftrag(null);
                    setAuftragDialog(true);
                  }}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => overlay.push({ type: 'inspektion', id: i.record_id })}
                  onAddJahresinspektionPlanen={() => {
                    setInspektionDefaults({ fahrzeug: f.record_id });
                    setEditInspektion(null);
                    setInspektionDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kunde') {
            const k = kunden.find(x => x.record_id === top.id);
            if (!k) return null;
            return (
              <>
                <RecordHeader
                  title={[k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || '—'}
                  subtitle={[k.fields.telefon, k.fields.email].filter(Boolean).join(' · ')}
                />
                <KundenDetails
                  record={k}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', id: f.record_id })}
                  onAddFahrzeuge={() => {
                    setFahrzeugDefaults({ kunde: k.record_id });
                    setEditFahrzeug(null);
                    setFahrzeugDialog(true);
                  }}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', id: a.record_id })}
                  onAddAuftraege={() => {
                    setAuftragDefaults({ kunde: k.record_id });
                    setEditAuftrag(null);
                    setAuftragDialog(true);
                  }}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnung', id: r.record_id })}
                  onAddRechnungen={() => {
                    setRechnungDefaults({ kunde: k.record_id });
                    setEditRechnung(null);
                    setRechnungDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'inspektion') {
            const i = jahresinspektionPlanen.find(x => x.record_id === top.id);
            if (!i) return null;
            return (
              <>
                <RecordHeader
                  title={enrichedJahresinspektionPlanen.find(e => e.record_id === i.record_id)?.fahrzeugName ?? '—'}
                  subtitle={i.fields.wunschtermin_inspektion ? formatDate(i.fields.wunschtermin_inspektion) : undefined}
                />
                <JahresinspektionPlanenDetails
                  record={i}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', id: f.record_id })}
                />
              </>
            );
          }
          if (top.type === 'pdferstellen') {
            const p = rechnungsPdfErstellen.find(x => x.record_id === top.id);
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
            const a = auftraege.find(x => x.record_id === top.id);
            if (!a) return undefined;
            const status = lookupKey(a.fields.status) ?? 'offen';
            if (status === 'abgeschlossen') return undefined;
            const nextLabel = status === 'offen' ? tt('in_bearbeitung_label') : tc('abschliessen');
            return { label: nextLabel, onClick: () => advanceAuftrag(a) };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'auftrag') {
            const a = auftraege.find(x => x.record_id === top.id);
            if (!a) return;
            setEditAuftrag(a);
            setAuftragDefaults(undefined);
            setAuftragDialog(true);
          } else if (top.type === 'rechnung') {
            const r = rechnungen.find(x => x.record_id === top.id);
            if (!r) return;
            setEditRechnung(r);
            setRechnungDefaults(undefined);
            setRechnungDialog(true);
          } else if (top.type === 'fahrzeug') {
            const f = fahrzeuge.find(x => x.record_id === top.id);
            if (!f) return;
            setEditFahrzeug(f);
            setFahrzeugDefaults(undefined);
            setFahrzeugDialog(true);
          } else if (top.type === 'inspektion') {
            const i = jahresinspektionPlanen.find(x => x.record_id === top.id);
            if (!i) return;
            setEditInspektion(i);
            setInspektionDefaults(undefined);
            setInspektionDialog(true);
          }
        }}
      />

      {/* Dialogs */}
      <AuftraegeDialog
        open={auftragDialog}
        onClose={() => { setAuftragDialog(false); setEditAuftrag(null); setAuftragDefaults(undefined); }}
        onSubmit={async fields => {
          if (editAuftrag) {
            await LivingAppsService.updateAuftraegeEntry(editAuftrag.record_id, fields);
            undoToast(`${editAuftrag.fields.auftragsnummer ?? ''} ${tc('aktualisiert')}`);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
            undoToast(tc('erstellt'));
          }
          fetchAll();
        }}
        defaultValues={editAuftrag ? editAuftrag.fields : auftragDefaults}
        recordId={editAuftrag?.record_id}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />

      <RechnungenDialog
        open={rechnungDialog}
        onClose={() => { setRechnungDialog(false); setEditRechnung(null); setRechnungDefaults(undefined); }}
        onSubmit={async fields => {
          if (editRechnung) {
            await LivingAppsService.updateRechnungenEntry(editRechnung.record_id, fields);
            undoToast(`${editRechnung.fields.rechnungsnummer ?? ''} ${tc('aktualisiert')}`);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
            undoToast(tc('erstellt'));
          }
          fetchAll();
        }}
        defaultValues={editRechnung ? editRechnung.fields : rechnungDefaults}
        recordId={editRechnung?.record_id}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />

      <FahrzeugeDialog
        open={fahrzeugDialog}
        onClose={() => { setFahrzeugDialog(false); setEditFahrzeug(null); setFahrzeugDefaults(undefined); }}
        onSubmit={async fields => {
          if (editFahrzeug) {
            await LivingAppsService.updateFahrzeugeEntry(editFahrzeug.record_id, fields);
            undoToast(`${editFahrzeug.fields.kennzeichen ?? ''} ${tc('aktualisiert')}`);
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
            undoToast(tc('erstellt'));
          }
          fetchAll();
        }}
        defaultValues={editFahrzeug ? editFahrzeug.fields : fahrzeugDefaults}
        recordId={editFahrzeug?.record_id}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />

      <KundenDialog
        open={kundeDialog}
        onClose={() => setKundeDialog(false)}
        onSubmit={async fields => {
          await LivingAppsService.createKundenEntry(fields);
          undoToast(tc('erstellt'));
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Kunden']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kunden']}
      />

      <JahresinspektionPlanenDialog
        open={inspektionDialog}
        onClose={() => { setInspektionDialog(false); setEditInspektion(null); setInspektionDefaults(undefined); }}
        onSubmit={async fields => {
          if (editInspektion) {
            await LivingAppsService.updateJahresinspektionPlanenEntry(editInspektion.record_id, fields);
            undoToast(tc('aktualisiert'));
          } else {
            await LivingAppsService.createJahresinspektionPlanenEntry(fields);
            undoToast(tc('erstellt'));
          }
          fetchAll();
        }}
        defaultValues={editInspektion ? editInspektion.fields : inspektionDefaults}
        recordId={editInspektion?.record_id}
        fahrzeugeList={fahrzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />
    </>
  );
}
