/**
 * Auftrag abschließen — 4-Schritt-Wizard.
 * Steps: 1) Auftrag wählen → 2) Auftrag abschließen → 3) Rechnung erstellen → 4) Rechnungs-PDF erstellen.
 * Reads: auftraege, kunden, fahrzeuge. Writes: auftraege (updateAuftraegeEntry), rechnungen (createRechnungenEntry), rechnungsPdfErstellen (createRechnungsPdfErstellenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { EnrichedAuftraege } from '@/types/enriched';
import { tx } from '@/i18n';
import { IconFileInvoice, IconCheck, IconAlertCircle } from '@tabler/icons-react';

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];

export default function AuftragAbschliessenPage() {
  const [searchParams] = useSearchParams();
  const { auftraege, kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const auftragIdParam = searchParams.get('auftragId');

  const [step, setStep] = useState(() => {
    if (auftragIdParam) return 2;
    return 1;
  });

  const [selectedAuftragId, setSelectedAuftragId] = useState<string | null>(auftragIdParam);
  const [rechnungId, setRechnungId] = useState<string | null>(null);

  // Schritt 3: Rechnung-Formular
  const today = format(new Date(), 'yyyy-MM-dd');
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstSatz, setMwstSatz] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [bruttobetrag, setBruttobetrag] = useState('');
  const [rechnungsdatum, setRechnungsdatum] = useState(today);
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState('');
  const [rechnungSaving, setRechnungSaving] = useState(false);
  const [rechnungError, setRechnungError] = useState<string | null>(null);

  // Schritt 4: PDF-Formular
  const [pdfRechnungsnummer, setPdfRechnungsnummer] = useState('');
  const [pdfKundeVorname, setPdfKundeVorname] = useState('');
  const [pdfKundeNachname, setPdfKundeNachname] = useState('');
  const [pdfNettobetrag, setPdfNettobetrag] = useState('');
  const [pdfBruttobetrag, setPdfBruttobetrag] = useState('');
  const [pdfDateiUrl, setPdfDateiUrl] = useState('');
  const [pdfSaving, setPdfSaving] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Auftrag abschließen (Schritt 2)
  const [abschliessenSaving, setAbschliessenSaving] = useState(false);
  const [abschliessenError, setAbschliessenError] = useState<string | null>(null);

  const offeneAuftraege = auftraege.filter(a => {
    const key = a.fields.status?.key;
    return key === 'offen' || key === 'in_bearbeitung';
  });

  const selectedAuftrag = selectedAuftragId
    ? (auftraege.find(a => a.record_id === selectedAuftragId) as EnrichedAuftraege | undefined)
    : null;

  const kundeId = selectedAuftrag
    ? (kunden.find(k =>
        selectedAuftrag.fields.kunde?.includes(k.record_id)
      )?.record_id ?? null)
    : null;

  const kunde = kundeId ? kunden.find(k => k.record_id === kundeId) : null;

  const fahrzeug = selectedAuftrag?.fields.fahrzeug
    ? fahrzeuge.find(f => selectedAuftrag.fields.fahrzeug?.includes(f.record_id))
    : null;

  const handleAuftragSelect = useCallback((id: string) => {
    setSelectedAuftragId(id);
    setStep(2);
  }, []);

  const handleAbschliessen = useCallback(async () => {
    if (!selectedAuftragId) return;
    setAbschliessenSaving(true);
    setAbschliessenError(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftragId, { status: 'abgeschlossen' });
      await fetchAll();
      setStep(3);
    } catch (e) {
      setAbschliessenError(e instanceof Error ? e.message : String(e));
    } finally {
      setAbschliessenSaving(false);
    }
  }, [selectedAuftragId, fetchAll]);

  const handleRechnungErstellen = useCallback(async () => {
    if (!selectedAuftragId) return;
    setRechnungSaving(true);
    setRechnungError(null);
    try {
      const result = await LivingAppsService.createRechnungenEntry({
        rechnungsnummer,
        nettobetrag: parseFloat(nettobetrag),
        mwst_satz: mwstSatz,
        bruttobetrag: parseFloat(bruttobetrag),
        rechnungsdatum,
        faelligkeitsdatum,
        status_rechnung: 'offen',
        auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftragId),
        ...(kundeId ? { kunde: createRecordUrl(APP_IDS.KUNDEN, kundeId) } : {}),
      });
      const newRechnungId = result.record_id;
      setRechnungId(newRechnungId);
      // Vorausfüllen für Schritt 4
      setPdfRechnungsnummer(rechnungsnummer);
      setPdfKundeVorname(kunde?.fields.vorname ?? '');
      setPdfKundeNachname(kunde?.fields.nachname ?? '');
      setPdfNettobetrag(nettobetrag);
      setPdfBruttobetrag(bruttobetrag);
      setStep(4);
    } catch (e) {
      setRechnungError(e instanceof Error ? e.message : String(e));
    } finally {
      setRechnungSaving(false);
    }
  }, [selectedAuftragId, rechnungsnummer, nettobetrag, mwstSatz, bruttobetrag, rechnungsdatum, faelligkeitsdatum, kundeId, kunde]);

  const handlePdfErstellen = useCallback(async () => {
    if (!rechnungId) return;
    setPdfSaving(true);
    setPdfError(null);
    try {
      await LivingAppsService.createRechnungsPdfErstellenEntry({
        rechnung: createRecordUrl(APP_IDS.RECHNUNGEN, rechnungId),
        pdf_rechnungsnummer: pdfRechnungsnummer,
        pdf_kunde_vorname: pdfKundeVorname,
        pdf_kunde_nachname: pdfKundeNachname,
        pdf_nettobetrag: parseFloat(pdfNettobetrag),
        pdf_bruttobetrag: parseFloat(pdfBruttobetrag),
        pdf_datei: pdfDateiUrl,
      });
      setSuccess(true);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfSaving(false);
    }
  }, [rechnungId, pdfRechnungsnummer, pdfKundeVorname, pdfKundeNachname, pdfNettobetrag, pdfBruttobetrag, pdfDateiUrl]);

  const handleReset = useCallback(() => {
    setSelectedAuftragId(null);
    setRechnungId(null);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstSatz(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setBruttobetrag('');
    setRechnungsdatum(format(new Date(), 'yyyy-MM-dd'));
    setFaelligkeitsdatum('');
    setPdfRechnungsnummer('');
    setPdfKundeVorname('');
    setPdfKundeNachname('');
    setPdfNettobetrag('');
    setPdfBruttobetrag('');
    setPdfDateiUrl('');
    setSuccess(false);
    setAbschliessenError(null);
    setRechnungError(null);
    setPdfError(null);
    setStep(1);
  }, []);

  // Bruttobetrag-Hinweis berechnen
  const nettoNum = parseFloat(nettobetrag);
  const mwstRateMap: Record<string, number> = { mwst_19: 0.19, mwst_7: 0.07, mwst_0: 0 };
  const mwstRate = mwstRateMap[mwstSatz] ?? 0.19;
  const bruttoHint = !isNaN(nettoNum) && nettoNum > 0
    ? (nettoNum * (1 + mwstRate)).toFixed(2)
    : null;

  const contextBanner = (step >= 3 && selectedAuftrag) ? (
    <div className="mb-4 flex items-center gap-3 rounded-xl bg-secondary px-4 py-3 text-sm">
      <IconFileInvoice size={18} className="text-primary shrink-0" />
      <span className="text-muted-foreground">{tx('Auftrag')}</span>
      <span className="font-semibold text-foreground">{selectedAuftrag.fields.auftragsnummer ?? selectedAuftrag.record_id}</span>
      {kunde && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium text-foreground">{kunde.fields.vorname} {kunde.fields.nachname}</span>
        </>
      )}
    </div>
  ) : null;

  return (
    <IntentWizardShell
      title={tx('Auftrag abschließen')}
      subtitle={tx('Auftrag abschließen und Rechnung erstellen')}
      steps={[
        { label: tx('Auftrag') },
        { label: tx('Abschließen') },
        { label: tx('Rechnung') },
        { label: tx('PDF') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Schritt 1: Auftrag wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAuftraege.map(a => {
            const k = kunden.find(ku => a.fields.kunde?.includes(ku.record_id));
            const fz = fahrzeuge.find(f => a.fields.fahrzeug?.includes(f.record_id));
            return {
              id: a.record_id,
              title: a.fields.auftragsnummer ?? a.record_id,
              subtitle: [
                a.fields.arbeitsbeschreibung,
                k ? `${k.fields.vorname ?? ''} ${k.fields.nachname ?? ''}`.trim() : undefined,
                fz?.fields.kennzeichen,
              ].filter(Boolean).join(' · '),
              status: a.fields.status
                ? { key: a.fields.status.key, label: a.fields.status.label }
                : undefined,
              icon: <IconFileInvoice size={20} className="text-primary" />,
            };
          })}
          onSelect={handleAuftragSelect}
          searchPlaceholder={tx('Auftrag suchen …')}
          emptyText={tx('Keine offenen Aufträge vorhanden')}
        />
      )}

      {/* Schritt 2: Auftrag abschließen */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
              <h2 className="text-lg font-semibold text-foreground">{tx('Auftragsübersicht')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">{tx('Auftragsnummer')}</p>
                  <p className="font-medium text-foreground">{selectedAuftrag.fields.auftragsnummer ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{tx('Status')}</p>
                  <StatusBadge
                    statusKey={selectedAuftrag.fields.status?.key}
                    label={selectedAuftrag.fields.status?.label}
                  />
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">{tx('Arbeitsbeschreibung')}</p>
                  <p className="font-medium text-foreground">{selectedAuftrag.fields.arbeitsbeschreibung ?? '—'}</p>
                </div>
                {kunde && (
                  <div>
                    <p className="text-muted-foreground">{tx('Kunde')}</p>
                    <p className="font-medium text-foreground">{kunde.fields.vorname} {kunde.fields.nachname}</p>
                  </div>
                )}
                {fahrzeug && (
                  <div>
                    <p className="text-muted-foreground">{tx('Fahrzeug')}</p>
                    <p className="font-medium text-foreground">{fahrzeug.fields.kennzeichen} · {fahrzeug.fields.marke} {fahrzeug.fields.modell}</p>
                  </div>
                )}
              </div>
            </div>

            {abschliessenError && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertCircle size={16} />
                <span>{abschliessenError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setStep(1)}
              >
                {tx('Anderen Auftrag wählen')}
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={handleAbschliessen}
                disabled={abschliessenSaving}
              >
                <IconCheck size={16} className="mr-2" />
                {abschliessenSaving ? tx('Wird gespeichert …') : tx('Auftrag abschließen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Schritt 3: Rechnung erstellen */}
      {step === 3 && (
        selectedAuftrag ? (
          <div className="space-y-6">
            {contextBanner}
            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
              <h2 className="text-lg font-semibold text-foreground">{tx('Rechnung erstellen')}</h2>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="rechnungsnummer">{tx('Rechnungsnummer')} *</Label>
                    <Input
                      id="rechnungsnummer"
                      value={rechnungsnummer}
                      onChange={e => setRechnungsnummer(e.target.value)}
                      placeholder={tx('z.B. RE-2026-001')}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="mwst_satz">{tx('MwSt.-Satz')} *</Label>
                    <Select value={mwstSatz} onValueChange={setMwstSatz}>
                      <SelectTrigger id="mwst_satz">
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
                    <Label htmlFor="nettobetrag">{tx('Nettobetrag (€)')} *</Label>
                    <Input
                      id="nettobetrag"
                      type="number"
                      min="0"
                      step="0.01"
                      value={nettobetrag}
                      onChange={e => setNettobetrag(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bruttobetrag">
                      {tx('Bruttobetrag (€)')} *
                      {bruttoHint && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {tx('Hinweis')}: {bruttoHint} €
                        </span>
                      )}
                    </Label>
                    <Input
                      id="bruttobetrag"
                      type="number"
                      min="0"
                      step="0.01"
                      value={bruttobetrag}
                      onChange={e => setBruttobetrag(e.target.value)}
                      placeholder={bruttoHint ?? '0,00'}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="rechnungsdatum">{tx('Rechnungsdatum')} *</Label>
                    <Input
                      id="rechnungsdatum"
                      type="date"
                      value={rechnungsdatum}
                      onChange={e => setRechnungsdatum(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="faelligkeitsdatum">{tx('Fälligkeitsdatum')} *</Label>
                    <Input
                      id="faelligkeitsdatum"
                      type="date"
                      value={faelligkeitsdatum}
                      onChange={e => setFaelligkeitsdatum(e.target.value)}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {tx('Status wird automatisch auf „Offen" gesetzt. Auftrag und Kunde werden automatisch verknüpft.')}
                </p>
              </div>
            </div>

            {rechnungError && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertCircle size={16} />
                <span>{rechnungError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setStep(2)}
              >
                {tx('Zurück')}
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={handleRechnungErstellen}
                disabled={
                  rechnungSaving ||
                  !rechnungsnummer ||
                  !nettobetrag ||
                  !bruttobetrag ||
                  !rechnungsdatum ||
                  !faelligkeitsdatum
                }
              >
                {rechnungSaving ? tx('Wird erstellt …') : tx('Rechnung erstellen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Schritt 4: Rechnungs-PDF erstellen */}
      {step === 4 && (
        rechnungId ? (
          success ? (
            <div className="text-center py-12 space-y-6">
              <div className="flex justify-center">
                <div className="rounded-full bg-primary/10 p-4">
                  <IconCheck size={32} className="text-primary" />
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">{tx('Auftrag erfolgreich abgeschlossen!')}</h2>
                <p className="text-sm text-muted-foreground">
                  {tx('Auftrag wurde abgeschlossen, Rechnung und PDF wurden erstellt.')}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <Button onClick={handleReset} variant="outline">
                  {tx('Weiteren Auftrag abschließen')}
                </Button>
                <a href="#/">
                  <Button className="w-full">{tx('Zurück zum Dashboard')}</Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {contextBanner}
              <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
                <h2 className="text-lg font-semibold text-foreground">{tx('Rechnungs-PDF erstellen')}</h2>
                <p className="text-sm text-muted-foreground">
                  {tx('Die Felder sind vorausgefüllt. Bitte lade die PDF-Datei hoch.')}
                </p>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="pdf_rechnungsnummer">{tx('Rechnungsnummer')} *</Label>
                      <Input
                        id="pdf_rechnungsnummer"
                        value={pdfRechnungsnummer}
                        onChange={e => setPdfRechnungsnummer(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="pdf_nettobetrag">{tx('Nettobetrag (€)')} *</Label>
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
                      <Label htmlFor="pdf_kunde_vorname">{tx('Kunden-Vorname')} *</Label>
                      <Input
                        id="pdf_kunde_vorname"
                        value={pdfKundeVorname}
                        onChange={e => setPdfKundeVorname(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="pdf_bruttobetrag">{tx('Bruttobetrag (€)')} *</Label>
                      <Input
                        id="pdf_bruttobetrag"
                        type="number"
                        min="0"
                        step="0.01"
                        value={pdfBruttobetrag}
                        onChange={e => setPdfBruttobetrag(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="pdf_kunde_nachname">{tx('Kunden-Nachname')} *</Label>
                      <Input
                        id="pdf_kunde_nachname"
                        value={pdfKundeNachname}
                        onChange={e => setPdfKundeNachname(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="pdf_datei">{tx('PDF-Datei (URL)')} *</Label>
                      <Input
                        id="pdf_datei"
                        value={pdfDateiUrl}
                        onChange={e => setPdfDateiUrl(e.target.value)}
                        placeholder={tx('URL zur PDF-Datei')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {pdfError && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                  <IconAlertCircle size={16} />
                  <span>{pdfError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setStep(3)}
                >
                  {tx('Zurück')}
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  onClick={handlePdfErstellen}
                  disabled={
                    pdfSaving ||
                    !pdfRechnungsnummer ||
                    !pdfKundeVorname ||
                    !pdfKundeNachname ||
                    !pdfNettobetrag ||
                    !pdfBruttobetrag ||
                    !pdfDateiUrl
                  }
                >
                  {pdfSaving ? tx('Wird erstellt …') : tx('PDF erstellen & abschließen')}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht eine erstellte Rechnung aus Schritt 3.')}</p>
            <Button variant="outline" onClick={() => setStep(3)}>{tx('Zurück zu Schritt 3')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
