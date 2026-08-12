/**
 * Neuen Werkstattauftrag anlegen — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen → 2) Fahrzeug wählen oder neu anlegen → 3) Auftragsdaten erfassen & speichern.
 * Reads: kunden, fahrzeuge. Writes: fahrzeuge (createFahrzeugeEntry), auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState } from 'react';
import { tx } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kunden, Fahrzeuge } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IconCar, IconUser, IconClipboardList, IconCircleCheck } from '@tabler/icons-react';

const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];
const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];

export default function AuftragAnlegenPage() {
  const { kunden, fahrzeuge, fetchAll, loading, error } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1 — Kunde
  const [selectedKunde, setSelectedKunde] = useState<Kunden | null>(null);

  // Step 2 — Fahrzeug
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<Fahrzeuge | null>(null);
  const [showFahrzeugCreate, setShowFahrzeugCreate] = useState(false);
  const [fzKennzeichen, setFzKennzeichen] = useState('');
  const [fzMarke, setFzMarke] = useState('');
  const [fzModell, setFzModell] = useState('');
  const [fzBaujahr, setFzBaujahr] = useState('');
  const [fzFin, setFzFin] = useState('');
  const [fzKilometerstand, setFzKilometerstand] = useState('');
  const [fzCreating, setFzCreating] = useState(false);
  const [fzError, setFzError] = useState<string | null>(null);

  // Step 3 — Auftragsdaten
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [prioritaet, setPrioritaet] = useState(PRIORITAET_OPTIONS[1]?.key ?? PRIORITAET_OPTIONS[0]?.key ?? '');
  const [bemerkungenAuftrag, setBemerkungenAuftrag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAuftragId, setCreatedAuftragId] = useState<string | null>(null);
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState<string | null>(null);

  // Fahrzeuge für den gewählten Kunden filtern
  const kundenFahrzeuge = selectedKunde
    ? fahrzeuge.filter(fz => extractRecordId(fz.fields.kunde) === selectedKunde.record_id)
    : [];

  const handleKundeSelect = (id: string) => {
    const kunde = kunden.find(k => k.record_id === id) ?? null;
    setSelectedKunde(kunde);
    setSelectedFahrzeug(null);
    setShowFahrzeugCreate(false);
    setStep(2);
  };

  const handleFahrzeugSelect = (id: string) => {
    const fz = fahrzeuge.find(f => f.record_id === id) ?? null;
    setSelectedFahrzeug(fz);
    setStep(3);
  };

  const handleFahrzeugCreate = async () => {
    if (!selectedKunde || !fzKennzeichen || !fzMarke || !fzModell) return;
    setFzCreating(true);
    setFzError(null);
    try {
      const created = await LivingAppsService.createFahrzeugeEntry({
        kennzeichen: fzKennzeichen,
        marke: fzMarke,
        modell: fzModell,
        ...(fzBaujahr ? { baujahr: Number(fzBaujahr) } : {}),
        ...(fzFin ? { fin: fzFin } : {}),
        ...(fzKilometerstand ? { kilometerstand: Number(fzKilometerstand) } : {}),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
      });
      await fetchAll();
      setShowFahrzeugCreate(false);
      setFzKennzeichen('');
      setFzMarke('');
      setFzModell('');
      setFzBaujahr('');
      setFzFin('');
      setFzKilometerstand('');
      // Auto-Auswahl des neuen Fahrzeugs
      const newFz: Fahrzeuge = {
        record_id: created.record_id,
        created_at: '',
        updated_at: null,
        createdat: '',
        updatedat: null,
        fields: {
          kennzeichen: fzKennzeichen,
          marke: fzMarke,
          modell: fzModell,
          kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
        },
      };
      setSelectedFahrzeug(newFz);
      setStep(3);
    } catch {
      setFzError(tx('Fahrzeug konnte nicht angelegt werden.'));
    } finally {
      setFzCreating(false);
    }
  };

  const handleAuftragSubmit = async () => {
    if (!selectedKunde || !selectedFahrzeug || !arbeitsbeschreibung || !auftragsnummer) return;
    if (createdAuftragId) return; // idempotency guard
    setSubmitting(true);
    setSubmitError(null);
    try {
      const firstStatus = STATUS_OPTIONS[0]?.key ?? 'offen';
      const result = await LivingAppsService.createAuftraegeEntry({
        auftragsnummer,
        arbeitsbeschreibung,
        ...(wunschtermin ? { wunschtermin } : {}),
        ...(prioritaet ? { prioritaet } : {}),
        ...(bemerkungenAuftrag ? { bemerkungen_auftrag: bemerkungenAuftrag } : {}),
        status: firstStatus,
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
      });
      setCreatedAuftragId(result.record_id);
      setCreatedAuftragsnummer(auftragsnummer);
      setStep(4);
    } catch {
      setSubmitError(tx('Auftrag konnte nicht angelegt werden. Bitte nochmals versuchen.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKunde(null);
    setSelectedFahrzeug(null);
    setShowFahrzeugCreate(false);
    setFzKennzeichen('');
    setFzMarke('');
    setFzModell('');
    setFzBaujahr('');
    setFzFin('');
    setFzKilometerstand('');
    setArbeitsbeschreibung('');
    setAuftragsnummer('');
    setWunschtermin('');
    setPrioritaet(PRIORITAET_OPTIONS[1]?.key ?? PRIORITAET_OPTIONS[0]?.key ?? '');
    setBemerkungenAuftrag('');
    setCreatedAuftragId(null);
    setCreatedAuftragsnummer(null);
    setSubmitError(null);
  };

  const canSubmitAuftrag = !!selectedKunde && !!selectedFahrzeug && !!arbeitsbeschreibung && !!auftragsnummer && !submitting;

  return (
    <IntentWizardShell
      title={tx('Auftrag anlegen')}
      subtitle={tx('Neuen Werkstattauftrag in drei Schritten erstellen')}
      steps={[
        { label: tx('Kunde') },
        { label: tx('Fahrzeug') },
        { label: tx('Auftrag') },
        { label: tx('Fertig') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1 — Kunde wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={kunden.map(k => ({
            id: k.record_id,
            title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || tx('Unbekannter Kunde'),
            subtitle: k.fields.email ?? k.fields.telefon ?? '',
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          searchPlaceholder={tx('Kunde suchen …')}
          emptyText={tx('Kein Kunde gefunden')}
        />
      )}

      {/* Step 2 — Fahrzeug wählen oder anlegen */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm text-muted-foreground">
              <IconUser size={16} />
              <span>
                {tx('Kunde')}: <strong>{[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}</strong>
              </span>
              <button
                className="ml-auto text-xs underline"
                onClick={() => { setSelectedKunde(null); setStep(1); }}
              >
                {tx('Ändern')}
              </button>
            </div>
            <EntitySelectStep
              items={kundenFahrzeuge.map(fz => ({
                id: fz.record_id,
                title: [fz.fields.kennzeichen, fz.fields.marke, fz.fields.modell].filter(Boolean).join(' · ') || tx('Fahrzeug'),
                subtitle: [
                  fz.fields.baujahr ? `${tx('Bj.')} ${fz.fields.baujahr}` : '',
                  fz.fields.kilometerstand ? `${fz.fields.kilometerstand.toLocaleString('de-DE')} km` : '',
                ].filter(Boolean).join(' · '),
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={handleFahrzeugSelect}
              searchPlaceholder={tx('Fahrzeug suchen …')}
              emptyText={tx('Noch kein Fahrzeug für diesen Kunden')}
              createLabel={tx('Neues Fahrzeug anlegen')}
              onCreateNew={() => setShowFahrzeugCreate(true)}
              createDialog={showFahrzeugCreate ? (
                <div className="rounded-2xl border p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">{tx('Neues Fahrzeug')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Kennzeichen')} *</Label>
                      <Input
                        value={fzKennzeichen}
                        onChange={e => setFzKennzeichen(e.target.value)}
                        placeholder={tx('z.B. M-AB 1234')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Marke')} *</Label>
                      <Input
                        value={fzMarke}
                        onChange={e => setFzMarke(e.target.value)}
                        placeholder={tx('z.B. BMW')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Modell')} *</Label>
                      <Input
                        value={fzModell}
                        onChange={e => setFzModell(e.target.value)}
                        placeholder={tx('z.B. 3er')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Baujahr')}</Label>
                      <Input
                        type="number"
                        value={fzBaujahr}
                        onChange={e => setFzBaujahr(e.target.value)}
                        placeholder="z.B. 2019"
                        min={1900}
                        max={2099}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('FIN')}</Label>
                      <Input
                        value={fzFin}
                        onChange={e => setFzFin(e.target.value)}
                        placeholder={tx('z.B. WBA…')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Kilometerstand')}</Label>
                      <Input
                        type="number"
                        value={fzKilometerstand}
                        onChange={e => setFzKilometerstand(e.target.value)}
                        placeholder="z.B. 82000"
                        min={0}
                      />
                    </div>
                  </div>
                  {fzError && (
                    <p className="text-sm text-destructive">{fzError}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      disabled={!fzKennzeichen || !fzMarke || !fzModell || fzCreating}
                      onClick={handleFahrzeugCreate}
                    >
                      {fzCreating ? tx('Anlegen …') : tx('Fahrzeug anlegen')}
                    </Button>
                    <Button variant="outline" onClick={() => setShowFahrzeugCreate(false)}>
                      {tx('Abbrechen')}
                    </Button>
                  </div>
                </div>
              ) : undefined}
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst einen Kunden auswählen.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 3 — Auftragsdaten */}
      {step === 3 && (
        selectedKunde && selectedFahrzeug ? (
          <div className="space-y-4">
            {/* Kontext-Banner */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground min-w-0">
                <IconUser size={14} />
                <span className="truncate">
                  {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                </span>
                <button className="ml-1 text-xs underline shrink-0" onClick={() => { setSelectedKunde(null); setSelectedFahrzeug(null); setStep(1); }}>
                  {tx('Ändern')}
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground min-w-0">
                <IconCar size={14} />
                <span className="truncate">
                  {[selectedFahrzeug.fields.kennzeichen, selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell].filter(Boolean).join(' · ')}
                </span>
                <button className="ml-1 text-xs underline shrink-0" onClick={() => setStep(2)}>
                  {tx('Ändern')}
                </button>
              </div>
            </div>

            {/* Mini-Form Auftragsdaten */}
            <div className="rounded-2xl border p-4 space-y-4">
              <div className="flex items-center gap-2">
                <IconClipboardList size={18} className="text-primary" />
                <h3 className="font-medium">{tx('Auftragsdaten')}</h3>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{tx('Auftragsnummer')} *</Label>
                <Input
                  value={auftragsnummer}
                  onChange={e => setAuftragsnummer(e.target.value)}
                  placeholder={tx('z.B. AU-2026-001')}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{tx('Arbeitsbeschreibung')} *</Label>
                <Textarea
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tx('Beschreibung der durchzuführenden Arbeiten …')}
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
                      onClick={() => setPrioritaet(opt.key)}
                      className={[
                        'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                        prioritaet === opt.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-foreground border-border hover:bg-secondary',
                      ].join(' ')}
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
                  placeholder={tx('Optionale Hinweise …')}
                  rows={2}
                />
              </div>

              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}

              <Button
                className="w-full"
                disabled={!canSubmitAuftrag}
                onClick={handleAuftragSubmit}
              >
                {submitting ? tx('Auftrag wird angelegt …') : tx('Auftrag anlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte Kunde und Fahrzeug zuerst auswählen.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 4 — Fertig */}
      {step === 4 && (
        createdAuftragId ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
            <div className="rounded-full bg-primary/10 p-4">
              <IconCircleCheck size={40} className="text-primary" stroke={1.5} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tx('Auftrag angelegt!')}</h2>
              <p className="text-muted-foreground text-sm">
                {tx('Auftragsnummer')}: <strong>{createdAuftragsnummer}</strong>
              </p>
              <p className="text-muted-foreground text-sm">
                {[selectedKunde?.fields.vorname, selectedKunde?.fields.nachname].filter(Boolean).join(' ')}
                {' · '}
                {[selectedFahrzeug?.fields.kennzeichen, selectedFahrzeug?.fields.marke].filter(Boolean).join(' ')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleReset}>
                {tx('Weiteren Auftrag anlegen')}
              </Button>
              <Button variant="outline" asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 3.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
