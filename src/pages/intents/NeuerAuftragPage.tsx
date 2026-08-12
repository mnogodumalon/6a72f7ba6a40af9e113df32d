/**
 * Neuer Auftrag — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen → 2) Fahrzeug wählen (gefiltert auf gewählten Kunden) → 3) Auftragsdaten eingeben & speichern.
 * Reads: kunden, fahrzeuge. Writes: auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { tx } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kunden, Fahrzeuge } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { IconUser, IconCar, IconClipboardList, IconCheck, IconAlertCircle } from '@tabler/icons-react';

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIO_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function NeuerAuftragPage() {
  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedKunde, setSelectedKunde] = useState<Kunden | null>(null);
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<Fahrzeuge | null>(null);

  // Schritt 1: Neuen Kunden anlegen
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [neuerVorname, setNeuerVorname] = useState('');
  const [neuerNachname, setNeuerNachname] = useState('');
  const [neueEmail, setNeueEmail] = useState('');
  const [neueTelefon, setNeueTelefon] = useState('');
  const [kundeCreating, setKundeCreating] = useState(false);
  const [kundeCreateError, setKundeCreateError] = useState('');

  // Schritt 2: Neues Fahrzeug anlegen
  const [showCreateFahrzeug, setShowCreateFahrzeug] = useState(false);
  const [neuesKennzeichen, setNeuesKennzeichen] = useState('');
  const [neueMarke, setNeueMarke] = useState('');
  const [neuesModell, setNeuesModell] = useState('');
  const [neuesBaujahr, setNeuesBaujahr] = useState('');
  const [fahrzeugCreating, setFahrzeugCreating] = useState(false);
  const [fahrzeugCreateError, setFahrzeugCreateError] = useState('');

  // Schritt 3: Auftragsdaten
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [statusKey, setStatusKey] = useState(STATUS_OPTIONS[0]?.key ?? 'offen');
  const [prioritaetKey, setPrioritaetKey] = useState(
    PRIO_OPTIONS.find(o => o.key === 'normal')?.key ?? PRIO_OPTIONS[0]?.key ?? 'normal'
  );
  const [bemerkungenAuftrag, setBemerkungenAuftrag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);
  const [createdAuftragId, setCreatedAuftragId] = useState('');

  // Fahrzeuge des gewählten Kunden
  const kundenFahrzeuge = selectedKunde
    ? fahrzeuge.filter(
        f =>
          f.fields.kunde === createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id)
      )
    : [];

  const handleKundeSelect = (id: string) => {
    const k = kunden.find(k => k.record_id === id) ?? null;
    setSelectedKunde(k);
    setSelectedFahrzeug(null);
    setStep(2);
  };

  const handleCreateKunde = async () => {
    if (!neuerVorname || !neuerNachname) return;
    setKundeCreating(true);
    setKundeCreateError('');
    try {
      const created = await LivingAppsService.createKundenEntry({
        vorname: neuerVorname,
        nachname: neuerNachname,
        email: neueEmail || undefined,
        telefon: neueTelefon || undefined,
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNeuerVorname('');
      setNeuerNachname('');
      setNeueEmail('');
      setNeueTelefon('');
      // Auto-select the newly created Kunde
      const newKunde: Kunden = {
        record_id: created.record_id,
        created_at: '',
        updated_at: null,
        createdat: '',
        updatedat: null,
        fields: {
          vorname: neuerVorname,
          nachname: neuerNachname,
          email: neueEmail || undefined,
          telefon: neueTelefon || undefined,
        },
      };
      setSelectedKunde(newKunde);
      setSelectedFahrzeug(null);
      setStep(2);
    } catch {
      setKundeCreateError(tx('Fehler beim Anlegen des Kunden.'));
    } finally {
      setKundeCreating(false);
    }
  };

  const handleFahrzeugSelect = (id: string) => {
    const f = fahrzeuge.find(f => f.record_id === id) ?? null;
    setSelectedFahrzeug(f);
    setStep(3);
  };

  const handleCreateFahrzeug = async () => {
    if (!neuesKennzeichen || !selectedKunde) return;
    setFahrzeugCreating(true);
    setFahrzeugCreateError('');
    try {
      const created = await LivingAppsService.createFahrzeugeEntry({
        kennzeichen: neuesKennzeichen,
        marke: neueMarke || undefined,
        modell: neuesModell || undefined,
        baujahr: neuesBaujahr ? parseInt(neuesBaujahr, 10) : undefined,
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
      });
      await fetchAll();
      setShowCreateFahrzeug(false);
      setNeuesKennzeichen('');
      setNeueMarke('');
      setNeuesModell('');
      setNeuesBaujahr('');
      const newFahrzeug: Fahrzeuge = {
        record_id: created.record_id,
        created_at: '',
        updated_at: null,
        createdat: '',
        updatedat: null,
        fields: {
          kennzeichen: neuesKennzeichen,
          marke: neueMarke || undefined,
          modell: neuesModell || undefined,
          baujahr: neuesBaujahr ? parseInt(neuesBaujahr, 10) : undefined,
          kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
        },
      };
      setSelectedFahrzeug(newFahrzeug);
      setStep(3);
    } catch {
      setFahrzeugCreateError(tx('Fehler beim Anlegen des Fahrzeugs.'));
    } finally {
      setFahrzeugCreating(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedKunde || !selectedFahrzeug || !auftragsnummer || !arbeitsbeschreibung) return;
    setSubmitting(true);
    setSubmitError('');

    // Idempotency guard: don't create twice on retry
    let aid = createdAuftragId;
    try {
      if (!aid) {
        const result = await LivingAppsService.createAuftraegeEntry({
          fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
          kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
          auftragsnummer,
          arbeitsbeschreibung,
          wunschtermin: wunschtermin || undefined,
          status: statusKey,
          prioritaet: prioritaetKey,
          bemerkungen_auftrag: bemerkungenAuftrag || undefined,
        });
        aid = result.record_id;
        setCreatedAuftragId(aid);
      }
      setDone(true);
    } catch {
      setSubmitError(tx('Fehler beim Speichern des Auftrags. Bitte erneut versuchen.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKunde(null);
    setSelectedFahrzeug(null);
    setAuftragsnummer('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setStatusKey(STATUS_OPTIONS[0]?.key ?? 'offen');
    setPrioritaetKey(PRIO_OPTIONS.find(o => o.key === 'normal')?.key ?? PRIO_OPTIONS[0]?.key ?? 'normal');
    setBemerkungenAuftrag('');
    setSubmitting(false);
    setSubmitError('');
    setDone(false);
    setCreatedAuftragId('');
    setShowCreateKunde(false);
    setShowCreateFahrzeug(false);
  };

  return (
    <IntentWizardShell
      title={tx('Neuer Auftrag')}
      subtitle={tx('Werkstattauftrag in drei Schritten anlegen')}
      steps={[
        { label: tx('Kunde') },
        { label: tx('Fahrzeug') },
        { label: tx('Auftragsdaten') },
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
          items={kunden.map(k => ({
            id: k.record_id,
            title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || tx('Unbekannter Kunde'),
            subtitle: [k.fields.email, k.fields.telefon].filter(Boolean).join(' · '),
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          searchPlaceholder={tx('Kunde suchen …')}
          emptyText={tx('Kein Kunde gefunden.')}
          createLabel={tx('Neuen Kunden anlegen')}
          onCreateNew={() => { setShowCreateKunde(true); setShowCreateFahrzeug(false); }}
          createDialog={showCreateKunde && (
            <div className="rounded-2xl border p-4 space-y-3">
              <p className="text-sm font-medium">{tx('Neuen Kunden anlegen')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{tx('Vorname')} *</Label>
                  <Input
                    value={neuerVorname}
                    onChange={e => setNeuerVorname(e.target.value)}
                    placeholder={tx('Vorname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tx('Nachname')} *</Label>
                  <Input
                    value={neuerNachname}
                    onChange={e => setNeuerNachname(e.target.value)}
                    placeholder={tx('Nachname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tx('E-Mail')}</Label>
                  <Input
                    type="email"
                    value={neueEmail}
                    onChange={e => setNeueEmail(e.target.value)}
                    placeholder={tx('E-Mail')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tx('Telefon')}</Label>
                  <Input
                    type="tel"
                    value={neueTelefon}
                    onChange={e => setNeueTelefon(e.target.value)}
                    placeholder={tx('Telefon')}
                  />
                </div>
              </div>
              {kundeCreateError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <IconAlertCircle size={14} stroke={2} /> {kundeCreateError}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  disabled={!neuerVorname || !neuerNachname || kundeCreating}
                  onClick={handleCreateKunde}
                >
                  {kundeCreating ? tx('Wird angelegt …') : tx('Anlegen & weiter')}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateKunde(false)}>
                  {tx('Abbrechen')}
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* Schritt 2: Fahrzeug wählen */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-secondary px-4 py-2 flex items-center gap-2 text-sm text-muted-foreground">
              <IconUser size={16} stroke={2} />
              <span>
                {tx('Kunde:')} <span className="font-medium text-foreground">
                  {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                </span>
              </span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={() => setStep(1)}>
                {tx('Ändern')}
              </Button>
            </div>
            <EntitySelectStep
              items={kundenFahrzeuge.map(f => ({
                id: f.record_id,
                title: [f.fields.kennzeichen, f.fields.marke, f.fields.modell].filter(Boolean).join(' · ') || tx('Fahrzeug'),
                subtitle: f.fields.baujahr ? tx`Baujahr ${f.fields.baujahr}` : undefined,
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={handleFahrzeugSelect}
              searchPlaceholder={tx('Fahrzeug suchen …')}
              emptyText={tx('Kein Fahrzeug für diesen Kunden gefunden.')}
              createLabel={tx('Neues Fahrzeug anlegen')}
              onCreateNew={() => { setShowCreateFahrzeug(true); setShowCreateKunde(false); }}
              createDialog={showCreateFahrzeug && (
                <div className="rounded-2xl border p-4 space-y-3">
                  <p className="text-sm font-medium">{tx('Neues Fahrzeug anlegen')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>{tx('Kennzeichen')} *</Label>
                      <Input
                        value={neuesKennzeichen}
                        onChange={e => setNeuesKennzeichen(e.target.value)}
                        placeholder={tx('z.B. B-AB 1234')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{tx('Marke')}</Label>
                      <Input
                        value={neueMarke}
                        onChange={e => setNeueMarke(e.target.value)}
                        placeholder={tx('z.B. VW')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{tx('Modell')}</Label>
                      <Input
                        value={neuesModell}
                        onChange={e => setNeuesModell(e.target.value)}
                        placeholder={tx('z.B. Golf')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{tx('Baujahr')}</Label>
                      <Input
                        type="number"
                        value={neuesBaujahr}
                        onChange={e => setNeuesBaujahr(e.target.value)}
                        placeholder={tx('z.B. 2018')}
                      />
                    </div>
                  </div>
                  {fahrzeugCreateError && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <IconAlertCircle size={14} stroke={2} /> {fahrzeugCreateError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      disabled={!neuesKennzeichen || fahrzeugCreating}
                      onClick={handleCreateFahrzeug}
                    >
                      {fahrzeugCreating ? tx('Wird angelegt …') : tx('Anlegen & weiter')}
                    </Button>
                    <Button variant="outline" onClick={() => setShowCreateFahrzeug(false)}>
                      {tx('Abbrechen')}
                    </Button>
                  </div>
                </div>
              )}
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Schritt 3: Auftragsdaten */}
      {step === 3 && (
        selectedKunde && selectedFahrzeug ? (
          done ? (
            <div className="flex flex-col items-center gap-6 py-12">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCheck size={40} className="text-primary" stroke={2} />
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-lg font-semibold">{tx('Auftrag angelegt!')}</h2>
                <p className="text-sm text-muted-foreground">
                  {tx('Auftragsnummer:')} <span className="font-medium">{auftragsnummer}</span>
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={handleReset}>{tx('Neuen Auftrag anlegen')}</Button>
                <Button variant="outline" asChild>
                  <a href="#/">{tx('Zurück zum Dashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Kontext-Banner */}
              <div className="rounded-xl bg-secondary px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <IconUser size={16} stroke={2} />
                  {tx('Kunde:')} <span className="font-medium text-foreground ml-1">
                    {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <IconCar size={16} stroke={2} />
                  {tx('Fahrzeug:')} <span className="font-medium text-foreground ml-1">
                    {[selectedFahrzeug.fields.kennzeichen, selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </div>

              <div className="rounded-2xl border p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <IconClipboardList size={18} className="text-primary" stroke={2} />
                  <h3 className="font-semibold">{tx('Auftragsdaten')}</h3>
                </div>

                <div className="space-y-1">
                  <Label>{tx('Auftragsnummer')} *</Label>
                  <Input
                    value={auftragsnummer}
                    onChange={e => setAuftragsnummer(e.target.value)}
                    placeholder={tx('z.B. AU-2026-001')}
                  />
                </div>

                <div className="space-y-1">
                  <Label>{tx('Arbeitsbeschreibung')} *</Label>
                  <Textarea
                    value={arbeitsbeschreibung}
                    onChange={e => setArbeitsbeschreibung(e.target.value)}
                    placeholder={tx('Was soll gemacht werden?')}
                    rows={3}
                  />
                </div>

                <div className="space-y-1">
                  <Label>{tx('Wunschtermin')}</Label>
                  <Input
                    type="datetime-local"
                    value={wunschtermin}
                    onChange={e => setWunschtermin(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{tx('Status')} *</Label>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setStatusKey(opt.key)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                          statusKey === opt.key
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card border-border hover:bg-secondary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{tx('Priorität')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {PRIO_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setPrioritaetKey(opt.key)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                          prioritaetKey === opt.key
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card border-border hover:bg-secondary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>{tx('Bemerkungen')}</Label>
                  <Textarea
                    value={bemerkungenAuftrag}
                    onChange={e => setBemerkungenAuftrag(e.target.value)}
                    placeholder={tx('Optionale Hinweise …')}
                    rows={2}
                  />
                </div>

                {submitError && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <IconAlertCircle size={14} stroke={2} /> {submitError}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    disabled={!auftragsnummer || !arbeitsbeschreibung || submitting}
                    onClick={handleSubmit}
                    className="w-full sm:w-auto"
                  >
                    {submitting ? tx('Wird gespeichert …') : tx('Auftrag anlegen')}
                  </Button>
                  <Button variant="outline" onClick={() => setStep(2)} className="w-full sm:w-auto">
                    {tx('Zurück')}
                  </Button>
                </div>
              </div>
            </div>
          )
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
