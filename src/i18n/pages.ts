/**
 * src/i18n/pages.ts — page-text catalog (GENERATED — rewritten by the build
 * pipeline after every agent phase). NEVER edit, NEVER import directly:
 * the runtime reads it through tx() from '@/i18n'.
 *
 * Shape: { [locale]: { [sourceText]: translation } }. The build language
 * resolves to the source text itself and has no entry here; a missing key
 * falls back to the source text (fail-open).
 */
export const PAGES: Record<string, Record<string, string>> = {
  "en": {
    "Abschließen": "Complete",
    "Alle Aufträge abgeschlossen — super!": "All orders completed — great!",
    "Als bezahlt markieren": "Mark as paid",
    "Bevorstehende Inspektionen": "Upcoming Inspections",
    "Bezahlt": "Paid",
    "Ersten Auftrag erstellen": "Create First Order",
    "Ersten Kunden anlegen": "Create First Customer",
    "Fahrzeuge": "Vehicles",
    "In Bearbeitung": "In Progress",
    "In Bearbeitung nehmen": "Start Processing",
    "Inspektion planen": "Schedule Inspection",
    "Keine geplanten Inspektionen": "No scheduled inspections",
    "Keine offenen Rechnungen": "No open invoices",
    "Keine überfälligen Rechnungen": "No overdue invoices",
    "Kunden": "Customers",
    "Lege deinen ersten Kunden und Auftrag an, um loszulegen.": "Create your first customer and order to get started.",
    "Neue Rechnung": "New Invoice",
    "Neuer Auftrag": "New Order",
    "Noch keine Aufträge erfasst — starte jetzt mit dem ersten Auftrag.": "No orders recorded yet — start now with the first order.",
    "Nächste Fälligkeit: {0}": "Next due date: {0}",
    "Offen": "Open",
    "Rechnungen offen": "Open Invoices",
    "Werkstatt einrichten": "Set Up Workshop",
    "{0} in Bearbeitung — {1} offen.": "{0} in progress — {1} open.",
    "{0} offene Aufträge warten auf Bearbeitung.": "{0} open orders are waiting to be processed.",
    "{0} — bezahlt": "{0} — paid",
    "{0} — {1}": "{ 0} — {1}",
    "Überfällig": "Overdue",
    "Überfällige Rechnungen": "Overdue Invoices",
    "— Rechnung überfällig seit": "— Invoice overdue since",
    "✓ Als bezahlt markieren": "✓ Mark as paid",
    "✓ Bezahlt": "✓ Paid"
  }
};
