import type { Rechnungen, Auftraege, Kunden } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { APP_IDS } from '@/types/app';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { MediaThumbnail } from '@/components/widgets/MediaViewer';
import { Badge } from '@/components/ui/badge';
import { IconPencil, IconFileText } from '@tabler/icons-react';
import { t, appLabel, fieldLabel, lookupLabel, dateFnsLocale, dateFormat } from '@/i18n';
import { format, parseISO } from 'date-fns';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), dateFormat(), { locale: dateFnsLocale() }); } catch { return d; }
}

interface RechnungenViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Rechnungen | null;
  onEdit: (record: Rechnungen) => void;
  auftraegeList: Auftraege[];
  kundenList: Kunden[];
}

export function RechnungenViewDialog({ open, onClose, record, onEdit, auftraegeList, kundenList }: RechnungenViewDialogProps) {
  function getAuftraegeDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return auftraegeList.find(r => r.record_id === id)?.fields.auftragsnummer ?? '—';
  }

  function getKundenDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return kundenList.find(r => r.record_id === id)?.fields.vorname ?? '—';
  }

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('view_entity', { entity: appLabel('rechnungen') })}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            {t('edit_button')}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('rechnungen', 'rechnungsnummer')}</Label>
            <p className="text-sm">{record.fields.rechnungsnummer ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('rechnungen', 'auftrag')}</Label>
            <p className="text-sm">{getAuftraegeDisplayName(record.fields.auftrag)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('rechnungen', 'kunde')}</Label>
            <p className="text-sm">{getKundenDisplayName(record.fields.kunde)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('rechnungen', 'nettobetrag')}</Label>
            <p className="text-sm">{record.fields.nettobetrag ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('rechnungen', 'mwst_satz')}</Label>
            <Badge variant="secondary">{lookupLabel('rechnungen', 'mwst_satz', record.fields.mwst_satz?.key) ?? record.fields.mwst_satz?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('rechnungen', 'bruttobetrag')}</Label>
            <p className="text-sm">{record.fields.bruttobetrag ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('rechnungen', 'rechnungsdatum')}</Label>
            <p className="text-sm">{formatDate(record.fields.rechnungsdatum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('rechnungen', 'faelligkeitsdatum')}</Label>
            <p className="text-sm">{formatDate(record.fields.faelligkeitsdatum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('rechnungen', 'status_rechnung')}</Label>
            <Badge variant="secondary">{lookupLabel('rechnungen', 'status_rechnung', record.fields.status_rechnung?.key) ?? record.fields.status_rechnung?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('rechnungen', 'pdf_anhang')}</Label>
            {record.fields.pdf_anhang ? (
              <MediaThumbnail src={record.fields.pdf_anhang} fit="contain" className="w-full rounded-lg border" />
            ) : <p className="text-sm text-muted-foreground">—</p>}
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.RECHNUNGEN} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}