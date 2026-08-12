/**
 * Jahresinspektion planen — 2-Schritt-Wizard.
 * Steps: 1) Fahrzeug wählen → 2) Inspektionstermin erfassen & anlegen.
 * Reads: fahrzeuge (mit kundeName). Writes: jahresinspektion_planen (createJahresinspektionPlanenEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { tx } from '@/i18n';
import { APP_IDS } from '@/types/app';
import type { EnrichedFahrzeuge } from '@/types/enriched';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { IconCar, IconCalendarCheck, IconCheck } from '@tabler/icons-react';

export default function JahresinspektionPlanenPage() {
  const STEPS = [
  { label: tx('Fahrzeug') },
  { label: tx('Inspektion') },
];

  const { fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<EnrichedFahrzeuge | null>(null);

  // Step 2 form state
  const [wunschtermin, setWunschtermin] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const handleFahrzeugSelect = (id: string) => {
    const fahrzeug = fahrzeuge.find((f) => f.record_id === id) as EnrichedFahrzeuge | undefined;
    if (fahrzeug) {
      setSelectedFahrzeug(fahrzeug);
      setStep(2);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFahrzeug || !wunschtermin || !arbeitsbeschreibung) return;

    // Idempotency guard — don't re-create if already succeeded
    if (createdId) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await LivingAppsService.createJahresinspektionPlanenEntry({
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
        wunschtermin_inspektion: wunschtermin,
        arbeitsbeschreibung_inspektion: arbeitsbeschreibung,
        bemerkungen_inspektion: bemerkungen || undefined,
      });
      setCreatedId(result.record_id);
      await fetchAll();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tx('Unbekannter Fehler'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedFahrzeug(null);
    setWunschtermin('');
    setArbeitsbeschreibung('');
    setBemerkungen('');
    setSubmitError(null);
    setCreatedId(null);
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Jahresinspektion planen')}
      subtitle={tx('Fahrzeug auswählen und Inspektionstermin festlegen')}
      steps={STEPS}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Fahrzeug wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={(fahrzeuge as EnrichedFahrzeuge[]).map((f) => ({
            id: f.record_id,
            title: [f.fields.kennzeichen, f.fields.marke, f.fields.modell].filter(Boolean).join(' · ') || f.record_id,
            subtitle: [
              f.fields.baujahr ? `${tx('Baujahr')} ${f.fields.baujahr}` : null,
              f.fields.kilometerstand != null ? `${f.fields.kilometerstand.toLocaleString('de-DE')} km` : null,
              f.kundeName ? f.kundeName : null,
            ]
              .filter(Boolean)
              .join(' · '),
            icon: <IconCar size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleFahrzeugSelect}
          searchPlaceholder={tx('Kennzeichen, Marke oder Modell suchen …')}
          emptyText={tx('Kein Fahrzeug gefunden')}
          emptyIcon={<IconCar size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* Step 2: Inspektion planen */}
      {step === 2 && (
        selectedFahrzeug ? (
          <div className="space-y-6">
            {/* Fahrzeug-Info (read-only) */}
            <div className="rounded-2xl border bg-secondary/50 p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {tx('Fahrzeug')}
              </p>
              <p className="font-semibold text-foreground">
                {[selectedFahrzeug.fields.kennzeichen, selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {selectedFahrzeug.kundeName && (
                <p className="text-sm text-muted-foreground">{selectedFahrzeug.kundeName}</p>
              )}
            </div>

            {/* Erfolgsanzeige */}
            {createdId ? (
              <div className="rounded-2xl border bg-card p-6 text-center space-y-4">
                <div className="flex justify-center">
                  <div className="rounded-full bg-primary/10 p-4">
                    <IconCheck size={32} className="text-primary" stroke={2} />
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-foreground text-lg">{tx('Inspektion geplant!')}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tx('Der Inspektionstermin wurde erfolgreich angelegt.')}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Button onClick={handleReset} variant="outline">
                    {tx('Weitere Inspektion planen')}
                  </Button>
                  <Button asChild>
                    <a href="#/">{tx('Zurück zum Dashboard')}</a>
                  </Button>
                </div>
              </div>
            ) : (
              /* Inline Mini-Form */
              <div className="rounded-2xl border bg-card p-5 space-y-5">
                <div className="flex items-center gap-2 text-foreground">
                  <IconCalendarCheck size={20} className="text-primary" stroke={1.5} />
                  <span className="font-semibold">{tx('Inspektionsdaten')}</span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="wunschtermin">
                      {tx('Wunschtermin')} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="wunschtermin"
                      type="datetime-local"
                      value={wunschtermin}
                      onChange={(e) => setWunschtermin(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="arbeitsbeschreibung">
                      {tx('Geplante Arbeiten')} <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="arbeitsbeschreibung"
                      value={arbeitsbeschreibung}
                      onChange={(e) => setArbeitsbeschreibung(e.target.value)}
                      placeholder={tx('Was soll bei der Inspektion gemacht werden?')}
                      rows={3}
                      className="w-full resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="bemerkungen">{tx('Bemerkungen')}</Label>
                    <Textarea
                      id="bemerkungen"
                      value={bemerkungen}
                      onChange={(e) => setBemerkungen(e.target.value)}
                      placeholder={tx('Optionale Hinweise …')}
                      rows={2}
                      className="w-full resize-none"
                    />
                  </div>
                </div>

                {submitError && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                    {submitError}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="sm:w-auto"
                  >
                    {tx('Zurück')}
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!wunschtermin || !arbeitsbeschreibung || submitting}
                    className="flex-1"
                  >
                    {submitting ? tx('Wird gespeichert …') : tx('Inspektion anlegen')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht ein ausgewähltes Fahrzeug aus Schritt 1.')}
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
