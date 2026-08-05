/**
 * Eingebaute TipTap-Dokumentvorlagen für Systemhaus-Ess.
 */

export interface DocTemplate {
  id: string;
  name: string;
  description: string;
  type: "note" | "protocol" | "documentation";
  title: string;
  content: string;
}

function doc(blocks: unknown[]) {
  return JSON.stringify({ type: "doc", content: blocks });
}

function h(level: 1 | 2 | 3, text: string) {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

function p(text = "") {
  return text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };
}

function bullet(items: string[]) {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [p(item)],
    })),
  };
}

/** Liefert alle verfügbaren Dokumentvorlagen. */
export function listTemplates(): DocTemplate[] {
  return [
    {
      id: "maintenance",
      name: "Wartungsprotokoll",
      description: "Regelmäßige Wartung / Checkliste",
      type: "protocol",
      title: "Wartungsprotokoll",
      content: doc([
        h(1, "Wartungsprotokoll"),
        p("Kunde: "),
        p("Datum: "),
        p("Techniker: "),
        h(2, "Durchgeführte Arbeiten"),
        bullet([
          "Updates / Patches geprüft",
          "Backups verifiziert",
          "Sicherheitshinweise geprüft",
          "Hardware-Status geprüft",
        ]),
        h(2, "Festgestellte Auffälligkeiten"),
        p(""),
        h(2, "Empfehlungen / nächste Schritte"),
        p(""),
        h(2, "Unterschrift / Freigabe"),
        p(""),
      ]),
    },
    {
      id: "handover",
      name: "Übergabe",
      description: "Geräte- oder Projektübergabe an den Kunden",
      type: "protocol",
      title: "Übergabeprotokoll",
      content: doc([
        h(1, "Übergabeprotokoll"),
        p("Kunde: "),
        p("Datum: "),
        p("Übergeben von / an: "),
        h(2, "Übergebene Komponenten"),
        bullet(["Gerät / System", "Zugangsdaten (separat hinterlegt)", "Dokumentation"]),
        h(2, "Funktionsprüfung"),
        p(""),
        h(2, "Offene Punkte"),
        p(""),
        h(2, "Bestätigung"),
        p("Der Kunde bestätigt die Übernahme und Einweisung."),
        p(""),
      ]),
    },
    {
      id: "incident",
      name: "Störungsbericht",
      description: "Aufnahme und Lösung einer Störung",
      type: "protocol",
      title: "Störungsbericht",
      content: doc([
        h(1, "Störungsbericht"),
        p("Kunde: "),
        p("Gemeldet am: "),
        p("Priorität: "),
        h(2, "Beschreibung der Störung"),
        p(""),
        h(2, "Betroffene Systeme"),
        p(""),
        h(2, "Ursache"),
        p(""),
        h(2, "Maßnahmen / Lösung"),
        p(""),
        h(2, "Status"),
        bullet(["In Bearbeitung", "Behoben", "Workaround aktiv"]),
        h(2, "Nacharbeit"),
        p(""),
      ]),
    },
  ];
}

/** Findet eine Vorlage anhand der ID. */
export function getTemplate(id: string): DocTemplate | undefined {
  return listTemplates().find((t) => t.id === id);
}
