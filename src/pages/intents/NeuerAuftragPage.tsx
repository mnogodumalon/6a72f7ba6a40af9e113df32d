/**
 * Neuer Auftrag — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen → 2) Fahrzeug wählen (gefiltert auf Kunden-Fahrzeuge) → 3) Auftragsdaten erfassen & anlegen.
 * Reads: kunden, fahrzeuge. Writes: auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState } from 'react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kunden } from '@/types/app';
import type { EnrichedFahrzeuge } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { tx } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconCircleCheck, IconCar, IconClipboardList } from '@tabler/icons-react';

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function NeuerAuftragPage() {
  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedKunde, setSelectedKunde] = useState<Kunden | null>(null);
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<EnrichedFahrzeuge | null>(null);

  // Schritt 3 — Auftragsformular
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [statusKey, setStatusKey] = useState(STATUS_OPTIONS[0]?.key ?? 'offen');
  const [prioritaetKey, setPrioritaetKey] = useState('normal');
  const [bemerkungenAuftrag, setBemerkungenAuftrag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState<string | null>(null);

  const kundenFiltered = (kunden as Kunden[]) ?? [];

  const fahrzeugeFiltered = (fahrzeuge as EnrichedFahrzeuge[]).filter(
    (f) => selectedKunde && extractRecordId(f.fields.kunde) === selectedKunde.record_id
  );

  const handleKundeSelect = (id: string) => {
    const k = kundenFiltered.find((c) => c.record_id === id) ?? null;
    setSelectedKunde(k);
    setSelectedFahrzeug(null);
    setStep(2);
  };

  const handleFahrzeugSelect = (id: string) => {
    const f = fahrzeugeFiltered.find((v) => v.record_id === id) ?? null;
    setSelectedFahrzeug(f);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!selectedKunde || !selectedFahrzeug) return;
    if (!auftragsnummer.trim() || !arbeitsbeschreibung.trim()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.createAuftraegeEntry({
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
        auftragsnummer: auftragsnummer.trim(),
        arbeitsbeschreibung: arbeitsbeschreibung.trim(),
        wunschtermin: wunschtermin || undefined,
        status: statusKey,
        prioritaet: prioritaetKey,
        bemerkungen_auftrag: bemerkungenAuftrag.trim() || undefined,
      });
      setCreatedAuftragsnummer(auftragsnummer.trim());
      await fetchAll();
      setStep(4);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : tx('Unbekannter Fehler'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedKunde(null);
    setSelectedFahrzeug(null);
    setAuftragsnummer('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setStatusKey(STATUS_OPTIONS[0]?.key ?? 'offen');
    setPrioritaetKey('normal');
    setBemerkungenAuftrag('');
    setSubmitError(null);
    setCreatedAuftragsnummer(null);
    setStep(1);
  };

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
      {/* Schritt 1: Kunde wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={kundenFiltered.map((k) => ({
            id: k.record_id,
            title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || k.record_id,
            subtitle: k.fields.email ?? '',
          }))}
          onSelect={handleKundeSelect}
          searchPlaceholder={tx('Kunde suchen …')}
          emptyText={tx('Kein Kunde gefunden')}
          emptyIcon={<IconClipboardList size={32} />}
        />
      )}

      {/* Schritt 2: Fahrzeug wählen */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-secondary/40 px-4 py-3 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{tx('Kunde:')}</span>
              <span className="text-sm font-medium">
                {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ') || selectedKunde.record_id}
              </span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setStep(1)}>
                {tx('Ändern')}
              </Button>
            </div>
            <EntitySelectStep
              items={fahrzeugeFiltered.map((f) => ({
                id: f.record_id,
                title: f.fields.kennzeichen ?? f.record_id,
                subtitle: [f.fields.marke, f.fields.modell].filter(Boolean).join(' '),
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={handleFahrzeugSelect}
              searchPlaceholder={tx('Fahrzeug suchen …')}
              emptyText={tx('Kein Fahrzeug für diesen Kunden gefunden')}
              emptyIcon={<IconCar size={32} />}
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt benötigt einen gewählten Kunden.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Schritt 3: Auftragsdaten erfassen */}
      {step === 3 && (
        selectedKunde && selectedFahrzeug ? (
          <div className="space-y-5">
            <div className="rounded-xl border bg-secondary/40 px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{tx('Kunde:')}</span>
                <span className="font-medium">{[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}</span>
                <span className="mx-1 text-muted-foreground">·</span>
                <span className="text-muted-foreground">{tx('Fahrzeug:')}</span>
                <span className="font-medium">{selectedFahrzeug.fields.kennzeichen ?? ''}</span>
                {(selectedFahrzeug.fields.marke || selectedFahrzeug.fields.modell) && (
                  <span className="text-muted-foreground text-xs">({[selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell].filter(Boolean).join(' ')})</span>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">{tx('Auftragsnummer')} *</label>
                <Input
                  value={auftragsnummer}
                  onChange={(e) => setAuftragsnummer(e.target.value)}
                  placeholder={tx('z. B. AU-2026-001')}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tx('Arbeitsbeschreibung')} *</label>
                <Textarea
                  value={arbeitsbeschreibung}
                  onChange={(e) => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tx('Beschreibung der durchzuführenden Arbeiten …')}
                  rows={4}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tx('Wunschtermin')}</label>
                <Input
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={(e) => setWunschtermin(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tx('Status')} *</label>
                  <Select value={statusKey} onValueChange={setStatusKey}>
                    <SelectTrigger className="w-full">
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
                  <label className="text-sm font-medium">{tx('Priorität')}</label>
                  <Select value={prioritaetKey} onValueChange={setPrioritaetKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITAET_OPTIONS.map((opt) => (
                        <SelectItem key={opt.key} value={opt.key}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tx('Bemerkungen')}</label>
                <Textarea
                  value={bemerkungenAuftrag}
                  onChange={(e) => setBemerkungenAuftrag(e.target.value)}
                  placeholder={tx('Optionale Bemerkungen zum Auftrag …')}
                  rows={3}
                />
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                {tx('Zurück')}
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={submitting || !auftragsnummer.trim() || !arbeitsbeschreibung.trim()}
              >
                {submitting ? tx('Auftrag wird angelegt …') : tx('Auftrag anlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt benötigt Kunde und Fahrzeug aus den vorherigen Schritten.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Schritt 4: Bestätigung */}
      {step === 4 && (
        createdAuftragsnummer ? (
          <div className="flex flex-col items-center text-center py-10 space-y-5">
            <div className="rounded-full bg-primary/10 p-5">
              <IconCircleCheck size={48} stroke={1.5} className="text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{tx('Auftrag erfolgreich angelegt')}</h2>
              <p className="text-muted-foreground text-sm">
                {tx('Auftragsnummer:')} <span className="font-medium text-foreground">{createdAuftragsnummer}</span>
              </p>
              {selectedKunde && (
                <p className="text-muted-foreground text-sm">
                  {tx('Kunde:')} {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                </p>
              )}
              {selectedFahrzeug && (
                <p className="text-muted-foreground text-sm">
                  {tx('Fahrzeug:')} {selectedFahrzeug.fields.kennzeichen ?? ''}
                  {(selectedFahrzeug.fields.marke || selectedFahrzeug.fields.modell) && (
                    <> ({[selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell].filter(Boolean).join(' ')})</>
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                {tx('Neuen Auftrag anlegen')}
              </Button>
              <Button className="flex-1" asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Kein Auftrag wurde angelegt.')}</p>
            <Button variant="outline" onClick={() => setStep(3)}>{tx('Zurück zum Formular')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
