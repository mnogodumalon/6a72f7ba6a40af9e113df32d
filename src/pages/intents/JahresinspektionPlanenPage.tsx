/**
 * Jahresinspektion planen — 2-Schritt-Wizard.
 * Steps: 1) Fahrzeug wählen → 2) Inspektionstermin erfassen & anlegen.
 * Reads: fahrzeuge, kunden (für Kundenname). Writes: jahresinspektion_planen (createJahresinspektionPlanenEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { IconCar, IconCalendarCheck, IconCheck } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { EnrichedFahrzeuge } from '@/types/enriched';
import { tx } from '@/i18n';

export default function JahresinspektionPlanenPage() {
  const STEPS = [
  { label: tx('Fahrzeug') },
  { label: tx('Inspektion') },
  { label: tx('Fertig') },
];

  const [searchParams] = useSearchParams();
  const initialStep = parseInt(searchParams.get('step') ?? '1', 10);
  const initialFahrzeugId = searchParams.get('fahrzeugId') ?? null;

  const [step, setStep] = useState(initialStep);
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<EnrichedFahrzeuge | null>(null);
  const [selectedFahrzeugId] = useState<string | null>(initialFahrzeugId);

  const [wunschtermin, setWunschtermin] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [confirmedKennzeichen, setConfirmedKennzeichen] = useState('');
  const [confirmedTermin, setConfirmedTermin] = useState('');

  const { fahrzeuge, kunden, loading, error, fetchAll } = useDashboardData();

  // Enrich fahrzeuge with kundeName
  const enrichedFahrzeuge: EnrichedFahrzeuge[] = fahrzeuge.map(f => {
    const kundeUrl = f.fields.kunde ?? '';
    const kundeRecord = kunden.find(k => kundeUrl.includes(k.record_id));
    const kundeName = kundeRecord
      ? [kundeRecord.fields.vorname, kundeRecord.fields.nachname].filter(Boolean).join(' ')
      : '';
    return { ...f, kundeName };
  });

  // Auto-select fahrzeug from deep-link param after data loads
  const resolvedFahrzeug =
    selectedFahrzeug ??
    (selectedFahrzeugId ? enrichedFahrzeuge.find(f => f.record_id === selectedFahrzeugId) ?? null : null);

  const handleFahrzeugSelect = (id: string) => {
    const f = enrichedFahrzeuge.find(fz => fz.record_id === id) ?? null;
    setSelectedFahrzeug(f);
    setStep(2);
  };

  const handleSave = async () => {
    if (!resolvedFahrzeug || !wunschtermin) return;
    if (createdId) return; // idempotency guard

    setSaving(true);
    setSaveError(null);
    try {
      const result = await LivingAppsService.createJahresinspektionPlanenEntry({
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, resolvedFahrzeug.record_id),
        wunschtermin_inspektion: wunschtermin,
        arbeitsbeschreibung_inspektion: arbeitsbeschreibung || undefined,
        bemerkungen_inspektion: bemerkungen || undefined,
      });
      setCreatedId(result.record_id);
      setConfirmedKennzeichen(resolvedFahrzeug.fields.kennzeichen ?? resolvedFahrzeug.record_id);
      setConfirmedTermin(
        wunschtermin
          ? format(new Date(wunschtermin.replace('T', ' ')), 'dd.MM.yyyy HH:mm')
          : wunschtermin
      );
      await fetchAll();
      setStep(3);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tx('Fehler beim Speichern'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedFahrzeug(null);
    setWunschtermin('');
    setArbeitsbeschreibung('');
    setBemerkungen('');
    setSaveError(null);
    setCreatedId(null);
    setConfirmedKennzeichen('');
    setConfirmedTermin('');
    setStep(1);
  };

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
      {step === 1 && (
        <EntitySelectStep
          items={enrichedFahrzeuge.map(f => ({
            id: f.record_id,
            title: [f.fields.kennzeichen, f.fields.marke, f.fields.modell].filter(Boolean).join(' · '),
            subtitle: [
              f.fields.baujahr ? tx('Baujahr') + ' ' + f.fields.baujahr : null,
              f.kundeName || null,
            ].filter(Boolean).join(' · '),
            icon: <IconCar size={20} className="text-primary" />,
          }))}
          onSelect={handleFahrzeugSelect}
          searchPlaceholder={tx('Fahrzeug suchen …')}
          emptyText={tx('Kein Fahrzeug gefunden')}
          emptyIcon={<IconCar size={32} className="text-muted-foreground" />}
        />
      )}

      {step === 2 && (
        resolvedFahrzeug ? (
          <div className="space-y-6">
            {/* Fahrzeug-Zusammenfassung */}
            <div className="rounded-2xl border bg-secondary p-4 flex items-start gap-3 overflow-hidden">
              <IconCar size={24} className="text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold truncate">
                  {resolvedFahrzeug.fields.kennzeichen ?? '—'}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {[resolvedFahrzeug.fields.marke, resolvedFahrzeug.fields.modell].filter(Boolean).join(' ')}
                  {resolvedFahrzeug.fields.baujahr ? ` · ${tx('Baujahr')} ${resolvedFahrzeug.fields.baujahr}` : ''}
                </p>
                {resolvedFahrzeug.kundeName && (
                  <p className="text-sm text-muted-foreground truncate">{resolvedFahrzeug.kundeName}</p>
                )}
              </div>
            </div>

            {/* Mini-Formular */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  {tx('Wunschtermin')} <span className="text-destructive">*</span>
                </label>
                <Input
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={e => setWunschtermin(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  {tx('Arbeitsbeschreibung')} <span className="text-destructive">*</span>
                </label>
                <Textarea
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tx('Was soll bei der Inspektion geprüft oder gemacht werden?')}
                  rows={3}
                  className="w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tx('Bemerkungen')}</label>
                <Textarea
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder={tx('Optionale Hinweise …')}
                  rows={2}
                  className="w-full"
                />
              </div>
            </div>

            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="w-full sm:w-auto"
              >
                {tx('Zurück')}
              </Button>
              <Button
                disabled={!wunschtermin || !arbeitsbeschreibung || saving}
                onClick={handleSave}
                className="w-full sm:w-auto"
              >
                <IconCalendarCheck size={16} className="mr-2" />
                {saving ? tx('Wird gespeichert …') : tx('Inspektion anlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Bitte zuerst ein Fahrzeug auswählen.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {step === 3 && (
        createdId ? (
          <div className="text-center py-12 space-y-6">
            <div className="flex items-center justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCheck size={40} className="text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tx('Inspektion geplant!')}</h2>
              <p className="text-muted-foreground">
                {tx('Fahrzeug')} <span className="font-medium text-foreground">{confirmedKennzeichen}</span>
              </p>
              <p className="text-muted-foreground">
                {tx('Termin')}: <span className="font-medium text-foreground">{confirmedTermin}</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
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
              {tx('Dieser Schritt braucht die Daten aus Schritt 2.')}
            </p>
            <Button variant="outline" onClick={() => setStep(2)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
