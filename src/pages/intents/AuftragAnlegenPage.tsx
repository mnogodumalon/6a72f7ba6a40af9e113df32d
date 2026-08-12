/**
 * Auftrag Anlegen — 3-Schritt-Wizard zum Erstellen eines neuen Werkstattauftrags.
 * Steps: 1) Kunde wählen → 2) Fahrzeug wählen (gefiltert nach gewähltem Kunden) → 3) Auftrag erstellen.
 * Reads: kunden, fahrzeuge. Writes: fahrzeuge (createFahrzeugeEntry), auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  IconCar,
  IconUser,
  IconClipboardList,
  IconCircleCheck,
  IconPlus,
} from '@tabler/icons-react';
import { tx } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';

const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function AuftragAnlegenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  // Step state — initialized from URL params
  const initialStep = (() => {
    const s = parseInt(searchParams.get('step') ?? '1', 10);
    return isNaN(s) || s < 1 || s > 4 ? 1 : s;
  })();
  const [step, setStep] = useState(initialStep);

  // Selections
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(
    searchParams.get('kundeId')
  );
  const [selectedFahrzeugId, setSelectedFahrzeugId] = useState<string | null>(
    searchParams.get('fahrzeugId')
  );

  // New Fahrzeug form state
  const [showFahrzeugCreate, setShowFahrzeugCreate] = useState(false);
  const [fzKennzeichen, setFzKennzeichen] = useState('');
  const [fzMarke, setFzMarke] = useState('');
  const [fzModell, setFzModell] = useState('');
  const [fzBaujahr, setFzBaujahr] = useState('');
  const [fzFin, setFzFin] = useState('');
  const [fzKilometerstand, setFzKilometerstand] = useState('');
  const [fzSaving, setFzSaving] = useState(false);
  const [fzError, setFzError] = useState<string | null>(null);

  // Auftrag form state
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [prioritaetKey, setPrioritaetKey] = useState(PRIORITAET_OPTIONS[1]?.key ?? 'normal');
  const [bemerkungenAuftrag, setBemerkungenAuftrag] = useState('');
  const [auftragSaving, setAuftragSaving] = useState(false);
  const [auftragError, setAuftragError] = useState<string | null>(null);
  const [createdAuftragNummer, setCreatedAuftragNummer] = useState<string | null>(null);

  // Derived data
  const selectedKunde = useMemo(
    () => kunden.find(k => k.record_id === selectedKundeId) ?? null,
    [kunden, selectedKundeId]
  );

  const kundeFahrzeuge = useMemo(() => {
    if (!selectedKundeId) return [];
    return fahrzeuge.filter(f => {
      const kundeUrl = f.fields.kunde;
      if (!kundeUrl) return false;
      return extractRecordId(kundeUrl) === selectedKundeId;
    });
  }, [fahrzeuge, selectedKundeId]);

  const selectedFahrzeug = useMemo(
    () => fahrzeuge.find(f => f.record_id === selectedFahrzeugId) ?? null,
    [fahrzeuge, selectedFahrzeugId]
  );

  const handleStepChange = (newStep: number) => {
    setStep(newStep);
    const params: Record<string, string> = { step: String(newStep) };
    if (selectedKundeId) params.kundeId = selectedKundeId;
    if (selectedFahrzeugId) params.fahrzeugId = selectedFahrzeugId;
    setSearchParams(params);
  };

  const handleKundeSelect = (id: string) => {
    setSelectedKundeId(id);
    setSelectedFahrzeugId(null);
    setShowFahrzeugCreate(false);
    const params: Record<string, string> = { step: '2', kundeId: id };
    setSearchParams(params);
    setStep(2);
  };

  const handleFahrzeugSelect = (id: string) => {
    setSelectedFahrzeugId(id);
    const params: Record<string, string> = { step: '3', fahrzeugId: id };
    if (selectedKundeId) params.kundeId = selectedKundeId;
    setSearchParams(params);
    setStep(3);
  };

  const handleFahrzeugCreate = async () => {
    if (!selectedKundeId || !fzKennzeichen || !fzMarke || !fzModell) return;
    setFzSaving(true);
    setFzError(null);
    try {
      const created = await LivingAppsService.createFahrzeugeEntry({
        kennzeichen: fzKennzeichen,
        marke: fzMarke,
        modell: fzModell,
        baujahr: fzBaujahr ? parseInt(fzBaujahr, 10) : undefined,
        fin: fzFin || undefined,
        kilometerstand: fzKilometerstand ? parseInt(fzKilometerstand, 10) : undefined,
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      });
      await fetchAll();
      setShowFahrzeugCreate(false);
      setFzKennzeichen('');
      setFzMarke('');
      setFzModell('');
      setFzBaujahr('');
      setFzFin('');
      setFzKilometerstand('');
      handleFahrzeugSelect(created.record_id);
    } catch {
      setFzError(tx('Fahrzeug konnte nicht gespeichert werden.'));
    } finally {
      setFzSaving(false);
    }
  };

  const handleAuftragCreate = async () => {
    if (!selectedKundeId || !selectedFahrzeugId || !auftragsnummer || !arbeitsbeschreibung) return;
    setAuftragSaving(true);
    setAuftragError(null);
    try {
      await LivingAppsService.createAuftraegeEntry({
        auftragsnummer,
        arbeitsbeschreibung,
        wunschtermin: wunschtermin || undefined,
        prioritaet: prioritaetKey,
        bemerkungen_auftrag: bemerkungenAuftrag || undefined,
        status: 'offen',
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeugId),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      });
      setCreatedAuftragNummer(auftragsnummer);
      handleStepChange(4);
    } catch {
      setAuftragError(tx('Auftrag konnte nicht gespeichert werden.'));
    } finally {
      setAuftragSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedKundeId(null);
    setSelectedFahrzeugId(null);
    setAuftragsnummer('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setPrioritaetKey(PRIORITAET_OPTIONS[1]?.key ?? 'normal');
    setBemerkungenAuftrag('');
    setCreatedAuftragNummer(null);
    setAuftragError(null);
    setShowFahrzeugCreate(false);
    setSearchParams({ step: '1' });
    setStep(1);
  };

  // Suppress the unused import warning: format is used below in the banner
  const _formatRef = format;

  return (
    <IntentWizardShell
      title={tx('Auftrag anlegen')}
      subtitle={tx('Werkstattauftrag in drei Schritten erstellen')}
      steps={[
        { label: tx('Kunde') },
        { label: tx('Fahrzeug') },
        { label: tx('Auftrag') },
        { label: tx('Fertig') },
      ]}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1 — Kunde wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={kunden.map(k => ({
            id: k.record_id,
            title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || k.record_id,
            subtitle: k.fields.ort ?? undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          searchPlaceholder={tx('Kunde suchen …')}
          emptyText={tx('Kein Kunde gefunden')}
        />
      )}

      {/* Step 2 — Fahrzeug wählen */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary px-4 py-3 flex items-center gap-3">
              <IconUser size={18} className="text-muted-foreground shrink-0" />
              <span className="text-sm font-medium truncate">
                {[selectedKunde?.fields.vorname, selectedKunde?.fields.nachname]
                  .filter(Boolean)
                  .join(' ') || selectedKundeId}
              </span>
            </div>
            <EntitySelectStep
              items={kundeFahrzeuge.map(f => ({
                id: f.record_id,
                title: f.fields.kennzeichen ?? f.record_id,
                subtitle: [f.fields.marke, f.fields.modell, f.fields.baujahr ? String(f.fields.baujahr) : '']
                  .filter(Boolean)
                  .join(' · '),
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={handleFahrzeugSelect}
              searchPlaceholder={tx('Fahrzeug suchen …')}
              emptyText={tx('Kein Fahrzeug gefunden — bitte neues anlegen')}
              createLabel={tx('Neues Fahrzeug anlegen')}
              onCreateNew={() => setShowFahrzeugCreate(true)}
              createDialog={showFahrzeugCreate && (
                <div className="rounded-2xl border p-4 space-y-3">
                  <p className="text-sm font-medium">{tx('Neues Fahrzeug')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Kennzeichen')} *</Label>
                      <Input
                        value={fzKennzeichen}
                        onChange={e => setFzKennzeichen(e.target.value)}
                        placeholder={tx('z. B. M-AB 1234')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Marke')} *</Label>
                      <Input
                        value={fzMarke}
                        onChange={e => setFzMarke(e.target.value)}
                        placeholder={tx('z. B. VW')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Modell')} *</Label>
                      <Input
                        value={fzModell}
                        onChange={e => setFzModell(e.target.value)}
                        placeholder={tx('z. B. Golf')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Baujahr')}</Label>
                      <Input
                        type="number"
                        value={fzBaujahr}
                        onChange={e => setFzBaujahr(e.target.value)}
                        placeholder="z. B. 2019"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('FIN')}</Label>
                      <Input
                        value={fzFin}
                        onChange={e => setFzFin(e.target.value)}
                        placeholder={tx('Fahrgestellnummer')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Kilometerstand')}</Label>
                      <Input
                        type="number"
                        value={fzKilometerstand}
                        onChange={e => setFzKilometerstand(e.target.value)}
                        placeholder="z. B. 85000"
                      />
                    </div>
                  </div>
                  {fzError && (
                    <p className="text-sm text-destructive">{fzError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      disabled={fzSaving || !fzKennzeichen || !fzMarke || !fzModell}
                      onClick={handleFahrzeugCreate}
                    >
                      {fzSaving ? tx('Speichern …') : tx('Anlegen')}
                    </Button>
                    <Button variant="outline" onClick={() => setShowFahrzeugCreate(false)}>
                      {tx('Abbrechen')}
                    </Button>
                  </div>
                </div>
              )}
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Step 3 — Auftrag erstellen */}
      {step === 3 && (
        selectedKundeId && selectedFahrzeugId ? (
          <div className="space-y-5">
            {/* Kontext-Banner */}
            <div className="rounded-2xl bg-secondary px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-2 text-sm">
                <IconUser size={16} className="text-muted-foreground" />
                <span className="font-medium">
                  {[selectedKunde?.fields.vorname, selectedKunde?.fields.nachname]
                    .filter(Boolean)
                    .join(' ') || selectedKundeId}
                </span>
              </span>
              <span className="flex items-center gap-2 text-sm">
                <IconCar size={16} className="text-muted-foreground" />
                <span className="font-medium">
                  {selectedFahrzeug?.fields.kennzeichen ?? selectedFahrzeugId}
                  {selectedFahrzeug?.fields.marke ? ` · ${selectedFahrzeug.fields.marke}` : ''}
                  {selectedFahrzeug?.fields.modell ? ` ${selectedFahrzeug.fields.modell}` : ''}
                </span>
              </span>
            </div>

            {/* Auftragsformular */}
            <div className="rounded-2xl border p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <IconClipboardList size={18} className="text-primary" />
                <h3 className="font-semibold text-base">{tx('Auftragsdetails')}</h3>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{tx('Auftragsnummer')} *</Label>
                <Input
                  value={auftragsnummer}
                  onChange={e => setAuftragsnummer(e.target.value)}
                  placeholder={tx('z. B. AU-2026-001')}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{tx('Arbeitsbeschreibung')} *</Label>
                <Textarea
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tx('Was soll repariert oder geprüft werden?')}
                  rows={3}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{tx('Wunschtermin')}</Label>
                <Input
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={e => setWunschtermin(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{tx('Priorität')}</Label>
                <div className="flex flex-wrap gap-2">
                  {PRIORITAET_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPrioritaetKey(opt.key)}
                      className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
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
                <Label className="text-xs text-muted-foreground">{tx('Bemerkungen')}</Label>
                <Textarea
                  value={bemerkungenAuftrag}
                  onChange={e => setBemerkungenAuftrag(e.target.value)}
                  placeholder={tx('Optionale Hinweise zum Auftrag')}
                  rows={2}
                />
              </div>

              {auftragError && (
                <p className="text-sm text-destructive">{auftragError}</p>
              )}

              <Button
                className="w-full"
                disabled={auftragSaving || !auftragsnummer || !arbeitsbeschreibung}
                onClick={handleAuftragCreate}
              >
                {auftragSaving ? tx('Auftrag wird erstellt …') : tx('Auftrag anlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}
            </p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Step 4 — Erfolg */}
      {step === 4 && (
        createdAuftragNummer ? (
          <div className="text-center py-12 space-y-6">
            <div className="flex justify-center">
              <IconCircleCheck size={56} className="text-primary" stroke={1.5} />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold">
                {tx('Auftrag angelegt!')}
              </h2>
              <p className="text-muted-foreground text-sm">
                {tx('Auftragsnummer')}: <span className="font-mono font-semibold">{createdAuftragNummer}</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset} className="gap-2">
                <IconPlus size={16} />
                {tx('Neuen Auftrag anlegen')}
              </Button>
              <Button variant="outline" asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}
            </p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
