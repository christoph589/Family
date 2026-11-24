# Familienplaner (Testversion 0.1)

Aufgabenboard für Kinder mit Bestätigung durch Eltern, Punkten, Belohnungen und Noten.
Ein Code für iOS, Android und Web (Expo SDK 58).

## Stand
- Familie anlegen mit Eltern-PIN und Kindern
- Profilwahl: Kind sieht nur eigene Aufgaben, Eltern (PIN) sehen alle
- Aufgaben: nur heute, Mo bis Fr, täglich. Kind hakt ab, Eltern bestätigen, dann Punkte
- Punkte: Belohnungen einlösen (nur Eltern), Verlauf
- Noten: Arbeit eintragen, Punkte nach Note (1=40, 2=30, 3=15, 4=5, 5/6=0)
- Speicherung: lokal auf dem Gerät (AsyncStorage). Kein Sync zwischen Geräten.

## Nächste Schritte
1. Supabase-Projekt (EU) anlegen, `supabase/schema.sql` einspielen, Adapter für `DataStore` schreiben, Login für Eltern
2. Tages-Quiz: Thema und Foto hochladen, Fragen per KI serverseitig (Supabase Edge Function)
3. Expo Router einführen, sobald mehr Screens dazukommen

## Starten
```bash
npm install
npx expo start        # App auf dem Handy mit Expo Go testen
npx expo export -p web  # Web-Version nach dist/
```
