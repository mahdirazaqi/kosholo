// Generates PWA icons and favicons from public/logo.svg (npm run icons).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

const BRAND = "#171717";
const logo = await readFile("public/logo.svg");
await mkdir("public/icons", { recursive: true });

const png = (size) => sharp(logo, { density: 512 }).resize(size, size).png().toBuffer();

// "any" icons: the logo as drawn (rounded square).
for (const size of [192, 512]) {
  await writeFile(`public/icons/icon-${size}.png`, await png(size));
}

// Maskable: solid square background, logo inside the 80% safe zone.
const inner = Math.round(512 * 0.72);
await sharp({ create: { width: 512, height: 512, channels: 4, background: BRAND } })
  .composite([{ input: await png(inner), gravity: "center" }])
  .png()
  .toFile("public/icons/maskable-512.png");

// Apple touch icon: iOS rounds the corners itself, so no transparency.
await sharp({ create: { width: 180, height: 180, channels: 4, background: BRAND } })
  .composite([{ input: await png(150), gravity: "center" }])
  .png()
  .toFile("public/icons/apple-touch-icon.png");

// Favicons: PNG + a multi-size .ico (PNG-encoded entries).
await writeFile("public/icons/favicon-32.png", await png(32));
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // icon
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = images.map((image, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(sizes[i], 0);
  entry.writeUInt8(sizes[i], 1);
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += image.length;
  return entry;
});
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...entries, ...images]));

console.log("icons: icon-192, icon-512, maskable-512, apple-touch-icon, favicon-32, favicon.ico");
