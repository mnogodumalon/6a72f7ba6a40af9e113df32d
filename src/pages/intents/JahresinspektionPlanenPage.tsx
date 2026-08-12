/**
 * Jahresinspektion planen — 2-Schritt-Wizard.
 * Steps: 1) Fahrzeug wählen → 2) Inspektionstermin eingeben & anlegen.
 * Reads: fahrzeuge, kunden. Writes: jahresinspektion_planen (createJahresinspektionPlanenEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { IconCar, IconCalendarCheck, IconCheck } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import type { EnrichedFahrzeuge } from '@/types/enriched';
import { APP_IDS } from '@/types/app';
import { tx } from '@/i18n';

export default function JahresinspektionPlanenPage() {
  const STEPS = [
  { label: tx('Fahrzeug') },
  { label: tx('Inspektionstermin') },
];

  const { fahrzeuge, kunden, kundenMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<EnrichedFahrzeuge | null>(null);

  // Step 2 form state
  const [wunschtermin, setWunschtermin] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedRecord, setSavedRecord] = useState<{ kennzeichen: string; termin: string } | null>(null);

  // Enrich fahrzeuge with kundeName
  const enrichedFahrzeuge: EnrichedFahrzeuge[] = fahrzeuge.map(f => {
    const kundeId = f.fields.kunde ? extractRecordId(f.fields.kunde) : undefined;
    const kunde = kundeId ? kundenMap.get(kundeId) : undefined;
    const kundeName = kunde
      ? [kunde.fields.vorname, kunde.fields.nachname].filter(Boolean).join(' ')
      : '';
    return { ...f, kundeName };
  });

  const handleFahrzeugSelect = (id: string) => {
    const fz = enrichedFahrzeuge.find(f => f.record_id === id) ?? null;
    setSelectedFahrzeug(fz);
    setStep(2);
  };

  const handleSave = async () => {
    if (!selectedFahrzeug || !wunschtermin || !arbeitsbeschreibung) return;
    setSaving(true);
    setSaveError(null);
    try {
      await LivingAppsService.createJahresinspektionPlanenEntry({
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
        wunschtermin_inspektion: wunschtermin,
        arbeitsbeschreibung_inspektion: arbeitsbeschreibung,
        bemerkungen_inspektion: bemerkungen || undefined,
      });
      setSavedRecord({
        kennzeichen: selectedFahrzeug.fields.kennzeichen ?? selectedFahrzeug.record_id,
        termin: wunschtermin,
      });
      await fetchAll();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tx('Fehler beim Speichern'));
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
    setSavedRecord(null);
  };

  const canSave = !!wunschtermin && !!arbeitsbeschreibung;

  return (
    <IntentWizardShell
      title={tx('Jahresinspektion planen')}
      subtitle={tx('Fahrzeug wählen und Inspektionstermin festlegen')}
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
          items={enrichedFahrzeuge.map(f => ({
            id: f.record_id,
            title: [f.fields.kennzeichen, f.fields.marke, f.fields.modell].filter(Boolean).join(' · '),
            subtitle: [
              f.fields.baujahr ? tx`Baujahr ${f.fields.baujahr}` : null,
              f.kundeName ? tx`Kunde: ${f.kundeName}` : null,
            ].filter(Boolean).join(' · '),
            icon: <IconCar size={20} className="text-primary" />,
          }))}
          onSelect={handleFahrzeugSelect}
          searchPlaceholder={tx('Fahrzeug suchen …')}
          emptyText={tx('Keine Fahrzeuge gefunden')}
          emptyIcon={<IconCar size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Inspektionstermin eingeben */}
      {step === 2 && (
        <div className="space-y-6">
          {!selectedFahrzeug ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
              </p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Fahrzeug wählen')}
              </Button>
            </div>
          ) : savedRecord ? (
            <div className="rounded-2xl border bg-card p-6 space-y-4 text-center">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 p-4">
                  <IconCheck size={32} className="text-green-600" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                {tx('Inspektionstermin gespeichert!')}
              </h2>
              <p className="text-muted-foreground">
                {tx`Fahrzeug ${savedRecord.kennzeichen} · Termin: ${savedRecord.termin}`}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button onClick={handleReset}>
                  {tx('Neue Jahresinspektion planen')}
                </Button>
                <a href="#/" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent">
                  {tx('Zurück zum Dashboard')}
                </a>
              </div>
            </div>
          ) : (
            <>
              {/* Fahrzeug-Zusammenfassung */}
              <div className="rounded-2xl border bg-secondary/40 p-4 flex items-start gap-3">
                <IconCar size={24} className="text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {[selectedFahrzeug.fields.kennzeichen, selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {selectedFahrzeug.kundeName && (
                    <p className="text-sm text-muted-foreground">
                      {tx`Kunde: ${selectedFahrzeug.kundeName}`}
                    </p>
                  )}
                </div>
              </div>

              {/* Formular */}
              <div className="rounded-2xl border bg-card p-5 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <IconCalendarCheck size={20} className="text-primary" />
                  <h3 className="font-semibold text-foreground">
                    {tx('Inspektionsdetails')}
                  </h3>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Wunschtermin')} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="datetime-local"
                    value={wunschtermin}
                    onChange={e => setWunschtermin(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Arbeitsbeschreibung')} <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    value={arbeitsbeschreibung}
                    onChange={e => setArbeitsbeschreibung(e.target.value)}
                    placeholder={tx('z. B. Jährliche Hauptinspektion')}
                    rows={3}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Bemerkungen')}
                  </label>
                  <Textarea
                    value={bemerkungen}
                    onChange={e => setBemerkungen(e.target.value)}
                    placeholder={tx('Optionale Hinweise …')}
                    rows={2}
                    className="w-full"
                  />
                </div>

                {saveError && (
                  <p className="text-sm text-destructive">{saveError}</p>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <Button
                    onClick={handleSave}
                    disabled={!canSave || saving}
                    className="flex-1"
                  >
                    {saving ? tx('Wird gespeichert …') : tx('Inspektionstermin speichern')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    disabled={saving}
                  >
                    {tx('Zurück')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
