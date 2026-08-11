/**
 * Auftrag abschließen — 4-Schritt-Wizard.
 * Steps: 1) Auftrag wählen (offen/in_bearbeitung) → 2) Auftrag abschließen (Status setzen)
 *        → 3) Rechnung erstellen → 4) PDF-Eintrag anlegen & Zusammenfassung.
 * Reads: auftraege, kunden, fahrzeuge. Writes: auftraege (updateAuftraegeEntry),
 *        rechnungen (createRechnungenEntry), rechnungs_pdf_erstellen (createRechnungsPdfErstellenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { IconFileInvoice, IconCheck, IconCircleCheck, IconAlertCircle } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { EnrichedAuftraege } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { makeT } from '@/i18n';

const tt = makeT({
  de: {
    pageTitle: 'Auftrag abschließen',
    subtitle: 'Auftrag abschließen, Rechnung erstellen und PDF anlegen',
    step1: 'Auftrag wählen',
    step2: 'Abschließen',
    step3: 'Rechnung',
    step4: 'PDF & Fertig',
    selectPlaceholder: 'Auftrag suchen…',
    selectEmpty: 'Keine offenen Aufträge vorhanden',
    detailsTitle: 'Auftragsdetails',
    labelFahrzeug: 'Fahrzeug',
    labelKunde: 'Kunde',
    labelArbeit: 'Arbeitsbeschreibung',
    labelWunschtermin: 'Wunschtermin',
    labelAuftragsnummer: 'Auftragsnummer',
    labelStatus: 'Status',
    labelNein: 'Keine Angabe',
    btnAbschliessen: 'Auftrag abschließen',
    completing: 'Wird abgeschlossen…',
    rechnungTitle: 'Rechnung erstellen',
    labelNetto: 'Nettobetrag (€)',
    labelMwst: 'MwSt.-Satz',
    labelRechnungsdatum: 'Rechnungsdatum',
    labelFaellig: 'Fälligkeitsdatum',
    labelBrutto: 'Bruttobetrag (€)',
    labelRechnungsnummer: 'Rechnungsnummer (auto)',
    btnRechnung: 'Rechnung erstellen',
    creatingRechnung: 'Rechnung wird angelegt…',
    pdfTitle: 'PDF-Eintrag anlegen',
    labelPdfNummer: 'Rechnungsnummer',
    labelPdfVorname: 'Vorname Kunde',
    labelPdfNachname: 'Nachname Kunde',
    labelPdfNetto: 'Nettobetrag (€)',
    labelPdfBrutto: 'Bruttobetrag (€)',
    labelPdfDatei: 'PDF-Datei',
    btnPdf: 'PDF-Eintrag anlegen',
    creatingPdf: 'PDF-Eintrag wird angelegt…',
    successTitle: 'Erfolgreich abgeschlossen!',
    successAuftrag: 'Auftrag',
    successRechnung: 'Rechnung',
    successBrutto: 'Bruttobetrag',
    btnNeu: 'Weiteren Auftrag abschließen',
    btnDashboard: 'Zurück zum Dashboard',
    errorPrefix: 'Fehler: ',
    stepFallback: 'Dieser Schritt benötigt eine Auswahl aus einem vorherigen Schritt.',
    btnNeustart: 'Neu starten',
    mwst19: '19 %',
    mwst7: '7 %',
    mwst0: '0 %',
  },
  en: {
    pageTitle: 'Close Order',
    subtitle: 'Close order, create invoice and add PDF entry',
    step1: 'Select Order',
    step2: 'Close',
    step3: 'Invoice',
    step4: 'PDF & Done',
    selectPlaceholder: 'Search order…',
    selectEmpty: 'No open orders available',
    detailsTitle: 'Order Details',
    labelFahrzeug: 'Vehicle',
    labelKunde: 'Customer',
    labelArbeit: 'Work description',
    labelWunschtermin: 'Requested date',
    labelAuftragsnummer: 'Order number',
    labelStatus: 'Status',
    labelNein: 'Not specified',
    btnAbschliessen: 'Close order',
    completing: 'Closing…',
    rechnungTitle: 'Create Invoice',
    labelNetto: 'Net amount (€)',
    labelMwst: 'VAT rate',
    labelRechnungsdatum: 'Invoice date',
    labelFaellig: 'Due date',
    labelBrutto: 'Gross amount (€)',
    labelRechnungsnummer: 'Invoice number (auto)',
    btnRechnung: 'Create invoice',
    creatingRechnung: 'Creating invoice…',
    pdfTitle: 'Add PDF entry',
    labelPdfNummer: 'Invoice number',
    labelPdfVorname: 'Customer first name',
    labelPdfNachname: 'Customer last name',
    labelPdfNetto: 'Net amount (€)',
    labelPdfBrutto: 'Gross amount (€)',
    labelPdfDatei: 'PDF file',
    btnPdf: 'Add PDF entry',
    creatingPdf: 'Adding PDF entry…',
    successTitle: 'Successfully completed!',
    successAuftrag: 'Order',
    successRechnung: 'Invoice',
    successBrutto: 'Gross amount',
    btnNeu: 'Close another order',
    btnDashboard: 'Back to dashboard',
    errorPrefix: 'Error: ',
    stepFallback: 'This step requires a selection from a previous step.',
    btnNeustart: 'Start over',
    mwst19: '19 %',
    mwst7: '7 %',
    mwst0: '0 %',
  },
  cs: {
    pageTitle: 'Uzavřít zakázku',
    subtitle: 'Uzavřít zakázku, vystavit fakturu a přidat PDF',
    step1: 'Vybrat zakázku',
    step2: 'Uzavřít',
    step3: 'Faktura',
    step4: 'PDF & Hotovo',
    selectPlaceholder: 'Hledat zakázku…',
    selectEmpty: 'Žádné otevřené zakázky',
    detailsTitle: 'Detail zakázky',
    labelFahrzeug: 'Vozidlo',
    labelKunde: 'Zákazník',
    labelArbeit: 'Popis práce',
    labelWunschtermin: 'Požadovaný termín',
    labelAuftragsnummer: 'Číslo zakázky',
    labelStatus: 'Stav',
    labelNein: 'Nezadáno',
    btnAbschliessen: 'Uzavřít zakázku',
    completing: 'Uzavírání…',
    rechnungTitle: 'Vystavit fakturu',
    labelNetto: 'Čistá částka (€)',
    labelMwst: 'Sazba DPH',
    labelRechnungsdatum: 'Datum faktury',
    labelFaellig: 'Datum splatnosti',
    labelBrutto: 'Hrubá částka (€)',
    labelRechnungsnummer: 'Číslo faktury (auto)',
    btnRechnung: 'Vystavit fakturu',
    creatingRechnung: 'Vytváření faktury…',
    pdfTitle: 'Přidat PDF záznam',
    labelPdfNummer: 'Číslo faktury',
    labelPdfVorname: 'Jméno zákazníka',
    labelPdfNachname: 'Příjmení zákazníka',
    labelPdfNetto: 'Čistá částka (€)',
    labelPdfBrutto: 'Hrubá částka (€)',
    labelPdfDatei: 'PDF soubor',
    btnPdf: 'Přidat PDF záznam',
    creatingPdf: 'Přidávání PDF záznamu…',
    successTitle: 'Úspěšně dokončeno!',
    successAuftrag: 'Zakázka',
    successRechnung: 'Faktura',
    successBrutto: 'Hrubá částka',
    btnNeu: 'Uzavřít další zakázku',
    btnDashboard: 'Zpět na přehled',
    errorPrefix: 'Chyba: ',
    stepFallback: 'Tento krok vyžaduje výběr z předchozího kroku.',
    btnNeustart: 'Začít znovu',
    mwst19: '19 %',
    mwst7: '7 %',
    mwst0: '0 %',
  },
});

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];

function getMwstRate(key: string): number {
  if (key === 'mwst_19') return 19;
  if (key === 'mwst_7') return 7;
  return 0;
}

function generateRechnungsnummer(): string {
  const today = new Date();
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `RE-${format(today, 'yyyy-MM-dd')}-${rand}`;
}

export default function AuftragAbschliessenPage() {
  const { auftraege, kunden, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAuftrag, setSelectedAuftrag] = useState<EnrichedAuftraege | null>(null);

  // Step 2
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // Step 3 — Rechnung
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstKey, setMwstKey] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [rechnungsdatum, setRechnungsdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState('');
  const [newRechnungId, setNewRechnungId] = useState<string | null>(null);
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [creatingRechnung, setCreatingRechnung] = useState(false);
  const [rechnungError, setRechnungError] = useState<string | null>(null);

  // Step 4 — PDF
  const [pdfVorname, setPdfVorname] = useState('');
  const [pdfNachname, setPdfNachname] = useState('');
  const [pdfDatei, setPdfDatei] = useState('');
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const nettoNum = parseFloat(nettobetrag) || 0;
  const mwstRate = getMwstRate(mwstKey);
  const bruttoNum = parseFloat((nettoNum * (1 + mwstRate / 100)).toFixed(2));

  // Only eligible: offen or in_bearbeitung
  const eligibleAuftraege = (auftraege as EnrichedAuftraege[]).filter(
    (a) => a.fields.status?.key === 'offen' || a.fields.status?.key === 'in_bearbeitung'
  );

  const handleSelectAuftrag = useCallback((id: string) => {
    const found = eligibleAuftraege.find((a) => a.record_id === id);
    if (found) {
      setSelectedAuftrag(found);
      setStep(2);
    }
  }, [eligibleAuftraege]);

  const handleAbschliessen = async () => {
    if (!selectedAuftrag) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftrag.record_id, {
        status: 'abgeschlossen',
      });
      await fetchAll();
      setStep(3);
    } catch (e) {
      setCompleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setCompleting(false);
    }
  };

  const handleRechnungErstellen = async () => {
    if (!selectedAuftrag || !nettobetrag || !rechnungsdatum || !faelligkeitsdatum) return;
    setCreatingRechnung(true);
    setRechnungError(null);
    try {
      let rid = newRechnungId;
      let rnr = rechnungsnummer;
      if (!rid) {
        rnr = generateRechnungsnummer();
        const kundeId = extractRecordId(selectedAuftrag.fields.kunde);
        const result = await LivingAppsService.createRechnungenEntry({
          rechnungsnummer: rnr,
          auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftrag.record_id),
          kunde: kundeId ? createRecordUrl(APP_IDS.KUNDEN, kundeId) : undefined,
          nettobetrag: nettoNum,
          mwst_satz: mwstKey,
          bruttobetrag: bruttoNum,
          rechnungsdatum,
          faelligkeitsdatum,
          status_rechnung: 'offen',
        });
        rid = result.record_id;
        setNewRechnungId(rid);
        setRechnungsnummer(rnr);
        // Prefill PDF fields from Kunden
        if (kundeId) {
          const kunde = kunden.find((k) => k.record_id === kundeId);
          if (kunde) {
            setPdfVorname(kunde.fields.vorname ?? '');
            setPdfNachname(kunde.fields.nachname ?? '');
          }
        }
        await fetchAll();
      }
      setStep(4);
    } catch (e) {
      setRechnungError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingRechnung(false);
    }
  };

  const handlePdfErstellen = async () => {
    if (!newRechnungId || !pdfVorname || !pdfNachname) return;
    setCreatingPdf(true);
    setPdfError(null);
    try {
      await LivingAppsService.createRechnungsPdfErstellenEntry({
        rechnung: createRecordUrl(APP_IDS.RECHNUNGEN, newRechnungId),
        pdf_rechnungsnummer: rechnungsnummer,
        pdf_kunde_vorname: pdfVorname,
        pdf_kunde_nachname: pdfNachname,
        pdf_nettobetrag: nettoNum,
        pdf_bruttobetrag: bruttoNum,
        pdf_datei: pdfDatei || undefined,
      });
      await fetchAll();
      setDone(true);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPdf(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedAuftrag(null);
    setCompleting(false);
    setCompleteError(null);
    setNettobetrag('');
    setMwstKey(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setRechnungsdatum(format(new Date(), 'yyyy-MM-dd'));
    setFaelligkeitsdatum('');
    setNewRechnungId(null);
    setRechnungsnummer('');
    setCreatingRechnung(false);
    setRechnungError(null);
    setPdfVorname('');
    setPdfNachname('');
    setPdfDatei('');
    setCreatingPdf(false);
    setPdfError(null);
    setDone(false);
  };

  const fallback = (targetStep: number) => (
    <div className="text-center py-12 space-y-3">
      <p className="text-sm text-muted-foreground">{tt('stepFallback')}</p>
      <Button variant="outline" onClick={() => setStep(targetStep)}>{tt('btnNeustart')}</Button>
    </div>
  );

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
          items={eligibleAuftraege.map((a) => ({
            id: a.record_id,
            title: a.fields.auftragsnummer ?? a.record_id,
            subtitle: [a.fahrzeugName, a.kundeName].filter(Boolean).join(' · '),
            status: a.fields.status
              ? { key: a.fields.status.key, label: a.fields.status.label }
              : undefined,
            stats: a.fields.arbeitsbeschreibung
              ? [{ label: tt('labelArbeit'), value: a.fields.arbeitsbeschreibung.slice(0, 60) }]
              : undefined,
            icon: <IconFileInvoice size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectAuftrag}
          searchPlaceholder={tt('selectPlaceholder')}
          emptyText={tt('selectEmpty')}
        />
      )}

      {/* Step 2: Auftrag abschließen */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">{tt('detailsTitle')}</h2>
            <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
              <div className="divide-y">
                <div className="flex items-start gap-3 p-4">
                  <span className="text-sm text-muted-foreground w-36 shrink-0">{tt('labelAuftragsnummer')}</span>
                  <span className="text-sm font-medium truncate min-w-0">{selectedAuftrag.fields.auftragsnummer ?? '—'}</span>
                </div>
                <div className="flex items-start gap-3 p-4">
                  <span className="text-sm text-muted-foreground w-36 shrink-0">{tt('labelStatus')}</span>
                  <StatusBadge
                    statusKey={selectedAuftrag.fields.status?.key}
                    label={selectedAuftrag.fields.status?.label}
                  />
                </div>
                <div className="flex items-start gap-3 p-4">
                  <span className="text-sm text-muted-foreground w-36 shrink-0">{tt('labelFahrzeug')}</span>
                  <span className="text-sm truncate min-w-0">{selectedAuftrag.fahrzeugName || tt('labelNein')}</span>
                </div>
                <div className="flex items-start gap-3 p-4">
                  <span className="text-sm text-muted-foreground w-36 shrink-0">{tt('labelKunde')}</span>
                  <span className="text-sm truncate min-w-0">{selectedAuftrag.kundeName || tt('labelNein')}</span>
                </div>
                {selectedAuftrag.fields.arbeitsbeschreibung && (
                  <div className="flex items-start gap-3 p-4">
                    <span className="text-sm text-muted-foreground w-36 shrink-0">{tt('labelArbeit')}</span>
                    <span className="text-sm min-w-0">{selectedAuftrag.fields.arbeitsbeschreibung}</span>
                  </div>
                )}
                {selectedAuftrag.fields.wunschtermin && (
                  <div className="flex items-start gap-3 p-4">
                    <span className="text-sm text-muted-foreground w-36 shrink-0">{tt('labelWunschtermin')}</span>
                    <span className="text-sm truncate min-w-0">{selectedAuftrag.fields.wunschtermin}</span>
                  </div>
                )}
              </div>
            </div>

            {completeError && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertCircle size={16} />
                {tt('errorPrefix')}{completeError}
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handleAbschliessen}
              disabled={completing}
            >
              <IconCheck size={18} className="mr-2" />
              {completing ? tt('completing') : tt('btnAbschliessen')}
            </Button>
          </div>
        ) : fallback(1)
      )}

      {/* Step 3: Rechnung erstellen */}
      {step === 3 && (
        selectedAuftrag ? (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">{tt('rechnungTitle')}</h2>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{tt('labelRechnungsnummer')}</Label>
                <div className="rounded-lg border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
                  {rechnungsnummer || `RE-${format(new Date(), 'yyyy-MM-dd')}-XXX`}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="netto">{tt('labelNetto')}</Label>
                <Input
                  id="netto"
                  type="number"
                  min="0"
                  step="0.01"
                  value={nettobetrag}
                  onChange={(e) => setNettobetrag(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label>{tt('labelMwst')}</Label>
                <div className="flex gap-2 flex-wrap">
                  {MWST_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setMwstKey(opt.key)}
                      className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                        mwstKey === opt.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border hover:bg-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {nettobetrag && (
                <div className="rounded-xl border bg-secondary/40 p-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{tt('labelBrutto')}</span>
                  <span className="font-semibold text-lg">
                    {bruttoNum.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rechnungsdatum">{tt('labelRechnungsdatum')}</Label>
                  <Input
                    id="rechnungsdatum"
                    type="date"
                    value={rechnungsdatum}
                    onChange={(e) => setRechnungsdatum(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="faellig">{tt('labelFaellig')}</Label>
                  <Input
                    id="faellig"
                    type="date"
                    value={faelligkeitsdatum}
                    onChange={(e) => setFaelligkeitsdatum(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {rechnungError && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertCircle size={16} />
                {tt('errorPrefix')}{rechnungError}
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handleRechnungErstellen}
              disabled={creatingRechnung || !nettobetrag || !rechnungsdatum || !faelligkeitsdatum}
            >
              <IconFileInvoice size={18} className="mr-2" />
              {creatingRechnung ? tt('creatingRechnung') : tt('btnRechnung')}
            </Button>
          </div>
        ) : fallback(1)
      )}

      {/* Step 4: PDF-Eintrag + Zusammenfassung */}
      {step === 4 && (
        newRechnungId ? (
          done ? (
            <div className="text-center space-y-6 py-6">
              <div className="flex justify-center">
                <div className="rounded-full bg-primary/10 p-4">
                  <IconCircleCheck size={40} className="text-primary" />
                </div>
              </div>
              <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
              <div className="rounded-2xl border bg-card overflow-hidden shadow-sm text-left">
                <div className="divide-y">
                  <div className="flex items-center gap-3 p-4">
                    <span className="text-sm text-muted-foreground w-36 shrink-0">{tt('successAuftrag')}</span>
                    <span className="text-sm font-medium truncate min-w-0">
                      {selectedAuftrag?.fields.auftragsnummer ?? selectedAuftrag?.record_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 p-4">
                    <span className="text-sm text-muted-foreground w-36 shrink-0">{tt('successRechnung')}</span>
                    <span className="text-sm font-medium truncate min-w-0">{rechnungsnummer}</span>
                  </div>
                  <div className="flex items-center gap-3 p-4">
                    <span className="text-sm text-muted-foreground w-36 shrink-0">{tt('successBrutto')}</span>
                    <span className="text-sm font-semibold">
                      {bruttoNum.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Button variant="outline" className="w-full" onClick={handleReset}>
                  {tt('btnNeu')}
                </Button>
                <a href="#/" className="w-full">
                  <Button variant="ghost" className="w-full">{tt('btnDashboard')}</Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold">{tt('pdfTitle')}</h2>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{tt('labelPdfNummer')}</Label>
                  <Input
                    value={rechnungsnummer}
                    onChange={(e) => setRechnungsnummer(e.target.value)}
                    placeholder="RE-2026-08-11-123"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pdf-vorname">{tt('labelPdfVorname')}</Label>
                    <Input
                      id="pdf-vorname"
                      value={pdfVorname}
                      onChange={(e) => setPdfVorname(e.target.value)}
                      placeholder="Max" /* i18n-exempt */
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pdf-nachname">{tt('labelPdfNachname')}</Label>
                    <Input
                      id="pdf-nachname"
                      value={pdfNachname}
                      onChange={(e) => setPdfNachname(e.target.value)}
                      placeholder="Mustermann" /* i18n-exempt */
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{tt('labelPdfNetto')}</Label>
                    <div className="rounded-lg border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
                      {nettoNum.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tt('labelPdfBrutto')}</Label>
                    <div className="rounded-lg border bg-secondary/50 px-3 py-2 text-sm font-medium">
                      {bruttoNum.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pdf-datei">{tt('labelPdfDatei')}</Label>
                  <Input
                    id="pdf-datei"
                    value={pdfDatei}
                    onChange={(e) => setPdfDatei(e.target.value)}
                    placeholder="https://…" /* i18n-exempt */
                  />
                </div>
              </div>

              {pdfError && (
                <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <IconAlertCircle size={16} />
                  {tt('errorPrefix')}{pdfError}
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handlePdfErstellen}
                disabled={creatingPdf || !pdfVorname || !pdfNachname}
              >
                <IconCircleCheck size={18} className="mr-2" />
                {creatingPdf ? tt('creatingPdf') : tt('btnPdf')}
              </Button>
            </div>
          )
        ) : fallback(3)
      )}
    </IntentWizardShell>
  );
}
