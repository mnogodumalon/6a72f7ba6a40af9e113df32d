/**
 * Auftrag abschließen — 4-Schritt-Wizard.
 * Steps: 1) Auftrag wählen → 2) Auftrag abschließen (Status-Update) →
 *        3) Rechnung erstellen → 4) Rechnungs-PDF-Datensatz anlegen.
 * Reads: auftraege, rechnungen, kunden, fahrzeuge.
 * Writes: auftraege (updateAuftraegeEntry), rechnungen (createRechnungenEntry),
 *         rechnungs_pdf_erstellen (createRechnungsPdfErstellenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { format, addDays } from 'date-fns';
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
import { Textarea } from '@/components/ui/textarea';
import {
  IconCheckbox,
  IconFileInvoice,
  IconFilePlus,
  IconListCheck,
  IconCircleCheck,
  IconCar,
  IconUser,
} from '@tabler/icons-react';
import { tx } from '@/i18n';

const AUFTRAEGE_STATUS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const RECHNUNGEN_MWST = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const RECHNUNGEN_STATUS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

function getMwstRate(key: string): number {
  if (key === 'mwst_19') return 0.19;
  if (key === 'mwst_7') return 0.07;
  return 0;
}

function todayString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function faelligString(): string {
  return format(addDays(new Date(), 30), 'yyyy-MM-dd');
}

export default function AuftragAbschliessenPage() {
  const { auftraege, rechnungen, kunden, fahrzeuge, kundenMap, fahrzeugeMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1 state
  const [selectedAuftrag, setSelectedAuftrag] = useState<EnrichedAuftraege | null>(null);

  // Step 2 state
  const [bemerkungen, setBemerkungen] = useState('');
  const [step2Submitting, setStep2Submitting] = useState(false);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [auftragAbgeschlossen, setAuftragAbgeschlossen] = useState(false);

  // Step 3 state
  const rechnungsnummerDefault = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const n = rechnungen.length + 1;
    const nn = String(n).padStart(3, '0');
    return `RE-${today}-${nn}`;
  }, [rechnungen.length]);

  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstSatzKey, setMwstSatzKey] = useState(RECHNUNGEN_MWST[0]?.key ?? 'mwst_19');
  const [bruttoOverride, setBruttoOverride] = useState('');
  const [rechnungsdatum, setRechnungsdatum] = useState(todayString());
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState(faelligString());
  const [statusRechnungKey, setStatusRechnungKey] = useState(RECHNUNGEN_STATUS[0]?.key ?? 'offen');
  const [step3Submitting, setStep3Submitting] = useState(false);
  const [step3Error, setStep3Error] = useState<string | null>(null);
  const [createdRechnungId, setCreatedRechnungId] = useState<string | null>(null);
  const [createdRechnungsnummer, setCreatedRechnungsnummer] = useState('');
  const [createdNetto, setCreatedNetto] = useState(0);
  const [createdBrutto, setCreatedBrutto] = useState(0);

  // Step 4 state
  const [pdfRechnungsnummer, setPdfRechnungsnummer] = useState('');
  const [pdfKundeVorname, setPdfKundeVorname] = useState('');
  const [pdfKundeNachname, setPdfKundeNachname] = useState('');
  const [pdfNettobetrag, setPdfNettobetrag] = useState('');
  const [pdfBruttobetrag, setPdfBruttobetrag] = useState('');
  const [pdfDatei, setPdfDatei] = useState<File | null>(null);
  const [step4Submitting, setStep4Submitting] = useState(false);
  const [step4Error, setStep4Error] = useState<string | null>(null);
  const [createdPdfId, setCreatedPdfId] = useState<string | null>(null);

  const enrichedAuftraege = useMemo(
    () => enrichAuftraege(auftraege, { fahrzeugeMap, kundenMap }),
    [auftraege, fahrzeugeMap, kundenMap]
  );

  const eligibleAuftraege = useMemo(
    () => enrichedAuftraege.filter(a => {
      const key = a.fields.status?.key;
      return key === 'offen' || key === 'in_bearbeitung';
    }),
    [enrichedAuftraege]
  );

  // Auto-derived brutto
  const autoBrutto = useMemo(() => {
    const net = parseFloat(nettobetrag);
    if (isNaN(net)) return '';
    const rate = getMwstRate(mwstSatzKey);
    return (net * (1 + rate)).toFixed(2);
  }, [nettobetrag, mwstSatzKey]);

  const effectiveBrutto = bruttoOverride !== '' ? bruttoOverride : autoBrutto;

  // Handlers

  function handleSelectAuftrag(id: string) {
    const found = eligibleAuftraege.find(a => a.record_id === id) ?? null;
    setSelectedAuftrag(found);
    setStep(2);
  }

  async function handleAbschliessen() {
    if (!selectedAuftrag) return;
    setStep2Submitting(true);
    setStep2Error(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftrag.record_id, {
        status: 'abgeschlossen',
        bemerkungen_auftrag: bemerkungen || undefined,
      });
      setAuftragAbgeschlossen(true);
      await fetchAll();

      // Pre-fill step 3 rechnungsnummer now that we know the number
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const n = rechnungen.length + 1;
      const nn = String(n).padStart(3, '0');
      setRechnungsnummer(`RE-${todayStr}-${nn}`);

      // Pre-fill kunde for step 4
      const kundeId = extractRecordId(selectedAuftrag.fields.kunde);
      if (kundeId) {
        const k = kundenMap.get(kundeId);
        if (k) {
          setPdfKundeVorname(k.fields.vorname ?? '');
          setPdfKundeNachname(k.fields.nachname ?? '');
        }
      }

      setStep(3);
    } catch (e) {
      setStep2Error(e instanceof Error ? e.message : tx('Fehler beim Abschließen des Auftrags'));
    } finally {
      setStep2Submitting(false);
    }
  }

  async function handleRechnungErstellen() {
    if (!selectedAuftrag) return;
    if (createdRechnungId) {
      // Already created — skip to next step
      setStep(4);
      return;
    }
    const netVal = parseFloat(nettobetrag);
    const brutVal = parseFloat(effectiveBrutto);
    if (isNaN(netVal) || isNaN(brutVal)) {
      setStep3Error(tx('Bitte gültige Beträge eingeben'));
      return;
    }
    setStep3Submitting(true);
    setStep3Error(null);
    try {
      const kundeId = extractRecordId(selectedAuftrag.fields.kunde);
      const result = await LivingAppsService.createRechnungenEntry({
        rechnungsnummer,
        auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftrag.record_id),
        kunde: kundeId ? createRecordUrl(APP_IDS.KUNDEN, kundeId) : undefined,
        nettobetrag: netVal,
        mwst_satz: mwstSatzKey,
        bruttobetrag: brutVal,
        rechnungsdatum,
        faelligkeitsdatum,
        status_rechnung: statusRechnungKey,
      });
      setCreatedRechnungId(result.record_id);
      setCreatedRechnungsnummer(rechnungsnummer);
      setCreatedNetto(netVal);
      setCreatedBrutto(brutVal);

      // Pre-fill step 4
      setPdfRechnungsnummer(rechnungsnummer);
      setPdfNettobetrag(String(netVal));
      setPdfBruttobetrag(String(brutVal));

      await fetchAll();
      setStep(4);
    } catch (e) {
      setStep3Error(e instanceof Error ? e.message : tx('Fehler beim Erstellen der Rechnung'));
    } finally {
      setStep3Submitting(false);
    }
  }

  async function handlePdfErstellenSubmit() {
    if (!createdRechnungId) return;
    if (createdPdfId) return; // idempotent guard
    setStep4Submitting(true);
    setStep4Error(null);
    try {
      const netVal = parseFloat(pdfNettobetrag);
      const brutVal = parseFloat(pdfBruttobetrag);
      const result = await LivingAppsService.createRechnungsPdfErstellenEntry({
        rechnung: createRecordUrl(APP_IDS.RECHNUNGEN, createdRechnungId),
        pdf_rechnungsnummer: pdfRechnungsnummer,
        pdf_kunde_vorname: pdfKundeVorname || undefined,
        pdf_kunde_nachname: pdfKundeNachname || undefined,
        pdf_nettobetrag: isNaN(netVal) ? undefined : netVal,
        pdf_bruttobetrag: isNaN(brutVal) ? undefined : brutVal,
        pdf_datei: pdfDatei ? (pdfDatei as unknown as string) : undefined,
      });
      setCreatedPdfId(result.record_id);
      await fetchAll();
      setStep(5);
    } catch (e) {
      setStep4Error(e instanceof Error ? e.message : tx('Fehler beim Anlegen des PDF-Datensatzes'));
    } finally {
      setStep4Submitting(false);
    }
  }

  function handleReset() {
    setSelectedAuftrag(null);
    setBemerkungen('');
    setStep2Error(null);
    setAuftragAbgeschlossen(false);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstSatzKey(RECHNUNGEN_MWST[0]?.key ?? 'mwst_19');
    setBruttoOverride('');
    setRechnungsdatum(todayString());
    setFaelligkeitsdatum(faelligString());
    setStatusRechnungKey(RECHNUNGEN_STATUS[0]?.key ?? 'offen');
    setStep3Error(null);
    setCreatedRechnungId(null);
    setCreatedRechnungsnummer('');
    setCreatedNetto(0);
    setCreatedBrutto(0);
    setPdfRechnungsnummer('');
    setPdfKundeVorname('');
    setPdfKundeNachname('');
    setPdfNettobetrag('');
    setPdfBruttobetrag('');
    setPdfDatei(null);
    setStep4Error(null);
    setCreatedPdfId(null);
    setStep(1);
  }

  // Suppress TS unused warning — rechnungsnummerDefault used only for initial hint
  void rechnungsnummerDefault;
  void fahrzeuge;

  return (
    <IntentWizardShell
      title={tx('Auftrag abschließen')}
      subtitle={tx('Auftrag schließen, Rechnung erstellen und PDF anlegen')}
      steps={[
        { label: tx('Auftrag') },
        { label: tx('Abschließen') },
        { label: tx('Rechnung') },
        { label: tx('PDF') },
        { label: tx('Fertig') },
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
          items={eligibleAuftraege.map(a => ({
            id: a.record_id,
            title: a.fields.auftragsnummer ?? tx('Ohne Nummer'),
            subtitle: [a.fields.arbeitsbeschreibung, a.kundeName, a.fahrzeugName].filter(Boolean).join(' · '),
            status: a.fields.status
              ? { key: a.fields.status.key, label: a.fields.status.label }
              : undefined,
            icon: <IconCar size={20} className="text-primary" />,
            stats: a.kundeName ? [{ label: tx('Kunde'), value: a.kundeName }] : undefined,
          }))}
          onSelect={handleSelectAuftrag}
          searchPlaceholder={tx('Auftrag suchen …')}
          emptyText={tx('Keine offenen oder laufenden Aufträge vorhanden')}
          emptyIcon={<IconListCheck size={40} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Auftrag abschließen */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6 max-w-lg mx-auto">
            {/* Read-only Auftrag details */}
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-foreground">{tx('Auftragsdetails')}</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">{tx('Auftragsnummer')}</p>
                  <p className="font-medium">{selectedAuftrag.fields.auftragsnummer ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{tx('Status')}</p>
                  <StatusBadge
                    statusKey={selectedAuftrag.fields.status?.key}
                    label={selectedAuftrag.fields.status?.label}
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">{tx('Arbeitsbeschreibung')}</p>
                  <p className="font-medium">{selectedAuftrag.fields.arbeitsbeschreibung ?? '—'}</p>
                </div>
                {selectedAuftrag.kundeName && (
                  <div>
                    <p className="text-muted-foreground">{tx('Kunde')}</p>
                    <p className="font-medium flex items-center gap-1">
                      <IconUser size={14} className="text-muted-foreground" />
                      {selectedAuftrag.kundeName}
                    </p>
                  </div>
                )}
                {selectedAuftrag.fahrzeugName && (
                  <div>
                    <p className="text-muted-foreground">{tx('Fahrzeug')}</p>
                    <p className="font-medium flex items-center gap-1">
                      <IconCar size={14} className="text-muted-foreground" />
                      {selectedAuftrag.fahrzeugName}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Confirm abschließen */}
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <IconCheckbox size={20} className="text-primary" />
                <h3 className="font-semibold">{tx('Auftrag abschließen')}</h3>
              </div>

              <div className="rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                <span>{tx('Neuer Status:')}</span>
                <StatusBadge statusKey="abgeschlossen" label={AUFTRAEGE_STATUS.find(s => s.key === 'abgeschlossen')?.label ?? tx('Abgeschlossen')} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="bemerkungen">{tx('Abschluss-Bemerkung (optional)')}</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder={tx('Letzte Anmerkungen zum Auftrag …')}
                  rows={3}
                />
              </div>

              {step2Error && (
                <p className="text-sm text-destructive">{step2Error}</p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  {tx('Zurück')}
                </Button>
                <Button
                  onClick={handleAbschliessen}
                  disabled={step2Submitting || auftragAbgeschlossen}
                  className="flex-1"
                >
                  {step2Submitting ? tx('Wird gespeichert …') : tx('Auftrag abschließen')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 3: Rechnung erstellen */}
      {step === 3 && (
        selectedAuftrag ? (
          <div className="space-y-6 max-w-lg mx-auto">
            <div className="flex items-center gap-2">
              <IconFileInvoice size={22} className="text-primary" />
              <h3 className="font-semibold text-lg">{tx('Rechnung erstellen')}</h3>
            </div>

            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <div className="space-y-1">
                <Label htmlFor="rechnungsnummer">{tx('Rechnungsnummer')}</Label>
                <Input
                  id="rechnungsnummer"
                  value={rechnungsnummer || rechnungsnummerDefault}
                  onChange={e => setRechnungsnummer(e.target.value)}
                  placeholder={rechnungsnummerDefault}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="nettobetrag">{tx('Nettobetrag (€)')}</Label>
                <Input
                  id="nettobetrag"
                  type="number"
                  min="0"
                  step="0.01"
                  value={nettobetrag}
                  onChange={e => {
                    setNettobetrag(e.target.value);
                    setBruttoOverride('');
                  }}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-2">
                <Label>{tx('MwSt.-Satz')}</Label>
                <div className="flex flex-wrap gap-2">
                  {RECHNUNGEN_MWST.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setMwstSatzKey(opt.key);
                        setBruttoOverride('');
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-sm font-medium transition-colors ${
                        mwstSatzKey === opt.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-foreground border-border hover:bg-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="bruttobetrag">{tx('Bruttobetrag (€)')}</Label>
                <Input
                  id="bruttobetrag"
                  type="number"
                  min="0"
                  step="0.01"
                  value={effectiveBrutto}
                  onChange={e => setBruttoOverride(e.target.value)}
                  placeholder="0,00"
                />
                {autoBrutto && bruttoOverride === '' && (
                  <p className="text-xs text-muted-foreground">{tx('Automatisch berechnet')}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="rechnungsdatum">{tx('Rechnungsdatum')}</Label>
                  <Input
                    id="rechnungsdatum"
                    type="date"
                    value={rechnungsdatum}
                    onChange={e => setRechnungsdatum(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="faelligkeitsdatum">{tx('Fälligkeitsdatum')}</Label>
                  <Input
                    id="faelligkeitsdatum"
                    type="date"
                    value={faelligkeitsdatum}
                    onChange={e => setFaelligkeitsdatum(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{tx('Rechnungsstatus')}</Label>
                <div className="flex flex-wrap gap-2">
                  {RECHNUNGEN_STATUS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setStatusRechnungKey(opt.key)}
                      className={`px-3 py-1.5 rounded-xl border text-sm font-medium transition-colors ${
                        statusRechnungKey === opt.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-foreground border-border hover:bg-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {step3Error && (
                <p className="text-sm text-destructive">{step3Error}</p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                  {tx('Zurück')}
                </Button>
                <Button
                  onClick={handleRechnungErstellen}
                  disabled={step3Submitting || !nettobetrag}
                  className="flex-1"
                >
                  {step3Submitting ? tx('Wird erstellt …') : tx('Rechnung erstellen')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 4: Rechnungs-PDF-Datensatz anlegen */}
      {step === 4 && (
        createdRechnungId ? (
          <div className="space-y-6 max-w-lg mx-auto">
            <div className="flex items-center gap-2">
              <IconFilePlus size={22} className="text-primary" />
              <h3 className="font-semibold text-lg">{tx('Rechnungs-PDF anlegen')}</h3>
            </div>

            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <div className="rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground">
                {tx('Rechnung:')} <span className="font-medium text-foreground">{createdRechnungsnummer}</span>
              </div>

              <div className="space-y-1">
                <Label htmlFor="pdf-rechnungsnummer">{tx('Rechnungsnummer (PDF)')}</Label>
                <Input
                  id="pdf-rechnungsnummer"
                  value={pdfRechnungsnummer}
                  onChange={e => setPdfRechnungsnummer(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pdf-vorname">{tx('Vorname Kunde')}</Label>
                  <Input
                    id="pdf-vorname"
                    value={pdfKundeVorname}
                    onChange={e => setPdfKundeVorname(e.target.value)}
                    placeholder={tx('Vorname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pdf-nachname">{tx('Nachname Kunde')}</Label>
                  <Input
                    id="pdf-nachname"
                    value={pdfKundeNachname}
                    onChange={e => setPdfKundeNachname(e.target.value)}
                    placeholder={tx('Nachname')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pdf-netto">{tx('Nettobetrag (€)')}</Label>
                  <Input
                    id="pdf-netto"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pdfNettobetrag}
                    onChange={e => setPdfNettobetrag(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pdf-brutto">{tx('Bruttobetrag (€)')}</Label>
                  <Input
                    id="pdf-brutto"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pdfBruttobetrag}
                    onChange={e => setPdfBruttobetrag(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="pdf-datei">{tx('PDF-Datei (optional)')}</Label>
                <Input
                  id="pdf-datei"
                  type="file"
                  accept=".pdf"
                  onChange={e => setPdfDatei(e.target.files?.[0] ?? null)}
                />
              </div>

              {step4Error && (
                <p className="text-sm text-destructive">{step4Error}</p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
                  {tx('Zurück')}
                </Button>
                <Button
                  onClick={handlePdfErstellenSubmit}
                  disabled={step4Submitting || !pdfRechnungsnummer}
                  className="flex-1"
                >
                  {step4Submitting ? tx('Wird angelegt …') : tx('PDF-Datensatz anlegen')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht eine erstellte Rechnung aus Schritt 3.')}</p>
            <Button variant="outline" onClick={() => setStep(3)}>{tx('Zu Schritt 3')}</Button>
          </div>
        )
      )}

      {/* Step 5: Erfolg */}
      {step === 5 && (
        <div className="text-center py-12 space-y-6 max-w-lg mx-auto">
          <div className="flex flex-col items-center gap-3">
            <IconCircleCheck size={56} className="text-green-500" stroke={1.5} />
            <h3 className="text-xl font-semibold">{tx('Auftrag erfolgreich abgeschlossen')}</h3>
            <p className="text-muted-foreground text-sm">{tx('Auftrag, Rechnung und PDF-Datensatz wurden angelegt.')}</p>
          </div>

          <div className="rounded-2xl border bg-card p-4 text-left space-y-3 text-sm">
            {selectedAuftrag && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tx('Auftrag')}</span>
                <span className="font-medium">{selectedAuftrag.fields.auftragsnummer ?? '—'}</span>
              </div>
            )}
            {createdRechnungsnummer && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tx('Rechnung')}</span>
                <span className="font-medium">{createdRechnungsnummer}</span>
              </div>
            )}
            {createdNetto > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tx('Netto')}</span>
                <span className="font-medium">{createdNetto.toFixed(2)} €</span>
              </div>
            )}
            {createdBrutto > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tx('Brutto')}</span>
                <span className="font-medium">{createdBrutto.toFixed(2)} €</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleReset} variant="outline">
              {tx('Weiteren Auftrag abschließen')}
            </Button>
            <a href="#/" className="inline-flex">
              <Button>{tx('Zurück zum Dashboard')}</Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
