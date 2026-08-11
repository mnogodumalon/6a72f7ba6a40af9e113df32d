/**
 * Jahresinspektion planen — 2-Schritt-Wizard.
 * Steps: 1) Fahrzeug wählen → 2) Inspektionstermin erfassen & anlegen.
 * Reads: fahrzeuge. Writes: jahresinspektion_planen (createJahresinspektionPlanenEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeT } from '@/i18n';
import type { Fahrzeuge } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { IconCar, IconCalendarCheck, IconCircleCheck } from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageTitle: 'Jahresinspektion planen',
    subtitle: 'Fahrzeug wählen und Inspektionstermin festlegen',
    step_fahrzeug: 'Fahrzeug',
    step_termin: 'Termin',
    step_fertig: 'Fertig',
    fahrzeug_select_title: 'Fahrzeug auswählen',
    fahrzeug_search: 'Fahrzeug suchen...',
    fahrzeug_empty: 'Keine Fahrzeuge gefunden.',
    fahrzeug_baujahr: 'Bj. {year}',
    fahrzeug_km: '{km} km',
    termin_title: 'Inspektionstermin erfassen',
    selected_vehicle: 'Gewähltes Fahrzeug',
    wunschtermin_label: 'Wunschtermin',
    arbeitsbeschreibung_label: 'Arbeitsbeschreibung',
    arbeitsbeschreibung_placeholder: 'z. B. Jahresinspektion inkl. Ölwechsel',
    bemerkungen_label: 'Bemerkungen',
    bemerkungen_placeholder: 'Weitere Hinweise oder besondere Anforderungen',
    btn_weiter: 'Weiter',
    btn_speichern: 'Inspektion anlegen',
    btn_saving: 'Wird gespeichert...',
    btn_neue_inspektion: 'Neue Inspektion planen',
    btn_dashboard: 'Zurück zum Dashboard',
    success_title: 'Inspektion erfolgreich geplant',
    success_desc: 'Der Inspektionstermin wurde angelegt.',
    error_required: 'Bitte Wunschtermin und Arbeitsbeschreibung angeben.',
    restart_hint: 'Kein Fahrzeug gewählt.',
    btn_restart: 'Neu starten',
  },
  en: {
    pageTitle: 'Schedule Annual Inspection',
    subtitle: 'Select a vehicle and set the inspection date',
    step_fahrzeug: 'Vehicle',
    step_termin: 'Date',
    step_fertig: 'Done',
    fahrzeug_select_title: 'Select Vehicle',
    fahrzeug_search: 'Search vehicle...',
    fahrzeug_empty: 'No vehicles found.',
    fahrzeug_baujahr: 'Year {year}',
    fahrzeug_km: '{km} km',
    termin_title: 'Inspection Details',
    selected_vehicle: 'Selected Vehicle',
    wunschtermin_label: 'Requested Date',
    arbeitsbeschreibung_label: 'Work Description',
    arbeitsbeschreibung_placeholder: 'e.g. Annual inspection incl. oil change',
    bemerkungen_label: 'Notes',
    bemerkungen_placeholder: 'Additional notes or special requirements',
    btn_weiter: 'Continue',
    btn_speichern: 'Create Inspection',
    btn_saving: 'Saving...',
    btn_neue_inspektion: 'Plan New Inspection',
    btn_dashboard: 'Back to Dashboard',
    success_title: 'Inspection Successfully Scheduled',
    success_desc: 'The inspection appointment has been created.',
    error_required: 'Please provide a requested date and work description.',
    restart_hint: 'No vehicle selected.',
    btn_restart: 'Restart',
  },
});

export default function JahresinspektionPlanenPage() {
  const { fahrzeuge, loading, error, fetchAll } = useDashboardData();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialFahrzeugId = searchParams.get('fahrzeugId') ?? '';
  const [selectedFahrzeugId, setSelectedFahrzeugId] = useState<string>(initialFahrzeugId);
  const [step, setStep] = useState<number>(initialFahrzeugId ? 2 : 1);

  const [wunschtermin, setWunschtermin] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [done, setDone] = useState(false);

  function handleStepChange(s: number) {
    setStep(s);
    const params: Record<string, string> = { step: String(s) };
    if (selectedFahrzeugId) params.fahrzeugId = selectedFahrzeugId;
    setSearchParams(params, { replace: true });
  }

  function handleFahrzeugSelect(id: string) {
    setSelectedFahrzeugId(id);
    const params: Record<string, string> = { fahrzeugId: id, step: '2' };
    setSearchParams(params, { replace: true });
    setStep(2);
  }

  async function handleSave() {
    if (!wunschtermin || !arbeitsbeschreibung) {
      setSaveError(tt('error_required'));
      return;
    }
    setSaveError('');
    setSaving(true);
    try {
      await LivingAppsService.createJahresinspektionPlanenEntry({
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeugId),
        wunschtermin_inspektion: wunschtermin,
        arbeitsbeschreibung_inspektion: arbeitsbeschreibung,
        bemerkungen_inspektion: bemerkungen || undefined,
      });
      await fetchAll();
      setDone(true);
      setStep(3);
    } catch {
      setSaveError('Fehler beim Speichern. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setSelectedFahrzeugId('');
    setWunschtermin('');
    setArbeitsbeschreibung('');
    setBemerkungen('');
    setSaveError('');
    setDone(false);
    setSearchParams({}, { replace: true });
    setStep(1);
  }

  const selectedFahrzeug: Fahrzeuge | undefined = fahrzeuge.find(
    (f) => f.record_id === selectedFahrzeugId
  );

  const steps = [
    { label: tt('step_fahrzeug') },
    { label: tt('step_termin') },
    { label: tt('step_fertig') },
  ];

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={steps}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {step === 1 && (
        <EntitySelectStep
          items={fahrzeuge.map((f) => ({
            id: f.record_id,
            title: [f.fields.kennzeichen, f.fields.marke, f.fields.modell]
              .filter(Boolean)
              .join(' · '),
            subtitle: [
              f.fields.baujahr ? tt('fahrzeug_baujahr', { year: f.fields.baujahr }) : null,
              f.fields.kilometerstand != null
                ? tt('fahrzeug_km', { km: f.fields.kilometerstand.toLocaleString('de-DE') })
                : null,
            ]
              .filter(Boolean)
              .join(' · '),
            icon: <IconCar size={20} className="text-primary" />,
          }))}
          onSelect={handleFahrzeugSelect}
          searchPlaceholder={tt('fahrzeug_search')}
          emptyText={tt('fahrzeug_empty')}
        />
      )}

      {step === 2 && (
        <div className="space-y-6">
          {selectedFahrzeug ? (
            <>
              {/* Kontext-Karte: gewähltes Fahrzeug */}
              <div className="rounded-2xl border bg-secondary p-4 flex items-center gap-3">
                <IconCar size={24} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tt('selected_vehicle')}</p>
                  <p className="font-semibold truncate">
                    {[
                      selectedFahrzeug.fields.kennzeichen,
                      selectedFahrzeug.fields.marke,
                      selectedFahrzeug.fields.modell,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>

              {/* Formular */}
              <div className="rounded-2xl border bg-card p-5 space-y-5">
                <h2 className="font-semibold text-base">{tt('termin_title')}</h2>

                <div className="space-y-2">
                  <Label htmlFor="wunschtermin">
                    {tt('wunschtermin_label')}{' '}
                    <span className="text-destructive" aria-hidden="true">*</span>
                  </Label>
                  <Input
                    id="wunschtermin"
                    type="datetime-local"
                    value={wunschtermin}
                    onChange={(e) => setWunschtermin(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="arbeitsbeschreibung">
                    {tt('arbeitsbeschreibung_label')}{' '}
                    <span className="text-destructive" aria-hidden="true">*</span>
                  </Label>
                  <Textarea
                    id="arbeitsbeschreibung"
                    value={arbeitsbeschreibung}
                    onChange={(e) => setArbeitsbeschreibung(e.target.value)}
                    placeholder={tt('arbeitsbeschreibung_placeholder')}
                    rows={3}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bemerkungen">{tt('bemerkungen_label')}</Label>
                  <Textarea
                    id="bemerkungen"
                    value={bemerkungen}
                    onChange={(e) => setBemerkungen(e.target.value)}
                    placeholder={tt('bemerkungen_placeholder')}
                    rows={2}
                    className="w-full"
                  />
                </div>

                {saveError && (
                  <p className="text-sm text-destructive">{saveError}</p>
                )}

                <Button
                  className="w-full"
                  disabled={saving || !wunschtermin || !arbeitsbeschreibung}
                  onClick={handleSave}
                >
                  <IconCalendarCheck size={16} className="mr-2" />
                  {saving ? tt('btn_saving') : tt('btn_speichern')}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('restart_hint')}</p>
              <Button variant="outline" onClick={() => handleStepChange(1)}>
                {tt('btn_restart')}
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          {done ? (
            <div className="rounded-2xl border bg-card p-8 text-center space-y-4">
              <IconCircleCheck size={48} className="text-primary mx-auto" />
              <h2 className="text-xl font-semibold">{tt('success_title')}</h2>
              <p className="text-muted-foreground">{tt('success_desc')}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button onClick={handleReset}>
                  {tt('btn_neue_inspektion')}
                </Button>
                <Button variant="outline" asChild>
                  <a href="#/">{tt('btn_dashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('restart_hint')}</p>
              <Button variant="outline" onClick={() => handleStepChange(1)}>
                {tt('btn_restart')}
              </Button>
            </div>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
