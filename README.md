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
- **Levels** (Platformer only) lists the levels with your best times and the campaign total.
- **–** hides the whole menu. Click the **▴ Menu** tab, or press `H`, to bring it back.
- **×** leaves the game.

## Server types

| Type | What it is |
|---|---|
| **Tag** | One player is IT and passes it on by touching someone. |
| **Infection**, **Freeze Tag**, **Hot Potato** | Tag variants (see below). Every round a random player (or bot) starts as IT. |
| **Overdue** | A team game on the same page: a red floor rises, grab dots to push it down (see below). Nobody is IT. |
| **Platformer** | Run through 5 levels to the flag and beat your best time (see below). |

The same room name in two different server types is two different servers. Use **Lobby** to see who is playing where.

### Practice bots

- **Bot: ON/OFF** turns the practice bots on or off. They switch off by themselves when a real player joins.
- **Bots: Easy / Normal / Hard / Mixed** sets how good they are. Easy bots are slower, react late and never hook or dash. Hard bots react quickly and use everything. Mixed gives different bots different levels.
- **Bot: Normal / Always IT** (plain Tag only): Always IT makes the bots chase you forever, so you can practice running. After a bot tags you it freezes for half a second, so you get a head start and a "TAGGED!" message.
- Plain Tag has 1 bot. The tag variants and Overdue have 2. The dev panel can change the number (up to 8).

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
| Platformer: slide | Hold `S` while running on the ground |
| Platformer: slide again (stacking) | `S` once more, between 0.4s and 0.8s into a slide |
| Platformer: flip dimension | `Tab` |
| Platformer: next / previous level | `]` / `[` |
| Platformer: reset this level's best time | `G` twice within 3 seconds |
| Game on / off | `` ` `` |

While hooked, left and right pump the swing, `W` reels the rope in, `S` lets it out, and jumping releases it.

Scrolling the page changes your map, and other players' maps are not affected.

## Browser zoom and window size

The game world is always about 1440 units wide, whatever the window size or browser zoom. Everyone runs at the same speed relative to the screen, so tagging works between players with different zoom levels or monitors. Very small windows are clamped so the runner doesn't shrink to nothing.

## Developer mode

Add `?dev=1` to the link once (for example `http://localhost:8000/?dev=1`). It is remembered by the browser. Use `?dev=0` to turn it off.

It adds a **Developer** box to the menu (`⋯`) with:

- **Hitboxes**, **Stats**, **Fly**, **Infinite jumps** and **Click to teleport**.
- **Bots**: add or remove practice bots (0 to 8).
- **Slow motion**: run the game slower, handy for checking a jump or a slide.

Every server type and the level editor work without it. Developer mode is not secret: anyone who adds `?dev=1` gets it.

## The Platformer

The Platformer does not use the page. It plays on its own level, drawn on the screen: a fixed 1440 x 810 world that is scaled to fit your window, so browser zoom and window size don't change the map. Run to the flag (or through all the flags, in order).

- **Every level start and every respawn counts down 2, 1, GO.** You can't move and the clock doesn't run until GO.
- Every attempt and every level starts in dimension A.
- Movement: double jump, wall jump, grapple, 8-way dash (hold a direction when you dash, 0.1s cooldown), slide and slide stacking, spring pads, and `Tab` to flip dimensions on levels that have them.

### Movement details

| Move | How it works |
|---|---|
| **8-way dash** | Hold a direction (including up or down) when you dash. Dashing cancels a swing. |
| **Spring pads** | Landing on a spring bounces you. |
| **Slide** | Hold `S` while running on the floor or a card. You can slide under low gaps. |
| **Slide stacking** | A slide lasts 0.8s. After 0.4s, press `S` again before it ends and you slide again with more speed (each chained slide keeps 1.25x your speed and adds 130, and every stack raises the speed limit). It stacks up to 6 times, to at most 3.4x the run speed. On the Penguin level a plain slide crosses in 3.6s and stacking in 2.5s. If you jump out of a stacked slide you keep the speed, and it fades gradually. |
| **Dimensions** | `Tab` flips which half of the level is solid. Things in the other dimension are ghosted. |
| **No-wall-jump cards** | Cards with a red border and a red tint. You can't wall slide or wall jump on them, but they are still solid. |
| **Speed boosts** | Orange zones with moving arrows. You pass through them. Each boost has a speed. When you enter one, and every 0.1 seconds while you stay in it, your speed in its direction is raised to the boost's speed if it is lower. If you are already faster that way, nothing happens. Speed across it is kept, so a long up boost works like a lift. It works while grappling: you stay hooked and the push goes into your swing. After you leave, the extra speed fades out like after a stacked slide. |
| **No-grapple cards** | Cards with a purple border and a purple tint. The hook ignores them and goes for something else (another card, a ledge or the top of the screen). They are still solid. A card that is both has a red border with a half red, half purple top. |

