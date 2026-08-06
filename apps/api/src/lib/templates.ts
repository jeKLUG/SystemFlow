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
        p("Standort / Objekt: "),
        p("Datum: "),
        p("Techniker: "),
        p("Dauer (Std.): "),
        h(2, "Durchgeführte Arbeiten"),
        bullet([
          "Updates / Patches geprüft und eingespielt",
          "Backups verifiziert (Erfolg / Alter / Restore-Test)",
          "Antivirus / EDR / Firewall-Status geprüft",
          "Hardware-Status / SMART / Lüfter / USV geprüft",
          "Freier Speicher / Ressourcen geprüft",
          "Ereignisprotokolle auf Auffälligkeiten geprüft",
        ]),
        h(2, "Festgestellte Auffälligkeiten"),
        p(""),
        h(2, "Empfehlungen / nächste Schritte"),
        p(""),
        h(2, "Material / Ersatzteile"),
        p(""),
        h(2, "Unterschrift / Freigabe"),
        p("Techniker: __________________  Kunde: __________________"),
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
        p("Projekt / Auftrag: "),
        p("Datum: "),
        p("Übergeben von: "),
        p("Übernommen von: "),
        h(2, "Übergebene Komponenten"),
        bullet([
          "Gerät / System (Typ, Seriennummer)",
          "Zubehör / Lizenzen",
          "Zugangsdaten (separat im Tresor hinterlegt)",
          "Dokumentation / Wiki-Seiten",
        ]),
        h(2, "Netzwerk & Zugänge"),
        bullet([
          "IP / Hostname",
          "Admin-Zugang getestet",
          "VPN / Remote-Zugang getestet",
          "Backup-Job eingerichtet",
        ]),
        h(2, "Funktionsprüfung"),
        p(""),
        h(2, "Offene Punkte"),
        p(""),
        h(2, "Bestätigung"),
        p(
          "Der Kunde bestätigt die Übernahme, die Funktionsprüfung und die Einweisung in die wesentlichen Bedienungen.",
        ),
        p("Unterschrift Kunde: __________________  Datum: __________"),
      ]),
    },
    {
      id: "handover_it",
      name: "IT-Übergabe (Arbeitsplatz)",
      description: "Neuer PC/Laptop oder Benutzer-Onboarding",
      type: "protocol",
      title: "IT-Übergabe Arbeitsplatz",
      content: doc([
        h(1, "IT-Übergabe – Arbeitsplatz"),
        p("Kunde / Firma: "),
        p("Benutzer: "),
        p("Datum: "),
        p("Techniker: "),
        h(2, "Gerät"),
        bullet([
          "Hersteller / Modell / Seriennummer",
          "Hostname",
          "Betriebssystem / Version",
          "Garantie bis",
        ]),
        h(2, "Einrichtung"),
        bullet([
          "Benutzerkonto / Anmeldung getestet",
          "E-Mail / Outlook eingerichtet",
          "Drucker / Scanner getestet",
          "VPN / MFA eingerichtet",
          "Office / Fachanwendungen installiert",
          "Backup / OneDrive / Profilmigration",
        ]),
        h(2, "Übergabe an Benutzer"),
        bullet([
          "Kurze Einweisung erfolgt",
          "Zugangsdaten übergeben (sicher)",
          "Support-Kontakt mitgeteilt",
        ]),
        h(2, "Offene Punkte"),
        p(""),
        h(2, "Bestätigung"),
        p("Benutzer: __________________  Techniker: __________________"),
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
        p("Gemeldet von: "),
        p("Priorität: "),
        p("Ticket / Referenz: "),
        h(2, "Beschreibung der Störung"),
        p(""),
        h(2, "Betroffene Systeme / Benutzer"),
        p(""),
        h(2, "Auswirkung"),
        bullet(["Produktivbetrieb eingeschränkt", "Einzelner Arbeitsplatz", "Nur kosmetisch"]),
        h(2, "Ursache"),
        p(""),
        h(2, "Maßnahmen / Lösung"),
        p(""),
        h(2, "Status"),
        bullet(["In Bearbeitung", "Behoben", "Workaround aktiv", "Wartet auf Kunde / Lieferant"]),
        h(2, "Nacharbeit / Prävention"),
        p(""),
      ]),
    },
    {
      id: "project_closeout",
      name: "Projektabschluss",
      description: "Abschluss und Abnahme eines Projekts",
      type: "protocol",
      title: "Projektabschluss / Abnahme",
      content: doc([
        h(1, "Projektabschluss / Abnahme"),
        p("Kunde: "),
        p("Projekt: "),
        p("Zeitraum: "),
        p("Projektleitung: "),
        h(2, "Leistungsumfang (Ist)"),
        bullet(["Umgesetzte Punkte", "Abweichungen vom Auftrag", "Nachträge"]),
        h(2, "Abnahmekriterien"),
        bullet(["Funktionstests bestanden", "Dokumentation übergeben", "Schulung / Einweisung erfolgt"]),
        h(2, "Offene Restpunkte"),
        p(""),
        h(2, "Übergabe an Betrieb / Support"),
        p(""),
        h(2, "Abnahme"),
        p(
          "Der Auftraggeber nimmt die Leistung ab. Bekannte Restpunkte sind oben dokumentiert.",
        ),
        p("Unterschrift Auftraggeber: __________________  Datum: __________"),
      ]),
    },
    {
      id: "onsite_visit",
      name: "Vor-Ort-Protokoll",
      description: "Kurzprotokoll eines Einsatzes vor Ort",
      type: "protocol",
      title: "Vor-Ort-Einsatzprotokoll",
      content: doc([
        h(1, "Vor-Ort-Einsatzprotokoll"),
        p("Kunde: "),
        p("Adresse / Standort: "),
        p("Datum / Uhrzeit: "),
        p("Techniker: "),
        p("Anwesend seitens Kunde: "),
        h(2, "Anlass / Auftrag"),
        p(""),
        h(2, "Durchgeführte Arbeiten"),
        p(""),
        h(2, "Ergebnis"),
        p(""),
        h(2, "Empfehlungen"),
        p(""),
        h(2, "Nächster Termin / Follow-up"),
        p(""),
      ]),
    },
  ];
}

/** Findet eine Vorlage anhand der ID. */
export function getTemplate(id: string): DocTemplate | undefined {
  return listTemplates().find((t) => t.id === id);
}
