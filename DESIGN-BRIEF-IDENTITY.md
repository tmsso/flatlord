# DESIGN-BRIEF-IDENTITY.md — Flatlord identity pass (mark, header, icons)

Handoff for a Claude Design / artifact run. Follows `DESIGN-BRIEF.md` (the original UI brief) and builds on its result, `design/` (13 hi-fi screens + tokens, already implemented and signed off). **This is an evolution, not a rebrand.** Self-contained: everything the run needs is below. **All names and data are synthetic** — use "Alex Tenant", "Sam Owner", "Garden St 12", "245,000 HUF" / "245 000 Ft" in mockups; never real-looking personal data.

## 1. Why this run exists

The app works and follows its design system, but the owner finds it reads like "a CRM app from the 2000s". The visual system stays as it is (it was chosen deliberately: Office-2010-era clarity, visible borders, warm-grey background, one teal accent). What's missing is **a bit of personality, nothing major**: a confident mark + wordmark, and a header treatment where a **translucent mark eases in once, slowly, then stays still**.

## 2. What exists today (start here)

**Product.** Private flat-rental manager: one landlord ("admin", desktop-leaning, data-dense admin panel) and their tenant (phone almost exclusively, mid-range Android, bottom tab bar). Hungarian + English UI, German later.

**The mark — "C5 Sheltered free mark"** (chosen in `design/10`): a house glyph framed by two arcs, shelter above and palm below. SVG, `viewBox="0 0 28 28"`, `fill="none" stroke="currentColor"`, stroke width 2.2–2.4, round caps and joins:

```svg
<path d="M7.5 5.6q6.5-3.8 13 0"/>      <!-- shelter arc -->
<path d="M8 13.8L14 8.4l6 5.4"/>       <!-- roof -->
<path d="M10.2 13.3v4.4h7.6v-4.4"/>    <!-- walls -->
<path d="M7.5 22.4q6.5 3.8 13 0"/>     <!-- palm arc -->
```

Approved applications: teal free mark on plain surfaces (`--primary`); light teal on dark (same token); **white-in-teal tile** (radius ≈ ¼ of size) for app icon and sidebar; ink mono for print. Rejected earlier: copper and MS blue (they collide with the semantic warning and info colours), face/eye variants (too cute for formal notices). The mark **never** introduces a second brand colour.

**Wordmark today:** the word "Flatlord" set as plain text, IBM Plex Sans 600, 15px, letter-spacing ≈ −0.01em. No lockup exists beyond "tile + word" in the admin sidebar.

