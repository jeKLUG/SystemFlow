# Android-App (WebView)

Einfache Android-Hülle um die Systemhaus-Ess Web-App – ohne Browser-Chrome.

## Voraussetzungen

- [Android Studio](https://developer.android.com/studio) (enthält JDK + SDK)
- Laufende Systemhaus-Ess-Instanz im gleichen Netz (z. B. `http://192.168.x.x:8081`)

## Server-URL setzen

1. In `gradle.properties` die Zeile `app.url=...` anpassen **oder**
2. Nach dem ersten Start im Menü **Server-URL** die Adresse eingeben

Beispiel:

```properties
app.url=http://217.154.167.140:8081
```

HTTP im LAN ist erlaubt (`usesCleartextTraffic`).

## APK bauen

1. Android Studio öffnen → **Open** → Ordner `apps/android-app`
2. Gradle-Sync abwarten (Projekt nutzt **Gradle 9.1** – kompatibel mit JDK 17–25)
3. Falls die IDE noch eine alte Gradle-JVM meldet: **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK** auf Embedded JDK oder 17/21/25 stellen
4. Menü **Build → Build Bundle(s) / APK(s) → Build APK(s)**
5. Fertige Datei:

`apps/android-app/app/build/outputs/apk/debug/app-debug.apk`

Debug-APK reicht zum internen Nutzen. Signiertes Release:

**Build → Generate Signed Bundle / APK**

## Kommandozeile (mit installiertem SDK)

```bash
cd apps/android-app
# Windows PowerShell:
.\gradlew.bat assembleDebug
```

Gradle Wrapper wird beim ersten Öffnen in Android Studio erzeugt, falls noch nicht vorhanden.

## Funktionen

- WebView mit Cookies/Session (Login bleibt erhalten)
- Zurück-Taste = Web-History
- Datei-Upload (Wiki/Anhänge)
- Offline-Hinweis mit Retry + URL ändern
- Menü: Neu laden, Startseite, Server-URL
