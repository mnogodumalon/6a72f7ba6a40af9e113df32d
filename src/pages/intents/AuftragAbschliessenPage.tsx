/**
 * Auftrag abschließen — 4-Schritt-Wizard.
 * Steps: 1) Auftrag auswählen (nur offen/in_bearbeitung) →
 *         2) Auftrag bestätigen & abschließen (status → abgeschlossen) →
 *         3) Rechnung erstellen (createRechnungenEntry) →
 *         4) Rechnungs-PDF-Eintrag anlegen (createRechnungsPdfErstellenEntry).
 * Reads: auftraege (EnrichedAuftraege via enrichAuftraege), kunden.
 * Writes: auftraege (updateAuftraegeEntry), rechnungen (createRechnungenEntry),
 *         rechnungs_pdf_erstellen (createRechnungsPdfErstellenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo, useCallback } from 'react';
import { makeT } from '@/i18n';
import type { EnrichedAuftraege } from '@/types/enriched';
import type { Kunden } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId, uploadFile } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAuftraege } from '@/lib/enrich';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  IconClipboardCheck,
  IconFileInvoice,
  IconCircleCheck,
  IconAlertCircle,
  IconUpload,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageTitle: 'Auftrag abschließen',
    subtitle: 'Auftrag schließen, Rechnung erstellen und PDF anlegen',
    step1: 'Auftrag',
    step2: 'Abschließen',
    step3: 'Rechnung',
    step4: 'PDF-Eintrag',
    step1Title: 'Auftrag auswählen',
    step1Desc: 'Wähle einen offenen oder laufenden Auftrag aus.',
    step2Title: 'Auftrag abschließen',
    step2Desc: 'Überprüfe die Details und schließe den Auftrag ab.',
    step3Title: 'Rechnung erstellen',
    step3Desc: 'Erstelle die Rechnung zum abgeschlossenen Auftrag.',
    step4Title: 'Rechnungs-PDF anlegen',
    step4Desc: 'Lade das PDF der Rechnung hoch und lege den Eintrag an.',
    customer: 'Kunde',
    vehicle: 'Fahrzeug',
    orderNumber: 'Auftragsnummer',
    workDesc: 'Arbeitsbeschreibung',
    requestedDate: 'Wunschtermin',
    statusLabel: 'Status',
    closeOrderBtn: 'Auftrag abschließen',
    closingOrder: 'Wird abgeschlossen…',
    orderClosed: 'Auftrag abgeschlossen',
    orderClosedDesc: 'Der Auftrag wurde erfolgreich auf "Abgeschlossen" gesetzt.',
    continueToInvoice: 'Weiter zur Rechnung',
    invoiceNumber: 'Rechnungsnummer',
    netAmount: 'Nettobetrag (€)',
    vatRate: 'MwSt.-Satz',
    grossAmount: 'Bruttobetrag (€)',
    grossAmountCalc: 'Automatisch berechnet — kann überschrieben werden',
    invoiceDate: 'Rechnungsdatum',
    dueDate: 'Fälligkeitsdatum',
    createInvoiceBtn: 'Rechnung anlegen',
    creatingInvoice: 'Rechnung wird angelegt…',
    invoiceCreated: 'Rechnung angelegt',
    invoiceSummary: 'Netto: {net} · Brutto: {gross}',
    continueToDoc: 'Weiter zum PDF-Eintrag',
    pdfInvoiceNumber: 'Rechnungsnummer',
    pdfFirstName: 'Vorname des Kunden',
    pdfLastName: 'Nachname des Kunden',
    pdfNetAmount: 'Nettobetrag (€)',
    pdfGrossAmount: 'Bruttobetrag (€)',
    pdfFile: 'PDF-Dokument',
    pdfFileHint: 'Wähle die PDF-Datei der Rechnung aus',
    createPdfEntryBtn: 'PDF-Eintrag anlegen',
    creatingPdfEntry: 'PDF-Eintrag wird angelegt…',
    successTitle: 'Workflow abgeschlossen',
    successDesc: 'Rechnung {nr} wurde angelegt und das PDF ist hinterlegt.',
    newWorkflow: 'Neuen Auftrag abschließen',
    backToDashboard: 'Zurück zum Dashboard',
    noOrderSelected: 'Kein Auftrag ausgewählt.',
    restartBtn: 'Neu starten',
    noInvoice: 'Keine Rechnung vorhanden.',
    required: 'Pflichtfeld',
    mwst19: '19 %',
    mwst7: '7 %',
    mwst0: '0 %',
    noEligibleOrders: 'Keine offenen oder laufenden Aufträge vorhanden.',
  },
  en: {
    pageTitle: 'Close Work Order',
    subtitle: 'Close order, create invoice, and attach PDF',
    step1: 'Order',
    step2: 'Close',
    step3: 'Invoice',
    step4: 'PDF Entry',
    step1Title: 'Select Work Order',
    step1Desc: 'Pick an open or in-progress work order.',
    step2Title: 'Close Work Order',
    step2Desc: 'Review the details and close the work order.',
    step3Title: 'Create Invoice',
    step3Desc: 'Create the invoice for the closed work order.',
    step4Title: 'Create PDF Entry',
    step4Desc: 'Upload the invoice PDF and create the entry.',
    customer: 'Customer',
    vehicle: 'Vehicle',
    orderNumber: 'Order Number',
    workDesc: 'Work Description',
    requestedDate: 'Requested Date',
    statusLabel: 'Status',
    closeOrderBtn: 'Close Work Order',
    closingOrder: 'Closing…',
    orderClosed: 'Order Closed',
    orderClosedDesc: 'The work order was successfully set to "Completed".',
    continueToInvoice: 'Continue to Invoice',
    invoiceNumber: 'Invoice Number',
    netAmount: 'Net Amount (€)',
    vatRate: 'VAT Rate',
    grossAmount: 'Gross Amount (€)',
    grossAmountCalc: 'Auto-calculated — can be overridden',
    invoiceDate: 'Invoice Date',
    dueDate: 'Due Date',
    createInvoiceBtn: 'Create Invoice',
    creatingInvoice: 'Creating invoice…',
    invoiceCreated: 'Invoice Created',
    invoiceSummary: 'Net: {net} · Gross: {gross}',
    continueToDoc: 'Continue to PDF Entry',
    pdfInvoiceNumber: 'Invoice Number',
    pdfFirstName: 'Customer First Name',
    pdfLastName: 'Customer Last Name',
    pdfNetAmount: 'Net Amount (€)',
    pdfGrossAmount: 'Gross Amount (€)',
    pdfFile: 'PDF Document',
    pdfFileHint: 'Choose the invoice PDF file',
    createPdfEntryBtn: 'Create PDF Entry',
    creatingPdfEntry: 'Creating PDF entry…',
    successTitle: 'Workflow Complete',
    successDesc: 'Invoice {nr} has been created and the PDF is attached.',
    newWorkflow: 'Close Another Order',
    backToDashboard: 'Back to Dashboard',
    noOrderSelected: 'No order selected.',
    restartBtn: 'Start Over',
    noInvoice: 'No invoice available.',
    required: 'Required',
    mwst19: '19 %',
    mwst7: '7 %',
    mwst0: '0 %',
    noEligibleOrders: 'No open or in-progress orders available.',
  },
});

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];

function mwstRate(key: string): number {
  if (key === 'mwst_19') return 1.19;
  if (key === 'mwst_7') return 1.07;
  return 1.0;
}

export default function AuftragAbschliessenPage() {
  const { auftraege, kunden, fahrzeuge, fahrzeugeMap, kundenMap, loading, error, fetchAll } = useDashboardData();

  // Step state
  const [step, setStep] = useState(1);

  // Step 1 — selected order
  const [selectedAuftragId, setSelectedAuftragId] = useState<string | null>(null);

  // Step 2 — close order
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [orderClosed, setOrderClosed] = useState(false);

  // Step 3 — invoice form
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstKey, setMwstKey] = useState<string>(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [bruttobetrag, setBruttobetrag] = useState('');
  const [rechnungsdatum, setRechnungsdatum] = useState('');
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState('');
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [newRechnungId, setNewRechnungId] = useState<string | null>(null);
  const [invoiceNetto, setInvoiceNetto] = useState<number>(0);
  const [invoiceBrutto, setInvoiceBrutto] = useState<number>(0);
  const [invoiceNumber, setInvoiceNumber] = useState('');

  // Step 4 — PDF entry form
  const [pdfRechnungsnummer, setPdfRechnungsnummer] = useState('');
  const [pdfVorname, setPdfVorname] = useState('');
  const [pdfNachname, setPdfNachname] = useState('');
  const [pdfNetto, setPdfNetto] = useState('');
  const [pdfBrutto, setPdfBrutto] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneRechnungsnummer, setDoneRechnungsnummer] = useState('');

  // Enrich Auftraege with fahrzeug/kunde display names
  const enrichedAuftraege = useMemo(
    () => enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap }),
    [auftraege, fahrzeugeMap, kundenMap]
  );

  // Filter: only offen or in_bearbeitung
  const eligibleAuftraege = useMemo(
    () =>
      enrichedAuftraege.filter(
        (a) =>
          a.fields.status?.key === 'offen' ||
          a.fields.status?.key === 'in_bearbeitung'
      ),
    [enrichedAuftraege]
  );

  const selectedAuftrag = useMemo(
    () => eligibleAuftraege.find((a) => a.record_id === selectedAuftragId) ?? null,
    [eligibleAuftraege, selectedAuftragId]
  );

  // Derive kunde from selected auftrag
  const selectedKundeId = useMemo(() => {
    if (!selectedAuftrag) return null;
    return extractRecordId(selectedAuftrag.fields.kunde);
  }, [selectedAuftrag]);

  const selectedKunde = useMemo((): Kunden | null => {
    if (!selectedKundeId) return null;
    return kundenMap.get(selectedKundeId) ?? null;
  }, [selectedKundeId, kundenMap]);

  // Auto-calculate gross when netto or mwst changes
  const handleNettoChange = useCallback(
    (val: string) => {
      setNettobetrag(val);
      const n = parseFloat(val);
      if (!isNaN(n)) {
        setBruttobetrag((n * mwstRate(mwstKey)).toFixed(2));
      }
    },
    [mwstKey]
  );

  const handleMwstChange = useCallback(
    (val: string) => {
      setMwstKey(val);
      const n = parseFloat(nettobetrag);
      if (!isNaN(n)) {
        setBruttobetrag((n * mwstRate(val)).toFixed(2));
      }
    },
    [nettobetrag]
  );

  // Step 2: Close the order
  const handleCloseOrder = useCallback(async () => {
    if (!selectedAuftragId || orderClosed) return;
    setClosing(true);
    setCloseError(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftragId, {
        status: 'abgeschlossen',
      });
      await fetchAll();
      setOrderClosed(true);
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : String(e));
    } finally {
      setClosing(false);
    }
  }, [selectedAuftragId, orderClosed, fetchAll]);

  // Step 3: Create invoice (idempotent via newRechnungId guard)
  const handleCreateInvoice = useCallback(async () => {
    if (!selectedAuftragId || !selectedKundeId) return;

    // Idempotency: if already created, skip to next step
    if (newRechnungId) {
      setStep(4);
      return;
    }

    if (!rechnungsnummer || !nettobetrag || !bruttobetrag || !rechnungsdatum || !faelligkeitsdatum) return;

    setCreatingInvoice(true);
    setInvoiceError(null);
    try {
      const netto = parseFloat(nettobetrag);
      const brutto = parseFloat(bruttobetrag);

      const result = await LivingAppsService.createRechnungenEntry({
        rechnungsnummer,
        auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftragId),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
        nettobetrag: netto,
        mwst_satz: mwstKey,
        bruttobetrag: brutto,
        rechnungsdatum,
        faelligkeitsdatum,
        status_rechnung: 'offen',
      });

      await fetchAll();
      setNewRechnungId(result.record_id);
      setInvoiceNetto(netto);
      setInvoiceBrutto(brutto);
      setInvoiceNumber(rechnungsnummer);

      // Pre-fill PDF step
      setPdfRechnungsnummer(rechnungsnummer);
      setPdfVorname(selectedKunde?.fields.vorname ?? '');
      setPdfNachname(selectedKunde?.fields.nachname ?? '');
      setPdfNetto(netto.toFixed(2));
      setPdfBrutto(brutto.toFixed(2));

      setStep(4);
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingInvoice(false);
    }
  }, [
    selectedAuftragId, selectedKundeId, newRechnungId,
    rechnungsnummer, nettobetrag, bruttobetrag,
    rechnungsdatum, faelligkeitsdatum, mwstKey,
    selectedKunde, fetchAll,
  ]);

  // Step 4: Create PDF entry
  const handleCreatePdfEntry = useCallback(async () => {
    if (!newRechnungId || !pdfFile) return;

    setCreatingPdf(true);
    setPdfError(null);
    try {
      const fileUrl = await uploadFile(pdfFile);

      await LivingAppsService.createRechnungsPdfErstellenEntry({
        rechnung: createRecordUrl(APP_IDS.RECHNUNGEN, newRechnungId),
        pdf_rechnungsnummer: pdfRechnungsnummer,
        pdf_kunde_vorname: pdfVorname,
        pdf_kunde_nachname: pdfNachname,
        pdf_nettobetrag: parseFloat(pdfNetto),
        pdf_bruttobetrag: parseFloat(pdfBrutto),
        pdf_datei: fileUrl,
      });

      await fetchAll();
      setDoneRechnungsnummer(pdfRechnungsnummer);
      setDone(true);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPdf(false);
    }
  }, [
    newRechnungId, pdfFile,
    pdfRechnungsnummer, pdfVorname, pdfNachname,
    pdfNetto, pdfBrutto, fetchAll,
  ]);

  const handleReset = useCallback(() => {
    setStep(1);
    setSelectedAuftragId(null);
    setClosing(false);
    setCloseError(null);
    setOrderClosed(false);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstKey(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setBruttobetrag('');
    setRechnungsdatum('');
    setFaelligkeitsdatum('');
    setCreatingInvoice(false);
    setInvoiceError(null);
    setNewRechnungId(null);
    setInvoiceNetto(0);
    setInvoiceBrutto(0);
    setInvoiceNumber('');
    setPdfRechnungsnummer('');
    setPdfVorname('');
    setPdfNachname('');
    setPdfNetto('');
    setPdfBrutto('');
    setPdfFile(null);
    setCreatingPdf(false);
    setPdfError(null);
    setDone(false);
    setDoneRechnungsnummer('');
  }, []);

  // Suppress unused warning — fahrzeuge is used by enrichAuftraege indirectly via fahrzeugeMap
  void fahrzeuge;

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
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ─── Step 1: Auftrag auswählen ─── */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleAuftraege.map((a) => ({
            id: a.record_id,
            title: a.fields.auftragsnummer
              ? `${a.fields.auftragsnummer} — ${a.kundeName}`
              : a.kundeName || a.record_id,
            subtitle: [
              a.fahrzeugName,
              a.fields.wunschtermin ? formatDate(a.fields.wunschtermin) : undefined,
            ]
              .filter(Boolean)
              .join(' · '),
            status: a.fields.status
              ? { key: a.fields.status.key, label: a.fields.status.label }
              : undefined,
            icon: <IconClipboardCheck size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            setSelectedAuftragId(id);
            setOrderClosed(false);
            setCloseError(null);
            setStep(2);
          }}
          emptyText={tt('noEligibleOrders')}
        />
      )}

      {/* ─── Step 2: Auftrag abschließen ─── */}
      {step === 2 && (
        <div className="space-y-6">
          {!selectedAuftrag ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noOrderSelected')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('restartBtn')}
              </Button>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold mb-1">{tt('step2Title')}</h2>
                <p className="text-sm text-muted-foreground">{tt('step2Desc')}</p>
              </div>

              {/* Order summary card */}
              <div className="rounded-2xl border bg-card p-5 space-y-3 overflow-hidden">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-semibold text-base">
                    {selectedAuftrag.fields.auftragsnummer ?? '—'}
                  </span>
                  {selectedAuftrag.fields.status && (
                    <StatusBadge
                      statusKey={selectedAuftrag.fields.status.key}
                      label={selectedAuftrag.fields.status.label}
                    />
                  )}
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{tt('customer')}</dt>
                    <dd className="font-medium truncate">{selectedAuftrag.kundeName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{tt('vehicle')}</dt>
                    <dd className="font-medium truncate">{selectedAuftrag.fahrzeugName || '—'}</dd>
                  </div>
                  {selectedAuftrag.fields.wunschtermin && (
                    <div>
                      <dt className="text-muted-foreground">{tt('requestedDate')}</dt>
                      <dd className="font-medium">{formatDate(selectedAuftrag.fields.wunschtermin)}</dd>
                    </div>
                  )}
                  {selectedAuftrag.fields.arbeitsbeschreibung && (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">{tt('workDesc')}</dt>
                      <dd className="font-medium line-clamp-2">
                        {selectedAuftrag.fields.arbeitsbeschreibung}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Success state after closing */}
              {orderClosed && (
                <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4 flex items-start gap-3">
                  <IconCircleCheck size={20} className="text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-400">
                      {tt('orderClosed')}
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-500">
                      {tt('orderClosedDesc')}
                    </p>
                  </div>
                </div>
              )}

              {closeError && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
                  <IconAlertCircle size={20} className="text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{closeError}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                {!orderClosed && (
                  <Button
                    onClick={handleCloseOrder}
                    disabled={closing}
                    className="min-w-0"
                  >
                    <IconClipboardCheck size={16} className="mr-2" />
                    {closing ? tt('closingOrder') : tt('closeOrderBtn')}
                  </Button>
                )}
                {orderClosed && (
                  <Button onClick={() => setStep(3)}>
                    {tt('continueToInvoice')}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setStep(1)}>
                  &larr; {tt('step1')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Step 3: Rechnung erstellen ─── */}
      {step === 3 && (
        <div className="space-y-6">
          {!selectedAuftrag ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noOrderSelected')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('restartBtn')}
              </Button>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold mb-1">{tt('step3Title')}</h2>
                <p className="text-sm text-muted-foreground">{tt('step3Desc')}</p>
              </div>

              {/* Already created — show summary */}
              {newRechnungId && (
                <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4 flex items-start gap-3">
                  <IconCircleCheck size={20} className="text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-400">
                      {tt('invoiceCreated')} — {invoiceNumber}
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-500">
                      {tt('invoiceSummary', {
                        net: formatCurrency(invoiceNetto),
                        gross: formatCurrency(invoiceBrutto),
                      })}
                    </p>
                  </div>
                </div>
              )}

              {!newRechnungId && (
                <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="rechnungsnummer">
                        {tt('invoiceNumber')}{' '}
                        <span className="text-destructive text-xs">*</span>
                      </Label>
                      <Input
                        id="rechnungsnummer"
                        value={rechnungsnummer}
                        onChange={(e) => setRechnungsnummer(e.target.value)}
                        placeholder="RE-2026-001"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="nettobetrag">
                        {tt('netAmount')}{' '}
                        <span className="text-destructive text-xs">*</span>
                      </Label>
                      <Input
                        id="nettobetrag"
                        type="number"
                        min="0"
                        step="0.01"
                        value={nettobetrag}
                        onChange={(e) => handleNettoChange(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="mwst_satz">
                        {tt('vatRate')}{' '}
                        <span className="text-destructive text-xs">*</span>
                      </Label>
                      <Select value={mwstKey} onValueChange={handleMwstChange}>
                        <SelectTrigger id="mwst_satz" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MWST_OPTIONS.map((opt) => (
                            <SelectItem key={opt.key} value={opt.key}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="bruttobetrag">
                        {tt('grossAmount')}{' '}
                        <span className="text-destructive text-xs">*</span>
                      </Label>
                      <Input
                        id="bruttobetrag"
                        type="number"
                        min="0"
                        step="0.01"
                        value={bruttobetrag}
                        onChange={(e) => setBruttobetrag(e.target.value)}
                        placeholder="0.00"
                      />
                      <p className="text-xs text-muted-foreground">{tt('grossAmountCalc')}</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="rechnungsdatum">
                        {tt('invoiceDate')}{' '}
                        <span className="text-destructive text-xs">*</span>
                      </Label>
                      <Input
                        id="rechnungsdatum"
                        type="date"
                        value={rechnungsdatum}
                        onChange={(e) => setRechnungsdatum(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="faelligkeitsdatum">
                        {tt('dueDate')}{' '}
                        <span className="text-destructive text-xs">*</span>
                      </Label>
                      <Input
                        id="faelligkeitsdatum"
                        type="date"
                        value={faelligkeitsdatum}
                        onChange={(e) => setFaelligkeitsdatum(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {invoiceError && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
                  <IconAlertCircle size={20} className="text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{invoiceError}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                {!newRechnungId ? (
                  <Button
                    onClick={handleCreateInvoice}
                    disabled={
                      creatingInvoice ||
                      !rechnungsnummer ||
                      !nettobetrag ||
                      !bruttobetrag ||
                      !rechnungsdatum ||
                      !faelligkeitsdatum
                    }
                  >
                    <IconFileInvoice size={16} className="mr-2" />
                    {creatingInvoice ? tt('creatingInvoice') : tt('createInvoiceBtn')}
                  </Button>
                ) : (
                  <Button onClick={() => setStep(4)}>
                    {tt('continueToDoc')}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setStep(2)}>
                  &larr; {tt('step2')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Step 4: Rechnungs-PDF-Eintrag anlegen ─── */}
      {step === 4 && (
        <div className="space-y-6">
          {!newRechnungId ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noInvoice')}</p>
              <Button variant="outline" onClick={() => setStep(3)}>
                &larr; {tt('step3')}
              </Button>
            </div>
          ) : done ? (
            /* Success state */
            <div className="text-center py-12 space-y-6">
              <div className="flex justify-center">
                <IconCircleCheck size={56} className="text-green-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
                <p className="text-muted-foreground">
                  {tt('successDesc', { nr: doneRechnungsnummer })}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Button onClick={handleReset}>
                  {tt('newWorkflow')}
                </Button>
                <Button variant="outline" asChild>
                  <a href="#/">{tt('backToDashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold mb-1">{tt('step4Title')}</h2>
                <p className="text-sm text-muted-foreground">{tt('step4Desc')}</p>
              </div>

              {/* Invoice summary badge */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  <IconFileInvoice size={14} className="mr-1" />
                  {invoiceNumber || pdfRechnungsnummer}
                </Badge>
                <Badge variant="secondary">
                  {tt('invoiceSummary', {
                    net: formatCurrency(invoiceNetto),
                    gross: formatCurrency(invoiceBrutto),
                  })}
                </Badge>
              </div>

              <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pdf_rechnungsnummer">
                      {tt('pdfInvoiceNumber')}{' '}
                      <span className="text-destructive text-xs">*</span>
                    </Label>
                    <Input
                      id="pdf_rechnungsnummer"
                      value={pdfRechnungsnummer}
                      onChange={(e) => setPdfRechnungsnummer(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pdf_vorname">{tt('pdfFirstName')}</Label>
                    <Input
                      id="pdf_vorname"
                      value={pdfVorname}
                      onChange={(e) => setPdfVorname(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pdf_nachname">{tt('pdfLastName')}</Label>
                    <Input
                      id="pdf_nachname"
                      value={pdfNachname}
                      onChange={(e) => setPdfNachname(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pdf_netto">{tt('pdfNetAmount')}</Label>
                    <Input
                      id="pdf_netto"
                      type="number"
                      min="0"
                      step="0.01"
                      value={pdfNetto}
                      onChange={(e) => setPdfNetto(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pdf_brutto">{tt('pdfGrossAmount')}</Label>
                    <Input
                      id="pdf_brutto"
                      type="number"
                      min="0"
                      step="0.01"
                      value={pdfBrutto}
                      onChange={(e) => setPdfBrutto(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="pdf_datei">
                      {tt('pdfFile')}{' '}
                      <span className="text-destructive text-xs">*</span>
                    </Label>
                    <div className="flex items-center gap-3 flex-wrap">
                      <label
                        htmlFor="pdf_datei"
                        className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      >
                        <IconUpload size={16} />
                        {pdfFile ? pdfFile.name : tt('pdfFileHint')}
                        <input
                          id="pdf_datei"
                          type="file"
                          accept=".pdf,application/pdf"
                          className="hidden"
                          onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {pdfError && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
                  <IconAlertCircle size={20} className="text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{pdfError}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  onClick={handleCreatePdfEntry}
                  disabled={creatingPdf || !pdfFile || !pdfRechnungsnummer}
                >
                  <IconUpload size={16} className="mr-2" />
                  {creatingPdf ? tt('creatingPdfEntry') : tt('createPdfEntryBtn')}
                </Button>
                <Button variant="outline" onClick={() => setStep(3)}>
                  &larr; {tt('step3')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
