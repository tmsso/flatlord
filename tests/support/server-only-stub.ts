// vitest runs outside React's server build, where the real `server-only`
// package throws on import by design. Tests that exercise server modules
// directly alias it to this no-op (vitest.config.ts).
export {};
