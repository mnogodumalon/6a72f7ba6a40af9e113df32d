import type { Kunden, Fahrzeuge, Auftraege, Rechnungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
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
      <RecordSection title="Details" cols={2}>
        <RecordField label="Vorname" value={record.fields.vorname} format="text" />
        <RecordField label="Nachname" value={record.fields.nachname} format="text" />
        <RecordField label="E-Mail-Adresse" value={record.fields.email} format="email" />
        <RecordField label="Telefonnummer" value={record.fields.telefon} format="text" />
        <RecordField label="Straße" value={record.fields.strasse} format="text" />
        <RecordField label="Hausnummer" value={record.fields.hausnummer} format="text" />
        <RecordField label="Postleitzahl" value={record.fields.plz} format="text" />
        <RecordField label="Ort" value={record.fields.ort} format="text" />
        <RecordField label="Bemerkungen" value={record.fields.bemerkungen_kunde} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title="Fahrzeuge"
        items={fahrzeugeList.filter(r => extractRecordId(r.fields.kunde) === record.record_id)}
        map={r => ({ name: r.fields.kennzeichen ?? 'Fahrzeuge', meta: undefined })}
        onOpen={onOpenFahrzeuge}
        onAdd={onAddFahrzeuge}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title="Aufträge"
        items={auftraegeList.filter(r => extractRecordId(r.fields.kunde) === record.record_id)}
        map={r => ({ name: r.fields.auftragsnummer ?? 'Aufträge', meta: r.fields.wunschtermin })}
        onOpen={onOpenAuftraege}
        onAdd={onAddAuftraege}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title="Rechnungen"
        items={rechnungenList.filter(r => extractRecordId(r.fields.kunde) === record.record_id)}
        map={r => ({ name: r.fields.rechnungsnummer ?? 'Rechnungen', meta: r.fields.rechnungsdatum })}
        onOpen={onOpenRechnungen}
        onAdd={onAddRechnungen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.KUNDEN} recordId={record.record_id} />
    </>
  );
}
