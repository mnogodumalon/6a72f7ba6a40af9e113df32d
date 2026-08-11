/**
 * Auftrag abschließen & Rechnung anlegen — 3-Schritt-Wizard.
 * Steps: 1) Auftrag wählen (nur status=offen|in_bearbeitung) →
 *        2) Auftrag abschließen (status auf 'abgeschlossen', optionale Notiz) →
 *        3) Rechnung erstellen (rechnungsnummer, nettobetrag, mwst_satz, bruttobetrag, rechnungsdatum, faelligkeitsdatum).
 * Reads: auftraege, fahrzeuge, kunden. Writes: auftraege (updateAuftraegeEntry), rechnungen (createRechnungenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { IconFileInvoice, IconCircleCheck } from '@tabler/icons-react';
import { makeT } from '@/i18n';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { EnrichedAuftraege } from '@/types/enriched';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const tt = makeT({
  de: {
    pageTitle: 'Auftrag abschließen',
    subtitle: 'Auftrag beenden und Rechnung erstellen',
    step1: 'Auftrag wählen',
    step2: 'Abschließen',
    step3: 'Rechnung',
    step4: 'Fertig',
    searchPlaceholder: 'Auftragsnummer oder Fahrzeug suchen…',
    emptyMsg: 'Keine offenen oder laufenden Aufträge gefunden.',
    summaryTitle: 'Zusammenfassung',
    orderNumber: 'Auftragsnummer',
    workDesc: 'Arbeitsbeschreibung',
    desiredDate: 'Wunschtermin',
    notes: 'Abschlussnotiz (optional)',
    notesPlaceholder: 'Interne Bemerkungen zum Abschluss…',
    closeOrder: 'Auftrag abschließen',
    closing: 'Wird abgeschlossen…',
    invoiceTitle: 'Rechnung erstellen',
    invoiceNumber: 'Rechnungsnummer',
    invoiceNumberPlaceholder: 'z. B. RE-2026-001',
    netAmount: 'Nettobetrag (€)',
    vatRate: 'MwSt.-Satz',
    grossAmount: 'Bruttobetrag (€)',
    invoiceDate: 'Rechnungsdatum',
    dueDate: 'Fälligkeitsdatum',
    createInvoice: 'Rechnung anlegen',
    creating: 'Wird angelegt…',
    successTitle: 'Rechnung angelegt!',
    successDesc: 'Rechnung {nr} wurde erfolgreich erstellt.',
    newOrder: 'Weiteren Auftrag abschließen',
    backToDashboard: 'Zurück zum Dashboard',
    noOrderSelected: 'Kein Auftrag ausgewählt.',
    restartBtn: 'Neu starten',
    noAuftragForInvoice: 'Kein abgeschlossener Auftrag vorhanden.',
    errorClose: 'Fehler beim Abschließen des Auftrags.',
    errorCreate: 'Fehler beim Anlegen der Rechnung.',
    statusLabel: 'Status',
    vehicle: 'Fahrzeug',
    customer: 'Kunde',
    mwst19: '19 %',
    mwst7: '7 %',
    mwst0: '0 %',
  },
  en: {
    pageTitle: 'Close Order',
    subtitle: 'Finish order and create invoice',
    step1: 'Select Order',
    step2: 'Close',
    step3: 'Invoice',
    step4: 'Done',
    searchPlaceholder: 'Search by order number or vehicle…',
    emptyMsg: 'No open or in-progress orders found.',
    summaryTitle: 'Summary',
    orderNumber: 'Order Number',
    workDesc: 'Work Description',
    desiredDate: 'Requested Date',
    notes: 'Closing Note (optional)',
    notesPlaceholder: 'Internal notes on closure…',
    closeOrder: 'Close Order',
    closing: 'Closing…',
    invoiceTitle: 'Create Invoice',
    invoiceNumber: 'Invoice Number',
    invoiceNumberPlaceholder: 'e.g. RE-2026-001',
    netAmount: 'Net Amount (€)',
    vatRate: 'VAT Rate',
    grossAmount: 'Gross Amount (€)',
    invoiceDate: 'Invoice Date',
    dueDate: 'Due Date',
    createInvoice: 'Create Invoice',
    creating: 'Creating…',
    successTitle: 'Invoice Created!',
    successDesc: 'Invoice {nr} was created successfully.',
    newOrder: 'Close Another Order',
    backToDashboard: 'Back to Dashboard',
    noOrderSelected: 'No order selected.',
    restartBtn: 'Restart',
    noAuftragForInvoice: 'No closed order available.',
    errorClose: 'Error closing the order.',
    errorCreate: 'Error creating the invoice.',
    statusLabel: 'Status',
    vehicle: 'Vehicle',
    customer: 'Customer',
    mwst19: '19 %',
    mwst7: '7 %',
    mwst0: '0 %',
  },
});

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];

function calcBrutto(netto: number, mwstKey: string): number {
  if (mwstKey === 'mwst_19') return Math.round(netto * 1.19 * 100) / 100;
  if (mwstKey === 'mwst_7') return Math.round(netto * 1.07 * 100) / 100;
  return netto; // mwst_0
}

export default function AuftragAbschliessenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { auftraege, fahrzeuge, kunden, loading, error, fetchAll } = useDashboardData();

  // Step state — initialize from URL param
  const [step, setStep] = useState<number>(() => {
    const s = parseInt(searchParams.get('step') ?? '1', 10);
    return isNaN(s) || s < 1 || s > 4 ? 1 : s;
  });

  // Selection state
  const [selectedAuftragId, setSelectedAuftragId] = useState<string | null>(
    () => searchParams.get('auftragId') ?? null
  );

  // Step 2 state
  const [bemerkungen, setBemerkungen] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  // Step 3 state
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstKey, setMwstKey] = useState<string>(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [rechnungsdatum, setRechnungsdatum] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState('');
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [createdRechnungsnummer, setCreatedRechnungsnummer] = useState<string | null>(null);
  // Idempotency guard: store created invoice id so a retry does not duplicate
  const [createdRechnungId, setCreatedRechnungId] = useState<string | null>(null);

  // Enriched auftraege: only offen | in_bearbeitung
  const eligibleAuftraege = useMemo<EnrichedAuftraege[]>(() => {
    const fahrzeugeMap = new Map(fahrzeuge.map(f => [f.record_id, f]));
    const kundenMap = new Map(kunden.map(k => [k.record_id, k]));
    return auftraege
      .filter(a => {
        const key = a.fields.status?.key;
        return key === 'offen' || key === 'in_bearbeitung';
      })
      .map(a => {
        const fahrzeugId = a.fields.fahrzeug ? extractRecordId(a.fields.fahrzeug) : null;
        const kundeId = a.fields.kunde ? extractRecordId(a.fields.kunde) : null;
        const fz = fahrzeugId ? fahrzeugeMap.get(fahrzeugId) : undefined;
        const kd = kundeId ? kundenMap.get(kundeId) : undefined;
        const fahrzeugName = fz
          ? [fz.fields.marke, fz.fields.modell, fz.fields.kennzeichen].filter(Boolean).join(' ')
          : '–';
        const kundeName = kd
          ? [kd.fields.vorname, kd.fields.nachname].filter(Boolean).join(' ')
          : '–';
        return { ...a, fahrzeugName, kundeName };
      });
  }, [auftraege, fahrzeuge, kunden]);

  const selectedAuftrag = useMemo(
    () => eligibleAuftraege.find(a => a.record_id === selectedAuftragId) ?? null,
    [eligibleAuftraege, selectedAuftragId]
  );

  // Also look up a potentially closed auftrag for invoice step (after step 2 update)
  const selectedAuftragForInvoice = useMemo(() => {
    if (!selectedAuftragId) return null;
    const fahrzeugeMap = new Map(fahrzeuge.map(f => [f.record_id, f]));
    const kundenMap = new Map(kunden.map(k => [k.record_id, k]));
    const a = auftraege.find(au => au.record_id === selectedAuftragId);
    if (!a) return null;
    const fahrzeugId = a.fields.fahrzeug ? extractRecordId(a.fields.fahrzeug) : null;
    const kundeId = a.fields.kunde ? extractRecordId(a.fields.kunde) : null;
    const fz = fahrzeugId ? fahrzeugeMap.get(fahrzeugId) : undefined;
    const kd = kundeId ? kundenMap.get(kundeId) : undefined;
    const fahrzeugName = fz
      ? [fz.fields.marke, fz.fields.modell, fz.fields.kennzeichen].filter(Boolean).join(' ')
      : '–';
    const kundeName = kd
      ? [kd.fields.vorname, kd.fields.nachname].filter(Boolean).join(' ')
      : '–';
    return { ...a, fahrzeugName, kundeName };
  }, [selectedAuftragId, auftraege, fahrzeuge, kunden]);

  const nettoNum = parseFloat(nettobetrag) || 0;
  const bruttoNum = calcBrutto(nettoNum, mwstKey);

  function handleStepChange(s: number) {
    setStep(s);
    const params: Record<string, string> = { step: String(s) };
    if (selectedAuftragId) params['auftragId'] = selectedAuftragId;
    setSearchParams(params, { replace: true });
  }

  function handleSelectAuftrag(id: string) {
    setSelectedAuftragId(id);
    const params: Record<string, string> = { step: '2', auftragId: id };
    setSearchParams(params, { replace: true });
    setStep(2);
  }

  async function handleCloseAuftrag() {
    if (!selectedAuftragId) return;
    setClosing(true);
    setCloseError(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftragId, {
        status: 'abgeschlossen',
        bemerkungen_auftrag: bemerkungen || undefined,
      });
      await fetchAll();
      handleStepChange(3);
    } catch {
      setCloseError(tt('errorClose'));
    } finally {
      setClosing(false);
    }
  }

  async function handleCreateInvoice() {
    if (!selectedAuftragId) return;
    setCreatingInvoice(true);
    setInvoiceError(null);
    try {
      let rid = createdRechnungId;
      if (!rid) {
        const auftrag = auftraege.find(a => a.record_id === selectedAuftragId);
        const kundeId = auftrag?.fields.kunde ? extractRecordId(auftrag.fields.kunde) : null;
        const result = await LivingAppsService.createRechnungenEntry({
          rechnungsnummer,
          nettobetrag: nettoNum,
          mwst_satz: mwstKey,
          bruttobetrag: bruttoNum,
          rechnungsdatum,
          faelligkeitsdatum: faelligkeitsdatum || undefined,
          status_rechnung: 'offen',
          auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftragId),
          kunde: kundeId ? createRecordUrl(APP_IDS.KUNDEN, kundeId) : undefined,
        });
        rid = result.record_id;
        setCreatedRechnungId(rid);
      }
      setCreatedRechnungsnummer(rechnungsnummer);
      await fetchAll();
      handleStepChange(4);
    } catch {
      setInvoiceError(tt('errorCreate'));
    } finally {
      setCreatingInvoice(false);
    }
  }

  function handleReset() {
    setSelectedAuftragId(null);
    setBemerkungen('');
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstKey(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setRechnungsdatum(format(new Date(), 'yyyy-MM-dd'));
    setFaelligkeitsdatum('');
    setCreatedRechnungId(null);
    setCreatedRechnungsnummer(null);
    setCloseError(null);
    setInvoiceError(null);
    setSearchParams({ step: '1' }, { replace: true });
    setStep(1);
  }

  const mwstLabel = (key: string) => {
    if (key === 'mwst_19') return tt('mwst19');
    if (key === 'mwst_7') return tt('mwst7');
    return tt('mwst0');
  };

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
        { label: tt('step4') },
      ]}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Auftrag wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleAuftraege.map(a => ({
            id: a.record_id,
            title: a.fields.auftragsnummer ?? a.record_id,
            subtitle: `${a.fahrzeugName} · ${a.kundeName}`,
            status: a.fields.status
              ? { key: a.fields.status.key, label: a.fields.status.label }
              : undefined,
            stats: a.fields.wunschtermin
              ? [{ label: tt('desiredDate'), value: a.fields.wunschtermin.slice(0, 10) }]
              : undefined,
            icon: <IconFileInvoice size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectAuftrag}
          searchPlaceholder={tt('searchPlaceholder')}
          emptyText={tt('emptyMsg')}
        />
      )}

      {/* ── Step 2: Auftrag abschließen ── */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6">
            {/* Summary card */}
            <div className="rounded-2xl border bg-card p-5 space-y-3 overflow-hidden">
              <h3 className="font-semibold text-base">{tt('summaryTitle')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">{tt('orderNumber')}</p>
                  <p className="font-medium truncate">{selectedAuftrag.fields.auftragsnummer ?? '–'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{tt('vehicle')}</p>
                  <p className="font-medium truncate">{selectedAuftrag.fahrzeugName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{tt('customer')}</p>
                  <p className="font-medium truncate">{selectedAuftrag.kundeName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{tt('statusLabel')}</p>
                  <StatusBadge
                    statusKey={selectedAuftrag.fields.status?.key}
                    label={selectedAuftrag.fields.status?.label}
                  />
                </div>
                {selectedAuftrag.fields.wunschtermin && (
                  <div className="sm:col-span-2">
                    <p className="text-muted-foreground text-xs">{tt('desiredDate')}</p>
                    <p className="font-medium">{selectedAuftrag.fields.wunschtermin.slice(0, 10)}</p>
                  </div>
                )}
                {selectedAuftrag.fields.arbeitsbeschreibung && (
                  <div className="sm:col-span-2">
                    <p className="text-muted-foreground text-xs">{tt('workDesc')}</p>
                    <p className="text-sm line-clamp-2">{selectedAuftrag.fields.arbeitsbeschreibung}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Abschlussnotiz */}
            <div className="space-y-2">
              <Label htmlFor="bemerkungen">{tt('notes')}</Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungen}
                onChange={e => setBemerkungen(e.target.value)}
                placeholder={tt('notesPlaceholder')}
                rows={3}
                className="w-full"
              />
            </div>

            {closeError && (
              <p className="text-sm text-destructive">{closeError}</p>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={() => handleStepChange(1)}>
                ← {tt('step1')}
              </Button>
              <Button
                onClick={handleCloseAuftrag}
                disabled={closing}
                className="flex-1 sm:flex-none"
              >
                {closing ? tt('closing') : tt('closeOrder')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noOrderSelected')}</p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>{tt('restartBtn')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Rechnung erstellen ── */}
      {step === 3 && (
        selectedAuftragForInvoice ? (
          <div className="space-y-6">
            {/* Context reminder */}
            <div className="rounded-2xl border bg-secondary/50 p-4 text-sm space-y-1 overflow-hidden">
              <p className="font-medium truncate">
                {selectedAuftragForInvoice.fields.auftragsnummer ?? selectedAuftragId}
              </p>
              <p className="text-muted-foreground truncate">
                {selectedAuftragForInvoice.fahrzeugName} · {selectedAuftragForInvoice.kundeName}
              </p>
            </div>

            <h3 className="font-semibold text-base">{tt('invoiceTitle')}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Rechnungsnummer */}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="rechnungsnummer">
                  {tt('invoiceNumber')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rechnungsnummer"
                  value={rechnungsnummer}
                  onChange={e => setRechnungsnummer(e.target.value)}
                  placeholder={tt('invoiceNumberPlaceholder')}
                  className="w-full"
                />
              </div>

              {/* Nettobetrag */}
              <div className="space-y-2">
                <Label htmlFor="nettobetrag">
                  {tt('netAmount')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="nettobetrag"
                  type="number"
                  min="0"
                  step="0.01"
                  value={nettobetrag}
                  onChange={e => setNettobetrag(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* MwSt.-Satz */}
              <div className="space-y-2">
                <Label>{tt('vatRate')} <span className="text-destructive">*</span></Label>
                <div className="flex gap-2 flex-wrap">
                  {MWST_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setMwstKey(opt.key)}
                      className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        mwstKey === opt.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border hover:bg-secondary'
                      }`}
                    >
                      {mwstLabel(opt.key)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bruttobetrag (readonly, live) */}
              <div className="space-y-2">
                <Label htmlFor="bruttobetrag">
                  {tt('grossAmount')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="bruttobetrag"
                  type="number"
                  value={nettoNum > 0 ? bruttoNum.toFixed(2) : ''}
                  readOnly
                  className="w-full bg-secondary text-muted-foreground cursor-not-allowed"
                />
              </div>

              {/* Rechnungsdatum */}
              <div className="space-y-2">
                <Label htmlFor="rechnungsdatum">
                  {tt('invoiceDate')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rechnungsdatum"
                  type="date"
                  value={rechnungsdatum}
                  onChange={e => setRechnungsdatum(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Fälligkeitsdatum */}
              <div className="space-y-2">
                <Label htmlFor="faelligkeitsdatum">
                  {tt('dueDate')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="faelligkeitsdatum"
                  type="date"
                  value={faelligkeitsdatum}
                  onChange={e => setFaelligkeitsdatum(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {invoiceError && (
              <p className="text-sm text-destructive">{invoiceError}</p>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={handleCreateInvoice}
                disabled={
                  creatingInvoice ||
                  !rechnungsnummer.trim() ||
                  nettoNum <= 0 ||
                  !rechnungsdatum ||
                  !faelligkeitsdatum
                }
                className="flex-1 sm:flex-none"
              >
                {creatingInvoice ? tt('creating') : tt('createInvoice')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noAuftragForInvoice')}</p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>{tt('restartBtn')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Fertig ── */}
      {step === 4 && (
        <div className="text-center py-12 space-y-6">
          <div className="flex justify-center">
            <IconCircleCheck size={64} className="text-primary" stroke={1.5} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
            <p className="text-muted-foreground text-sm">
              {tt('successDesc', { nr: createdRechnungsnummer ?? '' })}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleReset} variant="outline">
              {tt('newOrder')}
            </Button>
            <Button asChild>
              <a href="#/">{tt('backToDashboard')}</a>
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
