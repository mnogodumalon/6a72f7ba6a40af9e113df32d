/**
 * Neuer Auftrag — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen → 2) Fahrzeug wählen (gefiltert nach Kunde) → 3) Auftragsdaten erfassen & anlegen.
 * Reads: kunden, fahrzeuge. Writes: auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kunden, Fahrzeuge } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  IconUser,
  IconCar,
  IconClipboardList,
  IconCircleCheck,
  IconAlertCircle,
} from '@tabler/icons-react';
import { tx } from '@/i18n';

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function NeuerAuftragPage() {
  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedKunde, setSelectedKunde] = useState<Kunden | null>(null);
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<Fahrzeuge | null>(null);

  // Step 3 form state
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [statusKey, setStatusKey] = useState(STATUS_OPTIONS[0]?.key ?? 'offen');
  const [prioritaetKey, setPrioritaetKey] = useState('normal');
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState<string | null>(null);

  const handleKundeSelect = (id: string) => {
    const k = kunden.find((c: Kunden) => c.record_id === id) ?? null;
    setSelectedKunde(k);
    setSelectedFahrzeug(null);
    setStep(2);
  };

  const handleFahrzeugSelect = (id: string) => {
    const f = fahrzeuge.find((v: Fahrzeuge) => v.record_id === id) ?? null;
    setSelectedFahrzeug(f);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!selectedKunde || !selectedFahrzeug || !arbeitsbeschreibung || !auftragsnummer) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.createAuftraegeEntry({
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
        arbeitsbeschreibung,
        wunschtermin: wunschtermin || undefined,
        status: statusKey,
        prioritaet: prioritaetKey,
        auftragsnummer,
        bemerkungen_auftrag: bemerkungen || undefined,
      });
      await fetchAll();
      setCreatedAuftragsnummer(auftragsnummer);
      setStep(4);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : tx('Fehler beim Anlegen des Auftrags'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedKunde(null);
    setSelectedFahrzeug(null);
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setStatusKey(STATUS_OPTIONS[0]?.key ?? 'offen');
    setPrioritaetKey('normal');
    setAuftragsnummer('');
    setBemerkungen('');
    setSubmitError(null);
    setCreatedAuftragsnummer(null);
    setStep(1);
  };

  // Fahrzeuge gefiltert nach gewähltem Kunden
  const kundenFahrzeuge = selectedKunde
    ? fahrzeuge.filter((f: Fahrzeuge) => {
        if (!f.fields.kunde) return false;
        return extractRecordId(f.fields.kunde) === selectedKunde.record_id;
      })
    : [];

  return (
    <IntentWizardShell
      title={tx('Neuer Auftrag')}
      subtitle={tx('Werkstattauftrag in drei Schritten anlegen')}
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
      {/* ─── Step 1: Kunde wählen ─── */}
      {step === 1 && (
        <EntitySelectStep
          items={kunden.map((k: Kunden) => ({
            id: k.record_id,
            title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.telefon].filter(Boolean).join(' · ') || undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          searchPlaceholder={tx('Kunde suchen …')}
          emptyText={tx('Kein Kunde gefunden')}
        />
      )}

      {/* ─── Step 2: Fahrzeug wählen ─── */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1 pb-2 border-b">
              <IconUser size={16} className="text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {tx('Kunde:')} <span className="font-medium text-foreground">
                  {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                </span>
              </span>
            </div>
            {kundenFahrzeuge.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <IconCar size={40} className="mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {tx('Keine Fahrzeuge für diesen Kunden gefunden.')}
                </p>
                <Button variant="outline" onClick={() => setStep(1)}>
                  {tx('Anderen Kunden wählen')}
                </Button>
              </div>
            ) : (
              <EntitySelectStep
                items={kundenFahrzeuge.map((f: Fahrzeuge) => ({
                  id: f.record_id,
                  title: f.fields.kennzeichen ?? f.record_id,
                  subtitle: [f.fields.marke, f.fields.modell, f.fields.baujahr ? String(f.fields.baujahr) : undefined]
                    .filter(Boolean)
                    .join(' · '),
                  icon: <IconCar size={20} className="text-primary" />,
                }))}
                onSelect={handleFahrzeugSelect}
                searchPlaceholder={tx('Fahrzeug suchen …')}
                emptyText={tx('Kein Fahrzeug gefunden')}
              />
            )}
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* ─── Step 3: Auftragsdaten erfassen ─── */}
      {step === 3 && (
        selectedKunde && selectedFahrzeug ? (
          <div className="space-y-5">
            {/* Kontext-Header */}
            <div className="flex flex-wrap items-center gap-3 px-1 pb-3 border-b">
              <div className="flex items-center gap-2">
                <IconUser size={15} className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <IconCar size={15} className="text-muted-foreground" />
                <span className="text-sm font-medium">
                  {selectedFahrzeug.fields.kennzeichen}
                </span>
                {(selectedFahrzeug.fields.marke || selectedFahrzeug.fields.modell) && (
                  <span className="text-sm text-muted-foreground">
                    {[selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell].filter(Boolean).join(' ')}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {/* Auftragsnummer */}
              <div className="space-y-1.5">
                <Label htmlFor="auftragsnummer">
                  {tx('Auftragsnummer')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="auftragsnummer"
                  value={auftragsnummer}
                  onChange={e => setAuftragsnummer(e.target.value)}
                  placeholder={tx('z. B. AU-2026-001')}
                />
              </div>

              {/* Arbeitsbeschreibung */}
              <div className="space-y-1.5">
                <Label htmlFor="arbeitsbeschreibung">
                  {tx('Arbeitsbeschreibung')} <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="arbeitsbeschreibung"
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tx('Was soll gemacht werden?')}
                  rows={3}
                />
              </div>

              {/* Wunschtermin */}
              <div className="space-y-1.5">
                <Label htmlFor="wunschtermin">{tx('Wunschtermin')}</Label>
                <Input
                  id="wunschtermin"
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={e => setWunschtermin(e.target.value)}
                />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label>{tx('Status')}</Label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setStatusKey(opt.key)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                        statusKey === opt.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-foreground border-border hover:bg-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priorität */}
              <div className="space-y-1.5">
                <Label>{tx('Priorität')}</Label>
                <div className="flex flex-wrap gap-2">
                  {PRIORITAET_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPrioritaetKey(opt.key)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
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

              {/* Bemerkungen */}
              <div className="space-y-1.5">
                <Label htmlFor="bemerkungen">{tx('Bemerkungen')}</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder={tx('Optionale Hinweise zum Auftrag')}
                  rows={2}
                />
              </div>
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <IconAlertCircle size={16} />
                {submitError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                disabled={submitting}
                className="flex-1"
              >
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !arbeitsbeschreibung || !auftragsnummer}
                className="flex-1"
              >
                <IconClipboardList size={16} className="mr-2" />
                {submitting ? tx('Wird angelegt …') : tx('Auftrag anlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* ─── Step 4: Erfolg ─── */}
      {step === 4 && (
        createdAuftragsnummer ? (
          <div className="py-10 text-center space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCircleCheck size={40} className="text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tx('Auftrag erfolgreich angelegt')}</h2>
              <div className="flex justify-center">
                <Badge variant="outline" className="text-base px-4 py-1">
                  {createdAuftragsnummer}
                </Badge>
              </div>
              {selectedKunde && (
                <p className="text-sm text-muted-foreground">
                  {tx('Kunde:')} {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                  {selectedFahrzeug && (
                    <> · {tx('Fahrzeug:')} {selectedFahrzeug.fields.kennzeichen}</>
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset} variant="outline">
                {tx('Neuen Auftrag anlegen')}
              </Button>
              <Button asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
