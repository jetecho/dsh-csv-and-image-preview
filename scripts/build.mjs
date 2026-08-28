// Build is a no-op: this plugin ships prebuilt lib/ (plain JS, no transpile).
// Kept so `pnpm build` / clean-checkout flows are reproducible and non-fatal.
console.log('dsh-csv-and-image-preview: no build step (lib/ is published as-is).')
