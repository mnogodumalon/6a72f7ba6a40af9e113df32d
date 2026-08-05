import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import type { JahresinspektionPlanen, Fahrzeuge } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconTrash } from '@tabler/icons-react';
import {
  RecordView, RecordHeader, RecordKeyFacts, RecordSection, RecordField,
  RecordAttachments, RecordViewSkeleton, RecordViewEmpty,
} from '@/components/widgets/RecordView';
import { JahresinspektionPlanenDialog } from '@/components/dialogs/JahresinspektionPlanenDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { formEnhancements } from '@/config/form-enhancements/JahresinspektionPlanen';
import { evalComputed } from '@/config/form-enhancements/types';

export default function JahresinspektionPlanenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<JahresinspektionPlanen | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [fahrzeugeList, setFahrzeugeList] = useState<Fahrzeuge[]>([]);

  useEffect(() => { loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function loadData() {
    setLoading(true);
    try {
      const [mainData, fahrzeugeData] = await Promise.all([
        LivingAppsService.getJahresinspektionPlanen(),
        LivingAppsService.getFahrzeuge(),
      ]);
      setFahrzeugeList(fahrzeugeData);
      setRecord(mainData.find(r => r.record_id === id) ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(fields: JahresinspektionPlanen['fields']) {
    if (!record) return;
    await LivingAppsService.updateJahresinspektionPlanenEntry(record.record_id, fields);
    await loadData();
    setEditing(false);
  }

  async function handleDelete() {
    if (!record) return;
    await LivingAppsService.deleteJahresinspektionPlanenEntry(record.record_id);
    setDeleteOpen(false);
    navigate('/jahresinspektion-planen');
  }

  function getFahrzeugeDisplayName(url?: unknown) {
    if (!url) return '—';
    const refId = extractRecordId(url);
    return fahrzeugeList.find(r => r.record_id === refId)?.fields.kennzeichen ?? '—';
  }

  if (loading) {
    return <RecordViewSkeleton />;
  }

  if (!record) {
    return (
      <RecordViewEmpty
        title="Eintrag nicht gefunden"
        action={
          <Button variant="ghost" onClick={() => navigate('/jahresinspektion-planen')}>
            <IconArrowLeft className="h-4 w-4 mr-1.5" />
            Zurück
          </Button>
        }
      />
    );
  }

  return (
    <RecordView
      onBack={() => navigate('/jahresinspektion-planen')}
      onEdit={() => setEditing(true)}
      backLabel="Zurück"
      editLabel="Bearbeiten"
    >
      <RecordHeader title={'Jahresinspektion planen'} />

      {(() => {
        const lookupLists: Record<string, unknown> = {
          fahrzeug: fahrzeugeList,
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
        <RecordField label="Fahrzeug" value={getFahrzeugeDisplayName(record.fields.fahrzeug)} format="text" />
        <RecordField label="Wunschtermin" value={record.fields.wunschtermin_inspektion} format="datetime" />
        <RecordField label="Arbeitsbeschreibung" value={record.fields.arbeitsbeschreibung_inspektion} format="longtext" className="md:col-span-2" />
        <RecordField label="Bemerkungen" value={record.fields.bemerkungen_inspektion} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.JAHRESINSPEKTION_PLANEN} recordId={record.record_id} />

      <div className="flex justify-end pt-2">
        <Button variant="ghost" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
          <IconTrash className="h-4 w-4 mr-1.5" />
          Löschen
        </Button>
      </div>

      <JahresinspektionPlanenDialog
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={handleUpdate}
        defaultValues={record.fields}
        recordId={record.record_id}
        fahrzeugeList={fahrzeugeList}
        enablePhotoScan={AI_PHOTO_SCAN['JahresinspektionPlanen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['JahresinspektionPlanen']}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Jahresinspektion planen löschen"
        description="Soll dieser Eintrag wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden."
      />
    </RecordView>
  );
}
