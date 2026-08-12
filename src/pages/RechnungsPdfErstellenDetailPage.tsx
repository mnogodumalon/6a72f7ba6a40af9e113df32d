import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import type { RechnungsPdfErstellen, Rechnungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconTrash } from '@tabler/icons-react';
import {
  RecordView, RecordHeader, RecordKeyFacts, RecordSection, RecordField,
  RecordAttachments, RecordViewSkeleton, RecordViewEmpty,
} from '@/components/widgets/RecordView';
import { RechnungsPdfErstellenDialog } from '@/components/dialogs/RechnungsPdfErstellenDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { formEnhancements } from '@/config/form-enhancements/RechnungsPdfErstellen';
import { evalComputed } from '@/config/form-enhancements/types';
import { t, appLabel, fieldLabel, localeTag, CURRENCY } from '@/i18n';

export default function RechnungsPdfErstellenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<RechnungsPdfErstellen | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rechnungenList, setRechnungenList] = useState<Rechnungen[]>([]);

  useEffect(() => { loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function loadData() {
    setLoading(true);
    try {
      const [mainData, rechnungenData] = await Promise.all([
        LivingAppsService.getRechnungsPdfErstellen(),
        LivingAppsService.getRechnungen(),
      ]);
      setRechnungenList(rechnungenData);
      setRecord(mainData.find(r => r.record_id === id) ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(fields: RechnungsPdfErstellen['fields']) {
    if (!record) return;
    await LivingAppsService.updateRechnungsPdfErstellenEntry(record.record_id, fields);
    await loadData();
    setEditing(false);
  }

  async function handleDelete() {
    if (!record) return;
    await LivingAppsService.deleteRechnungsPdfErstellenEntry(record.record_id);
    setDeleteOpen(false);
    navigate('/rechnungs-pdf-erstellen');
  }

  function getRechnungenDisplayName(url?: unknown) {
    if (!url) return '—';
    const refId = extractRecordId(url);
    return rechnungenList.find(r => r.record_id === refId)?.fields.rechnungsnummer ?? '—';
  }

  if (loading) {
    return <RecordViewSkeleton />;
  }

  if (!record) {
    return (
      <RecordViewEmpty
        title={t('not_found')}
        action={
          <Button variant="ghost" onClick={() => navigate('/rechnungs-pdf-erstellen')}>
            <IconArrowLeft className="h-4 w-4 mr-1.5" />
            {t('back')}
          </Button>
        }
      />
    );
  }

  return (
    <RecordView
      onBack={() => navigate('/rechnungs-pdf-erstellen')}
      onEdit={() => setEditing(true)}
      backLabel={t('back')}
      editLabel={t('edit_button')}
    >
      <RecordHeader title={record.fields.pdf_rechnungsnummer ?? appLabel('rechnungs_pdf_erstellen')} />

      {(() => {
        const lookupLists: Record<string, unknown> = {
          rechnung: rechnungenList,
        };
        const fmtComputed = (k: string, n: number) =>
          /(?:kosten|preis|betrag|gesamt|netto|brutto|summe|mwst|rabatt|anzahlung|umsatz|saldo)/i.test(k)
            ? n.toLocaleString(localeTag(), { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : n.toLocaleString(localeTag(), { maximumFractionDigits: 2 });
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

      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('rechnungs_pdf_erstellen', 'rechnung')} value={getRechnungenDisplayName(record.fields.rechnung)} format="text" />
        <RecordField label={fieldLabel('rechnungs_pdf_erstellen', 'pdf_rechnungsnummer')} value={record.fields.pdf_rechnungsnummer} format="text" />
        <RecordField label={fieldLabel('rechnungs_pdf_erstellen', 'pdf_kunde_vorname')} value={record.fields.pdf_kunde_vorname} format="text" />
        <RecordField label={fieldLabel('rechnungs_pdf_erstellen', 'pdf_kunde_nachname')} value={record.fields.pdf_kunde_nachname} format="text" />
        <RecordField label={fieldLabel('rechnungs_pdf_erstellen', 'pdf_nettobetrag')} value={record.fields.pdf_nettobetrag} format="text" />
        <RecordField label={fieldLabel('rechnungs_pdf_erstellen', 'pdf_bruttobetrag')} value={record.fields.pdf_bruttobetrag} format="text" />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.RECHNUNGS_PDF_ERSTELLEN} recordId={record.record_id} />

      <div className="flex justify-end pt-2">
        <Button variant="ghost" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
          <IconTrash className="h-4 w-4 mr-1.5" />
          {t('delete')}
        </Button>
      </div>

      <RechnungsPdfErstellenDialog
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={handleUpdate}
        defaultValues={record.fields}
        recordId={record.record_id}
        rechnungenList={rechnungenList}
        enablePhotoScan={AI_PHOTO_SCAN['RechnungsPdfErstellen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['RechnungsPdfErstellen']}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('delete_entity', { entity: appLabel('rechnungs_pdf_erstellen') })}
        description={t('confirm_delete_desc')}
      />
    </RecordView>
  );
}
