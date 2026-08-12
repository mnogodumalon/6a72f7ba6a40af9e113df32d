/**
 * Jahresinspektion planen — 2-Schritt-Wizard.
 * Steps: 1) Fahrzeug wählen → 2) Inspektionsdetails erfassen & anlegen.
 * Reads: fahrzeuge, jahresinspektionPlanen. Writes: jahresinspektionPlanen (createJahresinspektionPlanenEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { IconCar, IconCalendarCheck, IconCheck } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS } from '@/types/app';
import type { EnrichedFahrzeuge } from '@/types/enriched';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { tx } from '@/i18n';

export default function JahresinspektionPlanenPage() {
  const WIZARD_STEPS = [
  { label: tx('Fahrzeug') },
  { label: tx('Inspektion') },
  { label: tx('Fertig') },
];

  const [searchParams, setSearchParams] = useSearchParams();
  const initialFahrzeugId = searchParams.get('fahrzeugId') ?? '';
  const initialStep = initialFahrzeugId ? 2 : Number(searchParams.get('step') ?? 1);

  const [step, setStep] = useState(initialStep);
  const [selectedFahrzeugId, setSelectedFahrzeugId] = useState<string>(initialFahrzeugId);
  const [wunschtermin, setWunschtermin] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  const { fahrzeuge, jahresinspektionPlanen, loading, error, fetchAll } = useDashboardData();

  const enrichedFahrzeuge = useMemo<EnrichedFahrzeuge[]>(() =>
    fahrzeuge.map(f => ({ ...f, kundeName: '' })),
    [fahrzeuge]
  );

  const inspektionenProFahrzeug = useMemo(() => {
    const counts = new Map<string, number>();
    jahresinspektionPlanen.forEach(insp => {
      const fzId = extractRecordId(insp.fields.fahrzeug);
      if (fzId) {
        counts.set(fzId, (counts.get(fzId) ?? 0) + 1);
      }
    });
    return counts;
  }, [jahresinspektionPlanen]);

  const selectedFahrzeug = useMemo(() =>
    fahrzeuge.find(f => f.record_id === selectedFahrzeugId) ?? null,
    [fahrzeuge, selectedFahrzeugId]
  );

  function handleStepChange(s: number) {
    setStep(s);
    const next = new URLSearchParams(searchParams);
    next.set('step', String(s));
    setSearchParams(next, { replace: true });
  }

  function handleFahrzeugSelect(id: string) {
    setSelectedFahrzeugId(id);
    const next = new URLSearchParams(searchParams);
    next.set('fahrzeugId', id);
    next.set('step', '2');
    setSearchParams(next, { replace: true });
    setStep(2);
  }

  async function handleSubmit() {
    if (!selectedFahrzeugId || !wunschtermin || !arbeitsbeschreibung) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.createJahresinspektionPlanenEntry({
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeugId),
        wunschtermin_inspektion: wunschtermin,
        arbeitsbeschreibung_inspektion: arbeitsbeschreibung,
        bemerkungen_inspektion: bemerkungen || undefined,
      });
      setCreatedAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      await fetchAll();
      handleStepChange(3);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tx('Fehler beim Anlegen der Inspektion'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedFahrzeugId('');
    setWunschtermin('');
    setArbeitsbeschreibung('');
    setBemerkungen('');
    setSubmitError(null);
    setCreatedAt(null);
    const next = new URLSearchParams();
    next.set('step', '1');
    setSearchParams(next, { replace: true });
    setStep(1);
  }

  return (
    <IntentWizardShell
      title={tx('Jahresinspektion planen')}
      subtitle={tx('Fahrzeug auswählen und Inspektionstermin buchen')}
      steps={WIZARD_STEPS}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Schritt 1: Fahrzeug wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={enrichedFahrzeuge.map(f => {
            const count = inspektionenProFahrzeug.get(f.record_id) ?? 0;
            return {
              id: f.record_id,
              title: [f.fields.kennzeichen, f.fields.marke, f.fields.modell].filter(Boolean).join(' · ') || tx('Unbekanntes Fahrzeug'),
              subtitle: [
                f.fields.baujahr ? `${tx('Baujahr')} ${f.fields.baujahr}` : null,
                f.fields.kilometerstand != null ? `${f.fields.kilometerstand.toLocaleString('de-DE')} km` : null,
              ].filter(Boolean).join(' · ') || undefined,
              stats: [
                { label: tx('Geplante Inspektionen'), value: count },
              ],
              icon: <IconCar size={20} className="text-primary" />,
            };
          })}
          onSelect={handleFahrzeugSelect}
          searchPlaceholder={tx('Kennzeichen, Marke oder Modell suchen …')}
          emptyText={tx('Keine Fahrzeuge gefunden')}
        />
      )}

      {/* Schritt 2: Inspektionsdetails */}
      {step === 2 && (
        selectedFahrzeug ? (
          <div className="space-y-6">
            {/* Fahrzeug-Zusammenfassung */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-center gap-3">
              <IconCar size={24} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold truncate">
                  {[selectedFahrzeug.fields.kennzeichen, selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell].filter(Boolean).join(' · ') || tx('Fahrzeug')}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {[
                    selectedFahrzeug.fields.baujahr ? `${tx('Baujahr')} ${selectedFahrzeug.fields.baujahr}` : null,
                    selectedFahrzeug.fields.kilometerstand != null ? `${selectedFahrzeug.fields.kilometerstand.toLocaleString('de-DE')} km` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto shrink-0"
                onClick={() => handleStepChange(1)}
              >
                {tx('Ändern')}
              </Button>
            </div>

            {/* Inspektionsformular */}
            <div className="rounded-2xl border p-5 space-y-4">
              <h3 className="font-semibold text-base">{tx('Inspektionsdetails')}</h3>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tx('Wunschtermin')}<span className="text-destructive ml-1">*</span></label>
                <Input
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={e => setWunschtermin(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tx('Arbeitsbeschreibung')}<span className="text-destructive ml-1">*</span></label>
                <Textarea
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tx('z. B. Jährliche HU + AU')}
                  rows={3}
                  className="w-full resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tx('Bemerkungen')}</label>
                <Textarea
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder={tx('Optionale Hinweise …')}
                  rows={2}
                  className="w-full resize-none"
                />
              </div>

              {submitError && (
                <p className="text-sm text-destructive rounded-lg bg-destructive/10 p-3">{submitError}</p>
              )}

              <Button
                className="w-full"
                disabled={!wunschtermin || !arbeitsbeschreibung || submitting}
                onClick={handleSubmit}
              >
                <IconCalendarCheck size={16} className="mr-2" />
                {submitting ? tx('Wird gespeichert …') : tx('Inspektion anlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Schritt 3: Bestätigung */}
      {step === 3 && (
        createdAt ? (
          <div className="flex flex-col items-center text-center py-10 space-y-6">
            <div className="rounded-full bg-primary/10 p-5">
              <IconCheck size={40} className="text-primary" stroke={2} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">{tx('Inspektion erfolgreich geplant!')}</h3>
              <p className="text-muted-foreground text-sm max-w-sm">
                {tx('Fahrzeug')}: <span className="font-medium text-foreground">
                  {[selectedFahrzeug?.fields.kennzeichen, selectedFahrzeug?.fields.marke, selectedFahrzeug?.fields.modell].filter(Boolean).join(' · ') || tx('Fahrzeug')}
                </span>
              </p>
              <p className="text-muted-foreground text-sm">
                {tx('Termin')}: <span className="font-medium text-foreground">{wunschtermin}</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <Button className="flex-1" onClick={handleReset}>
                {tx('Neue Inspektion planen')}
              </Button>
              <Button variant="outline" className="flex-1" asChild>
                <a href="#/">{tx('Zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 2.')}</p>
            <Button variant="outline" onClick={() => handleStepChange(2)}>{tx('Zurück')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
