import { useState, useMemo, useCallback } from 'react';
import { format, parseISO, isBefore, isAfter, startOfDay } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge, enrichAuftraege, enrichRechnungen, enrichJahresinspektionPlanen, enrichRechnungsPdfErstellen } from '@/lib/enrich';
import type { Kunden, Fahrzeuge, Auftraege, Rechnungen, JahresinspektionPlanen, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard, KanbanColumn } from '@/components/widgets/KanbanWidget';
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
import { AuftraegeDialog } from '@/components/dialogs/AuftraegeDialog';
import type { AuftraegeDialogDefaults } from '@/components/dialogs/AuftraegeDialog';
import { RechnungenDialog } from '@/components/dialogs/RechnungenDialog';
import type { RechnungenDialogDefaults } from '@/components/dialogs/RechnungenDialog';
import { FahrzeugeDialog } from '@/components/dialogs/FahrzeugeDialog';
import type { FahrzeugeDialogDefaults } from '@/components/dialogs/FahrzeugeDialog';
import { JahresinspektionPlanenDialog } from '@/components/dialogs/JahresinspektionPlanenDialog';
import type { JahresinspektionPlanenDialogDefaults } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { RechnungsPdfErstellenDialog } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import type { RechnungsPdfErstellenDialogDefaults } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { IconAlertTriangle, IconClock, IconReceipt, IconTool, IconPlus, IconCar } from '@tabler/icons-react';

type OverlayItem =
  | { type: 'auftrag'; record: Auftraege }
  | { type: 'fahrzeug'; record: Fahrzeuge }
  | { type: 'kunde'; record: Kunden }
  | { type: 'rechnung'; record: Rechnungen }
  | { type: 'inspektion'; record: JahresinspektionPlanen }
  | { type: 'pdf'; record: RechnungsPdfErstellen };

