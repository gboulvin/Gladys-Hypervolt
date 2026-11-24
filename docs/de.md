# Hypervolt

Steuern Sie Ihre [Hypervolt](https://www.hypervolt.co.uk)-Wallboxen (Home 2.0,
Home 3.0, Home 3 Pro) mit Gladys Assistant: Ladevorgänge starten und stoppen,
den Lademodus wählen, den Strom begrenzen, die Wallbox sperren und die
Ladeleistung sowie die Energie jeder Sitzung live verfolgen.

Gladys stellt diese Seite bereit und verlinkt sie im Bildschirm
**Konfiguration** der Integration.

## Funktionsweise

Hypervolt-Wallboxen haben keine lokale API: Die Integration kommuniziert über
die **Hypervolt-Cloud** mit ihnen, genau wie die Hypervolt-App. Gladys braucht
daher eine Internetverbindung, und die Wallbox muss online sein (WLAN oder
Ethernet in der Hypervolt-App eingerichtet). Die Gerätekarten zeigen ein
**Cloud**-Abzeichen, rot, wenn die Wallbox nicht erreichbar ist.

Die Integration hält pro Wallbox eine Live-Verbindung: Änderungen erscheinen
innerhalb von Sekunden in Gladys, ohne Abfrageintervall.

## Konfiguration

1. Öffnen Sie den Reiter **Konfiguration** der Integration.
2. Geben Sie die **E-Mail-Adresse** und das **Passwort** Ihres
   Hypervolt-Kontos ein (dieselben wie in der Hypervolt-App). Das Passwort
   wird als Geheimnis gespeichert.
3. Speichern Sie und klicken Sie auf **Verbindung testen**: Die Meldung nennt
   die Anzahl der gefundenen Wallboxen.
4. Öffnen Sie den Reiter **Erkennung** und fügen Sie Ihre Wallboxen hinzu.

## Funktionen pro Wallbox

| Funktion            | Beschreibung                                                          |
| ------------------- | --------------------------------------------------------------------- |
| Laden               | Ladevorgang starten (an) oder stoppen (aus)                           |
| Fahrzeug angesteckt | Ob ein Fahrzeug angeschlossen ist                                     |
| Ladeleistung        | An das Fahrzeug abgegebene Leistung, in W                             |
| Ladestrom           | An das Fahrzeug abgegebener Strom, in A                               |
| Spannung            | Versorgungsspannung, in V                                             |
| Sitzungsenergie     | Energie der laufenden (oder letzten) Sitzung, in kWh                  |
| Maximalstrom        | Stromgrenze, von 6 bis 32 A                                           |
| Sperre              | Eine gesperrte Wallbox startet keinen neuen Ladevorgang               |
| Lademodus           | Boost (volle Leistung), Eco oder Super Eco (folgen dem PV-Überschuss) |
| LED-Helligkeit      | Helligkeit des LED-Rings, in %                                        |
| Hausverbrauch       | Verbrauch des Hauses (Wallbox mit Stromzange)                         |
| Netzleistung        | Netzbezug, negativ bei Einspeisung (Stromzange)                       |
| Solarerzeugung      | PV-Erzeugung (Stromzange)                                             |

Haus-, Netz- und Solarwerte werden nur bei einer Wallbox mit den optionalen
Stromzangen aktualisiert.

## Szenen

Die Integration fügt dem Szenen-Editor (Gladys 5.1 oder neuer) eigene Karten
in der Kategorie **Integrationen** hinzu.

Auslöser — optional auf eine Wallbox beschränkt:

- **Fahrzeug angesteckt**;
- **Fahrzeug abgesteckt** — `{{triggerEvent.data.session_energy_kwh}}`
  enthält die Energie der Sitzung;
- **Laden gestartet** — `{{triggerEvent.data.charge_mode}}` enthält den Modus
  (`boost`, `eco`, `super_eco`);
- **Laden beendet** (fertig, gestoppt oder pausiert) —
  `{{triggerEvent.data.session_energy_kwh}}` enthält die Energie der Sitzung.

Aktionen — jede gibt `success` zurück, damit die folgenden Aktionen davon
abhängen können:

- **Laden starten** / **Laden stoppen**;
- **Lademodus einstellen** (Boost, Eco, Super Eco) — zum Beispiel Boost im
  Niedertarif, Eco den Rest des Tages;
- **Maximalstrom einstellen** (6 bis 32 A) — zum Beispiel, um bei hohem
  Hausverbrauch unter der Anschlussleistung zu bleiben;
- **Wallbox sperren oder entsperren**.

Die Gerätefunktionen funktionieren auch mit den Standard-Auslösern und
-Aktionen von Gladys („Gerätezustand“, „Gerät steuern“).

## Dashboard

Fügen Sie das Widget **Hypervolt-Wallbox** einem Dashboard hinzu:
Ladeleistung, Sitzungsenergie und Maximalstrom live, Zustand von Fahrzeug und
Ladevorgang, Lademodus, Sperre und Cloud-Verbindung, mit den Tasten
**Laden starten/stoppen**, **Boost** und **Eco**. Bei mehreren Wallboxen
wählen Sie eine in den Widget-Einstellungen.

## Fehlerbehebung

- **„Hypervolt hat die E-Mail-Adresse oder das Passwort abgelehnt“** — prüfen
  Sie sie in der Hypervolt-App und speichern Sie die Konfiguration erneut.
- **„Die Hypervolt-Cloud ist nicht erreichbar“** — die Integration versucht es
  jede Minute erneut; prüfen Sie die Internetverbindung von Gladys.
- **Rotes Abzeichen „nicht erreichbar“** — die Wallbox ist nicht mit der
  Hypervolt-Cloud verbunden: prüfen Sie ihre Verbindung in der Hypervolt-App.
- **Super Eco „battery safe“** — diese Variante wird als Super Eco angezeigt.

Details finden Sie in den Protokollen der Integration in der Gladys-Oberfläche
(Passwörter und Tokens werden nie protokolliert).

Diese Integration steht in keiner Verbindung zu Hypervolt Ltd und wird nicht
von Hypervolt Ltd unterstützt.
