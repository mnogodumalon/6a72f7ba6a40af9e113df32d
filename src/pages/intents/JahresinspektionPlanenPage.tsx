/**
 * Jahresinspektion Planen — 2-Schritt-Wizard.
 * Steps: 1) Fahrzeug wählen → 2) Inspektionsdaten erfassen & Datensatz anlegen.
 * Reads: fahrzeuge, kunden (für kundeName). Writes: jahresinspektion_planen (createJahresinspektionPlanenEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState, useMemo } from 'react';
import { IconCar, IconCalendarCheck, IconCheck } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge } from '@/lib/enrich';
import type { EnrichedFahrzeuge } from '@/types/enriched';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { tx } from '@/i18n';

export default function JahresinspektionPlanenPage() {
  const STEPS = [{ label: tx('Fahrzeug') }, { label: tx('Inspektionsdaten') }, { label: tx('Fertig') }];

  const { fahrzeuge, kunden, kundenMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<EnrichedFahrzeuge | null>(null);
  const [wunschtermin, setWunschtermin] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Neu-Fahrzeug mini-form state
  const [showCreateFahrzeug, setShowCreateFahrzeug] = useState(false);
  const [newKennzeichen, setNewKennzeichen] = useState('');
  const [newMarke, setNewMarke] = useState('');
  const [newModell, setNewModell] = useState('');
  const [creatingFahrzeug, setCreatingFahrzeug] = useState(false);

  const enrichedFahrzeuge = useMemo(
    () => enrichFahrzeuge(fahrzeuge, { kundenMap }),
    [fahrzeuge, kundenMap]
  );

  const handleSelectFahrzeug = (id: string) => {
    const f = enrichedFahrzeuge.find(f => f.record_id === id) ?? null;
    setSelectedFahrzeug(f);
    setStep(2);
  };

  const handleCreateFahrzeug = async () => {
    if (!newKennzeichen || !newMarke) return;
    setCreatingFahrzeug(true);
    try {
      const created = await LivingAppsService.createFahrzeugeEntry({
        kennzeichen: newKennzeichen,
        marke: newMarke,
        modell: newModell || undefined,
      });
      await fetchAll();
      setShowCreateFahrzeug(false);
      setNewKennzeichen('');
      setNewMarke('');
      setNewModell('');
      // auto-select after fetch — enrichedFahrzeuge updates on next render
      const newId = created.record_id;
      // wait one tick for the re-render after fetchAll
      setTimeout(() => {
        setSelectedFahrzeug(prev => {
          if (prev) return prev;
          const f = enrichedFahrzeuge.find(f => f.record_id === newId) ?? null;
          return f;
        });
      }, 0);
      handleSelectFahrzeug(newId);
    } finally {
      setCreatingFahrzeug(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFahrzeug || !wunschtermin || !arbeitsbeschreibung) return;
    if (createdId) {
      setStep(3);
      return;
    }
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
      setStep(3);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tx('Fehler beim Anlegen der Inspektion'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedFahrzeug(null);
    setWunschtermin('');
    setArbeitsbeschreibung('');
    setBemerkungen('');
    setSubmitError(null);
    setCreatedId(null);
    setShowCreateFahrzeug(false);
  };

  const headerSubtitle = selectedFahrzeug
    ? `${selectedFahrzeug.fields.kennzeichen ?? ''} · ${selectedFahrzeug.fields.marke ?? ''} ${selectedFahrzeug.fields.modell ?? ''}`.trim()
    : undefined;

  return (
    <IntentWizardShell
      title={tx('Jahresinspektion planen')}
      subtitle={headerSubtitle ?? tx('Fahrzeug auswählen und Termin erfassen')}
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
            title: f.fields.kennzeichen ?? tx('(Kein Kennzeichen)'),
            subtitle: [
              f.fields.marke,
              f.fields.modell,
              f.fields.baujahr ? String(f.fields.baujahr) : undefined,
              f.kundeName ? `· ${f.kundeName}` : undefined,
            ].filter(Boolean).join(' '),
            icon: <IconCar size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectFahrzeug}
          searchPlaceholder={tx('Kennzeichen, Marke oder Modell suchen …')}
          emptyIcon={<IconCar size={32} />}
          emptyText={tx('Kein Fahrzeug gefunden')}
          createLabel={tx('Neues Fahrzeug anlegen')}
          onCreateNew={() => setShowCreateFahrzeug(v => !v)}
          createDialog={showCreateFahrzeug && (
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">{tx('Neues Fahrzeug erfassen')}</p>
              <Input
                value={newKennzeichen}
                onChange={e => setNewKennzeichen(e.target.value)}
                placeholder={tx('Kennzeichen (z. B. B-AA 1234)')}
              />
              <Input
                value={newMarke}
                onChange={e => setNewMarke(e.target.value)}
                placeholder={tx('Marke (z. B. VW, BMW)')}
              />
              <Input
                value={newModell}
                onChange={e => setNewModell(e.target.value)}
                placeholder={tx('Modell (optional)')}
              />
              <div className="flex gap-2">
                <Button
                  disabled={!newKennzeichen || !newMarke || creatingFahrzeug}
                  onClick={handleCreateFahrzeug}
                >
                  {creatingFahrzeug ? tx('Wird angelegt …') : tx('Anlegen & auswählen')}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateFahrzeug(false)}>
                  {tx('Abbrechen')}
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* Step 2: Inspektionsdaten erfassen */}
      {step === 2 && (
        selectedFahrzeug ? (
          <div className="space-y-5">
            {/* Kontext-Card: gewähltes Fahrzeug */}
            <div className="flex items-center gap-3 rounded-2xl border bg-secondary/40 p-4 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <IconCar size={20} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {selectedFahrzeug.fields.kennzeichen}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {[selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell, selectedFahrzeug.fields.baujahr]
                    .filter(Boolean).join(' ')}
                  {selectedFahrzeug.kundeName ? ` · ${selectedFahrzeug.kundeName}` : ''}
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

            {/* Wunschtermin */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                {tx('Wunschtermin')} <span className="text-destructive">*</span>
              </label>
              <Input
                type="datetime-local"
                value={wunschtermin}
                onChange={e => setWunschtermin(e.target.value)}
              />
            </div>

            {/* Arbeitsbeschreibung */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                {tx('Was soll geprüft / gemacht werden?')} <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={arbeitsbeschreibung}
                onChange={e => setArbeitsbeschreibung(e.target.value)}
                placeholder={tx('z. B. Ölwechsel, Bremsen prüfen, Hauptuntersuchung vorbereiten …')}
                rows={4}
              />
            </div>

            {/* Bemerkungen */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                {tx('Optionale Hinweise')}
              </label>
              <Textarea
                value={bemerkungen}
                onChange={e => setBemerkungen(e.target.value)}
                placeholder={tx('z. B. Fahrzeug bringt Geräusche mit, Licht defekt …')}
                rows={3}
              />
            </div>

            {submitError && (
              <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                disabled={!wunschtermin || !arbeitsbeschreibung || submitting}
                onClick={handleSubmit}
                className="flex-1"
              >
                {submitting ? tx('Wird angelegt …') : tx('Inspektion anlegen')}
              </Button>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Zurück')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht ein gewähltes Fahrzeug aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Step 3: Fertig */}
      {step === 3 && (
        selectedFahrzeug && createdId ? (
          <div className="text-center py-10 space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <IconCheck size={32} className="text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tx('Inspektion erfolgreich angelegt!')}</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {tx('Jahresinspektion für')} <span className="font-medium text-foreground">{selectedFahrzeug.fields.kennzeichen}</span>{' '}
                {tx('am')} <span className="font-medium text-foreground">{wunschtermin.replace('T', ' ')}</span>{' '}
                {tx('wurde geplant.')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset}>
                <IconCalendarCheck size={16} className="mr-1.5" />
                {tx('Weitere Inspektion planen')}
              </Button>
              <Button variant="outline" asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Daten aus den vorherigen Schritten.')}
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
