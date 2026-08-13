/**
 * Rechnung erstellen — 3-Schritt-Wizard.
 * Steps: 1) Abgeschlossenen Auftrag wählen → 2) Rechnungsdaten erfassen → 3) PDF-Eintrag anlegen.
 * Reads: auftraege (EnrichedAuftraege[], gefiltert auf status.key === 'abgeschlossen'), kunden.
 * Writes: rechnungen (createRechnungenEntry), rechnungsPdfErstellen (createRechnungsPdfErstellenEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import { IconFileInvoice, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Auftraege } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tx } from '@/i18n';

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const STATUS_RECHNUNG_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

const MWST_FAKTOREN: Record<string, number> = {
  mwst_19: 1.19,
  mwst_7: 1.07,
  mwst_0: 1.0,
};

const today = format(new Date(), 'yyyy-MM-dd');
const in14 = format(addDays(new Date(), 14), 'yyyy-MM-dd');

export default function RechnungErstellenPage() {
  const { auftraege, loading, error, fetchAll, kundenMap, fahrzeugeMap } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAuftrag, setSelectedAuftrag] = useState<Auftraege | null>(null);

  // Step 2 form state
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstSatz, setMwstSatz] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [bruttobetrag, setBruttobetrag] = useState('');
  const [rechnungsdatum, setRechnungsdatum] = useState(today);
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState(in14);
  const [statusRechnung, setStatusRechnung] = useState(STATUS_RECHNUNG_OPTIONS[0]?.key ?? 'offen');
  const [step2Saving, setStep2Saving] = useState(false);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [createdRechnungId, setCreatedRechnungId] = useState<string | null>(null);

  // Step 3 form state
  const [pdfVorname, setPdfVorname] = useState('');
  const [pdfNachname, setPdfNachname] = useState('');
  const [pdfDatei, setPdfDatei] = useState('');
  const [step3Saving, setStep3Saving] = useState(false);
  const [step3Error, setStep3Error] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const abgeschlosseneAuftraege = useMemo(
    () => auftraege.filter(a => a.fields.status?.key === 'abgeschlossen'),
    [auftraege]
  );

  const getAuftragKundeName = (a: Auftraege) => {
    const kundeId = a.fields.kunde ? a.fields.kunde.replace(/.*\//, '') : null;
    const k = kundeId ? kundenMap.get(kundeId) : null;
    return k ? `${k.fields.vorname ?? ''} ${k.fields.nachname ?? ''}`.trim() : null;
  };

  const getAuftragFahrzeugName = (a: Auftraege) => {
    const fahrzeugId = a.fields.fahrzeug ? a.fields.fahrzeug.replace(/.*\//, '') : null;
    const f = fahrzeugId ? fahrzeugeMap.get(fahrzeugId) : null;
    return f ? `${f.fields.marke ?? ''} ${f.fields.modell ?? ''} (${f.fields.kennzeichen ?? ''})`.trim() : null;
  };

  const handleAuftragSelect = (id: string) => {
    const auftrag = abgeschlosseneAuftraege.find(a => a.record_id === id) ?? null;
    if (!auftrag) return;
    setSelectedAuftrag(auftrag);

    // Prefill PDF fields from Kunde
    const kundeId = auftrag.fields.kunde
      ? auftrag.fields.kunde.replace(/.*\//, '')
      : null;
    const kunde = kundeId ? kundenMap.get(kundeId) : null;
    if (kunde) {
      setPdfVorname(kunde.fields.vorname ?? '');
      setPdfNachname(kunde.fields.nachname ?? '');
    }
    setStep(2);
  };

  const handleNettobetragChange = (val: string) => {
    setNettobetrag(val);
    const netto = parseFloat(val);
    if (!isNaN(netto)) {
      const faktor = MWST_FAKTOREN[mwstSatz] ?? 1.19;
      setBruttobetrag((netto * faktor).toFixed(2));
    } else {
      setBruttobetrag('');
    }
  };

  const handleMwstChange = (val: string) => {
    setMwstSatz(val);
    const netto = parseFloat(nettobetrag);
    if (!isNaN(netto)) {
      const faktor = MWST_FAKTOREN[val] ?? 1.19;
      setBruttobetrag((netto * faktor).toFixed(2));
    }
  };

  const handleCreateRechnung = async () => {
    if (!selectedAuftrag) return;
    if (!rechnungsnummer || !nettobetrag || !bruttobetrag) return;

    setStep2Saving(true);
    setStep2Error(null);

    // Idempotency guard: don't recreate if already created
    let rechnungId = createdRechnungId;
    try {
      if (!rechnungId) {
        const kundeUrl = selectedAuftrag.fields.kunde
          ? createRecordUrl(
              APP_IDS.KUNDEN,
              selectedAuftrag.fields.kunde.replace(/.*\//, '')
            )
          : undefined;

        const rechnung = await LivingAppsService.createRechnungenEntry({
          rechnungsnummer,
          auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftrag.record_id),
          kunde: kundeUrl,
          nettobetrag: parseFloat(nettobetrag),
          mwst_satz: mwstSatz,
          bruttobetrag: parseFloat(bruttobetrag),
          rechnungsdatum,
          faelligkeitsdatum,
          status_rechnung: statusRechnung,
        });
        rechnungId = rechnung.record_id;
        setCreatedRechnungId(rechnungId);
      }

      // Prefill step 3 rechnungsnummer
      await fetchAll();
      setStep(3);
    } catch (e) {
      setStep2Error(e instanceof Error ? e.message : String(e));
    } finally {
      setStep2Saving(false);
    }
  };

  const handleCreatePdf = async () => {
    if (!createdRechnungId) return;
    if (!rechnungsnummer || !nettobetrag || !bruttobetrag) return;

    setStep3Saving(true);
    setStep3Error(null);
    try {
      await LivingAppsService.createRechnungsPdfErstellenEntry({
        rechnung: createRecordUrl(APP_IDS.RECHNUNGEN, createdRechnungId),
        pdf_rechnungsnummer: rechnungsnummer,
        pdf_kunde_vorname: pdfVorname,
        pdf_kunde_nachname: pdfNachname,
        pdf_nettobetrag: parseFloat(nettobetrag),
        pdf_bruttobetrag: parseFloat(bruttobetrag),
        ...(pdfDatei ? { pdf_datei: pdfDatei } : {}),
      });
      await fetchAll();
      setDone(true);
    } catch (e) {
      setStep3Error(e instanceof Error ? e.message : String(e));
    } finally {
      setStep3Saving(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedAuftrag(null);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstSatz(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setBruttobetrag('');
    setRechnungsdatum(today);
    setFaelligkeitsdatum(in14);
    setStatusRechnung(STATUS_RECHNUNG_OPTIONS[0]?.key ?? 'offen');
    setStep2Error(null);
    setCreatedRechnungId(null);
    setPdfVorname('');
    setPdfNachname('');
    setPdfDatei('');
    setStep3Error(null);
    setDone(false);
  };

  return (
    <IntentWizardShell
      title={tx('Rechnung erstellen')}
      subtitle={tx('Auftrag auswählen, Rechnungsdaten eingeben und PDF-Eintrag anlegen')}
      steps={[
        { label: tx('Auftrag') },
        { label: tx('Rechnung') },
        { label: tx('PDF-Eintrag') },
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
            title: a.fields.auftragsnummer ?? a.record_id,
            subtitle: [
              a.fields.arbeitsbeschreibung,
              a.fields.wunschtermin ? tx`Termin: ${a.fields.wunschtermin.slice(0, 10)}` : null,
              getAuftragKundeName(a) ? tx`Kunde: ${getAuftragKundeName(a)}` : null,
              getAuftragFahrzeugName(a) ? tx`Fahrzeug: ${getAuftragFahrzeugName(a)}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
            status: a.fields.status
              ? { key: a.fields.status.key, label: a.fields.status.label }
              : undefined,
            icon: <IconFileInvoice size={20} className="text-primary" />,
          }))}
          onSelect={handleAuftragSelect}
          searchPlaceholder={tx('Auftrag suchen …')}
          emptyText={tx('Keine abgeschlossenen Aufträge vorhanden')}
          emptyIcon={<IconAlertCircle size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Rechnungsdaten */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6 max-w-lg mx-auto">
            {/* Auftrag-Kontext */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-1">
              <p className="text-xs text-muted-foreground">{tx('Auftrag')}</p>
              <p className="font-semibold truncate">
                {selectedAuftrag.fields.auftragsnummer ?? selectedAuftrag.record_id}
              </p>
              {getAuftragKundeName(selectedAuftrag) && (
                <p className="text-sm text-muted-foreground truncate">{getAuftragKundeName(selectedAuftrag)}</p>
              )}
              {getAuftragFahrzeugName(selectedAuftrag) && (
                <p className="text-sm text-muted-foreground truncate">{getAuftragFahrzeugName(selectedAuftrag)}</p>
              )}
            </div>

            {/* Rechnungsnummer */}
            <div className="space-y-1">
              <Label htmlFor="rechnungsnummer">{tx('Rechnungsnummer')} *</Label>
              <Input
                id="rechnungsnummer"
                value={rechnungsnummer}
                onChange={e => setRechnungsnummer(e.target.value)}
                placeholder={tx('RE-2026-001')}
              />
            </div>

            {/* Nettobetrag */}
            <div className="space-y-1">
              <Label htmlFor="nettobetrag">{tx('Nettobetrag (€)')} *</Label>
              <Input
                id="nettobetrag"
                type="number"
                min="0"
                step="0.01"
                value={nettobetrag}
                onChange={e => handleNettobetragChange(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* MwSt-Satz */}
            <div className="space-y-1">
              <Label>{tx('MwSt-Satz')}</Label>
              <div className="flex gap-2 flex-wrap">
                {MWST_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleMwstChange(opt.key)}
                    className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                      mwstSatz === opt.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border hover:bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bruttobetrag */}
            <div className="space-y-1">
              <Label htmlFor="bruttobetrag">{tx('Bruttobetrag (€)')} *</Label>
              <Input
                id="bruttobetrag"
                type="number"
                min="0"
                step="0.01"
                value={bruttobetrag}
                onChange={e => setBruttobetrag(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">{tx('Automatisch berechnet, kann angepasst werden')}</p>
            </div>

            {/* Rechnungsdatum */}
            <div className="space-y-1">
              <Label htmlFor="rechnungsdatum">{tx('Rechnungsdatum')} *</Label>
              <Input
                id="rechnungsdatum"
                type="date"
                value={rechnungsdatum}
                onChange={e => setRechnungsdatum(e.target.value)}
              />
            </div>

            {/* Fälligkeitsdatum */}
            <div className="space-y-1">
              <Label htmlFor="faelligkeitsdatum">{tx('Fälligkeitsdatum')} *</Label>
              <Input
                id="faelligkeitsdatum"
                type="date"
                value={faelligkeitsdatum}
                onChange={e => setFaelligkeitsdatum(e.target.value)}
              />
            </div>

            {/* Status */}
            <div className="space-y-1">
              <Label htmlFor="status-rechnung">{tx('Status')}</Label>
              <Select value={statusRechnung} onValueChange={setStatusRechnung}>
                <SelectTrigger id="status-rechnung">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_RECHNUNG_OPTIONS.map(opt => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {step2Error && (
              <p className="text-sm text-destructive">{step2Error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={step2Saving}>
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleCreateRechnung}
                disabled={step2Saving || !rechnungsnummer || !nettobetrag || !bruttobetrag}
                className="flex-1"
              >
                {step2Saving ? tx('Wird gespeichert …') : tx('Rechnung anlegen & weiter')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt benötigt einen ausgewählten Auftrag.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Zurück zu Schritt 1')}
            </Button>
          </div>
        )
      )}

      {/* Step 3: PDF-Eintrag */}
      {step === 3 && (
        done ? (
          <div className="text-center py-12 space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCheck size={40} className="text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tx('Rechnung erfolgreich erstellt')}</h2>
              <p className="text-muted-foreground">
                {tx('Rechnungsnummer')}: <span className="font-medium">{rechnungsnummer}</span>
              </p>
              <p className="text-muted-foreground">
                {tx('Bruttobetrag')}: <span className="font-medium">{parseFloat(bruttobetrag).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset}>
                {tx('Neue Rechnung erstellen')}
              </Button>
              <a href="#/">
                <Button variant="outline" className="w-full sm:w-auto">
                  {tx('Zurück zum Dashboard')}
                </Button>
              </a>
            </div>
          </div>
        ) : createdRechnungId ? (
          <div className="space-y-6 max-w-lg mx-auto">
            {/* Live-Feedback */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-1">
              <p className="text-xs text-muted-foreground">{tx('Rechnung')}</p>
              <p className="font-semibold">{rechnungsnummer}</p>
              <p className="text-sm text-muted-foreground">
                {tx('Brutto')}: {bruttobetrag ? `${parseFloat(bruttobetrag).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}` : '—'}
              </p>
            </div>

            {/* PDF-Felder */}
            <div className="space-y-1">
              <Label htmlFor="pdf-vorname">{tx('Vorname Kunde')} *</Label>
              <Input
                id="pdf-vorname"
                value={pdfVorname}
                onChange={e => setPdfVorname(e.target.value)}
                placeholder={tx('Vorname')}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pdf-nachname">{tx('Nachname Kunde')} *</Label>
              <Input
                id="pdf-nachname"
                value={pdfNachname}
                onChange={e => setPdfNachname(e.target.value)}
                placeholder={tx('Nachname')}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pdf-rechnungsnummer">{tx('Rechnungsnummer (PDF)')}</Label>
              <Input
                id="pdf-rechnungsnummer"
                value={rechnungsnummer}
                disabled
                className="bg-secondary/50"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pdf-nettobetrag">{tx('Nettobetrag (PDF)')}</Label>
              <Input
                id="pdf-nettobetrag"
                value={nettobetrag}
                disabled
                className="bg-secondary/50"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pdf-bruttobetrag">{tx('Bruttobetrag (PDF)')}</Label>
              <Input
                id="pdf-bruttobetrag"
                value={bruttobetrag}
                disabled
                className="bg-secondary/50"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pdf-datei">{tx('PDF-Datei (URL oder Pfad)')}</Label>
              <Input
                id="pdf-datei"
                value={pdfDatei}
                onChange={e => setPdfDatei(e.target.value)}
                placeholder={tx('https://...')}
              />
              <p className="text-xs text-muted-foreground">{tx('Optional — kann später ergänzt werden')}</p>
            </div>

            {step3Error && (
              <p className="text-sm text-destructive">{step3Error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={step3Saving}>
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleCreatePdf}
                disabled={step3Saving || !pdfVorname || !pdfNachname}
                className="flex-1"
              >
                {step3Saving ? tx('Wird gespeichert …') : tx('PDF-Eintrag anlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt benötigt eine erstellte Rechnung aus Schritt 2.')}
            </p>
            <Button variant="outline" onClick={() => setStep(2)}>
              {tx('Zurück zu Schritt 2')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
