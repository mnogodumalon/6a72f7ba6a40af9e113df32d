/**
 * Auftrag abschließen — 4-Schritt-Wizard.
 * Steps: 1) Auftrag wählen (nur offen/in_bearbeitung) → 2) Auftrag abschließen (Status → abgeschlossen)
 *        → 3) Rechnung erstellen → 4) PDF-Datensatz anlegen.
 * Reads: auftraege, kunden, fahrzeuge. Writes: auftraege (updateAuftraegeEntry),
 *        rechnungen (createRechnungenEntry), rechnungsPdfErstellen (createRechnungsPdfErstellenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Auftraege } from '@/types/app';
import { tx } from '@/i18n';
import { IconFileInvoice, IconCheck, IconFileUpload, IconClipboardCheck } from '@tabler/icons-react';

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const STATUS_RECHNUNG_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

function getMwstRate(key: string): number {
  if (key === 'mwst_19') return 0.19;
  if (key === 'mwst_7') return 0.07;
  return 0;
}

export default function AuftragAbschliessenPage() {
  const { auftraege, kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  // Step 1: Auftrag wählen
  const [selectedAuftragId, setSelectedAuftragId] = useState<string | null>(null);

  // Step 2: Auftrag abschließen
  const [bemerkungen, setBemerkungen] = useState('');
  const [closingBusy, setClosingBusy] = useState(false);
  const [closingError, setClosingError] = useState<string | null>(null);

  // Step 3: Rechnung erstellen
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstKey, setMwstKey] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [bruttobetrag, setBruttobetrag] = useState('');
  const [rechnungsdatum, setRechnungsdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState('');
  const [statusRechnungKey] = useState(STATUS_RECHNUNG_OPTIONS[0]?.key ?? 'offen');
  const [rechnungBusy, setRechnungBusy] = useState(false);
  const [rechnungError, setRechnungError] = useState<string | null>(null);
  const [newRechnungId, setNewRechnungId] = useState<string | null>(null);

  // Step 4: PDF-Datensatz
  const [pdfRechnungsnummer, setPdfRechnungsnummer] = useState('');
  const [pdfKundeVorname, setPdfKundeVorname] = useState('');
  const [pdfKundeNachname, setPdfKundeNachname] = useState('');
  const [pdfNettobetrag, setPdfNettobetrag] = useState('');
  const [pdfBruttobetrag, setPdfBruttobetrag] = useState('');
  const [pdfDatei, setPdfDatei] = useState<File | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [finalRechnungsnummer, setFinalRechnungsnummer] = useState('');

  // Step state — read ?step= from URL handled by IntentWizardShell
  const [step, setStep] = useState(1);

  const offeneAuftraege = auftraege.filter(
    (a: Auftraege) => a.fields.status?.key === 'offen' || a.fields.status?.key === 'in_bearbeitung'
  );

  const selectedAuftrag = selectedAuftragId
    ? auftraege.find(a => a.record_id === selectedAuftragId) ?? null
    : null;

  const selectedKundeId = selectedAuftrag?.fields.kunde
    ? extractRecordId(selectedAuftrag.fields.kunde)
    : null;

  const selectedKunde = selectedKundeId
    ? kunden.find(k => k.record_id === selectedKundeId) ?? null
    : null;

  const selectedFahrzeugId = selectedAuftrag?.fields.fahrzeug
    ? extractRecordId(selectedAuftrag.fields.fahrzeug)
    : null;

  const selectedFahrzeug = selectedFahrzeugId
    ? fahrzeuge.find(f => f.record_id === selectedFahrzeugId) ?? null
    : null;

  const handleAuftragSelect = useCallback((id: string) => {
    setSelectedAuftragId(id);
    setStep(2);
  }, []);

  const handleCloseAuftrag = async () => {
    if (!selectedAuftragId) return;
    setClosingBusy(true);
    setClosingError(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftragId, {
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
  };

  const handleNettoChange = (val: string) => {
    setNettobetrag(val);
    const net = parseFloat(val);
    if (!isNaN(net)) {
      const rate = getMwstRate(mwstKey);
      setBruttobetrag((net * (1 + rate)).toFixed(2));
    } else {
      setBruttobetrag('');
    }
  };

  const handleMwstChange = (key: string) => {
    setMwstKey(key);
    const net = parseFloat(nettobetrag);
    if (!isNaN(net)) {
      const rate = getMwstRate(key);
      setBruttobetrag((net * (1 + rate)).toFixed(2));
    }
  };

  const handleCreateRechnung = async () => {
    if (!selectedAuftragId || !rechnungsnummer || !nettobetrag || !bruttobetrag || !rechnungsdatum || !faelligkeitsdatum) return;
    setRechnungBusy(true);
    setRechnungError(null);

    // Idempotency guard: skip create if already done
    let rechnungId = newRechnungId;
    try {
      if (!rechnungId) {
        const result = await LivingAppsService.createRechnungenEntry({
          rechnungsnummer,
          auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftragId),
          kunde: selectedKundeId ? createRecordUrl(APP_IDS.KUNDEN, selectedKundeId) : undefined,
          nettobetrag: parseFloat(nettobetrag),
          mwst_satz: mwstKey,
          bruttobetrag: parseFloat(bruttobetrag),
          rechnungsdatum,
          faelligkeitsdatum,
          status_rechnung: statusRechnungKey,
        });
        rechnungId = result.record_id;
        setNewRechnungId(rechnungId);
      }
      // Pre-fill PDF step
      setPdfRechnungsnummer(rechnungsnummer);
      setPdfKundeVorname(selectedKunde?.fields.vorname ?? '');
      setPdfKundeNachname(selectedKunde?.fields.nachname ?? '');
      setPdfNettobetrag(nettobetrag);
      setPdfBruttobetrag(bruttobetrag);
      setFinalRechnungsnummer(rechnungsnummer);
      await fetchAll();
      setStep(4);
    } catch (e) {
      setRechnungError(e instanceof Error ? e.message : String(e));
    } finally {
      setRechnungBusy(false);
    }
  };

  const handleCreatePdf = async () => {
    if (!newRechnungId || !pdfRechnungsnummer) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      await LivingAppsService.createRechnungsPdfErstellenEntry({
        rechnung: createRecordUrl(APP_IDS.RECHNUNGEN, newRechnungId),
        pdf_rechnungsnummer: pdfRechnungsnummer,
        pdf_kunde_vorname: pdfKundeVorname || undefined,
        pdf_kunde_nachname: pdfKundeNachname || undefined,
        pdf_nettobetrag: pdfNettobetrag ? parseFloat(pdfNettobetrag) : undefined,
        pdf_bruttobetrag: pdfBruttobetrag ? parseFloat(pdfBruttobetrag) : undefined,
      });
      await fetchAll();
      setDone(true);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleReset = () => {
    setSelectedAuftragId(null);
    setBemerkungen('');
    setClosingError(null);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstKey(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setBruttobetrag('');
    setRechnungsdatum(format(new Date(), 'yyyy-MM-dd'));
    setFaelligkeitsdatum('');
    setRechnungBusy(false);
    setRechnungError(null);
    setNewRechnungId(null);
    setPdfRechnungsnummer('');
    setPdfKundeVorname('');
    setPdfKundeNachname('');
    setPdfNettobetrag('');
    setPdfBruttobetrag('');
    setPdfDatei(null);
    setPdfError(null);
    setDone(false);
    setFinalRechnungsnummer('');
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Auftrag abschließen')}
      subtitle={tx('Auftrag abschließen, Rechnung erstellen und PDF anlegen')}
      steps={[
        { label: tx('Auftrag wählen') },
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
      {/* ───── Schritt 1: Auftrag wählen ───── */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAuftraege.map(a => {
            const kundeId = a.fields.kunde ? extractRecordId(a.fields.kunde) : null;
            const fahrzeugId = a.fields.fahrzeug ? extractRecordId(a.fields.fahrzeug) : null;
            const kunde = kundeId ? kunden.find(k => k.record_id === kundeId) : null;
            const fahrzeug = fahrzeugId ? fahrzeuge.find(f => f.record_id === fahrzeugId) : null;
            const kundeName = kunde
              ? `${kunde.fields.vorname ?? ''} ${kunde.fields.nachname ?? ''}`.trim()
              : '';
            return {
              id: a.record_id,
              title: a.fields.auftragsnummer ?? a.record_id,
              subtitle: [kundeName, fahrzeug?.fields.kennzeichen].filter(Boolean).join(' · '),
              status: a.fields.status
                ? { key: a.fields.status.key, label: a.fields.status.label }
                : undefined,
              icon: <IconClipboardCheck size={20} className="text-primary" />,
            };
          })}
          onSelect={handleAuftragSelect}
          searchPlaceholder={tx('Auftrag suchen …')}
          emptyText={tx('Keine offenen oder in Bearbeitung befindlichen Aufträge')}
        />
      )}

      {/* ───── Schritt 2: Auftrag abschließen ───── */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6 max-w-lg">
            {/* Zusammenfassung */}
            <div className="rounded-2xl border bg-card p-5 space-y-3 overflow-hidden">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground truncate">
                  {selectedAuftrag.fields.auftragsnummer ?? tx('Auftrag')}
                </h3>
                {selectedAuftrag.fields.status && (
                  <StatusBadge
                    statusKey={selectedAuftrag.fields.status.key}
                    label={selectedAuftrag.fields.status.label}
                  />
                )}
              </div>
              {selectedKunde && (
                <p className="text-sm text-muted-foreground">
                  {tx('Kunde')}: {selectedKunde.fields.vorname} {selectedKunde.fields.nachname}
                </p>
              )}
              {selectedFahrzeug && (
                <p className="text-sm text-muted-foreground">
                  {tx('Fahrzeug')}: {selectedFahrzeug.fields.kennzeichen} — {selectedFahrzeug.fields.marke} {selectedFahrzeug.fields.modell}
                </p>
              )}
              {selectedAuftrag.fields.arbeitsbeschreibung && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {selectedAuftrag.fields.arbeitsbeschreibung}
                </p>
              )}
              {selectedAuftrag.fields.wunschtermin && (
                <p className="text-sm text-muted-foreground">
                  {tx('Wunschtermin')}: {selectedAuftrag.fields.wunschtermin}
                </p>
              )}
            </div>

            {/* Abschluss-Notiz */}
            <div className="space-y-2">
              <Label htmlFor="bemerkungen">{tx('Abschluss-Notiz (optional)')}</Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungen}
                onChange={e => setBemerkungen(e.target.value)}
                placeholder={tx('Arbeiten abgeschlossen, Fahrzeug übergeben …')}
                rows={3}
                className="w-full"
              />
            </div>

            {closingError && (
              <p className="text-sm text-destructive">{closingError}</p>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleCloseAuftrag}
                disabled={closingBusy}
                className="flex-1"
              >
                <IconCheck size={16} stroke={2} className="mr-2" />
                {closingBusy ? tx('Wird abgeschlossen …') : tx('Auftrag abschließen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt benötigt einen ausgewählten Auftrag.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* ───── Schritt 3: Rechnung erstellen ───── */}
      {step === 3 && (
        selectedAuftragId ? (
          <div className="space-y-6 max-w-lg">
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-1 overflow-hidden">
              <p className="text-sm font-medium text-foreground">
                {tx('Auftrag')}: {selectedAuftrag?.fields.auftragsnummer ?? selectedAuftragId}
              </p>
              {selectedKunde && (
                <p className="text-sm text-muted-foreground">
                  {selectedKunde.fields.vorname} {selectedKunde.fields.nachname}
                </p>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rechnungsnummer">{tx('Rechnungsnummer')} *</Label>
                <Input
                  id="rechnungsnummer"
                  value={rechnungsnummer}
                  onChange={e => setRechnungsnummer(e.target.value)}
                  placeholder={tx('RE-2026-001')}
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nettobetrag">{tx('Nettobetrag (€)')} *</Label>
                  <Input
                    id="nettobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={nettobetrag}
                    onChange={e => handleNettoChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{tx('MwSt.-Satz')} *</Label>
                  <div className="flex flex-wrap gap-2">
                    {MWST_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => handleMwstChange(opt.key)}
                        className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                          mwstKey === opt.key
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card text-foreground border-border hover:bg-secondary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bruttobetrag">{tx('Bruttobetrag (€)')} *</Label>
                <Input
                  id="bruttobetrag"
                  type="number"
                  min="0"
                  step="0.01"
                  value={bruttobetrag}
                  onChange={e => setBruttobetrag(e.target.value)}
                  placeholder="0.00"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">{tx('Automatisch berechnet, aber editierbar')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rechnungsdatum">{tx('Rechnungsdatum')} *</Label>
                  <Input
                    id="rechnungsdatum"
                    type="date"
                    value={rechnungsdatum}
                    onChange={e => setRechnungsdatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="faelligkeitsdatum">{tx('Fälligkeitsdatum')} *</Label>
                  <Input
                    id="faelligkeitsdatum"
                    type="date"
                    value={faelligkeitsdatum}
                    onChange={e => setFaelligkeitsdatum(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{tx('Rechnungsstatus')}</Label>
                <Select value={statusRechnungKey} disabled>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_RECHNUNG_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{tx('Wird als "Offen" angelegt')}</p>
              </div>
            </div>

            {/* Live-Zusammenfassung Betrag */}
            {nettobetrag && bruttobetrag && (
              <div className="rounded-2xl border bg-secondary/40 p-4 space-y-1 overflow-hidden">
                <p className="text-sm font-medium text-foreground">{tx('Zusammenfassung')}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{tx('Netto')}</span>
                  <span>{parseFloat(nettobetrag).toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {MWST_OPTIONS.find(o => o.key === mwstKey)?.label ?? mwstKey}
                  </span>
                  <span>{(parseFloat(bruttobetrag) - parseFloat(nettobetrag)).toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-1">
                  <span>{tx('Brutto')}</span>
                  <span>{parseFloat(bruttobetrag).toFixed(2)} €</span>
                </div>
              </div>
            )}

            {rechnungError && (
              <p className="text-sm text-destructive">{rechnungError}</p>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={() => setStep(2)}>
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleCreateRechnung}
                disabled={
                  rechnungBusy ||
                  !rechnungsnummer ||
                  !nettobetrag ||
                  !bruttobetrag ||
                  !rechnungsdatum ||
                  !faelligkeitsdatum
                }
                className="flex-1"
              >
                <IconFileInvoice size={16} stroke={2} className="mr-2" />
                {rechnungBusy ? tx('Wird erstellt …') : tx('Rechnung erstellen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt benötigt einen abgeschlossenen Auftrag aus Schritt 1 und 2.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* ───── Schritt 4: PDF-Datensatz anlegen ───── */}
      {step === 4 && (
        done ? (
          <div className="text-center py-12 space-y-6 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <IconCheck size={32} stroke={2} className="text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                {tx('Vorgang abgeschlossen')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {tx('Rechnung')} <span className="font-medium">{finalRechnungsnummer}</span> {tx('wurde erstellt und der PDF-Datensatz angelegt.')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" onClick={handleReset}>
                {tx('Weiteren Auftrag abschließen')}
              </Button>
              <a href="#/">
                <Button className="w-full sm:w-auto">
                  {tx('Zurück zum Dashboard')}
                </Button>
              </a>
            </div>
          </div>
        ) : newRechnungId ? (
          <div className="space-y-6 max-w-lg">
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-1 overflow-hidden">
              <p className="text-sm font-medium text-foreground">
                {tx('Rechnung')}: {rechnungsnummer}
              </p>
              <p className="text-sm text-muted-foreground">
                {tx('Netto')}: {nettobetrag} € · {tx('Brutto')}: {bruttobetrag} €
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pdfRechnungsnummer">{tx('Rechnungsnummer (PDF)')} *</Label>
                <Input
                  id="pdfRechnungsnummer"
                  value={pdfRechnungsnummer}
                  onChange={e => setPdfRechnungsnummer(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pdfVorname">{tx('Vorname Kunde')}</Label>
                  <Input
                    id="pdfVorname"
                    value={pdfKundeVorname}
                    onChange={e => setPdfKundeVorname(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pdfNachname">{tx('Nachname Kunde')}</Label>
                  <Input
                    id="pdfNachname"
                    value={pdfKundeNachname}
                    onChange={e => setPdfKundeNachname(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pdfNetto">{tx('Nettobetrag (€)')}</Label>
                  <Input
                    id="pdfNetto"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pdfNettobetrag}
                    onChange={e => setPdfNettobetrag(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pdfBrutto">{tx('Bruttobetrag (€)')}</Label>
                  <Input
                    id="pdfBrutto"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pdfBruttobetrag}
                    onChange={e => setPdfBruttobetrag(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pdfDatei">{tx('PDF-Datei hochladen')}</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="pdfDatei"
                    type="file"
                    accept=".pdf"
                    onChange={e => setPdfDatei(e.target.files?.[0] ?? null)}
                    className="w-full"
                  />
                  {pdfDatei && (
                    <IconFileUpload size={20} stroke={2} className="text-primary shrink-0" />
                  )}
                </div>
              </div>
            </div>

            {pdfError && (
              <p className="text-sm text-destructive">{pdfError}</p>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={() => setStep(3)}>
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleCreatePdf}
                disabled={pdfBusy || !pdfRechnungsnummer}
                className="flex-1"
              >
                <IconFileUpload size={16} stroke={2} className="mr-2" />
                {pdfBusy ? tx('Wird angelegt …') : tx('PDF-Datensatz anlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt benötigt eine erstellte Rechnung aus Schritt 3.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
