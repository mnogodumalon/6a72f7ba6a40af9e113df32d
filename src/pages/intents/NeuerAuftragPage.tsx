/**
 * Neuer Auftrag — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen oder neu erstellen → 2) Fahrzeug wählen oder neu anlegen →
 *        3) Auftrag erfassen & anlegen.
 * Reads: kunden, fahrzeuge. Writes: kunden (createKundenEntry), fahrzeuge (createFahrzeugeEntry),
 *        auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kunden, Fahrzeuge } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { makeT } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  IconCar,
  IconUser,
  IconClipboardList,
  IconCheck,
  IconAlertCircle,
} from '@tabler/icons-react';

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const tt = makeT({
  de: {
    stepKunde: 'Kunde',
    stepFahrzeug: 'Fahrzeug',
    stepAuftrag: 'Auftrag',
    pageTitle: 'Neuer Werkstattauftrag',
    subtitle: 'Schritt für Schritt zum fertigen Auftrag',
    kundeSelectPlaceholder: 'Kunden suchen …',
    kundeCreateLabel: 'Neuen Kunden anlegen',
    fahrzeugSelectPlaceholder: 'Fahrzeug suchen …',
    fahrzeugCreateLabel: 'Neues Fahrzeug anlegen',
    vorname: 'Vorname',
    nachname: 'Nachname',
    email: 'E-Mail',
    telefon: 'Telefon',
    anlegen: 'Anlegen',
    kennzeichen: 'Kennzeichen',
    marke: 'Marke',
    modell: 'Modell',
    baujahr: 'Baujahr',
    kilometerstand: 'Kilometerstand (km)',
    arbeitsbeschreibung: 'Arbeitsbeschreibung',
    auftragsnummer: 'Auftragsnummer',
    wunschtermin: 'Wunschtermin',
    prioritaetLabel: 'Priorität',
    bemerkungen: 'Bemerkungen (optional)',
    auftragAnlegen: 'Auftrag anlegen',
    zurueck: 'Zurück',
    weiter: 'Weiter',
    erfolgTitel: 'Auftrag angelegt!',
    erfolgText: 'Der Werkstattauftrag wurde erfolgreich erstellt.',
    neuerAuftrag: 'Neuen Auftrag anlegen',
    zuDashboard: 'Zurück zum Dashboard',
    keineVoraussetzung: 'Dieser Schritt braucht die Auswahl aus einem vorherigen Schritt.',
    neuStarten: 'Neu starten',
    fehler: 'Fehler beim Anlegen',
    keineFahrzeuge: 'Noch kein Fahrzeug für diesen Kunden',
    keineFahrzeugeHinweis: 'Leg jetzt das erste Fahrzeug für diesen Kunden an.',
    auftragsnummerPlaceholder: 'z.B. AU-2026-001',
    modellPlaceholder: 'z.B. Golf',
  },
  en: {
    stepKunde: 'Customer',
    stepFahrzeug: 'Vehicle',
    stepAuftrag: 'Order',
    pageTitle: 'New Workshop Order',
    subtitle: 'Step by step to a completed order',
    kundeSelectPlaceholder: 'Search customers …',
    kundeCreateLabel: 'Add new customer',
    fahrzeugSelectPlaceholder: 'Search vehicles …',
    fahrzeugCreateLabel: 'Add new vehicle',
    vorname: 'First name',
    nachname: 'Last name',
    email: 'Email',
    telefon: 'Phone',
    anlegen: 'Create',
    kennzeichen: 'License plate',
    marke: 'Make',
    modell: 'Model',
    baujahr: 'Year',
    kilometerstand: 'Mileage (km)',
    arbeitsbeschreibung: 'Work description',
    auftragsnummer: 'Order number',
    wunschtermin: 'Desired date',
    prioritaetLabel: 'Priority',
    bemerkungen: 'Notes (optional)',
    auftragAnlegen: 'Create order',
    zurueck: 'Back',
    weiter: 'Next',
    erfolgTitel: 'Order created!',
    erfolgText: 'The workshop order was successfully created.',
    neuerAuftrag: 'Create new order',
    zuDashboard: 'Back to dashboard',
    keineVoraussetzung: 'This step requires a selection from a previous step.',
    neuStarten: 'Start over',
    fehler: 'Error creating order',
    keineFahrzeuge: 'No vehicles for this customer yet',
    keineFahrzeugeHinweis: 'Create the first vehicle for this customer.',
    auftragsnummerPlaceholder: 'e.g. AU-2026-001',
    modellPlaceholder: 'e.g. Golf',
  },
  cs: {
    stepKunde: 'Zákazník',
    stepFahrzeug: 'Vozidlo',
    stepAuftrag: 'Zakázka',
    pageTitle: 'Nová zakázka dílny',
    subtitle: 'Krok za krokem k dokončené zakázce',
    kundeSelectPlaceholder: 'Hledat zákazníky …',
    kundeCreateLabel: 'Přidat nového zákazníka',
    fahrzeugSelectPlaceholder: 'Hledat vozidla …',
    fahrzeugCreateLabel: 'Přidat nové vozidlo',
    vorname: 'Jméno',
    nachname: 'Příjmení',
    email: 'E-mail',
    telefon: 'Telefon',
    anlegen: 'Vytvořit',
    kennzeichen: 'SPZ',
    marke: 'Značka',
    modell: 'Model',
    baujahr: 'Rok výroby',
    kilometerstand: 'Počet km',
    arbeitsbeschreibung: 'Popis práce',
    auftragsnummer: 'Číslo zakázky',
    wunschtermin: 'Požadovaný termín',
    prioritaetLabel: 'Priorita',
    bemerkungen: 'Poznámky (volitelné)',
    auftragAnlegen: 'Vytvořit zakázku',
    zurueck: 'Zpět',
    weiter: 'Dále',
    erfolgTitel: 'Zakázka vytvořena!',
    erfolgText: 'Zakázka dílny byla úspěšně vytvořena.',
    neuerAuftrag: 'Vytvořit novou zakázku',
    zuDashboard: 'Zpět na přehled',
    keineVoraussetzung: 'Tento krok vyžaduje výběr z předchozího kroku.',
    neuStarten: 'Začít znovu',
    fehler: 'Chyba při vytváření',
    keineFahrzeuge: 'Pro tohoto zákazníka zatím žádné vozidlo',
    keineFahrzeugeHinweis: 'Přidejte první vozidlo pro tohoto zákazníka.',
    auftragsnummerPlaceholder: 'např. AU-2026-001',
    modellPlaceholder: 'např. Golf',
  },
});

const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function NeuerAuftragPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStep = parseInt(searchParams.get('step') ?? '1', 10);
  const initialKundeId = searchParams.get('kundeId') ?? '';
  const initialFahrzeugId = searchParams.get('fahrzeugId') ?? '';

  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  // Wizard state
  const [step, setStep] = useState(Math.max(1, Math.min(3, isNaN(initialStep) ? 1 : initialStep)));
  const [selectedKundeId, setSelectedKundeId] = useState<string>(initialKundeId);
  const [selectedFahrzeugId, setSelectedFahrzeugId] = useState<string>(initialFahrzeugId);
  const [createdAuftragId, setCreatedAuftragId] = useState<string>('');

  // Step 1 — Kunde mini-form
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [kundeVorname, setKundeVorname] = useState('');
  const [kundeNachname, setKundeNachname] = useState('');
  const [kundeEmail, setKundeEmail] = useState('');
  const [kundeTelefon, setKundeTelefon] = useState('');
  const [kundeCreating, setKundeCreating] = useState(false);
  const [kundeError, setKundeError] = useState('');

  // Step 2 — Fahrzeug mini-form
  const [showCreateFahrzeug, setShowCreateFahrzeug] = useState(false);
  const [fahrzeugKennzeichen, setFahrzeugKennzeichen] = useState('');
  const [fahrzeugMarke, setFahrzeugMarke] = useState('');
  const [fahrzeugModell, setFahrzeugModell] = useState('');
  const [fahrzeugBaujahr, setFahrzeugBaujahr] = useState('');
  const [fahrzeugKm, setFahrzeugKm] = useState('');
  const [fahrzeugCreating, setFahrzeugCreating] = useState(false);
  const [fahrzeugError, setFahrzeugError] = useState('');

  // Step 3 — Auftrag form
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [prioritaetKey, setPrioritaetKey] = useState(PRIORITAET_OPTIONS[1]?.key ?? PRIORITAET_OPTIONS[0]?.key ?? '');
  const [bemerkungen, setBemerkungen] = useState('');
  const [auftragSubmitting, setAuftragSubmitting] = useState(false);
  const [auftragError, setAuftragError] = useState('');

  // URL sync helper
  const updateUrlStep = useCallback((nextStep: number) => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('step', String(nextStep));
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  const handleStepChange = (s: number) => {
    setStep(s);
    updateUrlStep(s);
  };

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleKundeSelect = (id: string) => {
    setSelectedKundeId(id);
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('kundeId', id);
      p.set('step', '2');
      return p;
    }, { replace: true });
    setStep(2);
  };

  const handleCreateKunde = async () => {
    if (!kundeVorname.trim() || !kundeNachname.trim()) return;
    setKundeCreating(true);
    setKundeError('');
    try {
      const created = await LivingAppsService.createKundenEntry({
        vorname: kundeVorname.trim(),
        nachname: kundeNachname.trim(),
        email: kundeEmail.trim() || undefined,
        telefon: kundeTelefon.trim() || undefined,
      });
      await fetchAll();
      setShowCreateKunde(false);
      setKundeVorname('');
      setKundeNachname('');
      setKundeEmail('');
      setKundeTelefon('');
      handleKundeSelect(created.record_id);
    } catch (e) {
      setKundeError(e instanceof Error ? e.message : String(e));
    } finally {
      setKundeCreating(false);
    }
  };

  const handleFahrzeugSelect = (id: string) => {
    setSelectedFahrzeugId(id);
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('fahrzeugId', id);
      p.set('step', '3');
      return p;
    }, { replace: true });
    setStep(3);
  };

  const handleCreateFahrzeug = async () => {
    if (!fahrzeugKennzeichen.trim() || !fahrzeugMarke.trim() || !fahrzeugModell.trim() || !selectedKundeId) return;
    setFahrzeugCreating(true);
    setFahrzeugError('');
    try {
      const payload: Fahrzeuge['fields'] = {
        kennzeichen: fahrzeugKennzeichen.trim(),
        marke: fahrzeugMarke.trim(),
        modell: fahrzeugModell.trim(),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      };
      if (fahrzeugBaujahr.trim()) payload.baujahr = parseInt(fahrzeugBaujahr, 10);
      if (fahrzeugKm.trim()) payload.kilometerstand = parseInt(fahrzeugKm, 10);

      const created = await LivingAppsService.createFahrzeugeEntry(payload);
      await fetchAll();
      setShowCreateFahrzeug(false);
      setFahrzeugKennzeichen('');
      setFahrzeugMarke('');
      setFahrzeugModell('');
      setFahrzeugBaujahr('');
      setFahrzeugKm('');
      handleFahrzeugSelect(created.record_id);
    } catch (e) {
      setFahrzeugError(e instanceof Error ? e.message : String(e));
    } finally {
      setFahrzeugCreating(false);
    }
  };

  const handleCreateAuftrag = async () => {
    if (!arbeitsbeschreibung.trim() || !auftragsnummer.trim() || !selectedKundeId || !selectedFahrzeugId) return;
    if (createdAuftragId) return; // idempotency guard — already created
    setAuftragSubmitting(true);
    setAuftragError('');
    try {
      const created = await LivingAppsService.createAuftraegeEntry({
        arbeitsbeschreibung: arbeitsbeschreibung.trim(),
        auftragsnummer: auftragsnummer.trim(),
        status: 'offen',
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeugId),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
        ...(prioritaetKey ? { prioritaet: prioritaetKey } : {}),
        ...(wunschtermin ? { wunschtermin } : {}),
        ...(bemerkungen.trim() ? { bemerkungen_auftrag: bemerkungen.trim() } : {}),
      });
      setCreatedAuftragId(created.record_id);
    } catch (e) {
      setAuftragError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuftragSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKundeId('');
    setSelectedFahrzeugId('');
    setCreatedAuftragId('');
    setArbeitsbeschreibung('');
    setAuftragsnummer('');
    setWunschtermin('');
    setPrioritaetKey(PRIORITAET_OPTIONS[1]?.key ?? PRIORITAET_OPTIONS[0]?.key ?? '');
    setBemerkungen('');
    setAuftragError('');
    setSearchParams({}, { replace: true });
  };

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const kundenItems = kunden.map((k: Kunden) => ({
    id: k.record_id,
    title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || k.record_id,
    subtitle: [k.fields.email, k.fields.telefon].filter(Boolean).join(' · '),
    icon: <IconUser size={20} className="text-primary" />,
  }));

  const fahrzeugeFuerKunde = fahrzeuge.filter((f: Fahrzeuge) =>
    extractRecordId(f.fields.kunde) === selectedKundeId
  );

  const fahrzeugeItems = fahrzeugeFuerKunde.map((f: Fahrzeuge) => ({
    id: f.record_id,
    title: [f.fields.kennzeichen, f.fields.marke, f.fields.modell].filter(Boolean).join(' · '),
    subtitle: [
      f.fields.baujahr ? String(f.fields.baujahr) : null,
      f.fields.kilometerstand != null ? `${f.fields.kilometerstand.toLocaleString('de')} km` : null,
    ].filter(Boolean).join(' · '),
    icon: <IconCar size={20} className="text-primary" />,
  }));

  const selectedKunde = kunden.find((k: Kunden) => k.record_id === selectedKundeId);
  const selectedFahrzeug = fahrzeuge.find((f: Fahrzeuge) => f.record_id === selectedFahrzeugId);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('stepKunde') },
        { label: tt('stepFahrzeug') },
        { label: tt('stepAuftrag') },
      ]}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ------------------------------------------------------------------ */}
      {/* STEP 1 — Kunde wählen                                              */}
      {/* ------------------------------------------------------------------ */}
      {step === 1 && (
        <EntitySelectStep
          items={kundenItems}
          onSelect={handleKundeSelect}
          searchPlaceholder={tt('kundeSelectPlaceholder')}
          createLabel={tt('kundeCreateLabel')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={showCreateKunde && (
            <div className="rounded-2xl border p-4 space-y-3 bg-card">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="k-vorname">{tt('vorname')} *</Label>
                  <Input
                    id="k-vorname"
                    value={kundeVorname}
                    onChange={e => setKundeVorname(e.target.value)}
                    placeholder={tt('vorname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="k-nachname">{tt('nachname')} *</Label>
                  <Input
                    id="k-nachname"
                    value={kundeNachname}
                    onChange={e => setKundeNachname(e.target.value)}
                    placeholder={tt('nachname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="k-email">{tt('email')}</Label>
                  <Input
                    id="k-email"
                    type="email"
                    value={kundeEmail}
                    onChange={e => setKundeEmail(e.target.value)}
                    placeholder={tt('email')}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="k-telefon">{tt('telefon')}</Label>
                  <Input
                    id="k-telefon"
                    type="tel"
                    value={kundeTelefon}
                    onChange={e => setKundeTelefon(e.target.value)}
                    placeholder={tt('telefon')}
                  />
                </div>
              </div>
              {kundeError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <IconAlertCircle size={14} stroke={2} /> {kundeError}
                </p>
              )}
              <Button
                disabled={!kundeVorname.trim() || !kundeNachname.trim() || kundeCreating}
                onClick={handleCreateKunde}
                className="w-full"
              >
                {tt('anlegen')}
              </Button>
            </div>
          )}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP 2 — Fahrzeug wählen                                           */}
      {/* ------------------------------------------------------------------ */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-4">
            {selectedKunde && (
              <div className="rounded-xl border px-4 py-3 bg-secondary/40 flex items-center gap-2 text-sm text-muted-foreground">
                <IconUser size={15} stroke={2} />
                <span>
                  {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                  {selectedKunde.fields.email && ` · ${selectedKunde.fields.email}`}
                </span>
              </div>
            )}
            <EntitySelectStep
              items={fahrzeugeItems}
              onSelect={handleFahrzeugSelect}
              searchPlaceholder={tt('fahrzeugSelectPlaceholder')}
              createLabel={tt('fahrzeugCreateLabel')}
              onCreateNew={() => setShowCreateFahrzeug(true)}
              emptyText={tt('keineFahrzeuge')}
              createDialog={showCreateFahrzeug && (
                <div className="rounded-2xl border p-4 space-y-3 bg-card">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="f-kennzeichen">{tt('kennzeichen')} *</Label>
                      <Input
                        id="f-kennzeichen"
                        value={fahrzeugKennzeichen}
                        onChange={e => setFahrzeugKennzeichen(e.target.value)}
                        placeholder="z.B. M-AB 1234"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="f-marke">{tt('marke')} *</Label>
                      <Input
                        id="f-marke"
                        value={fahrzeugMarke}
                        onChange={e => setFahrzeugMarke(e.target.value)}
                        placeholder="z.B. VW"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="f-modell">{tt('modell')} *</Label>
                      <Input
                        id="f-modell"
                        value={fahrzeugModell}
                        onChange={e => setFahrzeugModell(e.target.value)}
                        placeholder={tt('modellPlaceholder')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="f-baujahr">{tt('baujahr')}</Label>
                      <Input
                        id="f-baujahr"
                        type="number"
                        value={fahrzeugBaujahr}
                        onChange={e => setFahrzeugBaujahr(e.target.value)}
                        placeholder="z.B. 2018"
                        min={1900}
                        max={2100}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="f-km">{tt('kilometerstand')}</Label>
                      <Input
                        id="f-km"
                        type="number"
                        value={fahrzeugKm}
                        onChange={e => setFahrzeugKm(e.target.value)}
                        placeholder="z.B. 45000"
                        min={0}
                      />
                    </div>
                  </div>
                  {fahrzeugError && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <IconAlertCircle size={14} stroke={2} /> {fahrzeugError}
                    </p>
                  )}
                  <Button
                    disabled={!fahrzeugKennzeichen.trim() || !fahrzeugMarke.trim() || !fahrzeugModell.trim() || fahrzeugCreating}
                    onClick={handleCreateFahrzeug}
                    className="w-full"
                  >
                    {tt('anlegen')}
                  </Button>
                </div>
              )}
            />
            <div className="pt-2">
              <Button variant="outline" onClick={() => handleStepChange(1)}>
                {tt('zurueck')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('keineVoraussetzung')}</p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP 3 — Auftrag erfassen                                          */}
      {/* ------------------------------------------------------------------ */}
      {step === 3 && (
        selectedKundeId && selectedFahrzeugId ? (
          createdAuftragId ? (
            /* Success state */
            <div className="flex flex-col items-center text-center py-12 space-y-4">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCheck size={36} className="text-primary" stroke={2} />
              </div>
              <h2 className="text-xl font-semibold">{tt('erfolgTitel')}</h2>
              <p className="text-sm text-muted-foreground max-w-sm">{tt('erfolgText')}</p>
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button onClick={handleReset}>{tt('neuerAuftrag')}</Button>
                <Button variant="outline" asChild>
                  <a href="#/">{tt('zuDashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            /* Auftrag form */
            <div className="space-y-4 max-w-xl">
              {/* Context summary */}
              <div className="rounded-xl border px-4 py-3 bg-secondary/40 space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <IconUser size={14} stroke={2} />
                  <span>{[selectedKunde?.fields.vorname, selectedKunde?.fields.nachname].filter(Boolean).join(' ')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <IconCar size={14} stroke={2} />
                  <span>
                    {[selectedFahrzeug?.fields.kennzeichen, selectedFahrzeug?.fields.marke, selectedFahrzeug?.fields.modell].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </div>

              {/* Auftragsnummer */}
              <div className="space-y-1">
                <Label htmlFor="a-nummer">{tt('auftragsnummer')} *</Label>
                <Input
                  id="a-nummer"
                  value={auftragsnummer}
                  onChange={e => setAuftragsnummer(e.target.value)}
                  placeholder={tt('auftragsnummerPlaceholder')}
                />
              </div>

              {/* Arbeitsbeschreibung */}
              <div className="space-y-1">
                <Label htmlFor="a-beschreibung">{tt('arbeitsbeschreibung')} *</Label>
                <Textarea
                  id="a-beschreibung"
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  rows={4}
                  placeholder={tt('arbeitsbeschreibung')}
                />
              </div>

              {/* Wunschtermin */}
              <div className="space-y-1">
                <Label htmlFor="a-termin">{tt('wunschtermin')}</Label>
                <Input
                  id="a-termin"
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={e => setWunschtermin(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Priorität */}
              {PRIORITAET_OPTIONS.length > 0 && (
                <div className="space-y-2">
                  <Label>{tt('prioritaetLabel')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {PRIORITAET_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setPrioritaetKey(opt.key)}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
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
              )}

              {/* Bemerkungen */}
              <div className="space-y-1">
                <Label htmlFor="a-bemerkungen">{tt('bemerkungen')}</Label>
                <Textarea
                  id="a-bemerkungen"
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  rows={2}
                  placeholder={tt('bemerkungen')}
                />
              </div>

              {auftragError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <IconAlertCircle size={14} stroke={2} /> {auftragError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => handleStepChange(2)}>
                  {tt('zurueck')}
                </Button>
                <Button
                  disabled={!arbeitsbeschreibung.trim() || !auftragsnummer.trim() || auftragSubmitting}
                  onClick={handleCreateAuftrag}
                  className="flex items-center gap-2"
                >
                  <IconClipboardList size={16} stroke={2} />
                  {tt('auftragAnlegen')}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('keineVoraussetzung')}</p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}

