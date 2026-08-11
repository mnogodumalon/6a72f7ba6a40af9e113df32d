/**
 * Auftrag abrechnen — 4-Schritt-Wizard.
 * Steps: 1) Auftrag auswählen → 2) Auftrag abschließen → 3) Rechnung erstellen → 4) Rechnungs-PDF anlegen.
 * Reads: auftraege, kunden, fahrzeuge. Writes: auftraege (updateAuftraegeEntry), rechnungen (createRechnungenEntry), rechnungs_pdf_erstellen (createRechnungsPdfErstellenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { tc } from '@/i18n/common';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Auftraege, Kunden, Fahrzeuge } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId, uploadFile } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconFileInvoice, IconCheck, IconCircleCheck, IconAlertCircle, IconUpload } from '@tabler/icons-react';

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const STATUS_RECHNUNG_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

const tt = makeT({
  de: {
    pageTitle: 'Auftrag abrechnen',
    subtitle: 'Auftrag abschließen und Rechnung erstellen',
    step1: 'Auftrag wählen',
    step2: 'Abschließen',
    step3: 'Rechnung',
    step4: 'PDF-Eintrag',
    auftragWaehlen: 'Auftrag auswählen',
    auftragFilter: 'Nur offene und in Bearbeitung',
    keineAuftraege: 'Keine abrechenbaren Aufträge gefunden',
    auftragsnummer: 'Auftragsnummer',
    fahrzeug: 'Fahrzeug',
    kunde: 'Kunde',
    statusLabel: 'Status',
    wunschtermin: 'Wunschtermin',
    arbeitsbeschreibung: 'Arbeitsbeschreibung',
    auftragAbschliessen: 'Auftrag abschließen',
    auftragAbschliessenHinweis: 'Der Auftragsstatus wird auf „Abgeschlossen" gesetzt.',
    abschliessenBtn: 'Jetzt abschließen',
    abschliessenLaeuft: 'Wird abgeschlossen...',
    rechnungErstellen: 'Rechnung erstellen',
    rechnungsnummer: 'Rechnungsnummer',
    nettobetrag: 'Nettobetrag (€)',
    mwstSatz: 'MwSt.-Satz',
    bruttobetrag: 'Bruttobetrag (€) — automatisch berechnet',
    rechnungsdatum: 'Rechnungsdatum',
    faelligkeitsdatum: 'Fälligkeitsdatum',
    statusRechnung: 'Rechnungsstatus',
    rechnungAnlegen: 'Rechnung anlegen',
    rechnungLaeuft: 'Rechnung wird angelegt...',
    pdfEintragTitel: 'Rechnungs-PDF-Eintrag anlegen',
    pdfEintragHinweis: 'Die Felder sind mit den Rechnungsdaten vorausgefüllt. PDF-Upload ist optional.',
    pdfDatei: 'PDF-Datei (optional)',
    pdfUploadBtn: 'Datei hochladen',
    pdfUploading: 'Wird hochgeladen...',
    pdfAnlegen: 'Eintrag anlegen',
    pdfLaeuft: 'PDF-Eintrag wird angelegt...',
    erfolgTitel: 'Rechnung erfolgreich erstellt!',
    erfolgRechnungsnummer: 'Rechnungsnummer',
    erfolgBruttobetrag: 'Bruttobetrag',
    neueAbrechnung: 'Neue Abrechnung starten',
    zurueckDashboard: 'Zurück zum Dashboard',
    keineAuswahl: 'Kein Auftrag ausgewählt. Bitte mit Schritt 1 beginnen.',
    keineRechnung: 'Keine Rechnung vorhanden. Bitte Schritt 3 abschließen.',
    neuStarten: 'Neu starten',
    pflichtfeld: 'Bitte alle Pflichtfelder ausfüllen.',
    fehler: 'Fehler',
  },
  en: {
    pageTitle: 'Invoice Order',
    subtitle: 'Close order and create invoice',
    step1: 'Select Order',
    step2: 'Close',
    step3: 'Invoice',
    step4: 'PDF Entry',
    auftragWaehlen: 'Select order',
    auftragFilter: 'Only open and in progress',
    keineAuftraege: 'No billable orders found',
    auftragsnummer: 'Order Number',
    fahrzeug: 'Vehicle',
    kunde: 'Customer',
    statusLabel: 'Status',
    wunschtermin: 'Requested Date',
    arbeitsbeschreibung: 'Work Description',
    auftragAbschliessen: 'Close order',
    auftragAbschliessenHinweis: 'The order status will be set to "Completed".',
    abschliessenBtn: 'Close now',
    abschliessenLaeuft: 'Closing...',
    rechnungErstellen: 'Create invoice',
    rechnungsnummer: 'Invoice Number',
    nettobetrag: 'Net Amount (€)',
    mwstSatz: 'VAT Rate',
    bruttobetrag: 'Gross Amount (€) — automatically calculated',
    rechnungsdatum: 'Invoice Date',
    faelligkeitsdatum: 'Due Date',
    statusRechnung: 'Invoice Status',
    rechnungAnlegen: 'Create invoice',
    rechnungLaeuft: 'Creating invoice...',
    pdfEintragTitel: 'Create invoice PDF entry',
    pdfEintragHinweis: 'Fields are pre-filled with invoice data. PDF upload is optional.',
    pdfDatei: 'PDF File (optional)',
    pdfUploadBtn: 'Upload file',
    pdfUploading: 'Uploading...',
    pdfAnlegen: 'Create entry',
    pdfLaeuft: 'Creating PDF entry...',
    erfolgTitel: 'Invoice successfully created!',
    erfolgRechnungsnummer: 'Invoice Number',
    erfolgBruttobetrag: 'Gross Amount',
    neueAbrechnung: 'Start new invoicing',
    zurueckDashboard: 'Back to Dashboard',
    keineAuswahl: 'No order selected. Please start from step 1.',
    keineRechnung: 'No invoice available. Please complete step 3.',
    neuStarten: 'Start over',
    pflichtfeld: 'Please fill in all required fields.',
    fehler: 'Error',
  },
});

function getMwstProzent(key: string): number {
  if (key === 'mwst_19') return 19;
  if (key === 'mwst_7') return 7;
  return 0;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function getKundeName(k: Kunden | undefined): string {
  if (!k) return '—';
  return [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || '—';
}

function getFahrzeugName(f: Fahrzeuge | undefined): string {
  if (!f) return '—';
  return [f.fields.kennzeichen, f.fields.marke, f.fields.modell].filter(Boolean).join(' · ') || '—';
}

export default function AuftragAbrechnungPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { auftraege, kunden, fahrzeuge, kundenMap, fahrzeugeMap, loading, error, fetchAll } = useDashboardData();

  // Read auftragId from URL param for deep-linking → skip to step 2
  const initialAuftragId = searchParams.get('auftragId') ?? '';
  const initialStep = initialAuftragId ? 2 : (parseInt(searchParams.get('step') ?? '1', 10) || 1);

  const [step, setStep] = useState(initialStep);
  const [selectedAuftragId, setSelectedAuftragId] = useState<string>(initialAuftragId);

  // Step 2
  const [abschliessenLaeuft, setAbschliessenLaeuft] = useState(false);
  const [abschliessenFehler, setAbschliessenFehler] = useState<string | null>(null);
  const [auftragAbgeschlossen, setAuftragAbgeschlossen] = useState(false);

  // Step 3 — Rechnung
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstSatzKey, setMwstSatzKey] = useState<string>(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [rechnungsdatum, setRechnungsdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState('');
  const [statusRechnungKey, setStatusRechnungKey] = useState<string>(STATUS_RECHNUNG_OPTIONS.find(o => o.key === 'offen')?.key ?? STATUS_RECHNUNG_OPTIONS[0]?.key ?? 'offen');
  const [rechnungLaeuft, setRechnungLaeuft] = useState(false);
  const [rechnungFehler, setRechnungFehler] = useState<string | null>(null);
  const [newRechnungId, setNewRechnungId] = useState<string | null>(null);
  const [savedRechnungsnummer, setSavedRechnungsnummer] = useState('');
  const [savedBruttobetrag, setSavedBruttobetrag] = useState(0);

  // Step 4 — PDF
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const [pdfFehler, setPdfFehler] = useState<string | null>(null);
  const [pdfFertig, setPdfFertig] = useState(false);

  const handleStepChange = useCallback((newStep: number) => {
    setStep(newStep);
    const params = new URLSearchParams(searchParams);
    params.set('step', String(newStep));
    if (selectedAuftragId) params.set('auftragId', selectedAuftragId);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams, selectedAuftragId]);

  // Derived values
  const nettoNum = parseFloat(nettobetrag.replace(',', '.')) || 0;
  const mwstProzent = getMwstProzent(mwstSatzKey);
  const bruttoNum = parseFloat((nettoNum * (1 + mwstProzent / 100)).toFixed(2));

  const eligibleAuftraege = auftraege.filter(a => a.fields.status?.key !== 'abgeschlossen');

  const selectedAuftrag: Auftraege | undefined = auftraege.find(a => a.record_id === selectedAuftragId);
  const selectedKunde: Kunden | undefined = selectedAuftrag
    ? kundenMap.get(extractRecordId(selectedAuftrag.fields.kunde) ?? '') ?? undefined
    : undefined;
  const selectedFahrzeug: Fahrzeuge | undefined = selectedAuftrag
    ? fahrzeugeMap.get(extractRecordId(selectedAuftrag.fields.fahrzeug) ?? '') ?? undefined
    : undefined;

  // Fallback for missing kunden/fahrzeuge in maps (deep-link scenario)
  const kundeVorname = selectedKunde?.fields.vorname ?? '';
  const kundeNachname = selectedKunde?.fields.nachname ?? '';

  const handleAuftragSelect = (id: string) => {
    setSelectedAuftragId(id);
    setAuftragAbgeschlossen(false);
    setAbschliessenFehler(null);
    const params = new URLSearchParams(searchParams);
    params.set('auftragId', id);
    params.set('step', '2');
    setSearchParams(params, { replace: true });
    setStep(2);
  };

  const handleAbschliessen = async () => {
    if (!selectedAuftragId) return;
    setAbschliessenLaeuft(true);
    setAbschliessenFehler(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftragId, { status: 'abgeschlossen' });
      await fetchAll();
      setAuftragAbgeschlossen(true);
      handleStepChange(3);
    } catch (e) {
      setAbschliessenFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setAbschliessenLaeuft(false);
    }
  };

  const handleRechnungAnlegen = async () => {
    if (!rechnungsnummer || !nettobetrag || !rechnungsdatum || !faelligkeitsdatum) {
      setRechnungFehler(tt('pflichtfeld'));
      return;
    }
    if (!selectedAuftragId) return;

    setRechnungLaeuft(true);
    setRechnungFehler(null);

    // Idempotency guard: don't create a second Rechnung if the button is clicked again
    let rechnungId = newRechnungId;
    try {
      if (!rechnungId) {
        const kundeUrl = selectedKunde
          ? createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id)
          : undefined;

        const result = await LivingAppsService.createRechnungenEntry({
          rechnungsnummer,
          auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftragId),
          kunde: kundeUrl,
          nettobetrag: nettoNum,
          mwst_satz: mwstSatzKey,
          bruttobetrag: bruttoNum,
          rechnungsdatum,
          faelligkeitsdatum,
          status_rechnung: statusRechnungKey,
        });
        rechnungId = result.record_id;
        setNewRechnungId(rechnungId);
        setSavedRechnungsnummer(rechnungsnummer);
        setSavedBruttobetrag(bruttoNum);
      }
      await fetchAll();
      handleStepChange(4);
    } catch (e) {
      setRechnungFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setRechnungLaeuft(false);
    }
  };

  const handlePdfAnlegen = async () => {
    if (!newRechnungId) return;

    setPdfLaeuft(true);
    setPdfFehler(null);
    setPdfUploading(false);

    try {
      let pdfDateiUrl: string | undefined;
      if (pdfFile) {
        setPdfUploading(true);
        pdfDateiUrl = await uploadFile(pdfFile);
        setPdfUploading(false);
      }

      await LivingAppsService.createRechnungsPdfErstellenEntry({
        rechnung: createRecordUrl(APP_IDS.RECHNUNGEN, newRechnungId),
        pdf_rechnungsnummer: savedRechnungsnummer,
        pdf_kunde_vorname: kundeVorname,
        pdf_kunde_nachname: kundeNachname,
        pdf_nettobetrag: nettoNum,
        pdf_bruttobetrag: savedBruttobetrag,
        ...(pdfDateiUrl ? { pdf_datei: pdfDateiUrl } : {}),
      });
      await fetchAll();
      setPdfFertig(true);
    } catch (e) {
      setPdfFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfLaeuft(false);
      setPdfUploading(false);
    }
  };

  const handleReset = () => {
    setSelectedAuftragId('');
    setAuftragAbgeschlossen(false);
    setAbschliessenFehler(null);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstSatzKey(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setRechnungsdatum(format(new Date(), 'yyyy-MM-dd'));
    setFaelligkeitsdatum('');
    setStatusRechnungKey(STATUS_RECHNUNG_OPTIONS.find(o => o.key === 'offen')?.key ?? 'offen');
    setNewRechnungId(null);
    setSavedRechnungsnummer('');
    setSavedBruttobetrag(0);
    setPdfFile(null);
    setPdfFertig(false);
    setPdfFehler(null);
    setRechnungFehler(null);
    const params = new URLSearchParams();
    params.set('step', '1');
    setSearchParams(params, { replace: true });
    setStep(1);
  };

  const steps = [
    { label: tt('step1') },
    { label: tt('step2') },
    { label: tt('step3') },
    { label: tt('step4') },
  ];

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={steps}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* SCHRITT 1: Auftrag auswählen */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleAuftraege.map(a => {
            const fahr = fahrzeugeMap.get(extractRecordId(a.fields.fahrzeug) ?? '') ?? undefined;
            const kund = kundenMap.get(extractRecordId(a.fields.kunde) ?? '') ?? undefined;
            return {
              id: a.record_id,
              title: a.fields.auftragsnummer ?? a.record_id,
              subtitle: [getFahrzeugName(fahr), getKundeName(kund)].filter(s => s !== '—').join(' · '),
              status: a.fields.status
                ? { key: a.fields.status.key, label: a.fields.status.label }
                : undefined,
              stats: a.fields.wunschtermin
                ? [{ label: tt('wunschtermin'), value: a.fields.wunschtermin.slice(0, 10) }]
                : undefined,
              icon: <IconFileInvoice size={20} className="text-primary" />,
            };
          })}
          onSelect={handleAuftragSelect}
          searchPlaceholder={tt('auftragWaehlen')}
          emptyText={tt('keineAuftraege')}
          emptyIcon={<IconFileInvoice size={32} className="text-muted-foreground" />}
        />
      )}

      {/* SCHRITT 2: Auftrag abschließen */}
      {step === 2 && (
        <>
          {!selectedAuftragId ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('keineAuswahl')}</p>
              <Button variant="outline" onClick={() => handleStepChange(1)}>{tt('neuStarten')}</Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border bg-card overflow-hidden shadow-lg">
                <div className="p-5 space-y-4">
                  <h2 className="text-lg font-semibold">{tt('auftragAbschliessen')}</h2>
                  <p className="text-sm text-muted-foreground">{tt('auftragAbschliessenHinweis')}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">{tt('auftragsnummer')}: </span>
                      <span className="font-medium">{selectedAuftrag?.fields.auftragsnummer ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{tt('statusLabel')}: </span>
                      <StatusBadge
                        statusKey={selectedAuftrag?.fields.status?.key}
                        label={selectedAuftrag?.fields.status?.label}
                      />
                    </div>
                    <div>
                      <span className="text-muted-foreground">{tt('fahrzeug')}: </span>
                      <span className="font-medium">{getFahrzeugName(selectedFahrzeug)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{tt('kunde')}: </span>
                      <span className="font-medium">{getKundeName(selectedKunde)}</span>
                    </div>
                    {selectedAuftrag?.fields.arbeitsbeschreibung && (
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">{tt('arbeitsbeschreibung')}: </span>
                        <span className="font-medium">{selectedAuftrag.fields.arbeitsbeschreibung}</span>
                      </div>
                    )}
                    {selectedAuftrag?.fields.wunschtermin && (
                      <div>
                        <span className="text-muted-foreground">{tt('wunschtermin')}: </span>
                        <span className="font-medium">{selectedAuftrag.fields.wunschtermin.slice(0, 10)}</span>
                      </div>
                    )}
                  </div>

                  {abschliessenFehler && (
                    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      <IconAlertCircle size={16} />
                      <span>{abschliessenFehler}</span>
                    </div>
                  )}

                  {auftragAbgeschlossen ? (
                    <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                      <IconCircleCheck size={16} />
                      <span>{tc('abgeschlossen')}</span>
                    </div>
                  ) : (
                    <div className="flex gap-3 flex-wrap">
                      <Button variant="outline" onClick={() => handleStepChange(1)}>
                        {tc('zurueck')}
                      </Button>
                      <Button
                        onClick={handleAbschliessen}
                        disabled={abschliessenLaeuft}
                        className="flex-1 sm:flex-none"
                      >
                        {abschliessenLaeuft ? tt('abschliessenLaeuft') : tt('abschliessenBtn')}
                      </Button>
                    </div>
                  )}

                  {auftragAbgeschlossen && (
                    <Button onClick={() => handleStepChange(3)} className="w-full sm:w-auto">
                      {tc('weiter')} →
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* SCHRITT 3: Rechnung erstellen */}
      {step === 3 && (
        <>
          {!selectedAuftragId ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('keineAuswahl')}</p>
              <Button variant="outline" onClick={() => handleStepChange(1)}>{tt('neuStarten')}</Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border bg-card overflow-hidden shadow-lg">
                <div className="p-5 space-y-4">
                  <h2 className="text-lg font-semibold">{tt('rechnungErstellen')}</h2>

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
                      <Label>{tt('mwstSatz')} *</Label>
                      <Select value={mwstSatzKey} onValueChange={setMwstSatzKey}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MWST_OPTIONS.map(o => (
                            <SelectItem key={o.key} value={o.key}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label>{tt('bruttobetrag')}</Label>
                      <div className="rounded-lg bg-secondary border px-3 py-2 text-sm font-semibold text-foreground min-h-[40px] flex items-center">
                        {nettoNum > 0 ? formatCurrency(bruttoNum) : '—'}
                        {nettoNum > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground font-normal">
                            ({nettoNum > 0 ? `${nettoNum.toFixed(2)} + ${mwstProzent}% MwSt` : ''})
                          </span>
                        )}
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
                      <Label>{tt('statusRechnung')} *</Label>
                      <Select value={statusRechnungKey} onValueChange={setStatusRechnungKey}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_RECHNUNG_OPTIONS.map(o => (
                            <SelectItem key={o.key} value={o.key}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {rechnungFehler && (
                    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      <IconAlertCircle size={16} />
                      <span>{rechnungFehler}</span>
                    </div>
                  )}

                  <div className="flex gap-3 flex-wrap">
                    <Button variant="outline" onClick={() => handleStepChange(2)}>
                      {tc('zurueck')}
                    </Button>
                    <Button
                      onClick={handleRechnungAnlegen}
                      disabled={rechnungLaeuft || !rechnungsnummer || !nettobetrag || !rechnungsdatum || !faelligkeitsdatum}
                      className="flex-1 sm:flex-none"
                    >
                      {rechnungLaeuft ? tt('rechnungLaeuft') : tt('rechnungAnlegen')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* SCHRITT 4: PDF-Eintrag anlegen */}
      {step === 4 && (
        <>
          {!newRechnungId ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('keineRechnung')}</p>
              <Button variant="outline" onClick={() => handleStepChange(3)}>{tt('neuStarten')}</Button>
            </div>
          ) : pdfFertig ? (
            // Erfolgsanzeige
            <div className="rounded-2xl border bg-card overflow-hidden shadow-lg">
              <div className="p-8 text-center space-y-4">
                <div className="flex justify-center">
                  <IconCircleCheck size={56} className="text-green-500" />
                </div>
                <h2 className="text-xl font-bold">{tt('erfolgTitel')}</h2>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>
                    <span className="font-medium">{tt('erfolgRechnungsnummer')}: </span>
                    <span>{savedRechnungsnummer}</span>
                  </div>
                  <div>
                    <span className="font-medium">{tt('erfolgBruttobetrag')}: </span>
                    <span className="text-foreground font-semibold">{formatCurrency(savedBruttobetrag)}</span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Button variant="outline" onClick={handleReset}>
                    {tt('neueAbrechnung')}
                  </Button>
                  <a href="#/">
                    <Button>{tt('zurueckDashboard')}</Button>
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border bg-card overflow-hidden shadow-lg">
                <div className="p-5 space-y-4">
                  <h2 className="text-lg font-semibold">{tt('pdfEintragTitel')}</h2>
                  <p className="text-sm text-muted-foreground">{tt('pdfEintragHinweis')}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm rounded-lg bg-secondary p-4">
                    <div>
                      <span className="text-muted-foreground">{tt('rechnungsnummer')}: </span>
                      <span className="font-medium">{savedRechnungsnummer}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{tt('kunde')}: </span>
                      <span className="font-medium">{[kundeVorname, kundeNachname].filter(Boolean).join(' ') || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{tt('nettobetrag')}: </span>
                      <span className="font-medium">{formatCurrency(nettoNum)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{tt('bruttobetrag').split(' —')[0]}: </span>
                      <span className="font-semibold text-primary">{formatCurrency(savedBruttobetrag)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{tt('pdfDatei')}</Label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed cursor-pointer hover:bg-secondary transition-colors text-sm">
                        <IconUpload size={16} />
                        <span>{pdfFile ? pdfFile.name : tt('pdfUploadBtn')}</span>
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      {pdfFile && (
                        <Button variant="ghost" size="sm" onClick={() => setPdfFile(null)}>
                          {tc('entfernen')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {pdfFehler && (
                    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      <IconAlertCircle size={16} />
                      <span>{pdfFehler}</span>
                    </div>
                  )}

                  <div className="flex gap-3 flex-wrap">
                    <Button variant="outline" onClick={() => handleStepChange(3)}>
                      {tc('zurueck')}
                    </Button>
                    <Button
                      onClick={handlePdfAnlegen}
                      disabled={pdfLaeuft}
                      className="flex-1 sm:flex-none"
                    >
                      <IconCheck size={16} className="mr-1" />
                      {pdfUploading ? tt('pdfUploading') : pdfLaeuft ? tt('pdfLaeuft') : tt('pdfAnlegen')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </IntentWizardShell>
  );
}