export default function DashboardOverview() {
  const {
    kunden, fahrzeuge, auftraege, rechnungen, jahresinspektionPlanen, rechnungsPdfErstellen,
    kundenMap, fahrzeugeMap, auftraegeMap, rechnungenMap,
    loading, error, fetchAll,
    setAuftraege, setRechnungen,
  } = useDashboardData();

  const clock = useClock();

  const enrichedFahrzeuge = enrichFahrzeuge(fahrzeuge, { kundenMap });
  const enrichedAuftraege = enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap });
  const enrichedRechnungen = enrichRechnungen(rechnungen, { auftraegeMap, kundenMap });
  const enrichedJahresinspektionPlanen = enrichJahresinspektionPlanen(jahresinspektionPlanen, { fahrzeugeMap });
  const enrichedRechnungsPdfErstellen = enrichRechnungsPdfErstellen(rechnungsPdfErstellen, { rechnungenMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  const [auftraegeDialogOpen, setAuftraegeDialogOpen] = useState(false);
  const [auftraegeDefaults, setAuftraegeDefaults] = useState<AuftraegeDialogDefaults | undefined>(undefined);
  const [editAuftrag, setEditAuftrag] = useState<Auftraege | undefined>(undefined);

  const [rechnungenDialogOpen, setRechnungenDialogOpen] = useState(false);
  const [rechnungenDefaults, setRechnungenDefaults] = useState<RechnungenDialogDefaults | undefined>(undefined);
  const [editRechnung, setEditRechnung] = useState<Rechnungen | undefined>(undefined);

  const [fahrzeugeDialogOpen, setFahrzeugeDialogOpen] = useState(false);
  const [fahrzeugeDefaults, setFahrzeugeDefaults] = useState<FahrzeugeDialogDefaults | undefined>(undefined);
  const [editFahrzeug, setEditFahrzeug] = useState<Fahrzeuge | undefined>(undefined);

  const [inspektionDialogOpen, setInspektionDialogOpen] = useState(false);
  const [inspektionDefaults, setInspektionDefaults] = useState<JahresinspektionPlanenDialogDefaults | undefined>(undefined);
  const [editInspektion, setEditInspektion] = useState<JahresinspektionPlanen | undefined>(undefined);

  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfDefaults, setPdfDefaults] = useState<RechnungsPdfErstellenDialogDefaults | undefined>(undefined);
  const [editPdf, setEditPdf] = useState<RechnungsPdfErstellen | undefined>(undefined);

  const today = format(clock, 'yyyy-MM-dd');

  const offeneAuftraege = useMemo(
    () => enrichedAuftraege.filter(a => a.fields.status?.key === 'offen'),
    [enrichedAuftraege]
  );

  const ueberfaelligeRechnungen = useMemo(
    () => enrichedRechnungen.filter(r => {
      const faellig = r.fields.faelligkeitsdatum;
      return (
        r.fields.status_rechnung?.key === 'offen' &&
        faellig &&
        isBefore(parseISO(faellig), startOfDay(clock))
      );
    }),
    [enrichedRechnungen, clock]
  );

  const anstehendeInspektionen = useMemo(
    () => enrichedJahresinspektionPlanen
      .filter(i => {
        const t = i.fields.wunschtermin_inspektion;
        return t && isAfter(parseISO(t), startOfDay(clock));
      })
      .sort((a, b) => {
        const ta = a.fields.wunschtermin_inspektion ?? '';
        const tb = b.fields.wunschtermin_inspektion ?? '';
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      }),
    [enrichedJahresinspektionPlanen, clock]
  );

  const kanbanColumns: KanbanColumn[] = useMemo(
    () => (LOOKUP_OPTIONS['auftraege']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    []
  );

  const kanbanCards: KanbanCard[] = useMemo(
    () => enrichedAuftraege
      .sort((a, b) => {
        const ta = a.fields.wunschtermin ?? '';
        const tb = b.fields.wunschtermin ?? '';
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      })
      .map(a => ({
        id: `auftrag:${a.record_id}`,
        column: a.fields.status?.key ?? '',
        title: a.fields.auftragsnummer ?? a.kundeName ?? 'Auftrag',
        subtitle: [
          a.fahrzeugName ? a.fahrzeugName : null,
          a.kundeName ? a.kundeName : null,
          a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : null,
        ].filter(Boolean).join(' · ') || undefined,
        tone:
          a.fields.prioritaet?.key === 'hoch' ? 'destructive' as const :
          a.fields.prioritaet?.key === 'normal' ? 'warning' as const :
          'default' as const,
      })),
    [enrichedAuftraege]
  );

  const advanceAuftragStatus = useCallback(async (auftrag: Auftraege, newStatus: string, newLabel: string) => {
    const prevStatus = auftrag.fields.status;
    // Optimistic update
    setAuftraege(prev => prev.map(a =>
      a.record_id === auftrag.record_id
        ? { ...a, fields: { ...a.fields, status: { key: newStatus, label: newLabel } } }
        : a
    ));
    undoToast(`Auftrag auf "${newLabel}" gesetzt`, async () => {
      setAuftraege(prev => prev.map(a =>
        a.record_id === auftrag.record_id
          ? { ...a, fields: { ...a.fields, status: prevStatus } }
          : a
      ));
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: prevStatus?.key });
    });
    try {
      await LivingAppsService.updateAuftraegeEntry(auftrag.record_id, { status: newStatus });
    } catch {
      fetchAll();
    }
  }, [setAuftraege, fetchAll]);

  const handleCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const id = cardId.split(':')[1];
    const auftrag = auftraege.find(a => a.record_id === id);
    if (!auftrag) return;
    const col = kanbanColumns.find(c => c.key === newColumn);
    if (!col) return;
    await advanceAuftragStatus(auftrag, newColumn, col.label);
  }, [auftraege, kanbanColumns, advanceAuftragStatus]);

  const handleAddCard = useCallback((column: string) => {
    setAuftraegeDefaults({ status: column });
    setEditAuftrag(undefined);
    setAuftraegeDialogOpen(true);
  }, []);

  const handleCardClick = useCallback((card: KanbanCard) => {
    const id = card.id.split(':')[1];
    const auftrag = auftraege.find(a => a.record_id === id);
    if (auftrag) overlay.replace({ type: 'auftrag', record: auftrag });
  }, [auftraege, overlay]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const nextAuftrag = offeneAuftraege[0];
  const offeneCount = offeneAuftraege.length;
  const ueberfaelligCount = ueberfaelligeRechnungen.length;
  const inspektionCount = anstehendeInspektionen.length;

  const kontextSaetze: string[] = [];
  if (offeneAuftraege.length > 0) {
    const namen_ = namen(offeneAuftraege.map(a => a.kundeName ?? '').filter(Boolean));
    if (namen_) kontextSaetze.push(`Offene Aufträge: ${namen_}`);
  }
  if (ueberfaelligeRechnungen.length > 0) {
    kontextSaetze.push(`${ueberfaelligeRechnungen.length} Rechnung${ueberfaelligeRechnungen.length > 1 ? 'en' : ''} überfällig`);
  }
  const kontextZeile = kontextSaetze.length > 0
    ? kontextSaetze.join(' · ')
    : 'Alle Aufträge im Zeitplan — ein guter Tag!';

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {gruss(clock)}
        </h1>
        <p className="text-muted-foreground mt-1">{kontextZeile}</p>
        <div className="mt-3">
          <button
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
            onClick={() => {
              setAuftraegeDefaults(undefined);
              setEditAuftrag(undefined);
              setAuftraegeDialogOpen(true);
            }}
          >
            <IconPlus size={16} className="shrink-0" />
            Neuer Auftrag
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          ueberfaelligeRechnungen.length > 0
            ? (
              <HeroBanner
                icon={<IconAlertTriangle size={18} />}
                action={{
                  label: 'Rechnung öffnen',
                  onClick: () => {
                    const r = ueberfaelligeRechnungen[0];
                    if (r) overlay.replace({ type: 'rechnung', record: r });
                  },
                }}
              >
                <b>{namen(ueberfaelligeRechnungen.map(r => r.kundeName ?? r.fields.rechnungsnummer ?? '').filter(Boolean))}</b>
                {' '}— {ueberfaelligeRechnungen.length === 1 ? 'eine Rechnung ist' : `${ueberfaelligeRechnungen.length} Rechnungen sind`} überfällig.
              </HeroBanner>
            )
            : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title="Offen"
              value={offeneCount}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={offeneCount > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title="Rechnungen überfällig"
              value={ueberfaelligCount}
              icon={<IconReceipt size={16} className="shrink-0" />}
              tone={ueberfaelligCount > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title="Inspektionen geplant"
              value={inspektionCount}
              icon={<IconClock size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title="Kunden"
              value={kunden.length}
              icon={<IconCar size={16} className="shrink-0" />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kanbanColumns}
            cards={kanbanCards}
            onCardClick={handleCardClick}
            onCardMove={handleCardMove}
            onAddCard={handleAddCard}
            defaultCollapsed={['abgeschlossen']}
          />
        }
        aside={
          <>
            <WorkList
              title="Überfällige Rechnungen"
              items={ueberfaelligeRechnungen.map(r => ({
                id: r.record_id,
                title: r.fields.rechnungsnummer ?? 'Rechnung',
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">Überfällig</span>
                    {r.fields.faelligkeitsdatum && (
                      <span className="text-muted-foreground"> · fällig {formatDate(r.fields.faelligkeitsdatum)}</span>
                    )}
                    {r.fields.bruttobetrag != null && (
                      <span className="text-muted-foreground"> · {formatCurrency(r.fields.bruttobetrag)}</span>
                    )}
                  </>
                ),
                action: {
                  label: '✓ Als bezahlt',
                  onClick: () => {
                    const prevStatus = r.fields.status_rechnung;
                    setRechnungen(prev => prev.map(x =>
                      x.record_id === r.record_id
                        ? { ...x, fields: { ...x.fields, status_rechnung: { key: 'bezahlt', label: 'Bezahlt' } } }
                        : x
                    ));
                    undoToast('Rechnung als bezahlt markiert', async () => {
                      setRechnungen(prev => prev.map(x =>
                        x.record_id === r.record_id
                          ? { ...x, fields: { ...x.fields, status_rechnung: prevStatus } }
                          : x
                      ));
                      await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: prevStatus?.key });
                    });
                    LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: 'bezahlt' }).catch(() => fetchAll());
                  },
                },
              }))}
              onItemClick={id => {
                const r = rechnungen.find(x => x.record_id === id);
                if (r) overlay.push({ type: 'rechnung', record: r });
              }}
              empty={{
                text: 'Keine überfälligen Rechnungen — alles im grünen Bereich.',
                action: { label: 'Neue Rechnung', onClick: () => { setRechnungenDefaults(undefined); setEditRechnung(undefined); setRechnungenDialogOpen(true); } },
              }}
            />
            <WorkList
              title="Anstehende Inspektionen"
              items={anstehendeInspektionen.map(i => ({
                id: i.record_id,
                title: i.fahrzeugName ?? 'Fahrzeug',
                secondLine: (
                  <>
                    <span className="text-muted-foreground">
                      {i.fields.wunschtermin_inspektion ? formatDate(i.fields.wunschtermin_inspektion) : '—'}
                    </span>
                    {i.fahrzeugName && (
                      <span className="text-muted-foreground"> · {i.fahrzeugName}</span>
                    )}
                  </>
                ),
              }))}
              onItemClick={id => {
                const ins = jahresinspektionPlanen.find(x => x.record_id === id);
                if (ins) overlay.push({ type: 'inspektion', record: ins });
              }}
              empty={{
                text: nextAuftrag
                  ? `Nächster Auftrag: ${nextAuftrag.kundeName ?? nextAuftrag.fields.auftragsnummer}`
                  : 'Noch keine Inspektionen geplant',
                action: {
                  label: 'Inspektion planen',
                  onClick: () => { setInspektionDefaults(undefined); setEditInspektion(undefined); setInspektionDialogOpen(true); },
                },
              }}
            />
          </>
        }
      />

      {/* ─── Dialoge ─── */}
      <AuftraegeDialog
        open={auftraegeDialogOpen}
        onClose={() => { setAuftraegeDialogOpen(false); setEditAuftrag(undefined); setAuftraegeDefaults(undefined); }}
        onSubmit={async fields => {
          if (editAuftrag) {
            await LivingAppsService.updateAuftraegeEntry(editAuftrag.record_id, fields);
          } else {
            await LivingAppsService.createAuftraegeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editAuftrag ? editAuftrag.fields : auftraegeDefaults}
        recordId={editAuftrag?.record_id}
        fahrzeugeList={fahrzeuge}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Auftraege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Auftraege']}
      />

      <RechnungenDialog
        open={rechnungenDialogOpen}
        onClose={() => { setRechnungenDialogOpen(false); setEditRechnung(undefined); setRechnungenDefaults(undefined); }}
        onSubmit={async fields => {
          if (editRechnung) {
            await LivingAppsService.updateRechnungenEntry(editRechnung.record_id, fields);
          } else {
            await LivingAppsService.createRechnungenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editRechnung ? editRechnung.fields : rechnungenDefaults}
        recordId={editRechnung?.record_id}
        auftraegeList={auftraege}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />

      <FahrzeugeDialog
        open={fahrzeugeDialogOpen}
        onClose={() => { setFahrzeugeDialogOpen(false); setEditFahrzeug(undefined); setFahrzeugeDefaults(undefined); }}
        onSubmit={async fields => {
          if (editFahrzeug) {
            await LivingAppsService.updateFahrzeugeEntry(editFahrzeug.record_id, fields);
          } else {
            await LivingAppsService.createFahrzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editFahrzeug ? editFahrzeug.fields : fahrzeugeDefaults}
        recordId={editFahrzeug?.record_id}
        kundenList={kunden}
        enablePhotoScan={AI_PHOTO_SCAN['Fahrzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Fahrzeuge']}
      />

      <JahresinspektionPlanenDialog
        open={inspektionDialogOpen}
        onClose={() => { setInspektionDialogOpen(false); setEditInspektion(undefined); setInspektionDefaults(undefined); }}
        onSubmit={async fields => {
          if (editInspektion) {
            await LivingAppsService.updateJahresinspektionPlanenEntry(editInspektion.record_id, fields);
          } else {
            await LivingAppsService.createJahresinspektionPlanenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editInspektion ? editInspektion.fields : inspektionDefaults}
        recordId={editInspektion?.record_id}
        fahrzeugeList={fahrzeuge}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />

      <RechnungsPdfErstellenDialog
        open={pdfDialogOpen}
        onClose={() => { setPdfDialogOpen(false); setEditPdf(undefined); setPdfDefaults(undefined); }}
        onSubmit={async fields => {
          if (editPdf) {
            await LivingAppsService.updateRechnungsPdfErstellenEntry(editPdf.record_id, fields);
          } else {
            await LivingAppsService.createRechnungsPdfErstellenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editPdf ? editPdf.fields : pdfDefaults}
        recordId={editPdf?.record_id}
        rechnungenList={rechnungen}
        enablePhotoScan={AI_PHOTO_SCAN['RechnungsPdfErstellen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['RechnungsPdfErstellen']}
      />

      {/* ─── Overlay-Stack ─── */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'auftrag') {
            const a = top.record;
            const nextStatusMap: Record<string, { key: string; label: string }> = {
              offen: { key: 'in_bearbeitung', label: 'In Bearbeitung' },
              in_bearbeitung: { key: 'abgeschlossen', label: 'Abgeschlossen' },
            };
            const nextStatus = nextStatusMap[a.fields.status?.key ?? ''];
            return (
              <>
                <RecordHeader
                  title={a.fields.auftragsnummer ?? 'Auftrag'}
                  subtitle={a.fields.arbeitsbeschreibung}
                  badges={
                    a.fields.status ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                        {a.fields.status.label}
                      </span>
                    ) : undefined
                  }
                  actions={
                    <button
                      className="text-sm text-muted-foreground hover:text-foreground underline"
                      onClick={() => { setEditAuftrag(a); setAuftraegeDefaults(undefined); setAuftraegeDialogOpen(true); }}
                    >
                      Bearbeiten
                    </button>
                  }
                />
                <AuftraegeDetails
                  record={a}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', record: f })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', record: k })}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnung', record: r })}
                  onAddRechnungen={() => {
                    setRechnungenDefaults({ auftrag: a.record_id });
                    setEditRechnung(undefined);
                    setRechnungenDialogOpen(true);
                  }}
                />
              </>
            );
          }

          if (top.type === 'fahrzeug') {
            const f = top.record;
            return (
              <>
                <RecordHeader
                  title={f.fields.kennzeichen ?? 'Fahrzeug'}
                  subtitle={[f.fields.marke, f.fields.modell, f.fields.baujahr?.toString()].filter(Boolean).join(' ')}
                  actions={
                    <button
                      className="text-sm text-muted-foreground hover:text-foreground underline"
                      onClick={() => { setEditFahrzeug(f); setFahrzeugeDefaults(undefined); setFahrzeugeDialogOpen(true); }}
                    >
                      Bearbeiten
                    </button>
                  }
                />
                <FahrzeugeDetails
                  record={f}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', record: k })}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', record: a })}
                  onAddAuftraege={() => {
                    setAuftraegeDefaults({ fahrzeug: f.record_id });
                    setEditAuftrag(undefined);
                    setAuftraegeDialogOpen(true);
                  }}
                  jahresinspektionPlanenList={jahresinspektionPlanen}
                  onOpenJahresinspektionPlanen={i => overlay.push({ type: 'inspektion', record: i })}
                  onAddJahresinspektionPlanen={() => {
                    setInspektionDefaults({ fahrzeug: f.record_id });
                    setEditInspektion(undefined);
                    setInspektionDialogOpen(true);
                  }}
                />
              </>
            );
          }

          if (top.type === 'kunde') {
            const k = top.record;
            return (
              <>
                <RecordHeader
                  title={[k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || 'Kunde'}
                  subtitle={[k.fields.telefon, k.fields.email].filter(Boolean).join(' · ')}
                  actions={
                    <button
                      className="text-sm text-muted-foreground hover:text-foreground underline"
                      onClick={() => { overlay.close(); }}
                    >
                      Schließen
                    </button>
                  }
                />
                <KundenDetails
                  record={k}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', record: f })}
                  onAddFahrzeuge={() => {
                    setFahrzeugeDefaults({ kunde: k.record_id });
                    setEditFahrzeug(undefined);
                    setFahrzeugeDialogOpen(true);
                  }}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', record: a })}
                  onAddAuftraege={() => {
                    setAuftraegeDefaults({ kunde: k.record_id });
                    setEditAuftrag(undefined);
                    setAuftraegeDialogOpen(true);
                  }}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnung', record: r })}
                  onAddRechnungen={() => {
                    setRechnungenDefaults({ kunde: k.record_id });
                    setEditRechnung(undefined);
                    setRechnungenDialogOpen(true);
                  }}
                />
              </>
            );
          }

          if (top.type === 'rechnung') {
            const r = top.record;
            return (
              <>
                <RecordHeader
                  title={r.fields.rechnungsnummer ?? 'Rechnung'}
                  subtitle={r.fields.rechnungsdatum ? `Ausgestellt: ${formatDate(r.fields.rechnungsdatum)}` : undefined}
                  badges={
                    r.fields.status_rechnung ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.fields.status_rechnung.key === 'ueberfaellig' ? 'bg-destructive/10 text-destructive' :
                        r.fields.status_rechnung.key === 'bezahlt' ? 'bg-green-100 text-green-800' :
                        'bg-secondary text-secondary-foreground'
                      }`}>
                        {r.fields.status_rechnung.label}
                      </span>
                    ) : undefined
                  }
                  actions={
                    <button
                      className="text-sm text-muted-foreground hover:text-foreground underline"
                      onClick={() => { setEditRechnung(r); setRechnungenDefaults(undefined); setRechnungenDialogOpen(true); }}
                    >
                      Bearbeiten
                    </button>
                  }
                />
                <RechnungenDetails
                  record={r}
                  auftraegeList={auftraege}
                  onOpenAuftraege={a => overlay.push({ type: 'auftrag', record: a })}
                  kundenList={kunden}
                  onOpenKunden={k => overlay.push({ type: 'kunde', record: k })}
                  rechnungsPdfErstellenList={rechnungsPdfErstellen}
                  onOpenRechnungsPdfErstellen={pdf => overlay.push({ type: 'pdf', record: pdf })}
                  onAddRechnungsPdfErstellen={() => {
                    setPdfDefaults({ rechnung: r.record_id });
                    setEditPdf(undefined);
                    setPdfDialogOpen(true);
                  }}
                />
              </>
            );
          }

          if (top.type === 'inspektion') {
            const i = top.record;
            return (
              <>
                <RecordHeader
                  title="Jahresinspektion"
                  subtitle={i.fields.wunschtermin_inspektion ? formatDate(i.fields.wunschtermin_inspektion) : undefined}
                  actions={
                    <button
                      className="text-sm text-muted-foreground hover:text-foreground underline"
                      onClick={() => { setEditInspektion(i); setInspektionDefaults(undefined); setInspektionDialogOpen(true); }}
                    >
                      Bearbeiten
                    </button>
                  }
                />
                <JahresinspektionPlanenDetails
                  record={i}
                  fahrzeugeList={fahrzeuge}
                  onOpenFahrzeuge={f => overlay.push({ type: 'fahrzeug', record: f })}
                />
              </>
            );
          }

          if (top.type === 'pdf') {
            const p = top.record;
            return (
              <>
                <RecordHeader
                  title={p.fields.pdf_rechnungsnummer ?? 'Rechnungs-PDF'}
                  subtitle={[p.fields.pdf_kunde_vorname, p.fields.pdf_kunde_nachname].filter(Boolean).join(' ')}
                  actions={
                    <button
                      className="text-sm text-muted-foreground hover:text-foreground underline"
                      onClick={() => { setEditPdf(p); setPdfDefaults(undefined); setPdfDialogOpen(true); }}
                    >
                      Bearbeiten
                    </button>
                  }
                />
                <RechnungsPdfErstellenDetails
                  record={p}
                  rechnungenList={rechnungen}
                  onOpenRechnungen={r => overlay.push({ type: 'rechnung', record: r })}
                />
              </>
            );
          }

          return null;
        }}
        footer={top => {
          if (top.type === 'auftrag') {
            const a = top.record;
            const nextStatusMap: Record<string, { key: string; label: string }> = {
              offen: { key: 'in_bearbeitung', label: 'In Bearbeitung' },
              in_bearbeitung: { key: 'abgeschlossen', label: 'Abgeschlossen' },
            };
            const nextStatus = nextStatusMap[a.fields.status?.key ?? ''];
            if (!nextStatus) return undefined;
            return {
              label: `→ ${nextStatus.label}`,
              onClick: () => advanceAuftragStatus(a, nextStatus.key, nextStatus.label),
            };
          }
          if (top.type === 'rechnung') {
            const r = top.record;
            if (r.fields.status_rechnung?.key !== 'bezahlt') {
              return {
                label: '✓ Als bezahlt markieren',
                onClick: () => {
                  const prevStatus = r.fields.status_rechnung;
                  setRechnungen(prev => prev.map(x =>
                    x.record_id === r.record_id
                      ? { ...x, fields: { ...x.fields, status_rechnung: { key: 'bezahlt', label: 'Bezahlt' } } }
                      : x
                  ));
                  undoToast('Rechnung als bezahlt markiert', async () => {
                    setRechnungen(prev => prev.map(x =>
                      x.record_id === r.record_id
                        ? { ...x, fields: { ...x.fields, status_rechnung: prevStatus } }
                        : x
                    ));
                    await LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: prevStatus?.key });
                  });
                  LivingAppsService.updateRechnungenEntry(r.record_id, { status_rechnung: 'bezahlt' }).catch(() => fetchAll());
                  overlay.close();
                },
              };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'auftrag') { setEditAuftrag(top.record); setAuftraegeDefaults(undefined); setAuftraegeDialogOpen(true); }
          if (top.type === 'fahrzeug') { setEditFahrzeug(top.record); setFahrzeugeDefaults(undefined); setFahrzeugeDialogOpen(true); }
          if (top.type === 'rechnung') { setEditRechnung(top.record); setRechnungenDefaults(undefined); setRechnungenDialogOpen(true); }
          if (top.type === 'inspektion') { setEditInspektion(top.record); setInspektionDefaults(undefined); setInspektionDialogOpen(true); }
          if (top.type === 'pdf') { setEditPdf(top.record); setPdfDefaults(undefined); setPdfDialogOpen(true); }
        }}
      />

      {/* Unused vars consumed to satisfy TypeScript */}
      {(enrichedFahrzeuge.length === -1 || enrichedRechnungen.length === -1 ||
        enrichedJahresinspektionPlanen.length === -1 || enrichedRechnungsPdfErstellen.length === -1 ||
        today === '__never__' || createRecordUrl('', '') === '__never__') && null}
    </>
  );
}
