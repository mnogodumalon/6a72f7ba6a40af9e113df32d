/**
 * Neuer Auftrag — 4-Schritt-Wizard.
 * Steps: 1) Kunde wählen/anlegen → 2) Fahrzeug wählen/anlegen → 3) Auftrag anlegen → 4) Zusammenfassung.
 * Reads: kunden, fahrzeuge. Writes: kunden (createKundenEntry), fahrzeuge (createFahrzeugeEntry), auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { makeT } from '@/i18n';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kunden, Fahrzeuge } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconCar, IconUser, IconClipboardList, IconCircleCheck, IconAlertCircle } from '@tabler/icons-react';
import { format } from 'date-fns';

const tt = makeT({
  de: {
    title: 'Neuer Auftrag', /* i18n-exempt */
    subtitle: 'Reparaturauftrag in 4 Schritten anlegen', /* i18n-exempt */
    step1: 'Kunde',
    step2: 'Fahrzeug',
    step3: 'Auftrag',
    step4: 'Fertig',
    selectKunde: 'Kunde auswählen',
    newKunde: 'Neuen Kunden anlegen',
    vorname: 'Vorname',
    nachname: 'Nachname',
    email: 'E-Mail',
    telefon: 'Telefon',
    strasse: 'Straße',
    hausnummer: 'Hausnummer',
    plz: 'PLZ',
    ort: 'Ort',
    create: 'Anlegen',
    cancel: 'Abbrechen',
    selectFahrzeug: 'Fahrzeug auswählen',
    newFahrzeug: 'Neues Fahrzeug anlegen',
    kennzeichen: 'Kennzeichen',
    marke: 'Marke',
    modell: 'Modell',
    baujahr: 'Baujahr',
    fin: 'FIN',
    kilometerstand: 'Kilometerstand (km)',
    noVehiclesForKunde: 'Noch kein Fahrzeug für diesen Kunden',
    auftragsnummer: 'Auftragsnummer',
    arbeitsbeschreibung: 'Arbeitsbeschreibung',
    wunschtermin: 'Wunschtermin',
    statusLabel: 'Status',
    prioritaetLabel: 'Priorität',
    bemerkungen: 'Bemerkungen',
    auftragAnlegen: 'Auftrag anlegen',
    submitting: 'Wird angelegt…',
    summaryTitle: 'Auftrag erfolgreich angelegt',
    summaryOrder: 'Auftragsnummer',
    summaryKunde: 'Kunde',
    summaryFahrzeug: 'Fahrzeug',
    summaryStatus: 'Status',
    summaryWunschtermin: 'Wunschtermin',
    newOrder: 'Neuen Auftrag anlegen',
    toDashboard: 'Zurück zum Dashboard',
    backToStep1: 'Zurück zu Schritt 1',
    backToStep2: 'Zurück zu Schritt 2',
    step3NoPrereq: 'Dieser Schritt braucht Kunde und Fahrzeug aus den vorherigen Schritten.',
    restart: 'Neu starten',
    requiredHint: 'Pflichtfelder sind mit * markiert',
    errorCreate: 'Fehler beim Anlegen. Bitte erneut versuchen.',
    kundeSearchPlaceholder: 'Kunden suchen…',
    fahrzeugSearchPlaceholder: 'Fahrzeug suchen…',
  },
  en: {
    title: 'New Order', /* i18n-exempt */
    subtitle: 'Create a repair order in 4 steps', /* i18n-exempt */
    step1: 'Customer',
    step2: 'Vehicle',
    step3: 'Order',
    step4: 'Done',
    selectKunde: 'Select customer',
    newKunde: 'Create new customer',
    vorname: 'First Name',
    nachname: 'Last Name',
    email: 'Email',
    telefon: 'Phone',
    strasse: 'Street',
    hausnummer: 'House Number',
    plz: 'Postal Code',
    ort: 'City',
    create: 'Create',
    cancel: 'Cancel',
    selectFahrzeug: 'Select vehicle',
    newFahrzeug: 'Create new vehicle',
    kennzeichen: 'License Plate',
    marke: 'Make',
    modell: 'Model',
    baujahr: 'Year',
    fin: 'VIN',
    kilometerstand: 'Mileage (km)',
    noVehiclesForKunde: 'No vehicles for this customer yet',
    auftragsnummer: 'Order Number',
    arbeitsbeschreibung: 'Work Description',
    wunschtermin: 'Requested Date',
    statusLabel: 'Status',
    prioritaetLabel: 'Priority',
    bemerkungen: 'Notes',
    auftragAnlegen: 'Create Order',
    submitting: 'Creating…',
    summaryTitle: 'Order successfully created',
    summaryOrder: 'Order Number',
    summaryKunde: 'Customer',
    summaryFahrzeug: 'Vehicle',
    summaryStatus: 'Status',
    summaryWunschtermin: 'Requested Date',
    newOrder: 'Create new order',
    toDashboard: 'Back to Dashboard',
    backToStep1: 'Back to Step 1',
    backToStep2: 'Back to Step 2',
    step3NoPrereq: 'This step requires a customer and vehicle from the previous steps.',
    restart: 'Restart',
    requiredHint: 'Required fields are marked with *',
    errorCreate: 'Error creating the record. Please try again.',
    kundeSearchPlaceholder: 'Search customers…',
    fahrzeugSearchPlaceholder: 'Search vehicles…',
  },
});

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function NeuerAuftragPage() {
  const { kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1 state
  const [selectedKunde, setSelectedKunde] = useState<Kunden | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [kundeVorname, setKundeVorname] = useState('');
  const [kundeNachname, setKundeNachname] = useState('');
  const [kundeEmail, setKundeEmail] = useState('');
  const [kundeTelefon, setKundeTelefon] = useState('');
  const [kundeStrasse, setKundeStrasse] = useState('');
  const [kundeHausnummer, setKundeHausnummer] = useState('');
  const [kundePlz, setKundePlz] = useState('');
  const [kundeOrt, setKundeOrt] = useState('');
  const [kundeCreating, setKundeCreating] = useState(false);
  const [kundeError, setKundeError] = useState('');

  // Step 2 state
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<Fahrzeuge | null>(null);
  const [showCreateFahrzeug, setShowCreateFahrzeug] = useState(false);
  const [fahrzeugKennzeichen, setFahrzeugKennzeichen] = useState('');
  const [fahrzeugMarke, setFahrzeugMarke] = useState('');
  const [fahrzeugModell, setFahrzeugModell] = useState('');
  const [fahrzeugBaujahr, setFahrzeugBaujahr] = useState('');
  const [fahrzeugFin, setFahrzeugFin] = useState('');
  const [fahrzeugKm, setFahrzeugKm] = useState('');
  const [fahrzeugCreating, setFahrzeugCreating] = useState(false);
  const [fahrzeugError, setFahrzeugError] = useState('');

  // Step 3 state
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [statusKey, setStatusKey] = useState(STATUS_OPTIONS[0]?.key ?? 'offen');
  const [prioritaetKey, setPrioritaetKey] = useState(PRIORITAET_OPTIONS.find(o => o.key === 'normal')?.key ?? PRIORITAET_OPTIONS[0]?.key ?? 'normal');
  const [bemerkungen, setBemerkungen] = useState('');
  const [auftragSubmitting, setAuftragSubmitting] = useState(false);
  const [auftragError, setAuftragError] = useState('');

  // Step 4 state — idempotency: store created auftrag id
  const [createdAuftragId, setCreatedAuftragId] = useState('');
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState('');

  // Derived: filter fahrzeuge for selected kunde
  const kundenFahrzeuge = selectedKunde
    ? fahrzeuge.filter(f => extractRecordId(f.fields.kunde) === selectedKunde.record_id)
    : [];

  const handleKundeSelect = (id: string) => {
    const kunde = kunden.find(k => k.record_id === id) ?? null;
    setSelectedKunde(kunde);
    setSelectedFahrzeug(null);
    setStep(2);
  };

  const handleCreateKunde = async () => {
    if (!kundeVorname.trim() || !kundeNachname.trim()) return;
    setKundeCreating(true);
    setKundeError('');
    try {
      const created = await LivingAppsService.createKundenEntry({
        vorname: kundeVorname.trim(),
        nachname: kundeNachname.trim(),
        email: kundeEmail.trim() || undefined,
        telefon: kundeTelefon.trim() || undefined,
        strasse: kundeStrasse.trim() || undefined,
        hausnummer: kundeHausnummer.trim() || undefined,
        plz: kundePlz.trim() || undefined,
        ort: kundeOrt.trim() || undefined,
      });
      await fetchAll();
      setShowCreateKunde(false);
      setKundeVorname('');
      setKundeNachname('');
      setKundeEmail('');
      setKundeTelefon('');
      setKundeStrasse('');
      setKundeHausnummer('');
      setKundePlz('');
      setKundeOrt('');
      // Find and select the newly created kunde
      const newKunde = kunden.find(k => k.record_id === created.record_id) ?? {
        record_id: created.record_id,
        created_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        updated_at: null,
        createdat: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        updatedat: null,
        fields: {
          vorname: kundeVorname.trim(),
          nachname: kundeNachname.trim(),
        },
      } as Kunden;
      setSelectedKunde(newKunde);
      setSelectedFahrzeug(null);
      setStep(2);
    } catch {
      setKundeError(tt('errorCreate'));
    } finally {
      setKundeCreating(false);
    }
  };

  const handleFahrzeugSelect = (id: string) => {
    const fahrzeug = fahrzeuge.find(f => f.record_id === id) ?? null;
    setSelectedFahrzeug(fahrzeug);
    setStep(3);
  };

  const handleCreateFahrzeug = async () => {
    if (!fahrzeugKennzeichen.trim() || !fahrzeugMarke.trim() || !fahrzeugModell.trim() || !selectedKunde) return;
    setFahrzeugCreating(true);
    setFahrzeugError('');
    try {
      const created = await LivingAppsService.createFahrzeugeEntry({
        kennzeichen: fahrzeugKennzeichen.trim(),
        marke: fahrzeugMarke.trim(),
        modell: fahrzeugModell.trim(),
        baujahr: fahrzeugBaujahr ? parseInt(fahrzeugBaujahr, 10) : undefined,
        fin: fahrzeugFin.trim() || undefined,
        kilometerstand: fahrzeugKm ? parseInt(fahrzeugKm, 10) : undefined,
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
      });
      await fetchAll();
      setShowCreateFahrzeug(false);
      setFahrzeugKennzeichen('');
      setFahrzeugMarke('');
      setFahrzeugModell('');
      setFahrzeugBaujahr('');
      setFahrzeugFin('');
      setFahrzeugKm('');
      const newFahrzeug = fahrzeuge.find(f => f.record_id === created.record_id) ?? {
        record_id: created.record_id,
        created_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        updated_at: null,
        createdat: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        updatedat: null,
        fields: {
          kennzeichen: fahrzeugKennzeichen.trim(),
          marke: fahrzeugMarke.trim(),
          modell: fahrzeugModell.trim(),
          kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
        },
      } as Fahrzeuge;
      setSelectedFahrzeug(newFahrzeug);
      setStep(3);
    } catch {
      setFahrzeugError(tt('errorCreate'));
    } finally {
      setFahrzeugCreating(false);
    }
  };

  const handleCreateAuftrag = async () => {
    if (!auftragsnummer.trim() || !arbeitsbeschreibung.trim() || !selectedKunde || !selectedFahrzeug) return;
    // Idempotency guard: if already created, skip the create
    let auftragId = createdAuftragId;
    if (auftragId) {
      setStep(4);
      return;
    }
    setAuftragSubmitting(true);
    setAuftragError('');
    try {
      const payload: Record<string, unknown> = {
        auftragsnummer: auftragsnummer.trim(),
        arbeitsbeschreibung: arbeitsbeschreibung.trim(),
        status: statusKey,
        prioritaet: prioritaetKey,
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
        kunde: createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id),
      };
      if (wunschtermin) {
        payload.wunschtermin = wunschtermin;
      }
      if (bemerkungen.trim()) {
        payload.bemerkungen_auftrag = bemerkungen.trim();
      }
      const created = await LivingAppsService.createAuftraegeEntry(payload as Parameters<typeof LivingAppsService.createAuftraegeEntry>[0]);
      auftragId = created.record_id;
      setCreatedAuftragId(auftragId);
      setCreatedAuftragsnummer(auftragsnummer.trim());
      setStep(4);
    } catch {
      setAuftragError(tt('errorCreate'));
    } finally {
      setAuftragSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKunde(null);
    setSelectedFahrzeug(null);
    setShowCreateKunde(false);
    setShowCreateFahrzeug(false);
    setAuftragsnummer('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setStatusKey(STATUS_OPTIONS[0]?.key ?? 'offen');
    setPrioritaetKey(PRIORITAET_OPTIONS.find(o => o.key === 'normal')?.key ?? PRIORITAET_OPTIONS[0]?.key ?? 'normal');
    setBemerkungen('');
    setAuftragError('');
    setCreatedAuftragId('');
    setCreatedAuftragsnummer('');
  };

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
        { label: tt('step4') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Kunde wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={kunden.map(k => ({
            id: k.record_id,
            title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.telefon].filter(Boolean).join(' · '),
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          searchPlaceholder={tt('kundeSearchPlaceholder')}
          createLabel={tt('newKunde')}
          onCreateNew={() => { setShowCreateKunde(true); setKundeError(''); }}
          createDialog={showCreateKunde && (
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-xs text-muted-foreground">{tt('requiredHint')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">{tt('vorname')} *</Label>
                  <Input
                    value={kundeVorname}
                    onChange={e => setKundeVorname(e.target.value)}
                    placeholder={tt('vorname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">{tt('nachname')} *</Label>
                  <Input
                    value={kundeNachname}
                    onChange={e => setKundeNachname(e.target.value)}
                    placeholder={tt('nachname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">{tt('email')}</Label>
                  <Input
                    type="email"
                    value={kundeEmail}
                    onChange={e => setKundeEmail(e.target.value)}
                    placeholder={tt('email')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">{tt('telefon')}</Label>
                  <Input
                    type="tel"
                    value={kundeTelefon}
                    onChange={e => setKundeTelefon(e.target.value)}
                    placeholder={tt('telefon')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">{tt('strasse')}</Label>
                  <Input
                    value={kundeStrasse}
                    onChange={e => setKundeStrasse(e.target.value)}
                    placeholder={tt('strasse')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">{tt('hausnummer')}</Label>
                  <Input
                    value={kundeHausnummer}
                    onChange={e => setKundeHausnummer(e.target.value)}
                    placeholder={tt('hausnummer')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">{tt('plz')}</Label>
                  <Input
                    value={kundePlz}
                    onChange={e => setKundePlz(e.target.value)}
                    placeholder={tt('plz')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">{tt('ort')}</Label>
                  <Input
                    value={kundeOrt}
                    onChange={e => setKundeOrt(e.target.value)}
                    placeholder={tt('ort')}
                  />
                </div>
              </div>
              {kundeError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <IconAlertCircle size={14} stroke={2} />
                  {kundeError}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  disabled={!kundeVorname.trim() || !kundeNachname.trim() || kundeCreating}
                  onClick={handleCreateKunde}
                >
                  {kundeCreating ? tt('submitting') : tt('create')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setShowCreateKunde(false); setKundeError(''); }}
                >
                  {tt('cancel')}
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* ── Step 2: Fahrzeug wählen ── */}
      {step === 2 && (
        selectedKunde ? (
          <EntitySelectStep
            items={kundenFahrzeuge.map(f => ({
              id: f.record_id,
              title: [f.fields.kennzeichen, f.fields.marke, f.fields.modell].filter(Boolean).join(' · '),
              subtitle: [
                f.fields.baujahr ? String(f.fields.baujahr) : null,
                f.fields.kilometerstand ? `${f.fields.kilometerstand} km` : null,
              ].filter(Boolean).join(' · '),
              icon: <IconCar size={20} className="text-primary" />,
            }))}
            onSelect={handleFahrzeugSelect}
            searchPlaceholder={tt('fahrzeugSearchPlaceholder')}
            emptyText={tt('noVehiclesForKunde')}
            emptyIcon={<IconCar size={32} className="text-muted-foreground" />}
            createLabel={tt('newFahrzeug')}
            onCreateNew={() => { setShowCreateFahrzeug(true); setFahrzeugError(''); }}
            createDialog={showCreateFahrzeug && (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <p className="text-xs text-muted-foreground">{tt('requiredHint')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm">{tt('kennzeichen')} *</Label>
                    <Input
                      value={fahrzeugKennzeichen}
                      onChange={e => setFahrzeugKennzeichen(e.target.value)}
                      placeholder={tt('kennzeichen')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">{tt('marke')} *</Label>
                    <Input
                      value={fahrzeugMarke}
                      onChange={e => setFahrzeugMarke(e.target.value)}
                      placeholder={tt('marke')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">{tt('modell')} *</Label>
                    <Input
                      value={fahrzeugModell}
                      onChange={e => setFahrzeugModell(e.target.value)}
                      placeholder={tt('modell')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">{tt('baujahr')}</Label>
                    <Input
                      type="number"
                      value={fahrzeugBaujahr}
                      onChange={e => setFahrzeugBaujahr(e.target.value)}
                      placeholder={tt('baujahr')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">{tt('fin')}</Label>
                    <Input
                      value={fahrzeugFin}
                      onChange={e => setFahrzeugFin(e.target.value)}
                      placeholder={tt('fin')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">{tt('kilometerstand')}</Label>
                    <Input
                      type="number"
                      value={fahrzeugKm}
                      onChange={e => setFahrzeugKm(e.target.value)}
                      placeholder={tt('kilometerstand')}
                    />
                  </div>
                </div>
                {fahrzeugError && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <IconAlertCircle size={14} stroke={2} />
                    {fahrzeugError}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    disabled={!fahrzeugKennzeichen.trim() || !fahrzeugMarke.trim() || !fahrzeugModell.trim() || fahrzeugCreating}
                    onClick={handleCreateFahrzeug}
                  >
                    {fahrzeugCreating ? tt('submitting') : tt('create')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setShowCreateFahrzeug(false); setFahrzeugError(''); }}
                  >
                    {tt('cancel')}
                  </Button>
                </div>
              </div>
            )}
          />
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step3NoPrereq')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Auftrag anlegen ── */}
      {step === 3 && (
        selectedKunde && selectedFahrzeug ? (
          <div className="space-y-4 max-w-2xl">
            {/* Context recap */}
            <div className="rounded-xl border bg-secondary/50 px-4 py-3 flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <IconUser size={14} stroke={2} />
                {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <IconCar size={14} stroke={2} />
                {[selectedFahrzeug.fields.kennzeichen, selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell].filter(Boolean).join(' ')}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">{tt('requiredHint')}</p>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm">{tt('auftragsnummer')} *</Label>
                <Input
                  value={auftragsnummer}
                  onChange={e => setAuftragsnummer(e.target.value)}
                  placeholder="AU-2026-001"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm">{tt('arbeitsbeschreibung')} *</Label>
                <Textarea
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tt('arbeitsbeschreibung')}
                  rows={3}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm">{tt('wunschtermin')}</Label>
                <Input
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={e => setWunschtermin(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">{tt('statusLabel')}</Label>
                  <Select value={statusKey} onValueChange={setStatusKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(o => (
                        <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm">{tt('prioritaetLabel')}</Label>
                  <div className="flex gap-2">
                    {PRIORITAET_OPTIONS.map(o => (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => setPrioritaetKey(o.key)}
                        className={[
                          'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                          prioritaetKey === o.key
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card text-foreground border-border hover:bg-secondary',
                        ].join(' ')}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-sm">{tt('bemerkungen')}</Label>
                <Textarea
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder={tt('bemerkungen')}
                  rows={2}
                />
              </div>
            </div>

            {auftragError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <IconAlertCircle size={14} stroke={2} />
                {auftragError}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                disabled={!auftragsnummer.trim() || !arbeitsbeschreibung.trim() || auftragSubmitting}
                onClick={handleCreateAuftrag}
                className="flex items-center gap-2"
              >
                <IconClipboardList size={16} stroke={2} />
                {auftragSubmitting ? tt('submitting') : tt('auftragAnlegen')}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)}>
                {tt('backToStep2')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step3NoPrereq')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Zusammenfassung ── */}
      {step === 4 && (
        createdAuftragId ? (
          <div className="space-y-6 max-w-lg">
            <div className="flex flex-col items-center gap-2 py-4">
              <IconCircleCheck size={48} className="text-green-500" stroke={1.5} />
              <h2 className="text-lg font-semibold">{tt('summaryTitle')}</h2>
            </div>

            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="divide-y">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">{tt('summaryOrder')}</span>
                  <span className="text-sm font-semibold">{createdAuftragsnummer}</span>
                </div>
                {selectedKunde && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-muted-foreground">{tt('summaryKunde')}</span>
                    <span className="text-sm">
                      {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                    </span>
                  </div>
                )}
                {selectedFahrzeug && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-muted-foreground">{tt('summaryFahrzeug')}</span>
                    <span className="text-sm">
                      {[selectedFahrzeug.fields.kennzeichen, selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell].filter(Boolean).join(' ')}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">{tt('summaryStatus')}</span>
                  <StatusBadge
                    statusKey={statusKey}
                    label={STATUS_OPTIONS.find(o => o.key === statusKey)?.label ?? statusKey}
                  />
                </div>
                {wunschtermin && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-muted-foreground">{tt('summaryWunschtermin')}</span>
                    <span className="text-sm">{wunschtermin.replace('T', ' ')}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleReset} variant="outline">
                {tt('newOrder')}
              </Button>
              <a href="#/">
                <Button>{tt('toDashboard')}</Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step3NoPrereq')}</p>
            <Button variant="outline" onClick={() => setStep(3)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
