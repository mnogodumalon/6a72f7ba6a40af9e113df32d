import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import type { Rechnungen, Auftraege, Kunden } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconTrash } from '@tabler/icons-react';
import {
  RecordView, RecordHeader, RecordKeyFacts, RecordSection, RecordField,
  RecordAttachments, RecordViewSkeleton, RecordViewEmpty,
} from '@/components/widgets/RecordView';
import { RechnungenDialog } from '@/components/dialogs/RechnungenDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { formEnhancements } from '@/config/form-enhancements/Rechnungen';
import { evalComputed } from '@/config/form-enhancements/types';

export default function RechnungenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<Rechnungen | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [auftraegeList, setAuftraegeList] = useState<Auftraege[]>([]);
  const [kundenList, setKundenList] = useState<Kunden[]>([]);

  useEffect(() => { loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function loadData() {
    setLoading(true);
    try {
      const [mainData, auftraegeData, kundenData] = await Promise.all([
        LivingAppsService.getRechnungen(),
        LivingAppsService.getAuftraege(),
        LivingAppsService.getKunden(),
      ]);
      setAuftraegeList(auftraegeData);
      setKundenList(kundenData);
      setRecord(mainData.find(r => r.record_id === id) ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(fields: Rechnungen['fields']) {
    if (!record) return;
    await LivingAppsService.updateRechnungenEntry(record.record_id, fields);
    await loadData();
    setEditing(false);
  }

  async function handleDelete() {
    if (!record) return;
    await LivingAppsService.deleteRechnungenEntry(record.record_id);
    setDeleteOpen(false);
    navigate('/rechnungen');
  }

  function getAuftraegeDisplayName(url?: unknown) {
    if (!url) return '—';
    const refId = extractRecordId(url);
    return auftraegeList.find(r => r.record_id === refId)?.fields.auftragsnummer ?? '—';
  }

  function getKundenDisplayName(url?: unknown) {
    if (!url) return '—';
    const refId = extractRecordId(url);
    return kundenList.find(r => r.record_id === refId)?.fields.vorname ?? '—';
  }

  if (loading) {
    return <RecordViewSkeleton />;
  }

  if (!record) {
    return (
      <RecordViewEmpty
        title="Eintrag nicht gefunden"
        action={
          <Button variant="ghost" onClick={() => navigate('/rechnungen')}>
            <IconArrowLeft className="h-4 w-4 mr-1.5" />
            Zurück
          </Button>
        }
      />
    );
  }

  return (
    <RecordView
      onBack={() => navigate('/rechnungen')}
      onEdit={() => setEditing(true)}
      backLabel="Zurück"
      editLabel="Bearbeiten"
    >
      <RecordHeader title={record.fields.rechnungsnummer ?? 'Rechnungen'} />

      {(() => {
        const lookupLists: Record<string, unknown> = {
          auftrag: auftraegeList,
          kunde: kundenList,
        };
        const fmtComputed = (k: string, n: number) =>
          /(?:kosten|preis|betrag|gesamt|netto|brutto|summe|mwst|rabatt|anzahlung|umsatz|saldo)/i.test(k)
            ? n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
        const computedFacts = Object.entries(formEnhancements.computed)
          .map(([key, formula]) => {
            const v = evalComputed(formula, record!.fields as Record<string, unknown>, { lookupLists });
            return v != null
              ? { label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '), value: fmtComputed(key, v) }
              : null;
          })
          .filter((f): f is { label: string; value: string } => f !== null);
        return computedFacts.length > 0 ? <RecordKeyFacts items={computedFacts} /> : null;
      })()}

      <RecordSection title="Details" cols={2}>
        <RecordField label="Rechnungsnummer" value={record.fields.rechnungsnummer} format="text" />
        <RecordField label="Auftrag" value={getAuftraegeDisplayName(record.fields.auftrag)} format="text" />
        <RecordField label="Kunde" value={getKundenDisplayName(record.fields.kunde)} format="text" />
        <RecordField label="Nettobetrag (€)" value={record.fields.nettobetrag} format="text" />
        <RecordField label="MwSt.-Satz" value={record.fields.mwst_satz} format="pill" />
        <RecordField label="Bruttobetrag (€)" value={record.fields.bruttobetrag} format="text" />
        <RecordField label="Rechnungsdatum" value={record.fields.rechnungsdatum} format="date" />
        <RecordField label="Fälligkeitsdatum" value={record.fields.faelligkeitsdatum} format="date" />
        <RecordField label="Status" value={record.fields.status_rechnung} format="pill" />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.RECHNUNGEN} recordId={record.record_id} />

      <div className="flex justify-end pt-2">
        <Button variant="ghost" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
          <IconTrash className="h-4 w-4 mr-1.5" />
          Löschen
        </Button>
      </div>

      <RechnungenDialog
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={handleUpdate}
        defaultValues={record.fields}
        recordId={record.record_id}
        auftraegeList={auftraegeList}
        kundenList={kundenList}
        enablePhotoScan={AI_PHOTO_SCAN['Rechnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rechnungen']}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Rechnungen löschen"
        description="Soll dieser Eintrag wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden."
      />
    </RecordView>
  );
}
