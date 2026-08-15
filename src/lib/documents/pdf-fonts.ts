import { join } from "node:path";
import { Font } from "@react-pdf/renderer";

// @react-pdf/renderer's built-in base-14 fonts (Helvetica etc.) have no
// glyphs for Hungarian double-acute characters (ő/ű) — they silently
// render as tofu/blank boxes. IBM Plex Sans is this repo's own design-
// system font (design/README.md, loaded for the web UI via next/font/
// google in src/app/globals.css) and does carry those glyphs, so it's
// registered here too rather than pulling in a second typeface.
//
// The TTFs are vendored under /fonts (SIL Open Font License 1.1 — free to
// redistribute) instead of fetched from a URL at render time: a Vercel
// serverless function reaching out to an external font CDN on every PDF
// render is an unnecessary network dependency and failure mode.
let registered = false;

export function ensurePdfFontsRegistered() {
  if (registered) return;
  // @react-pdf/font's loader (fontkit.open) wants a file path string, not
  // pre-read bytes — passing a Buffer here fails deep inside its isDataUrl
  // check (it assumes `src` is always a string). Not a URL fetch either
  // (see pdf-fonts.ts's own module comment for why): a plain filesystem
  // path, resolved from the deployed function's cwd.
  const dir = join(process.cwd(), "fonts");
  Font.register({
    family: "IBM Plex Sans",
    fonts: [
      { src: join(dir, "IBMPlexSans-Regular.ttf"), fontWeight: "normal" },
      { src: join(dir, "IBMPlexSans-SemiBold.ttf"), fontWeight: "semibold" },
      { src: join(dir, "IBMPlexSans-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  registered = true;
}
