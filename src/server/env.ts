// Imported first by the custom server so .env files are loaded before any
// module (e.g. the Prisma client) reads process.env at import time.
// Variables already set in the environment (e.g. by Docker) win.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // File doesn't exist.
  }
}
