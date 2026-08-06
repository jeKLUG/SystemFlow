# Android-App (WebView)

Die Android-App unter [`apps/android-app`](../apps/android-app) ist eine schlanke Hülle: sie öffnet die Systemhaus-Ess-Web-App in einer WebView (kein zusätzlicher Browser nötig).

## Aufbau

| Teil | Beschreibung |
|------|----------------|
| Paket | `de.systemhausess.app` |
| Start-URL | `BuildConfig.DEFAULT_APP_URL` aus `gradle.properties` (`app.url`) |
| Persistenz | SharedPreferences `systemhaus_shell` / `app_url` |
| Cleartext | HTTP im LAN erlaubt (`network_security_config.xml`) |

## APK erzeugen

Siehe [apps/android-app/README.md](../apps/android-app/README.md). Kurzfassung: Projekt in Android Studio öffnen → **Build APK(s)**.

Toolchain: **AGP 8.7.3** + **Gradle 8.9** (max. unterstützt von vielen Android-Studio-Versionen). Gradle-Daemon mit **JDK 17** betreiben, nicht mit JDK 25.

Auf dem Entwicklungsrechner ohne JDK/Android-SDK kann die APK hier nicht kompiliert werden; der Build läuft lokal in Android Studio oder über CI.

## Hinweise

- Handy und Server müssen sich erreichen (gleiche WLAN-/VPN-Zone oder öffentliche HTTPS-URL).
- Cookies bleiben in der WebView; Logout in der Web-App beendet die Session.
- Externe Links (andere Hosts) öffnen die System-App (Browser/Mail/…).
