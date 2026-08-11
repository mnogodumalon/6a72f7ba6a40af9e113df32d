/**
 * Auftrag abrechnen — 3-Schritt-Wizard.
 * Steps: 1) Auftrag wählen (nur status='abgeschlossen') →
 *        2) Rechnung erstellen (createRechnungenEntry) →
 *        3) PDF-Eintrag anlegen (createRechnungsPdfErstellenEntry).
 * Reads: auftraege (filtered to 'abgeschlossen'), kunden (for prefill via getKundenEntry).
 * Writes: rechnungen (createRechnungenEntry), rechnungs_pdf_erstellen (createRechnungsPdfErstellenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useCallback } from 'react';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { EnrichedAuftraege } from '@/types/enriched';
import type { Kunden } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconFileInvoice, IconCircleCheck, IconAlertCircle } from '@tabler/icons-react';
import { enrichAuftraege } from '@/lib/enrich';

const tt = makeT({
  de: {
    pageTitle: 'Auftrag abrechnen',
    subtitle: 'Rechnung und PDF-Eintrag in 3 Schritten erstellen',
    step1: 'Auftrag',
    step2: 'Rechnung',
    step3: 'PDF-Eintrag',
    step4: 'Fertig',
    searchPlaceholder: 'Auftrag suchen …',
    keineAuftraege: 'Keine abgeschlossenen Aufträge gefunden',
    wunschterminLabel: 'Wunschtermin',
    rechnungsnummer: 'Rechnungsnummer',
    nettobetrag: 'Nettobetrag (€)',
    bruttobetrag: 'Bruttobetrag (€)',
    mwstSatzLabel: 'MwSt.-Satz',
    rechnungsdatum: 'Rechnungsdatum',
    faelligkeitsdatum: 'Fälligkeitsdatum',
    statusRechnungLabel: 'Rechnungsstatus',
    weiter: 'Weiter zu Schritt 3',
    rechnungErstellen: 'Rechnung erstellen',
    pdfTitel: 'PDF-Eintrag anlegen',
    pdf_rechnungsnummer: 'Rechnungsnummer',
    pdf_vorname: 'Vorname Kunde',
    pdf_nachname: 'Nachname Kunde',
    pdf_nettobetrag: 'Nettobetrag (€)',
    pdf_bruttobetrag: 'Bruttobetrag (€)',
    pdf_datei: 'PDF-Datei',
    pdfAnlegen: 'PDF-Eintrag anlegen',
    successTitle: 'Abrechnung abgeschlossen',
    successMsg: 'Rechnung {nr} wurde erfolgreich erstellt.',
    neueAbrechnung: 'Neue Abrechnung',
    backDashboard: 'Zurück zum Dashboard',
    noAuftrag: 'Kein Auftrag ausgewählt. Bitte von Schritt 1 starten.',
    noRechnung: 'Keine Rechnung erstellt. Bitte Schritt 2 abschließen.',
    neuStarten: 'Neu starten',
    bruttoHint: 'Berechneter Brutto: {val} €',
    pflichtfeld: 'Bitte alle Pflichtfelder ausfüllen.',
    fehler: 'Fehler beim Speichern. Bitte erneut versuchen.',
  },
  en: {
    pageTitle: 'Invoice Order',
    subtitle: 'Create invoice and PDF entry in 3 steps',
    step1: 'Order',
    step2: 'Invoice',
    step3: 'PDF Entry',
    step4: 'Done',
    searchPlaceholder: 'Search order …',
    keineAuftraege: 'No completed orders found',
    wunschterminLabel: 'Desired date',
    rechnungsnummer: 'Invoice number',
    nettobetrag: 'Net amount (€)',
    bruttobetrag: 'Gross amount (€)',
    mwstSatzLabel: 'VAT rate',
    rechnungsdatum: 'Invoice date',
    faelligkeitsdatum: 'Due date',
    statusRechnungLabel: 'Invoice status',
    weiter: 'Continue to step 3',
    rechnungErstellen: 'Create invoice',
    pdfTitel: 'Create PDF entry',
    pdf_rechnungsnummer: 'Invoice number',
    pdf_vorname: 'Customer first name',
    pdf_nachname: 'Customer last name',
    pdf_nettobetrag: 'Net amount (€)',
    pdf_bruttobetrag: 'Gross amount (€)',
    pdf_datei: 'PDF file',
    pdfAnlegen: 'Create PDF entry',
    successTitle: 'Billing complete',
    successMsg: 'Invoice {nr} was created successfully.',
    neueAbrechnung: 'New billing',
    backDashboard: 'Back to dashboard',
    noAuftrag: 'No order selected. Please start from step 1.',
    noRechnung: 'No invoice created. Please complete step 2.',
    neuStarten: 'Restart',
    bruttoHint: 'Calculated gross: {val} €',
    pflichtfeld: 'Please fill in all required fields.',
    fehler: 'Error while saving. Please try again.',
  },
});

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const STATUS_RECHNUNG_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

function getMwstFactor(key: string): number {
  if (key === 'mwst_19') return 1.19;
  if (key === 'mwst_7') return 1.07;
  return 1.0;
}

export default function AuftragAbrechnungPage() {
  const { auftraege, kundenMap, fahrzeugeMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1 state
  const [selectedAuftrag, setSelectedAuftrag] = useState<EnrichedAuftraege | null>(null);
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [kundeRecord, setKundeRecord] = useState<Kunden | null>(null);

  // Step 2 state
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstSatz, setMwstSatz] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [bruttobetrag, setBruttobetrag] = useState('');
  const [rechnungsdatum, setRechnungsdatum] = useState('');
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState('');
  const [rechnungId, setRechnungId] = useState<string | null>(null);
  const [step2Saving, setStep2Saving] = useState(false);
  const [step2Error, setStep2Error] = useState('');

  // Step 3 state
  const [pdfRechnungsnummer, setPdfRechnungsnummer] = useState('');
  const [pdfVorname, setPdfVorname] = useState('');
  const [pdfNachname, setPdfNachname] = useState('');
  const [pdfNetto, setPdfNetto] = useState('');
  const [pdfBrutto, setPdfBrutto] = useState('');
  const [pdfDatei, setPdfDatei] = useState<File | null>(null);
  const [pdfId, setPdfId] = useState<string | null>(null);
  const [step3Saving, setStep3Saving] = useState(false);
  const [step3Error, setStep3Error] = useState('');

  // Computed brutto hint
  const computedBrutto = nettobetrag
    ? (parseFloat(nettobetrag) * getMwstFactor(mwstSatz)).toFixed(2)
    : null;

  const enrichedAuftraege: EnrichedAuftraege[] = enrichAuftraege(auftraege, { kundenMap, fahrzeugeMap });
  const abgeschlosseneAuftraege = enrichedAuftraege.filter(
    a => a.fields.status?.key === 'abgeschlossen'
  );

  const handleAuftragSelect = useCallback(
    async (id: string) => {
      const auftrag = abgeschlosseneAuftraege.find(a => a.record_id === id);
      if (!auftrag) return;
      setSelectedAuftrag(auftrag);
      const kundeId = extractRecordId(auftrag.fields.kunde ?? null);
      setSelectedKundeId(kundeId);
      let kundeData: Kunden | null = null;
      if (kundeId) {
        kundeData = (await LivingAppsService.getKundenEntry(kundeId)) ?? null;
      }
      setKundeRecord(kundeData);
      // Pre-fill step 3 prefill fields after selection
      setPdfVorname(kundeData?.fields.vorname ?? '');
      setPdfNachname(kundeData?.fields.nachname ?? '');
      setStep(2);
    },
    [abgeschlosseneAuftraege]
  );

  const handleRechnungErstellen = useCallback(async () => {
    if (!selectedAuftrag || !selectedKundeId) return;
    if (!rechnungsnummer || !nettobetrag || !bruttobetrag || !rechnungsdatum || !faelligkeitsdatum) {
      setStep2Error(tt('pflichtfeld'));
      return;
    }
    setStep2Error('');
    setStep2Saving(true);
    try {
      // Idempotency: if already created on a prior attempt, skip create
      let rid = rechnungId;
      if (!rid) {
        const rechnung = await LivingAppsService.createRechnungenEntry({
          rechnungsnummer,
          auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftrag.record_id),
          kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
          nettobetrag: parseFloat(nettobetrag),
          mwst_satz: mwstSatz,
          bruttobetrag: parseFloat(bruttobetrag),
          rechnungsdatum,
          faelligkeitsdatum,
          status_rechnung: 'offen',
        });
        rid = rechnung.record_id;
        setRechnungId(rid);
      }
      // Pre-fill step 3
      setPdfRechnungsnummer(rechnungsnummer);
      setPdfNetto(nettobetrag);
      setPdfBrutto(bruttobetrag);
      await fetchAll();
      setStep(3);
    } catch {
      setStep2Error(tt('fehler'));
    } finally {
      setStep2Saving(false);
    }
  }, [
    selectedAuftrag,
    selectedKundeId,
    rechnungsnummer,
    nettobetrag,
    bruttobetrag,
    rechnungsdatum,
    faelligkeitsdatum,
    mwstSatz,
    rechnungId,
    fetchAll,
  ]);

  const handlePdfAnlegen = useCallback(async () => {
    if (!rechnungId) return;
    if (!pdfRechnungsnummer || !pdfVorname || !pdfNachname || !pdfNetto || !pdfBrutto) {
      setStep3Error(tt('pflichtfeld'));
      return;
    }
    setStep3Error('');
    setStep3Saving(true);
    try {
      let pid = pdfId;
      if (!pid) {
        const pdfEntry = await LivingAppsService.createRechnungsPdfErstellenEntry({
          rechnung: createRecordUrl(APP_IDS.RECHNUNGEN, rechnungId),
          pdf_rechnungsnummer: pdfRechnungsnummer,
          pdf_kunde_vorname: pdfVorname,
          pdf_kunde_nachname: pdfNachname,
          pdf_nettobetrag: parseFloat(pdfNetto),
          pdf_bruttobetrag: parseFloat(pdfBrutto),
          pdf_datei: pdfDatei ? pdfDatei.name : undefined,
        });
        pid = pdfEntry.record_id;
        setPdfId(pid);
      }
      await fetchAll();
      setStep(4);
    } catch {
      setStep3Error(tt('fehler'));
    } finally {
      setStep3Saving(false);
    }
  }, [rechnungId, pdfRechnungsnummer, pdfVorname, pdfNachname, pdfNetto, pdfBrutto, pdfDatei, pdfId, fetchAll]);

  const handleReset = useCallback(() => {
    setSelectedAuftrag(null);
    setSelectedKundeId(null);
    setKundeRecord(null);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstSatz(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setBruttobetrag('');
    setRechnungsdatum('');
    setFaelligkeitsdatum('');
    setRechnungId(null);
    setStep2Error('');
    setPdfRechnungsnummer('');
    setPdfVorname('');
    setPdfNachname('');
    setPdfNetto('');
    setPdfBrutto('');
    setPdfDatei(null);
    setPdfId(null);
    setStep3Error('');
    setStep(1);
  }, []);

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
      {/* Step 1: Auftrag wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={abgeschlosseneAuftraege.map(a => ({
            id: a.record_id,
            title: a.fields.auftragsnummer
              ? `${a.fields.auftragsnummer} — ${a.kundeName}`
              : a.kundeName || a.record_id,
            subtitle: a.fields.arbeitsbeschreibung ?? '',
            status: a.fields.status
              ? { key: a.fields.status.key, label: a.fields.status.label }
              : undefined,
            stats: [
              { label: tt('wunschterminLabel'), value: a.fields.wunschtermin ? a.fields.wunschtermin.slice(0, 10) : '—' },
            ],
            icon: <IconFileInvoice size={20} className="text-primary" />,
          }))}
          onSelect={handleAuftragSelect}
          searchPlaceholder={tt('searchPlaceholder')}
          emptyText={tt('keineAuftraege')}
        />
      )}

      {/* Step 2: Rechnung erstellen */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-5 max-w-lg mx-auto">
            {/* Context card */}
            <div className="rounded-2xl border bg-card p-4 flex items-start gap-3 overflow-hidden">
              <IconFileInvoice size={22} className="text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold truncate">
                  {selectedAuftrag.fields.auftragsnummer ?? selectedAuftrag.record_id}
                </p>
                <p className="text-sm text-muted-foreground truncate">{selectedAuftrag.kundeName}</p>
                {selectedAuftrag.fields.arbeitsbeschreibung && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {selectedAuftrag.fields.arbeitsbeschreibung}
                  </p>
                )}
                {selectedAuftrag.fields.status && (
                  <div className="mt-2">
                    <StatusBadge
                      statusKey={selectedAuftrag.fields.status.key}
                      label={selectedAuftrag.fields.status.label}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Form */}
            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
              <div className="space-y-1.5">
                <Label htmlFor="rechnungsnummer">{tt('rechnungsnummer')} *</Label>
                <Input
                  id="rechnungsnummer"
                  value={rechnungsnummer}
                  onChange={e => setRechnungsnummer(e.target.value)}
                  placeholder="RE-2026-001"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mwst_satz">{tt('mwstSatzLabel')} *</Label>
                <Select value={mwstSatz} onValueChange={setMwstSatz}>
                  <SelectTrigger id="mwst_satz" className="w-full">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nettobetrag">{tt('nettobetrag')} *</Label>
                  <Input
                    id="nettobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={nettobetrag}
                    onChange={e => {
                      setNettobetrag(e.target.value);
                      const net = parseFloat(e.target.value);
                      if (!isNaN(net)) {
                        setBruttobetrag((net * getMwstFactor(mwstSatz)).toFixed(2));
                      }
                    }}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bruttobetrag">{tt('bruttobetrag')} *</Label>
                  <Input
                    id="bruttobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={bruttobetrag}
                    onChange={e => setBruttobetrag(e.target.value)}
                    placeholder="0.00"
                  />
                  {computedBrutto && bruttobetrag !== computedBrutto && (
                    <p className="text-xs text-muted-foreground">
                      {tt('bruttoHint', { val: computedBrutto })}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rechnungsdatum">{tt('rechnungsdatum')} *</Label>
                  <Input
                    id="rechnungsdatum"
                    type="date"
                    value={rechnungsdatum}
                    onChange={e => setRechnungsdatum(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="faelligkeitsdatum">{tt('faelligkeitsdatum')} *</Label>
                  <Input
                    id="faelligkeitsdatum"
                    type="date"
                    value={faelligkeitsdatum}
                    onChange={e => setFaelligkeitsdatum(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status_rechnung">{tt('statusRechnungLabel')}</Label>
                <Select value="offen" disabled>
                  <SelectTrigger id="status_rechnung" className="w-full">
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

              {step2Error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <IconAlertCircle size={16} stroke={2} />
                  {step2Error}
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleRechnungErstellen}
                disabled={step2Saving}
              >
                {step2Saving ? '…' : tt('rechnungErstellen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noAuftrag')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}

      {/* Step 3: PDF-Eintrag anlegen */}
      {step === 3 && (
        rechnungId ? (
          <div className="space-y-5 max-w-lg mx-auto">
            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
              <h3 className="font-semibold text-base">{tt('pdfTitel')}</h3>

              <div className="space-y-1.5">
                <Label htmlFor="pdf_rechnungsnummer">{tt('pdf_rechnungsnummer')} *</Label>
                <Input
                  id="pdf_rechnungsnummer"
                  value={pdfRechnungsnummer}
                  onChange={e => setPdfRechnungsnummer(e.target.value)}
                  placeholder="RE-2026-001"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pdf_vorname">{tt('pdf_vorname')} *</Label>
                  <Input
                    id="pdf_vorname"
                    value={pdfVorname}
                    onChange={e => setPdfVorname(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pdf_nachname">{tt('pdf_nachname')} *</Label>
                  <Input
                    id="pdf_nachname"
                    value={pdfNachname}
                    onChange={e => setPdfNachname(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pdf_netto">{tt('pdf_nettobetrag')} *</Label>
                  <Input
                    id="pdf_netto"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pdfNetto}
                    onChange={e => setPdfNetto(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pdf_brutto">{tt('pdf_bruttobetrag')} *</Label>
                  <Input
                    id="pdf_brutto"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pdfBrutto}
                    onChange={e => setPdfBrutto(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pdf_datei">{tt('pdf_datei')}</Label>
                <Input
                  id="pdf_datei"
                  type="file"
                  accept=".pdf"
                  className="cursor-pointer"
                  onChange={e => setPdfDatei(e.target.files?.[0] ?? null)}
                />
              </div>

              {step3Error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <IconAlertCircle size={16} stroke={2} />
                  {step3Error}
                </div>
              )}

              <Button
                className="w-full"
                onClick={handlePdfAnlegen}
                disabled={step3Saving}
              >
                {step3Saving ? '…' : tt('pdfAnlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noRechnung')}</p>
            <Button variant="outline" onClick={() => setStep(2)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}

      {/* Step 4: Fertig */}
      {step === 4 && (
        <div className="flex flex-col items-center text-center py-12 space-y-5">
          <div className="rounded-full bg-primary/10 p-4">
            <IconCircleCheck size={40} className="text-primary" stroke={1.5} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">{tt('successTitle')}</h3>
            <p className="text-muted-foreground text-sm">
              {tt('successMsg', { nr: rechnungsnummer || '—' })}
            </p>
            {kundeRecord && (
              <p className="text-sm text-muted-foreground">
                {kundeRecord.fields.vorname} {kundeRecord.fields.nachname}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <Button className="flex-1" onClick={handleReset}>
              {tt('neueAbrechnung')}
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
