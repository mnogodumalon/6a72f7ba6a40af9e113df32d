/**
 * Auftrag anlegen — 3-Schritt-Wizard.
 * Steps: 1) Fahrzeug wählen (oder neu anlegen) → 2) Kunden bestätigen / auswählen →
 *        3) Auftrag erfassen & anlegen.
 * Reads: fahrzeuge, kunden, auftraege.
 * Writes: fahrzeuge (createFahrzeugeEntry), kunden (createKundenEntry),
 *         auftraege (createAuftraegeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  IconCar,
  IconUser,
  IconClipboardList,
  IconCheck,
  IconPlus,
} from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichFahrzeuge } from '@/lib/enrich';
import type { EnrichedFahrzeuge } from '@/types/enriched';
import type { Kunden } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { tx } from '@/i18n';

const STATUS_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['status'] ?? [];
const PRIORITAET_OPTIONS = LOOKUP_OPTIONS['auftraege']?.['prioritaet'] ?? [];

export default function AuftragAnlegenPage() {
  const { fahrzeuge, kunden, auftraege, kundenMap, fetchAll, loading, error } = useDashboardData();

  // Wizard step
  const [step, setStep] = useState(1);

  // Step 1 — Fahrzeug
  const [selectedFahrzeug, setSelectedFahrzeug] = useState<EnrichedFahrzeuge | null>(null);
  const [showCreateFahrzeug, setShowCreateFahrzeug] = useState(false);
  const [newKennzeichen, setNewKennzeichen] = useState('');
  const [newMarke, setNewMarke] = useState('');
  const [newModell, setNewModell] = useState('');
  const [newBaujahr, setNewBaujahr] = useState('');
  const [newFin, setNewFin] = useState('');
  const [newKilometerstand, setNewKilometerstand] = useState('');
  const [newFahrzeugKundeId, setNewFahrzeugKundeId] = useState('');
  const [creatingFahrzeug, setCreatingFahrzeug] = useState(false);

  // Step 2 — Kunde
  const [selectedKunde, setSelectedKunde] = useState<Kunden | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newVorname, setNewVorname] = useState('');
  const [newNachname, setNewNachname] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTelefon, setNewTelefon] = useState('');
  const [creatingKunde, setCreatingKunde] = useState(false);

  // Step 3 — Auftrag
  const [auftragsnummer, setAuftragsnummer] = useState('');
  const [arbeitsbeschreibung, setArbeitsbeschreibung] = useState('');
  const [wunschtermin, setWunschtermin] = useState('');
  const [statusKey, setStatusKey] = useState(STATUS_OPTIONS[0]?.key ?? 'offen');
  const [prioritaetKey, setPrioritaetKey] = useState('normal');
  const [bemerkungenAuftrag, setBemerkungenAuftrag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAuftragsnummer, setCreatedAuftragsnummer] = useState<string | null>(null);

  // Enrich Fahrzeuge for display
  const enrichedFahrzeuge = useMemo(
    () => enrichFahrzeuge(fahrzeuge, { kundenMap }),
    [fahrzeuge, kundenMap]
  );

  // Derive kunde from selected Fahrzeug
  const derivedKundeFromFahrzeug = useMemo((): Kunden | null => {
    if (!selectedFahrzeug?.fields.kunde) return null;
    const kundeId = extractRecordId(selectedFahrzeug.fields.kunde);
    if (!kundeId) return null;
    return kundenMap.get(kundeId) ?? null;
  }, [selectedFahrzeug, kundenMap]);

  // Generate default Auftragsnummer
  const suggestedAuftragsnummer = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const counter = String(auftraege.length + 1).padStart(3, '0');
    return `AU-${today}-${counter}`;
  }, [auftraege.length]);

  // Handle Fahrzeug selection
  function handleFahrzeugSelect(id: string) {
    const fz = enrichedFahrzeuge.find(f => f.record_id === id) ?? null;
    setSelectedFahrzeug(fz);
    const kunde = fz?.fields.kunde ? kundenMap.get(extractRecordId(fz.fields.kunde) ?? '') ?? null : null;
    setSelectedKunde(kunde);
    setStep(2);
  }

  // Create new Fahrzeug
  async function handleCreateFahrzeug() {
    if (!newKennzeichen || !newMarke || !newModell) return;
    setCreatingFahrzeug(true);
    try {
      const payload: Record<string, unknown> = {
        kennzeichen: newKennzeichen,
        marke: newMarke,
        modell: newModell,
      };
      if (newBaujahr) payload.baujahr = Number(newBaujahr);
      if (newFin) payload.fin = newFin;
      if (newKilometerstand) payload.kilometerstand = Number(newKilometerstand);
      if (newFahrzeugKundeId) payload.kunde = createRecordUrl(APP_IDS.KUNDEN, newFahrzeugKundeId);

      const created = await LivingAppsService.createFahrzeugeEntry(payload);
      await fetchAll();
      setShowCreateFahrzeug(false);
      setNewKennzeichen('');
      setNewMarke('');
      setNewModell('');
      setNewBaujahr('');
      setNewFin('');
      setNewKilometerstand('');
      setNewFahrzeugKundeId('');
      handleFahrzeugSelect(created.record_id);
    } catch (e) {
      // error displayed below
    } finally {
      setCreatingFahrzeug(false);
    }
  }

  // Handle Kunden selection in step 2
  function handleKundeSelect(id: string) {
    const k = kunden.find(k => k.record_id === id) ?? null;
    setSelectedKunde(k);
    setAuftragsnummer(suggestedAuftragsnummer);
    setStep(3);
  }

  // Confirm derived Kunden
  function handleConfirmKunde() {
    setAuftragsnummer(suggestedAuftragsnummer);
    setStep(3);
  }

  // Create new Kunden
  async function handleCreateKunde() {
    if (!newVorname || !newNachname) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenEntry({
        vorname: newVorname,
        nachname: newNachname,
        ...(newEmail ? { email: newEmail } : {}),
        ...(newTelefon ? { telefon: newTelefon } : {}),
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNewVorname('');
      setNewNachname('');
      setNewEmail('');
      setNewTelefon('');
      handleKundeSelect(created.record_id);
    } catch (e) {
      // error displayed below
    } finally {
      setCreatingKunde(false);
    }
  }

  // Submit Auftrag
  async function handleSubmitAuftrag() {
    if (!selectedFahrzeug || !auftragsnummer || !arbeitsbeschreibung) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        auftragsnummer,
        arbeitsbeschreibung,
        status: statusKey,
        prioritaet: prioritaetKey,
        fahrzeug: createRecordUrl(APP_IDS.FAHRZEUGE, selectedFahrzeug.record_id),
      };
      if (selectedKunde) {
        payload.kunde = createRecordUrl(APP_IDS.KUNDEN, selectedKunde.record_id);
      }
      if (wunschtermin) {
        payload.wunschtermin = wunschtermin;
      }
      if (bemerkungenAuftrag) {
        payload.bemerkungen_auftrag = bemerkungenAuftrag;
      }

      await LivingAppsService.createAuftraegeEntry(payload);
      await fetchAll();
      setCreatedAuftragsnummer(auftragsnummer);
      setStep(4);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Fehler beim Anlegen des Auftrags.'));
    } finally {
      setSubmitting(false);
    }
  }

  // Reset wizard
  function handleReset() {
    setStep(1);
    setSelectedFahrzeug(null);
    setSelectedKunde(null);
    setShowCreateFahrzeug(false);
    setShowCreateKunde(false);
    setAuftragsnummer('');
    setArbeitsbeschreibung('');
    setWunschtermin('');
    setStatusKey(STATUS_OPTIONS[0]?.key ?? 'offen');
    setPrioritaetKey('normal');
    setBemerkungenAuftrag('');
    setSubmitError(null);
    setCreatedAuftragsnummer(null);
  }

  return (
    <IntentWizardShell
      title={tx('Auftrag anlegen')}
      subtitle={tx('Fahrzeug wählen, Kunden bestätigen und Auftrag erfassen')}
      steps={[
        { label: tx('Fahrzeug') },
        { label: tx('Kunde') },
        { label: tx('Auftrag') },
        { label: tx('Fertig') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Fahrzeug wählen ─────────────────────────────────────── */}
      {step === 1 && (
        <EntitySelectStep
          items={enrichedFahrzeuge.map(f => ({
            id: f.record_id,
            title: [f.fields.kennzeichen, f.fields.marke, f.fields.modell].filter(Boolean).join(' · '),
            subtitle: f.kundeName ? tx`Kunde: ${f.kundeName}` : tx('Kein Kunde verknüpft'),
            icon: <IconCar size={20} className="text-primary" />,
          }))}
          onSelect={handleFahrzeugSelect}
          searchPlaceholder={tx('Kennzeichen oder Modell suchen …')}
          emptyText={tx('Kein Fahrzeug gefunden.')}
          createLabel={tx('Neues Fahrzeug anlegen')}
          onCreateNew={() => setShowCreateFahrzeug(true)}
          createDialog={showCreateFahrzeug && (
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <h3 className="font-semibold text-sm">{tx('Neues Fahrzeug anlegen')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{tx('Kennzeichen')} *</Label>
                  <Input
                    value={newKennzeichen}
                    onChange={e => setNewKennzeichen(e.target.value)}
                    placeholder={tx('z.B. M-AB 1234')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tx('Marke')} *</Label>
                  <Input
                    value={newMarke}
                    onChange={e => setNewMarke(e.target.value)}
                    placeholder={tx('z.B. BMW')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tx('Modell')} *</Label>
                  <Input
                    value={newModell}
                    onChange={e => setNewModell(e.target.value)}
                    placeholder={tx('z.B. 3er')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tx('Baujahr')}</Label>
                  <Input
                    type="number"
                    value={newBaujahr}
                    onChange={e => setNewBaujahr(e.target.value)}
                    placeholder="z.B. 2018"
                    min={1900}
                    max={2100}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tx('FIN')}</Label>
                  <Input
                    value={newFin}
                    onChange={e => setNewFin(e.target.value)}
                    placeholder={tx('Fahrzeug-Ident.-Nummer')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tx('Kilometerstand')}</Label>
                  <Input
                    type="number"
                    value={newKilometerstand}
                    onChange={e => setNewKilometerstand(e.target.value)}
                    placeholder="z.B. 85000"
                    min={0}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{tx('Kunde verknüpfen (optional)')}</Label>
                <Select value={newFahrzeugKundeId} onValueChange={setNewFahrzeugKundeId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tx('Keinen Kunden wählen')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tx('Keinen Kunden verknüpfen')}</SelectItem>
                    {kunden.map(k => (
                      <SelectItem key={k.record_id} value={k.record_id}>
                        {[k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  disabled={!newKennzeichen || !newMarke || !newModell || creatingFahrzeug}
                  onClick={handleCreateFahrzeug}
                >
                  <IconPlus size={16} className="mr-1" />
                  {creatingFahrzeug ? tx('Wird angelegt …') : tx('Fahrzeug anlegen & wählen')}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateFahrzeug(false)}>
                  {tx('Abbrechen')}
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* ── Step 2: Kunde bestätigen / auswählen ────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {derivedKundeFromFahrzeug ? (
            // Derived kunde — show read-only confirmation card
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {tx('Dieses Fahrzeug ist einem Kunden zugeordnet. Bitte bestätigen oder wähle einen anderen.')}
              </p>
              <div className="rounded-2xl border bg-card p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <IconUser size={20} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">
                      {[derivedKundeFromFahrzeug.fields.vorname, derivedKundeFromFahrzeug.fields.nachname]
                        .filter(Boolean)
                        .join(' ')}
                    </p>
                    {derivedKundeFromFahrzeug.fields.email && (
                      <p className="text-sm text-muted-foreground">{derivedKundeFromFahrzeug.fields.email}</p>
                    )}
                    {derivedKundeFromFahrzeug.fields.telefon && (
                      <p className="text-sm text-muted-foreground">{derivedKundeFromFahrzeug.fields.telefon}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleConfirmKunde}>
                  <IconCheck size={16} className="mr-1" />
                  {tx('Diesen Kunden verwenden')}
                </Button>
                <Button variant="outline" onClick={() => setSelectedKunde(null)}>
                  {tx('Anderen Kunden wählen')}
                </Button>
              </div>
              {/* Option: select a different customer */}
              {selectedKunde === null && !derivedKundeFromFahrzeug && (
                <EntitySelectStep
                  items={kunden.map(k => ({
                    id: k.record_id,
                    title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' '),
                    subtitle: [k.fields.email, k.fields.telefon].filter(Boolean).join(' · '),
                    icon: <IconUser size={20} className="text-primary" />,
                  }))}
                  onSelect={handleKundeSelect}
                  searchPlaceholder={tx('Name oder E-Mail suchen …')}
                  createLabel={tx('Neuen Kunden anlegen')}
                  onCreateNew={() => setShowCreateKunde(true)}
                  createDialog={showCreateKunde && (
                    <div className="rounded-2xl border bg-card p-5 space-y-3">
                      <h3 className="font-semibold text-sm">{tx('Neuen Kunden anlegen')}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>{tx('Vorname')} *</Label>
                          <Input value={newVorname} onChange={e => setNewVorname(e.target.value)} placeholder={tx('Max')} />
                        </div>
                        <div className="space-y-1">
                          <Label>{tx('Nachname')} *</Label>
                          <Input value={newNachname} onChange={e => setNewNachname(e.target.value)} placeholder={tx('Mustermann')} />
                        </div>
                        <div className="space-y-1">
                          <Label>{tx('E-Mail')}</Label>
                          <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={tx('max@beispiel.de')} />
                        </div>
                        <div className="space-y-1">
                          <Label>{tx('Telefon')}</Label>
                          <Input type="tel" value={newTelefon} onChange={e => setNewTelefon(e.target.value)} placeholder="+49 89 123456" />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button disabled={!newVorname || !newNachname || creatingKunde} onClick={handleCreateKunde}>
                          <IconPlus size={16} className="mr-1" />
                          {creatingKunde ? tx('Wird angelegt …') : tx('Kunden anlegen & wählen')}
                        </Button>
                        <Button variant="outline" onClick={() => setShowCreateKunde(false)}>{tx('Abbrechen')}</Button>
                      </div>
                    </div>
                  )}
                />
              )}
            </div>
          ) : (
            // No linked kunde — show full selection
            <EntitySelectStep
              items={kunden.map(k => ({
                id: k.record_id,
                title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' '),
                subtitle: [k.fields.email, k.fields.telefon].filter(Boolean).join(' · '),
                icon: <IconUser size={20} className="text-primary" />,
              }))}
              onSelect={handleKundeSelect}
              searchPlaceholder={tx('Name oder E-Mail suchen …')}
              emptyText={tx('Kein Kunde gefunden.')}
              createLabel={tx('Neuen Kunden anlegen')}
              onCreateNew={() => setShowCreateKunde(true)}
              createDialog={showCreateKunde && (
                <div className="rounded-2xl border bg-card p-5 space-y-3">
                  <h3 className="font-semibold text-sm">{tx('Neuen Kunden anlegen')}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>{tx('Vorname')} *</Label>
                      <Input value={newVorname} onChange={e => setNewVorname(e.target.value)} placeholder={tx('Max')} />
                    </div>
                    <div className="space-y-1">
                      <Label>{tx('Nachname')} *</Label>
                      <Input value={newNachname} onChange={e => setNewNachname(e.target.value)} placeholder={tx('Mustermann')} />
                    </div>
                    <div className="space-y-1">
                      <Label>{tx('E-Mail')}</Label>
                      <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={tx('max@beispiel.de')} />
                    </div>
                    <div className="space-y-1">
                      <Label>{tx('Telefon')}</Label>
                      <Input type="tel" value={newTelefon} onChange={e => setNewTelefon(e.target.value)} placeholder="+49 89 123456" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button disabled={!newVorname || !newNachname || creatingKunde} onClick={handleCreateKunde}>
                      <IconPlus size={16} className="mr-1" />
                      {creatingKunde ? tx('Wird angelegt …') : tx('Kunden anlegen & wählen')}
                    </Button>
                    <Button variant="outline" onClick={() => setShowCreateKunde(false)}>{tx('Abbrechen')}</Button>
                  </div>
                </div>
              )}
            />
          )}

          {/* Back link */}
          <div className="pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              {tx('← Zurück zu Schritt 1')}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Auftrag erfassen ─────────────────────────────────────── */}
      {step === 3 && (
        selectedFahrzeug ? (
          <div className="space-y-5">
            {/* Context summary */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <IconCar size={16} className="text-muted-foreground shrink-0" />
                <span className="font-medium truncate">
                  {[selectedFahrzeug.fields.kennzeichen, selectedFahrzeug.fields.marke, selectedFahrzeug.fields.modell]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {selectedKunde && (
                <div className="flex items-center gap-2 min-w-0">
                  <IconUser size={16} className="text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">
                    {[selectedKunde.fields.vorname, selectedKunde.fields.nachname].filter(Boolean).join(' ')}
                  </span>
                </div>
              )}
            </div>

            {/* Auftrag mini-form */}
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <IconClipboardList size={20} className="text-primary" />
                <h3 className="font-semibold">{tx('Auftragsdetails')}</h3>
              </div>

              <div className="space-y-1">
                <Label>{tx('Auftragsnummer')} *</Label>
                <Input
                  value={auftragsnummer}
                  onChange={e => setAuftragsnummer(e.target.value)}
                  placeholder={suggestedAuftragsnummer}
                />
                <p className="text-xs text-muted-foreground">
                  {tx('Vorschlag basierend auf Datum und Auftragsanzahl — du kannst ihn anpassen.')}
                </p>
              </div>

              <div className="space-y-1">
                <Label>{tx('Arbeitsbeschreibung')} *</Label>
                <Textarea
                  value={arbeitsbeschreibung}
                  onChange={e => setArbeitsbeschreibung(e.target.value)}
                  placeholder={tx('Beschreibe die durchzuführenden Arbeiten …')}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="space-y-1">
                <Label>{tx('Wunschtermin')}</Label>
                <Input
                  type="datetime-local"
                  value={wunschtermin}
                  onChange={e => setWunschtermin(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>{tx('Status')} *</Label>
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
                  <Label>{tx('Priorität')}</Label>
                  <div className="flex gap-2 flex-wrap">
                    {PRIORITAET_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setPrioritaetKey(opt.key)}
                        className={[
                          'px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
                          prioritaetKey === opt.key
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card border-border text-foreground hover:bg-secondary',
                        ].join(' ')}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label>{tx('Bemerkungen')}</Label>
                <Textarea
                  value={bemerkungenAuftrag}
                  onChange={e => setBemerkungenAuftrag(e.target.value)}
                  placeholder={tx('Weitere Hinweise …')}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button
                disabled={!auftragsnummer || !arbeitsbeschreibung || submitting}
                onClick={handleSubmitAuftrag}
              >
                <IconClipboardList size={16} className="mr-1" />
                {submitting ? tx('Wird angelegt …') : tx('Auftrag anlegen')}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)}>
                {tx('← Zurück')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt benötigt ein ausgewähltes Fahrzeug aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Fertig ──────────────────────────────────────────────── */}
      {step === 4 && (
        createdAuftragsnummer ? (
          <div className="flex flex-col items-center py-12 space-y-5 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <IconCheck size={32} className="text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold">{tx('Auftrag erfolgreich angelegt!')}</h2>
              <p className="text-muted-foreground">
                {tx`Auftragsnummer: ${createdAuftragsnummer}`}
              </p>
            </div>
            <div className="flex gap-3 flex-wrap justify-center pt-2">
              <Button onClick={handleReset}>
                {tx('Weiteren Auftrag anlegen')}
              </Button>
              <a href="#/">
                <Button variant="outline">{tx('Zurück zum Dashboard')}</Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Kein abgeschlossener Auftrag gefunden.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
