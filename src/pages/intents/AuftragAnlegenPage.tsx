/**
 * Auftrag anlegen — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen → 2) Fahrzeug auswählen oder neu erfassen → 3) Auftragsdetails eingeben & Auftrag erstellen.
 * Reads: kunden, fahrzeuge. Writes: fahrzeuge (createFahrzeugeEntry), auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kunden, Fahrzeuge } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { IconCar, IconUser, IconClipboardList, IconCircleCheck } from '@tabler/icons-react';
import { makeT } from '@/i18n';

const tt = makeT({
  de: {
    pageTitle: 'Auftrag anlegen',
    subtitle: 'Neuen Werkstattauftrag in drei Schritten erstellen',
    stepKunde: 'Kunde',
    stepFahrzeug: 'Fahrzeug',
    stepDetails: 'Details',
    stepFertig: 'Fertig',
    searchKunde: 'Kunde suchen …',
    emptyKunde: 'Keine Kunden gefunden',
    searchFahrzeug: 'Fahrzeug suchen …',
    emptyFahrzeug: 'Kein Fahrzeug gefunden – bitte neu anlegen',
    neuFahrzeug: 'Neues Fahrzeug anlegen',
    kennzeichen: 'Kennzeichen',
    marke: 'Marke',
    modell: 'Modell',
    baujahr: 'Baujahr',
    fin: 'FIN',
    kilometerstand: 'Kilometerstand',
    anlegen: 'Anlegen',
    abbrechen: 'Abbrechen',
    auftragsnummer: 'Auftragsnummer',
    arbeitsbeschreibung: 'Arbeitsbeschreibung',
    wunschtermin: 'Wunschtermin',
    statusLabel: 'Status',
    prioritaetLabel: 'Priorität',
    bemerkungen: 'Bemerkungen',
    auftragErstellen: 'Auftrag erstellen',
    zusammenfassung: 'Zusammenfassung',
    ausgewaehlterKunde: 'Ausgewählter Kunde',
    ausgewaehltesFahrzeug: 'Ausgewähltes Fahrzeug',
    erfolgTitel: 'Auftrag erfolgreich angelegt!',
    erfolgText: 'Der Auftrag wurde erstellt.',
    auftragsnummerLabel: 'Auftragsnummer',
    neuerAuftrag: 'Neuen Auftrag anlegen',
    dashboard: 'Zurück zum Dashboard',
    weiterFahrzeug: 'Weiter zu Fahrzeug',
    weiterDetails: 'Weiter zu Details',
    zurueckKunde: 'Zurück zu Kunde',
    zurueckFahrzeug: 'Zurück zu Fahrzeug',
    pflichtfeld: 'Pflichtfeld',
    fallbackStep: 'Dieser Schritt benötigt eine Auswahl aus dem vorherigen Schritt.',
    neuStarten: 'Neu starten',
  },
  en: {
    pageTitle: 'Create Order',
    subtitle: 'Create a new workshop order in three steps',
    stepKunde: 'Customer',
    stepFahrzeug: 'Vehicle',
    stepDetails: 'Details',
    stepFertig: 'Done',
    searchKunde: 'Search customer …',
    emptyKunde: 'No customers found',
    searchFahrzeug: 'Search vehicle …',
    emptyFahrzeug: 'No vehicle found – please create one',
    neuFahrzeug: 'Add new vehicle',
    kennzeichen: 'License plate',
    marke: 'Make',
    modell: 'Model',
    baujahr: 'Year',
    fin: 'VIN',
    kilometerstand: 'Mileage',
    anlegen: 'Create',
    abbrechen: 'Cancel',
    auftragsnummer: 'Order number',
    arbeitsbeschreibung: 'Work description',
    wunschtermin: 'Desired date',
    statusLabel: 'Status',
    prioritaetLabel: 'Priority',
    bemerkungen: 'Notes',
    auftragErstellen: 'Create order',
    zusammenfassung: 'Summary',
    ausgewaehlterKunde: 'Selected customer',
    ausgewaehltesFahrzeug: 'Selected vehicle',
    erfolgTitel: 'Order successfully created!',
    erfolgText: 'The order has been created.',
    auftragsnummerLabel: 'Order number',
    neuerAuftrag: 'Create new order',
    dashboard: 'Back to dashboard',
    weiterFahrzeug: 'Continue to Vehicle',
    weiterDetails: 'Continue to Details',
    zurueckKunde: 'Back to Customer',
    zurueckFahrzeug: 'Back to Vehicle',
    pflichtfeld: 'Required field',
    fallbackStep: 'This step requires a selection from the previous step.',
    neuStarten: 'Start over',
  },
});

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function AuftragAnlegenPage() {
  const [searchParams] = useSearchParams();
  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  // Step state — initialized from URL param
  const initialStep = parseInt(searchParams.get('step') ?? '1', 10);
  const [step, setStep] = useState(isNaN(initialStep) ? 1 : Math.max(1, Math.min(4, initialStep)));

  // Selections
  const initialKundeId = searchParams.get('kundeId') ?? null;
  const initialFahrzeugId = searchParams.get('fahrzeugId') ?? null;

  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(initialKundeId);
  const [selectedFahrzeugId, setSelectedFahrzeugId] = useState<string | null>(initialFahrzeugId);

  // New Fahrzeug form
  const [showCreateFahrzeug, setShowCreateFahrzeug] = useState(false);
  const [newKennzeichen, setNewKennzeichen] = useState('');
  const [newMarke, setNewMarke] = useState('');
  const [newModell, setNewModell] = useState('');
  const [newBaujahr, setNewBaujahr] = useState('');
  const [newFin, setNewFin] = useState('');
  const [newKilometerstand, setNewKilometerstand] = useState('');
  const [creatingFahrzeug, setCreatingFahrzeug] = useState(false);

  // Auftragsdetails form
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [statusKey, setStatusKey] = useState(STATUS_OPTIONS[0]?.key ?? 'offen');
  const [prioritaetKey, setPrioritaetKey] = useState('normal');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState<string | null>(null);

  // Derived data
  const selectedKunde = useMemo<Kunden | null>(
    () => (selectedKundeId ? (kunden.find((k) => k.record_id === selectedKundeId) ?? null) : null),
    [kunden, selectedKundeId]
  );

  const filteredFahrzeuge = useMemo<Fahrzeuge[]>(() => {
    if (!selectedKundeId) return [];
    const kundeUrl = createRecordUrl(APP_IDS.KUNDEN, selectedKundeId);
    return fahrzeuge.filter((f) => f.fields.kunde === kundeUrl);
  }, [fahrzeuge, selectedKundeId]);

  const selectedFahrzeug = useMemo<Fahrzeuge | null>(
    () =>
      selectedFahrzeugId
        ? (filteredFahrzeuge.find((f) => f.record_id === selectedFahrzeugId) ?? null)
        : null,
    [filteredFahrzeuge, selectedFahrzeugId]
  );

  const handleSelectKunde = (id: string) => {
    setSelectedKundeId(id);
    setSelectedFahrzeugId(null);
    setStep(2);
  };

  const handleSelectFahrzeug = (id: string) => {
    setSelectedFahrzeugId(id);
    setStep(3);
  };

  const handleCreateFahrzeug = async () => {
    if (!selectedKundeId || !newKennzeichen || !newMarke || !newModell) return;
    setCreatingFahrzeug(true);
    try {
      const created = await LivingAppsService.createFahrzeugeEntry({
        kennzeichen: newKennzeichen,
        marke: newMarke,
        modell: newModell,
        baujahr: newBaujahr ? parseInt(newBaujahr, 10) : undefined,
        fin: newFin || undefined,
        kilometerstand: newKilometerstand ? parseInt(newKilometerstand, 10) : undefined,
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      });
      await fetchAll();
      setShowCreateFahrzeug(false);
      setNewKennzeichen('');
      setNewMarke('');
      setNewModell('');
      setNewBaujahr('');
      setNewFin('');
      setNewKilometerstand('');
      setSelectedFahrzeugId(created.record_id);
      setStep(3);
    } finally {
      setCreatingFahrzeug(false);
    }
  };

  const handleSubmitAuftrag = async () => {
    if (!selectedKundeId || !selectedFahrzeugId || !auftragsnummer || !arbeitsbeschreibung) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.createAuftraegeEntry({
        auftragsnummer,
        arbeitsbeschreibung,
        wunschtermin: wunschtermin || undefined,
        status: statusKey,
        prioritaet: prioritaetKey,
        bemerkungen_auftrag: bemerkungen || undefined,
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeugId),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      });
      setCreatedAuftragsnummer(auftragsnummer);
      setStep(4);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Fehler beim Erstellen');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedKundeId(null);
    setSelectedFahrzeugId(null);
    setAuftragsnummer('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setStatusKey(STATUS_OPTIONS[0]?.key ?? 'offen');
    setPrioritaetKey('normal');
    setBemerkungen('');
    setCreatedAuftragsnummer(null);
    setSubmitError(null);
    setStep(1);
  };

  const kundeItems = kunden.map((k) => ({
    id: k.record_id,
    title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || k.record_id,
    subtitle: [k.fields.email, k.fields.telefon].filter(Boolean).join(' · '),
    icon: <IconUser size={20} className="text-primary" />,
  }));

  const fahrzeugItems = filteredFahrzeuge.map((f) => ({
    id: f.record_id,
    title: f.fields.kennzeichen ?? f.record_id,
    subtitle: [
      f.fields.marke,
      f.fields.modell,
      f.fields.baujahr ? String(f.fields.baujahr) : undefined,
    ]
      .filter(Boolean)
      .join(' · '),
    icon: <IconCar size={20} className="text-primary" />,
  }));

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('stepKunde') },
        { label: tt('stepFahrzeug') },
        { label: tt('stepDetails') },
        { label: tt('stepFertig') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Kunde auswählen */}
      {step === 1 && (
        <EntitySelectStep
          items={kundeItems}
          onSelect={handleSelectKunde}
          searchPlaceholder={tt('searchKunde')}
          emptyText={tt('emptyKunde')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Fahrzeug auswählen */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-4">
            {selectedKunde && (
              <div className="rounded-2xl border bg-secondary p-3 flex items-center gap-2">
                <IconUser size={16} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">{tt('ausgewaehlterKunde')}:</span>
                <span className="text-sm font-medium truncate min-w-0">
                  {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                </span>
              </div>
            )}
            <EntitySelectStep
              items={fahrzeugItems}
              onSelect={handleSelectFahrzeug}
              searchPlaceholder={tt('searchFahrzeug')}
              emptyText={tt('emptyFahrzeug')}
              emptyIcon={<IconCar size={32} className="text-muted-foreground" />}
              createLabel={tt('neuFahrzeug')}
              onCreateNew={() => setShowCreateFahrzeug(true)}
              createDialog={
                showCreateFahrzeug ? (
                  <div className="rounded-2xl border bg-card p-4 space-y-3">
                    <div className="space-y-2">
                      <Label>
                        {tt('kennzeichen')} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={newKennzeichen}
                        onChange={(e) => setNewKennzeichen(e.target.value)}
                        placeholder="z.B. M-AB 1234"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>
                          {tt('marke')} <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          value={newMarke}
                          onChange={(e) => setNewMarke(e.target.value)}
                          placeholder="z.B. BMW" /* i18n-exempt */
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>
                          {tt('modell')} <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          value={newModell}
                          onChange={(e) => setNewModell(e.target.value)}
                          placeholder="z.B. 3er"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>{tt('baujahr')}</Label>
                        <Input
                          type="number"
                          value={newBaujahr}
                          onChange={(e) => setNewBaujahr(e.target.value)}
                          placeholder="z.B. 2020"
                          min={1900}
                          max={2100}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{tt('kilometerstand')}</Label>
                        <Input
                          type="number"
                          value={newKilometerstand}
                          onChange={(e) => setNewKilometerstand(e.target.value)}
                          placeholder="z.B. 50000"
                          min={0}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{tt('fin')}</Label>
                      <Input
                        value={newFin}
                        onChange={(e) => setNewFin(e.target.value)}
                        placeholder="Fahrzeugidentifikationsnummer" /* i18n-exempt */
                      />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        disabled={!newKennzeichen || !newMarke || !newModell || creatingFahrzeug}
                        onClick={handleCreateFahrzeug}
                      >
                        {creatingFahrzeug ? '…' : tt('anlegen')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowCreateFahrzeug(false)}
                      >
                        {tt('abbrechen')}
                      </Button>
                    </div>
                  </div>
                ) : null
              }
            />
            <div className="pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('zurueckKunde')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('fallbackStep')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}

      {/* Step 3: Auftragsdetails */}
      {step === 3 && (
        selectedKundeId && selectedFahrzeugId ? (
          <div className="space-y-5">
            {/* Zusammenfassung */}
            <div className="rounded-2xl border bg-secondary p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {tt('zusammenfassung')}
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <IconUser size={15} className="text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">{tt('ausgewaehlterKunde')}:</span>
                  <span className="text-sm font-medium truncate min-w-0">
                    {selectedKunde
                      ? [selectedKunde.fields.vorname, selectedKunde.fields.nachname]
                          .filter(Boolean)
                          .join(' ')
                      : selectedKundeId}
                  </span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <IconCar size={15} className="text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">{tt('ausgewaehltesFahrzeug')}:</span>
                  <span className="text-sm font-medium truncate min-w-0">
                    {selectedFahrzeug
                      ? [
                          selectedFahrzeug.fields.kennzeichen,
                          selectedFahrzeug.fields.marke,
                          selectedFahrzeug.fields.modell,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : selectedFahrzeugId}
                  </span>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="auftragsnummer">
                  {tt('auftragsnummer')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="auftragsnummer"
                  value={auftragsnummer}
                  onChange={(e) => setAuftragsnummer(e.target.value)}
                  placeholder="z.B. AU-2026-001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="arbeitsbeschreibung">
                  {tt('arbeitsbeschreibung')} <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="arbeitsbeschreibung"
                  value={arbeitsbeschreibung}
                  onChange={(e) => setArbeitsbeschreibung(e.target.value)}
                  placeholder="Beschreibung der durchzuführenden Arbeiten" /* i18n-exempt */
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wunschtermin">{tt('wunschtermin')}</Label>
                <Input
                  id="wunschtermin"
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={(e) => setWunschtermin(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{tt('statusLabel')}</Label>
                  <Select value={statusKey} onValueChange={setStatusKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.key} value={opt.key}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{tt('prioritaetLabel')}</Label>
                  <div className="flex gap-2 flex-wrap">
                    {PRIORITAET_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setPrioritaetKey(opt.key)}
                        className={`px-3 py-1.5 rounded-xl border text-sm font-medium transition-colors ${
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="bemerkungen">{tt('bemerkungen')}</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungen}
                  onChange={(e) => setBemerkungen(e.target.value)}
                  placeholder="Optionale Hinweise" /* i18n-exempt */
                  rows={2}
                />
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                disabled={!auftragsnummer || !arbeitsbeschreibung || submitting}
                onClick={handleSubmitAuftrag}
              >
                <IconClipboardList size={16} className="mr-2" />
                {submitting ? '…' : tt('auftragErstellen')}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)}>
                {tt('zurueckFahrzeug')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('fallbackStep')}</p>
            <Button variant="outline" onClick={() => setStep(selectedKundeId ? 2 : 1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}

      {/* Step 4: Erfolg */}
      {step === 4 && (
        createdAuftragsnummer ? (
          <div className="flex flex-col items-center text-center py-12 space-y-6">
            <IconCircleCheck size={64} className="text-green-500" stroke={1.5} />
            <div className="space-y-2">
              <h2 className="text-xl font-bold">{tt('erfolgTitel')}</h2>
              <p className="text-muted-foreground">{tt('erfolgText')}</p>
              <p className="text-sm text-muted-foreground">
                {tt('auftragsnummerLabel')}:{' '}
                <span className="font-mono font-semibold text-foreground">
                  {createdAuftragsnummer}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={handleReset}>{tt('neuerAuftrag')}</Button>
              <Button variant="outline" asChild>
                <a href="#/">{tt('dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('fallbackStep')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
