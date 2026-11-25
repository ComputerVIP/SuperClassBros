# Super Class Bros

A hidden multiplayer game that runs on top of a fake Canvas LMS dashboard. The course cards, to-do items and buttons are the platforms. Everything runs in the browser, so it works on GitHub Pages with no server of our own.

## Play

1. Open the site.
2. Click the star inside the **A** of **UCAS** (top right), or press the backtick key (`` ` ``).
3. A menu appears at the bottom of the screen. Press the backtick again, or click **×**, to leave.

Share a room by adding it to the link: `https://YOUR-SITE/?mode=fight&room=MYROOM`

## Server types

| Type | What it is |
|---|---|
| **Tag** | Movement only. One player is IT and passes it on by touching someone. No health, no fighting. |
| **Fight** | Health, attacks, guard and K.O.s. No IT. Runners are solid to each other. |
| **Platformer** | In progress. Shown in the menu but not playable yet. |

The same room name in Tag and in Fight is two different servers. Use the **Lobby** button to see who is playing where.

## Controls

| Action | Keys |
|---|---|
| Move | `A` `D` or arrow keys |
| Jump (double jump, wall jump) | `W`, `Up` or `Space` |
| Dive in mid-air / drop through a ledge | `S` or `Down` |
| Grapple hook (locks onto the nearest card) | `E`, `Q`, `/` or `Enter` |
| Grapple straight up | `F` or `.` |
| Dash | `Shift`, `C`, `M`, or double-tap left or right |
| Hide / show the menu | `H` |
| Game on / off | `` ` `` |

Fight mode only: `J` or `X` for a 3-hit combo, hold `K` then release for a charged heavy attack, hold `L` to guard.

While hooked, left and right pump the swing, `W` reels the rope in, `S` lets it out, and jumping releases it.

## Menu buttons

- **Style**: name and color.
- **Room box and server type**: type a room code and press Enter, or change the server type.
- **Lobby**: browse and join active rooms, or create one.
- **Chat**: opens the room chat. A red dot means unread messages.
- **Bot: ON/OFF**: the practice bot. It switches off by itself when a real player joins.
- **Bot: Normal / Always IT** (Tag only): Always IT makes the bot chase you forever so you can practice running.
- **Cam: ON/OFF** (Fight only): slight zoom with a lazy follow camera.
- **–**: hides the menu. Click the **Menu** tab at the bottom to bring it back.

Scrolling the page changes your map, and other players' maps are not affected.

## Files

| File | What is in it |
|---|---|
| `index.html` | The page and the game menus |
| `style.css` | Styles |
| `engine.js` | Game rules: config, physics, collision, Fight, Tag, bot, camera, drawing |
| `online.js` | Networking and player snapshots |
| `app.js` | Menus, chat, keyboard, the fake dashboard, start/stop |

## Tweaking

Search for these names in the files.

| What | Where |
|---|---|
| Dash cooldown, jump, gravity, grapple range | top of `engine.js` (`DASH_COOLDOWN`, `JUMP_VEL`, `GRAVITY`, `MAX_GRAPPLE_DIST`) |
| Camera zoom and how lazy the follow is | `CAM_ZOOM` and `CAM_FOLLOW` in `engine.js` |
| Solid cards or one-way cards | `SOLID_CARDS` in `engine.js` |
| Space between course cards | `gap-[44px]` on the `course-grid` section in `index.html` |

## Run it on your computer

Browsers block the scripts if you double-click `index.html`, so serve the folder instead. In a terminal inside the project folder:

```
python -m http.server 8000
```

Then open `http://localhost:8000`. If you don't have Python, run `npx serve` instead.

## Put it on GitHub Pages

1. Make sure the folder holds only the files above. **No screenshots, schedules, photos or anything personal.** Everything uploaded to a public repo is public, and deleting it later doesn't reliably take it back.
2. On GitHub, click **New repository**. Name it, choose **Public**, and leave "Add a README" unticked.
3. On the empty repo page, click **uploading an existing file**.
4. Drag in the individual files (not the parent folder), then click **Commit changes**.
5. Go to **Settings → Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to `main`, folder to `/ (root)`, and click **Save**.
6. Wait 1 to 2 minutes. The link appears at the top of that page: `https://YOUR-USERNAME.github.io/REPO-NAME/`.
7. Open the link, press Ctrl+Shift+R, and test with two devices in the same room.

To update the site, open a file in the repo, click the pencil icon, edit it and commit. Or use **Add file → Upload files** to replace files. Pages refreshes in about a minute.

## Troubleshooting

- **Page looks unstyled:** your browser or an extension is blocking `cdn.tailwindcss.com`. Allow it.
- **Menu dot stays amber and nobody shows up:** the free public relay servers may be down or blocked by the network. Many school networks block them. Try a different network, or a phone hotspot.
- **Console says a connection to `test.mosquitto.org` was interrupted:** harmless if the dot turns green. The game tries the next server by itself.
- **Nothing happens when opened from a file:** serve it as described above, or use the Pages link.
- **Old behavior after an update:** hard refresh with Ctrl+Shift+R.

## Credits

Inspired by the Canvas LMS dashboard. Built with Tailwind CSS (CDN), MQTT.js and PeerJS for networking.
