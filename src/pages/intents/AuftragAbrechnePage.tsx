/**
 * Auftrag abrechnen — 3-Schritt-Wizard.
 * Steps: 1) Auftrag wählen (nur abgeschlossene ohne Rechnung) →
 *        2) Rechnung erstellen (Beträge, MwSt, Datum) →
 *        3) Rechnungs-PDF-Eintrag anlegen (Vorausfüllung + PDF-Upload).
 * Reads: auftraege, rechnungen, kunden, fahrzeuge.
 * Writes: rechnungen (createRechnungenEntry), rechnungs_pdf_erstellen (createRechnungsPdfErstellenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, addDays, parseISO } from 'date-fns';
import { IconFileInvoice, IconCheck, IconCurrencyEuro, IconUpload } from '@tabler/icons-react';

import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const tt = makeT({
  de: {
    pageTitle: 'Auftrag abrechnen',
    subtitle: 'Rechnung erstellen und PDF-Eintrag anlegen',
    step1: 'Auftrag wählen',
    step2: 'Rechnung erstellen',
    step3: 'PDF-Eintrag anlegen',
    step4: 'Fertig',
    noEligible: 'Keine abgeschlossenen Aufträge ohne Rechnung vorhanden.',
    noEligibleSub: 'Alle abgeschlossenen Aufträge haben bereits eine Rechnung.',
    selectAuftrag: 'Auftrag auswählen',
    rechnungsnummer: 'Rechnungsnummer',
    rechnungsdatum: 'Rechnungsdatum',
    faelligkeitsdatum: 'Fälligkeitsdatum',
    nettobetrag: 'Nettobetrag (€)',
    mwstSatzLabel: 'MwSt.-Satz',
    bruttobetrag: 'Bruttobetrag (€)',
    bruttobetrag_hint: 'Automatisch berechnet – kann überschrieben werden',
    statusRechnungLabel: 'Rechnungsstatus',
    createRechnung: 'Rechnung erstellen',
    creating: 'Wird erstellt…',
    pdfRechnungsnummer: 'Rechnungsnummer',
    pdfVorname: 'Vorname des Kunden',
    pdfNachname: 'Nachname des Kunden',
    pdfNetto: 'Nettobetrag (€)',
    pdfBrutto: 'Bruttobetrag (€)',
    pdfDatei: 'PDF-Datei hochladen',
    pdfDateiHint: 'PDF-Datei auswählen',
    createPdf: 'PDF-Eintrag anlegen',
    successTitle: 'Rechnung erfolgreich erstellt!',
    successSub: 'Rechnung {nr} für {name} wurde angelegt.',
    neueAbrechnung: 'Neue Abrechnung starten',
    backToDashboard: 'Zurück zum Dashboard',
    step2prereq: 'Dieser Schritt benötigt einen ausgewählten Auftrag.',
    step3prereq: 'Dieser Schritt benötigt eine erstellte Rechnung.',
    restart: 'Neu starten',
    mwst19: '19 %',
    mwst7: '7 %',
    mwst0: '0 %',
    offen: 'Offen',
    bezahlt: 'Bezahlt',
    ueberfaellig: 'Überfällig',
    kundeLabel: 'Kunde',
    fahrzeugLabel: 'Fahrzeug',
    auftragsnrLabel: 'Auftragsnr.',
    abgeschlossen: 'Abgeschlossen',
    pdfOptional: 'PDF-Datei (optional)',
    nettoLabel: 'Netto:',
    bruttoLabel: 'Brutto:',
  },
  en: {
    pageTitle: 'Invoice Work Order',
    subtitle: 'Create invoice and PDF entry',
    step1: 'Select order',
    step2: 'Create invoice',
    step3: 'Create PDF entry',
    step4: 'Done',
    noEligible: 'No completed work orders without an invoice.',
    noEligibleSub: 'All completed orders already have an invoice.',
    selectAuftrag: 'Select work order',
    rechnungsnummer: 'Invoice number',
    rechnungsdatum: 'Invoice date',
    faelligkeitsdatum: 'Due date',
    nettobetrag: 'Net amount (€)',
    mwstSatzLabel: 'VAT rate',
    bruttobetrag: 'Gross amount (€)',
    bruttobetrag_hint: 'Auto-calculated – can be overridden',
    statusRechnungLabel: 'Invoice status',
    createRechnung: 'Create invoice',
    creating: 'Creating…',
    pdfRechnungsnummer: 'Invoice number',
    pdfVorname: 'Customer first name',
    pdfNachname: 'Customer last name',
    pdfNetto: 'Net amount (€)',
    pdfBrutto: 'Gross amount (€)',
    pdfDatei: 'Upload PDF file',
    pdfDateiHint: 'Select PDF file',
    createPdf: 'Create PDF entry',
    successTitle: 'Invoice created successfully!',
    successSub: 'Invoice {nr} for {name} has been created.',
    neueAbrechnung: 'Start new billing',
    backToDashboard: 'Back to dashboard',
    step2prereq: 'This step requires a selected work order.',
    step3prereq: 'This step requires a created invoice.',
    restart: 'Restart',
    mwst19: '19 %',
    mwst7: '7 %',
    mwst0: '0 %',
    offen: 'Open',
    bezahlt: 'Paid',
    ueberfaellig: 'Overdue',
    kundeLabel: 'Customer',
    fahrzeugLabel: 'Vehicle',
    auftragsnrLabel: 'Order no.',
    abgeschlossen: 'Completed',
    pdfOptional: 'PDF file (optional)',
    nettoLabel: 'Net:',
    bruttoLabel: 'Gross:',
  },
});

const MWST_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['mwst_satz'] ?? [];
const STATUS_OPTIONS = LOOKUP_OPTIONS['rechnungen']?.['status_rechnung'] ?? [];

function getMwstRate(key: string): number {
  if (key === 'mwst_19') return 0.19;
  if (key === 'mwst_7') return 0.07;
  return 0;
}

export default function AuftragAbrechnePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const auftragIdParam = searchParams.get('auftragId');

  const initialStep = (() => {
    const p = parseInt(searchParams.get('step') ?? '1', 10);
    if (p >= 1 && p <= 4) return p;
    return 1;
  })();

  const { auftraege, rechnungen, kunden, fahrzeuge, loading, error, fetchAll } = useDashboardData();

  // Step state
  const [step, setStep] = useState(initialStep);

  // Step 1 selection
  const [selectedAuftragId, setSelectedAuftragId] = useState<string | null>(auftragIdParam);

  // Step 2 — Rechnung form
  const today = format(new Date(), 'yyyy-MM-dd');
  const defaultFaellig = format(addDays(new Date(), 14), 'yyyy-MM-dd');

  const [rechnungsnummer, setRechnungsnummer] = useState('');
  const [rechnungsdatum, setRechnungsdatum] = useState(today);
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState(defaultFaellig);
  const [nettobetrag, setNettobetrag] = useState('');
  const [mwstSatz, setMwstSatz] = useState(MWST_OPTIONS[0]?.key ?? 'mwst_19');
  const [bruttoOverride, setBruttoOverride] = useState('');
  const [statusRechnung, setStatusRechnung] = useState(STATUS_OPTIONS[0]?.key ?? 'offen');

  // Idempotency: store created rechnung id to prevent double-create on retry
  const [createdRechnungId, setCreatedRechnungId] = useState<string | null>(null);
  const [createdRechnungsnummer, setCreatedRechnungsnummer] = useState('');

  // Step 3 — PDF form (pre-filled)
  const [pdfRechnungsnummer, setPdfRechnungsnummer] = useState('');
  const [pdfVorname, setPdfVorname] = useState('');
  const [pdfNachname, setPdfNachname] = useState('');
  const [pdfNetto, setPdfNetto] = useState('');
  const [pdfBrutto, setPdfBrutto] = useState('');
  const [pdfDatei, setPdfDatei] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Loading/error state for write operations
  const [submitting, setSubmitting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  // Compute brutto live from netto × (1 + mwst) unless user has overridden it
  const computedBrutto = useMemo(() => {
    const net = parseFloat(nettobetrag);
    if (isNaN(net)) return '';
    const rate = getMwstRate(mwstSatz);
    return (net * (1 + rate)).toFixed(2);
  }, [nettobetrag, mwstSatz]);

  const effectiveBrutto = bruttoOverride !== '' ? bruttoOverride : computedBrutto;

  // Build set of Auftrag-IDs that already have a Rechnung
  const auftragIdsWithRechnung = useMemo(() => {
    const ids = new Set<string>();
    rechnungen.forEach(r => {
      const id = extractRecordId(r.fields.auftrag);
      if (id) ids.add(id);
    });
    return ids;
  }, [rechnungen]);

  // Eligible Aufträge: status === 'abgeschlossen' AND no Rechnung yet
  const eligibleAuftraege = useMemo(() => {
    return auftraege.filter(a => {
      const statusK = lookupKey(a.fields.status);
      return statusK === 'abgeschlossen' && !auftragIdsWithRechnung.has(a.record_id);
    });
  }, [auftraege, auftragIdsWithRechnung]);

  // Maps for enrichment
  const kundenMap = useMemo(() => {
    const m = new Map<string, typeof kunden[0]>();
    kunden.forEach(k => m.set(k.record_id, k));
    return m;
  }, [kunden]);

  const fahrzeugeMap = useMemo(() => {
    const m = new Map<string, typeof fahrzeuge[0]>();
    fahrzeuge.forEach(f => m.set(f.record_id, f));
    return m;
  }, [fahrzeuge]);

  // Selected Auftrag object
  const selectedAuftrag = useMemo(
    () => eligibleAuftraege.find(a => a.record_id === selectedAuftragId) ?? null,
    [eligibleAuftraege, selectedAuftragId]
  );

  // Also allow lookup from all auftraege for deep-link case
  const selectedAuftragFull = useMemo(
    () => auftraege.find(a => a.record_id === selectedAuftragId) ?? null,
    [auftraege, selectedAuftragId]
  );

  const auftrag = selectedAuftrag ?? selectedAuftragFull;

  function handleStepChange(s: number) {
    setStep(s);
    const next = new URLSearchParams(searchParams);
    next.set('step', String(s));
    setSearchParams(next, { replace: true });
  }

  function handleSelectAuftrag(id: string) {
    setSelectedAuftragId(id);
    const next = new URLSearchParams(searchParams);
    next.set('auftragId', id);
    next.set('step', '2');
    setSearchParams(next, { replace: true });
    setStep(2);
  }

  async function handleCreateRechnung() {
    if (!selectedAuftragId || !auftrag) return;

    const netVal = parseFloat(nettobetrag);
    const brutVal = parseFloat(effectiveBrutto);
    if (isNaN(netVal) || isNaN(brutVal) || !rechnungsnummer) return;

    setSubmitting(true);
    setWriteError(null);
    try {
      let rId = createdRechnungId;
      if (!rId) {
        // Resolve Kunde-ID from the Auftrag
        const kundeId = extractRecordId(auftrag.fields.kunde);
        const rechnung = await LivingAppsService.createRechnungenEntry({
          rechnungsnummer,
          auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, selectedAuftragId),
          kunde: kundeId ? createRecordUrl(APP_IDS.KUNDEN, kundeId) : undefined,
          nettobetrag: netVal,
          mwst_satz: mwstSatz,
          bruttobetrag: brutVal,
          rechnungsdatum,
          faelligkeitsdatum,
          status_rechnung: statusRechnung,
        });
        rId = rechnung.record_id;
        setCreatedRechnungId(rId);
        setCreatedRechnungsnummer(rechnungsnummer);
        await fetchAll();
      }

      // Pre-fill step 3
      const kundeId = extractRecordId(auftrag.fields.kunde);
      const kunde = kundeId ? kundenMap.get(kundeId) : null;
      setPdfRechnungsnummer(rechnungsnummer);
      setPdfVorname(kunde?.fields.vorname ?? '');
      setPdfNachname(kunde?.fields.nachname ?? '');
      setPdfNetto(String(netVal));
      setPdfBrutto(String(brutVal));

      handleStepChange(3);
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : 'Fehler beim Erstellen der Rechnung.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreatePdf() {
    if (!createdRechnungId) return;

    setSubmitting(true);
    setWriteError(null);
    try {
      const netVal = parseFloat(pdfNetto);
      const brutVal = parseFloat(pdfBrutto);
      await LivingAppsService.createRechnungsPdfErstellenEntry({
        rechnung: createRecordUrl(APP_IDS.RECHNUNGEN, createdRechnungId),
        pdf_rechnungsnummer: pdfRechnungsnummer,
        pdf_kunde_vorname: pdfVorname,
        pdf_kunde_nachname: pdfNachname,
        pdf_nettobetrag: isNaN(netVal) ? undefined : netVal,
        pdf_bruttobetrag: isNaN(brutVal) ? undefined : brutVal,
        pdf_datei: pdfDatei ? pdfDatei.name : undefined,
      });
      await fetchAll();
      handleStepChange(4);
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : 'Fehler beim Anlegen des PDF-Eintrags.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedAuftragId(null);
    setRechnungsnummer('');
    setRechnungsdatum(today);
    setFaelligkeitsdatum(defaultFaellig);
    setNettobetrag('');
    setMwstSatz(MWST_OPTIONS[0]?.key ?? 'mwst_19');
    setBruttoOverride('');
    setStatusRechnung(STATUS_OPTIONS[0]?.key ?? 'offen');
    setCreatedRechnungId(null);
    setCreatedRechnungsnummer('');
    setPdfRechnungsnummer('');
    setPdfVorname('');
    setPdfNachname('');
    setPdfNetto('');
    setPdfBrutto('');
    setPdfDatei(null);
    setWriteError(null);
    setSearchParams({});
    setStep(1);
  }

  const auftragKundeId = auftrag ? extractRecordId(auftrag.fields.kunde) : null;
  const auftragKunde = auftragKundeId ? kundenMap.get(auftragKundeId) : null;
  const auftragFahrzeugId = auftrag ? extractRecordId(auftrag.fields.fahrzeug) : null;
  const auftragFahrzeug = auftragFahrzeugId ? fahrzeugeMap.get(auftragFahrzeugId) : null;

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
        { label: tt('step4') },
      ]}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Auftrag wählen ─────────────────────────────────── */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleAuftraege.map(a => {
            const kidId = extractRecordId(a.fields.kunde);
            const kid = kidId ? kundenMap.get(kidId) : null;
            const fid = extractRecordId(a.fields.fahrzeug);
            const fz = fid ? fahrzeugeMap.get(fid) : null;
            const kundeName = kid
              ? `${kid.fields.vorname ?? ''} ${kid.fields.nachname ?? ''}`.trim()
              : '—';
            const kennzeichen = fz?.fields.kennzeichen ?? '—';
            return {
              id: a.record_id,
              title: a.fields.auftragsnummer ?? a.record_id,
              subtitle: `${kundeName} · ${kennzeichen}`,
              status: a.fields.status
                ? { key: a.fields.status.key, label: a.fields.status.label }
                : undefined,
              stats: [
                { label: tt('kundeLabel'), value: kundeName },
                { label: tt('fahrzeugLabel'), value: kennzeichen },
              ],
              icon: <IconFileInvoice size={20} className="text-primary" />,
            };
          })}
          onSelect={handleSelectAuftrag}
          emptyText={tt('noEligible')}
        />
      )}

      {/* ── Step 2: Rechnung erstellen ─────────────────────────────── */}
      {step === 2 && (
        !auftrag ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step2prereq')}</p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>{tt('restart')}</Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Auftrag summary */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{tt('auftragsnrLabel')}</span>
                <span className="text-sm">{auftrag.fields.auftragsnummer ?? auftrag.record_id}</span>
                <StatusBadge statusKey={lookupKey(auftrag.fields.status)} label={auftrag.fields.status?.label} />
              </div>
              {auftragKunde && (
                <p className="text-sm text-muted-foreground">
                  {tt('kundeLabel')}: {auftragKunde.fields.vorname} {auftragKunde.fields.nachname}
                </p>
              )}
              {auftragFahrzeug && (
                <p className="text-sm text-muted-foreground">
                  {tt('fahrzeugLabel')}: {auftragFahrzeug.fields.kennzeichen} – {auftragFahrzeug.fields.marke} {auftragFahrzeug.fields.modell}
                </p>
              )}
              {auftrag.fields.arbeitsbeschreibung && (
                <p className="text-sm text-muted-foreground line-clamp-2">{auftrag.fields.arbeitsbeschreibung}</p>
              )}
            </div>

            {/* Rechnung form */}
            <div className="rounded-2xl border p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rechnungsnummer">{tt('rechnungsnummer')} *</Label>
                  <Input
                    id="rechnungsnummer"
                    value={rechnungsnummer}
                    onChange={e => setRechnungsnummer(e.target.value)}
                    placeholder="RE-2026-001"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rechnungsdatum">{tt('rechnungsdatum')} *</Label>
                  <Input
                    id="rechnungsdatum"
                    type="date"
                    value={rechnungsdatum}
                    onChange={e => setRechnungsdatum(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="faelligkeitsdatum">{tt('faelligkeitsdatum')} *</Label>
                  <Input
                    id="faelligkeitsdatum"
                    type="date"
                    value={faelligkeitsdatum}
                    onChange={e => setFaelligkeitsdatum(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nettobetrag">{tt('nettobetrag')} *</Label>
                  <Input
                    id="nettobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={nettobetrag}
                    onChange={e => { setNettobetrag(e.target.value); setBruttoOverride(''); }}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mwst_satz">{tt('mwstSatzLabel')} *</Label>
                  <Select value={mwstSatz} onValueChange={v => { setMwstSatz(v); setBruttoOverride(''); }}>
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
                  <Label htmlFor="bruttobetrag">{tt('bruttobetrag')} *</Label>
                  <Input
                    id="bruttobetrag"
                    type="number"
                    min="0"
                    step="0.01"
                    value={effectiveBrutto}
                    onChange={e => setBruttoOverride(e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground">{tt('bruttobetrag_hint')}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="status_rechnung">{tt('statusRechnungLabel')}</Label>
                  <Select value={statusRechnung} onValueChange={setStatusRechnung}>
                    <SelectTrigger id="status_rechnung">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(o => (
                        <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Live-Zusammenfassung */}
              {nettobetrag && !isNaN(parseFloat(nettobetrag)) && (
                <div className="rounded-xl bg-secondary/40 p-3 flex flex-wrap gap-6 text-sm">
                  <span>
                    <span className="text-muted-foreground">{tt('nettoLabel')} </span>
                    <span className="font-semibold">{formatCurrency(parseFloat(nettobetrag))}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">{tt('bruttoLabel')} </span>
                    <span className="font-semibold text-primary">
                      {formatCurrency(parseFloat(effectiveBrutto) || 0)}
                    </span>
                  </span>
                </div>
              )}

              {writeError && (
                <p className="text-sm text-destructive">{writeError}</p>
              )}

              <div className="flex gap-3 flex-wrap">
                <Button variant="outline" onClick={() => handleStepChange(1)}>
                  Zurück
                </Button>
                <Button
                  onClick={handleCreateRechnung}
                  disabled={submitting || !rechnungsnummer || !nettobetrag || !rechnungsdatum || !faelligkeitsdatum}
                >
                  <IconCurrencyEuro size={16} className="mr-1.5" />
                  {submitting ? tt('creating') : tt('createRechnung')}
                </Button>
              </div>
            </div>
          </div>
        )
      )}

      {/* ── Step 3: PDF-Eintrag anlegen ────────────────────────────── */}
      {step === 3 && (
        !createdRechnungId ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step3prereq')}</p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>{tt('restart')}</Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pdf_rechnungsnummer">{tt('pdfRechnungsnummer')} *</Label>
                  <Input
                    id="pdf_rechnungsnummer"
                    value={pdfRechnungsnummer}
                    onChange={e => setPdfRechnungsnummer(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pdf_vorname">{tt('pdfVorname')} *</Label>
                  <Input
                    id="pdf_vorname"
                    value={pdfVorname}
                    onChange={e => setPdfVorname(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pdf_nachname">{tt('pdfNachname')} *</Label>
                  <Input
                    id="pdf_nachname"
                    value={pdfNachname}
                    onChange={e => setPdfNachname(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pdf_netto">{tt('pdfNetto')} *</Label>
                  <Input
                    id="pdf_netto"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pdfNetto}
                    onChange={e => setPdfNetto(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pdf_brutto">{tt('pdfBrutto')} *</Label>
                  <Input
                    id="pdf_brutto"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pdfBrutto}
                    onChange={e => setPdfBrutto(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="pdf_datei">{tt('pdfOptional')}</Label>
                  <div
                    className="flex items-center gap-3 rounded-xl border border-dashed p-3 cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <IconUpload size={18} className="text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground truncate min-w-0">
                      {pdfDatei ? pdfDatei.name : tt('pdfDateiHint')}
                    </span>
                  </div>
                  <input
                    ref={fileInputRef}
                    id="pdf_datei"
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={e => setPdfDatei(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>

              {writeError && (
                <p className="text-sm text-destructive">{writeError}</p>
              )}

              <div className="flex gap-3 flex-wrap">
                <Button variant="outline" onClick={() => handleStepChange(2)}>
                  Zurück
                </Button>
                <Button
                  onClick={handleCreatePdf}
                  disabled={submitting || !pdfRechnungsnummer || !pdfVorname || !pdfNachname}
                >
                  <IconUpload size={16} className="mr-1.5" />
                  {submitting ? tt('creating') : tt('createPdf')}
                </Button>
              </div>
            </div>
          </div>
        )
      )}

      {/* ── Step 4: Fertig ─────────────────────────────────────────── */}
      {step === 4 && (
        <div className="flex flex-col items-center text-center py-12 space-y-6">
          <div className="rounded-full bg-primary/10 p-5">
            <IconCheck size={40} className="text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
            <p className="text-muted-foreground max-w-sm">
              {tt('successSub', {
                nr: createdRechnungsnummer,
                name: auftragKunde
                  ? `${auftragKunde.fields.vorname ?? ''} ${auftragKunde.fields.nachname ?? ''}`.trim()
                  : '—',
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button onClick={handleReset}>{tt('neueAbrechnung')}</Button>
            <Button variant="outline" asChild>
              <a href="#/">{tt('backToDashboard')}</a>
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
