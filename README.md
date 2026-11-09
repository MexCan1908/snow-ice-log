# Snow & Ice Log

A phone-friendly snow and ice log for condo staff. Staff record patrols, plowing, salting, hazards and slip/fall incidents. Entries are saved to a Google Sheet you own. The 7-day forecast for the building loads live from [Open-Meteo](https://open-meteo.com) and flags days that need plowing, pre-salting or refreeze watch.

Hosted free on GitHub Pages. Staff need no accounts, only a staff PIN.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The web app |
| `config.js` | Your settings: Google Sheet link, building name, forecast location |
| `apps-script/Code.gs` | The script that connects the app to your Google Sheet |
| `manifest.webmanifest`, `icon.svg` | Lets staff add the app to their phone's home screen |

## Setup (about 10 minutes)

### 1. Create the Google Sheet backend

1. Go to [sheets.new](https://sheets.new) and name the sheet **Snow & Ice Log**.
2. Click **Extensions → Apps Script**.
3. Delete the sample code, paste in everything from `apps-script/Code.gs`, and click **Save**.
4. Click **Project Settings** (gear icon) → **Script Properties** → **Add script property**:
   - Property: `STAFF_PIN`
   - Value: the PIN staff will type, e.g. `4827`
   - Click **Save script properties**.
5. Click **Deploy → New deployment**. Choose type **Web app**, then set:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy**, approve the permissions prompt, and copy the **Web app URL**. It ends in `/exec`.

The script creates a **Log** tab the first time someone saves an entry.

### 2. Connect the app

Open `config.js` and paste the URL into `scriptUrl`:

```js
scriptUrl: "https://script.google.com/macros/s/XXXXXXXX/exec",
building: "MTCC 1234 · 55 Example St",
```

To change the forecast location, set `latitude` and `longitude` (right-click the building in Google Maps to copy them).

### 3. Turn on GitHub Pages

In the repository on GitHub, go to **Settings → Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, choose branch **main** and folder **/ (root)**, then click **Save**. About a minute later the app is live at:

`https://<your-username>.github.io/<repo-name>/`

### 4. Give it to staff

Send staff the link and the PIN. On their phone:

- **iPhone (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** ⋮ menu → **Add to Home screen**

Each phone remembers the PIN after the first time.

## Changing things later

- **New PIN** (for example, when someone leaves): change `STAFF_PIN` in Script Properties. Every phone is asked for the new PIN on its next load.
- **Change the script**: after editing `Code.gs`, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. This keeps the same URL.
- **Records**: the Google Sheet is the master record. Download it or share it read-only with the property manager or insurer.

## Security notes

- The repository is public, so anyone can see the app's code and the Google Script URL. Without the PIN they can't read or add entries.
- The PIN is shared by all staff and is not a personal login. The **Done by** field records who did each task.
- Don't put personal health details in incident notes. Record what happened and where, and keep injury details in your formal incident report.

## Legal references

Shown in the app as a quick reminder. Check the current text before relying on them:

- Toronto Municipal Code Ch. 719: clear sidewalks of snow and ice within 12 hours after a snowfall ends.
- Occupiers' Liability Act, R.S.O. 1990, c. O.2, s. 3 (duty of care) and s. 6.1 (60-day written notice for snow and ice injury claims).
- Ontario Fire Code, O. Reg. 213/07, Div. B, 2.5.1 (fire department access) and 2.7.1 (means of egress).
