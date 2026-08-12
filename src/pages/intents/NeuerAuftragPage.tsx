/**
 * Neuer Auftrag — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen/anlegen → 2) Fahrzeug wählen/anlegen → 3) Auftrag erfassen & anlegen.
 * Reads: kunden, fahrzeuge. Writes: kunden (createKundenEntry), fahrzeuge (createFahrzeugeEntry), auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { tx } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IconUser, IconCar, IconClipboardList, IconCircleCheck } from '@tabler/icons-react';

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function NeuerAuftragPage() {
  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1: Kunde
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [showKundeCreate, setShowKundeCreate] = useState(false);
  const [newVorname, setNewVorname] = useState('');
  const [newNachname, setNewNachname] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTelefon, setNewTelefon] = useState('');
  const [kundeCreating, setKundeCreating] = useState(false);

  // Step 2: Fahrzeug
  const [selectedFahrzeugId, setSelectedFahrzeugId] = useState<string | null>(null);
  const [showFahrzeugCreate, setShowFahrzeugCreate] = useState(false);
  const [newKennzeichen, setNewKennzeichen] = useState('');
  const [newMarke, setNewMarke] = useState('');
  const [newModell, setNewModell] = useState('');
  const [newBaujahr, setNewBaujahr] = useState('');
  const [newFin, setNewFin] = useState('');
  const [newKilometerstand, setNewKilometerstand] = useState('');
  const [fahrzeugCreating, setFahrzeugCreating] = useState(false);

  // Step 3: Auftrag
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [statusKey, setStatusKey] = useState(STATUS_OPTIONS[0]?.key ?? 'offen');
  const [prioritaetKey, setPrioritaetKey] = useState('normal');
  const [bemerkungenAuftrag, setBemerkungenAuftrag] = useState('');
  const [auftragSubmitting, setAuftragSubmitting] = useState(false);
  const [auftragError, setAuftragError] = useState<string | null>(null);
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState<string | null>(null);

  const handleKundeSelect = (id: string) => {
    setSelectedKundeId(id);
    setSelectedFahrzeugId(null);
    setStep(2);
  };

  const handleCreateKunde = async () => {
    if (!newVorname || !newNachname) return;
    setKundeCreating(true);
    try {
      const created = await LivingAppsService.createKundenEntry({
        vorname: newVorname,
        nachname: newNachname,
        email: newEmail || undefined,
        telefon: newTelefon || undefined,
      });
      await fetchAll();
      setShowKundeCreate(false);
      setNewVorname('');
      setNewNachname('');
      setNewEmail('');
      setNewTelefon('');
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
        fin: newFin || undefined,
        kilometerstand: newKilometerstand ? parseInt(newKilometerstand, 10) : undefined,
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      });
      await fetchAll();
      setShowFahrzeugCreate(false);
      setNewKennzeichen('');
      setNewMarke('');
      setNewModell('');
      setNewBaujahr('');
      setNewFin('');
      setNewKilometerstand('');
      setSelectedFahrzeugId(created.record_id);
      setStep(3);
    } finally {
      setFahrzeugCreating(false);
    }
  };

  const handleCreateAuftrag = async () => {
    if (!auftragsnummer || !arbeitsbeschreibung || !selectedFahrzeugId || !selectedKundeId) return;
    setAuftragSubmitting(true);
    setAuftragError(null);
    try {
      await LivingAppsService.createAuftraegeEntry({
        auftragsnummer,
        arbeitsbeschreibung,
        wunschtermin: wunschtermin || undefined,
        status: statusKey,
        prioritaet: prioritaetKey,
        bemerkungen_auftrag: bemerkungenAuftrag || undefined,
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeugId),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKundeId),
      });
      setCreatedAuftragsnummer(auftragsnummer);
      setStep(4);
    } catch (e) {
      setAuftragError(e instanceof Error ? e.message : tx('Fehler beim Anlegen des Auftrags'));
    } finally {
      setAuftragSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedKundeId(null);
    setSelectedFahrzeugId(null);
    setAuftragsnummer('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setStatusKey(STATUS_OPTIONS[0]?.key ?? 'offen');
    setPrioritaetKey('normal');
    setBemerkungenAuftrag('');
    setAuftragError(null);
    setCreatedAuftragsnummer(null);
    setStep(1);
  };

  const selectedKunde = kunden.find(k => k.record_id === selectedKundeId);
  const fahrzeugeForKunde = selectedKundeId
    ? fahrzeuge.filter(fz => extractRecordId(fz.fields.kunde) === selectedKundeId)
    : [];

  return (
    <IntentWizardShell
      title={tx('Neuer Auftrag')}
      subtitle={tx('Kunden und Fahrzeug wählen, dann Auftrag erfassen')}
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
          onCreateNew={() => setShowKundeCreate(true)}
          searchPlaceholder={tx('Kunden suchen …')}
          emptyText={tx('Noch kein Kunde vorhanden')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
          createDialog={showKundeCreate && (
            <div className="rounded-2xl border p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">{tx('Neuen Kunden anlegen')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Vorname')} *</Label>
                  <Input
                    value={newVorname}
                    onChange={e => setNewVorname(e.target.value)}
                    placeholder={tx('Vorname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Nachname')} *</Label>
                  <Input
                    value={newNachname}
                    onChange={e => setNewNachname(e.target.value)}
                    placeholder={tx('Nachname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('E-Mail')}</Label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder={tx('E-Mail')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Telefon')}</Label>
                  <Input
                    type="tel"
                    value={newTelefon}
                    onChange={e => setNewTelefon(e.target.value)}
                    placeholder={tx('Telefon')}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={!newVorname || !newNachname || kundeCreating}
                  onClick={handleCreateKunde}
                >
                  {kundeCreating ? tx('Wird angelegt …') : tx('Anlegen')}
                </Button>
                <Button variant="outline" onClick={() => setShowKundeCreate(false)}>
                  {tx('Abbrechen')}
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
              <div className="rounded-2xl border bg-card p-3 flex items-center gap-3">
                <IconUser size={18} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">{tx('Kunde:')}</span>
                <span className="text-sm font-medium truncate min-w-0">
                  {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                </span>
              </div>
            )}
            <EntitySelectStep
              items={fahrzeugeForKunde.map(fz => ({
                id: fz.record_id,
                title: [fz.fields.kennzeichen, fz.fields.marke, fz.fields.modell].filter(Boolean).join(' · ') || fz.record_id,
                subtitle: [
                  fz.fields.baujahr ? String(fz.fields.baujahr) : null,
                  fz.fields.kilometerstand ? `${fz.fields.kilometerstand.toLocaleString('de-DE')} km` : null,
                ].filter(Boolean).join(' · '),
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={handleFahrzeugSelect}
              createLabel={tx('Neues Fahrzeug anlegen')}
              onCreateNew={() => setShowFahrzeugCreate(true)}
              searchPlaceholder={tx('Fahrzeug suchen …')}
              emptyText={tx('Kein Fahrzeug für diesen Kunden vorhanden')}
              emptyIcon={<IconCar size={32} className="text-muted-foreground" />}
              createDialog={showFahrzeugCreate && (
                <div className="rounded-2xl border p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">{tx('Neues Fahrzeug anlegen')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Kennzeichen')} *</Label>
                      <Input
                        value={newKennzeichen}
                        onChange={e => setNewKennzeichen(e.target.value)}
                        placeholder={tx('z. B. B-AB 1234')}
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
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('FIN')}</Label>
                      <Input
                        value={newFin}
                        onChange={e => setNewFin(e.target.value)}
                        placeholder={tx('Fahrzeugidentifikationsnummer')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tx('Kilometerstand')}</Label>
                      <Input
                        type="number"
                        value={newKilometerstand}
                        onChange={e => setNewKilometerstand(e.target.value)}
                        placeholder={tx('km')}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={!newKennzeichen || !newMarke || !newModell || fahrzeugCreating}
                      onClick={handleCreateFahrzeug}
                    >
                      {fahrzeugCreating ? tx('Wird angelegt …') : tx('Anlegen')}
                    </Button>
                    <Button variant="outline" onClick={() => setShowFahrzeugCreate(false)}>
                      {tx('Abbrechen')}
                    </Button>
                  </div>
                </div>
              )}
            />
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Zurück zu Schritt 1')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 3: Auftrag erfassen */}
      {step === 3 && (
        selectedKundeId && selectedFahrzeugId ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selectedKunde && (
                <div className="rounded-2xl border bg-card p-3 flex items-center gap-3">
                  <IconUser size={18} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tx('Kunde')}</p>
                    <p className="text-sm font-medium truncate">
                      {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                    </p>
                  </div>
                </div>
              )}
              {(() => {
                const fz = fahrzeuge.find(f => f.record_id === selectedFahrzeugId);
                return fz ? (
                  <div className="rounded-2xl border bg-card p-3 flex items-center gap-3">
                    <IconCar size={18} className="text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Fahrzeug')}</p>
                      <p className="text-sm font-medium truncate">
                        {[fz.fields.kennzeichen, fz.fields.marke, fz.fields.modell].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>

            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <IconClipboardList size={18} className="text-primary" />
                <h3 className="text-sm font-semibold">{tx('Auftragsdetails')}</h3>
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
                  placeholder={tx('Beschreibung der Arbeiten …')}
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
                <Label className="text-xs text-muted-foreground">{tx('Status')}</Label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setStatusKey(opt.key)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                        statusKey === opt.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{tx('Priorität')}</Label>
                <div className="flex flex-wrap gap-2">
                  {PRIORITAET_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPrioritaetKey(opt.key)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                        prioritaetKey === opt.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-foreground border-border hover:border-primary/50'
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
                  placeholder={tx('Interne Hinweise …')}
                  rows={2}
                />
              </div>

              {auftragError && (
                <p className="text-sm text-destructive">{auftragError}</p>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  disabled={!auftragsnummer || !arbeitsbeschreibung || auftragSubmitting}
                  onClick={handleCreateAuftrag}
                >
                  {auftragSubmitting ? tx('Wird angelegt …') : tx('Auftrag anlegen')}
                </Button>
                <Button variant="outline" onClick={() => setStep(2)}>
                  {tx('Zurück')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 4: Bestätigung */}
      {step === 4 && (
        createdAuftragsnummer ? (
          <div className="flex flex-col items-center text-center py-12 space-y-6">
            <div className="rounded-full bg-primary/10 p-4">
              <IconCircleCheck size={40} className="text-primary" stroke={1.5} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">{tx('Auftrag angelegt!')}</h2>
              <p className="text-sm text-muted-foreground">
                {tx('Auftragsnummer:')} <span className="font-mono font-medium text-foreground">{createdAuftragsnummer}</span>
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
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
