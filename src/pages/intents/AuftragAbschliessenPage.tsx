/**
 * Auftrag abschließen & Rechnung erstellen — 3-Schritt-Wizard.
 * Steps: 1) Offenen Auftrag wählen → 2) Auftrag abschließen (Status → abgeschlossen) →
 *        3) Rechnung anlegen (mit Nettobetrag, MwSt, Brutto-Berechnung).
 * Reads: auftraege. Writes: auftraege (updateAuftraegeEntry), rechnungen (createRechnungenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import {
  IconClipboardCheck,
  IconFileInvoice,
  IconAlertCircle,
  IconCircleCheck,
} from '@tabler/icons-react';

import { tx } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { EnrichedAuftraege } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
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

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const STATUS_RECHNUNG_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

const MWST_RATES: Record<string, number> = {
  mwst_19: 1.19,
  mwst_7: 1.07,
  mwst_0: 1.0,
};

export default function AuftragAbschliessenPage() {
  const { auftraege, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAuftrag, setSelectedAuftrag] = useState<EnrichedAuftraege | null>(null);

  // Step 2 state
  const [bemerkungen, setBemerkungen] = useState('');
  const [savingAuftrag, setSavingAuftrag] = useState(false);
  const [auftragError, setAuftragError] = useState<string | null>(null);

  // Step 3 state
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstKey, setMwstKey] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [bruttoOverride, setBruttoOverride] = useState('');
  const [rechnungsdatum, setRechnungsdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState(
    format(addDays(new Date(), 30), 'yyyy-MM-dd')
  );
  const [statusRechnungKey, setStatusRechnungKey] = useState(
    STATUS_RECHNUNG_OPTIONS[0]?.key ?? 'offen'
  );
  const [savingRechnung, setSavingRechnung] = useState(false);
  const [rechnungError, setRechnungError] = useState<string | null>(null);
  const [createdRechnungsnummer, setCreatedRechnungsnummer] = useState<string | null>(null);

  const offeneAuftraege = useMemo(
    () =>
      (auftraege as EnrichedAuftraege[]).filter(
        (a) =>
          a.fields.status?.key === 'offen' || a.fields.status?.key === 'in_bearbeitung'
      ),
    [auftraege]
  );

  const computedBrutto = useMemo(() => {
    const netto = parseFloat(nettobetrag);
    if (isNaN(netto)) return '';
    const rate = MWST_RATES[mwstKey] ?? 1.19;
    return (netto * rate).toFixed(2);
  }, [nettobetrag, mwstKey]);

  const bruttoValue = bruttoOverride !== '' ? bruttoOverride : computedBrutto;

  const handleSelectAuftrag = (id: string) => {
    const found = offeneAuftraege.find((a) => a.record_id === id) ?? null;
    setSelectedAuftrag(found);
    setStep(2);
  };

  const handleAbschliessen = async () => {
    if (!selectedAuftrag) return;
    setSavingAuftrag(true);
    setAuftragError(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftrag.record_id, {
        status: 'abgeschlossen',
        ...(bemerkungen.trim() ? { bemerkungen_auftrag: bemerkungen.trim() } : {}),
      });
      await fetchAll();
      setStep(3);
    } catch (e) {
      setAuftragError(e instanceof Error ? e.message : tx('Fehler beim Abschließen des Auftrags'));
    } finally {
      setSavingAuftrag(false);
    }
  };

  const handleCreateRechnung = async () => {
    if (!selectedAuftrag || !rechnungsnummer.trim() || !nettobetrag) return;
    setSavingRechnung(true);
    setRechnungError(null);
    try {
      const nettoNum = parseFloat(nettobetrag);
      const bruttoNum = bruttoOverride !== '' ? parseFloat(bruttoOverride) : parseFloat(computedBrutto);
      const kundeId = selectedAuftrag.fields.kunde
        ? extractRecordId(selectedAuftrag.fields.kunde)
        : undefined;

      await LivingAppsService.createRechnungenEntry({
        rechnungsnummer: rechnungsnummer.trim(),
        nettobetrag: nettoNum,
        mwst_satz: mwstKey,
        bruttobetrag: bruttoNum,
        rechnungsdatum,
        faelligkeitsdatum,
        status_rechnung: statusRechnungKey,
        auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftrag.record_id),
        ...(kundeId
          ? { kunde: createRecordUrl(APP_IDS.KUNDEN, kundeId) }
          : {}),
      });

      setCreatedRechnungsnummer(rechnungsnummer.trim());
      setStep(4);
    } catch (e) {
      setRechnungError(e instanceof Error ? e.message : tx('Fehler beim Erstellen der Rechnung'));
    } finally {
      setSavingRechnung(false);
    }
  };

  const handleReset = () => {
    setSelectedAuftrag(null);
    setBemerkungen('');
    setAuftragError(null);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstKey(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setBruttoOverride('');
    setRechnungsdatum(format(new Date(), 'yyyy-MM-dd'));
    setFaelligkeitsdatum(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
    setStatusRechnungKey(STATUS_RECHNUNG_OPTIONS[0]?.key ?? 'offen');
    setSavingRechnung(false);
    setRechnungError(null);
    setCreatedRechnungsnummer(null);
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Auftrag abschließen')}
      subtitle={tx('Auftrag als abgeschlossen markieren und Rechnung erstellen')}
      steps={[
        { label: tx('Auftrag wählen') },
        { label: tx('Abschließen') },
        { label: tx('Rechnung') },
        { label: tx('Fertig') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Auftrag wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAuftraege.map((a) => ({
            id: a.record_id,
            title: a.fields.auftragsnummer ?? a.record_id,
            subtitle: [a.fahrzeugName, a.kundeName].filter(Boolean).join(' · '),
            status: a.fields.status
              ? { key: a.fields.status.key, label: a.fields.status.label }
              : undefined,
            stats: a.fields.arbeitsbeschreibung
              ? [{ label: tx('Beschreibung'), value: a.fields.arbeitsbeschreibung.slice(0, 60) }]
              : [],
            icon: <IconClipboardCheck size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectAuftrag}
          searchPlaceholder={tx('Auftrag suchen …')}
          emptyText={tx('Keine offenen Aufträge gefunden')}
          emptyIcon={<IconClipboardCheck size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Auftrag abschließen */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6 max-w-lg">
            {/* Read-only Zusammenfassung */}
            <div className="rounded-2xl border bg-card p-5 space-y-3">
              <h3 className="font-semibold text-foreground">
                {tx('Auftrag')}: {selectedAuftrag.fields.auftragsnummer ?? selectedAuftrag.record_id}
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{tx('Fahrzeug')}</dt>
                <dd className="truncate min-w-0">{selectedAuftrag.fahrzeugName || '–'}</dd>
                <dt className="text-muted-foreground">{tx('Kunde')}</dt>
                <dd className="truncate min-w-0">{selectedAuftrag.kundeName || '–'}</dd>
                {selectedAuftrag.fields.arbeitsbeschreibung && (
                  <>
                    <dt className="text-muted-foreground">{tx('Arbeit')}</dt>
                    <dd className="min-w-0 line-clamp-2">{selectedAuftrag.fields.arbeitsbeschreibung}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">{tx('Status')}</dt>
                <dd>
                  <StatusBadge
                    statusKey={selectedAuftrag.fields.status?.key}
                    label={selectedAuftrag.fields.status?.label}
                  />
                </dd>
              </dl>
            </div>

            {/* Abschluss-Formular */}
            <div className="space-y-3">
              <Label htmlFor="bemerkungen">{tx('Abschlussbemerkung')} <span className="text-muted-foreground text-xs">({tx('optional')})</span></Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungen}
                onChange={(e) => setBemerkungen(e.target.value)}
                placeholder={tx('Abschließende Notizen zum Auftrag …')}
                rows={3}
                className="w-full"
              />
            </div>

            {auftragError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <IconAlertCircle size={16} />
                <span>{auftragError}</span>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleAbschliessen}
                disabled={savingAuftrag}
                className="flex-1"
              >
                {savingAuftrag ? tx('Wird abgeschlossen …') : tx('Auftrag abschließen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Step 3: Rechnung erstellen */}
      {step === 3 && (
        selectedAuftrag ? (
          <div className="space-y-5 max-w-lg">
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-center gap-3">
              <IconFileInvoice size={20} className="text-primary shrink-0" />
              <p className="text-sm">
                {tx('Rechnung für Auftrag')}{' '}
                <strong>{selectedAuftrag.fields.auftragsnummer ?? selectedAuftrag.record_id}</strong>
                {selectedAuftrag.kundeName ? ` · ${selectedAuftrag.kundeName}` : ''}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="rechnungsnummer">{tx('Rechnungsnummer')} *</Label>
                <Input
                  id="rechnungsnummer"
                  value={rechnungsnummer}
                  onChange={(e) => setRechnungsnummer(e.target.value)}
                  placeholder={tx('RE-2026-001')}
                  className="w-full"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="nettobetrag">{tx('Nettobetrag (€)')} *</Label>
                <Input
                  id="nettobetrag"
                  type="number"
                  min="0"
                  step="0.01"
                  value={nettobetrag}
                  onChange={(e) => { setNettobetrag(e.target.value); setBruttoOverride(''); }}
                  placeholder="0.00"
                  className="w-full"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="mwst_satz">{tx('MwSt.-Satz')} *</Label>
                <Select
                  value={mwstKey}
                  onValueChange={(v) => { setMwstKey(v); setBruttoOverride(''); }}
                >
                  <SelectTrigger id="mwst_satz" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MWST_OPTIONS.map((o) => (
                      <SelectItem key={o.key} value={o.key}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="bruttobetrag">
                  {tx('Bruttobetrag (€)')} *{' '}
                  {bruttoOverride === '' && computedBrutto !== '' && (
                    <span className="text-muted-foreground text-xs">({tx('berechnet')})</span>
                  )}
                </Label>
                <Input
                  id="bruttobetrag"
                  type="number"
                  min="0"
                  step="0.01"
                  value={bruttoValue}
                  onChange={(e) => setBruttoOverride(e.target.value)}
                  placeholder="0.00"
                  className="w-full"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rechnungsdatum">{tx('Rechnungsdatum')} *</Label>
                <Input
                  id="rechnungsdatum"
                  type="date"
                  value={rechnungsdatum}
                  onChange={(e) => setRechnungsdatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="faelligkeitsdatum">{tx('Fälligkeitsdatum')} *</Label>
                <Input
                  id="faelligkeitsdatum"
                  type="date"
                  value={faelligkeitsdatum}
                  onChange={(e) => setFaelligkeitsdatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="status_rechnung">{tx('Rechnungsstatus')} *</Label>
                <Select value={statusRechnungKey} onValueChange={setStatusRechnungKey}>
                  <SelectTrigger id="status_rechnung" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_RECHNUNG_OPTIONS.map((o) => (
                      <SelectItem key={o.key} value={o.key}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {rechnungError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <IconAlertCircle size={16} />
                <span>{rechnungError}</span>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleCreateRechnung}
                disabled={
                  savingRechnung ||
                  !rechnungsnummer.trim() ||
                  !nettobetrag ||
                  !bruttoValue ||
                  !rechnungsdatum ||
                  !faelligkeitsdatum
                }
                className="flex-1"
              >
                {savingRechnung ? tx('Rechnung wird erstellt …') : tx('Rechnung erstellen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Step 4: Bestätigung */}
      {step === 4 && (
        <div className="text-center py-10 space-y-6 max-w-md mx-auto">
          <div className="flex justify-center">
            <IconCircleCheck size={56} className="text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">{tx('Auftrag abgeschlossen!')}</h3>
            {createdRechnungsnummer && (
              <p className="text-muted-foreground text-sm">
                {tx('Rechnung')} <strong>{createdRechnungsnummer}</strong> {tx('wurde erfolgreich erstellt.')}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" onClick={handleReset}>
              {tx('Weiteren Auftrag abschließen')}
            </Button>
            <Button asChild>
              <a href="#/">{tx('Zurück zum Dashboard')}</a>
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
