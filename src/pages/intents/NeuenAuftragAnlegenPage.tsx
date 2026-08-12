/**
 * Neuen Auftrag anlegen — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen → 2) Fahrzeug wählen (gefiltert nach Kunde) → 3) Auftrag erfassen & anlegen.
 * Reads: kunden, fahrzeuge. Writes: auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kunden, Fahrzeuge } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconUser, IconCar, IconClipboardList, IconCheck, IconAlertCircle, IconPlus } from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageTitle: 'Neuen Auftrag anlegen',
    subtitle: 'Schritt-für-Schritt zum neuen Werkstattauftrag',
    stepKunde: 'Kunde',
    stepFahrzeug: 'Fahrzeug',
    stepAuftrag: 'Auftrag',
    stepFertig: 'Fertig',
    kundeWaehlen: 'Kunde wählen',
    kundeHinzufuegen: 'Neuen Kunden anlegen',
    fahrzeugWaehlen: 'Fahrzeug wählen',
    fahrzeugHinzufuegen: 'Neues Fahrzeug anlegen',
    fahrzeugLeer: 'Kein Fahrzeug für diesen Kunden gefunden.',
    fahrzeugLeerHint: 'Lege ein neues Fahrzeug für diesen Kunden an.',
    zurückZuKunde: 'Zurück zu Schritt 1',
    zurückZuFahrzeug: 'Zurück zu Schritt 2',
    auftragErfassen: 'Auftrag erfassen',
    auftragsnummer: 'Auftragsnummer',
    arbeitsbeschreibung: 'Arbeitsbeschreibung',
    wunschtermin: 'Wunschtermin',
    statusLabel: 'Status',
    prioritaetLabel: 'Priorität',
    bemerkungen: 'Bemerkungen',
    anlegen: 'Auftrag anlegen',
    anlegenLaden: 'Wird angelegt…',
    ergebnisTitle: 'Auftrag angelegt!',
    ergebnisAuftrag: 'Auftragsnummer',
    ergebnisKunde: 'Kunde',
    ergebnisKennzeichen: 'Fahrzeug',
    neuerAuftrag: 'Neuen Auftrag anlegen',
    dashboard: 'Zurück zum Dashboard',
    fehler: 'Auftrag konnte nicht angelegt werden.',
    pflichtfeld: 'Pflichtfeld',
    kundeVorname: 'Vorname',
    kundeNachname: 'Nachname',
    kundeTelefon: 'Telefon',
    kundeEmail: 'E-Mail',
    fahrzeugKennzeichen: 'Kennzeichen',
    fahrzeugMarke: 'Marke',
    fahrzeugModell: 'Modell',
    fahrzeugBaujahr: 'Baujahr',
    schritt1Fehlt: 'Dieser Schritt braucht einen Kunden aus Schritt 1.',
    schritt2Fehlt: 'Dieser Schritt braucht ein Fahrzeug aus Schritt 2.',
    neuStart: 'Neu starten',
    phModell: 'z. B. Golf',
    phArbeit: 'Welche Arbeiten sollen durchgeführt werden?',
    phBemerkungen: 'Optionale Bemerkungen zum Auftrag',
  },
  en: {
    pageTitle: 'Create New Work Order',
    subtitle: 'Step-by-step to a new workshop order',
    stepKunde: 'Customer',
    stepFahrzeug: 'Vehicle',
    stepAuftrag: 'Order',
    stepFertig: 'Done',
    kundeWaehlen: 'Select customer',
    kundeHinzufuegen: 'Add new customer',
    fahrzeugWaehlen: 'Select vehicle',
    fahrzeugHinzufuegen: 'Add new vehicle',
    fahrzeugLeer: 'No vehicle found for this customer.',
    fahrzeugLeerHint: 'Create a new vehicle for this customer.',
    zurückZuKunde: 'Back to step 1',
    zurückZuFahrzeug: 'Back to step 2',
    auftragErfassen: 'Enter order details',
    auftragsnummer: 'Order number',
    arbeitsbeschreibung: 'Work description',
    wunschtermin: 'Requested date',
    statusLabel: 'Status',
    prioritaetLabel: 'Priority',
    bemerkungen: 'Notes',
    anlegen: 'Create work order',
    anlegenLaden: 'Creating…',
    ergebnisTitle: 'Work order created!',
    ergebnisAuftrag: 'Order number',
    ergebnisKunde: 'Customer',
    ergebnisKennzeichen: 'Vehicle',
    neuerAuftrag: 'Create another order',
    dashboard: 'Back to dashboard',
    fehler: 'Work order could not be created.',
    pflichtfeld: 'Required',
    kundeVorname: 'First name',
    kundeNachname: 'Last name',
    kundeTelefon: 'Phone',
    kundeEmail: 'Email',
    fahrzeugKennzeichen: 'License plate',
    fahrzeugMarke: 'Make',
    fahrzeugModell: 'Model',
    fahrzeugBaujahr: 'Year',
    schritt1Fehlt: 'This step needs a customer from step 1.',
    schritt2Fehlt: 'This step needs a vehicle from step 2.',
    neuStart: 'Start over',
    phModell: 'e.g. Golf',
    phArbeit: 'Which work should be carried out?',
    phBemerkungen: 'Optional notes for the order',
  },
});

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function NeuenAuftragAnlegenPage() {
  const [searchParams] = useSearchParams();
  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  // Deep-link support: ?kundeId=xxx skips to step 2, ?fahrzeugId=xxx skips to step 3
  const deepKundeId = searchParams.get('kundeId');
  const deepFahrzeugId = searchParams.get('fahrzeugId');

  const initialStep = deepFahrzeugId ? 3 : deepKundeId ? 2 : 1;

  const [step, setStep] = useState(initialStep);
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(deepKundeId);
  const [selectedFahrzeugId, setSelectedFahrzeugId] = useState<string | null>(deepFahrzeugId);

  // Kunde create form
  const [showKundeCreate, setShowKundeCreate] = useState(false);
  const [neuerVorname, setNeuerVorname] = useState('');
  const [neuerNachname, setNeuerNachname] = useState('');
  const [neueTelefon, setNeueTelefon] = useState('');
  const [neueEmail, setNeueEmail] = useState('');

  // Fahrzeug create form
  const [showFahrzeugCreate, setShowFahrzeugCreate] = useState(false);
  const [neuesKennzeichen, setNeuesKennzeichen] = useState('');
  const [neueMarke, setNeueMarke] = useState('');
  const [neuesModell, setNeuesModell] = useState('');
  const [neuesBaujahr, setNeuesBaujahr] = useState('');

  // Auftrag form
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [statusKey, setStatusKey] = useState(STATUS_OPTIONS[0]?.key ?? 'offen');
  const [prioritaetKey, setPrioritaetKey] = useState('normal');
  const [bemerkungenAuftrag, setBemerkungenAuftrag] = useState('');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState<string | null>(null);
  const [createdAuftragId, setCreatedAuftragId] = useState<string | null>(null);

  const selectedKunde = kunden.find((k: Kunden) => k.record_id === selectedKundeId) ?? null;
  const selectedFahrzeug = fahrzeuge.find((f: Fahrzeuge) => f.record_id === selectedFahrzeugId) ?? null;

  const filteredFahrzeuge = fahrzeuge.filter((f: Fahrzeuge) => {
    if (!selectedKundeId) return false;
    return extractRecordId(f.fields.kunde) === selectedKundeId;
  });

  const handleKundeSelect = useCallback((id: string) => {
    setSelectedKundeId(id);
    setSelectedFahrzeugId(null);
    setStep(2);
  }, []);

  const handleKundeAnlegen = useCallback(async () => {
    if (!neuerVorname.trim() || !neuerNachname.trim()) return;
    const created = await LivingAppsService.createKundenEntry({
      vorname: neuerVorname.trim(),
      nachname: neuerNachname.trim(),
      telefon: neueTelefon.trim() || undefined,
      email: neueEmail.trim() || undefined,
    });
    await fetchAll();
    setShowKundeCreate(false);
    setNeuerVorname('');
    setNeuerNachname('');
    setNeueTelefon('');
    setNeueEmail('');
    setSelectedKundeId(created.record_id);
    setSelectedFahrzeugId(null);
    setStep(2);
  }, [neuerVorname, neuerNachname, neueTelefon, neueEmail, fetchAll]);

  const handleFahrzeugSelect = useCallback((id: string) => {
    setSelectedFahrzeugId(id);
    setStep(3);
  }, []);

  const handleFahrzeugAnlegen = useCallback(async () => {
    if (!neuesKennzeichen.trim() || !selectedKundeId) return;
    const created = await LivingAppsService.createFahrzeugeEntry({
      kennzeichen: neuesKennzeichen.trim(),
      marke: neueMarke.trim() || undefined,
      modell: neuesModell.trim() || undefined,
      baujahr: neuesBaujahr ? Number(neuesBaujahr) : undefined,
      kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
    });
    await fetchAll();
    setShowFahrzeugCreate(false);
    setNeuesKennzeichen('');
    setNeueMarke('');
    setNeuesModell('');
    setNeuesBaujahr('');
    setSelectedFahrzeugId(created.record_id);
    setStep(3);
  }, [neuesKennzeichen, neueMarke, neuesModell, neuesBaujahr, selectedKundeId, fetchAll]);

  const handleAuftragAnlegen = useCallback(async () => {
    if (!auftragsnummer.trim() || !arbeitsbeschreibung.trim() || !selectedKundeId || !selectedFahrzeugId) return;
    if (createdAuftragId) return; // idempotency guard

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await LivingAppsService.createAuftraegeEntry({
        auftragsnummer: auftragsnummer.trim(),
        arbeitsbeschreibung: arbeitsbeschreibung.trim(),
        wunschtermin: wunschtermin
          ? format(new Date(wunschtermin), "yyyy-MM-dd'T'HH:mm")
          : undefined,
        status: statusKey,
        prioritaet: prioritaetKey,
        bemerkungen_auftrag: bemerkungenAuftrag.trim() || undefined,
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeugId),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      });
      setCreatedAuftragId(result.record_id);
      setCreatedAuftragsnummer(auftragsnummer.trim());
      setStep(4);
    } catch {
      setSubmitError(tt('fehler'));
    } finally {
      setSubmitting(false);
    }
  }, [
    auftragsnummer,
    arbeitsbeschreibung,
    wunschtermin,
    statusKey,
    prioritaetKey,
    bemerkungenAuftrag,
    selectedKundeId,
    selectedFahrzeugId,
    createdAuftragId,
    tt,
  ]);

  const handleReset = useCallback(() => {
    setStep(1);
    setSelectedKundeId(null);
    setSelectedFahrzeugId(null);
    setAuftragsnummer('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setStatusKey(STATUS_OPTIONS[0]?.key ?? 'offen');
    setPrioritaetKey('normal');
    setBemerkungenAuftrag('');
    setSubmitError(null);
    setCreatedAuftragId(null);
    setCreatedAuftragsnummer(null);
    setShowKundeCreate(false);
    setShowFahrzeugCreate(false);
  }, []);

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('stepKunde') },
        { label: tt('stepFahrzeug') },
        { label: tt('stepAuftrag') },
        { label: tt('stepFertig') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Schritt 1: Kunde wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={kunden.map((k: Kunden) => ({
            id: k.record_id,
            title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.telefon].filter(Boolean).join(' · '),
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          createLabel={tt('kundeHinzufuegen')}
          onCreateNew={() => setShowKundeCreate(true)}
          createDialog={
            showKundeCreate ? (
              <div className="rounded-2xl border p-4 space-y-3">
                <p className="text-sm font-medium">{tt('kundeHinzufuegen')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      {tt('kundeVorname')} <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={neuerVorname}
                      onChange={e => setNeuerVorname(e.target.value)}
                      placeholder={tt('kundeVorname')}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      {tt('kundeNachname')} <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={neuerNachname}
                      onChange={e => setNeuerNachname(e.target.value)}
                      placeholder={tt('kundeNachname')}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{tt('kundeTelefon')}</label>
                    <Input
                      value={neueTelefon}
                      onChange={e => setNeueTelefon(e.target.value)}
                      placeholder={tt('kundeTelefon')}
                      type="tel"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{tt('kundeEmail')}</label>
                    <Input
                      value={neueEmail}
                      onChange={e => setNeueEmail(e.target.value)}
                      placeholder={tt('kundeEmail')}
                      type="email"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    disabled={!neuerVorname.trim() || !neuerNachname.trim()}
                    onClick={handleKundeAnlegen}
                    className="flex-1"
                  >
                    <IconPlus size={16} className="mr-1" />
                    {tt('anlegen').split(' ')[0]} {/* "Anlegen" */}
                  </Button>
                  <Button variant="outline" onClick={() => setShowKundeCreate(false)}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : null
          }
        />
      )}

      {/* ── Schritt 2: Fahrzeug wählen ── */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconUser size={14} />
              <span>
                {[selectedKunde?.fields.vorname, selectedKunde?.fields.nachname]
                  .filter(Boolean)
                  .join(' ')}
              </span>
              <button
                className="ml-auto text-xs underline hover:no-underline"
                onClick={() => setStep(1)}
              >
                {tt('zurückZuKunde')}
              </button>
            </div>
            <EntitySelectStep
              items={filteredFahrzeuge.map((f: Fahrzeuge) => ({
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
              }))}
              onSelect={handleFahrzeugSelect}
              createLabel={tt('fahrzeugHinzufuegen')}
              onCreateNew={() => setShowFahrzeugCreate(true)}
              emptyText={tt('fahrzeugLeer')}
              createDialog={
                showFahrzeugCreate ? (
                  <div className="rounded-2xl border p-4 space-y-3">
                    <p className="text-sm font-medium">{tt('fahrzeugHinzufuegen')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          {tt('fahrzeugKennzeichen')} <span className="text-destructive">*</span>
                        </label>
                        <Input
                          value={neuesKennzeichen}
                          onChange={e => setNeuesKennzeichen(e.target.value)}
                          placeholder="z. B. B-AA 1234"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">{tt('fahrzeugMarke')}</label>
                        <Input
                          value={neueMarke}
                          onChange={e => setNeueMarke(e.target.value)}
                          placeholder="z. B. VW"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">{tt('fahrzeugModell')}</label>
                        <Input
                          value={neuesModell}
                          onChange={e => setNeuesModell(e.target.value)}
                          placeholder={tt('phModell')}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">{tt('fahrzeugBaujahr')}</label>
                        <Input
                          value={neuesBaujahr}
                          onChange={e => setNeuesBaujahr(e.target.value)}
                          placeholder="z. B. 2018"
                          type="number"
                          min={1900}
                          max={new Date().getFullYear() + 1}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        disabled={!neuesKennzeichen.trim()}
                        onClick={handleFahrzeugAnlegen}
                        className="flex-1"
                      >
                        <IconPlus size={16} className="mr-1" />
                        Anlegen
                      </Button>
                      <Button variant="outline" onClick={() => setShowFahrzeugCreate(false)}>
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('schritt1Fehlt')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('neuStart')}
            </Button>
          </div>
        )
      )}

      {/* ── Schritt 3: Auftrag erfassen ── */}
      {step === 3 && (
        selectedKundeId && selectedFahrzeugId ? (
          <div className="space-y-6">
            {/* Context-Zusammenfassung */}
            <div className="rounded-xl border bg-secondary/50 p-3 flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <IconUser size={14} className="text-muted-foreground" />
                <span>
                  {[selectedKunde?.fields.vorname, selectedKunde?.fields.nachname]
                    .filter(Boolean)
                    .join(' ')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <IconCar size={14} className="text-muted-foreground" />
                <span>
                  {[
                    selectedFahrzeug?.fields.kennzeichen,
                    selectedFahrzeug?.fields.marke,
                    selectedFahrzeug?.fields.modell,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <button
                className="ml-auto text-xs text-muted-foreground underline hover:no-underline"
                onClick={() => setStep(2)}
              >
                {tt('zurückZuFahrzeug')}
              </button>
            </div>

            {/* Formular */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  {tt('auftragsnummer')} <span className="text-destructive text-xs">{tt('pflichtfeld')}</span>
                </label>
                <Input
                  value={auftragsnummer}
                  onChange={e => setAuftragsnummer(e.target.value)}
                  placeholder="z. B. AU-2026-001"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  {tt('arbeitsbeschreibung')} <span className="text-destructive text-xs">{tt('pflichtfeld')}</span>
                </label>
                <Textarea
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tt('phArbeit')}
                  rows={3}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('wunschtermin')}</label>
                <Input
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={e => setWunschtermin(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('statusLabel')}</label>
                  <Select value={statusKey} onValueChange={setStatusKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('prioritaetLabel')}</label>
                  <div className="flex gap-2">
                    {PRIORITAET_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setPrioritaetKey(opt.key)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          prioritaetKey === opt.key
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card hover:bg-secondary border-border'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('bemerkungen')}</label>
                <Textarea
                  value={bemerkungenAuftrag}
                  onChange={e => setBemerkungenAuftrag(e.target.value)}
                  placeholder={tt('phBemerkungen')}
                  rows={2}
                />
              </div>
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <IconAlertCircle size={16} />
                {submitError}
              </div>
            )}

            <Button
              className="w-full"
              disabled={!auftragsnummer.trim() || !arbeitsbeschreibung.trim() || submitting}
              onClick={handleAuftragAnlegen}
            >
              {submitting ? tt('anlegenLaden') : tt('anlegen')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {!selectedKundeId ? tt('schritt1Fehlt') : tt('schritt2Fehlt')}
            </p>
            <Button variant="outline" onClick={() => setStep(!selectedKundeId ? 1 : 2)}>
              {tt('neuStart')}
            </Button>
          </div>
        )
      )}

      {/* ── Schritt 4: Bestätigung ── */}
      {step === 4 && (
        createdAuftragId ? (
          <div className="flex flex-col items-center text-center py-10 space-y-6">
            <div className="rounded-full bg-primary/10 p-4">
              <IconCheck size={36} className="text-primary" stroke={2} />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{tt('ergebnisTitle')}</h2>
            </div>
            <div className="w-full max-w-sm rounded-2xl border bg-card p-5 space-y-3 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{tt('ergebnisAuftrag')}</span>
                <span className="font-medium">{createdAuftragsnummer}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{tt('ergebnisKunde')}</span>
                <span className="font-medium">
                  {[selectedKunde?.fields.vorname, selectedKunde?.fields.nachname]
                    .filter(Boolean)
                    .join(' ')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{tt('ergebnisKennzeichen')}</span>
                <span className="font-medium">
                  {[
                    selectedFahrzeug?.fields.kennzeichen,
                    selectedFahrzeug?.fields.marke,
                    selectedFahrzeug?.fields.modell,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
              <Button className="flex-1" onClick={handleReset}>
                <IconClipboardList size={16} className="mr-2" />
                {tt('neuerAuftrag')}
              </Button>
              <Button variant="outline" className="flex-1" asChild>
                <a href="#/">{tt('dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('schritt2Fehlt')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('neuStart')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
