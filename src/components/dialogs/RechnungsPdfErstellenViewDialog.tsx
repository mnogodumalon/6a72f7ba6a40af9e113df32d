import type { RechnungsPdfErstellen, Rechnungen } from '@/types/app';
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
import { IconPencil, IconFileText } from '@tabler/icons-react';

interface RechnungsPdfErstellenViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: RechnungsPdfErstellen | null;
  onEdit: (record: RechnungsPdfErstellen) => void;
  rechnungenList: Rechnungen[];
}

export function RechnungsPdfErstellenViewDialog({ open, onClose, record, onEdit, rechnungenList }: RechnungsPdfErstellenViewDialogProps) {
  function getRechnungenDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return rechnungenList.find(r => r.record_id === id)?.fields.rechnungsnummer ?? '—';
  }

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rechnungs-PDF erstellen anzeigen</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            Bearbeiten
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Rechnung</Label>
            <p className="text-sm">{getRechnungenDisplayName(record.fields.rechnung)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Rechnungsnummer</Label>
            <p className="text-sm">{record.fields.pdf_rechnungsnummer ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Vorname des Kunden</Label>
            <p className="text-sm">{record.fields.pdf_kunde_vorname ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nachname des Kunden</Label>
            <p className="text-sm">{record.fields.pdf_kunde_nachname ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nettobetrag (€)</Label>
            <p className="text-sm">{record.fields.pdf_nettobetrag ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Bruttobetrag (€)</Label>
            <p className="text-sm">{record.fields.pdf_bruttobetrag ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">PDF-Dokument</Label>
            {record.fields.pdf_datei ? (
              <MediaThumbnail src={record.fields.pdf_datei} fit="contain" className="w-full rounded-lg border" />
            ) : <p className="text-sm text-muted-foreground">—</p>}
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.RECHNUNGS_PDF_ERSTELLEN} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}