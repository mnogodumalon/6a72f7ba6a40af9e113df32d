/**
 * Auftrag anlegen — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen → 2) Fahrzeug wählen (gefiltert nach Kunde) → 3) Auftragsdaten eingeben & anlegen.
 * Reads: kunden, fahrzeuge. Writes: auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kunden, Fahrzeuge } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconUser, IconCar, IconClipboardList, IconCheck, IconPlus } from '@tabler/icons-react';
import { makeT } from '@/i18n';

const tt = makeT({
  de: {
    pageTitle: 'Auftrag anlegen',
    subtitle: 'Kunde wählen, Fahrzeug wählen und Auftrag erstellen',
    stepKunde: 'Kunde',
    stepFahrzeug: 'Fahrzeug',
    stepAuftrag: 'Auftrag',
    stepFertig: 'Fertig',
    kundeSearch: 'Kunden suchen …',
    kundeEmpty: 'Keine Kunden gefunden',
    neuerKunde: 'Neuen Kunden anlegen',
    kundeVorname: 'Vorname',
    kundeNachname: 'Nachname',
    kundeEmail: 'E-Mail',
    kundeTelefon: 'Telefon',
    kundeAnlegen: 'Kunden anlegen',
    fahrzeugSearch: 'Fahrzeug suchen …',
    fahrzeugEmpty: 'Keine Fahrzeuge für diesen Kunden',
    fahrzeugEmptyHint: 'Diesem Kunden sind noch keine Fahrzeuge zugeordnet.',
    neuesFahrzeug: 'Neues Fahrzeug anlegen',
    fahrzeugKennzeichen: 'Kennzeichen',
    fahrzeugMarke: 'Marke',
    fahrzeugModell: 'Modell',
    fahrzeugBaujahr: 'Baujahr',
    fahrzeugAnlegen: 'Fahrzeug anlegen',
    auftragsnummer: 'Auftragsnummer',
    arbeitsbeschreibung: 'Arbeitsbeschreibung',
    wunschtermin: 'Wunschtermin',
    prioritaetLabel: 'Priorität',
    statusLabel: 'Status',
    bemerkungen: 'Bemerkungen',
    arbeitsbeschreibungPlaceholder: 'z.B. Ölwechsel, Bremsenprüfung …',
    bemerkungenPlaceholder: 'Optionale Anmerkungen …',
    auftragErstellen: 'Auftrag erstellen',
    zurueck: 'Zurück',
    weiter: 'Weiter',
    erfolgTitel: 'Auftrag erfolgreich angelegt!',
    erfolgNummer: 'Auftragsnummer',
    neuerAuftrag: 'Neuen Auftrag anlegen',
    zurueckDashboard: 'Zurück zum Dashboard',
    prerequisiteHint: 'Dieser Schritt braucht die Auswahl aus einem vorherigen Schritt.',
    neuStarten: 'Neu starten',
    niedrig: 'Niedrig',
    normal: 'Normal',
    hoch: 'Hoch',
    offen: 'Offen',
    inBearbeitung: 'In Bearbeitung',
    abgeschlossen: 'Abgeschlossen',
  },
  en: {
    pageTitle: 'Create Job',
    subtitle: 'Choose customer, vehicle, and create job order',
    stepKunde: 'Customer',
    stepFahrzeug: 'Vehicle',
    stepAuftrag: 'Job',
    stepFertig: 'Done',
    kundeSearch: 'Search customers …',
    kundeEmpty: 'No customers found',
    neuerKunde: 'Add new customer',
    kundeVorname: 'First name',
    kundeNachname: 'Last name',
    kundeEmail: 'Email',
    kundeTelefon: 'Phone',
    kundeAnlegen: 'Add customer',
    fahrzeugSearch: 'Search vehicle …',
    fahrzeugEmpty: 'No vehicles for this customer',
    fahrzeugEmptyHint: 'No vehicles are assigned to this customer yet.',
    neuesFahrzeug: 'Add new vehicle',
    fahrzeugKennzeichen: 'License plate',
    fahrzeugMarke: 'Make',
    fahrzeugModell: 'Model',
    fahrzeugBaujahr: 'Year',
    fahrzeugAnlegen: 'Add vehicle',
    auftragsnummer: 'Job number',
    arbeitsbeschreibung: 'Work description',
    wunschtermin: 'Desired date',
    prioritaetLabel: 'Priority',
    statusLabel: 'Status',
    bemerkungen: 'Notes',
    arbeitsbeschreibungPlaceholder: 'e.g. oil change, brake inspection …',
    bemerkungenPlaceholder: 'Optional notes …',
    auftragErstellen: 'Create job',
    zurueck: 'Back',
    weiter: 'Next',
    erfolgTitel: 'Job created successfully!',
    erfolgNummer: 'Job number',
    neuerAuftrag: 'Create another job',
    zurueckDashboard: 'Back to dashboard',
    prerequisiteHint: 'This step requires a selection from a previous step.',
    neuStarten: 'Start over',
    niedrig: 'Low',
    normal: 'Normal',
    hoch: 'High',
    offen: 'Open',
    inBearbeitung: 'In progress',
    abgeschlossen: 'Completed',
  },
});

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function AuftragAnlegenPage() {
  const [searchParams] = useSearchParams();
  const initialStep = parseInt(searchParams.get('step') ?? '1', 10);

  const { kunden, fahrzeuge, fetchAll, loading, error } = useDashboardData();

  const [step, setStep] = useState(isNaN(initialStep) || initialStep < 1 || initialStep > 4 ? 1 : initialStep);

  // Step 1 — Kunde
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [kundeVorname, setKundeVorname] = useState('');
  const [kundeNachname, setKundeNachname] = useState('');
  const [kundeEmail, setKundeEmail] = useState('');
  const [kundeTelefon, setKundeTelefon] = useState('');
  const [savingKunde, setSavingKunde] = useState(false);

  // Step 2 — Fahrzeug
  const [selectedFahrzeugId, setSelectedFahrzeugId] = useState<string | null>(null);
  const [showCreateFahrzeug, setShowCreateFahrzeug] = useState(false);
  const [fahrzeugKennzeichen, setFahrzeugKennzeichen] = useState('');
  const [fahrzeugMarke, setFahrzeugMarke] = useState('');
  const [fahrzeugModell, setFahrzeugModell] = useState('');
  const [fahrzeugBaujahr, setFahrzeugBaujahr] = useState('');
  const [savingFahrzeug, setSavingFahrzeug] = useState(false);

  // Step 3 — Auftrag
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [prioritaetKey, setPrioritaetKey] = useState(PRIORITAET_OPTIONS[0]?.key ?? '');
  const [statusKey] = useState('offen');
  const [bemerkungen, setBemerkungen] = useState('');
  const [savingAuftrag, setSavingAuftrag] = useState(false);
  const [auftragError, setAuftragError] = useState<string | null>(null);

  // Step 4 — Erfolg
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState<string | null>(null);

  const selectedKunde: Kunden | undefined = kunden.find((k) => k.record_id === selectedKundeId);
  const filteredFahrzeuge: Fahrzeuge[] = fahrzeuge.filter(
    (f) =>
      selectedKundeId &&
      f.fields.kunde === createRecordUrl(APP_IDS.KUNDEN, selectedKundeId)
  );

  const handleCreateKunde = async () => {
    if (!kundeVorname || !kundeNachname) return;
    setSavingKunde(true);
    try {
      const created = await LivingAppsService.createKundenEntry({
        vorname: kundeVorname,
        nachname: kundeNachname,
        email: kundeEmail || undefined,
        telefon: kundeTelefon || undefined,
      });
      await fetchAll();
      setShowCreateKunde(false);
      setKundeVorname('');
      setKundeNachname('');
      setKundeEmail('');
      setKundeTelefon('');
      setSelectedKundeId(created.record_id);
      setStep(2);
    } finally {
      setSavingKunde(false);
    }
  };

  const handleCreateFahrzeug = async () => {
    if (!fahrzeugKennzeichen || !selectedKundeId) return;
    setSavingFahrzeug(true);
    try {
      const created = await LivingAppsService.createFahrzeugeEntry({
        kennzeichen: fahrzeugKennzeichen,
        marke: fahrzeugMarke || undefined,
        modell: fahrzeugModell || undefined,
        baujahr: fahrzeugBaujahr ? parseInt(fahrzeugBaujahr, 10) : undefined,
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      });
      await fetchAll();
      setShowCreateFahrzeug(false);
      setFahrzeugKennzeichen('');
      setFahrzeugMarke('');
      setFahrzeugModell('');
      setFahrzeugBaujahr('');
      setSelectedFahrzeugId(created.record_id);
      setStep(3);
    } finally {
      setSavingFahrzeug(false);
    }
  };

  const handleCreateAuftrag = async () => {
    if (!auftragsnummer || !arbeitsbeschreibung || !selectedKundeId || !selectedFahrzeugId) return;
    setSavingAuftrag(true);
    setAuftragError(null);
    try {
      await LivingAppsService.createAuftraegeEntry({
        auftragsnummer,
        arbeitsbeschreibung,
        wunschtermin: wunschtermin || undefined,
        prioritaet: prioritaetKey || undefined,
        status: statusKey,
        bemerkungen_auftrag: bemerkungen || undefined,
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeugId),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      });
      setCreatedAuftragsnummer(auftragsnummer);
      setStep(4);
    } catch (e) {
      setAuftragError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAuftrag(false);
    }
  };

  const handleReset = () => {
    setSelectedKundeId(null);
    setSelectedFahrzeugId(null);
    setAuftragsnummer('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setPrioritaetKey(PRIORITAET_OPTIONS[0]?.key ?? '');
    setBemerkungen('');
    setCreatedAuftragsnummer(null);
    setAuftragError(null);
    setShowCreateKunde(false);
    setShowCreateFahrzeug(false);
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
        { label: tt('stepFertig') },
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
          items={kunden.map((k) => ({
            id: k.record_id,
            title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.telefon].filter(Boolean).join(' · '),
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            setSelectedKundeId(id);
            setSelectedFahrzeugId(null);
            setStep(2);
          }}
          searchPlaceholder={tt('kundeSearch')}
          emptyText={tt('kundeEmpty')}
          createLabel={tt('neuerKunde')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={
            showCreateKunde ? (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{tt('kundeVorname')}</Label>
                    <Input
                      value={kundeVorname}
                      onChange={(e) => setKundeVorname(e.target.value)}
                      placeholder={tt('kundeVorname')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tt('kundeNachname')}</Label>
                    <Input
                      value={kundeNachname}
                      onChange={(e) => setKundeNachname(e.target.value)}
                      placeholder={tt('kundeNachname')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tt('kundeEmail')}</Label>
                    <Input
                      type="email"
                      value={kundeEmail}
                      onChange={(e) => setKundeEmail(e.target.value)}
                      placeholder={tt('kundeEmail')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tt('kundeTelefon')}</Label>
                    <Input
                      type="tel"
                      value={kundeTelefon}
                      onChange={(e) => setKundeTelefon(e.target.value)}
                      placeholder={tt('kundeTelefon')}
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    disabled={!kundeVorname || !kundeNachname || savingKunde}
                    onClick={handleCreateKunde}
                  >
                    <IconPlus size={16} stroke={2} className="mr-1" />
                    {tt('kundeAnlegen')}
                  </Button>
                  <Button variant="outline" onClick={() => setShowCreateKunde(false)}>
                    {tt('zurueck')}
                  </Button>
                </div>
              </div>
            ) : null
          }
        />
      )}

      {/* Step 2: Fahrzeug wählen */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <IconUser size={16} stroke={2} />
              <span>
                {[selectedKunde?.fields.vorname, selectedKunde?.fields.nachname].filter(Boolean).join(' ') || selectedKundeId}
              </span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => setStep(1)}>
                {tt('zurueck')}
              </Button>
            </div>
            <EntitySelectStep
              items={filteredFahrzeuge.map((f) => ({
                id: f.record_id,
                title: [f.fields.kennzeichen, f.fields.marke, f.fields.modell].filter(Boolean).join(' · ') || f.record_id,
                subtitle: f.fields.baujahr ? String(f.fields.baujahr) : undefined,
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={(id) => {
                setSelectedFahrzeugId(id);
                setStep(3);
              }}
              searchPlaceholder={tt('fahrzeugSearch')}
              emptyText={tt('fahrzeugEmpty')}
              createLabel={tt('neuesFahrzeug')}
              onCreateNew={() => setShowCreateFahrzeug(true)}
              createDialog={
                showCreateFahrzeug ? (
                  <div className="rounded-2xl border bg-card p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>{tt('fahrzeugKennzeichen')}</Label>
                        <Input
                          value={fahrzeugKennzeichen}
                          onChange={(e) => setFahrzeugKennzeichen(e.target.value)}
                          placeholder={tt('fahrzeugKennzeichen')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>{tt('fahrzeugMarke')}</Label>
                        <Input
                          value={fahrzeugMarke}
                          onChange={(e) => setFahrzeugMarke(e.target.value)}
                          placeholder={tt('fahrzeugMarke')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>{tt('fahrzeugModell')}</Label>
                        <Input
                          value={fahrzeugModell}
                          onChange={(e) => setFahrzeugModell(e.target.value)}
                          placeholder={tt('fahrzeugModell')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>{tt('fahrzeugBaujahr')}</Label>
                        <Input
                          type="number"
                          value={fahrzeugBaujahr}
                          onChange={(e) => setFahrzeugBaujahr(e.target.value)}
                          placeholder="2020"
                          min={1900}
                          max={2100}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        disabled={!fahrzeugKennzeichen || savingFahrzeug}
                        onClick={handleCreateFahrzeug}
                      >
                        <IconPlus size={16} stroke={2} className="mr-1" />
                        {tt('fahrzeugAnlegen')}
                      </Button>
                      <Button variant="outline" onClick={() => setShowCreateFahrzeug(false)}>
                        {tt('zurueck')}
                      </Button>
                    </div>
                  </div>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('prerequisiteHint')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}

      {/* Step 3: Auftrag anlegen */}
      {step === 3 && (
        selectedKundeId && selectedFahrzeugId ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1">
                <IconUser size={14} stroke={2} />
                {[selectedKunde?.fields.vorname, selectedKunde?.fields.nachname].filter(Boolean).join(' ') || selectedKundeId}
              </span>
              <span className="flex items-center gap-1">
                <IconCar size={14} stroke={2} />
                {(() => {
                  const fz = fahrzeuge.find((f) => f.record_id === selectedFahrzeugId);
                  return [fz?.fields.kennzeichen, fz?.fields.marke, fz?.fields.modell].filter(Boolean).join(' · ') || selectedFahrzeugId;
                })()}
              </span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => setStep(2)}>
                {tt('zurueck')}
              </Button>
            </div>

            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <div className="space-y-1">
                <Label htmlFor="auftragsnummer">{tt('auftragsnummer')} *</Label>
                <Input
                  id="auftragsnummer"
                  value={auftragsnummer}
                  onChange={(e) => setAuftragsnummer(e.target.value)}
                  placeholder="AU-2026-001"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="arbeitsbeschreibung">{tt('arbeitsbeschreibung')} *</Label>
                <Textarea
                  id="arbeitsbeschreibung"
                  value={arbeitsbeschreibung}
                  onChange={(e) => setArbeitsbeschreibung(e.target.value)}
                  rows={3}
                  placeholder={tt('arbeitsbeschreibungPlaceholder')}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="wunschtermin">{tt('wunschtermin')}</Label>
                <Input
                  id="wunschtermin"
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={(e) => setWunschtermin(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>{tt('prioritaetLabel')}</Label>
                <div className="flex flex-wrap gap-2">
                  {PRIORITAET_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPrioritaetKey(opt.key)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
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

              <div className="space-y-1">
                <Label htmlFor="status">{tt('statusLabel')} *</Label>
                <Select value={statusKey} disabled>
                  <SelectTrigger id="status">
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

              <div className="space-y-1">
                <Label htmlFor="bemerkungen">{tt('bemerkungen')}</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungen}
                  onChange={(e) => setBemerkungen(e.target.value)}
                  rows={2}
                  placeholder={tt('bemerkungenPlaceholder')}
                />
              </div>

              {auftragError && (
                <p className="text-sm text-destructive">{auftragError}</p>
              )}

              <Button
                className="w-full"
                disabled={!auftragsnummer || !arbeitsbeschreibung || savingAuftrag}
                onClick={handleCreateAuftrag}
              >
                <IconClipboardList size={16} stroke={2} className="mr-2" />
                {tt('auftragErstellen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('prerequisiteHint')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}

      {/* Step 4: Erfolg */}
      {step === 4 && (
        createdAuftragsnummer ? (
          <div className="flex flex-col items-center text-center py-10 space-y-6">
            <div className="rounded-full bg-primary/10 p-5">
              <IconCheck size={40} stroke={2} className="text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{tt('erfolgTitel')}</h2>
              <p className="text-muted-foreground text-sm">
                {tt('erfolgNummer')}: <span className="font-medium text-foreground">{createdAuftragsnummer}</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <Button className="w-full" onClick={handleReset}>
                {tt('neuerAuftrag')}
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <a href="#/">{tt('zurueckDashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('prerequisiteHint')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
