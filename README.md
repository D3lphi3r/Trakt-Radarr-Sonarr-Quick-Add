# <img width="32" height="32" alt="image" src="https://github.com/user-attachments/assets/1b92ff6c-b7c2-4b39-b127-7bac6845e690" /> Trakt → Radarr/Sonarr Quick Add

Unofficial Chrome extension (not affiliated with Trakt, Radarr, or Sonarr).

Add movies and TV shows from Trakt directly to your Radarr/Sonarr server with a single click.
Optionally, authenticate with Trakt and auto-add newly added items to a selected Trakt list for review/audit.

## Features
- One-click add from Trakt movie/show pages
- Works with self-hosted Radarr and Sonarr
- Friendly messages (e.g., “This movie has already been added”)
- Optional Trakt OAuth:
  - Fetch your lists
  - Auto-add to a selected list

## Installation
 - [From Chrome Web Store - Extensions](https://chromewebstore.google.com/detail/trakt-%E2%86%92-radarrsonarr-quic/beigcidhhhefbpnfkibbcfinchilllfb)
- Developer / Unpacked
  1. Clone this project  
  2. Open Chrome → Extensions → Enable “Developer mode”
  3. Click “Load unpacked”
  4. Select the extension folder (the one containing `manifest.json`)

## Setup
1. Open extension Settings
2. Configure Radarr first (URL + API key) → click Test
3. Configure Sonarr (URL + API key) → click Test
4. (Optional) Trakt:
   - Open Trakt Auth
   - Paste code
   - Check Auth (auto-fetches lists)
   - Select list
   - Enable “Auto add to Trakt list” if desired
  
## Screenshots
<img width="973" height="548" alt="image" src="https://github.com/user-attachments/assets/e0d325fe-a8b5-4c23-a609-5b5ae2e15787" />
<img width="968" height="517" alt="image" src="https://github.com/user-attachments/assets/c7492233-af01-4799-816b-cb0b40680a41" />
<img width="1280" height="494" alt="image" src="https://github.com/user-attachments/assets/7dbee4c0-d88f-413f-be5b-cf450a7fef77" />
<img width="1280" height="520" alt="image" src="https://github.com/user-attachments/assets/28f6e3f6-d41d-4671-ae81-92c6885453cb" />
<img width="1280" height="498" alt="image" src="https://github.com/user-attachments/assets/5135a370-6796-40cd-96b2-a6e930eea92c" />

## Privacy
- No middleware/backend server.
- Requests are sent only to:
  - Trakt API (if enabled), and
  - the Radarr/Sonarr URL you configured.
- Credentials (API keys/tokens) are stored in Chrome extension storage.

See: [PRIVACY.md](https://github.com/D3lphi3r/Trakt-Radarr-Sonarr-Quick-Add/blob/main/PRIVACY.md)

## Support
contact@d3lphi3r.com

## License
MIT (see `LICENSE`)
