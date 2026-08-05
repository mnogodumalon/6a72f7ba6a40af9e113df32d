import type { RechnungsPdfErstellen, Rechnungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { MediaThumbnail } from '@/components/widgets/MediaViewer';

export interface RechnungsPdfErstellenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: RechnungsPdfErstellen;
  /** N:1-Ziel „Rechnungen": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  rechnungenList: Rechnungen[];
  /** Klick auf die Rechnungen-Relation → overlay.push auf dessen Detail. */
  onOpenRechnungen?: (record: Rechnungen) => void;
}

export function RechnungsPdfErstellenDetails({
  record,
  rechnungenList,
  onOpenRechnungen,
}: RechnungsPdfErstellenDetailsProps) {
  const rechnungTarget = rechnungenList.find(r => r.record_id === extractRecordId(record.fields.rechnung));
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Rechnungsnummer" value={record.fields.pdf_rechnungsnummer} format="text" />
        <RecordField label="Vorname des Kunden" value={record.fields.pdf_kunde_vorname} format="text" />
        <RecordField label="Nachname des Kunden" value={record.fields.pdf_kunde_nachname} format="text" />
        <RecordField label="Nettobetrag (€)" value={record.fields.pdf_nettobetrag} format="text" />
        <RecordField label="Bruttobetrag (€)" value={record.fields.pdf_bruttobetrag} format="text" />
        <RecordField label="PDF-Dokument" className="md:col-span-2">
          {record.fields.pdf_datei ? (
            <MediaThumbnail src={record.fields.pdf_datei as string} fit="contain" className="max-h-64 w-full rounded-lg" />
          ) : '—'}
        </RecordField>
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title="Verknüpft" cols={1}>
        <RecordRelation
          label="Rechnung"
          name={rechnungTarget?.fields.rechnungsnummer ?? '—'}
          meta={undefined}
          onClick={rechnungTarget && onOpenRechnungen ? () => onOpenRechnungen!(rechnungTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.RECHNUNGS_PDF_ERSTELLEN} recordId={record.record_id} />
    </>
  );
}
