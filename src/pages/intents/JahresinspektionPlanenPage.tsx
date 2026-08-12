/**
 * Jahresinspektion planen — 2-Schritt-Wizard.
 * Steps: 1) Fahrzeug wählen → 2) Inspektionsdetails erfassen & anlegen.
 * Reads: fahrzeuge. Writes: jahresinspektion_planen (createJahresinspektionPlanenEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconCar, IconCalendarCheck, IconCircleCheck } from '@tabler/icons-react';
import { tx } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Fahrzeuge } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';

export default function JahresinspektionPlanenPage() {
  const STEPS = [
  { label: tx('Fahrzeug') },
  { label: tx('Details') },
  { label: tx('Fertig') },
];

  const { fahrzeuge, fetchAll, loading, error } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<Fahrzeuge | null>(null);

  // Schritt 2: Formularfelder
  const [wunschtermin, setWunschtermin] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const handleFahrzeugSelect = (id: string) => {
    const f = fahrzeuge.find(fz => fz.record_id === id) ?? null;
    setSelectedFahrzeug(f);
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedFahrzeug || !wunschtermin || !arbeitsbeschreibung) return;

    // Idempotency: don't re-create if already saved
    if (createdId) {
      setStep(3);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const result = await LivingAppsService.createJahresinspektionPlanenEntry({
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
        wunschtermin_inspektion: wunschtermin,
        arbeitsbeschreibung_inspektion: arbeitsbeschreibung,
        bemerkungen_inspektion: bemerkungen || undefined,
      });
      setCreatedId(result.record_id);
      await fetchAll();
      setStep(3);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : tx('Fehler beim Speichern.'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedFahrzeug(null);
    setWunschtermin('');
    setArbeitsbeschreibung('');
    setBemerkungen('');
    setSaveError(null);
    setCreatedId(null);
  };

  const canSubmit = !!selectedFahrzeug && !!wunschtermin && !!arbeitsbeschreibung;

  return (
    <IntentWizardShell
      title={tx('Jahresinspektion planen')}
      subtitle={tx('Fahrzeug wählen und Wunschtermin erfassen')}
      steps={STEPS}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Schritt 1: Fahrzeug wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={fahrzeuge.map(fz => ({
            id: fz.record_id,
            title: fz.fields.kennzeichen ?? tx('Unbekanntes Kennzeichen'),
            subtitle: [
              fz.fields.marke,
              fz.fields.modell,
              fz.fields.baujahr ? String(fz.fields.baujahr) : null,
              fz.fields.kilometerstand != null
                ? `${fz.fields.kilometerstand.toLocaleString('de-DE')} km`
                : null,
            ]
              .filter(Boolean)
              .join(' · '),
            icon: <IconCar size={20} className="text-primary" />,
          }))}
          onSelect={handleFahrzeugSelect}
          searchPlaceholder={tx('Kennzeichen, Marke oder Modell suchen …')}
          emptyText={tx('Keine Fahrzeuge gefunden')}
        />
      )}

      {/* Schritt 2: Inspektionsdetails */}
      {step === 2 && (
        selectedFahrzeug ? (
          <div className="space-y-5">
            {/* Fahrzeug-Zusammenfassung */}
            <div className="rounded-2xl border bg-secondary p-4 flex items-center gap-3">
              <IconCar size={24} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold truncate">{selectedFahrzeug.fields.kennzeichen}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {[
                    selectedFahrzeug.fields.marke,
                    selectedFahrzeug.fields.modell,
                    selectedFahrzeug.fields.baujahr ? String(selectedFahrzeug.fields.baujahr) : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto shrink-0"
                onClick={() => setStep(1)}
              >
                {tx('Ändern')}
              </Button>
            </div>

            {/* Formular */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wunschtermin">
                  {tx('Wunschtermin')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="wunschtermin"
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={e => setWunschtermin(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="arbeitsbeschreibung">
                  {tx('Arbeitsbeschreibung')} <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="arbeitsbeschreibung"
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tx('Was soll bei der Inspektion gemacht werden?')}
                  rows={4}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bemerkungen">{tx('Bemerkungen')}</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder={tx('Optionale Hinweise …')}
                  rows={3}
                />
              </div>
            </div>

            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || saving}
                className="flex-1"
              >
                {saving ? tx('Wird gespeichert …') : tx('Inspektion planen')}
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

      {/* Schritt 3: Bestätigung */}
      {step === 3 && (
        createdId ? (
          <div className="space-y-6 text-center py-8">
            <div className="flex justify-center">
              <IconCircleCheck size={56} className="text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tx('Inspektion geplant!')}</h2>
              <p className="text-muted-foreground">
                {tx('Fahrzeug')}: <strong>{selectedFahrzeug?.fields.kennzeichen}</strong>
              </p>
              {wunschtermin && (
                <p className="text-muted-foreground">
                  {tx('Wunschtermin')}:{' '}
                  <strong>
                    {format(new Date(wunschtermin), 'dd.MM.yyyy HH:mm')} {tx('Uhr')}
                  </strong>
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button onClick={handleReset} variant="outline">
                {tx('Neue Inspektion planen')}
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
