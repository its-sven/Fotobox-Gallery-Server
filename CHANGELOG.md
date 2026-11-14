# Changelog

## 2.1.0 – 2026-11-14

- **Fix:** „Neu“-Markierung – beim Nachladen (Scrollen / „Weitere Fotos laden“) wurden ältere Fotos fälschlich als neu markiert. „Neu“ gilt jetzt für Fotos der letzten 10 Minuten (Serverzeit) und alles, was während des Besuchs dazukommt; die Markierung läuft automatisch ab.
- **Fix:** Vollbildansicht schloss sich bei einem Klick knapp neben die Pfeile. Die Blätter-Flächen reichen jetzt über die ganze Bildhöhe, geschlossen wird nur noch über × oder Esc. Auch auf dem Handy kann am Rand getippt werden.
- Nachladen beim Scrollen funktioniert auch, wenn der IntersectionObserver nicht auslöst.
- Neues Projekt-Logo; wird als Standard-Favicon und Home-Bildschirm-Icon genutzt.
- Fertiges Docker-Image auf GitHub Container Registry (`ghcr.io/its-sven/fotobox-gallery-server`, amd64 + arm64); Installation ohne Klonen des Repos.
- GitHub Actions: CI mit Smoke-Test, automatischer Image-Build.
- README mit Screenshots, Betriebsbeispielen und Diagrammen; MIT-Lizenz.
- Dev-Server läuft auf Port 3001 (kollidiert nicht mehr mit dem Container auf 3000).

## 2.0.0 – 2026-10-31

- Neuaufbau in Modulen (ESM, Express 5), neues Design mit Hell/Dunkel.
- WebP-Vorschaubilder, Hintergrund-Erzeugung, Nachladen beim Scrollen, Live-Aktualisierung.
- Docker-Entrypoint korrigiert Rechte automatisch, App läuft ohne root.
- Regeln und Live-Prüfung für den URL-Namen, QR-Codes, Rate-Limits, CSP.
