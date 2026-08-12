/**
 * Auftrag abschließen & Rechnung erstellen — 3-Schritt-Wizard.
 * Steps: 1) Auftrag wählen (nur offen/in_bearbeitung) → 2) Auftrag abschließen (Status auf abgeschlossen) → 3) Rechnung erstellen.
 * Reads: auftraege, kunden, fahrzeuge. Writes: auftraege (updateAuftraegeEntry), rechnungen (createRechnungenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { IconCheck, IconFileInvoice, IconAlertCircle } from '@tabler/icons-react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { EnrichedAuftraege } from '@/types/enriched';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { tx } from '@/i18n';

const MWST_FACTORS: Record<string, number> = {
  mwst_19: 1.19,
  mwst_7: 1.07,
  mwst_0: 1.0,
};

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const STATUS_RECHNUNG_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

export default function AuftragAbschliessenPage() {
  const [searchParams] = useSearchParams();
  const deepLinkedAuftragId = searchParams.get('auftragId');

  const { auftraege, kunden, fahrzeuge, loading, error, fetchAll, kundenMap, fahrzeugeMap } = useDashboardData();

  // Step state — deep-link: if auftragId is provided, start at step 2
  const [step, setStep] = useState(() => deepLinkedAuftragId ? 2 : 1);
  const [selectedAuftragId, setSelectedAuftragId] = useState<string | null>(deepLinkedAuftragId);

  // Step 2: closing state
  const [isClosing, setIsClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [auftragClosed, setAuftragClosed] = useState(false);

  // Step 3: Rechnung form state
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettoStr, setNettoStr] = useState('');
  const [mwstKey, setMwstKey] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [bruttoStr, setBruttoStr] = useState('');
  const [bruttoManual, setBruttoManual] = useState(false);
  const [rechnungsdatum, setRechnungsdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [rechnungId, setRechnungId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Derive enriched auftrag for display
  const offeneAuftraege = auftraege.filter(a =>
    a.fields.status?.key === 'offen' || a.fields.status?.key === 'in_bearbeitung'
  );

  const enrichedForSelect = offeneAuftraege.map((a): EnrichedAuftraege => {
    const kundeId = a.fields.kunde ? extractRecordId(a.fields.kunde) : null;
    const fahrzeugId = a.fields.fahrzeug ? extractRecordId(a.fields.fahrzeug) : null;
    const kunde = kundeId ? kundenMap.get(kundeId) : undefined;
    const fahrzeug = fahrzeugId ? fahrzeugeMap.get(fahrzeugId) : undefined;
    const kundeName = kunde ? `${kunde.fields.vorname ?? ''} ${kunde.fields.nachname ?? ''}`.trim() : '';
    const fahrzeugName = fahrzeug
      ? [fahrzeug.fields.kennzeichen, fahrzeug.fields.marke, fahrzeug.fields.modell].filter(Boolean).join(' ')
      : '';
    return { ...a, kundeName, fahrzeugName };
  });

  const selectedAuftrag = selectedAuftragId
    ? enrichedForSelect.find(a => a.record_id === selectedAuftragId) ??
      (() => {
        // May be already closed — still look it up from all auftraege for display
        const raw = auftraege.find(a => a.record_id === selectedAuftragId);
        if (!raw) return null;
        const kundeId = raw.fields.kunde ? extractRecordId(raw.fields.kunde) : null;
        const fahrzeugId = raw.fields.fahrzeug ? extractRecordId(raw.fields.fahrzeug) : null;
        const kunde = kundeId ? kundenMap.get(kundeId) : undefined;
        const fahrzeug = fahrzeugId ? fahrzeugeMap.get(fahrzeugId) : undefined;
        return {
          ...raw,
          kundeName: kunde ? `${kunde.fields.vorname ?? ''} ${kunde.fields.nachname ?? ''}`.trim() : '',
          fahrzeugName: fahrzeug
            ? [fahrzeug.fields.kennzeichen, fahrzeug.fields.marke, fahrzeug.fields.modell].filter(Boolean).join(' ')
            : '',
        } as EnrichedAuftraege;
      })()
    : null;

  // Live brutto calculation
  const computedBrutto = useCallback((netto: string, mwst: string): string => {
    const n = parseFloat(netto);
    if (isNaN(n)) return '';
    const factor = MWST_FACTORS[mwst] ?? 1.19;
    return (n * factor).toFixed(2);
  }, []);

  const handleNettoChange = (val: string) => {
    setNettoStr(val);
    if (!bruttoManual) {
      setBruttoStr(computedBrutto(val, mwstKey));
    }
  };

  const handleMwstChange = (key: string) => {
    setMwstKey(key);
    if (!bruttoManual) {
      setBruttoStr(computedBrutto(nettoStr, key));
    }
  };

  const handleBruttoChange = (val: string) => {
    setBruttoStr(val);
    setBruttoManual(true);
  };

  const handleSelectAuftrag = (id: string) => {
    setSelectedAuftragId(id);
    setAuftragClosed(false);
    setCloseError(null);
    setStep(2);
  };

  const handleCloseAuftrag = async () => {
    if (!selectedAuftragId) return;
    setIsClosing(true);
    setCloseError(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftragId, { status: 'abgeschlossen' });
      await fetchAll();
      setAuftragClosed(true);
      setStep(3);
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : tx('Unbekannter Fehler'));
    } finally {
      setIsClosing(false);
    }
  };

  const handleCreateRechnung = async () => {
    if (!selectedAuftragId || rechnungId) return;
    if (!rechnungsnummer || !nettoStr || !rechnungsdatum || !faelligkeitsdatum) return;

    const netto = parseFloat(nettoStr);
    const brutto = parseFloat(bruttoStr || computedBrutto(nettoStr, mwstKey));
    if (isNaN(netto) || isNaN(brutto)) return;

    // Resolve kundeId from the auftrag
    const rawAuftrag = auftraege.find(a => a.record_id === selectedAuftragId);
    const kundeId = rawAuftrag?.fields.kunde ? extractRecordId(rawAuftrag.fields.kunde) : null;

    setIsCreating(true);
    setCreateError(null);
    try {
      let rid = rechnungId;
      if (!rid) {
        const result = await LivingAppsService.createRechnungenEntry({
          rechnungsnummer,
          nettobetrag: netto,
          mwst_satz: mwstKey,
          bruttobetrag: brutto,
          rechnungsdatum,
          faelligkeitsdatum,
          status_rechnung: STATUS_RECHNUNG_OPTIONS[0]?.key ?? 'offen',
          auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftragId),
          ...(kundeId ? { kunde: createRecordUrl(APP_IDS.KUNDEN, kundeId) } : {}),
        });
        rid = result.record_id;
        setRechnungId(rid);
      }
      await fetchAll();
      setDone(true);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : tx('Unbekannter Fehler'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedAuftragId(null);
    setAuftragClosed(false);
    setCloseError(null);
    setRechnungsnummer('');
    setNettoStr('');
    setMwstKey(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setBruttoStr('');
    setBruttoManual(false);
    setRechnungsdatum(format(new Date(), 'yyyy-MM-dd'));
    setFaelligkeitsdatum('');
    setIsCreating(false);
    setCreateError(null);
    setRechnungId(null);
    setDone(false);
  };

  const canCreateRechnung =
    !!rechnungsnummer &&
    !!nettoStr &&
    !isNaN(parseFloat(nettoStr)) &&
    !!rechnungsdatum &&
    !!faelligkeitsdatum &&
    !isCreating;

  return (
    <IntentWizardShell
      title={tx('Auftrag abschließen')}
      subtitle={tx('Auftrag abschließen und Rechnung erstellen')}
      steps={[
        { label: tx('Auftrag wählen') },
        { label: tx('Abschließen') },
        { label: tx('Rechnung') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ─── Schritt 1: Auftrag wählen ─── */}
      {step === 1 && (
        <EntitySelectStep
          items={enrichedForSelect.map(a => ({
            id: a.record_id,
            title: a.fields.auftragsnummer ?? tx('Ohne Nummer'),
            subtitle: [a.kundeName, a.fahrzeugName, a.fields.arbeitsbeschreibung].filter(Boolean).join(' · '),
            status: a.fields.status
              ? { key: a.fields.status.key, label: a.fields.status.label }
              : undefined,
            stats: a.fields.prioritaet
              ? [{ label: tx('Priorität'), value: a.fields.prioritaet.label }]
              : undefined,
          }))}
          onSelect={handleSelectAuftrag}
          searchPlaceholder={tx('Auftrag suchen …')}
          emptyText={tx('Keine offenen oder in Bearbeitung befindlichen Aufträge')}
          emptyIcon={<IconCheck size={32} className="text-muted-foreground" />}
        />
      )}

      {/* ─── Schritt 2: Auftrag abschließen ─── */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-6">
            {/* Zusammenfassung */}
            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-lg font-semibold truncate min-w-0">
                  {selectedAuftrag.fields.auftragsnummer ?? tx('Ohne Nummer')}
                </h2>
                {selectedAuftrag.fields.status && (
                  <StatusBadge
                    statusKey={selectedAuftrag.fields.status.key}
                    label={selectedAuftrag.fields.status.label}
                  />
                )}
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {selectedAuftrag.kundeName && (
                  <>
                    <dt className="text-muted-foreground">{tx('Kunde')}</dt>
                    <dd className="font-medium truncate min-w-0">{selectedAuftrag.kundeName}</dd>
                  </>
                )}
                {selectedAuftrag.fahrzeugName && (
                  <>
                    <dt className="text-muted-foreground">{tx('Fahrzeug')}</dt>
                    <dd className="font-medium truncate min-w-0">{selectedAuftrag.fahrzeugName}</dd>
                  </>
                )}
                {selectedAuftrag.fields.arbeitsbeschreibung && (
                  <>
                    <dt className="text-muted-foreground">{tx('Arbeitsbeschreibung')}</dt>
                    <dd className="font-medium line-clamp-2 min-w-0">{selectedAuftrag.fields.arbeitsbeschreibung}</dd>
                  </>
                )}
                {selectedAuftrag.fields.wunschtermin && (
                  <>
                    <dt className="text-muted-foreground">{tx('Wunschtermin')}</dt>
                    <dd className="font-medium">{selectedAuftrag.fields.wunschtermin}</dd>
                  </>
                )}
                {selectedAuftrag.fields.prioritaet && (
                  <>
                    <dt className="text-muted-foreground">{tx('Priorität')}</dt>
                    <dd className="font-medium">{selectedAuftrag.fields.prioritaet.label}</dd>
                  </>
                )}
              </dl>
            </div>

            {closeError && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <IconAlertCircle size={16} stroke={2} className="shrink-0" />
                <span>{closeError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setStep(1)}
              >
                {tx('Anderen Auftrag wählen')}
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={isClosing || auftragClosed}
                onClick={handleCloseAuftrag}
              >
                <IconCheck size={16} stroke={2} className="mr-2" />
                {isClosing ? tx('Wird abgeschlossen …') : tx('Auftrag als abgeschlossen markieren')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst einen Auftrag in Schritt 1 wählen.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* ─── Schritt 3: Rechnung erstellen ─── */}
      {step === 3 && (
        selectedAuftragId ? (
          done ? (
            /* Erfolgs-State */
            <div className="space-y-6">
              <div className="rounded-2xl border bg-card p-6 text-center space-y-3">
                <div className="flex justify-center">
                  <div className="rounded-full bg-primary/10 p-4">
                    <IconFileInvoice size={32} className="text-primary" stroke={2} />
                  </div>
                </div>
                <h2 className="text-xl font-semibold">{tx('Rechnung erfolgreich erstellt')}</h2>
                <p className="text-sm text-muted-foreground">
                  {tx('Auftrag wurde abgeschlossen und Rechnung angelegt.')}
                </p>
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
          ) : (
            /* Rechnungs-Formular */
            <div className="space-y-6">
              <div className="rounded-2xl border bg-card p-5 space-y-5 overflow-hidden">
                <h2 className="text-base font-semibold">{tx('Rechnungsdaten eingeben')}</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Rechnungsnummer */}
                  <div className="space-y-1.5">
                    <Label htmlFor="rechnungsnummer">{tx('Rechnungsnummer')} *</Label>
                    <Input
                      id="rechnungsnummer"
                      value={rechnungsnummer}
                      onChange={e => setRechnungsnummer(e.target.value)}
                      placeholder={tx('RE-2026-001')}
                    />
                  </div>

                  {/* Rechnungsdatum */}
                  <div className="space-y-1.5">
                    <Label htmlFor="rechnungsdatum">{tx('Rechnungsdatum')} *</Label>
                    <Input
                      id="rechnungsdatum"
                      type="date"
                      value={rechnungsdatum}
                      onChange={e => setRechnungsdatum(e.target.value)}
                    />
                  </div>

                  {/* Fälligkeitsdatum */}
                  <div className="space-y-1.5">
                    <Label htmlFor="faelligkeitsdatum">{tx('Fälligkeitsdatum')} *</Label>
                    <Input
                      id="faelligkeitsdatum"
                      type="date"
                      value={faelligkeitsdatum}
                      onChange={e => setFaelligkeitsdatum(e.target.value)}
                    />
                  </div>

                  {/* Nettobetrag */}
                  <div className="space-y-1.5">
                    <Label htmlFor="nettobetrag">{tx('Nettobetrag (€)')} *</Label>
                    <Input
                      id="nettobetrag"
                      type="number"
                      min="0"
                      step="0.01"
                      value={nettoStr}
                      onChange={e => handleNettoChange(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {/* MwSt-Satz als Kacheln */}
                <div className="space-y-1.5">
                  <Label>{tx('MwSt-Satz')} *</Label>
                  <div className="flex flex-wrap gap-2">
                    {MWST_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => handleMwstChange(opt.key)}
                        className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                          mwstKey === opt.key
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-foreground hover:bg-secondary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bruttobetrag mit Live-Berechnung */}
                <div className="space-y-1.5">
                  <Label htmlFor="bruttobetrag">
                    {tx('Bruttobetrag (€)')} *
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      {tx('(automatisch berechnet, überschreibbar)')}
                    </span>
                  </Label>
                  <Input
                    id="bruttobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={bruttoStr}
                    onChange={e => handleBruttoChange(e.target.value)}
                    placeholder={nettoStr ? computedBrutto(nettoStr, mwstKey) : '0,00'}
                  />
                  {nettoStr && !bruttoManual && (
                    <p className="text-xs text-muted-foreground">
                      {tx('Berechnet:')} {computedBrutto(nettoStr, mwstKey)} €
                    </p>
                  )}
                </div>
              </div>

              {createError && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <IconAlertCircle size={16} stroke={2} className="shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setStep(2)}
                >
                  {tx('Zurück')}
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  disabled={!canCreateRechnung}
                  onClick={handleCreateRechnung}
                >
                  <IconFileInvoice size={16} stroke={2} className="mr-2" />
                  {isCreating ? tx('Rechnung wird erstellt …') : tx('Rechnung erstellen')}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst einen Auftrag in Schritt 1 wählen.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