**Where it shows up in the app right now (it doesn't match the design):**

| Surface | Design intent (`design/10`) | Actual |
|---|---|---|
| Admin sidebar (≥768px) | white-in-teal tile + wordmark | ✅ as designed, 28px tile |
| Admin header, phone (<768px) | tile + wordmark | ❌ nothing: hamburger + controls only. The drawer title is the plain word |
| Tenant header (phone) | tile + wordmark | ❌ the plain word "Flatlord" only |
| Logon | tile on the card | ❌ no mark |
| Browser favicon | C5 tile | ❌ **still the Next.js framework default icon** |
| PWA / home-screen icon, Apple touch icon | — | ❌ none (no manifest) |
| Link preview (WhatsApp/email) | — | ❌ none. This matters: the amount-due WhatsApp message carries a portal link |
| PDFs (statements, declarations) | ink mono mark | ❌ text footer only (out of scope for this run) |

**Shell layout today.**
- *Admin ≥768px:* 224px left sidebar (logo block at top, then nav) + 56px top header, right-aligned: notifications bell · hu/en switch · theme toggle · sign out.
- *Admin <768px:* 56px header: hamburger (40px, left) … bell · hu/en · theme · sign out (right). Nav in a slide-in drawer.
- *Tenant (phone-first):* 56px header: wordmark (left) … bell · hu/en · theme · settings gear · sign out (right); five-tab bottom bar (Home · Meters · Payments · Requests · Notices).
- On phones the bell and sign-out are icon-only (32px); the other controls are 36px. A narrow-width overlap (clipped Hungarian "Kijelentkezés", tabs overlapping) was fixed in Sept 2026 by going icon-only. It was verified at 390px only; **320–360px has never been checked**.

## 3. Design tokens (use only these)

Theme switches via a `.dark` class on `<html>`; the default follows the system setting. All colours are oklch. When tinting, use `color-mix(in oklab, …)`, **never `in oklch`** (hue-rotation artifacts on the near-neutral surfaces).

| Token | Light | Dark |
|---|---|---|
| `--background` | `oklch(0.962 0.006 85)` warm grey | `oklch(0.215 0.009 75)` |
| `--card` (header/sidebar surface) | `oklch(1 0 0)` | `oklch(0.262 0.010 75)` |
| `--foreground` | `oklch(0.25 0.012 75)` | warm near-white (as in `design/01`) |
| `--muted` / `--muted-foreground` | `0.94 0.007 85` / `0.49 0.015 75` | `0.305 0.011 75` / `0.705 0.012 80` |
| `--border` | `oklch(0.872 0.010 85)` | `oklch(0.365 0.013 75)` |
| `--primary` (teal accent, the mark colour) | `oklch(0.47 0.085 205)` | `oklch(0.76 0.095 197)` |
| `--primary-foreground` | `oklch(0.99 0.003 200)` | `oklch(0.21 0.03 200)` |
| Semantic | success 155°, warning 70–85°, destructive 25–27°, info 250°: **do not use for brand** | |

Radius: 6 controls, 8 cards, ¼-size for the icon tile. Type: IBM Plex Sans 400/500/600/700 + Plex Mono; scale 30/24/18/15/14/13/12; **no ALL-CAPS ever** (it breaks Hungarian diacritics ő ű). No pure black anywhere in dark mode.

## 4. Hard rules

1. **The mark lives in chrome only** (header, sidebar, logon card, icons). Never behind content, data, tables, charts or form fields, and never under a tappable control in a way that lowers its contrast.
2. **No new palette, type scale or layout change.** Colours from the existing tokens only. If a new token is truly needed (e.g. `--brand-mark-opacity`), define it in **both** themes and justify it in one line.
3. **Delivery format: inline SVG.** The app currently sends no Content-Security-Policy and loads fonts self-hosted at build (no runtime font host), so inline SVG is not forced by CSP. It is still the rule here: no new font files, no external hosts, no raster images in-app. Provide:
   - in-app wordmark as **live text** in the already-loaded IBM Plex Sans (preferred: zero new bytes, crisp, theme-aware) **and**
   - an **outlined-text SVG** version for static assets (favicon, app icon, link preview), where the font isn't available.
4. **Motion:** CSS/SVG only (no JS animation libraries, no Lottie). Plays **once** per full page load: the app's shell persists across in-app navigation, so it will not replay on every click. Total ≤ ~1.2s, eased (no bounce). It **never delays or blocks a tap**: content and controls are interactive from first paint, and the animated element is `pointer-events: none` and `aria-hidden`. Under `prefers-reduced-motion: reduce`, show the final static state with no animation.
5. **Touch targets ≥ 48px** for anything tappable that this run touches. Today's header controls are 32–36px, and five 48px controls + a lockup do **not** fit a 360px header (see §6.3). The owner has decided how to solve it: the account menu in §4.7.
6. **Fix the narrow-width header.** Prove every proposed header at **320, 360 and 390px** with Hungarian labels: nothing clips, nothing overlaps, no horizontal scroll.
7. **Account menu at the right end of the header** (decided by the owner). On every width, the header carries only: lockup (left) · notifications bell · one **account menu button** (48px, right end). The menu holds language (HU | EN), theme (light | dark | system), Settings and Sign out. Today it shows a neutral person icon; it is the slot where an avatar goes later, so design it to take a 32px avatar without changing size. Desktop admin may keep language/theme inline if space allows. Show the open menu in both themes, at 360px, in Hungarian.
8. **Accessibility:** the lockup has an accessible name ("Flatlord", not translated) and, where it's a link, goes home. Decorative copies (the translucent mark) are `aria-hidden`. Logos are exempt from WCAG contrast minimums, but the **crisp lockup must still meet 3:1** against the header in both themes. Only the translucent ambient copy may go lower.
9. **Weight:** each in-app SVG ≤ ~2 KB, the CSS for the entrance ≤ ~1 KB. No new dependencies.

## 5. Asks

### 5.1 Mark + wordmark lockup (required)

2–3 variants **evolving C5** (stroke weight/optical sizing, arc tension, house proportion, tile vs free mark, wordmark spacing/weight/case). Recommend one, with a one-paragraph rationale. For each variant show:

- **Small** 16 / 20 / 24px (favicon, header): does it survive? Provide an optical-size variant if the full mark muddies at 16px (e.g. heavier stroke, arcs simplified).
- **Medium** 28–40px (sidebar, logon, header lockup).
- **Large** 96–192px (logon hero, splash, icon master).
- Horizontal lockup (mark + wordmark) and mark-only; light, dark, ink-mono.
- Clear-space and minimum-size rules.

### 5.2 Mark expression set (required, small)

**Decided by the owner: two states, expressed through the mark's own four lines only.** No character, no faces (rejected earlier as too cute for formal payment notices), no new colours, no illustration style.

- **"Submitted"**: a tick in the doorway. Used on the tenant's meter-reading success step (the end of the signature flow). It may animate once (the tick draws in, ≤ 0.6s), static under reduced motion.
- **"Not found"**: arcs and walls drawn broken or parted. Used on the 404 and error pages. Static.

Empty lists (no requests, no notices) stay **text-only**: no mark there. Show each state at 48 and 96px, light and dark, in context on its screen (390px).

### 5.3 Header treatment with a translucent entrance (required)

**Decided by the owner: the header band.** Design this one only.

- **Header band.** The crisp lockup sits at the left of the header as today. A larger translucent copy of the mark (roughly 1.5–2.5× header height, ~6–12% opacity, tinted `--primary`) is clipped inside the header band, in the free space between lockup and controls. It eases in once (opacity + a few px of drift/scale), then stays still. It works on every screen size, because the header exists everywhere.
- *Not chosen:* an ambient corner mark (e.g. at the bottom of the admin sidebar). On phones there is no free chrome corner, so it would either collapse into the band or end up behind content.

Show: the entrance as a short storyboard (0 / mid / end frames with timings and easing), the reduced-motion static state, and a CSS sketch (keyframes + reduced-motion media query).

**Screens** (each in light + dark):

| Screen | Widths |
|---|---|
| Tenant Home (amount-due hero, bottom tab bar) | 320, 360, 390 (phone) · 768 (tablet) |
| Admin Dashboard (sidebar + header) | 1440 (desktop) · 768 (tablet, sidebar visible) · 390 (phone, hamburger + drawer, incl. the drawer's own header) |
| Logon (Google button + magic-link email, invite-only note) | 390 · 1440 |

Reuse the existing screens' content (the `design/02`, `04`, `08` layouts) as a backdrop. Only the chrome changes.

### 5.4 App icon, maskable icon, link preview (required)

Redrawn from the chosen mark (white-in-teal tile family):

- **Favicon**: SVG (with a `prefers-color-scheme` variant if useful) + 16/32/48 ICO-ready masters. Replaces the framework default.
- **Apple touch icon** 180×180 (no transparency, iOS rounds the corners itself).
- **PWA icons** 192 and 512 (`purpose: any`) + **maskable** 512 (keep the mark inside the central safe zone, a circle of 40% radius; the full-bleed teal background extends to the edges).
- **Link preview (Open Graph)** 1200×630: lockup + a short neutral line (e.g. "Private flat-rental management", in en + hu variants). **No personal or property data**: this image is public and appears in the tenant's WhatsApp when the amount-due message links the portal.
- `theme-color` values for light and dark (from `--card` or `--primary`, your recommendation).

## 6. Constraints recap

1. **Devices:** tenant = mid-range Android phone, Chrome, often one-handed; admin = desktop ≥1280, sometimes phone. Breakpoint `md` = 768px (sidebar appears). Test 320–1440.
2. **Performance:** the header renders on every page; the entrance must not cause layout shift (reserve the space, animate only `opacity`/`transform`).
3. **Header budget at 360px (why §4.5 matters):** 360 − 32 padding = 328px. Today: lockup ≈ 90 + five controls (bell, hu/en pair, theme, settings, sign out) at 32–36px. At 48px each that's ≈ 290px of controls + gaps before the lockup. **Decided:** consolidate language/theme/settings/sign-out into the account menu (§4.7): lockup ≈ 100 + bell 48 + account 48 + gap ≈ 200px, which leaves the free band for the translucent mark. This is the one chrome change this run is allowed to make.
4. **i18n:** Hungarian labels run 20–30% longer than English. The wordmark is not translated.
5. **Dark mode:** both themes for every deliverable; no pure black; the mark always resolves from `--primary` / `--primary-foreground`.

## 7. Deliverables

1. `design/14 Identity.dc.html`: self-contained HTML in the same style as `design/01`–`13` (light/dark toggle in the mockup chrome is fine): lockup variants + recommendation, size ladder, optional expression set, both header readings on the screens/widths above, the icon set and the OG image.
2. **SVG sources inline in that file** (copyable): mark (regular + small optical size), lockup with live text, lockup with outlined text, tile, maskable, OG composition. PNG/ICO rasterisation will be done in the code integration from these masters.
3. **CSS sketch** for the entrance + reduced-motion fallback, and the exact final opacity/size values per breakpoint.
4. A short **rationale note**: recommended variant, recommended header reading, how the 48px/360px problem is solved.

## 8. Anti-goals

No rebrand, no second brand colour, no gradients, no glassmorphism or blur, no looping or attention-seeking animation, no mascot character or faces, no illustration-heavy empty states, no mark behind data, no lorem ipsum, no real-looking personal data.
