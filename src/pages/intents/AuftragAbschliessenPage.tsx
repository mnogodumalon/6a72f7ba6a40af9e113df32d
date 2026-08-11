/**
 * Auftrag abschließen — 5-Schritt-Wizard.
 * Steps: 1) Auftrag wählen (nur offen/in_bearbeitung) → 2) Auftrag abschließen (status update + Bemerkungen)
 *        → 3) Rechnung erstellen (Netto, MwSt, Brutto, Datum, Fälligkeit)
 *        → 4) PDF-Eintrag anlegen (Kundendaten, Beträge, Datei-Upload)
 *        → 5) Zusammenfassung.
 * Reads: auftraege, kunden. Writes: auftraege (updateAuftraegeEntry), rechnungen (createRechnungenEntry),
 *        rechnungs_pdf_erstellen (createRechnungsPdfErstellenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useCallback } from 'react';
import { format, addDays } from 'date-fns';
import { makeT } from '@/i18n';
import type { EnrichedAuftraege } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  IconClipboardCheck,
  IconReceipt,
  IconFileText,
  IconCircleCheck,
  IconAlertCircle,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Auftrag abschließen', /* i18n-exempt */
    subtitle: 'Auftrag schließen, Rechnung und PDF erstellen', /* i18n-exempt */
    step1: 'Auftrag wählen',
    step2: 'Abschließen',
    step3: 'Rechnung',
    step4: 'PDF-Eintrag',
    step5: 'Fertig',
    noOpenOrders: 'Keine offenen oder in Bearbeitung befindlichen Aufträge.',
    auftragsnummer: 'Auftragsnummer',
    fahrzeug: 'Fahrzeug',
    kunde: 'Kunde',
    statusLabel2: 'Status',
    prioritaetLabel: 'Priorität',
    step2Heading: 'Auftrag abschließen',
    step2Desc: 'Status wird auf "Abgeschlossen" gesetzt.',
    statusLabel: 'Status',
    bemerkungenLabel: 'Abschlussbemerkungen (optional)',
    bemerkungenPlaceholder: 'Durchgeführte Arbeiten, Hinweise…',
    closeBtn: 'Auftrag abschließen',
    closingMsg: 'Auftrag wird abgeschlossen…',
    step3Heading: 'Rechnung erstellen',
    rechnungsnummer: 'Rechnungsnummer',
    rechnungsnummerPlaceholder: 'z. B. RE-2026-001',
    nettobetrag: 'Nettobetrag (€)',
    mwstSatz: 'MwSt.-Satz',
    bruttobetrag: 'Bruttobetrag (€)',
    bruttoComputed: '(automatisch berechnet)',
    rechnungsdatum: 'Rechnungsdatum',
    faelligkeitsdatum: 'Fälligkeitsdatum',
    statusRechnung: 'Rechnungsstatus',
    createInvoiceBtn: 'Rechnung anlegen',
    creatingInvoice: 'Rechnung wird angelegt…',
    step4Heading: 'PDF-Eintrag anlegen',
    pdfRechnungsnummer: 'Rechnungsnummer',
    pdfVorname: 'Vorname des Kunden',
    pdfNachname: 'Nachname des Kunden',
    pdfNetto: 'Nettobetrag (€)',
    pdfBrutto: 'Bruttobetrag (€)',
    pdfDatei: 'PDF-Datei (optional)',
    createPdfBtn: 'PDF-Eintrag anlegen',
    creatingPdf: 'PDF-Eintrag wird angelegt…',
    step5Heading: 'Abschluss',
    step5Desc: 'Alle Schritte erfolgreich abgeschlossen.',
    auftragClosed: 'Auftrag abgeschlossen',
    rechnungCreated: 'Rechnung erstellt',
    pdfCreated: 'PDF-Eintrag angelegt',
    newFlow: 'Weiteren Auftrag abschließen',
    backDashboard: 'Zurück zum Dashboard',
    errorMsg: 'Fehler:',
    needsStep1: 'Dieser Schritt benötigt einen ausgewählten Auftrag.',
    needsStep2: 'Dieser Schritt benötigt einen abgeschlossenen Auftrag.',
    needsStep3: 'Dieser Schritt benötigt eine erstellte Rechnung.',
    restart: 'Neu starten',
    mwst19: '19 %',
    mwst7: '7 %',
    mwst0: '0 %',
    selectMwst: 'MwSt.-Satz wählen',
    selectStatusRechnung: 'Rechnungsstatus wählen',
  },
  en: {
    title: 'Close Order', /* i18n-exempt */
    subtitle: 'Close order, create invoice and PDF', /* i18n-exempt */
    step1: 'Select Order',
    step2: 'Close',
    step3: 'Invoice',
    step4: 'PDF Entry',
    step5: 'Done',
    noOpenOrders: 'No open or in-progress orders.',
    auftragsnummer: 'Order Number',
    fahrzeug: 'Vehicle',
    kunde: 'Customer',
    statusLabel2: 'Status',
    prioritaetLabel: 'Priority',
    step2Heading: 'Close Order',
    step2Desc: 'Status will be set to "Completed".',
    statusLabel: 'Status',
    bemerkungenLabel: 'Closing Notes (optional)',
    bemerkungenPlaceholder: 'Work performed, remarks…',
    closeBtn: 'Close Order',
    closingMsg: 'Closing order…',
    step3Heading: 'Create Invoice',
    rechnungsnummer: 'Invoice Number',
    rechnungsnummerPlaceholder: 'e.g. RE-2026-001',
    nettobetrag: 'Net Amount (€)',
    mwstSatz: 'VAT Rate',
    bruttobetrag: 'Gross Amount (€)',
    bruttoComputed: '(auto-computed)',
    rechnungsdatum: 'Invoice Date',
    faelligkeitsdatum: 'Due Date',
    statusRechnung: 'Invoice Status',
    createInvoiceBtn: 'Create Invoice',
    creatingInvoice: 'Creating invoice…',
    step4Heading: 'Create PDF Entry',
    pdfRechnungsnummer: 'Invoice Number',
    pdfVorname: 'Customer First Name',
    pdfNachname: 'Customer Last Name',
    pdfNetto: 'Net Amount (€)',
    pdfBrutto: 'Gross Amount (€)',
    pdfDatei: 'PDF File (optional)',
    createPdfBtn: 'Create PDF Entry',
    creatingPdf: 'Creating PDF entry…',
    step5Heading: 'Complete',
    step5Desc: 'All steps completed successfully.',
    auftragClosed: 'Order closed',
    rechnungCreated: 'Invoice created',
    pdfCreated: 'PDF entry created',
    newFlow: 'Close another order',
    backDashboard: 'Back to Dashboard',
    errorMsg: 'Error:',
    needsStep1: 'This step requires a selected order.',
    needsStep2: 'This step requires a closed order.',
    needsStep3: 'This step requires a created invoice.',
    restart: 'Restart',
    mwst19: '19 %',
    mwst7: '7 %',
    mwst0: '0 %',
    selectMwst: 'Select VAT rate',
    selectStatusRechnung: 'Select invoice status',
  },
});

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const STATUS_RECHNUNG_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

