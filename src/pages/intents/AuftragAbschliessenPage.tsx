/**
 * Auftrag abschließen — 4-Schritt-Wizard.
 * Steps: 1) Auftrag wählen (nur offen/in_bearbeitung) → 2) Status auf abgeschlossen setzen
 *        → 3) Rechnung erfassen → 4) Rechnungs-PDF-Eintrag anlegen.
 * Reads: auftraege (EnrichedAuftraege), kunden. Writes: auftraege (updateAuftraegeEntry),
 *        rechnungen (createRechnungenEntry), rechnungs_pdf_erstellen (createRechnungsPdfErstellenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconFileInvoice, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { EnrichedAuftraege } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId, uploadFile } from '@/services/livingAppsService';
import { tx } from '@/i18n';

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const STATUS_RECHNUNG_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

export default function AuftragAbschliessenPage() {
  const { auftraege, kunden, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1
  const [selectedAuftrag, setSelectedAuftrag] = useState<EnrichedAuftraege | null>(null);

  // Step 2
  const [abschliessenLoading, setAbschliessenLoading] = useState(false);
  const [abschliessenError, setAbschliessenError] = useState<string | null>(null);

  // Step 3 — Rechnung
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstKey, setMwstKey] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [bruttobetrag, setBruttobetrag] = useState('');
  const [rechnungsdatum, setRechnungsdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState('');
  const [statusRechnungKey, setStatusRechnungKey] = useState(STATUS_RECHNUNG_OPTIONS[0]?.key ?? 'offen');
  const [rechnungLoading, setRechnungLoading] = useState(false);
  const [rechnungError, setRechnungError] = useState<string | null>(null);
  const [erstellteRechnungId, setErstellteRechnungId] = useState<string | null>(null);

  // Step 4 — PDF
  const [pdfRechnungsnummer, setPdfRechnungsnummer] = useState('');
  const [pdfKundeVorname, setPdfKundeVorname] = useState('');
  const [pdfKundeNachname, setPdfKundeNachname] = useState('');
  const [pdfNettobetrag, setPdfNettobetrag] = useState('');
  const [pdfBruttobetrag, setPdfBruttobetrag] = useState('');
  const [pdfDatei, setPdfDatei] = useState<File | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const offeneAuftraege = useMemo(
    () => (auftraege as EnrichedAuftraege[]).filter(a => a.fields.status?.key !== 'abgeschlossen'),
    [auftraege]
  );

  const handleAuftragSelect = (id: string) => {
    const a = offeneAuftraege.find(x => x.record_id === id) ?? null;
    setSelectedAuftrag(a);
    setStep(2);
  };

  const handleAbschliessen = async () => {
    if (!selectedAuftrag) return;
    setAbschliessenLoading(true);
    setAbschliessenError(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftrag.record_id, { status: 'abgeschlossen' });
      await fetchAll();
      // Pre-fill PDF customer data from kunden list
      const kundeId = extractRecordId(selectedAuftrag.fields.kunde);
      const kunde = kundeId ? kunden.find(k => k.record_id === kundeId) : null;
      if (kunde) {
        setPdfKundeVorname(kunde.fields.vorname ?? '');
        setPdfKundeNachname(kunde.fields.nachname ?? '');
      }
      setStep(3);
    } catch (e) {
      setAbschliessenError(e instanceof Error ? e.message : tx('Fehler beim Abschließen'));
    } finally {
      setAbschliessenLoading(false);
    }
  };

  const handleRechnungErstellen = async () => {
    if (!selectedAuftrag) return;
    // Idempotency guard
    let rId = erstellteRechnungId;
    if (rId) {
      // already created, just advance
      setPdfRechnungsnummer(rechnungsnummer);
      setPdfNettobetrag(nettobetrag);
      setPdfBruttobetrag(bruttobetrag);
      setStep(4);
      return;
    }
    setRechnungLoading(true);
    setRechnungError(null);
    try {
      const kundeUrl = selectedAuftrag.fields.kunde
        ? createRecordUrl(APP_IDS.KUNDEN, extractRecordId(selectedAuftrag.fields.kunde)!)
        : undefined;

      const rechnung = await LivingAppsService.createRechnungenEntry({
        rechnungsnummer,
        auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftrag.record_id),
        ...(kundeUrl ? { kunde: kundeUrl } : {}),
        nettobetrag: nettobetrag ? parseFloat(nettobetrag) : undefined,
        mwst_satz: mwstKey,
        bruttobetrag: bruttobetrag ? parseFloat(bruttobetrag) : undefined,
        rechnungsdatum,
        faelligkeitsdatum: faelligkeitsdatum || undefined,
        status_rechnung: statusRechnungKey,
      });
      rId = rechnung.record_id;
      setErstellteRechnungId(rId);
      setPdfRechnungsnummer(rechnungsnummer);
      setPdfNettobetrag(nettobetrag);
      setPdfBruttobetrag(bruttobetrag);
      await fetchAll();
      setStep(4);
    } catch (e) {
      setRechnungError(e instanceof Error ? e.message : tx('Fehler beim Erstellen der Rechnung'));
    } finally {
      setRechnungLoading(false);
    }
  };

  const handlePdfEintragAnlegen = async () => {
    if (!erstellteRechnungId) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      let dateiUrl: string | undefined;
      if (pdfDatei) {
        dateiUrl = await uploadFile(pdfDatei);
      }
      await LivingAppsService.createRechnungsPdfErstellenEntry({
        rechnung: createRecordUrl(APP_IDS.RECHNUNGEN, erstellteRechnungId),
        pdf_rechnungsnummer: pdfRechnungsnummer || undefined,
        pdf_kunde_vorname: pdfKundeVorname || undefined,
        pdf_kunde_nachname: pdfKundeNachname || undefined,
        pdf_nettobetrag: pdfNettobetrag ? parseFloat(pdfNettobetrag) : undefined,
        pdf_bruttobetrag: pdfBruttobetrag ? parseFloat(pdfBruttobetrag) : undefined,
        pdf_datei: dateiUrl,
      });
      await fetchAll();
      setDone(true);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : tx('Fehler beim Anlegen des PDF-Eintrags'));
    } finally {
      setPdfLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedAuftrag(null);
    setAbschliessenError(null);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstKey(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setBruttobetrag('');
    setRechnungsdatum(format(new Date(), 'yyyy-MM-dd'));
    setFaelligkeitsdatum('');
    setStatusRechnungKey(STATUS_RECHNUNG_OPTIONS[0]?.key ?? 'offen');
    setRechnungError(null);
    setErstellteRechnungId(null);
    setPdfRechnungsnummer('');
    setPdfKundeVorname('');
    setPdfKundeNachname('');
    setPdfNettobetrag('');
    setPdfBruttobetrag('');
    setPdfDatei(null);
    setPdfError(null);
    setDone(false);
  };

  // Auto-compute Brutto when Netto or MwSt changes (user can override)
  const handleNettoChange = (val: string) => {
    setNettobetrag(val);
    const net = parseFloat(val);
    if (!isNaN(net)) {
      const rate = mwstKey === 'mwst_19' ? 1.19 : mwstKey === 'mwst_7' ? 1.07 : 1.0;
      setBruttobetrag((net * rate).toFixed(2));
    }
  };

  const handleMwstChange = (key: string) => {
    setMwstKey(key);
    const net = parseFloat(nettobetrag);
    if (!isNaN(net)) {
      const rate = key === 'mwst_19' ? 1.19 : key === 'mwst_7' ? 1.07 : 1.0;
      setBruttobetrag((net * rate).toFixed(2));
    }
  };

  return (
    <IntentWizardShell
      title={tx('Auftrag abschließen')}
      subtitle={tx('Auftrag abschließen, Rechnung erstellen und PDF-Eintrag anlegen')}
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
      {/* Step 1: Auftrag wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAuftraege.map(a => ({
            id: a.record_id,
            title: a.fields.auftragsnummer ?? a.record_id,
            subtitle: a.fields.arbeitsbeschreibung
              ? a.fields.arbeitsbeschreibung.length > 80
                ? a.fields.arbeitsbeschreibung.slice(0, 80) + '…'
                : a.fields.arbeitsbeschreibung
              : a.fahrzeugName,
            status: a.fields.status
              ? { key: a.fields.status.key, label: a.fields.status.label }
              : undefined,
            stats: [
              { label: tx('Fahrzeug'), value: a.fahrzeugName },
              { label: tx('Kunde'), value: a.kundeName },
            ],
            icon: <IconFileInvoice size={20} className="text-primary" />,
          }))}
          onSelect={handleAuftragSelect}
          searchPlaceholder={tx('Auftragsnummer oder Beschreibung suchen …')}
          emptyText={tx('Keine offenen Aufträge gefunden')}
        />
      )}

      {/* Step 2: Status auf abgeschlossen setzen */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6 max-w-lg mx-auto">
            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
              <h3 className="font-semibold text-lg truncate">
                {selectedAuftrag.fields.auftragsnummer ?? tx('Auftrag')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">{tx('Status')}</p>
                  <StatusBadge
                    statusKey={selectedAuftrag.fields.status?.key}
                    label={selectedAuftrag.fields.status?.label}
                  />
                </div>
                <div>
                  <p className="text-muted-foreground">{tx('Fahrzeug')}</p>
                  <p className="font-medium truncate">{selectedAuftrag.fahrzeugName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{tx('Kunde')}</p>
                  <p className="font-medium truncate">{selectedAuftrag.kundeName}</p>
                </div>
              </div>
              {selectedAuftrag.fields.arbeitsbeschreibung && (
                <div>
                  <p className="text-muted-foreground text-sm">{tx('Arbeitsbeschreibung')}</p>
                  <p className="text-sm line-clamp-3">{selectedAuftrag.fields.arbeitsbeschreibung}</p>
                </div>
              )}
            </div>

            {abschliessenError && (
              <div className="flex items-center gap-2 text-destructive text-sm rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                <IconAlertCircle size={16} stroke={2} />
                <span>{abschliessenError}</span>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleAbschliessen}
              disabled={abschliessenLoading}
            >
              <IconCheck size={16} stroke={2} className="mr-2" />
              {abschliessenLoading ? tx('Wird abgeschlossen …') : tx('Auftrag abschließen')}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setStep(1)}>
              {tx('Zurück')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 3: Rechnung erfassen */}
      {step === 3 && (
        selectedAuftrag ? (
          <div className="space-y-5 max-w-lg mx-auto">
            <div className="rounded-2xl border bg-card p-4 overflow-hidden">
              <p className="text-xs text-muted-foreground">{tx('Auftrag')}</p>
              <p className="font-semibold truncate">{selectedAuftrag.fields.auftragsnummer ?? selectedAuftrag.record_id}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="rechnungsnummer">{tx('Rechnungsnummer')} *</Label>
                <Input
                  id="rechnungsnummer"
                  value={rechnungsnummer}
                  onChange={e => setRechnungsnummer(e.target.value)}
                  placeholder={tx('z. B. RE-2026-0001')}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="nettobetrag">{tx('Nettobetrag')} (€) *</Label>
                  <Input
                    id="nettobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={nettobetrag}
                    onChange={e => handleNettoChange(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mwst_satz">{tx('MwSt.-Satz')} *</Label>
                  <Select value={mwstKey} onValueChange={handleMwstChange}>
                    <SelectTrigger id="mwst_satz">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MWST_OPTIONS.map(o => (
                        <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="bruttobetrag">{tx('Bruttobetrag')} (€) *</Label>
                <Input
                  id="bruttobetrag"
                  type="number"
                  min="0"
                  step="0.01"
                  value={bruttobetrag}
                  onChange={e => setBruttobetrag(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">{tx('Wird automatisch berechnet, kann überschrieben werden')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <Label htmlFor="faelligkeitsdatum">{tx('Fälligkeitsdatum')}</Label>
                  <Input
                    id="faelligkeitsdatum"
                    type="date"
                    value={faelligkeitsdatum}
                    onChange={e => setFaelligkeitsdatum(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="status_rechnung">{tx('Rechnungsstatus')}</Label>
                <Select value={statusRechnungKey} onValueChange={setStatusRechnungKey}>
                  <SelectTrigger id="status_rechnung">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_RECHNUNG_OPTIONS.map(o => (
                      <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {rechnungError && (
              <div className="flex items-center gap-2 text-destructive text-sm rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                <IconAlertCircle size={16} stroke={2} />
                <span>{rechnungError}</span>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleRechnungErstellen}
              disabled={rechnungLoading || !rechnungsnummer || !nettobetrag || !bruttobetrag || !rechnungsdatum}
            >
              {rechnungLoading ? tx('Rechnung wird erstellt …') : tx('Rechnung erstellen')}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setStep(2)}>
              {tx('Zurück')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 4: Rechnungs-PDF-Eintrag anlegen */}
      {step === 4 && (
        done ? (
          <div className="text-center py-12 space-y-4 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <IconCheck size={32} stroke={2} className="text-primary" />
            </div>
            <h3 className="text-xl font-semibold">{tx('Fertig!')}</h3>
            <p className="text-muted-foreground">
              {tx('Rechnung')} <span className="font-semibold">{pdfRechnungsnummer}</span> {tx('wurde erstellt und der PDF-Eintrag wurde angelegt.')}
            </p>
            <div className="flex flex-col gap-3 pt-2">
              <Button onClick={handleReset}>{tx('Weiteren Auftrag abschließen')}</Button>
              <a href="#/" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                {tx('Zurück zum Dashboard')}
              </a>
            </div>
          </div>
        ) : erstellteRechnungId ? (
          <div className="space-y-5 max-w-lg mx-auto">
            <div className="rounded-2xl border bg-card p-4 overflow-hidden">
              <p className="text-xs text-muted-foreground">{tx('Rechnung')}</p>
              <p className="font-semibold truncate">{pdfRechnungsnummer}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="pdf_rechnungsnummer">{tx('Rechnungsnummer (PDF)')} *</Label>
                <Input
                  id="pdf_rechnungsnummer"
                  value={pdfRechnungsnummer}
                  onChange={e => setPdfRechnungsnummer(e.target.value)}
                  placeholder={tx('Rechnungsnummer')}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pdf_kunde_vorname">{tx('Vorname Kunde')}</Label>
                  <Input
                    id="pdf_kunde_vorname"
                    value={pdfKundeVorname}
                    onChange={e => setPdfKundeVorname(e.target.value)}
                    placeholder={tx('Vorname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pdf_kunde_nachname">{tx('Nachname Kunde')}</Label>
                  <Input
                    id="pdf_kunde_nachname"
                    value={pdfKundeNachname}
                    onChange={e => setPdfKundeNachname(e.target.value)}
                    placeholder={tx('Nachname')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pdf_nettobetrag">{tx('Nettobetrag (PDF)')} (€)</Label>
                  <Input
                    id="pdf_nettobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pdfNettobetrag}
                    onChange={e => setPdfNettobetrag(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pdf_bruttobetrag">{tx('Bruttobetrag (PDF)')} (€)</Label>
                  <Input
                    id="pdf_bruttobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pdfBruttobetrag}
                    onChange={e => setPdfBruttobetrag(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="pdf_datei">{tx('PDF-Datei hochladen')}</Label>
                <Input
                  id="pdf_datei"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={e => setPdfDatei(e.target.files?.[0] ?? null)}
                  className="cursor-pointer"
                />
              </div>
            </div>

            {pdfError && (
              <div className="flex items-center gap-2 text-destructive text-sm rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                <IconAlertCircle size={16} stroke={2} />
                <span>{pdfError}</span>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handlePdfEintragAnlegen}
              disabled={pdfLoading || !pdfRechnungsnummer}
            >
              {pdfLoading ? tx('PDF-Eintrag wird angelegt …') : tx('PDF-Eintrag anlegen')}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setStep(3)}>
              {tx('Zurück')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht eine erstellte Rechnung aus Schritt 3.')}</p>
            <Button variant="outline" onClick={() => setStep(3)}>{tx('Zu Schritt 3')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
