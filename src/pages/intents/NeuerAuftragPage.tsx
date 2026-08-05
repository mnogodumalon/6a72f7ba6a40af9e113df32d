/**
 * Neuer Auftrag — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen → 2) Fahrzeug auswählen oder neu anlegen → 3) Auftragsdaten erfassen & anlegen.
 * Reads: kunden, fahrzeuge. Writes: fahrzeuge (createFahrzeugeEntry), auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kunden } from '@/types/app';
import type { EnrichedFahrzeuge } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconCar, IconUser, IconClipboardList, IconCircleCheck } from '@tabler/icons-react';

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function NeuerAuftragPage() {
  const [searchParams] = useSearchParams();
  const { kunden, fahrzeuge, fetchAll, loading, error } = useDashboardData();

  // Step management — deep-link support via ?step=N
  const initialStep = parseInt(searchParams.get('step') ?? '1', 10);
  const [step, setStep] = useState(isNaN(initialStep) || initialStep < 1 || initialStep > 4 ? 1 : initialStep);

  // Step 1 — Kunde
  const initialKundeId = searchParams.get('kundeId') ?? null;
  const [selectedKunde, setSelectedKunde] = useState<Kunden | null>(() => {
    if (!initialKundeId) return null;
    return kunden.find(k => k.record_id === initialKundeId) ?? null;
  });

  // Step 2 — Fahrzeug
  const initialFahrzeugId = searchParams.get('fahrzeugId') ?? null;
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<EnrichedFahrzeuge | null>(() => {
    if (!initialFahrzeugId) return null;
    return (fahrzeuge as EnrichedFahrzeuge[]).find(f => f.record_id === initialFahrzeugId) ?? null;
  });

  // Step 2 — inline create form state
  const [showCreateFahrzeug, setShowCreateFahrzeug] = useState(false);
  const [fzgKennzeichen, setFzgKennzeichen] = useState('');
  const [fzgMarke, setFzgMarke] = useState('');
  const [fzgModell, setFzgModell] = useState('');
  const [fzgBaujahr, setFzgBaujahr] = useState('');
  const [fzgFin, setFzgFin] = useState('');
  const [creatingFahrzeug, setCreatingFahrzeug] = useState(false);

  // Step 3 — Auftragsdaten
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [prioritaetKey, setPrioritaetKey] = useState(PRIORITAET_OPTIONS[0]?.key ?? '');
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 4 — success
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState<string | null>(null);

  // Filtered fahrzeuge for selected kunde
  const kundenFahrzeuge = selectedKunde
    ? (fahrzeuge as EnrichedFahrzeuge[]).filter(
        f => extractRecordId(f.fields.kunde) === selectedKunde.record_id
      )
    : [];

  // Handler: Kunde auswählen
  const handleKundeSelect = (id: string) => {
    const kunde = kunden.find(k => k.record_id === id) ?? null;
    setSelectedKunde(kunde);
    setSelectedFahrzeug(null);
    setStep(2);
  };

  // Handler: Fahrzeug auswählen
  const handleFahrzeugSelect = (id: string) => {
    const fzg = (fahrzeuge as EnrichedFahrzeuge[]).find(f => f.record_id === id) ?? null;
    setSelectedFahrzeug(fzg);
    setStep(3);
  };

  // Handler: Fahrzeug neu anlegen
  const handleCreateFahrzeug = async () => {
    if (!selectedKunde || !fzgKennzeichen || !fzgMarke || !fzgModell) return;
    setCreatingFahrzeug(true);
    try {
      const created = await LivingAppsService.createFahrzeugeEntry({
        kennzeichen: fzgKennzeichen,
        marke: fzgMarke,
        modell: fzgModell,
        baujahr: fzgBaujahr ? parseInt(fzgBaujahr, 10) : undefined,
        fin: fzgFin || undefined,
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
      });
      await fetchAll();
      setShowCreateFahrzeug(false);
      setFzgKennzeichen('');
      setFzgMarke('');
      setFzgModell('');
      setFzgBaujahr('');
      setFzgFin('');
      // Auto-select & advance
      const newFzg = (fahrzeuge as EnrichedFahrzeuge[]).find(f => f.record_id === created.record_id) ?? {
        record_id: created.record_id,
        created_at: '',
        updated_at: null,
        createdat: '',
        updatedat: null,
        kundeName: selectedKunde.fields.nachname ?? '',
        fields: {
          kennzeichen: fzgKennzeichen,
          marke: fzgMarke,
          modell: fzgModell,
          baujahr: fzgBaujahr ? parseInt(fzgBaujahr, 10) : undefined,
          fin: fzgFin || undefined,
          kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
        },
      } as EnrichedFahrzeuge;
      setSelectedFahrzeug(newFzg);
      setStep(3);
    } finally {
      setCreatingFahrzeug(false);
    }
  };

  // Handler: Auftrag anlegen
  const handleCreateAuftrag = async () => {
    if (!selectedKunde || !selectedFahrzeug || !arbeitsbeschreibung || !auftragsnummer) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.createAuftraegeEntry({
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
        arbeitsbeschreibung,
        wunschtermin: wunschtermin || undefined,
        prioritaet: prioritaetKey || undefined,
        status: STATUS_OPTIONS[0]?.key ?? 'offen',
        auftragsnummer,
        bemerkungen_auftrag: bemerkungen || undefined,
      });
      setCreatedAuftragsnummer(auftragsnummer);
      setStep(4);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setSubmitting(false);
    }
  };

  // Reset wizard
  const handleReset = () => {
    setSelectedKunde(null);
    setSelectedFahrzeug(null);
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setPrioritaetKey(PRIORITAET_OPTIONS[0]?.key ?? '');
    setAuftragsnummer('');
    setBemerkungen('');
    setCreatedAuftragsnummer(null);
    setSubmitError(null);
    setStep(1);
  };

  const canCreateFahrzeug = !!fzgKennzeichen && !!fzgMarke && !!fzgModell;
  const canCreateAuftrag = !!arbeitsbeschreibung && !!auftragsnummer;

  return (
    <IntentWizardShell
      title="Neuer Auftrag"
      subtitle="Werkstattauftrag in drei Schritten anlegen"
      steps={[
        { label: 'Kunde' },
        { label: 'Fahrzeug' },
        { label: 'Auftrag' },
        { label: 'Fertig' },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Schritt 1: Kunde auswählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={kunden.map(k => ({
            id: k.record_id,
            title: `${k.fields.vorname ?? ''} ${k.fields.nachname ?? ''}`.trim() || '—',
            subtitle: k.fields.ort ?? undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          searchPlaceholder="Kunde suchen …"
          emptyText="Kein Kunde gefunden."
        />
      )}

      {/* ── Schritt 2: Fahrzeug auswählen oder neu anlegen ── */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-secondary/30 px-4 py-2 text-sm text-muted-foreground">
              Kunde: <span className="font-medium text-foreground">
                {`${selectedKunde.fields.vorname ?? ''} ${selectedKunde.fields.nachname ?? ''}`.trim()}
              </span>
            </div>
            <EntitySelectStep
              items={kundenFahrzeuge.map(f => ({
                id: f.record_id,
                title: `${f.fields.kennzeichen ?? '—'} — ${f.fields.marke ?? ''} ${f.fields.modell ?? ''}`.trim(),
                subtitle: f.fields.baujahr ? `Baujahr ${f.fields.baujahr}` : undefined,
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={handleFahrzeugSelect}
              searchPlaceholder="Fahrzeug suchen …"
              emptyText="Noch kein Fahrzeug für diesen Kunden."
              createLabel="Neues Fahrzeug anlegen"
              onCreateNew={() => setShowCreateFahrzeug(true)}
              createDialog={showCreateFahrzeug && (
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <p className="text-sm font-medium">Neues Fahrzeug anlegen</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="fzg-kennzeichen">Kennzeichen *</Label>
                      <Input
                        id="fzg-kennzeichen"
                        value={fzgKennzeichen}
                        onChange={e => setFzgKennzeichen(e.target.value)}
                        placeholder="z. B. B-AB 1234"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="fzg-marke">Marke *</Label>
                      <Input
                        id="fzg-marke"
                        value={fzgMarke}
                        onChange={e => setFzgMarke(e.target.value)}
                        placeholder="z. B. VW"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="fzg-modell">Modell *</Label>
                      <Input
                        id="fzg-modell"
                        value={fzgModell}
                        onChange={e => setFzgModell(e.target.value)}
                        placeholder="z. B. Golf"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="fzg-baujahr">Baujahr</Label>
                      <Input
                        id="fzg-baujahr"
                        type="number"
                        value={fzgBaujahr}
                        onChange={e => setFzgBaujahr(e.target.value)}
                        placeholder="z. B. 2018"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="fzg-fin">FIN (Fahrgestellnummer)</Label>
                      <Input
                        id="fzg-fin"
                        value={fzgFin}
                        onChange={e => setFzgFin(e.target.value)}
                        placeholder="z. B. WVWZZZ1KZAW000001"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={handleCreateFahrzeug}
                      disabled={!canCreateFahrzeug || creatingFahrzeug}
                    >
                      {creatingFahrzeug ? 'Wird angelegt …' : 'Fahrzeug anlegen'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowCreateFahrzeug(false)}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </div>
              )}
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">Dieser Schritt braucht einen Kunden aus Schritt 1.</p>
            <Button variant="outline" onClick={() => setStep(1)}>Zurück zu Schritt 1</Button>
          </div>
        )
      )}

      {/* ── Schritt 3: Auftragsdaten ── */}
      {step === 3 && (
        selectedKunde && selectedFahrzeug ? (
          <div className="space-y-5">
            {/* Kontext-Zusammenfassung */}
            <div className="rounded-2xl border bg-secondary/30 px-4 py-3 text-sm space-y-1">
              <div className="text-muted-foreground">
                Kunde: <span className="font-medium text-foreground">
                  {`${selectedKunde.fields.vorname ?? ''} ${selectedKunde.fields.nachname ?? ''}`.trim()}
                </span>
              </div>
              <div className="text-muted-foreground">
                Fahrzeug: <span className="font-medium text-foreground">
                  {`${selectedFahrzeug.fields.kennzeichen ?? ''} — ${selectedFahrzeug.fields.marke ?? ''} ${selectedFahrzeug.fields.modell ?? ''}`.trim()}
                </span>
              </div>
            </div>

            {/* Formular */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="auftragsnummer">Auftragsnummer *</Label>
                <Input
                  id="auftragsnummer"
                  value={auftragsnummer}
                  onChange={e => setAuftragsnummer(e.target.value)}
                  placeholder="z. B. AU-2026-001"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="arbeitsbeschreibung">Arbeitsbeschreibung *</Label>
                <Textarea
                  id="arbeitsbeschreibung"
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  placeholder="Beschreibe die durchzuführenden Arbeiten …"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="wunschtermin">Wunschtermin</Label>
                  <Input
                    id="wunschtermin"
                    type="datetime-local"
                    value={wunschtermin}
                    onChange={e => setWunschtermin(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="prioritaet">Priorität</Label>
                  <Select value={prioritaetKey} onValueChange={setPrioritaetKey}>
                    <SelectTrigger id="prioritaet">
                      <SelectValue placeholder="Priorität wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITAET_OPTIONS.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="bemerkungen">Bemerkungen</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder="Interne Hinweise, Kundenwünsche …"
                  rows={3}
                />
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-destructive rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <Button
                onClick={handleCreateAuftrag}
                disabled={!canCreateAuftrag || submitting}
                className="flex-1 sm:flex-none"
              >
                {submitting ? 'Wird angelegt …' : 'Auftrag anlegen'}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)}>
                Zurück
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.</p>
            <Button variant="outline" onClick={() => setStep(1)}>Neu starten</Button>
          </div>
        )
      )}

      {/* ── Schritt 4: Bestätigung ── */}
      {step === 4 && (
        createdAuftragsnummer ? (
          <div className="flex flex-col items-center text-center py-10 space-y-6">
            <div className="rounded-full bg-primary/10 p-4">
              <IconCircleCheck size={48} className="text-primary" stroke={1.5} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Auftrag angelegt!</h2>
              <p className="text-muted-foreground text-sm">
                Auftragsnummer: <span className="font-medium text-foreground">{createdAuftragsnummer}</span>
              </p>
              {selectedKunde && (
                <p className="text-muted-foreground text-sm">
                  Kunde: {`${selectedKunde.fields.vorname ?? ''} ${selectedKunde.fields.nachname ?? ''}`.trim()}
                </p>
              )}
              {selectedFahrzeug && (
                <p className="text-muted-foreground text-sm">
                  Fahrzeug: {selectedFahrzeug.fields.kennzeichen ?? ''} — {selectedFahrzeug.fields.marke ?? ''} {selectedFahrzeug.fields.modell ?? ''}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <Button onClick={handleReset} className="flex-1">
                <IconClipboardList size={16} className="mr-2" />
                Neuen Auftrag anlegen
              </Button>
              <Button variant="outline" asChild className="flex-1">
                <a href="#/">Zurück zum Dashboard</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">Kein Auftrag angelegt. Bitte starte den Prozess neu.</p>
            <Button variant="outline" onClick={handleReset}>Neu starten</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
