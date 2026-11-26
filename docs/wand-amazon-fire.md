# Wandanzeige mit einem Amazon-Fire-Tablet

Entwurf, noch nicht an echter Hardware geprüft. Dauer: ca. 20 Minuten.

## Was du brauchst

- Ein Fire-Tablet (Fire HD 8 oder 10 ab etwa 2019 ist am sichersten, ältere siehe „Probleme“)
- Netzteil mit langem Kabel, Wandhalterung oder Klebe-Halterung
- WLAN

## 1. Tablet vorbereiten

1. Einstellungen › Gerätoptionen › Systemupdates: alle Updates installieren.
2. Einstellungen › Gerätoptionen › Info: Modell und Fire-OS-Version notieren (für Fragen).
3. Einstellungen › Anzeige › Bildschirm-Timeout: auf den längsten Wert.
4. Optional: Werbung auf dem Sperrbildschirm abschalten (Amazon-Konto › Inhalte und Geräte › Gerät › Spezialangebote).

## 2. Mit der Familie verbinden

1. Im Browser „Silk“ öffnen: https://christoph589.github.io/Family/
2. Als Elternteil mit dem Familiencode verbinden (wie auf jedem neuen Gerät).
3. Prüfen, ob „Heute“ und der Kalender laden.

## 3. Fully Kiosk Browser installieren

1. Im Amazon Appstore nach „Fully Kiosk Browser“ suchen.
   Falls es dort fehlt: Einstellungen › Sicherheit und Datenschutz › „Apps aus unbekannten Quellen“ für Silk erlauben, dann in Silk die Seite fully-kiosk.com öffnen und die APK von dort laden. Nur von dieser offiziellen Seite.
2. Fully öffnen und Folgendes einstellen:
   - Web Content Settings › Start URL: `https://christoph589.github.io/Family/?wand`
   - Device Management › Keep Screen On: an
   - Device Management › Launch on Boot: an
   - Web Browsing Settings › Pull to Refresh: aus (sonst lädt die Seite beim Wischen neu)
3. Mit der Plus-Lizenz (einmalig ca. 8 €, lohnt sich):
   - Kiosk Mode: an, mit eigener PIN. Dann kommen Kinder nicht aus der App.
   - Motion Detection: an. Der Bildschirm wacht auf, wenn jemand davor steht.

Die Verbindung zur Familie aus Schritt 2 gilt nur für Silk. In Fully einmal erneut verbinden: Start-URL kurz ohne `?wand` aufrufen, verbinden, dann wieder `?wand` eintragen.

## 4. Was die App selbst erledigt

- `?wand` startet direkt in der Wandansicht. Beenden nur mit Eltern-PIN.
- Von 21 bis 6 Uhr wird der Bildschirm schwarz mit Uhrzeit, Antippen weckt ihn für 2 Minuten.
- Nach einem WLAN-Ausfall und jede Nacht um 3:30 Uhr lädt sich die Seite neu und holt so auch Updates.

## 5. Akku schonen

Fire-Tablets haben keine Ladegrenze. Bei Dauerstrom kann sich der Akku nach 1 bis 2 Jahren aufblähen.
Abhilfe: Netzteil an eine Zeitschaltuhr oder smarte Steckdose, z. B. 2 mal täglich 2 Stunden laden. Sieht der Rahmen gewölbt aus, sofort vom Strom nehmen.

## Probleme

- **Weiße Seite mit „Loading…“ in Fully:** Das Web-Bundle wird seit Nov. 2026 für ältere WebViews übersetzt (scripts/legacy-web.js). Fully einmal ganz schließen, Cache leeren (Fully › Settings › Advanced Web Settings › Clear Cache) und neu laden.
- **Weiße Seite trotzdem:** Das Tablet ist vermutlich zu alt (Fire OS 5 oder älter). Die eingebaute Browser-Technik kann die App dann nicht ausführen. Modell und Fire-OS-Version melden.
- **Bildschirm geht trotzdem aus:** In Fully „Keep Screen On“ prüfen, und unter Fire-Einstellungen › Akku „Energiesparmodus“ ausschalten.
