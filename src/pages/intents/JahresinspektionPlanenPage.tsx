/**
 * Jahresinspektion Planen — 2-Schritt-Wizard.
 * Steps: 1) Fahrzeug wählen → 2) Inspektionsdetails erfassen & anlegen.
 * Reads: fahrzeuge (EnrichedFahrzeuge[]). Writes: jahresinspektion_planen (createJahresinspektionPlanenEntry).
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
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { IconCar, IconCalendarCheck, IconCheck } from '@tabler/icons-react';

export default function JahresinspektionPlanenPage() {
  const { fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<EnrichedFahrzeuge | null>(null);
  const [wunschtermin, setWunschtermin] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleFahrzeugSelect = (id: string) => {
    const fz = (fahrzeuge as EnrichedFahrzeuge[]).find(f => f.record_id === id) ?? null;
    setSelectedFahrzeug(fz);
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedFahrzeug || !wunschtermin || !arbeitsbeschreibung) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.createJahresinspektionPlanenEntry({
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
        wunschtermin_inspektion: wunschtermin,
        arbeitsbeschreibung_inspektion: arbeitsbeschreibung,
        bemerkungen_inspektion: bemerkungen || undefined,
      });
      await fetchAll();
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Fehler beim Speichern'));
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
    setDone(false);
    setStep(1);
  };

  const canSubmit = !!selectedFahrzeug && !!wunschtermin && !!arbeitsbeschreibung;

  return (
    <IntentWizardShell
      title={tx('Jahresinspektion planen')}
      subtitle={tx('Fahrzeug wählen und Inspektionstermin erfassen')}
      steps={[{ label: tx('Fahrzeug') }, { label: tx('Details') }]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {step === 1 && (
        <EntitySelectStep
          items={(fahrzeuge as EnrichedFahrzeuge[]).map(fz => ({
            id: fz.record_id,
            title: [fz.fields.kennzeichen, fz.fields.marke, fz.fields.modell].filter(Boolean).join(' · '),
            subtitle: [
              fz.fields.baujahr ? tx`Bj. ${fz.fields.baujahr}` : undefined,
              fz.fields.kilometerstand != null ? tx`${fz.fields.kilometerstand.toLocaleString('de-DE')} km` : undefined,
              fz.kundeName ? fz.kundeName : undefined,
            ].filter(Boolean).join(' · '),
            icon: <IconCar size={20} className="text-primary" />,
          }))}
          onSelect={handleFahrzeugSelect}
          searchPlaceholder={tx('Kennzeichen, Marke oder Modell suchen …')}
          emptyText={tx('Keine Fahrzeuge gefunden')}
        />
      )}

      {step === 2 && (
        selectedFahrzeug ? (
          done ? (
            <div className="flex flex-col items-center py-16 space-y-6">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCheck size={40} className="text-primary" />
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-semibold">{tx('Inspektion geplant!')}</h2>
                <p className="text-muted-foreground">
                  {tx`Jahresinspektion für ${selectedFahrzeug.fields.kennzeichen ?? selectedFahrzeug.fields.marke ?? ''} wurde erfolgreich angelegt.`}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                <Button className="flex-1" onClick={handleReset}>
                  {tx('Neue Inspektion planen')}
                </Button>
                <Button variant="outline" className="flex-1" asChild>
                  <a href="#/">{tx('Zurück zum Dashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 max-w-xl">
              {/* Fahrzeug-Kontext */}
              <div className="rounded-2xl border bg-card p-4 flex items-start gap-3 overflow-hidden">
                <div className="rounded-xl bg-primary/10 p-2 shrink-0">
                  <IconCar size={20} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">
                    {[selectedFahrzeug.fields.kennzeichen, selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {[
                      selectedFahrzeug.fields.baujahr ? tx`Bj. ${selectedFahrzeug.fields.baujahr}` : undefined,
                      selectedFahrzeug.fields.kilometerstand != null ? tx`${selectedFahrzeug.fields.kilometerstand.toLocaleString('de-DE')} km` : undefined,
                      selectedFahrzeug.kundeName || undefined,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 ml-auto"
                  onClick={() => setStep(1)}
                >
                  {tx('Ändern')}
                </Button>
              </div>

              {/* Inspektionsdetails-Formular */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <IconCalendarCheck size={15} className="text-muted-foreground" />
                    {tx('Wunschtermin')}
                    <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="datetime-local"
                    value={wunschtermin}
                    onChange={e => setWunschtermin(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {tx('Arbeitsbeschreibung')}
                    <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    value={arbeitsbeschreibung}
                    onChange={e => setArbeitsbeschreibung(e.target.value)}
                    placeholder={tx('z.B. Jahresinspektion inkl. Ölwechsel, Bremsencheck …')}
                    rows={3}
                    className="w-full resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">
                    {tx('Bemerkungen')}
                  </label>
                  <Textarea
                    value={bemerkungen}
                    onChange={e => setBemerkungen(e.target.value)}
                    placeholder={tx('Optionale Hinweise …')}
                    rows={2}
                    className="w-full resize-none"
                  />
                </div>
              </div>

              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="flex-1"
                  disabled={!canSubmit || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? tx('Wird gespeichert …') : tx('Inspektion anlegen')}
                </Button>
                <Button variant="outline" onClick={() => setStep(1)}>
                  {tx('Zurück')}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt erfordert ein ausgewähltes Fahrzeug.')}
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
