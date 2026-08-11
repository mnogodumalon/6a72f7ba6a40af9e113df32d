/**
 * Neuen Auftrag erstellen — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen → 2) Fahrzeug wählen (gefiltert auf Kunden-Fahrzeuge) → 3) Auftrag anlegen.
 * Reads: kunden, fahrzeuge. Writes: auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState } from 'react';
import { makeT } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kunden, Fahrzeuge } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { IconUser, IconCar, IconClipboardList, IconCircleCheck } from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageTitle: 'Neuen Auftrag erstellen',
    subtitle: 'Kunden wählen, Fahrzeug auswählen und Auftrag anlegen',
    stepKunde: 'Kunde',
    stepFahrzeug: 'Fahrzeug',
    stepAuftrag: 'Auftrag',
    stepBestaetigung: 'Fertig',
    searchKunde: 'Kunde suchen …',
    searchFahrzeug: 'Fahrzeug suchen …',
    noFahrzeugForKunde: 'Keine Fahrzeuge für diesen Kunden gefunden.',
    backToKunde: 'Zurück zu Schritt 1',
    weiterFahrzeug: 'Weiter zu Schritt 2',
    weiterAuftrag: 'Weiter zu Schritt 3',
    auftragsnummer: 'Auftragsnummer',
    arbeitsbeschreibung: 'Arbeitsbeschreibung',
    wunschtermin: 'Wunschtermin',
    statusLabel: 'Status',
    prioritaetLabel: 'Priorität',
    bemerkungen: 'Bemerkungen',
    anlegen: 'Auftrag anlegen',
    submitting: 'Wird gespeichert …',
    successTitle: 'Auftrag erfolgreich angelegt!',
    successMsg: 'Auftrag {nr} wurde erfolgreich erstellt.',
    neuerAuftrag: 'Neuen Auftrag anlegen',
    dashboard: 'Zurück zum Dashboard',
    requiredField: 'Pflichtfeld',
    backToStep1: 'Zurück zu Schritt 1',
    backToStep2: 'Zurück zu Schritt 2',
    noKundeSelected: 'Kein Kunde ausgewählt. Bitte gehe zu Schritt 1.',
    noFahrzeugSelected: 'Kein Fahrzeug ausgewählt. Bitte gehe zu Schritt 2.',
    restart: 'Neu starten',
    phArbeit: 'Beschreibe die durchzuführenden Arbeiten …',
    phBemerkungen: 'Optionale Bemerkungen …',
  },
  en: {
    pageTitle: 'Create New Order',
    subtitle: 'Select customer, choose vehicle, and create order',
    stepKunde: 'Customer',
    stepFahrzeug: 'Vehicle',
    stepAuftrag: 'Order',
    stepBestaetigung: 'Done',
    searchKunde: 'Search customer …',
    searchFahrzeug: 'Search vehicle …',
    noFahrzeugForKunde: 'No vehicles found for this customer.',
    backToKunde: 'Back to step 1',
    weiterFahrzeug: 'Continue to step 2',
    weiterAuftrag: 'Continue to step 3',
    auftragsnummer: 'Order number',
    arbeitsbeschreibung: 'Work description',
    wunschtermin: 'Desired date',
    statusLabel: 'Status',
    prioritaetLabel: 'Priority',
    bemerkungen: 'Notes',
    anlegen: 'Create order',
    submitting: 'Saving …',
    successTitle: 'Order created successfully!',
    successMsg: 'Order {nr} has been created.',
    neuerAuftrag: 'Create new order',
    dashboard: 'Back to dashboard',
    requiredField: 'Required field',
    backToStep1: 'Back to step 1',
    backToStep2: 'Back to step 2',
    noKundeSelected: 'No customer selected. Please go to step 1.',
    noFahrzeugSelected: 'No vehicle selected. Please go to step 2.',
    restart: 'Start over',
    phArbeit: 'Describe the work to be done …',
    phBemerkungen: 'Optional notes …',
  },
});

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function NeuenAuftragErstellenPage() {
  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedKunde, setSelectedKunde] = useState<Kunden | null>(null);
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<Fahrzeuge | null>(null);

  // Step 3 form state
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [statusKey, setStatusKey] = useState(STATUS_OPTIONS[0]?.key ?? 'offen');
  const [prioritaetKey, setPrioritaetKey] = useState(
    PRIORITAET_OPTIONS.find(o => o.key === 'normal')?.key ?? PRIORITAET_OPTIONS[0]?.key ?? 'normal'
  );
  const [bemerkungenAuftrag, setBemerkungenAuftrag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState<string | null>(null);

  const handleKundeSelect = (id: string) => {
    const kunde = kunden.find(k => k.record_id === id) ?? null;
    setSelectedKunde(kunde);
    setSelectedFahrzeug(null);
    setStep(2);
  };

  const handleFahrzeugSelect = (id: string) => {
    const fahrzeug = fahrzeuge.find(f => f.record_id === id) ?? null;
    setSelectedFahrzeug(fahrzeug);
    setStep(3);
  };

  const filteredFahrzeuge = selectedKunde
    ? fahrzeuge.filter(f => extractRecordId(f.fields.kunde) === selectedKunde.record_id)
    : [];

  const handleSubmit = async () => {
    if (!selectedKunde || !selectedFahrzeug) return;
    if (!auftragsnummer.trim() || !arbeitsbeschreibung.trim()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.createAuftraegeEntry({
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
        auftragsnummer: auftragsnummer.trim(),
        arbeitsbeschreibung: arbeitsbeschreibung.trim(),
        wunschtermin: wunschtermin || undefined,
        status: statusKey,
        prioritaet: prioritaetKey,
        bemerkungen_auftrag: bemerkungenAuftrag.trim() || undefined,
      });
      await fetchAll();
      setCreatedAuftragsnummer(auftragsnummer.trim());
      setStep(4);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedKunde(null);
    setSelectedFahrzeug(null);
    setAuftragsnummer('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setStatusKey(STATUS_OPTIONS[0]?.key ?? 'offen');
    setPrioritaetKey(
      PRIORITAET_OPTIONS.find(o => o.key === 'normal')?.key ?? PRIORITAET_OPTIONS[0]?.key ?? 'normal'
    );
    setBemerkungenAuftrag('');
    setSubmitError(null);
    setCreatedAuftragsnummer(null);
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('stepKunde') },
        { label: tt('stepFahrzeug') },
        { label: tt('stepAuftrag') },
        { label: tt('stepBestaetigung') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Kunde wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={kunden.map(k => ({
            id: k.record_id,
            title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.telefon].filter(Boolean).join(' · '),
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          searchPlaceholder={tt('searchKunde')}
        />
      )}

      {/* Step 2: Fahrzeug wählen */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-4">
            <EntitySelectStep
              items={filteredFahrzeuge.map(f => ({
                id: f.record_id,
                title: [f.fields.kennzeichen, f.fields.marke, f.fields.modell].filter(Boolean).join(' · '),
                subtitle: f.fields.baujahr ? `Baujahr ${f.fields.baujahr}` : undefined,
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={handleFahrzeugSelect}
              searchPlaceholder={tt('searchFahrzeug')}
              emptyText={tt('noFahrzeugForKunde')}
              emptyIcon={<IconCar size={32} className="text-muted-foreground" />}
            />
            <div className="pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('backToStep1')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noKundeSelected')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3: Auftrag anlegen */}
      {step === 3 && (
        selectedKunde && selectedFahrzeug ? (
          <div className="space-y-6">
            {/* Kontext-Zusammenfassung */}
            <div className="rounded-2xl border bg-secondary p-4 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconUser size={16} />
                <span>
                  {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconCar size={16} />
                <span>
                  {[selectedFahrzeug.fields.kennzeichen, selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell].filter(Boolean).join(' · ')}
                </span>
              </div>
            </div>

            {/* Auftragsnummer */}
            <div className="space-y-2">
              <Label htmlFor="auftragsnummer">
                {tt('auftragsnummer')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="auftragsnummer"
                value={auftragsnummer}
                onChange={e => setAuftragsnummer(e.target.value)}
                placeholder="z. B. AU-2026-001"
              />
            </div>

            {/* Arbeitsbeschreibung */}
            <div className="space-y-2">
              <Label htmlFor="arbeitsbeschreibung">
                {tt('arbeitsbeschreibung')} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="arbeitsbeschreibung"
                value={arbeitsbeschreibung}
                onChange={e => setArbeitsbeschreibung(e.target.value)}
                placeholder={tt('phArbeit')}
                rows={4}
              />
            </div>

            {/* Wunschtermin */}
            <div className="space-y-2">
              <Label htmlFor="wunschtermin">{tt('wunschtermin')}</Label>
              <Input
                id="wunschtermin"
                type="datetime-local"
                value={wunschtermin}
                onChange={e => setWunschtermin(e.target.value)}
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label>{tt('statusLabel')} <span className="text-destructive">*</span></Label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setStatusKey(opt.key)}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                      statusKey === opt.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-foreground border-border hover:bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priorität */}
            <div className="space-y-2">
              <Label>{tt('prioritaetLabel')}</Label>
              <div className="flex flex-wrap gap-2">
                {PRIORITAET_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPrioritaetKey(opt.key)}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                      prioritaetKey === opt.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-foreground border-border hover:bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bemerkungen */}
            <div className="space-y-2">
              <Label htmlFor="bemerkungen">{tt('bemerkungen')}</Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungenAuftrag}
                onChange={e => setBemerkungenAuftrag(e.target.value)}
                placeholder={tt('phBemerkungen')}
                rows={3}
              />
            </div>

            {submitError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                onClick={handleSubmit}
                disabled={submitting || !auftragsnummer.trim() || !arbeitsbeschreibung.trim()}
                className="flex-1 sm:flex-none"
              >
                <IconClipboardList size={16} className="mr-2" />
                {submitting ? tt('submitting') : tt('anlegen')}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                {tt('backToStep2')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {!selectedKunde ? tt('noKundeSelected') : tt('noFahrzeugSelected')}
            </p>
            <Button variant="outline" onClick={() => setStep(!selectedKunde ? 1 : 2)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 4: Bestätigung */}
      {step === 4 && (
        createdAuftragsnummer ? (
          <div className="text-center py-12 space-y-6">
            <div className="flex justify-center">
              <IconCircleCheck size={64} className="text-primary" stroke={1.5} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">{tt('successTitle')}</h2>
              <p className="text-sm text-muted-foreground">
                {tt('successMsg').replace('{nr}', createdAuftragsnummer)}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset}>
                {tt('neuerAuftrag')}
              </Button>
              <Button variant="outline" asChild>
                <a href="#/">{tt('dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noKundeSelected')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
