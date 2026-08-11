/**
 * Auftrag abschließen — 3-Schritt-Wizard.
 * Steps: 1) Offenen Auftrag wählen → 2) Auftrag abschließen & Rechnung anlegen → 3) Rechnungs-PDF-Eintrag erstellen.
 * Reads: auftraege (EnrichedAuftraege), kunden, fahrzeuge (via useDashboardData + enrichAuftraege).
 * Writes: auftraege (updateAuftraegeEntry), rechnungen (createRechnungenEntry), rechnungs_pdf_erstellen (createRechnungsPdfErstellenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo } from 'react';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAuftraege } from '@/lib/enrich';
import type { EnrichedAuftraege } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconFileInvoice, IconCircleCheck, IconAlertCircle } from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageTitle: 'Auftrag abschließen',
    subtitle: 'Auftrag schließen, Rechnung & PDF-Eintrag erstellen',
    step1: 'Auftrag wählen',
    step2: 'Rechnung anlegen',
    step3: 'Rechnungs-PDF',
    selectPlaceholder: 'Auftrag suchen …',
    selectEmpty: 'Keine offenen Aufträge vorhanden',
    rechnungsnummer: 'Rechnungsnummer',
    nettobetrag: 'Nettobetrag (€)',
    mwstSatzLabel: 'MwSt.-Satz',
    bruttobetrag: 'Bruttobetrag (€, berechnet)',
    rechnungsdatum: 'Rechnungsdatum',
    faelligkeitsdatum: 'Fälligkeitsdatum',
    statusRechnungLabel: 'Rechnungsstatus',
    btnAbschliessen: 'Auftrag abschließen & Rechnung anlegen',
    pdf_rechnungsnummer: 'Rechnungsnummer (PDF)',
    pdf_vorname: 'Kunden-Vorname',
    pdf_nachname: 'Kunden-Nachname',
    pdf_nettobetrag: 'Nettobetrag (€)',
    pdf_bruttobetrag: 'Bruttobetrag (€)',
    pdf_datei: 'PDF-Datei (hochladen)',
    btnPdfErstellen: 'PDF-Eintrag erstellen',
    successTitle: 'Erfolgreich abgeschlossen!',
    successMsg: 'Auftrag wurde abgeschlossen, Rechnung {nr} und PDF-Eintrag wurden angelegt.',
    btnNeu: 'Weiteren Auftrag abschließen',
    btnDashboard: 'Zurück zum Dashboard',
    errorRequired: 'Bitte alle Pflichtfelder ausfüllen.',
    stepNeedsStep1: 'Dieser Schritt benötigt einen ausgewählten Auftrag.',
    stepNeedsStep2: 'Dieser Schritt benötigt eine angelegte Rechnung.',
    btnRestart: 'Neu starten',
    pdfHint: 'Lade die fertige Rechnungs-PDF hoch, um den Eintrag zu vervollständigen.',
    phPdfUrl: 'https://example.com/rechnung.pdf', /* i18n-exempt */
  },
  en: {
    pageTitle: 'Close Order',
    subtitle: 'Close order, create invoice & PDF entry',
    step1: 'Select Order',
    step2: 'Create Invoice',
    step3: 'Invoice PDF',
    selectPlaceholder: 'Search order …',
    selectEmpty: 'No open orders available',
    rechnungsnummer: 'Invoice number',
    nettobetrag: 'Net amount (€)',
    mwstSatzLabel: 'VAT rate',
    bruttobetrag: 'Gross amount (€, calculated)',
    rechnungsdatum: 'Invoice date',
    faelligkeitsdatum: 'Due date',
    statusRechnungLabel: 'Invoice status',
    btnAbschliessen: 'Close order & create invoice',
    pdf_rechnungsnummer: 'Invoice number (PDF)',
    pdf_vorname: 'Customer first name',
    pdf_nachname: 'Customer last name',
    pdf_nettobetrag: 'Net amount (€)',
    pdf_bruttobetrag: 'Gross amount (€)',
    pdf_datei: 'PDF file (upload)',
    btnPdfErstellen: 'Create PDF entry',
    successTitle: 'Successfully completed!',
    successMsg: 'Order closed, invoice {nr} and PDF entry created.',
    btnNeu: 'Close another order',
    btnDashboard: 'Back to Dashboard',
    errorRequired: 'Please fill in all required fields.',
    stepNeedsStep1: 'This step requires a selected order.',
    stepNeedsStep2: 'This step requires a created invoice.',
    btnRestart: 'Restart',
    pdfHint: 'Upload the finished invoice PDF to complete the entry.',
    phPdfUrl: 'https://example.com/invoice.pdf', /* i18n-exempt */
  },
});

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const STATUS_RECHNUNG_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

