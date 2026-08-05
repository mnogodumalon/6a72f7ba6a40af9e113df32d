import type { Auftraege, Fahrzeuge, Kunden, Rechnungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface AuftraegeDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Auftraege;
  /** N:1-Ziel „Fahrzeuge": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  fahrzeugeList: Fahrzeuge[];
  /** Klick auf die Fahrzeuge-Relation → overlay.push auf dessen Detail. */
  onOpenFahrzeuge?: (record: Fahrzeuge) => void;
  /** N:1-Ziel „Kunden": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  kundenList: Kunden[];
  /** Klick auf die Kunden-Relation → overlay.push auf dessen Detail. */
  onOpenKunden?: (record: Kunden) => void;
  /** 1:N „Rechnungen": VOLLE Liste — der Block filtert auf diesen Record. */
  rechnungenList: Rechnungen[];
  /** Zeilen-Klick → overlay.push auf das Rechnungen-Detail (nie der Edit-Dialog). */
  onOpenRechnungen: (record: Rechnungen) => void;
  /** Kontextuelles „+": öffnet den Rechnungen-Dialog mit diesem Record vorgesetzt. */
  onAddRechnungen: () => void;
}

export function AuftraegeDetails({
  record,
  fahrzeugeList,
  onOpenFahrzeuge,
  kundenList,
  onOpenKunden,
  rechnungenList,
  onOpenRechnungen,
  onAddRechnungen,
}: AuftraegeDetailsProps) {
  const fahrzeugTarget = fahrzeugeList.find(r => r.record_id === extractRecordId(record.fields.fahrzeug));
  const kundeTarget = kundenList.find(r => r.record_id === extractRecordId(record.fields.kunde));
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Arbeitsbeschreibung" value={record.fields.arbeitsbeschreibung} format="longtext" className="md:col-span-2" />
        <RecordField label="Wunschtermin" value={record.fields.wunschtermin} format="datetime" />
        <RecordField label="Status" value={record.fields.status} format="pill" />
        <RecordField label="Priorität" value={record.fields.prioritaet} format="pill" />
        <RecordField label="Bemerkungen" value={record.fields.bemerkungen_auftrag} format="longtext" className="md:col-span-2" />
        <RecordField label="Auftragsnummer" value={record.fields.auftragsnummer} format="text" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title="Verknüpft" cols={2}>
        <RecordRelation
          label="Fahrzeug"
          name={fahrzeugTarget?.fields.kennzeichen ?? '—'}
          meta={[fahrzeugTarget?.fields.marke, fahrzeugTarget?.fields.modell].filter(Boolean).join(' · ') || undefined}
          onClick={fahrzeugTarget && onOpenFahrzeuge ? () => onOpenFahrzeuge!(fahrzeugTarget!) : undefined}
        />
        <RecordRelation
          label="Kunde"
          name={kundeTarget?.fields.vorname ?? '—'}
          meta={[kundeTarget?.fields.email, kundeTarget?.fields.telefon].filter(Boolean).join(' · ') || undefined}
          onClick={kundeTarget && onOpenKunden ? () => onOpenKunden!(kundeTarget!) : undefined}
        />
      </RecordSection>

      <SatelliteSection
        title="Rechnungen"
        items={rechnungenList.filter(r => extractRecordId(r.fields.auftrag) === record.record_id)}
        map={r => ({ name: r.fields.rechnungsnummer ?? 'Rechnungen', meta: r.fields.rechnungsdatum })}
        onOpen={onOpenRechnungen}
        onAdd={onAddRechnungen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.AUFTRAEGE} recordId={record.record_id} />
    </>
  );
}
