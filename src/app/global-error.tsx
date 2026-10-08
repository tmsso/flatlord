"use client";

import "./globals.css";

// Last-resort boundary: renders only when the root layout itself throws,
// replacing it — so no next-intl provider, theme provider or fonts exist
// here, and the failure may be the catalog/locale loading itself. That's
// why the copy is inlined in both locales instead of read from
// messages/*.json (the one deliberate exception to "all copy via
// catalogs"); the per-route boundaries (error.tsx) use the catalogs.
const COPY = [
  {
    lang: "hu",
    title: "Valami hiba történt",
    body: "Az alkalmazást nem sikerült betölteni. Próbáld újra – ha a hiba ismétlődik, küldd el az alábbi hivatkozási kódot az adminisztrátornak.",
    retry: "Újrapróbálás",
  },
  {
    lang: "en",
    title: "Something went wrong",
    body: "The app couldn't load. Try again — if it keeps happening, send the reference code below to the administrator.",
    retry: "Try again",
  },
] as const;

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="hu">
      <body className="min-h-screen flex items-center justify-center bg-background p-6 text-foreground">
        <main className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm flex flex-col gap-5">
          <span className="font-mono text-sm text-muted-foreground">500</span>
          {COPY.map((c) => (
            <section key={c.lang} lang={c.lang} className="flex flex-col gap-2">
              <h1 className="text-xl font-semibold">{c.title}</h1>
              <p className="text-sm text-muted-foreground">{c.body}</p>
            </section>
          ))}
          {error.digest && <p className="font-mono text-xs text-muted-foreground">{error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {COPY[0].retry} / {COPY[1].retry}
          </button>
        </main>
      </body>
    </html>
  );
}
