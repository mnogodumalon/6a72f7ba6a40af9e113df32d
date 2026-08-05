import type { Rechnungen, Auftraege, Kunden, RechnungsPdfErstellen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { MediaThumbnail } from '@/components/widgets/MediaViewer';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface RechnungenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Rechnungen;
  /** N:1-Ziel „Auftraege": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  auftraegeList: Auftraege[];
  /** Klick auf die Auftraege-Relation → overlay.push auf dessen Detail. */
  onOpenAuftraege?: (record: Auftraege) => void;
  /** N:1-Ziel „Kunden": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  kundenList: Kunden[];
  /** Klick auf die Kunden-Relation → overlay.push auf dessen Detail. */
  onOpenKunden?: (record: Kunden) => void;
  /** 1:N „Rechnungs-PDF erstellen": VOLLE Liste — der Block filtert auf diesen Record. */
  rechnungsPdfErstellenList: RechnungsPdfErstellen[];
  /** Zeilen-Klick → overlay.push auf das RechnungsPdfErstellen-Detail (nie der Edit-Dialog). */
  onOpenRechnungsPdfErstellen: (record: RechnungsPdfErstellen) => void;
  /** Kontextuelles „+": öffnet den RechnungsPdfErstellen-Dialog mit diesem Record vorgesetzt. */
  onAddRechnungsPdfErstellen: () => void;
}

export function RechnungenDetails({
  record,
  auftraegeList,
  onOpenAuftraege,
  kundenList,
  onOpenKunden,
  rechnungsPdfErstellenList,
  onOpenRechnungsPdfErstellen,
  onAddRechnungsPdfErstellen,
}: RechnungenDetailsProps) {
  const auftragTarget = auftraegeList.find(r => r.record_id === extractRecordId(record.fields.auftrag));
  const kundeTarget = kundenList.find(r => r.record_id === extractRecordId(record.fields.kunde));
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Rechnungsnummer" value={record.fields.rechnungsnummer} format="text" />
        <RecordField label="Nettobetrag (€)" value={record.fields.nettobetrag} format="text" />
        <RecordField label="MwSt.-Satz" value={record.fields.mwst_satz} format="pill" />
        <RecordField label="Bruttobetrag (€)" value={record.fields.bruttobetrag} format="text" />
        <RecordField label="Rechnungsdatum" value={record.fields.rechnungsdatum} format="date" />
        <RecordField label="Fälligkeitsdatum" value={record.fields.faelligkeitsdatum} format="date" />
        <RecordField label="Status" value={record.fields.status_rechnung} format="pill" />
        <RecordField label="PDF-Anhang" className="md:col-span-2">
          {record.fields.pdf_anhang ? (
            <MediaThumbnail src={record.fields.pdf_anhang as string} fit="contain" className="max-h-64 w-full rounded-lg" />
          ) : '—'}
        </RecordField>
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title="Verknüpft" cols={2}>
        <RecordRelation
          label="Auftrag"
          name={auftragTarget?.fields.auftragsnummer ?? '—'}
          meta={undefined}
          onClick={auftragTarget && onOpenAuftraege ? () => onOpenAuftraege!(auftragTarget!) : undefined}
        />
        <RecordRelation
          label="Kunde"
          name={kundeTarget?.fields.vorname ?? '—'}
          meta={[kundeTarget?.fields.email, kundeTarget?.fields.telefon].filter(Boolean).join(' · ') || undefined}
          onClick={kundeTarget && onOpenKunden ? () => onOpenKunden!(kundeTarget!) : undefined}
        />
      </RecordSection>

      <SatelliteSection
        title="Rechnungs-PDF erstellen"
        items={rechnungsPdfErstellenList.filter(r => extractRecordId(r.fields.rechnung) === record.record_id)}
        map={r => ({ name: r.fields.pdf_rechnungsnummer ?? 'Rechnungs-PDF erstellen', meta: undefined })}
        onOpen={onOpenRechnungsPdfErstellen}
        onAdd={onAddRechnungsPdfErstellen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.RECHNUNGEN} recordId={record.record_id} />
    </>
  );
}
