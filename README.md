# Super Class Bros

A hidden multiplayer game that runs on top of a fake Canvas LMS dashboard. The course cards, to-do items and buttons are the platforms. Everything runs in the browser, so it works on GitHub Pages with no server of our own.

## Play

1. Open the site.
2. Click the star inside the **A** of **UCAS** (top right), or press the backtick key (`` ` ``).
3. A small bar appears in the bottom-left corner. Press the backtick again, or click **×**, to leave.

Share a room by adding it to the link: `https://YOUR-SITE/?room=MYROOM`

## The menu

The bar shows your name, whether you are IT, your tag count, the connection dot and how many players are in the room.

- **⋯** opens the controls: room code, server type, Lobby, Chat, Style, Respawn and the bot options.
- **–** hides the whole menu. Click the **▴ Menu** tab, or press `H`, to bring it back.
- **×** leaves the game.

## Server types

| Type | What it is |
|---|---|
| **Tag** | One player is IT and passes it on by touching someone. |
| **Platformer** | In progress. Only joinable in developer mode (see below). |
| Infection, Freeze Tag, Hot Potato | Tag variants. Only joinable in developer mode. Every round a random player (or bot) starts as IT. |

The same room name in two different server types is two different servers. Use **Lobby** to see who is playing where.

### Practice bots

- **Bot: ON/OFF** turns the practice bots on or off. They switch off by themselves when a real player joins.
- **Bots: Easy / Normal / Hard / Mixed** sets how good they are. Easy bots are slower, react late and never hook or dash. Hard bots react quickly and use everything. Mixed gives different bots different levels.
- **Bot: Normal / Always IT** (plain Tag only): Always IT makes the bots chase you forever, so you can practice running. After a bot tags you it freezes for half a second, so you get a head start and a "TAGGED!" message.
- Plain Tag has 1 bot. The tag variants have 2. The dev panel can change the number (up to 8).

## Controls

| Action | Keys |
|---|---|
| Move | `A` `D` or arrow keys |
| Jump (double jump, wall jump) | `W`, `Up` or `Space` |
| Dive in mid-air / drop through a ledge | `S` or `Down` |
| Grapple hook (locks onto the nearest card) | `E`, `Q`, `/` or `Enter` |
| Grapple straight up | `F` or `.` |
| Dash | `Shift`, `C`, `M`, or double-tap left or right (0.25s cooldown in Tag, 0.1s in the Platformer) |
| Hide / show the menu | `H` |
| Slide again (Platformer, stacking on) | `S` once more, between 0.4s and 0.8s into a slide |
| Lab: next grapple target / flip dimension | `R` / `Tab` |
| Platformer: next / previous map, reset the ghost | `]` / `[`, `G` |
| Game on / off | `` ` `` |

While hooked, left and right pump the swing, `W` reels the rope in, `S` lets it out, and jumping releases it.

Scrolling the page changes your map, and other players' maps are not affected.

## Browser zoom and window size

The game world is always about 1440 units wide, whatever the window size or browser zoom. Everyone runs at the same speed relative to the screen, so tagging works between players with different zoom levels or monitors. Very small windows are clamped so the runner doesn't shrink to nothing.

## Developer mode

Add `?dev=1` to the link once (for example `http://localhost:8000/?dev=1`). It is remembered by the browser. Use `?dev=0` to turn it off.

It unlocks the **Platformer**, **Infection**, **Freeze Tag** and **Hot Potato** server types and a **Developer** box in the menu (`⋯`) with:

- **Open level editor**: see below.
- **Hitboxes**, **Stats**, **Fly**, **Infinite jumps** and **Click to teleport**.
- **Bots**: add or remove practice bots (0 to 8).
- **Sliders** for gravity, run speed, jump, dash and grapple range, plus a **Time scale** slider for slow motion. There are two dash cooldowns: 0.25s for Tag and 0.1s for the Platformer.
- **Copy tuning** copies only the values you changed. Paste them into `DEFAULTS` in `engine.js` to keep them.
- **Platformer lab**: switches for the experiments below. They only apply in the Platformer server type.

## The Platformer

The Platformer does not use the page. It plays on its own level, drawn on the screen: a fixed 1440 x 810 world that is scaled to fit your window, so browser zoom and window size don't change the map. Run to the flag. Your best run replays as a ghost. **Every attempt and every map starts in dimension A.**

### Maps

The maps live in the `maps` folder, and `maps/index.json` lists them **in play order**:

| # | Map | What it is |
|---|---|---|
| 1 | Basic | Four cards in a row, run to the flag |
| 2 | Jump | A gap you have to jump |
| 3 | Swing | A long gap with a card to grapple from |
| 4 | Swing and Swap | The same, with a wall in dimension A and a platform in dimension B |
| 5 | Penguin | One long card: a slide-stacking speed course |

- Pick a map in the Developer box (`Map`), or press `]` for the next map and `[` for the previous one. After the last map it wraps to the first.
- **Finishing a map moves you on to the next one** (the "Next map after finishing" switch turns this off).
- **To add a map:** save it from the level editor, put the file in `maps`, and add its file name to `maps/index.json`. To change the order, reorder that list.
- Editing a built-in map makes it **your own map**. It is remembered by the browser and stays in the picker as "Your map". The files in `maps` are never changed by the game.
- The maps are loaded when the page opens, so they need the site to be served (GitHub Pages, or `python -m http.server`). If they can't be loaded you still get the first map, built into `engine.js`.

### The ghost

Your best run replays as a ghost. **The ghost resets by itself whenever the map changes**: switching map, loading a file, or editing anything on the map (moving a card, adding a flag, and so on). Renaming a map or just opening the editor does not reset it. To reset it by hand, press `G` or use **Reset ghost** in the Developer box.

### Level editor

Start the Platformer, open `⋯` and click **Open level editor**. The game pauses and a toolbar appears.

| Tool | What it does |
|---|---|
| **Select** | Click to pick something and drag it. Drag the blue corner to resize it. |
| **Card** | Drag out a solid box, or just click for a default one. |
| **Ledge** | A thin one-way platform. Drag sideways to set its width. |
| **Spring** | A bouncy pad. |
| **Flag** | A checkpoint. Flags are numbered in the order you place them, and the last one finishes the race. |
| **Coin** | A pickup for the Overdue game. |
| **Start** | Move the spawn point. |
| **Erase** | Click something to delete it. |

Other controls: **Snap** (grid size, or Off), **Dimension** (which half of the map new or selected things belong to), number boxes for the exact `x y w h` of the selected thing, `Delete` to remove it, and **Play** (or `Esc`) to test the map from its spawn. Your work is remembered by the browser.

- **Save file** downloads the map as a `.json` file. **Load file** opens one.
- **Share with room** sends your map to everyone in the same Platformer room. They get it straight away unless they are editing.
- **First map** loads the first map from the `maps` folder, and **Clear everything** empties the map (they ask first).
- A map can also come from a link: `?dev=1&mode=platformer&map=maps/mine.json` (any http or https address that serves the file). It becomes "Your map".

### Map file format

Everything is in design units. `(0, 0)` is the top-left corner, `y` grows downward, and the floor is at `y = 810`. Boxes use their top-left corner plus a size. Points (`spawn`, `flags`, `pickups`) are where the thing stands, so a flag at `y: 810` stands on the floor. `dim` is `"both"`, `"a"` or `"b"`.

```json
{
  "format": "super-class-bros-level",
  "version": 1,
  "name": "Basic",
  "size": [1440, 810],
  "spawn": {"x":310,"y":500},
  "cards": [
    {"x":300,"y":500,"w":160,"h":120,"dim":"both"},
    {"x":470,"y":500,"w":160,"h":120,"dim":"both"},
    {"x":640,"y":500,"w":160,"h":120,"dim":"both"},
    {"x":810,"y":500,"w":160,"h":120,"dim":"both"}
  ],
  "ledges": [],
  "springs": [],
  "flags": [
    {"x":960,"y":500}
  ],
  "pickups": []
}
```

`cards` are solid, `ledges` can be jumped up through, `springs` bounce you. Ledges are always 12 tall and springs 14 tall. A map holds up to 200 of each kind. Anything loaded from a file, a link or another player is checked first: unknown fields are dropped, numbers are clamped into the level, and broken entries are skipped.

### Platformer lab

Movement experiments, each with its own switch:

| Experiment | How it works |
|---|---|
| **Aimed grapple** | Hookable points on cards and ledges show as dots. The ringed one is the target. `E` fires, `R` picks the next target. Moving the pointer, or a trackpad tap, is optional. It never targets players. Off by default. |
| **Dash charges** | Instead of the 0.1s cooldown you get one dash. Touching the floor, a wall or a hook gives it back. Off by default. |
| **8-way dash** | Hold a direction (including up or down) when you dash. Dashing cancels a swing. |
| **Spring pads** | Landing on a spring from the map bounces you. |
| **Slide** | Hold `S` while running on the floor or a card. You can slide under low gaps. |
| **Slide stacking** | A slide lasts 0.8s. After 0.4s, click `S` again before it ends and you slide again with more speed (each chained slide keeps 1.25x your speed and adds 130, and every stack raises the speed limit). It stacks up to 6 times, to at most 3.4x the run speed. On the Penguin map a plain slide crosses in 3.6s and stacking in 2.5s. If you jump out of a stacked slide you keep the speed, and it fades gradually. With this off, letting go of `S` ends the slide and each slide gives the same boost. The four numbers are sliders in the Developer box. |
| **Dimensions** | `Tab` flips which half of the map is solid. Things in the other dimension are ghosted. Set a thing's dimension in the editor. |

Games:

- **Flag race** (the default): run through the flags in order and race your ghost.
- **Overdue**: a red "due date" floor rises. Climb to stay above it. Coins push it back down.
- **Sandbox**: nothing but the map.

### Tag variants

- **Infection**: IT stays IT and everyone they touch becomes IT too. The round ends when everyone is IT. Then the bots swarm you for a few seconds, and the next round starts with a new random IT, so they either get infected by you or infect you.
- **Freeze Tag**: IT freezes people. A free runner touching a frozen one thaws them. The round ends when everyone is frozen. Frozen players thaw by themselves after 12 seconds.
- **Hot Potato**: IT has a 12 second fuse. When it runs out they are out. Pass it on by touching someone. The last one standing wins.

The two practice bots play in all of them, so you can try them alone. In Freeze Tag the free bots also rescue frozen teammates.

To build the real platformer, work in the `PLATFORMER LAB` section at the bottom of `engine.js`. No tagging or bot runs in that mode.

## Files

| File | What is in it |
|---|---|
| `index.html` | The page and the game menus |
| `style.css` | Styles |
| `engine.js` | Game rules: config, physics, collision, grapple, Tag and variants, bots, levels and the level editor, drawing, dev tools, platformer lab |
| `online.js` | Networking and player snapshots |
| `app.js` | Menus, chat, keyboard, the fake dashboard, start/stop |
| `maps/` | The Platformer maps (`.json`) and `index.json`, which lists them in play order |

The old version with Fight mode and the follow camera is saved in `fight-version/`, for anyone who wants to build on it. It is a full copy of the site: put its files together in one folder to run it.

## Tweaking

| What | Where |
|---|---|
| Dash cooldowns, jump, gravity, grapple range | `DEFAULTS` at the top of `engine.js` |
| How good Easy / Normal / Hard bots are | `AI_LEVELS` at the top of `engine.js` |
| Hot Potato fuse, Freeze Tag auto-thaw | `POTATO_FUSE`, `FROZEN_AUTO_THAW` in `engine.js` |
| Solid cards or one-way cards (Tag) | `SOLID_CARDS` in `engine.js` |
| Slide speed, duration and stacking | `SLIDE` in `engine.js` |
| The map order | `maps/index.json` |
| Slide stacking strength | `SLIDE_STACK_MUL`, `SLIDE_STACK_ADD`, `SLIDE_CAP_STEP`, `SLIDE_CAP_MAX` in `DEFAULTS` (or the dev sliders) |
| How long the bot freezes after tagging you | `BOT_PAUSE` in `engine.js` |
| Space between course cards | `gap-[44px]` on the `course-grid` section in `index.html` |

## Run it on your computer

Browsers block the scripts if you double-click `index.html`, so serve the folder instead. In a terminal inside the project folder:

```
python -m http.server 8000
```

Then open `http://localhost:8000`. If you don't have Python, run `npx serve` instead.

## Put it on GitHub Pages

1. Make sure the folder holds only the files above plus the `maps` folder. **No screenshots, schedules, photos or anything personal.** Everything uploaded to a public repo is public, and deleting it later doesn't reliably take it back.
2. On GitHub, click **New repository**. Name it, choose **Public**, and leave "Add a README" unticked.
3. On the empty repo page, click **uploading an existing file**.
4. Drag in the individual files and the `maps` folder (not the folder that holds everything), then click **Commit changes**. Open the `maps` folder in the repo afterwards and check all the map files and `index.json` are there.
5. Go to **Settings → Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to `main`, folder to `/ (root)`, and click **Save**.
6. Wait 1 to 2 minutes. The link appears at the top of that page: `https://YOUR-USERNAME.github.io/REPO-NAME/`.
7. Open the link, press Ctrl+Shift+R, and test with two devices in the same room.

To update the site, open a file in the repo, click the pencil icon, edit it and commit. Or use **Add file → Upload files** to replace files. Pages refreshes in about a minute.

## Troubleshooting

- **Page looks unstyled:** your browser or an extension is blocking `cdn.tailwindcss.com`. Allow it.
- **Menu dot stays amber and nobody shows up:** the free public relay servers may be down or blocked by the network. Many school networks block them. Try a different network, or a phone hotspot.
- **Console says a connection to a broker was interrupted:** harmless if the dot turns green. The game tries the next server by itself.
- **Nothing happens when opened from a file:** serve it as described above, or use the Pages link.
- **Old behavior after an update:** hard refresh with Ctrl+Shift+R.

## Credits

Inspired by the Canvas LMS dashboard. Built with Tailwind CSS (CDN), MQTT.js and PeerJS for networking.
