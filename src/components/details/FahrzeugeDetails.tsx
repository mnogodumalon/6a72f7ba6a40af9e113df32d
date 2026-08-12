import type { Fahrzeuge, Kunden, Auftraege, JahresinspektionPlanen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface FahrzeugeDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Fahrzeuge;
  /** N:1-Ziel „Kunden": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  kundenList: Kunden[];
  /** Klick auf die Kunden-Relation → overlay.push auf dessen Detail. */
  onOpenKunden?: (record: Kunden) => void;
  /** 1:N „Aufträge": VOLLE Liste — der Block filtert auf diesen Record. */
  auftraegeList: Auftraege[];
  /** Zeilen-Klick → overlay.push auf das Auftraege-Detail (nie der Edit-Dialog). */
  onOpenAuftraege: (record: Auftraege) => void;
  /** Kontextuelles „+": öffnet den Auftraege-Dialog mit diesem Record vorgesetzt. */
  onAddAuftraege: () => void;
  /** 1:N „Jahresinspektion planen": VOLLE Liste — der Block filtert auf diesen Record. */
  jahresinspektionPlanenList: JahresinspektionPlanen[];
  /** Zeilen-Klick → overlay.push auf das JahresinspektionPlanen-Detail (nie der Edit-Dialog). */
  onOpenJahresinspektionPlanen: (record: JahresinspektionPlanen) => void;
  /** Kontextuelles „+": öffnet den JahresinspektionPlanen-Dialog mit diesem Record vorgesetzt. */
  onAddJahresinspektionPlanen: () => void;
}

export function FahrzeugeDetails({
  record,
  kundenList,
  onOpenKunden,
  auftraegeList,
  onOpenAuftraege,
  onAddAuftraege,
  jahresinspektionPlanenList,
  onOpenJahresinspektionPlanen,
  onAddJahresinspektionPlanen,
}: FahrzeugeDetailsProps) {
  const kundeTarget = kundenList.find(r => r.record_id === extractRecordId(record.fields.kunde));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('fahrzeuge', 'kennzeichen')} value={record.fields.kennzeichen} format="text" />
        <RecordField label={fieldLabel('fahrzeuge', 'marke')} value={record.fields.marke} format="text" />
        <RecordField label={fieldLabel('fahrzeuge', 'modell')} value={record.fields.modell} format="text" />
        <RecordField label={fieldLabel('fahrzeuge', 'baujahr')} value={record.fields.baujahr} format="text" />
        <RecordField label={fieldLabel('fahrzeuge', 'fin')} value={record.fields.fin} format="text" />
        <RecordField label={fieldLabel('fahrzeuge', 'kilometerstand')} value={record.fields.kilometerstand} format="text" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('fahrzeuge', 'kunde')}
          name={kundeTarget?.fields.vorname ?? '—'}
          meta={[kundeTarget?.fields.email, kundeTarget?.fields.telefon].filter(Boolean).join(' · ') || undefined}
          onClick={kundeTarget && onOpenKunden ? () => onOpenKunden!(kundeTarget!) : undefined}
        />
      </RecordSection>

      <SatelliteSection
        title={appLabel('auftraege')}
        items={auftraegeList.filter(r => extractRecordId(r.fields.fahrzeug) === record.record_id)}
        map={r => ({ name: r.fields.auftragsnummer ?? appLabel('auftraege'), meta: r.fields.wunschtermin })}
        onOpen={onOpenAuftraege}
        onAdd={onAddAuftraege}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('jahresinspektion_planen')}
        items={jahresinspektionPlanenList.filter(r => extractRecordId(r.fields.fahrzeug) === record.record_id)}
        map={r => ({ name: appLabel('jahresinspektion_planen'), meta: r.fields.wunschtermin_inspektion })}
        onOpen={onOpenJahresinspektionPlanen}
        onAdd={onAddJahresinspektionPlanen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.FAHRZEUGE} recordId={record.record_id} />
    </>
  );
}
