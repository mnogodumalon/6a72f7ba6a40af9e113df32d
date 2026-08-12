/**
 * Neuer Auftrag — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen → 2) Fahrzeug wählen (gefiltert nach Kunde) → 3) Auftragsdetails eingeben & speichern.
 * Reads: kunden, fahrzeuge. Writes: auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kunden, Fahrzeuge } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconUser, IconCar, IconFileText, IconCheck, IconCircleCheck } from '@tabler/icons-react';
import { tx } from '@/i18n';

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function NeuerAuftragPage() {
  const [searchParams] = useSearchParams();
  const initialStep = parseInt(searchParams.get('step') ?? '1', 10);
  const initialKundeId = searchParams.get('kundeId') ?? null;

  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(() => (initialKundeId ? 2 : initialStep));
  const [selectedKunde, setSelectedKunde] = useState<Kunden | null>(() =>
    initialKundeId ? null : null
  );
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(initialKundeId);
  const [selectedFahrzeugId, setSelectedFahrzeugId] = useState<string | null>(null);

  // New Kunde mini-form
  const [showNewKunde, setShowNewKunde] = useState(false);
  const [newKundeVorname, setNewKundeVorname] = useState('');
  const [newKundeNachname, setNewKundeNachname] = useState('');
  const [newKundeTelefon, setNewKundeTelefon] = useState('');
  const [newKundeEmail, setNewKundeEmail] = useState('');
  const [kundeCreating, setKundeCreating] = useState(false);

  // New Fahrzeug mini-form
  const [showNewFahrzeug, setShowNewFahrzeug] = useState(false);
  const [newKennzeichen, setNewKennzeichen] = useState('');
  const [newMarke, setNewMarke] = useState('');
  const [newModell, setNewModell] = useState('');
  const [newBaujahr, setNewBaujahr] = useState('');
  const [newKilometerstand, setNewKilometerstand] = useState('');
  const [fahrzeugCreating, setFahrzeugCreating] = useState(false);

  // Auftragsdetails
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [statusKey, setStatusKey] = useState(STATUS_OPTIONS[0]?.key ?? 'offen');
  const [prioritaetKey, setPrioritaetKey] = useState('normal');
  const [bemerkungenAuftrag, setBemerkungenAuftrag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAuftragId, setCreatedAuftragId] = useState<string | null>(null);

  // Resolve selected Kunde from id (handles deep-link)
  const resolvedKunde = useMemo(() => {
    if (selectedKunde) return selectedKunde;
    if (selectedKundeId) return kunden.find(k => k.record_id === selectedKundeId) ?? null;
    return null;
  }, [selectedKunde, selectedKundeId, kunden]);

  // Filter fahrzeuge to only those belonging to the selected Kunde
  const filteredFahrzeuge = useMemo<Fahrzeuge[]>(() => {
    if (!selectedKundeId) return [];
    return fahrzeuge.filter(f => {
      const kundeId = f.fields.kunde ? extractRecordId(f.fields.kunde) : null;
      return kundeId === selectedKundeId;
    });
  }, [fahrzeuge, selectedKundeId]);

  const resolvedFahrzeug = useMemo(() => {
    if (!selectedFahrzeugId) return null;
    return fahrzeuge.find(f => f.record_id === selectedFahrzeugId) ?? null;
  }, [fahrzeuge, selectedFahrzeugId]);

  const handleKundeSelect = (id: string) => {
    setSelectedKundeId(id);
    setSelectedKunde(kunden.find(k => k.record_id === id) ?? null);
    setSelectedFahrzeugId(null);
    setStep(2);
  };

  const handleCreateKunde = async () => {
    if (!newKundeVorname || !newKundeNachname) return;
    setKundeCreating(true);
    try {
      const created = await LivingAppsService.createKundenEntry({
        vorname: newKundeVorname,
        nachname: newKundeNachname,
        telefon: newKundeTelefon || undefined,
        email: newKundeEmail || undefined,
      });
      await fetchAll();
      setShowNewKunde(false);
      setNewKundeVorname('');
      setNewKundeNachname('');
      setNewKundeTelefon('');
      setNewKundeEmail('');
      setSelectedKundeId(created.record_id);
      setSelectedFahrzeugId(null);
      setStep(2);
    } finally {
      setKundeCreating(false);
    }
  };

  const handleFahrzeugSelect = (id: string) => {
    setSelectedFahrzeugId(id);
    setStep(3);
  };

  const handleCreateFahrzeug = async () => {
    if (!newKennzeichen || !newMarke || !newModell || !selectedKundeId) return;
    setFahrzeugCreating(true);
    try {
      const created = await LivingAppsService.createFahrzeugeEntry({
        kennzeichen: newKennzeichen,
        marke: newMarke,
        modell: newModell,
        baujahr: newBaujahr ? parseInt(newBaujahr, 10) : undefined,
        kilometerstand: newKilometerstand ? parseInt(newKilometerstand, 10) : undefined,
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      });
      await fetchAll();
      setShowNewFahrzeug(false);
      setNewKennzeichen('');
      setNewMarke('');
      setNewModell('');
      setNewBaujahr('');
      setNewKilometerstand('');
      setSelectedFahrzeugId(created.record_id);
      setStep(3);
    } finally {
      setFahrzeugCreating(false);
    }
  };

  const handleSubmit = async () => {
    if (!auftragsnummer || !arbeitsbeschreibung || !selectedKundeId || !selectedFahrzeugId) return;
    if (createdAuftragId) return; // idempotency guard

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await LivingAppsService.createAuftraegeEntry({
        auftragsnummer,
        arbeitsbeschreibung,
        wunschtermin: wunschtermin || undefined,
        status: statusKey,
        prioritaet: prioritaetKey,
        bemerkungen_auftrag: bemerkungenAuftrag || undefined,
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeugId),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      });
      setCreatedAuftragId(result.record_id);
      setStep(4);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Fehler beim Anlegen des Auftrags'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKunde(null);
    setSelectedKundeId(null);
    setSelectedFahrzeugId(null);
    setAuftragsnummer('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setStatusKey(STATUS_OPTIONS[0]?.key ?? 'offen');
    setPrioritaetKey('normal');
    setBemerkungenAuftrag('');
    setCreatedAuftragId(null);
    setSubmitError(null);
  };

  return (
    <IntentWizardShell
      title={tx('Neuer Auftrag')}
      subtitle={tx('Werkstattauftrag in 3 Schritten anlegen')}
      steps={[
        { label: tx('Kunde') },
        { label: tx('Fahrzeug') },
        { label: tx('Details') },
        { label: tx('Fertig') },
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
          createLabel={tx('Neuen Kunden anlegen')}
          onCreateNew={() => setShowNewKunde(true)}
          searchPlaceholder={tx('Kunden suchen …')}
          emptyText={tx('Kein Kunde gefunden')}
          createDialog={showNewKunde && (
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">{tx('Neuen Kunden anlegen')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Vorname')} *</Label>
                  <Input
                    value={newKundeVorname}
                    onChange={e => setNewKundeVorname(e.target.value)}
                    placeholder={tx('Vorname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Nachname')} *</Label>
                  <Input
                    value={newKundeNachname}
                    onChange={e => setNewKundeNachname(e.target.value)}
                    placeholder={tx('Nachname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('E-Mail')}</Label>
                  <Input
                    type="email"
                    value={newKundeEmail}
                    onChange={e => setNewKundeEmail(e.target.value)}
                    placeholder={tx('E-Mail')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Telefon')}</Label>
                  <Input
                    type="tel"
                    value={newKundeTelefon}
                    onChange={e => setNewKundeTelefon(e.target.value)}
                    placeholder={tx('Telefon')}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={!newKundeVorname || !newKundeNachname || kundeCreating}
                  onClick={handleCreateKunde}
                >
                  {kundeCreating ? tx('Wird angelegt …') : tx('Kunden anlegen')}
                </Button>
                <Button variant="outline" onClick={() => setShowNewKunde(false)}>
                  {tx('Abbrechen')}
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* Step 2: Fahrzeug wählen */}
      {step === 2 && (
        resolvedKunde || selectedKundeId ? (
          <div className="space-y-4">
            {/* Kunde summary */}
            <div className="rounded-2xl border bg-secondary/40 p-3 flex items-center gap-3">
              <IconUser size={18} className="text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {resolvedKunde
                    ? [resolvedKunde.fields.vorname, resolvedKunde.fields.nachname].filter(Boolean).join(' ')
                    : tx('Kunde geladen …')}
                </p>
                {resolvedKunde?.fields.email && (
                  <p className="text-xs text-muted-foreground truncate">{resolvedKunde.fields.email}</p>
                )}
              </div>
              <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => setStep(1)}>
                {tx('Ändern')}
              </Button>
            </div>

            <EntitySelectStep
              items={filteredFahrzeuge.map(f => ({
                id: f.record_id,
                title: [f.fields.kennzeichen, f.fields.marke, f.fields.modell].filter(Boolean).join(' · '),
                subtitle: [
                  f.fields.baujahr ? tx`Bj. ${f.fields.baujahr}` : null,
                  f.fields.kilometerstand ? tx`${f.fields.kilometerstand} km` : null,
                ].filter(Boolean).join(' · '),
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={handleFahrzeugSelect}
              createLabel={tx('Neues Fahrzeug anlegen')}
              onCreateNew={() => setShowNewFahrzeug(true)}
              searchPlaceholder={tx('Fahrzeug suchen …')}
              emptyText={tx('Kein Fahrzeug für diesen Kunden gefunden')}
              createDialog={showNewFahrzeug && (
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">{tx('Neues Fahrzeug anlegen')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Kennzeichen')} *</Label>
                      <Input
                        value={newKennzeichen}
                        onChange={e => setNewKennzeichen(e.target.value)}
                        placeholder={tx('z. B. M-AB 1234')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Marke')} *</Label>
                      <Input
                        value={newMarke}
                        onChange={e => setNewMarke(e.target.value)}
                        placeholder={tx('z. B. VW')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Modell')} *</Label>
                      <Input
                        value={newModell}
                        onChange={e => setNewModell(e.target.value)}
                        placeholder={tx('z. B. Golf')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Baujahr')}</Label>
                      <Input
                        type="number"
                        value={newBaujahr}
                        onChange={e => setNewBaujahr(e.target.value)}
                        placeholder={tx('z. B. 2018')}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">{tx('Kilometerstand')}</Label>
                      <Input
                        type="number"
                        value={newKilometerstand}
                        onChange={e => setNewKilometerstand(e.target.value)}
                        placeholder={tx('z. B. 85000')}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={!newKennzeichen || !newMarke || !newModell || fahrzeugCreating}
                      onClick={handleCreateFahrzeug}
                    >
                      {fahrzeugCreating ? tx('Wird angelegt …') : tx('Fahrzeug anlegen')}
                    </Button>
                    <Button variant="outline" onClick={() => setShowNewFahrzeug(false)}>
                      {tx('Abbrechen')}
                    </Button>
                  </div>
                </div>
              )}
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst einen Kunden wählen.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Zurück zu Schritt 1')}</Button>
          </div>
        )
      )}

      {/* Step 3: Auftragsdetails */}
      {step === 3 && (
        selectedKundeId && selectedFahrzeugId ? (
          <div className="space-y-4">
            {/* Context summary */}
            <div className="rounded-2xl border bg-secondary/40 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <IconUser size={16} className="text-muted-foreground shrink-0" />
                <span className="truncate">
                  {resolvedKunde
                    ? [resolvedKunde.fields.vorname, resolvedKunde.fields.nachname].filter(Boolean).join(' ')
                    : selectedKundeId}
                </span>
              </div>
              {resolvedFahrzeug && (
                <div className="flex items-center gap-2 text-sm">
                  <IconCar size={16} className="text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {[resolvedFahrzeug.fields.kennzeichen, resolvedFahrzeug.fields.marke, resolvedFahrzeug.fields.modell]
                      .filter(Boolean).join(' · ')}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium">{tx('Auftragsnummer')} *</Label>
                <Input
                  value={auftragsnummer}
                  onChange={e => setAuftragsnummer(e.target.value)}
                  placeholder={tx('z. B. AU-2026-001')}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">{tx('Arbeitsbeschreibung')} *</Label>
                <Textarea
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tx('Was soll gemacht werden?')}
                  rows={3}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">{tx('Wunschtermin')}</Label>
                <Input
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={e => setWunschtermin(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">{tx('Status')}</Label>
                  <Select value={statusKey} onValueChange={setStatusKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium">{tx('Priorität')}</Label>
                  <div className="flex gap-2">
                    {PRIORITAET_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setPrioritaetKey(opt.key)}
                        className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
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

              <div className="space-y-1">
                <Label className="text-sm font-medium">{tx('Bemerkungen')}</Label>
                <Textarea
                  value={bemerkungenAuftrag}
                  onChange={e => setBemerkungenAuftrag(e.target.value)}
                  placeholder={tx('Optionale Hinweise …')}
                  rows={2}
                />
              </div>

              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  disabled={!auftragsnummer || !arbeitsbeschreibung || submitting}
                  onClick={handleSubmit}
                  className="flex-1"
                >
                  <IconFileText size={16} className="mr-2" />
                  {submitting ? tx('Wird gespeichert …') : tx('Auftrag anlegen')}
                </Button>
                <Button variant="outline" onClick={() => setStep(2)}>
                  {tx('Zurück')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst Kunde und Fahrzeug wählen.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 4: Fertig */}
      {step === 4 && (
        createdAuftragId ? (
          <div className="text-center py-12 space-y-6">
            <div className="flex justify-center">
              <IconCircleCheck size={56} className="text-primary" stroke={1.5} />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{tx('Auftrag angelegt!')}</h2>
              <p className="text-sm text-muted-foreground">
                {tx('Auftragsnummer')}: <span className="font-medium">{auftragsnummer}</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset}>
                <IconCheck size={16} className="mr-2" />
                {tx('Neuen Auftrag anlegen')}
              </Button>
              <Button variant="outline" asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 3.')}</p>
            <Button variant="outline" onClick={() => setStep(3)}>{tx('Zurück zu Schritt 3')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
