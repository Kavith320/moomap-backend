// src/services/media.js
// Stores uploaded images on disk under MEDIA_DIR (default <repo>/uploads) and serves them at /media/...
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || path.join(__dirname, "..", "..", "uploads"));
const MAX_BYTES = 5 * 1024 * 1024;

// Identify the image type from its first bytes (never trust the client's claim)
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

// Accepts "data:image/...;base64,...." or plain base64. Returns { buffer, ext } or throws.
function decodeImage(data) {
  if (typeof data !== "string" || !data) throw new Error("image data is required");
  const b64 = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length) throw new Error("image data is empty");
  if (buffer.length > MAX_BYTES) throw new Error("image is larger than 5 MB");
  const ext = sniff(buffer);
  if (!ext) throw new Error("only JPEG, PNG or WebP images are allowed");
  return { buffer, ext };
}

// Saves into MEDIA_DIR/<folder>/<random>.<ext>, returns the public path "/media/<folder>/<file>"
function saveImage(folder, { buffer, ext }) {
  const dir = path.join(MEDIA_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const file = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(dir, file), buffer);
  return `/media/${folder}/${file}`;
}

// Deletes a file previously returned by saveImage. Ignores external URLs and anything outside MEDIA_DIR.
function removeImage(publicPath) {
  if (typeof publicPath !== "string" || !publicPath.startsWith("/media/")) return;
  const full = path.resolve(MEDIA_DIR, publicPath.slice("/media/".length));
  if (!full.startsWith(MEDIA_DIR + path.sep)) return;
  fs.rm(full, { force: true }, () => {});
}

module.exports = { MEDIA_DIR, decodeImage, saveImage, removeImage };
