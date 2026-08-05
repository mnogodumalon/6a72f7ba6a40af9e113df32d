import type { JahresinspektionPlanen, Fahrzeuge } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { APP_IDS } from '@/types/app';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { IconPencil } from '@tabler/icons-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy', { locale: de }); } catch { return d; }
}

interface JahresinspektionPlanenViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: JahresinspektionPlanen | null;
  onEdit: (record: JahresinspektionPlanen) => void;
  fahrzeugeList: Fahrzeuge[];
}

export function JahresinspektionPlanenViewDialog({ open, onClose, record, onEdit, fahrzeugeList }: JahresinspektionPlanenViewDialogProps) {
  function getFahrzeugeDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return fahrzeugeList.find(r => r.record_id === id)?.fields.kennzeichen ?? '—';
  }

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Jahresinspektion planen anzeigen</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            Bearbeiten
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Fahrzeug</Label>
            <p className="text-sm">{getFahrzeugeDisplayName(record.fields.fahrzeug)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Wunschtermin</Label>
            <p className="text-sm">{formatDate(record.fields.wunschtermin_inspektion)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Arbeitsbeschreibung</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.arbeitsbeschreibung_inspektion ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Bemerkungen</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.bemerkungen_inspektion ?? '—'}</p>
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.JAHRESINSPEKTION_PLANEN} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}