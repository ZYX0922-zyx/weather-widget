const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { readPNG, resize } = require("png-to-ico/lib/png");

const ICON_SIZES = [256, 48, 32, 16];

function sanitizeTransparentPixels(png) {
  for (let i = 0; i < png.data.length; i += 4) {
    const alpha = png.data[i + 3];
    if (alpha < 20) {
      png.data[i] = 0;
      png.data[i + 1] = 0;
      png.data[i + 2] = 0;
      png.data[i + 3] = 0;
    }
  }
}

function pngToBuffer(png) {
  sanitizeTransparentPixels(png);
  return PNG.sync.write(png);
}

function buildPngEmbeddedIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  const images = [];
  let offset = 6 + count * 16;

  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    const sizeByte = item.size >= 256 ? 0 : item.size;
    entry.writeUInt8(sizeByte, 0);
    entry.writeUInt8(sizeByte, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(item.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    images.push(item.buffer);
    offset += item.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...images]);
}

function copyIconTargets(root, icoPath) {
  const targets = [
    path.join(process.env.APPDATA || "", "weather-widget", "app.ico"),
    path.join(process.env.LOCALAPPDATA || "", "weather-widget", "app.ico"),
    path.join(root, "assets", "icon.ico"),
  ];
  for (const target of targets) {
    if (!target) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(icoPath, target);
  }
  return targets.filter((p) => fs.existsSync(p));
}

async function main() {
  const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
  const pngPath = path.join(root, "assets", "icon.png");
  const icoPath = path.join(root, "assets", "icon.ico");

  if (!fs.existsSync(pngPath)) {
    console.error("[build-icon] Missing PNG:", pngPath);
    process.exit(1);
  }

  const source = await readPNG(pngPath);
  if (source.width !== source.height) {
    console.error("[build-icon] PNG must be square");
    process.exit(1);
  }

  const base = source.width === 256 ? source : resize(source, 256, 256);
  const pngBuffers = ICON_SIZES.map((size) => {
    const method = size >= 48 ? "bicubicInterpolation" : "nearestNeighbor";
    const png = size === 256 ? base : resize(base, size, size, method);
    return { size, buffer: pngToBuffer(png) };
  });

  const ico = buildPngEmbeddedIco(pngBuffers);
  fs.writeFileSync(icoPath, ico);
  const copied = copyIconTargets(root, icoPath);
  console.log(copied[0] || icoPath);
}

main().catch((err) => {
  console.error("[build-icon]", err.message || err);
  process.exit(1);
});
