/**
 * Neuer Auftrag — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen → 2) Fahrzeug auswählen (gefiltert nach Kunde) → 3) Auftrag erfassen & anlegen.
 * Reads: kunden, fahrzeuge. Writes: auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState } from 'react';
import { IconCar, IconUser, IconClipboard, IconCheck } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kunden, Fahrzeuge } from '@/types/app';
import { makeT } from '@/i18n';

const TRANSLATIONS = {
  de: {
    pageTitle: 'Neuer Werkstattauftrag',
    subtitle: 'Kunden und Fahrzeug wählen, dann Auftrag erfassen',
    step1: 'Kunde',
    step2: 'Fahrzeug',
    step3: 'Auftrag',
    step4: 'Fertig',
    searchKunde: 'Kunde suchen …',
    newKunde: 'Neuen Kunden anlegen',
    vorname: 'Vorname',
    nachname: 'Nachname',
    email: 'E-Mail',
    telefon: 'Telefon',
    create: 'Anlegen',
    weiterFahrzeug: 'Weiter zu Fahrzeug',
    searchFahrzeug: 'Fahrzeug suchen …',
    newFahrzeug: 'Neues Fahrzeug anlegen',
    kennzeichen: 'Kennzeichen',
    marke: 'Marke',
    modell: 'Modell',
    baujahr: 'Baujahr',
    weiterAuftrag: 'Weiter zu Auftrag',
    noFahrzeug: 'Kein Fahrzeug für diesen Kunden gefunden.',
    noFahrzeugHint: 'Bitte zuerst ein Fahrzeug im System anlegen oder hier direkt erstellen.',
    ausgewaehlterKunde: 'Kunde',
    ausgewaehltesKennzeichen: 'Fahrzeug',
    arbeitsbeschreibung: 'Arbeitsbeschreibung *',
    arbeitsbeschreibungPlaceholder: 'Was soll gemacht werden?',
    auftragsnummer: 'Auftragsnummer *',
    auftragsnummerPlaceholder: 'z.B. AU-2026-001',
    wunschtermin: 'Wunschtermin (optional)',
    prioritaetLabel: 'Priorität',
    bemerkungen: 'Bemerkungen (optional)',
    bemerkungenPlaceholder: 'Weitere Hinweise …',
    auftragAnlegen: 'Auftrag anlegen',
    submitting: 'Wird angelegt …',
    successTitle: 'Auftrag erfolgreich angelegt!',
    successSub: 'Auftragsnummer',
    neuerAuftrag: 'Neuen Auftrag anlegen',
    zurueck: 'Zurück zum Dashboard',
    backToKunde: 'Zurück zu Schritt 1',
    backToFahrzeug: 'Zurück zu Schritt 2',
    kundeRequired: 'Bitte zuerst einen Kunden auswählen.',
    fahrzeugRequired: 'Bitte zuerst ein Fahrzeug auswählen.',
    restart: 'Neu starten',
  },
  en: {
    pageTitle: 'New Workshop Order',
    subtitle: 'Select customer and vehicle, then enter order details',
    step1: 'Customer',
    step2: 'Vehicle',
    step3: 'Order',
    step4: 'Done',
    searchKunde: 'Search customer …',
    newKunde: 'Add new customer',
    vorname: 'First name',
    nachname: 'Last name',
    email: 'Email',
    telefon: 'Phone',
    create: 'Create',
    weiterFahrzeug: 'Continue to vehicle',
    searchFahrzeug: 'Search vehicle …',
    newFahrzeug: 'Add new vehicle',
    kennzeichen: 'License plate',
    marke: 'Make',
    modell: 'Model',
    baujahr: 'Year',
    weiterAuftrag: 'Continue to order',
    noFahrzeug: 'No vehicle found for this customer.',
    noFahrzeugHint: 'Please add a vehicle to the system first, or create one directly here.',
    ausgewaehlterKunde: 'Customer',
    ausgewaehltesKennzeichen: 'Vehicle',
    arbeitsbeschreibung: 'Work description *',
    arbeitsbeschreibungPlaceholder: 'What needs to be done?',
    auftragsnummer: 'Order number *',
    auftragsnummerPlaceholder: 'e.g. AU-2026-001',
    wunschtermin: 'Desired appointment (optional)',
    prioritaetLabel: 'Priority',
    bemerkungen: 'Remarks (optional)',
    bemerkungenPlaceholder: 'Additional notes …',
    auftragAnlegen: 'Create order',
    submitting: 'Creating …',
    successTitle: 'Order successfully created!',
    successSub: 'Order number',
    neuerAuftrag: 'Create new order',
    zurueck: 'Back to dashboard',
    backToKunde: 'Back to step 1',
    backToFahrzeug: 'Back to step 2',
    kundeRequired: 'Please select a customer first.',
    fahrzeugRequired: 'Please select a vehicle first.',
    restart: 'Start over',
  },
};

const tt = makeT(TRANSLATIONS);

const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function NeuerAuftragPage() {
  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1: Kunde
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newVorname, setNewVorname] = useState('');
  const [newNachname, setNewNachname] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTelefon, setNewTelefon] = useState('');

  // Step 2: Fahrzeug
  const [selectedFahrzeugId, setSelectedFahrzeugId] = useState<string | null>(null);
  const [showCreateFahrzeug, setShowCreateFahrzeug] = useState(false);
  const [newKennzeichen, setNewKennzeichen] = useState('');
  const [newMarke, setNewMarke] = useState('');
  const [newModell, setNewModell] = useState('');
  const [newBaujahr, setNewBaujahr] = useState('');

  // Step 3: Auftrag
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [prioritaetKey, setPrioritaetKey] = useState<string>(PRIORITAET_OPTIONS[1]?.key ?? PRIORITAET_OPTIONS[0]?.key ?? 'normal');
  const [bemerkungenAuftrag, setBemerkungenAuftrag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState<string | null>(null);

  const selectedKunde: Kunden | undefined = kunden.find(k => k.record_id === selectedKundeId);
  const selectedFahrzeug: Fahrzeuge | undefined = fahrzeuge.find(f => f.record_id === selectedFahrzeugId);

  const kundeFahrzeuge = fahrzeuge.filter(f => {
    if (!selectedKundeId) return false;
    const fzKundeId = extractRecordId(f.fields.kunde);
    return fzKundeId === selectedKundeId;
  });

  const handleSelectKunde = (id: string) => {
    setSelectedKundeId(id);
    setSelectedFahrzeugId(null);
    setStep(2);
  };

  const handleCreateKunde = async () => {
    const created = await LivingAppsService.createKundenEntry({
      vorname: newVorname,
      nachname: newNachname,
      email: newEmail || undefined,
      telefon: newTelefon || undefined,
    });
    await fetchAll();
    setShowCreateKunde(false);
    setNewVorname('');
    setNewNachname('');
    setNewEmail('');
    setNewTelefon('');
    setSelectedKundeId(created.record_id);
    setSelectedFahrzeugId(null);
    setStep(2);
  };

  const handleSelectFahrzeug = (id: string) => {
    setSelectedFahrzeugId(id);
    setStep(3);
  };

  const handleCreateFahrzeug = async () => {
    if (!selectedKundeId) return;
    const created = await LivingAppsService.createFahrzeugeEntry({
      kennzeichen: newKennzeichen,
      marke: newMarke || undefined,
      modell: newModell || undefined,
      baujahr: newBaujahr ? parseInt(newBaujahr, 10) : undefined,
      kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
    });
    await fetchAll();
    setShowCreateFahrzeug(false);
    setNewKennzeichen('');
    setNewMarke('');
    setNewModell('');
    setNewBaujahr('');
    setSelectedFahrzeugId(created.record_id);
    setStep(3);
  };

  const handleSubmitAuftrag = async () => {
    if (!selectedKundeId || !selectedFahrzeugId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeugId),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
        arbeitsbeschreibung,
        auftragsnummer,
        status: 'offen',
        prioritaet: prioritaetKey,
      };
      if (wunschtermin) payload.wunschtermin = wunschtermin;
      if (bemerkungenAuftrag) payload.bemerkungen_auftrag = bemerkungenAuftrag;

      await LivingAppsService.createAuftraegeEntry(payload as Parameters<typeof LivingAppsService.createAuftraegeEntry>[0]);
      setCreatedAuftragsnummer(auftragsnummer);
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Fehler beim Anlegen des Auftrags');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKundeId(null);
    setSelectedFahrzeugId(null);
    setShowCreateKunde(false);
    setShowCreateFahrzeug(false);
    setArbeitsbeschreibung('');
    setAuftragsnummer('');
    setWunschtermin('');
    setPrioritaetKey(PRIORITAET_OPTIONS[1]?.key ?? PRIORITAET_OPTIONS[0]?.key ?? 'normal');
    setBemerkungenAuftrag('');
    setCreatedAuftragsnummer(null);
    setSubmitError(null);
  };

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
        { label: tt('step4') },
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
          items={kunden.map((k: Kunden) => ({
            id: k.record_id,
            title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.telefon].filter(Boolean).join(' · '),
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectKunde}
          searchPlaceholder={tt('searchKunde')}
          createLabel={tt('newKunde')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={showCreateKunde && (
            <div className="rounded-2xl border p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  value={newVorname}
                  onChange={e => setNewVorname(e.target.value)}
                  placeholder={tt('vorname')}
                />
                <Input
                  value={newNachname}
                  onChange={e => setNewNachname(e.target.value)}
                  placeholder={tt('nachname')}
                />
              </div>
              <Input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder={tt('email')}
                type="email"
              />
              <Input
                value={newTelefon}
                onChange={e => setNewTelefon(e.target.value)}
                placeholder={tt('telefon')}
                type="tel"
              />
              <Button
                disabled={!newVorname || !newNachname}
                onClick={handleCreateKunde}
                className="w-full"
              >
                {tt('create')}
              </Button>
            </div>
          )}
        />
      )}

      {/* Step 2: Fahrzeug auswählen */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-4">
            {kundeFahrzeuge.length === 0 && !showCreateFahrzeug && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-1">
                <p className="font-medium">{tt('noFahrzeug')}</p>
                <p className="text-amber-700">{tt('noFahrzeugHint')}</p>
              </div>
            )}
            <EntitySelectStep
              items={kundeFahrzeuge.map((f: Fahrzeuge) => ({
                id: f.record_id,
                title: f.fields.kennzeichen ?? f.record_id,
                subtitle: [
                  f.fields.marke,
                  f.fields.modell,
                  f.fields.baujahr ? String(f.fields.baujahr) : undefined,
                ].filter(Boolean).join(' · '),
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={handleSelectFahrzeug}
              searchPlaceholder={tt('searchFahrzeug')}
              createLabel={tt('newFahrzeug')}
              onCreateNew={() => setShowCreateFahrzeug(true)}
              createDialog={showCreateFahrzeug && (
                <div className="rounded-2xl border p-4 space-y-3">
                  <Input
                    value={newKennzeichen}
                    onChange={e => setNewKennzeichen(e.target.value)}
                    placeholder={tt('kennzeichen')}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      value={newMarke}
                      onChange={e => setNewMarke(e.target.value)}
                      placeholder={tt('marke')}
                    />
                    <Input
                      value={newModell}
                      onChange={e => setNewModell(e.target.value)}
                      placeholder={tt('modell')}
                    />
                  </div>
                  <Input
                    value={newBaujahr}
                    onChange={e => setNewBaujahr(e.target.value)}
                    placeholder={tt('baujahr')}
                    type="number"
                  />
                  <Button
                    disabled={!newKennzeichen}
                    onClick={handleCreateFahrzeug}
                    className="w-full"
                  >
                    {tt('create')}
                  </Button>
                </div>
              )}
            />
            <div className="pt-2">
              <Button variant="outline" onClick={() => setStep(1)} className="w-full sm:w-auto">
                {tt('backToKunde')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('kundeRequired')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3: Auftrag erfassen */}
      {step === 3 && (
        selectedKundeId && selectedFahrzeugId ? (
          <div className="space-y-5">
            {/* Read-only summary */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <IconUser size={16} className="text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{tt('ausgewaehlterKunde')}:</span>
                <span className="font-medium truncate">
                  {[selectedKunde?.fields.vorname, selectedKunde?.fields.nachname].filter(Boolean).join(' ') || selectedKundeId}
                </span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <IconCar size={16} className="text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{tt('ausgewaehltesKennzeichen')}:</span>
                <span className="font-medium truncate">
                  {[selectedFahrzeug?.fields.kennzeichen, selectedFahrzeug?.fields.marke, selectedFahrzeug?.fields.modell]
                    .filter(Boolean).join(' — ')}
                </span>
              </div>
            </div>

            {/* Form fields */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('auftragsnummer')}</label>
                <Input
                  value={auftragsnummer}
                  onChange={e => setAuftragsnummer(e.target.value)}
                  placeholder={tt('auftragsnummerPlaceholder')}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('arbeitsbeschreibung')}</label>
                <Textarea
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tt('arbeitsbeschreibungPlaceholder')}
                  rows={4}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('prioritaetLabel')}</label>
                <div className="flex flex-wrap gap-2">
                  {PRIORITAET_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPrioritaetKey(opt.key)}
                      className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        prioritaetKey === opt.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border hover:bg-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('wunschtermin')}</label>
                <Input
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={e => setWunschtermin(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('bemerkungen')}</label>
                <Textarea
                  value={bemerkungenAuftrag}
                  onChange={e => setBemerkungenAuftrag(e.target.value)}
                  placeholder={tt('bemerkungenPlaceholder')}
                  rows={3}
                />
              </div>
            </div>

            {submitError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)} className="w-full sm:w-auto">
                {tt('backToFahrzeug')}
              </Button>
              <Button
                onClick={handleSubmitAuftrag}
                disabled={submitting || !arbeitsbeschreibung || !auftragsnummer}
                className="w-full sm:flex-1"
              >
                <IconClipboard size={16} className="mr-2" />
                {submitting ? tt('submitting') : tt('auftragAnlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {!selectedKundeId ? tt('kundeRequired') : tt('fahrzeugRequired')}
            </p>
            <Button variant="outline" onClick={() => setStep(!selectedKundeId ? 1 : 2)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 4: Erfolg */}
      {step === 4 && (
        createdAuftragsnummer ? (
          <div className="text-center py-12 space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <IconCheck size={32} className="text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
              <p className="text-muted-foreground text-sm">
                {tt('successSub')}: <span className="font-mono font-semibold text-foreground">{createdAuftragsnummer}</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset} variant="outline">
                {tt('neuerAuftrag')}
              </Button>
              <Button asChild>
                <a href="#/">{tt('zurueck')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('kundeRequired')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
