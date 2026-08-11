/**
 * Neuer Auftrag — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen/anlegen → 2) Fahrzeug wählen/anlegen → 3) Auftragsdetails & Anlegen.
 * Reads: kunden, fahrzeuge. Writes: kunden (createKundenEntry), fahrzeuge (createFahrzeugeEntry),
 *        auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconCar, IconUser, IconClipboardList, IconCheck } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { makeT } from '@/i18n';

const tt = makeT({
  de: {
    pageTitle: 'Neuer Auftrag',
    subtitle: 'Werkstattauftrag in drei Schritten anlegen',
    stepKunde: 'Kunde',
    stepFahrzeug: 'Fahrzeug',
    stepDetails: 'Auftragsdetails',
    stepFertig: 'Fertig',
    kundeSelectPlaceholder: 'Kunden suchen …',
    neuerKunde: 'Neuen Kunden anlegen',
    vorname: 'Vorname',
    nachname: 'Nachname',
    anlegen: 'Anlegen',
    fahrzeugSelectPlaceholder: 'Fahrzeug suchen …',
    neuesFahrzeug: 'Neues Fahrzeug anlegen',
    kennzeichen: 'Kennzeichen',
    marke: 'Marke',
    modell: 'Modell',
    arbeitsbeschreibung: 'Arbeitsbeschreibung',
    arbeitsbeschreibungPlaceholder: 'Was soll repariert oder geprüft werden?',
    wunschtermin: 'Wunschtermin',
    prioritaetLabel: 'Priorität',
    bemerkungen: 'Bemerkungen',
    bemerkungenPlaceholder: 'Weitere Hinweise zum Auftrag …',
    auftragAnlegen: 'Auftrag anlegen',
    weiterZuFahrzeug: 'Weiter zu Fahrzeug',
    weiterZuDetails: 'Weiter zu Details',
    zurueckZuKunde: 'Zurück zu Kunde',
    zurueckZuFahrzeug: 'Zurück zu Fahrzeug',
    erfolgTitel: 'Auftrag erfolgreich angelegt',
    erfolgText: 'Dein Auftrag wurde erfolgreich angelegt.',
    auftragsnummerLabel: 'Auftragsnummer',
    neuerAuftrag: 'Weiteren Auftrag anlegen',
    zurueckDashboard: 'Zurück zum Dashboard',
    neustart: 'Neu starten',
    keineVoraussetzung: 'Dieser Schritt braucht die Auswahl aus einem vorherigen Schritt.',
    keineFahrzeuge: 'Keine Fahrzeuge für diesen Kunden gefunden.',
    pflichtfeld: 'Pflichtfeld',
    niedrig: 'Niedrig',
    normal: 'Normal',
    hoch: 'Hoch',
  },
  en: {
    pageTitle: 'New Order',
    subtitle: 'Create a workshop order in three steps',
    stepKunde: 'Customer',
    stepFahrzeug: 'Vehicle',
    stepDetails: 'Order Details',
    stepFertig: 'Done',
    kundeSelectPlaceholder: 'Search customers …',
    neuerKunde: 'Create new customer',
    vorname: 'First name',
    nachname: 'Last name',
    anlegen: 'Create',
    fahrzeugSelectPlaceholder: 'Search vehicle …',
    neuesFahrzeug: 'Create new vehicle',
    kennzeichen: 'License plate',
    marke: 'Make',
    modell: 'Model',
    arbeitsbeschreibung: 'Work description',
    arbeitsbeschreibungPlaceholder: 'What needs to be repaired or checked?',
    wunschtermin: 'Desired appointment',
    prioritaetLabel: 'Priority',
    bemerkungen: 'Notes',
    bemerkungenPlaceholder: 'Additional notes for the order …',
    auftragAnlegen: 'Create order',
    weiterZuFahrzeug: 'Continue to vehicle',
    weiterZuDetails: 'Continue to details',
    zurueckZuKunde: 'Back to customer',
    zurueckZuFahrzeug: 'Back to vehicle',
    erfolgTitel: 'Order successfully created',
    erfolgText: 'Your order has been successfully created.',
    auftragsnummerLabel: 'Order number',
    neuerAuftrag: 'Create another order',
    zurueckDashboard: 'Back to dashboard',
    neustart: 'Restart',
    keineVoraussetzung: 'This step requires a selection from a previous step.',
    keineFahrzeuge: 'No vehicles found for this customer.',
    pflichtfeld: 'Required field',
    niedrig: 'Low',
    normal: 'Normal',
    hoch: 'High',
  },
  cs: {
    pageTitle: 'Nová zakázka',
    subtitle: 'Vytvořit zakázku dílny ve třech krocích',
    stepKunde: 'Zákazník',
    stepFahrzeug: 'Vozidlo',
    stepDetails: 'Podrobnosti zakázky',
    stepFertig: 'Hotovo',
    kundeSelectPlaceholder: 'Hledat zákazníky …',
    neuerKunde: 'Vytvořit nového zákazníka',
    vorname: 'Jméno',
    nachname: 'Příjmení',
    anlegen: 'Vytvořit',
    fahrzeugSelectPlaceholder: 'Hledat vozidlo …',
    neuesFahrzeug: 'Vytvořit nové vozidlo',
    kennzeichen: 'SPZ',
    marke: 'Značka',
    modell: 'Model',
    arbeitsbeschreibung: 'Popis práce',
    arbeitsbeschreibungPlaceholder: 'Co je třeba opravit nebo zkontrolovat?',
    wunschtermin: 'Požadovaný termín',
    prioritaetLabel: 'Priorita',
    bemerkungen: 'Poznámky',
    bemerkungenPlaceholder: 'Další poznámky k zakázce …',
    auftragAnlegen: 'Vytvořit zakázku',
    weiterZuFahrzeug: 'Pokračovat k vozidlu',
    weiterZuDetails: 'Pokračovat k podrobnostem',
    zurueckZuKunde: 'Zpět k zákazníkovi',
    zurueckZuFahrzeug: 'Zpět k vozidlu',
    erfolgTitel: 'Zakázka úspěšně vytvořena',
    erfolgText: 'Vaše zakázka byla úspěšně vytvořena.',
    auftragsnummerLabel: 'Číslo zakázky',
    neuerAuftrag: 'Vytvořit další zakázku',
    zurueckDashboard: 'Zpět na dashboard',
    neustart: 'Začít znovu',
    keineVoraussetzung: 'Tento krok vyžaduje výběr z předchozího kroku.',
    keineFahrzeuge: 'Pro tohoto zákazníka nebyla nalezena žádná vozidla.',
    pflichtfeld: 'Povinné pole',
    niedrig: 'Nízká',
    normal: 'Normální',
    hoch: 'Vysoká',
  },
});

const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

function generateAuftragsnummer(): string {
  const datePart = format(new Date(), 'yyyy-MM-dd');
  const rand = Math.floor(100 + Math.random() * 900);
  return `AU-${datePart}-${rand}`;
}

export default function NeuerAuftragPage() {
  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1 state
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [neuerVorname, setNeuerVorname] = useState('');
  const [neuerNachname, setNeuerNachname] = useState('');
  const [kundeCreating, setKundeCreating] = useState(false);

  // Step 2 state
  const [selectedFahrzeugId, setSelectedFahrzeugId] = useState<string | null>(null);
  const [showCreateFahrzeug, setShowCreateFahrzeug] = useState(false);
  const [neuesKennzeichen, setNeuesKennzeichen] = useState('');
  const [neueMarke, setNeueMarke] = useState('');
  const [neuesModell, setNeuesModell] = useState('');
  const [fahrzeugCreating, setFahrzeugCreating] = useState(false);

  // Step 3 state
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [prioritaetKey, setPrioritaetKey] = useState(PRIORITAET_OPTIONS[1]?.key ?? '');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 4 (success) state
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState<string | null>(null);

  const handleCreateKunde = async () => {
    if (!neuerVorname.trim() || !neuerNachname.trim()) return;
    setKundeCreating(true);
    try {
      const created = await LivingAppsService.createKundenEntry({
        vorname: neuerVorname.trim(),
        nachname: neuerNachname.trim(),
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNeuerVorname('');
      setNeuerNachname('');
      setSelectedKundeId(created.record_id);
      setStep(2);
    } finally {
      setKundeCreating(false);
    }
  };

  const handleCreateFahrzeug = async () => {
    if (!neuesKennzeichen.trim() || !neueMarke.trim() || !neuesModell.trim() || !selectedKundeId) return;
    setFahrzeugCreating(true);
    try {
      const created = await LivingAppsService.createFahrzeugeEntry({
        kennzeichen: neuesKennzeichen.trim(),
        marke: neueMarke.trim(),
        modell: neuesModell.trim(),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      });
      await fetchAll();
      setShowCreateFahrzeug(false);
      setNeuesKennzeichen('');
      setNeueMarke('');
      setNeuesModell('');
      setSelectedFahrzeugId(created.record_id);
      setStep(3);
    } finally {
      setFahrzeugCreating(false);
    }
  };

  const handleCreateAuftrag = async () => {
    if (!selectedFahrzeugId || !selectedKundeId || !arbeitsbeschreibung.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const auftragsnummer = generateAuftragsnummer();
      await LivingAppsService.createAuftraegeEntry({
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeugId),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
        arbeitsbeschreibung: arbeitsbeschreibung.trim(),
        auftragsnummer,
        status: 'offen',
        ...(wunschtermin ? { wunschtermin } : {}),
        ...(prioritaetKey ? { prioritaet: prioritaetKey } : {}),
        ...(bemerkungen.trim() ? { bemerkungen_auftrag: bemerkungen.trim() } : {}),
      });
      setCreatedAuftragsnummer(auftragsnummer);
      setStep(4);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e));
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
    setNeuerVorname('');
    setNeuerNachname('');
    setNeuesKennzeichen('');
    setNeueMarke('');
    setNeuesModell('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setPrioritaetKey(PRIORITAET_OPTIONS[1]?.key ?? '');
    setBemerkungen('');
    setCreatedAuftragsnummer(null);
    setSubmitError(null);
  };

  const selectedKunde = kunden.find(k => k.record_id === selectedKundeId);
  const fahrzeugeDesKunden = fahrzeuge.filter(
    f => extractRecordId(f.fields.kunde) === selectedKundeId
  );

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
      {/* Step 1: Kunde wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={kunden.map(k => ({
            id: k.record_id,
            title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.telefon, k.fields.email].filter(Boolean).join(' · '),
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            setSelectedKundeId(id);
            setSelectedFahrzeugId(null);
            setStep(2);
          }}
          searchPlaceholder={tt('kundeSelectPlaceholder')}
          createLabel={tt('neuerKunde')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={showCreateKunde && (
            <div className="rounded-2xl border p-4 space-y-3">
              <div className="space-y-1">
                <Label>{tt('vorname')} *</Label>
                <Input
                  value={neuerVorname}
                  onChange={e => setNeuerVorname(e.target.value)}
                  placeholder={tt('vorname')}
                />
              </div>
              <div className="space-y-1">
                <Label>{tt('nachname')} *</Label>
                <Input
                  value={neuerNachname}
                  onChange={e => setNeuerNachname(e.target.value)}
                  placeholder={tt('nachname')}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={!neuerVorname.trim() || !neuerNachname.trim() || kundeCreating}
                  onClick={handleCreateKunde}
                >
                  {tt('anlegen')}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateKunde(false)}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* Step 2: Fahrzeug wählen */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-4">
            {selectedKunde && (
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <IconUser size={14} />
                {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
              </div>
            )}
            <EntitySelectStep
              items={fahrzeugeDesKunden.map(f => ({
                id: f.record_id,
                title: [f.fields.marke, f.fields.modell].filter(Boolean).join(' ') || f.record_id,
                subtitle: f.fields.kennzeichen ?? '',
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={(id) => {
                setSelectedFahrzeugId(id);
                setStep(3);
              }}
              searchPlaceholder={tt('fahrzeugSelectPlaceholder')}
              emptyText={tt('keineFahrzeuge')}
              emptyIcon={<IconCar size={32} className="text-muted-foreground" />}
              createLabel={tt('neuesFahrzeug')}
              onCreateNew={() => setShowCreateFahrzeug(true)}
              createDialog={showCreateFahrzeug && (
                <div className="rounded-2xl border p-4 space-y-3">
                  <div className="space-y-1">
                    <Label>{tt('kennzeichen')} *</Label>
                    <Input
                      value={neuesKennzeichen}
                      onChange={e => setNeuesKennzeichen(e.target.value)}
                      placeholder="z.B. B-AB 1234"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tt('marke')} *</Label>
                    <Input
                      value={neueMarke}
                      onChange={e => setNeueMarke(e.target.value)}
                      placeholder="z.B. VW"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tt('modell')} *</Label>
                    <Input
                      value={neuesModell}
                      onChange={e => setNeuesModell(e.target.value)}
                      placeholder="z.B. Golf" /* i18n-exempt */
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={
                        !neuesKennzeichen.trim() ||
                        !neueMarke.trim() ||
                        !neuesModell.trim() ||
                        fahrzeugCreating
                      }
                      onClick={handleCreateFahrzeug}
                    >
                      {tt('anlegen')}
                    </Button>
                    <Button variant="outline" onClick={() => setShowCreateFahrzeug(false)}>
                      Abbrechen
                    </Button>
                  </div>
                </div>
              )}
            />
            <div className="pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('zurueckZuKunde')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('keineVoraussetzung')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neustart')}</Button>
          </div>
        )
      )}

      {/* Step 3: Auftragsdetails */}
      {step === 3 && (
        selectedKundeId && selectedFahrzeugId ? (
          <div className="space-y-5">
            {selectedKunde && (
              <div className="text-sm text-muted-foreground flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <IconUser size={14} />
                  {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                </span>
                {(() => {
                  const fz = fahrzeuge.find(f => f.record_id === selectedFahrzeugId);
                  return fz ? (
                    <span className="flex items-center gap-1">
                      <IconCar size={14} />
                      {[fz.fields.marke, fz.fields.modell].filter(Boolean).join(' ')}
                      {fz.fields.kennzeichen ? ` (${fz.fields.kennzeichen})` : ''}
                    </span>
                  ) : null;
                })()}
              </div>
            )}

            <div className="space-y-1">
              <Label>{tt('arbeitsbeschreibung')} *</Label>
              <Textarea
                value={arbeitsbeschreibung}
                onChange={e => setArbeitsbeschreibung(e.target.value)}
                placeholder={tt('arbeitsbeschreibungPlaceholder')}
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="space-y-1">
              <Label>{tt('wunschtermin')}</Label>
              <Input
                type="datetime-local"
                value={wunschtermin}
                onChange={e => setWunschtermin(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{tt('prioritaetLabel')}</Label>
              <div className="flex gap-2 flex-wrap">
                {PRIORITAET_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPrioritaetKey(opt.key)}
                    className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                      prioritaetKey === opt.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border text-foreground hover:bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>{tt('bemerkungen')}</Label>
              <Textarea
                value={bemerkungen}
                onChange={e => setBemerkungen(e.target.value)}
                placeholder={tt('bemerkungenPlaceholder')}
                rows={3}
                className="resize-none"
              />
            </div>

            {submitError && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                disabled={!arbeitsbeschreibung.trim() || submitting}
                onClick={handleCreateAuftrag}
              >
                <IconClipboardList size={16} className="mr-1" />
                {tt('auftragAnlegen')}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)}>
                {tt('zurueckZuFahrzeug')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('keineVoraussetzung')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neustart')}</Button>
          </div>
        )
      )}

      {/* Step 4: Erfolg */}
      {step === 4 && (
        createdAuftragsnummer ? (
          <div className="text-center py-12 space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-5">
                <IconCheck size={40} className="text-primary" stroke={2} />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tt('erfolgTitel')}</h2>
              <p className="text-muted-foreground text-sm">{tt('erfolgText')}</p>
              <div className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 mt-2">
                <span className="text-xs text-muted-foreground">{tt('auftragsnummerLabel')}:</span>
                <span className="font-mono font-semibold">{createdAuftragsnummer}</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset}>
                {tt('neuerAuftrag')}
              </Button>
              <a href="#/">
                <Button variant="outline" className="w-full sm:w-auto">
                  {tt('zurueckDashboard')}
                </Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('keineVoraussetzung')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neustart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
