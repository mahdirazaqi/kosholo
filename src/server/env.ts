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

// Fail fast with a clear message instead of failing on the first request.
const problems: string[] = [];
if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is not set");
if (!process.env.JWT_SECRET) problems.push("JWT_SECRET is not set (generate one with: openssl rand -base64 48)");
else if (process.env.JWT_SECRET.length < 32) problems.push("JWT_SECRET must be at least 32 characters (openssl rand -base64 48)");
if (!process.env.UPLOAD_DIR) problems.push("UPLOAD_DIR is not set");
const maxFileSize = process.env.MAX_FILE_SIZE_MB;
if (maxFileSize && !(Number(maxFileSize) > 0)) problems.push("MAX_FILE_SIZE_MB must be a positive number of megabytes");

if (problems.length) {
  for (const problem of problems) console.error(`${new Date().toISOString()} ERROR [env] ${problem}`);
  process.exit(1);
}