### Best times and the campaign

- Your best time on each level is saved in the browser, with a ghost of that run that races you next time. A slower run doesn't replace it.
- **Levels** in the menu shows every level with its best time. Click **Play** to go to one, or **↺** to forget that level's time (it asks first). Pressing `G` twice within 3 seconds does the same for the level you are on.
- **Campaign total** is the sum of your best times on all 5 levels. It shows once every level has a time; until then the Levels screen says how many you have finished.
- Times are saved per layout. If a level's file changes (a card moved, a flag added), it counts as a new level with no time. Changing it back brings the old time back. Renaming it or changing its texts does not reset it.
- Times are per browser. Clearing the site's data deletes them.

### Maps

The maps live in the `maps` folder, and `maps/index.json` lists them **in play order**:

| # | Map | What it is |
|---|---|---|
| 1 | Basic | Four cards in a row, run to the flag |
| 2 | Jump | A gap you have to jump |
| 3 | Swing | A long gap with a card to grapple from |
| 4 | Swing and Swap | The same, with a wall in dimension A and a platform in dimension B |
| 5 | Penguin | One long card: a slide-stacking speed course |

- Pick a level from **Levels**, or press `]` for the next one and `[` for the previous one (also during the countdown). After the last level it wraps to the first.
- **Finishing a level moves you on to the next one** after 3 seconds. On your own map it starts that map again.
- **To add a map:** save it from the level editor, put the file in `maps`, and add its file name to `maps/index.json`. To change the order, reorder that list.
- Editing a built-in map makes it **your own map**. It is remembered by the browser and stays in the Levels list as "Your map". Its best time is saved too, but it isn't part of the campaign. The files in `maps` are never changed by the game.
- The maps are loaded when the page opens, so they need the site to be served (GitHub Pages, or `python -m http.server`). If they can't be loaded you still get the first map, built into `engine.js`.

### Level editor

Anyone can use it. Start the Platformer, open `⋯` and click **Editor** (next to **Levels**). The game pauses and a toolbar appears.

| Tool | What it does |
|---|---|
| **Select** | Click to pick something and drag it. Drag the blue corner to resize it. Drag on empty space to select a group. |
| **Card** | Drag out a solid box, or just click for a default one. |
| **No-WJ** | A card you can't wall jump off. Any selected cards can be switched with the **No wall jump** and **No grapple** boxes, and a card can have both. |
| **Ledge** | A thin one-way platform. Drag sideways to set its width. |
| **Spring** | A bouncy pad. |
| **Boost** | Drag out a speed boost zone (or click for a 60 x 60 one). Pick its **direction** (8 ways) and **speed** (100 to 2000; running is about 295) in the boxes below. With nothing selected, the boxes set what the next boost gets. |
| **Flag** | A checkpoint. Flags are numbered in the order you place them, and the last one finishes the race. |
| **Coin** | A pickup. No Platformer game uses it at the moment, so coins only show in the editor. |
| **Start** | Move the spawn point. |
| **Text** | Click to place a line of text, then type it in the **Text** box (up to 80 characters). **Size** sets how big it is (8 to 96). Use it for hints like "Slide here". |
| **Erase** | Click something to delete it. |

Selecting, copying and moving (Select tool):

| Do this | To |
|---|---|
| Drag on empty space | Box select: everything the box touches is selected |
| `Shift`-click (or `Ctrl`-click) | Add a thing to the selection, or remove it |
| Drag a selected thing | Move the whole selection, keeping its layout |
| Click one thing of a group | Pick just that one |
| `Ctrl+C`, `Ctrl+X` | Copy, cut (the start point is never copied) |
| `Ctrl+V` | Paste, with the top-left of the group where your pointer is. Copies keep their size and dimension, and are selected afterwards |
| `Ctrl+D` | Duplicate: copy and paste a little to the side |
| `Ctrl+A` | Select everything |
| Arrow keys | Move the selection by one snap step |
| `Delete` | Remove the selection |
| `Esc` | Deselect, and a second `Esc` leaves the editor |

The **Copy**, **Paste**, **Duplicate** and **Delete** buttons do the same. What you copy stays copied when you switch maps, so you can build one map from parts of another. The number boxes work on one selected thing; the **Dimension** picker changes everything selected at once.

Other controls: **Snap** (grid size, or Off), **Dimension** (which half of the map new or selected things belong to), number boxes for the exact `x y w h` of the selected thing, and **Play** to test the map from its spawn. Your work is remembered by the browser.

