/**
 * Auftrag abschließen & Rechnung erstellen — 3-Schritt-Wizard.
 * Steps: 1) Auftrag auswählen (nur offen/in_bearbeitung) → 2) Auftrag abschließen (Status + Notiz) → 3) Rechnung erstellen.
 * Reads: auftraege (EnrichedAuftraege). Writes: auftraege (updateAuftraegeEntry), rechnungen (createRechnungenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useCallback } from 'react';
import { format, addDays } from 'date-fns';
import { IconCheck, IconFileInvoice, IconAlertCircle } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { EnrichedAuftraege } from '@/types/enriched';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const STATUS_RECHNUNG_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

function computeBrutto(netto: number, mwstKey: string): number {
  if (mwstKey === 'mwst_19') return Math.round(netto * 1.19 * 100) / 100;
  if (mwstKey === 'mwst_7') return Math.round(netto * 1.07 * 100) / 100;
  return netto;
}

export default function AuftragAbschliessenPage() {
  const { auftraege, loading, error, fetchAll } = useDashboardData();

  const today = format(new Date(), 'yyyy-MM-dd');
  const in14Days = format(addDays(new Date(), 14), 'yyyy-MM-dd');

  const [step, setStep] = useState(1);
  const [selectedAuftrag, setSelectedAuftrag] = useState<EnrichedAuftraege | null>(null);

  // Step 2 state
  const [bemerkungen, setBemerkungen] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeDone, setCloseDone] = useState(false);

  // Step 3 state
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettoStr, setNettoStr] = useState('');
  const [mwstKey, setMwstKey] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [bruttoStr, setBruttoStr] = useState('');
  const [bruttoManual, setBruttoManual] = useState(false);
  const [rechnungsdatum, setRechnungsdatum] = useState(today);
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState(in14Days);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdRechnungId, setCreatedRechnungId] = useState<string | null>(null);
  const [createdRechnungsnummer, setCreatedRechnungsnummer] = useState('');
  const [createdBrutto, setCreatedBrutto] = useState(0);

  const offeneAuftraege = (auftraege as EnrichedAuftraege[]).filter(
    (a) => a.fields.status?.key === 'offen' || a.fields.status?.key === 'in_bearbeitung'
  );

  const handleSelectAuftrag = useCallback(
    (id: string) => {
      const found = offeneAuftraege.find((a) => a.record_id === id) ?? null;
      setSelectedAuftrag(found);
      setCloseDone(false);
      setCloseError(null);
      setBemerkungen('');
      setStep(2);
    },
    [offeneAuftraege]
  );

  const handleCloseAuftrag = async () => {
    if (!selectedAuftrag) return;
    setClosing(true);
    setCloseError(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftrag.record_id, {
        status: 'abgeschlossen',
        bemerkungen_auftrag: bemerkungen || undefined,
      });
      await fetchAll();
      setCloseDone(true);
      setTimeout(() => setStep(3), 800);
    } catch (e: unknown) {
      setCloseError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setClosing(false);
    }
  };

  const handleNettoChange = (val: string) => {
    setNettoStr(val);
    if (!bruttoManual) {
      const n = parseFloat(val);
      if (!isNaN(n)) {
        setBruttoStr(String(computeBrutto(n, mwstKey)));
      } else {
        setBruttoStr('');
      }
    }
  };

  const handleMwstChange = (key: string) => {
    setMwstKey(key);
    if (!bruttoManual) {
      const n = parseFloat(nettoStr);
      if (!isNaN(n)) {
        setBruttoStr(String(computeBrutto(n, key)));
      }
    }
  };

  const handleBruttoChange = (val: string) => {
    setBruttoStr(val);
    setBruttoManual(true);
  };

  const handleCreateRechnung = async () => {
    if (!selectedAuftrag) return;
    if (createdRechnungId) return; // idempotency guard

    const netto = parseFloat(nettoStr);
    const brutto = parseFloat(bruttoStr);
    if (!rechnungsnummer || isNaN(netto) || isNaN(brutto) || !rechnungsdatum || !faelligkeitsdatum) return;

    const kundeId = selectedAuftrag.fields.kunde ? extractRecordId(selectedAuftrag.fields.kunde) : null;
    const kundeUrl = kundeId ? createRecordUrl(APP_IDS.KUNDEN, kundeId) : undefined;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await LivingAppsService.createRechnungenEntry({
        rechnungsnummer,
        auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftrag.record_id),
        kunde: kundeUrl,
        nettobetrag: netto,
        mwst_satz: mwstKey,
        bruttobetrag: brutto,
        rechnungsdatum,
        faelligkeitsdatum,
        status_rechnung: STATUS_RECHNUNG_OPTIONS[0]?.key ?? 'offen',
      });
      await fetchAll();
      setCreatedRechnungId(result.record_id);
      setCreatedRechnungsnummer(rechnungsnummer);
      setCreatedBrutto(brutto);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedAuftrag(null);
    setBemerkungen('');
    setCloseDone(false);
    setCloseError(null);
    setRechnungsnummer('');
    setNettoStr('');
    setBruttoStr('');
    setBruttoManual(false);
    setMwstKey(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setRechnungsdatum(today);
    setFaelligkeitsdatum(in14Days);
    setSubmitError(null);
    setCreatedRechnungId(null);
    setCreatedRechnungsnummer('');
    setCreatedBrutto(0);
    setStep(1);
  };

  const canCreateRechnung =
    !!rechnungsnummer &&
    !!nettoStr &&
    !isNaN(parseFloat(nettoStr)) &&
    !!bruttoStr &&
    !isNaN(parseFloat(bruttoStr)) &&
    !!rechnungsdatum &&
    !!faelligkeitsdatum;

  return (
    <IntentWizardShell
      title="Auftrag abschließen"
      subtitle="Auftrag fertigstellen und Rechnung erstellen"
      steps={[{ label: 'Auftrag' }, { label: 'Abschließen' }, { label: 'Rechnung' }]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Auftrag auswählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAuftraege.map((a) => ({
            id: a.record_id,
            title: a.fields.auftragsnummer ?? a.record_id,
            subtitle: a.fields.arbeitsbeschreibung
              ? a.fields.arbeitsbeschreibung.length > 80
                ? a.fields.arbeitsbeschreibung.slice(0, 80) + '…'
                : a.fields.arbeitsbeschreibung
              : a.kundeName,
            status: a.fields.status
              ? { key: a.fields.status.key, label: a.fields.status.label }
              : undefined,
            icon: <IconFileInvoice size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectAuftrag}
          searchPlaceholder="Auftrag suchen…"
          emptyText="Keine offenen Aufträge gefunden"
        />
      )}

      {/* ── Step 2: Auftrag abschließen ── */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6">
            {/* Summary */}
            <div className="rounded-2xl border bg-card p-5 space-y-3 overflow-hidden">
              <h2 className="font-semibold text-base text-foreground">Auftragsdetails</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Auftragsnummer</span>
                  <p className="font-medium truncate">{selectedAuftrag.fields.auftragsnummer ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p>
                    <StatusBadge
                      statusKey={selectedAuftrag.fields.status?.key}
                      label={selectedAuftrag.fields.status?.label}
                    />
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Kunde</span>
                  <p className="font-medium truncate">{selectedAuftrag.kundeName || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Fahrzeug</span>
                  <p className="font-medium truncate">{selectedAuftrag.fahrzeugName || '—'}</p>
                </div>
                {selectedAuftrag.fields.arbeitsbeschreibung && (
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground">Arbeitsbeschreibung</span>
                    <p className="text-foreground line-clamp-2">{selectedAuftrag.fields.arbeitsbeschreibung}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Abschlussnotiz */}
            <div className="space-y-2">
              <Label htmlFor="bemerkungen">Abschlussnotiz (optional)</Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungen}
                onChange={(e) => setBemerkungen(e.target.value)}
                placeholder="z. B. Alle Arbeiten abgeschlossen, Fahrzeug übergeben…"
                rows={3}
              />
            </div>

            {/* Feedback */}
            {closeDone && (
              <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-green-700 text-sm">
                <IconCheck size={18} stroke={2} />
                <span>Auftrag erfolgreich abgeschlossen. Weiter zur Rechnung…</span>
              </div>
            )}
            {closeError && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-destructive text-sm">
                <IconAlertCircle size={18} stroke={2} />
                <span>{closeError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={() => setStep(1)} disabled={closing || closeDone}>
                Zurück
              </Button>
              <Button onClick={handleCloseAuftrag} disabled={closing || closeDone} className="flex-1">
                {closing ? 'Auftrag wird abgeschlossen…' : 'Auftrag abschließen'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">Dieser Schritt braucht die Auswahl aus Schritt 1.</p>
            <Button variant="outline" onClick={() => setStep(1)}>Neu starten</Button>
          </div>
        )
      )}

      {/* ── Step 3: Rechnung erstellen ── */}
      {step === 3 && (
        selectedAuftrag ? (
          createdRechnungId ? (
            /* Success state */
            <div className="space-y-6">
              <div className="rounded-2xl border bg-card p-6 text-center space-y-3 overflow-hidden">
                <div className="flex justify-center">
                  <div className="rounded-full bg-green-100 p-4">
                    <IconCheck size={32} className="text-green-600" stroke={2} />
                  </div>
                </div>
                <h2 className="font-semibold text-lg text-foreground">Rechnung erstellt</h2>
                <p className="text-muted-foreground text-sm">
                  Rechnungsnummer: <span className="font-medium text-foreground">{createdRechnungsnummer}</span>
                </p>
                <p className="text-muted-foreground text-sm">
                  Bruttobetrag: <span className="font-semibold text-foreground text-base">{createdBrutto.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" onClick={handleReset} className="flex-1">
                  Neuen Auftrag abschließen
                </Button>
                <a href="#/" className="flex-1">
                  <Button className="w-full">Zurück zum Dashboard</Button>
                </a>
              </div>
            </div>
          ) : (
            /* Rechnung form */
            <div className="space-y-5">
              <div className="rounded-2xl border bg-card p-4 overflow-hidden">
                <p className="text-sm text-muted-foreground">
                  Auftrag <span className="font-medium text-foreground">{selectedAuftrag.fields.auftragsnummer ?? selectedAuftrag.record_id}</span>
                  {' '}— {selectedAuftrag.kundeName}
                </p>
              </div>

              {/* Rechnungsnummer */}
              <div className="space-y-1.5">
                <Label htmlFor="rechnungsnummer">Rechnungsnummer *</Label>
                <Input
                  id="rechnungsnummer"
                  value={rechnungsnummer}
                  onChange={(e) => setRechnungsnummer(e.target.value)}
                  placeholder="z. B. RE-2026-001"
                />
              </div>

              {/* Nettobetrag */}
              <div className="space-y-1.5">
                <Label htmlFor="nettobetrag">Nettobetrag (€) *</Label>
                <Input
                  id="nettobetrag"
                  type="number"
                  min="0"
                  step="0.01"
                  value={nettoStr}
                  onChange={(e) => handleNettoChange(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {/* MwSt-Satz */}
              <div className="space-y-2">
                <Label>MwSt.-Satz *</Label>
                <div className="flex flex-wrap gap-2">
                  {MWST_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handleMwstChange(opt.key)}
                      className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
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

              {/* Bruttobetrag */}
              <div className="space-y-1.5">
                <Label htmlFor="bruttobetrag">
                  Bruttobetrag (€) *
                  {!bruttoManual && nettoStr && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">automatisch berechnet</span>
                  )}
                </Label>
                <Input
                  id="bruttobetrag"
                  type="number"
                  min="0"
                  step="0.01"
                  value={bruttoStr}
                  onChange={(e) => handleBruttoChange(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {/* Rechnungsdatum */}
              <div className="space-y-1.5">
                <Label htmlFor="rechnungsdatum">Rechnungsdatum *</Label>
                <Input
                  id="rechnungsdatum"
                  type="date"
                  value={rechnungsdatum}
                  onChange={(e) => setRechnungsdatum(e.target.value)}
                />
              </div>

              {/* Fälligkeitsdatum */}
              <div className="space-y-1.5">
                <Label htmlFor="faelligkeitsdatum">Fälligkeitsdatum *</Label>
                <Input
                  id="faelligkeitsdatum"
                  type="date"
                  value={faelligkeitsdatum}
                  onChange={(e) => setFaelligkeitsdatum(e.target.value)}
                />
              </div>

              {submitError && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-destructive text-sm">
                  <IconAlertCircle size={18} stroke={2} />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                  Zurück
                </Button>
                <Button
                  onClick={handleCreateRechnung}
                  disabled={!canCreateRechnung || submitting}
                  className="flex-1"
                >
                  {submitting ? 'Rechnung wird erstellt…' : 'Rechnung erstellen'}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">Dieser Schritt braucht die Auswahl aus Schritt 1.</p>
            <Button variant="outline" onClick={() => setStep(1)}>Neu starten</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
