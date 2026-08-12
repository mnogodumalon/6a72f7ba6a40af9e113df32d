import type { Kunden, Fahrzeuge, Auftraege, Rechnungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface KundenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Kunden;
  /** 1:N „Fahrzeuge": VOLLE Liste — der Block filtert auf diesen Record. */
  fahrzeugeList: Fahrzeuge[];
  /** Zeilen-Klick → overlay.push auf das Fahrzeuge-Detail (nie der Edit-Dialog). */
  onOpenFahrzeuge: (record: Fahrzeuge) => void;
  /** Kontextuelles „+": öffnet den Fahrzeuge-Dialog mit diesem Record vorgesetzt. */
  onAddFahrzeuge: () => void;
  /** 1:N „Aufträge": VOLLE Liste — der Block filtert auf diesen Record. */
  auftraegeList: Auftraege[];
  /** Zeilen-Klick → overlay.push auf das Auftraege-Detail (nie der Edit-Dialog). */
  onOpenAuftraege: (record: Auftraege) => void;
  /** Kontextuelles „+": öffnet den Auftraege-Dialog mit diesem Record vorgesetzt. */
  onAddAuftraege: () => void;
  /** 1:N „Rechnungen": VOLLE Liste — der Block filtert auf diesen Record. */
  rechnungenList: Rechnungen[];
  /** Zeilen-Klick → overlay.push auf das Rechnungen-Detail (nie der Edit-Dialog). */
  onOpenRechnungen: (record: Rechnungen) => void;
  /** Kontextuelles „+": öffnet den Rechnungen-Dialog mit diesem Record vorgesetzt. */
  onAddRechnungen: () => void;
}

export function KundenDetails({
  record,
  fahrzeugeList,
  onOpenFahrzeuge,
  onAddFahrzeuge,
  auftraegeList,
  onOpenAuftraege,
  onAddAuftraege,
  rechnungenList,
  onOpenRechnungen,
  onAddRechnungen,
}: KundenDetailsProps) {
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('kunden', 'vorname')} value={record.fields.vorname} format="text" />
        <RecordField label={fieldLabel('kunden', 'nachname')} value={record.fields.nachname} format="text" />
        <RecordField label={fieldLabel('kunden', 'email')} value={record.fields.email} format="email" />
        <RecordField label={fieldLabel('kunden', 'telefon')} value={record.fields.telefon} format="text" />
        <RecordField label={fieldLabel('kunden', 'strasse')} value={record.fields.strasse} format="text" />
        <RecordField label={fieldLabel('kunden', 'hausnummer')} value={record.fields.hausnummer} format="text" />
        <RecordField label={fieldLabel('kunden', 'plz')} value={record.fields.plz} format="text" />
        <RecordField label={fieldLabel('kunden', 'ort')} value={record.fields.ort} format="text" />
        <RecordField label={fieldLabel('kunden', 'bemerkungen_kunde')} value={record.fields.bemerkungen_kunde} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('fahrzeuge')}
        items={fahrzeugeList.filter(r => extractRecordId(r.fields.kunde) === record.record_id)}
        map={r => ({ name: r.fields.kennzeichen ?? appLabel('fahrzeuge'), meta: undefined })}
        onOpen={onOpenFahrzeuge}
        onAdd={onAddFahrzeuge}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('auftraege')}
        items={auftraegeList.filter(r => extractRecordId(r.fields.kunde) === record.record_id)}
        map={r => ({ name: r.fields.auftragsnummer ?? appLabel('auftraege'), meta: r.fields.wunschtermin })}
        onOpen={onOpenAuftraege}
        onAdd={onAddAuftraege}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('rechnungen')}
        items={rechnungenList.filter(r => extractRecordId(r.fields.kunde) === record.record_id)}
        map={r => ({ name: r.fields.rechnungsnummer ?? appLabel('rechnungen'), meta: r.fields.rechnungsdatum })}
        onOpen={onOpenRechnungen}
        onAdd={onAddRechnungen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.KUNDEN} recordId={record.record_id} />
    </>
  );
}
