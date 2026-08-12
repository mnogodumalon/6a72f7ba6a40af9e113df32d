import type { JahresinspektionPlanen, Fahrzeuge } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';

export interface JahresinspektionPlanenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: JahresinspektionPlanen;
  /** N:1-Ziel „Fahrzeuge": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  fahrzeugeList: Fahrzeuge[];
  /** Klick auf die Fahrzeuge-Relation → overlay.push auf dessen Detail. */
  onOpenFahrzeuge?: (record: Fahrzeuge) => void;
}

export function JahresinspektionPlanenDetails({
  record,
  fahrzeugeList,
  onOpenFahrzeuge,
}: JahresinspektionPlanenDetailsProps) {
  const fahrzeugTarget = fahrzeugeList.find(r => r.record_id === extractRecordId(record.fields.fahrzeug));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('jahresinspektion_planen', 'wunschtermin_inspektion')} value={record.fields.wunschtermin_inspektion} format="datetime" />
        <RecordField label={fieldLabel('jahresinspektion_planen', 'arbeitsbeschreibung_inspektion')} value={record.fields.arbeitsbeschreibung_inspektion} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('jahresinspektion_planen', 'bemerkungen_inspektion')} value={record.fields.bemerkungen_inspektion} format="longtext" className="md:col-span-2" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('jahresinspektion_planen', 'fahrzeug')}
          name={fahrzeugTarget?.fields.kennzeichen ?? '—'}
          meta={[fahrzeugTarget?.fields.marke, fahrzeugTarget?.fields.modell].filter(Boolean).join(' · ') || undefined}
          onClick={fahrzeugTarget && onOpenFahrzeuge ? () => onOpenFahrzeuge!(fahrzeugTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.JAHRESINSPEKTION_PLANEN} recordId={record.record_id} />
    </>
  );
}