function computeBrutto(netto: number, mwstKey: string): number {
  if (mwstKey === 'mwst_19') return Math.round(netto * 1.19 * 100) / 100;
  if (mwstKey === 'mwst_7') return Math.round(netto * 1.07 * 100) / 100;
  return netto;
}

export default function AuftragAbschliessenPage() {
  const { auftraege, kunden, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1 selection
  const [selectedAuftrag, setSelectedAuftrag] = useState<EnrichedAuftraege | null>(null);

  // Step 2 fields
  const [bemerkungen, setBemerkungen] = useState('');
  const [closingBusy, setClosingBusy] = useState(false);
  const [closingError, setClosingError] = useState<string | null>(null);

  // Step 3 fields
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstKey, setMwstKey] = useState('mwst_19');
  const [bruttoOverride, setBruttoOverride] = useState<string>('');
  const [rechnungsdatum, setRechnungsdatum] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState(() => format(addDays(new Date(), 30), 'yyyy-MM-dd'));
  const [statusRechnung, setStatusRechnung] = useState('offen');
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [createdRechnungId, setCreatedRechnungId] = useState<string | null>(null);

  // Step 4 fields
  const [pdfVorname, setPdfVorname] = useState('');
  const [pdfNachname, setPdfNachname] = useState('');
  const [pdfNetto, setPdfNetto] = useState('');
  const [pdfBrutto, setPdfBrutto] = useState('');
  const [pdfRechnungsnummer, setPdfRechnungsnummer] = useState('');
  const [pdfDatei, setPdfDatei] = useState<File | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [createdPdfId, setCreatedPdfId] = useState<string | null>(null);

  const eligibleAuftraege = (auftraege as EnrichedAuftraege[]).filter(
    (a) => a.fields.status?.key === 'offen' || a.fields.status?.key === 'in_bearbeitung'
  );

  const handleSelectAuftrag = useCallback(
    (id: string) => {
      const found = eligibleAuftraege.find((a) => a.record_id === id);
      if (!found) return;
      setSelectedAuftrag(found);

      // Pre-fill kunde name in pdf fields from kunden data
      const kundeId = extractRecordId(found.fields.kunde);
      if (kundeId) {
        const kunde = kunden.find((k) => k.record_id === kundeId);
        if (kunde) {
          setPdfVorname(kunde.fields.vorname ?? '');
          setPdfNachname(kunde.fields.nachname ?? '');
        }
      }
      setStep(2);
    },
    [eligibleAuftraege, kunden]
  );

  const computedBrutto = bruttoOverride !== ''
    ? parseFloat(bruttoOverride) || 0
    : computeBrutto(parseFloat(nettobetrag) || 0, mwstKey);

  const handleCloseOrder = useCallback(async () => {
    if (!selectedAuftrag) return;
    setClosingBusy(true);
    setClosingError(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftrag.record_id, {
        status: 'abgeschlossen',
        bemerkungen_auftrag: bemerkungen || undefined,
      });
      await fetchAll();
      setStep(3);
    } catch (e) {
      setClosingError(e instanceof Error ? e.message : String(e));
    } finally {
      setClosingBusy(false);
    }
  }, [selectedAuftrag, bemerkungen, fetchAll]);

  const handleCreateInvoice = useCallback(async () => {
    if (!selectedAuftrag) return;

    let invoiceId = createdRechnungId;
    if (!invoiceId) {
      setInvoiceBusy(true);
      setInvoiceError(null);
      try {
        const kundeId = extractRecordId(selectedAuftrag.fields.kunde);
        const result = await LivingAppsService.createRechnungenEntry({
          rechnungsnummer,
          nettobetrag: parseFloat(nettobetrag) || 0,
          mwst_satz: mwstKey,
          bruttobetrag: computedBrutto,
          rechnungsdatum,
          faelligkeitsdatum,
          status_rechnung: statusRechnung,
          auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftrag.record_id),
          kunde: kundeId ? createRecordUrl(APP_IDS.KUNDEN, kundeId) : undefined,
        });
        invoiceId = result.record_id;
        setCreatedRechnungId(invoiceId);

        // Pre-fill step 4 from step 3 data
        setPdfRechnungsnummer(rechnungsnummer);
        setPdfNetto(String(parseFloat(nettobetrag) || 0));
        setPdfBrutto(String(computedBrutto));

        await fetchAll();
        setStep(4);
      } catch (e) {
        setInvoiceError(e instanceof Error ? e.message : String(e));
      } finally {
        setInvoiceBusy(false);
      }
    } else {
      setStep(4);
    }
  }, [
    selectedAuftrag,
    createdRechnungId,
    rechnungsnummer,
    nettobetrag,
    mwstKey,
    computedBrutto,
    rechnungsdatum,
    faelligkeitsdatum,
    statusRechnung,
    fetchAll,
  ]);

  const handleCreatePdf = useCallback(async () => {
    if (!createdRechnungId) return;

    let pdfId = createdPdfId;
    if (!pdfId) {
      setPdfBusy(true);
      setPdfError(null);
      try {
        const result = await LivingAppsService.createRechnungsPdfErstellenEntry({
          rechnung: createRecordUrl(APP_IDS.RECHNUNGEN, createdRechnungId),
          pdf_rechnungsnummer: pdfRechnungsnummer,
          pdf_kunde_vorname: pdfVorname,
          pdf_kunde_nachname: pdfNachname,
          pdf_nettobetrag: parseFloat(pdfNetto) || 0,
          pdf_bruttobetrag: parseFloat(pdfBrutto) || 0,
          pdf_datei: pdfDatei ? (pdfDatei as unknown as string) : undefined,
        });
        pdfId = result.record_id;
        setCreatedPdfId(pdfId);
        await fetchAll();
        setStep(5);
      } catch (e) {
        setPdfError(e instanceof Error ? e.message : String(e));
      } finally {
        setPdfBusy(false);
      }
    } else {
      setStep(5);
    }
  }, [createdRechnungId, createdPdfId, pdfRechnungsnummer, pdfVorname, pdfNachname, pdfNetto, pdfBrutto, pdfDatei, fetchAll]);

  const handleReset = useCallback(() => {
    setSelectedAuftrag(null);
    setBemerkungen('');
    setClosingError(null);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstKey('mwst_19');
    setBruttoOverride('');
    setRechnungsdatum(format(new Date(), 'yyyy-MM-dd'));
    setFaelligkeitsdatum(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
    setStatusRechnung('offen');
    setInvoiceError(null);
    setCreatedRechnungId(null);
    setPdfVorname('');
    setPdfNachname('');
    setPdfNetto('');
    setPdfBrutto('');
    setPdfRechnungsnummer('');
    setPdfDatei(null);
    setPdfError(null);
    setCreatedPdfId(null);
    setStep(1);
  }, []);

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
        { label: tt('step4') },
        { label: tt('step5') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Auftrag wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleAuftraege.map((a) => ({
            id: a.record_id,
            title: a.fields.auftragsnummer ?? a.record_id,
            subtitle: [a.fahrzeugName, a.kundeName].filter(Boolean).join(' · '),
            status: a.fields.status
              ? { key: a.fields.status.key, label: a.fields.status.label }
              : undefined,
            stats: a.fields.prioritaet
              ? [{ label: tt('prioritaetLabel'), value: a.fields.prioritaet.label }]
              : [],
            icon: <IconClipboardCheck size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleSelectAuftrag}
          emptyText={tt('noOpenOrders')}
          emptyIcon={<IconClipboardCheck size={32} stroke={1.5} />}
        />
      )}

      {/* ── Step 2: Auftrag abschließen ── */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6 max-w-lg">
            <div className="rounded-2xl border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <IconClipboardCheck size={18} stroke={1.5} className="text-primary" />
                <span className="font-semibold">{selectedAuftrag.fields.auftragsnummer}</span>
                {selectedAuftrag.fields.status && (
                  <StatusBadge
                    statusKey={selectedAuftrag.fields.status.key}
                    label={selectedAuftrag.fields.status.label}
                  />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {[selectedAuftrag.fahrzeugName, selectedAuftrag.kundeName].filter(Boolean).join(' · ')}
              </p>
            </div>

            <div className="rounded-2xl border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
              {tt('step2Desc')}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bemerkungen">{tt('bemerkungenLabel')}</Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungen}
                onChange={(e) => setBemerkungen(e.target.value)}
                placeholder={tt('bemerkungenPlaceholder')}
                rows={3}
              />
            </div>

            {closingError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <IconAlertCircle size={16} stroke={1.5} />
                {tt('errorMsg')} {closingError}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleCloseOrder}
              disabled={closingBusy}
            >
              {closingBusy ? tt('closingMsg') : tt('closeBtn')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('needsStep1')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Rechnung erstellen ── */}
      {step === 3 && (
        selectedAuftrag ? (
          <div className="space-y-5 max-w-lg">
            <div className="flex items-center gap-2 text-base font-semibold">
              <IconReceipt size={20} stroke={1.5} className="text-primary" />
              {tt('step3Heading')}
            </div>

            <div className="space-y-2">
              <Label htmlFor="rechnungsnummer">{tt('rechnungsnummer')} *</Label>
              <Input
                id="rechnungsnummer"
                value={rechnungsnummer}
                onChange={(e) => setRechnungsnummer(e.target.value)}
                placeholder={tt('rechnungsnummerPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nettobetrag">{tt('nettobetrag')} *</Label>
              <Input
                id="nettobetrag"
                type="number"
                min="0"
                step="0.01"
                value={nettobetrag}
                onChange={(e) => {
                  setNettobetrag(e.target.value);
                  setBruttoOverride('');
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>{tt('mwstSatz')} *</Label>
              <div className="flex gap-2 flex-wrap">
                {MWST_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setMwstKey(opt.key);
                      setBruttoOverride('');
                    }}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                      mwstKey === opt.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-foreground hover:bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bruttobetrag">
                {tt('bruttobetrag')} <span className="text-muted-foreground text-xs">{tt('bruttoComputed')}</span>
              </Label>
              <Input
                id="bruttobetrag"
                type="number"
                min="0"
                step="0.01"
                value={bruttoOverride !== '' ? bruttoOverride : String(computedBrutto)}
                onChange={(e) => setBruttoOverride(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rechnungsdatum">{tt('rechnungsdatum')} *</Label>
                <Input
                  id="rechnungsdatum"
                  type="date"
                  value={rechnungsdatum}
                  onChange={(e) => setRechnungsdatum(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="faelligkeitsdatum">{tt('faelligkeitsdatum')} *</Label>
                <Input
                  id="faelligkeitsdatum"
                  type="date"
                  value={faelligkeitsdatum}
                  onChange={(e) => setFaelligkeitsdatum(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{tt('statusRechnung')} *</Label>
              <div className="flex gap-2 flex-wrap">
                {STATUS_RECHNUNG_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setStatusRechnung(opt.key)}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                      statusRechnung === opt.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-foreground hover:bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {invoiceError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <IconAlertCircle size={16} stroke={1.5} />
                {tt('errorMsg')} {invoiceError}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleCreateInvoice}
              disabled={invoiceBusy || !rechnungsnummer || !nettobetrag}
            >
              {invoiceBusy ? tt('creatingInvoice') : tt('createInvoiceBtn')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('needsStep2')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: PDF-Eintrag anlegen ── */}
      {step === 4 && (
        createdRechnungId ? (
          <div className="space-y-5 max-w-lg">
            <div className="flex items-center gap-2 text-base font-semibold">
              <IconFileText size={20} stroke={1.5} className="text-primary" />
              {tt('step4Heading')}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pdfRechnungsnummer">{tt('pdfRechnungsnummer')}</Label>
              <Input
                id="pdfRechnungsnummer"
                value={pdfRechnungsnummer}
                onChange={(e) => setPdfRechnungsnummer(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pdfVorname">{tt('pdfVorname')}</Label>
                <Input
                  id="pdfVorname"
                  value={pdfVorname}
                  onChange={(e) => setPdfVorname(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pdfNachname">{tt('pdfNachname')}</Label>
                <Input
                  id="pdfNachname"
                  value={pdfNachname}
                  onChange={(e) => setPdfNachname(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pdfNetto">{tt('pdfNetto')}</Label>
                <Input
                  id="pdfNetto"
                  type="number"
                  min="0"
                  step="0.01"
                  value={pdfNetto}
                  onChange={(e) => setPdfNetto(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pdfBrutto">{tt('pdfBrutto')}</Label>
                <Input
                  id="pdfBrutto"
                  type="number"
                  min="0"
                  step="0.01"
                  value={pdfBrutto}
                  onChange={(e) => setPdfBrutto(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pdfDatei">{tt('pdfDatei')}</Label>
              <Input
                id="pdfDatei"
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfDatei(e.target.files?.[0] ?? null)}
                className="cursor-pointer"
              />
            </div>

            {pdfError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <IconAlertCircle size={16} stroke={1.5} />
                {tt('errorMsg')} {pdfError}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleCreatePdf}
              disabled={pdfBusy}
            >
              {pdfBusy ? tt('creatingPdf') : tt('createPdfBtn')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('needsStep3')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 5: Zusammenfassung ── */}
      {step === 5 && (
        <div className="space-y-6 max-w-lg">
          <div className="flex items-center gap-3">
            <IconCircleCheck size={28} stroke={1.5} className="text-green-600" />
            <div>
              <p className="text-lg font-semibold">{tt('step5Heading')}</p>
              <p className="text-sm text-muted-foreground">{tt('step5Desc')}</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-card divide-y overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <IconClipboardCheck size={18} stroke={1.5} className="text-green-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{tt('auftragClosed')}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedAuftrag?.fields.auftragsnummer}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4">
              <IconReceipt size={18} stroke={1.5} className="text-green-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{tt('rechnungCreated')}</p>
                <p className="text-xs text-muted-foreground truncate">{rechnungsnummer}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4">
              <IconFileText size={18} stroke={1.5} className="text-green-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{tt('pdfCreated')}</p>
                <p className="text-xs text-muted-foreground truncate">{pdfRechnungsnummer}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="flex-1" onClick={handleReset}>
              {tt('newFlow')}
            </Button>
            <Button variant="outline" className="flex-1" asChild>
              <a href="#/">{tt('backDashboard')}</a>
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