function getMwstMultiplier(key: string): number {
  if (key === 'mwst_19') return 1.19;
  if (key === 'mwst_7') return 1.07;
  return 1.0;
}

export default function AuftragAbschliessenPage() {
  const { auftraege, kunden, fahrzeuge, fahrzeugeMap, kundenMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1 selection
  const [selectedAuftrag, setSelectedAuftrag] = useState<EnrichedAuftraege | null>(null);

  // Step 2 form fields
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstKey, setMwstKey] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [rechnungsdatum, setRechnungsdatum] = useState('');
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState('');
  const [statusRechnungKey, setStatusRechnungKey] = useState(STATUS_RECHNUNG_OPTIONS[0]?.key ?? 'offen');
  const [submitting2, setSubmitting2] = useState(false);
  const [errorMsg2, setErrorMsg2] = useState('');
  // idempotency guard: if rechnung was already created, store its id
  const [rechnungId, setRechnungId] = useState<string | null>(null);

  // Step 3 form fields
  const [pdfRechnungsnummer, setPdfRechnungsnummer] = useState('');
  const [pdfVorname, setPdfVorname] = useState('');
  const [pdfNachname, setPdfNachname] = useState('');
  const [pdfNettobetrag, setPdfNettobetrag] = useState('');
  const [pdfBruttobetrag, setPdfBruttobetrag] = useState('');
  const [pdfDatei, setPdfDatei] = useState('');
  const [submitting3, setSubmitting3] = useState(false);
  const [errorMsg3, setErrorMsg3] = useState('');
  const [done, setDone] = useState(false);
  const [createdRechnungsnummer, setCreatedRechnungsnummer] = useState('');

  // Enrich auftraege with fahrzeug/kunde display names
  const enrichedAuftraege = useMemo(
    () => enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap }),
    [auftraege, fahrzeugeMap, kundenMap]
  );

  // Only show open or in-progress orders
  const eligibleAuftraege = useMemo(
    () => enrichedAuftraege.filter(a => ['offen', 'in_bearbeitung'].includes(a.fields.status?.key ?? '')),
    [enrichedAuftraege]
  );

  // Computed brutto
  const bruttoValue = useMemo(() => {
    const net = parseFloat(nettobetrag);
    if (isNaN(net)) return '';
    return (net * getMwstMultiplier(mwstKey)).toFixed(2);
  }, [nettobetrag, mwstKey]);

  // Step 2: close auftrag + create rechnung
  async function handleStep2Submit() {
    if (!selectedAuftrag) return;
    if (!rechnungsnummer || !nettobetrag || !rechnungsdatum || !faelligkeitsdatum) {
      setErrorMsg2(tt('errorRequired'));
      return;
    }
    setErrorMsg2('');
    setSubmitting2(true);
    try {
      // Update auftrag status to abgeschlossen
      await LivingAppsService.updateAuftraegeEntry(selectedAuftrag.record_id, { status: 'abgeschlossen' });

      // Idempotency: only create rechnung once
      let rid = rechnungId;
      if (!rid) {
        const kundeId = extractRecordId(selectedAuftrag.fields.kunde);
        const net = parseFloat(nettobetrag);
        const brutto = parseFloat(bruttoValue);
        const rechnung = await LivingAppsService.createRechnungenEntry({
          rechnungsnummer,
          auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftrag.record_id),
          kunde: kundeId ? createRecordUrl(APP_IDS.KUNDEN, kundeId) : undefined,
          nettobetrag: net,
          mwst_satz: mwstKey,
          bruttobetrag: brutto,
          rechnungsdatum,
          faelligkeitsdatum,
          status_rechnung: statusRechnungKey,
        });
        rid = rechnung.record_id;
        setRechnungId(rid);
      }

      // Prefill step 3 fields from step 2 data
      const kundeId = extractRecordId(selectedAuftrag.fields.kunde);
      const kunde = kundeId ? kundenMap.get(kundeId) : null;
      setPdfRechnungsnummer(rechnungsnummer);
      setPdfVorname(kunde?.fields.vorname ?? '');
      setPdfNachname(kunde?.fields.nachname ?? '');
      setPdfNettobetrag(nettobetrag);
      setPdfBruttobetrag(bruttoValue);
      setCreatedRechnungsnummer(rechnungsnummer);

      await fetchAll();
      setStep(3);
    } catch (e) {
      setErrorMsg2(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setSubmitting2(false);
    }
  }

  // Step 3: create rechnungs pdf entry
  async function handleStep3Submit() {
    if (!rechnungId) return;
    if (!pdfDatei) {
      setErrorMsg3(tt('errorRequired'));
      return;
    }
    setErrorMsg3('');
    setSubmitting3(true);
    try {
      await LivingAppsService.createRechnungsPdfErstellenEntry({
        rechnung: createRecordUrl(APP_IDS.RECHNUNGEN, rechnungId),
        pdf_rechnungsnummer: pdfRechnungsnummer || undefined,
        pdf_kunde_vorname: pdfVorname || undefined,
        pdf_kunde_nachname: pdfNachname || undefined,
        pdf_nettobetrag: pdfNettobetrag ? parseFloat(pdfNettobetrag) : undefined,
        pdf_bruttobetrag: pdfBruttobetrag ? parseFloat(pdfBruttobetrag) : undefined,
        pdf_datei: pdfDatei,
      });
      await fetchAll();
      setDone(true);
    } catch (e) {
      setErrorMsg3(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setSubmitting3(false);
    }
  }

  function handleReset() {
    setSelectedAuftrag(null);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstKey(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setRechnungsdatum('');
    setFaelligkeitsdatum('');
    setStatusRechnungKey(STATUS_RECHNUNG_OPTIONS[0]?.key ?? 'offen');
    setSubmitting2(false);
    setErrorMsg2('');
    setRechnungId(null);
    setPdfRechnungsnummer('');
    setPdfVorname('');
    setPdfNachname('');
    setPdfNettobetrag('');
    setPdfBruttobetrag('');
    setPdfDatei('');
    setSubmitting3(false);
    setErrorMsg3('');
    setDone(false);
    setCreatedRechnungsnummer('');
    setStep(1);
  }

  // Unused vars guard — reference fahrzeuge to avoid TS unused warning
  void fahrzeuge;

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Select Auftrag */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleAuftraege.map(a => ({
            id: a.record_id,
            title: a.fields.auftragsnummer ? `${a.fields.auftragsnummer}` : `Auftrag ${a.record_id.slice(-6)}`,
            subtitle: [
              a.fields.arbeitsbeschreibung,
              a.fahrzeugName ? `Fahrzeug: ${a.fahrzeugName}` : '',
              a.kundeName ? `Kunde: ${a.kundeName}` : '',
            ].filter(Boolean).join(' · '),
            status: a.fields.status
              ? { key: a.fields.status.key, label: a.fields.status.label }
              : undefined,
            icon: <IconFileInvoice size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={(id) => {
            const found = eligibleAuftraege.find(a => a.record_id === id) ?? null;
            setSelectedAuftrag(found);
            setStep(2);
          }}
          searchPlaceholder={tt('selectPlaceholder')}
          emptyText={tt('selectEmpty')}
        />
      )}

      {/* Step 2: Close auftrag + create Rechnung */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6">
            {/* Selected Auftrag summary */}
            <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
              <div className="flex items-center gap-3 min-w-0">
                <IconFileInvoice size={20} className="text-primary shrink-0" stroke={1.5} />
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {selectedAuftrag.fields.auftragsnummer ?? `Auftrag ${selectedAuftrag.record_id.slice(-6)}`}
                  </p>
                  {selectedAuftrag.fields.arbeitsbeschreibung && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{selectedAuftrag.fields.arbeitsbeschreibung}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {selectedAuftrag.fields.status && (
                      <StatusBadge statusKey={selectedAuftrag.fields.status.key} label={selectedAuftrag.fields.status.label} />
                    )}
                    {selectedAuftrag.fahrzeugName && (
                      <span className="text-xs text-muted-foreground">{selectedAuftrag.fahrzeugName}</span>
                    )}
                    {selectedAuftrag.kundeName && (
                      <span className="text-xs text-muted-foreground">{selectedAuftrag.kundeName}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Invoice form */}
            <div className="rounded-2xl border bg-card p-4 space-y-4 overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="rechnungsnummer">{tt('rechnungsnummer')} *</Label>
                  <Input
                    id="rechnungsnummer"
                    value={rechnungsnummer}
                    onChange={e => setRechnungsnummer(e.target.value)}
                    placeholder="RE-2026-001"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nettobetrag">{tt('nettobetrag')} *</Label>
                  <Input
                    id="nettobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={nettobetrag}
                    onChange={e => setNettobetrag(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mwst_satz">{tt('mwstSatzLabel')} *</Label>
                  <Select value={mwstKey} onValueChange={setMwstKey}>
                    <SelectTrigger id="mwst_satz" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MWST_OPTIONS.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{tt('bruttobetrag')}</Label>
                  <div className="h-10 flex items-center px-3 rounded-md border bg-secondary text-sm font-medium">
                    {bruttoValue ? `${bruttoValue} €` : '—'}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rechnungsdatum">{tt('rechnungsdatum')} *</Label>
                  <Input
                    id="rechnungsdatum"
                    type="date"
                    value={rechnungsdatum}
                    onChange={e => setRechnungsdatum(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="faelligkeitsdatum">{tt('faelligkeitsdatum')} *</Label>
                  <Input
                    id="faelligkeitsdatum"
                    type="date"
                    value={faelligkeitsdatum}
                    onChange={e => setFaelligkeitsdatum(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="status_rechnung">{tt('statusRechnungLabel')}</Label>
                  <Select value={statusRechnungKey} onValueChange={setStatusRechnungKey}>
                    <SelectTrigger id="status_rechnung" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_RECHNUNG_OPTIONS.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {errorMsg2 && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <IconAlertCircle size={16} stroke={1.5} />
                  {errorMsg2}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="w-full sm:w-auto">
                  ← {tt('step1')}
                </Button>
                <Button
                  onClick={handleStep2Submit}
                  disabled={submitting2 || !rechnungsnummer || !nettobetrag || !rechnungsdatum || !faelligkeitsdatum}
                  className="w-full sm:flex-1"
                >
                  {submitting2 ? '…' : tt('btnAbschliessen')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepNeedsStep1')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('btnRestart')}</Button>
          </div>
        )
      )}

      {/* Step 3: Rechnungs-PDF erstellen */}
      {step === 3 && (
        done ? (
          <div className="flex flex-col items-center gap-6 py-12 text-center">
            <div className="rounded-full bg-primary/10 p-5">
              <IconCircleCheck size={48} className="text-primary" stroke={1.5} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                {tt('successMsg', { nr: createdRechnungsnummer })}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleReset} variant="outline">{tt('btnNeu')}</Button>
              <Button asChild>
                <a href="#/">{tt('btnDashboard')}</a>
              </Button>
            </div>
          </div>
        ) : rechnungId ? (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">{tt('pdfHint')}</p>
            <div className="rounded-2xl border bg-card p-4 space-y-4 overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="pdf_rechnungsnummer">{tt('pdf_rechnungsnummer')}</Label>
                  <Input
                    id="pdf_rechnungsnummer"
                    value={pdfRechnungsnummer}
                    onChange={e => setPdfRechnungsnummer(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pdf_vorname">{tt('pdf_vorname')}</Label>
                  <Input
                    id="pdf_vorname"
                    value={pdfVorname}
                    onChange={e => setPdfVorname(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pdf_nachname">{tt('pdf_nachname')}</Label>
                  <Input
                    id="pdf_nachname"
                    value={pdfNachname}
                    onChange={e => setPdfNachname(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pdf_nettobetrag">{tt('pdf_nettobetrag')}</Label>
                  <Input
                    id="pdf_nettobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pdfNettobetrag}
                    onChange={e => setPdfNettobetrag(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pdf_bruttobetrag">{tt('pdf_bruttobetrag')}</Label>
                  <Input
                    id="pdf_bruttobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pdfBruttobetrag}
                    onChange={e => setPdfBruttobetrag(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="pdf_datei">{tt('pdf_datei')} *</Label>
                  <Input
                    id="pdf_datei"
                    value={pdfDatei}
                    onChange={e => setPdfDatei(e.target.value)}
                    placeholder={tt('phPdfUrl')}
                  />
                </div>
              </div>

              {errorMsg3 && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <IconAlertCircle size={16} stroke={1.5} />
                  {errorMsg3}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(2)} className="w-full sm:w-auto">
                  ← {tt('step2')}
                </Button>
                <Button
                  onClick={handleStep3Submit}
                  disabled={submitting3 || !pdfDatei}
                  className="w-full sm:flex-1"
                >
                  {submitting3 ? '…' : tt('btnPdfErstellen')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepNeedsStep2')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('btnRestart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
