/**
 * Auftrag abschließen & Rechnung anlegen — 4-Schritt-Wizard.
 * Steps: 1) Auftrag wählen (nur offen|in_bearbeitung) → 2) Auftrag abschließen →
 *        3) Rechnung anlegen → 4) Zusammenfassung.
 * Reads: auftraege, kunden, fahrzeuge. Writes: auftraege (updateAuftraegeEntry),
 *        rechnungen (createRechnungenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import { IconFileInvoice, IconClipboardCheck, IconCircleCheck, IconCar } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { tx } from '@/i18n';

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const STATUS_RECHNUNG_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

function mwstFaktor(key: string): number {
  if (key === 'mwst_19') return 0.19;
  if (key === 'mwst_7') return 0.07;
  return 0;
}

export default function AuftragAbschliessenPage() {
  const { auftraege, fahrzeuge, kunden, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAuftragId, setSelectedAuftragId] = useState<string | null>(null);
  const [abschlussLoading, setAbschlussLoading] = useState(false);
  const [abschlussError, setAbschlussError] = useState<string | null>(null);

  // Rechnung form state
  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstKey, setMwstKey] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [bruttoOverride, setBruttoOverride] = useState('');
  const [rechnungsdatum, setRechnungsdatum] = useState(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState(
    format(addDays(new Date(), 14), 'yyyy-MM-dd')
  );
  const [rechnungLoading, setRechnungLoading] = useState(false);
  const [rechnungError, setRechnungError] = useState<string | null>(null);

  // Created record IDs for idempotency and summary
  const [createdRechnungId, setCreatedRechnungId] = useState<string | null>(null);
  const [createdRechnungsnummer, setCreatedRechnungsnummer] = useState('');
  const [createdBrutto, setCreatedBrutto] = useState(0);

  // Fahrzeuge map for fast lookup
  const fahrzeugeMap = useMemo(() => {
    const m = new Map<string, typeof fahrzeuge[number]>();
    fahrzeuge.forEach(f => m.set(f.record_id, f));
    return m;
  }, [fahrzeuge]);

  const kundenMap = useMemo(() => {
    const m = new Map<string, typeof kunden[number]>();
    kunden.forEach(k => m.set(k.record_id, k));
    return m;
  }, [kunden]);

  // Eligible auftraege: only offen or in_bearbeitung
  const eligibleAuftraege = useMemo(
    () => auftraege.filter(a => {
      const k = a.fields.status?.key;
      return k === 'offen' || k === 'in_bearbeitung';
    }),
    [auftraege]
  );

  const selectedAuftrag = useMemo(
    () => eligibleAuftraege.find(a => a.record_id === selectedAuftragId) ?? null,
    [eligibleAuftraege, selectedAuftragId]
  );

  // Computed brutto preview (used when user hasn't overridden)
  const nettoNum = parseFloat(nettobetrag) || 0;
  const computedBrutto = nettoNum * (1 + mwstFaktor(mwstKey));
  const bruttoDisplay = bruttoOverride !== '' ? parseFloat(bruttoOverride) || 0 : computedBrutto;

  // Step 2: close the order
  async function handleAbschliessen() {
    if (!selectedAuftrag) return;
    setAbschlussLoading(true);
    setAbschlussError(null);
    try {
      await LivingAppsService.updateAuftraegeEntry(selectedAuftrag.record_id, {
        status: 'abgeschlossen',
      });
      await fetchAll();
      setStep(3);
    } catch (e) {
      setAbschlussError(e instanceof Error ? e.message : tx('Fehler beim Abschließen des Auftrags'));
    } finally {
      setAbschlussLoading(false);
    }
  }

  // Step 3: create the invoice (idempotent on retry)
  async function handleRechnungAnlegen() {
    if (!selectedAuftrag) return;
    setRechnungLoading(true);
    setRechnungError(null);
    try {
      const kundeUrl = selectedAuftrag.fields.kunde
        ? selectedAuftrag.fields.kunde
        : undefined;
      const kundeId = kundeUrl ? extractRecordId(kundeUrl) : null;

      let rid = createdRechnungId;
      if (!rid) {
        const bruttoFinal = bruttoOverride !== ''
          ? parseFloat(bruttoOverride) || 0
          : computedBrutto;

        const rechnung = await LivingAppsService.createRechnungenEntry({
          rechnungsnummer,
          auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftrag.record_id),
          ...(kundeId ? { kunde: createRecordUrl(APP_IDS.KUNDEN, kundeId) } : {}),
          nettobetrag: parseFloat(nettobetrag) || 0,
          mwst_satz: mwstKey,
          bruttobetrag: bruttoFinal,
          rechnungsdatum,
          faelligkeitsdatum,
          status_rechnung: STATUS_RECHNUNG_OPTIONS.find(o => o.key === 'offen')?.key ?? 'offen',
        });
        rid = rechnung.record_id;
        setCreatedRechnungId(rid);
        setCreatedRechnungsnummer(rechnungsnummer);
        setCreatedBrutto(bruttoFinal);
      }
      await fetchAll();
      setStep(4);
    } catch (e) {
      setRechnungError(e instanceof Error ? e.message : tx('Fehler beim Anlegen der Rechnung'));
    } finally {
      setRechnungLoading(false);
    }
  }

  function handleReset() {
    setSelectedAuftragId(null);
    setAbschlussError(null);
    setRechnungsnummer('');
    setNettobetrag('');
    setMwstKey(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setBruttoOverride('');
    setRechnungsdatum(format(new Date(), 'yyyy-MM-dd'));
    setFaelligkeitsdatum(format(addDays(new Date(), 14), 'yyyy-MM-dd'));
    setRechnungLoading(false);
    setRechnungError(null);
    setCreatedRechnungId(null);
    setCreatedRechnungsnummer('');
    setCreatedBrutto(0);
    setStep(1);
  }

  const fahrzeugName = (auftrag: typeof auftraege[number]) => {
    const fid = auftrag.fields.fahrzeug ? extractRecordId(auftrag.fields.fahrzeug) : null;
    if (!fid) return '';
    const f = fahrzeugeMap.get(fid);
    return f ? `${f.fields.marke ?? ''} ${f.fields.modell ?? ''} (${f.fields.kennzeichen ?? ''})`.trim() : '';
  };

  const kundeName = (auftrag: typeof auftraege[number]) => {
    const kid = auftrag.fields.kunde ? extractRecordId(auftrag.fields.kunde) : null;
    if (!kid) return '';
    const k = kundenMap.get(kid);
    return k ? `${k.fields.vorname ?? ''} ${k.fields.nachname ?? ''}`.trim() : '';
  };

  return (
    <IntentWizardShell
      title={tx('Auftrag abschließen')}
      subtitle={tx('Auftrag schließen und direkt eine Rechnung anlegen')}
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
      {/* ── Step 1: Auftrag wählen ── */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {tx('Nur offene oder in Bearbeitung befindliche Aufträge werden angezeigt.')}
          </p>
          <EntitySelectStep
            items={eligibleAuftraege.map(a => ({
              id: a.record_id,
              title: a.fields.auftragsnummer ?? a.record_id,
              subtitle: [fahrzeugName(a), kundeName(a)].filter(Boolean).join(' · '),
              status: a.fields.status
                ? { key: a.fields.status.key, label: a.fields.status.label }
                : undefined,
              stats: a.fields.arbeitsbeschreibung
                ? [{ label: tx('Beschreibung'), value: a.fields.arbeitsbeschreibung.slice(0, 60) + (a.fields.arbeitsbeschreibung.length > 60 ? '…' : '') }]
                : [],
              icon: <IconCar size={20} className="text-primary" />,
            }))}
            onSelect={(id) => {
              setSelectedAuftragId(id);
              setStep(2);
            }}
            searchPlaceholder={tx('Auftragsnummer oder Beschreibung suchen …')}
            emptyText={tx('Keine offenen Aufträge gefunden')}
            emptyIcon={<IconClipboardCheck size={32} />}
          />
        </div>
      )}

      {/* ── Step 2: Auftrag abschließen ── */}
      {step === 2 && (
        selectedAuftrag ? (
          <div className="space-y-5">
            {/* Auftrag details read-only card */}
            <div className="rounded-2xl border bg-card p-5 space-y-3 overflow-hidden">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">{tx('Auftragsnummer')}</p>
                  <p className="font-semibold text-foreground">{selectedAuftrag.fields.auftragsnummer ?? '—'}</p>
                </div>
                {selectedAuftrag.fields.status && (
                  <StatusBadge
                    statusKey={selectedAuftrag.fields.status.key}
                    label={selectedAuftrag.fields.status.label}
                  />
                )}
              </div>
              {selectedAuftrag.fields.arbeitsbeschreibung && (
                <div>
                  <p className="text-xs text-muted-foreground">{tx('Arbeitsbeschreibung')}</p>
                  <p className="text-sm text-foreground">{selectedAuftrag.fields.arbeitsbeschreibung}</p>
                </div>
              )}
              {fahrzeugName(selectedAuftrag) && (
                <div>
                  <p className="text-xs text-muted-foreground">{tx('Fahrzeug')}</p>
                  <p className="text-sm text-foreground">{fahrzeugName(selectedAuftrag)}</p>
                </div>
              )}
              {kundeName(selectedAuftrag) && (
                <div>
                  <p className="text-xs text-muted-foreground">{tx('Kunde')}</p>
                  <p className="text-sm text-foreground">{kundeName(selectedAuftrag)}</p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 text-sm text-amber-800 dark:text-amber-300">
              {tx('Bist du sicher, dass du diesen Auftrag als abgeschlossen markieren möchtest? Diese Aktion kann nicht rückgängig gemacht werden.')}
            </div>

            {abschlussError && (
              <p className="text-sm text-destructive">{abschlussError}</p>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleAbschliessen}
                disabled={abschlussLoading}
                className="gap-2"
              >
                <IconClipboardCheck size={16} />
                {abschlussLoading ? tx('Wird abgeschlossen …') : tx('Auftrag abschließen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht einen ausgewählten Auftrag aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Rechnung anlegen ── */}
      {step === 3 && (
        selectedAuftrag ? (
          <div className="space-y-5">
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-center gap-3 overflow-hidden">
              <IconClipboardCheck size={18} className="text-primary shrink-0" />
              <p className="text-sm text-foreground">
                {tx('Auftrag')}{' '}
                <span className="font-semibold">{selectedAuftrag.fields.auftragsnummer}</span>{' '}
                {tx('wurde erfolgreich abgeschlossen.')}
              </p>
            </div>

            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
              <h2 className="font-semibold text-foreground">{tx('Rechnung erstellen')}</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rechnungsnummer">{tx('Rechnungsnummer')} *</Label>
                  <Input
                    id="rechnungsnummer"
                    value={rechnungsnummer}
                    onChange={e => setRechnungsnummer(e.target.value)}
                    placeholder={tx('RE-2026-001')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nettobetrag">{tx('Nettobetrag (€)')} *</Label>
                  <Input
                    id="nettobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={nettobetrag}
                    onChange={e => {
                      setNettobetrag(e.target.value);
                      setBruttoOverride(''); // reset override when net changes
                    }}
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="mwst_satz">{tx('MwSt.-Satz')} *</Label>
                  <Select
                    value={mwstKey}
                    onValueChange={val => {
                      setMwstKey(val);
                      setBruttoOverride('');
                    }}
                  >
                    <SelectTrigger id="mwst_satz">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MWST_OPTIONS.map(o => (
                        <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bruttobetrag">
                    {tx('Bruttobetrag (€)')} *
                    {bruttoOverride === '' && nettoNum > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {tx('berechnet')}: {computedBrutto.toFixed(2)} €
                      </span>
                    )}
                  </Label>
                  <Input
                    id="bruttobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={bruttoOverride !== '' ? bruttoOverride : (nettoNum > 0 ? computedBrutto.toFixed(2) : '')}
                    onChange={e => setBruttoOverride(e.target.value)}
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rechnungsdatum">{tx('Rechnungsdatum')} *</Label>
                  <Input
                    id="rechnungsdatum"
                    type="date"
                    value={rechnungsdatum}
                    onChange={e => setRechnungsdatum(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="faelligkeitsdatum">{tx('Fälligkeitsdatum')} *</Label>
                  <Input
                    id="faelligkeitsdatum"
                    type="date"
                    value={faelligkeitsdatum}
                    onChange={e => setFaelligkeitsdatum(e.target.value)}
                  />
                </div>
              </div>

              {/* Live Brutto Preview */}
              {nettoNum > 0 && (
                <div className="rounded-xl bg-secondary/60 p-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{tx('Vorschau Brutto')}</span>
                  <span className="font-semibold text-foreground text-base">{bruttoDisplay.toFixed(2)} €</span>
                </div>
              )}
            </div>

            {rechnungError && (
              <p className="text-sm text-destructive">{rechnungError}</p>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={() => setStep(2)}>
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleRechnungAnlegen}
                disabled={rechnungLoading || !rechnungsnummer || !nettobetrag}
                className="gap-2"
              >
                <IconFileInvoice size={16} />
                {rechnungLoading ? tx('Rechnung wird angelegt …') : tx('Rechnung anlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Zusammenfassung ── */}
      {step === 4 && (
        selectedAuftrag ? (
          <div className="space-y-5">
            <div className="rounded-2xl border bg-card p-6 space-y-4 overflow-hidden text-center">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <IconCircleCheck size={30} className="text-primary" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">{tx('Abgeschlossen!')}</h2>
                <p className="text-sm text-muted-foreground mt-1">{tx('Der Auftrag wurde abgeschlossen und die Rechnung wurde angelegt.')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left mt-2">
                <div className="rounded-xl border bg-secondary/40 p-4 space-y-1">
                  <p className="text-xs text-muted-foreground">{tx('Auftrag')}</p>
                  <p className="font-semibold text-foreground">{selectedAuftrag.fields.auftragsnummer ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{tx('Status')}: {tx('Abgeschlossen')}</p>
                </div>
                <div className="rounded-xl border bg-secondary/40 p-4 space-y-1">
                  <p className="text-xs text-muted-foreground">{tx('Rechnung')}</p>
                  <p className="font-semibold text-foreground">{createdRechnungsnummer || '—'}</p>
                  <p className="text-xs text-muted-foreground">{tx('Betrag')}: {createdBrutto.toFixed(2)} €</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 flex-wrap justify-center">
              <Button variant="outline" onClick={handleReset}>
                {tx('Weiteren Auftrag abschließen')}
              </Button>
              <Button asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Kein abgeschlossener Auftrag gefunden.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