- **Save file** downloads the map as a `.json` file. **Load file** opens one.
- **Share with room** sends your map to everyone in the same Platformer room. They get it straight away unless they are editing.
- **First map** loads the first map from the `maps` folder, and **Clear everything** empties the map (they ask first).
- A map can also come from a link: `?mode=platformer&map=maps/mine.json` (any http or https address that serves the file). It becomes "Your map".

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
  "boosts": [],
  "flags": [
    {"x":960,"y":500}
  ],
  "pickups": [],
  "texts": [
    {"x":320,"y":440,"text":"Run to the flag!","size":24}
  ]
}
```

`cards` are solid, `ledges` can be jumped up through, `springs` bounce you. `boosts` are speed boost zones: a box plus `dir` (degrees: 0 right, 90 up, 180 left, 270 down, or the diagonals in between) and `power`, the speed it brings you up to (100 to 2000; running is about 295). Maps without boosts can leave the list out. A card with `"noWallJump":true` can't be wall jumped, and one with `"noGrapple":true` can't be hooked. A card can have both. The fields are left out on normal cards. `texts` are drawn on the level and don't collide: `x`/`y` is the left end of the line, `size` is 8 to 96, and `text` is up to 80 characters. Ledges are always 12 tall and springs 14 tall. A map holds up to 200 of each kind. Anything loaded from a file, a link or another player is checked first: unknown fields are dropped, numbers are clamped into the level, and broken entries are skipped.

### Tag variants

- **Infection**: IT stays IT and everyone they touch becomes IT too. The round ends when everyone is IT. Then the bots swarm you for a few seconds, and the next round starts with a new random IT, so they either get infected by you or infect you.
- **Freeze Tag**: IT freezes people. A free runner touching a frozen one thaws them. The round ends when everyone is frozen. Frozen players thaw by themselves after 12 seconds.
- **Hot Potato**: IT has a 12 second fuse. When it runs out they are out. Pass it on by touching someone. The last one standing wins.

The two practice bots play in all of them, so you can try them alone. In Freeze Tag the free bots also rescue frozen teammates.

### Overdue

A team game on the dashboard page, with the same controls and platforms as Tag. Nobody is IT.

- After 4 seconds a red **OVERDUE** floor starts rising from the bottom of the screen. It starts slowly and speeds up the longer the round goes. **The bot difficulty sets how fast it rises:** Easy is 0.6x, Normal 1x, Hard 1.5x (Mixed counts as Normal). A change before the floor starts moving counts for that round; later it applies from the next round. Online, the host's setting is used. If it reaches your feet you are caught: you turn see-through and wait for the next round.
- Yellow **on time** dots sit on the cards, to-do items and header. Grabbing one pushes the floor back down for everyone and a new dot appears somewhere higher. There are 6 dots for one player and one fewer for each extra runner (bots count), never fewer than 2.
- The round ends when everyone is caught, and the next one starts with everyone back at the top of the screen. The score is how long the team lasted. Your best for each difficulty is saved in the browser and shown at the top of the screen.
- The two practice bots play too. They go for the nearest dot, and go higher when the floor gets close. Like in Tag, they switch off when a real player joins.
- Online, the player with the lowest id runs the floor and the dots and shares them. Everyone else follows. If that player leaves, the next one takes over. Dots are placed by the host's page layout, so on a very different window size a dot can end up somewhere odd for you.

The Platformer code is in the `PLATFORMER` section at the bottom of `engine.js`. No tagging or bot runs in that mode. Two unused experiments are still in the code (aimed grapple and dash charges); nothing in the game turns them on.

## Files

| File | What is in it |
|---|---|
| `index.html` | The page and the game menus |
| `style.css` | Styles |
| `engine.js` | Game rules: config, physics, collision, grapple, Tag and variants, Overdue, bots, Platformer levels, best times and the level editor, drawing, dev tools |
| `online.js` | Networking and player snapshots |
| `app.js` | Menus (including the Levels screen), chat, keyboard, the fake dashboard, start/stop, the editor toolbar |
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
| Slide stacking strength | `SLIDE_STACK_MUL`, `SLIDE_STACK_ADD`, `SLIDE_CAP_STEP`, `SLIDE_CAP_MAX` in `DEFAULTS` |
| Platformer countdown length | `COUNTDOWN` in `engine.js` |
| How long the bot freezes after tagging you | `BOT_PAUSE` in `engine.js` |
| Overdue: grace period, how far a dot pushes the floor, how fast it rises, the speed at each difficulty | `OVERDUE_GRACE`, `OVERDUE_PUSH`, `overdueSpeed`, `OVERDUE_SPEED` in `engine.js` |
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
