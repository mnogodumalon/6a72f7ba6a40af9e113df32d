/**
 * Neuen Werkstattauftrag erstellen — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen oder neu anlegen → 2) Fahrzeug wählen oder neu anlegen → 3) Auftrag erfassen & anlegen.
 * Reads: kunden, fahrzeuge. Writes: kunden (createKundenEntry), fahrzeuge (createFahrzeugeEntry), auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { tx } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kunden, Fahrzeuge } from '@/types/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconUser, IconCar, IconClipboardList, IconCheck } from '@tabler/icons-react';

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function AuftragErstellenPage() {
  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1: Kunde
  const [selectedKunde, setSelectedKunde] = useState<Kunden | null>(null);
  const [showKundeCreate, setShowKundeCreate] = useState(false);
  const [kundeVorname, setKundeVorname] = useState('');
  const [kundeNachname, setKundeNachname] = useState('');
  const [kundeEmail, setKundeEmail] = useState('');
  const [kundeTelefon, setKundeTelefon] = useState('');
  const [kundeCreating, setKundeCreating] = useState(false);
  const [kundeCreateError, setKundeCreateError] = useState('');

  // Step 2: Fahrzeug
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<Fahrzeuge | null>(null);
  const [showFahrzeugCreate, setShowFahrzeugCreate] = useState(false);
  const [fahrzeugKennzeichen, setFahrzeugKennzeichen] = useState('');
  const [fahrzeugMarke, setFahrzeugMarke] = useState('');
  const [fahrzeugModell, setFahrzeugModell] = useState('');
  const [fahrzeugBaujahr, setFahrzeugBaujahr] = useState('');
  const [fahrzeugFin, setFahrzeugFin] = useState('');
  const [fahrzeugCreating, setFahrzeugCreating] = useState(false);
  const [fahrzeugCreateError, setFahrzeugCreateError] = useState('');

  // Step 3: Auftrag
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [statusKey, setStatusKey] = useState(STATUS_OPTIONS[0]?.key ?? 'offen');
  const [prioritaetKey, setPrioritaetKey] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [auftragCreating, setAuftragCreating] = useState(false);
  const [auftragCreateError, setAuftragCreateError] = useState('');

  // Success
  const [createdAuftragId, setCreatedAuftragId] = useState<string | null>(null);

  const handleKundeSelect = (id: string) => {
    const kunde = kunden.find((k) => k.record_id === id) ?? null;
    setSelectedKunde(kunde);
    setSelectedFahrzeug(null);
    setStep(2);
  };

  const handleKundeCreate = async () => {
    if (!kundeVorname.trim() || !kundeNachname.trim()) return;
    setKundeCreating(true);
    setKundeCreateError('');
    try {
      const created = await LivingAppsService.createKundenEntry({
        vorname: kundeVorname.trim(),
        nachname: kundeNachname.trim(),
        email: kundeEmail.trim() || undefined,
        telefon:kundeTelefon.trim() || undefined,
      });
      await fetchAll();
      setShowKundeCreate(false);
      setKundeVorname('');
      setKundeNachname('');
      setKundeEmail('');
      setKundeTelefon('');
      // The fetchAll re-populates kunden; find by id from the result
      setSelectedKunde({ record_id: created.record_id, created_at: '', updated_at: null, createdat: '', updatedat: null, fields: { vorname: kundeVorname.trim(), nachname: kundeNachname.trim() } });
      setSelectedFahrzeug(null);
      setStep(2);
    } catch {
      setKundeCreateError(tx('Fehler beim Anlegen des Kunden.'));
    } finally {
      setKundeCreating(false);
    }
  };

  const handleFahrzeugSelect = (id: string) => {
    const fz = fahrzeuge.find((f) => f.record_id === id) ?? null;
    setSelectedFahrzeug(fz);
    setStep(3);
  };

  const handleFahrzeugCreate = async () => {
    if (!selectedKunde || !fahrzeugKennzeichen.trim() || !fahrzeugMarke.trim() || !fahrzeugModell.trim()) return;
    setFahrzeugCreating(true);
    setFahrzeugCreateError('');
    try {
      const created = await LivingAppsService.createFahrzeugeEntry({
        kennzeichen: fahrzeugKennzeichen.trim(),
        marke: fahrzeugMarke.trim(),
        modell: fahrzeugModell.trim(),
        baujahr: fahrzeugBaujahr ? Number(fahrzeugBaujahr) : undefined,
        fin: fahrzeugFin.trim() || undefined,
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
      });
      await fetchAll();
      setShowFahrzeugCreate(false);
      setFahrzeugKennzeichen('');
      setFahrzeugMarke('');
      setFahrzeugModell('');
      setFahrzeugBaujahr('');
      setFahrzeugFin('');
      setSelectedFahrzeug({ record_id: created.record_id, created_at: '', updated_at: null, createdat: '', updatedat: null, fields: { kennzeichen: fahrzeugKennzeichen.trim(), marke: fahrzeugMarke.trim(), modell: fahrzeugModell.trim() } });
      setStep(3);
    } catch {
      setFahrzeugCreateError(tx('Fehler beim Anlegen des Fahrzeugs.'));
    } finally {
      setFahrzeugCreating(false);
    }
  };

  const handleAuftragCreate = async () => {
    if (!selectedKunde || !selectedFahrzeug || !auftragsnummer.trim() || !arbeitsbeschreibung.trim() || !statusKey) return;
    if (createdAuftragId) return; // idempotency guard
    setAuftragCreating(true);
    setAuftragCreateError('');
    try {
      const payload: Record<string, unknown> = {
        auftragsnummer: auftragsnummer.trim(),
        arbeitsbeschreibung: arbeitsbeschreibung.trim(),
        status: statusKey,
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
      };
      if (wunschtermin) payload.wunschtermin = wunschtermin;
      if (prioritaetKey) payload.prioritaet = prioritaetKey;
      if (bemerkungen.trim()) payload.bemerkungen_auftrag = bemerkungen.trim();

      const created = await LivingAppsService.createAuftraegeEntry(payload as Parameters<typeof LivingAppsService.createAuftraegeEntry>[0]);
      setCreatedAuftragId(created.record_id);
      await fetchAll();
      setStep(4);
    } catch {
      setAuftragCreateError(tx('Fehler beim Anlegen des Auftrags. Bitte erneut versuchen.'));
    } finally {
      setAuftragCreating(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKunde(null);
    setSelectedFahrzeug(null);
    setCreatedAuftragId(null);
    setAuftragsnummer('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setStatusKey(STATUS_OPTIONS[0]?.key ?? 'offen');
    setPrioritaetKey('');
    setBemerkungen('');
    setAuftragCreateError('');
    setShowKundeCreate(false);
    setShowFahrzeugCreate(false);
  };

  // Fahrzeuge filtered to selected customer
  const kundenFahrzeuge = selectedKunde
    ? fahrzeuge.filter((f) => {
        if (!f.fields.kunde) return false;
        const url = createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id);
        return f.fields.kunde === url;
      })
    : [];

  return (
    <IntentWizardShell
      title={tx('Auftrag erstellen')}
      subtitle={tx('Neuen Werkstattauftrag in 3 Schritten anlegen')}
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
          items={kunden.map((k) => ({
            id: k.record_id,
            title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || tx('Unbekannter Kunde'),
            subtitle: [k.fields.telefon, k.fields.email].filter(Boolean).join(' · '),
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          createLabel={tx('Neuen Kunden anlegen')}
          onCreateNew={() => setShowKundeCreate(true)}
          searchPlaceholder={tx('Kunde suchen …')}
          emptyText={tx('Kein Kunde gefunden')}
          createDialog={
            showKundeCreate ? (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">{tx('Neuen Kunden anlegen')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{tx('Vorname')} *</Label>
                    <Input
                      value={kundeVorname}
                      onChange={(e) => setKundeVorname(e.target.value)}
                      placeholder={tx('Vorname')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{tx('Nachname')} *</Label>
                    <Input
                      value={kundeNachname}
                      onChange={(e) => setKundeNachname(e.target.value)}
                      placeholder={tx('Nachname')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{tx('E-Mail')}</Label>
                    <Input
                      type="email"
                      value={kundeEmail}
                      onChange={(e) => setKundeEmail(e.target.value)}
                      placeholder={tx('E-Mail-Adresse')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{tx('Telefon')}</Label>
                    <Input
                      type="tel"
                      value={kundeTelefon}
                      onChange={(e) => setKundeTelefon(e.target.value)}
                      placeholder={tx('Telefonnummer')}
                    />
                  </div>
                </div>
                {kundeCreateError && <p className="text-sm text-destructive">{kundeCreateError}</p>}
                <div className="flex gap-2">
                  <Button
                    disabled={!kundeVorname.trim() || !kundeNachname.trim() || kundeCreating}
                    onClick={handleKundeCreate}
                    className="flex-1"
                  >
                    {kundeCreating ? tx('Wird angelegt …') : tx('Kunden anlegen')}
                  </Button>
                  <Button variant="outline" onClick={() => setShowKundeCreate(false)}>
                    {tx('Abbrechen')}
                  </Button>
                </div>
              </div>
            ) : null
          }
        />
      )}

      {/* Step 2: Fahrzeug wählen */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-secondary px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
              <IconUser size={16} />
              <span>
                {tx('Kunde')}: <strong className="text-foreground">{[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}</strong>
              </span>
            </div>
            <EntitySelectStep
              items={kundenFahrzeuge.map((f) => ({
                id: f.record_id,
                title: f.fields.kennzeichen ?? tx('Unbekanntes Fahrzeug'),
                subtitle: [f.fields.marke, f.fields.modell, f.fields.baujahr ? String(f.fields.baujahr) : ''].filter(Boolean).join(' · '),
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={handleFahrzeugSelect}
              createLabel={tx('Neues Fahrzeug anlegen')}
              onCreateNew={() => setShowFahrzeugCreate(true)}
              searchPlaceholder={tx('Fahrzeug suchen …')}
              emptyText={tx('Kein Fahrzeug für diesen Kunden gefunden')}
              createDialog={
                showFahrzeugCreate ? (
                  <div className="rounded-2xl border bg-card p-4 space-y-3">
                    <p className="text-sm font-medium text-foreground">{tx('Neues Fahrzeug anlegen')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{tx('Kennzeichen')} *</Label>
                        <Input
                          value={fahrzeugKennzeichen}
                          onChange={(e) => setFahrzeugKennzeichen(e.target.value)}
                          placeholder={tx('z.B. M-AB 1234')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{tx('Marke')} *</Label>
                        <Input
                          value={fahrzeugMarke}
                          onChange={(e) => setFahrzeugMarke(e.target.value)}
                          placeholder={tx('z.B. VW')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{tx('Modell')} *</Label>
                        <Input
                          value={fahrzeugModell}
                          onChange={(e) => setFahrzeugModell(e.target.value)}
                          placeholder={tx('z.B. Golf')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{tx('Baujahr')}</Label>
                        <Input
                          type="number"
                          value={fahrzeugBaujahr}
                          onChange={(e) => setFahrzeugBaujahr(e.target.value)}
                          placeholder={tx('z.B. 2018')}
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs text-muted-foreground">{tx('FIN / Fahrgestellnummer')}</Label>
                        <Input
                          value={fahrzeugFin}
                          onChange={(e) => setFahrzeugFin(e.target.value)}
                          placeholder={tx('Fahrgestellnummer (optional)')}
                        />
                      </div>
                    </div>
                    {fahrzeugCreateError && <p className="text-sm text-destructive">{fahrzeugCreateError}</p>}
                    <div className="flex gap-2">
                      <Button
                        disabled={!fahrzeugKennzeichen.trim() || !fahrzeugMarke.trim() || !fahrzeugModell.trim() || fahrzeugCreating}
                        onClick={handleFahrzeugCreate}
                        className="flex-1"
                      >
                        {fahrzeugCreating ? tx('Wird angelegt …') : tx('Fahrzeug anlegen')}
                      </Button>
                      <Button variant="outline" onClick={() => setShowFahrzeugCreate(false)}>
                        {tx('Abbrechen')}
                      </Button>
                    </div>
                  </div>
                ) : null
              }
            />
            <Button variant="outline" className="w-full" onClick={() => setStep(1)}>
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
        selectedKunde && selectedFahrzeug ? (
          <div className="space-y-5">
            {/* Live-Kontext */}
            <div className="rounded-xl bg-secondary px-4 py-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <IconUser size={15} />
                <strong className="text-foreground">{[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <IconCar size={15} />
                <strong className="text-foreground">{selectedFahrzeug.fields.kennzeichen ?? '—'}</strong>
                {selectedFahrzeug.fields.marke && selectedFahrzeug.fields.modell && (
                  <span>{selectedFahrzeug.fields.marke} {selectedFahrzeug.fields.modell}</span>
                )}
              </span>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{tx('Auftragsnummer')} *</Label>
                <Input
                  value={auftragsnummer}
                  onChange={(e) => setAuftragsnummer(e.target.value)}
                  placeholder={tx('z.B. AU-2026-001')}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{tx('Arbeitsbeschreibung')} *</Label>
                <Textarea
                  value={arbeitsbeschreibung}
                  onChange={(e) => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tx('Beschreibung der durchzuführenden Arbeiten …')}
                  rows={4}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{tx('Wunschtermin')}</Label>
                <Input
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={(e) => setWunschtermin(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{tx('Status')} *</Label>
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

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{tx('Priorität')}</Label>
                <div className="flex flex-wrap gap-2">
                  {PRIORITAET_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPrioritaetKey(prioritaetKey === opt.key ? '' : opt.key)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
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
                  value={bemerkungen}
                  onChange={(e) => setBemerkungen(e.target.value)}
                  placeholder={tx('Weitere Hinweise zum Auftrag …')}
                  rows={3}
                />
              </div>
            </div>

            {auftragCreateError && (
              <p className="text-sm text-destructive">{auftragCreateError}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                disabled={!auftragsnummer.trim() || !arbeitsbeschreibung.trim() || !statusKey || auftragCreating}
                onClick={handleAuftragCreate}
                className="flex-1"
              >
                {auftragCreating ? tx('Auftrag wird angelegt …') : tx('Auftrag anlegen')}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)}>
                {tx('Zurück')}
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

      {/* Step 4: Erfolg */}
      {step === 4 && (
        createdAuftragId ? (
          <div className="text-center py-12 space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <IconCheck size={32} className="text-primary" stroke={2} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">{tx('Auftrag erfolgreich angelegt')}</h2>
              <p className="text-sm text-muted-foreground">
                {tx('Auftragsnummer')}: <strong className="text-foreground">{auftragsnummer}</strong>
              </p>
              {selectedKunde && (
                <p className="text-sm text-muted-foreground">
                  {tx('Kunde')}: <strong className="text-foreground">{[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}</strong>
                </p>
              )}
              {selectedFahrzeug && (
                <p className="text-sm text-muted-foreground">
                  {tx('Fahrzeug')}: <strong className="text-foreground">{selectedFahrzeug.fields.kennzeichen}</strong>
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset} variant="outline">
                {tx('Neuen Auftrag anlegen')}
              </Button>
              <a href="#/">
                <Button>{tx('Zurück zum Dashboard')}</Button>
              </a>
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
