/**
 * Auftrag abschließen & Rechnung erstellen — 3-Schritt-Wizard.
 * Steps: 1) Offenen/laufenden Auftrag wählen → 2) Auftrag abschließen (Status-Update) → 3) Rechnung erstellen.
 * Reads: auftraege, fahrzeuge (via enrichment). Writes: auftraege (updateAuftraegeEntry), rechnungen (createRechnungenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  IconClipboardCheck,
  IconFileInvoice,
  IconAlertCircle,
  IconCircleCheck,
} from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { EnrichedAuftraege } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { tx } from '@/i18n';

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];

function mwstRate(key: string): number {
  if (key === 'mwst_19') return 0.19;
  if (key === 'mwst_7') return 0.07;
  return 0;
}

export default function AuftragAbschliessenPage() {
  const { auftraege, fahrzeugeMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAuftrag, setSelectedAuftrag] = useState<EnrichedAuftraege | null>(null);
  const [abschlussLoading, setAbschlussLoading] = useState(false);
  const [abschlussError, setAbschlussError] = useState<string | null>(null);

  // Schritt 3 — Rechnungsfelder
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstKey, setMwstKey] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [bruttoOverride, setBruttoOverride] = useState('');
  const [rechnungsdatum, setRechnungsdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState('');
  const [rechnungLoading, setRechnungLoading] = useState(false);
  const [rechnungError, setRechnungError] = useState<string | null>(null);
  const [erstellteRechnungsnummer, setErstellteRechnungsnummer] = useState<string | null>(null);
  const [erstellterBrutto, setErstellterBrutto] = useState<number | null>(null);
  // idempotency guard: store created rechnung id so retry doesn't duplicate
  const [erstellteRechnungId, setErstellteRechnungId] = useState<string | null>(null);

  // Nur offene und laufende Aufträge
  const offeneAuftraege = useMemo(
    () =>
      (auftraege as EnrichedAuftraege[]).filter(
        (a) => a.fields.status?.key === 'offen' || a.fields.status?.key === 'in_bearbeitung',
      ),
    [auftraege],
  );

  // Berechneter Brutto-Vorschlag
  const bruttoVorschlag = useMemo(() => {
    const netto = parseFloat(nettobetrag);
    if (isNaN(netto)) return '';
    return (netto * (1 + mwstRate(mwstKey))).toFixed(2);
  }, [nettobetrag, mwstKey]);

  const effectiveBrutto = bruttoOverride !== '' ? parseFloat(bruttoOverride) : parseFloat(bruttoVorschlag);

  async function handleAbschliessen() {
    if (!selectedAuftrag) return;
    setAbschlussLoading(true);
    setAbschlussError(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftrag.record_id, {
        status: 'abgeschlossen',
      });
      await fetchAll();
      setStep(3);
    } catch (e) {
      setAbschlussError(e instanceof Error ? e.message : tx('Fehler beim Abschließen des Auftrags'));
    } finally {
      setAbschlussLoading(false);
    }
  }

  async function handleRechnungErstellen() {
    if (!selectedAuftrag || !rechnungsnummer) return;
    setRechnungLoading(true);
    setRechnungError(null);
    try {
      // idempotency: only create if not yet done
      let rechnungId = erstellteRechnungId;
      if (!rechnungId) {
        const kundeId = selectedAuftrag.fields.kunde
          ? extractRecordId(selectedAuftrag.fields.kunde)
          : undefined;

        const result = await LivingAppsService.createRechnungenEntry({
          rechnungsnummer,
          nettobetrag: nettobetrag !== '' ? parseFloat(nettobetrag) : undefined,
          mwst_satz: mwstKey,
          bruttobetrag: !isNaN(effectiveBrutto) ? effectiveBrutto : undefined,
          rechnungsdatum,
          faelligkeitsdatum: faelligkeitsdatum !== '' ? faelligkeitsdatum : undefined,
          status_rechnung: 'offen',
          auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftrag.record_id),
          kunde: kundeId ? createRecordUrl(APP_IDS.KUNDEN, kundeId) : undefined,
        });
        rechnungId = result.record_id;
        setErstellteRechnungId(rechnungId);
        setErstellteRechnungsnummer(rechnungsnummer);
        setErstellterBrutto(!isNaN(effectiveBrutto) ? effectiveBrutto : null);
      }
      await fetchAll();
      setStep(4);
    } catch (e) {
      setRechnungError(e instanceof Error ? e.message : tx('Fehler beim Erstellen der Rechnung'));
    } finally {
      setRechnungLoading(false);
    }
  }

  function handleReset() {
    setStep(1);
    setSelectedAuftrag(null);
    setAbschlussError(null);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstKey(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setBruttoOverride('');
    setRechnungsdatum(format(new Date(), 'yyyy-MM-dd'));
    setFaelligkeitsdatum('');
    setRechnungError(null);
    setErstellteRechnungsnummer(null);
    setErstellterBrutto(null);
    setErstellteRechnungId(null);
  }

  return (
    <IntentWizardShell
      title={tx('Auftrag abschließen')}
      subtitle={tx('Auftrag abschließen und Rechnung erstellen')}
      steps={[
        { label: tx('Auftrag wählen') },
        { label: tx('Abschließen') },
        { label: tx('Rechnung erstellen') },
        { label: tx('Fertig') },
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
          items={offeneAuftraege.map((a) => {
            const fahrzeug = a.fields.fahrzeug
              ? fahrzeugeMap?.get(extractRecordId(a.fields.fahrzeug) ?? '')
              : undefined;
            return {
              id: a.record_id,
              title: a.fields.auftragsnummer ?? tx('Auftrag ohne Nummer'),
              subtitle: [
                a.fields.arbeitsbeschreibung,
                fahrzeug?.fields.kennzeichen,
              ]
                .filter(Boolean)
                .join(' · '),
              status: a.fields.status
                ? { key: a.fields.status.key, label: a.fields.status.label }
                : undefined,
              stats: a.fields.prioritaet
                ? [{ label: tx('Priorität'), value: a.fields.prioritaet.label }]
                : [],
              icon: <IconClipboardCheck size={20} className="text-primary" />,
            };
          })}
          onSelect={(id) => {
            const found = offeneAuftraege.find((a) => a.record_id === id) ?? null;
            setSelectedAuftrag(found);
            setStep(2);
          }}
          searchPlaceholder={tx('Auftrag suchen …')}
          emptyText={tx('Keine offenen oder laufenden Aufträge vorhanden')}
          emptyIcon={<IconClipboardCheck size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Schritt 2: Auftrag abschließen */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-6 space-y-4 overflow-hidden">
              <div className="flex items-center gap-3">
                <IconClipboardCheck size={24} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {selectedAuftrag.fields.auftragsnummer ?? tx('Auftrag ohne Nummer')}
                  </p>
                  {selectedAuftrag.fields.status && (
                    <StatusBadge
                      statusKey={selectedAuftrag.fields.status.key}
                      label={selectedAuftrag.fields.status.label}
                    />
                  )}
                </div>
              </div>

              {selectedAuftrag.fields.arbeitsbeschreibung && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    {tx('Arbeitsbeschreibung')}
                  </p>
                  <p className="text-sm text-foreground">
                    {selectedAuftrag.fields.arbeitsbeschreibung}
                  </p>
                </div>
              )}

              {selectedAuftrag.fields.wunschtermin && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    {tx('Wunschtermin')}
                  </p>
                  <p className="text-sm text-foreground">
                    {selectedAuftrag.fields.wunschtermin}
                  </p>
                </div>
              )}
            </div>

            {abschlussError && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <IconAlertCircle size={16} className="shrink-0" />
                {abschlussError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setStep(1)}
              >
                {tx('Zurück')}
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={handleAbschliessen}
                disabled={abschlussLoading}
              >
                {abschlussLoading ? tx('Wird abgeschlossen …') : tx('Auftrag abschließen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Schritt 3: Rechnung erstellen */}
      {step === 3 && (
        selectedAuftrag ? (
          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-4 flex items-center gap-3 overflow-hidden">
              <IconFileInvoice size={20} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {tx('Rechnung für Auftrag')}{' '}
                  <span className="text-primary">
                    {selectedAuftrag.fields.auftragsnummer ?? '—'}
                  </span>
                </p>
                <StatusBadge statusKey="abgeschlossen" label={tx('Abgeschlossen')} />
              </div>
            </div>

            <div className="space-y-4">
              {/* Rechnungsnummer */}
              <div className="space-y-1.5">
                <Label htmlFor="rechnungsnummer">
                  {tx('Rechnungsnummer')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rechnungsnummer"
                  value={rechnungsnummer}
                  onChange={(e) => setRechnungsnummer(e.target.value)}
                  placeholder={tx('z. B. RE-2026-001')}
                />
              </div>

              {/* Nettobetrag */}
              <div className="space-y-1.5">
                <Label htmlFor="nettobetrag">
                  {tx('Nettobetrag (€)')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="nettobetrag"
                  type="number"
                  min="0"
                  step="0.01"
                  value={nettobetrag}
                  onChange={(e) => {
                    setNettobetrag(e.target.value);
                    setBruttoOverride(''); // reset override when netto changes
                  }}
                  placeholder="0,00"
                />
              </div>

              {/* MwSt-Satz */}
              <div className="space-y-2">
                <Label>{tx('MwSt-Satz')} <span className="text-destructive">*</span></Label>
                <div className="flex flex-wrap gap-2">
                  {MWST_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setMwstKey(opt.key);
                        setBruttoOverride(''); // reset override when mwst changes
                      }}
                      className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
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
                <Label htmlFor="bruttobetrag">{tx('Bruttobetrag (€)')}</Label>
                <div className="space-y-1">
                  <Input
                    id="bruttobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={bruttoOverride !== '' ? bruttoOverride : bruttoVorschlag}
                    onChange={(e) => setBruttoOverride(e.target.value)}
                    placeholder="0,00"
                  />
                  {bruttoOverride === '' && bruttoVorschlag !== '' && (
                    <p className="text-xs text-muted-foreground">
                      {tx('Automatisch berechnet — du kannst den Wert überschreiben')}
                    </p>
                  )}
                </div>
              </div>

              {/* Rechnungsdatum */}
              <div className="space-y-1.5">
                <Label htmlFor="rechnungsdatum">
                  {tx('Rechnungsdatum')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rechnungsdatum"
                  type="date"
                  value={rechnungsdatum}
                  onChange={(e) => setRechnungsdatum(e.target.value)}
                />
              </div>

              {/* Fälligkeitsdatum */}
              <div className="space-y-1.5">
                <Label htmlFor="faelligkeitsdatum">{tx('Fälligkeitsdatum')}</Label>
                <Input
                  id="faelligkeitsdatum"
                  type="date"
                  value={faelligkeitsdatum}
                  onChange={(e) => setFaelligkeitsdatum(e.target.value)}
                />
              </div>
            </div>

            {rechnungError && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <IconAlertCircle size={16} className="shrink-0" />
                {rechnungError}
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
                disabled={rechnungLoading || !rechnungsnummer || !nettobetrag || !rechnungsdatum}
              >
                {rechnungLoading ? tx('Wird erstellt …') : tx('Rechnung erstellen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Schritt 4: Fertig */}
      {step === 4 && (
        erstellteRechnungsnummer ? (
          <div className="space-y-6 text-center py-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCircleCheck size={48} className="text-primary" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                {tx('Auftrag abgeschlossen & Rechnung erstellt')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {tx('Rechnungsnummer')}{': '}
                <span className="font-medium text-foreground">{erstellteRechnungsnummer}</span>
              </p>
              {erstellterBrutto !== null && (
                <p className="text-sm text-muted-foreground">
                  {tx('Bruttobetrag')}{': '}
                  <span className="font-medium text-foreground">
                    {erstellterBrutto.toLocaleString('de-DE', {
                      style: 'currency',
                      currency: 'EUR',
                    })}
                  </span>
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset} variant="outline">
                {tx('Weiteren Auftrag abschließen')}
              </Button>
              <Button asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
