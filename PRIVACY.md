# Privacy Policy — Trakt → Radarr/Sonarr Quick Add

Last updated: 2026-01-31

This Chrome extension (“the Extension”) lets you add movies and TV shows from Trakt directly to your own Radarr/Sonarr server, and optionally mirror those items to a Trakt list for review.

## Summary (Plain English)
- The Extension does **not** run any developer-operated backend server.
- The Extension does **not** sell data, run ads, or track your browsing history.
- Network requests are sent **only** to:
  1) Trakt API (if you enable Trakt features), and
  2) the Radarr/Sonarr URL you configure in Settings.

## Data the Extension handles
The Extension may handle the following user-provided data:
- **Radarr/Sonarr API key** and **server URL** (entered by you).
- **Trakt OAuth tokens** (if you choose to authenticate with Trakt).
- **Content identifiers** (e.g., Trakt/TMDB/TVDB IDs) required to add the selected movie/show.

## Where data is stored
- Settings and credentials are stored using Chrome’s extension storage (local and/or sync).
- If you have Chrome Sync enabled, Chrome may synchronize some settings across your devices under your Google account. This synchronization is controlled by Chrome, not by the Extension developer.

## How data is used
- Radarr/Sonarr credentials are used only to call your configured Radarr/Sonarr server endpoints to add items.
- Trakt tokens are used only to call Trakt endpoints you enable (authentication, list fetching, optional list auto-add).

## Data sharing / transfers
The Extension does not send your data to any developer-controlled server.
Your data is shared only with:
- **Trakt** (when you enable Trakt features), and
- **Your own Radarr/Sonarr server** (the URL you configure).

## Security
- The Extension uses HTTPS when available.
- You should protect your Radarr/Sonarr instance (TLS, authentication, firewall). Avoid exposing it publicly unless you understand the risks.

## Data retention & deletion
- You can delete all Extension data by removing the Extension from Chrome.
- You can also clear stored settings via the Extension’s Settings page (where applicable) or by clearing extension storage in Chrome.

## Contact
For privacy questions or support:
contact@aljohani.sa

## Limited Use disclosure
The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.
