import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const ROOT = "/tmp/hoteis_unzipped";
const BUCKET = "supplier-docs";

// Decode "#U00c7" style sequences
const decodeName = (s) =>
  s.replace(/#U([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const slugify = (s) =>
  decodeName(s).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) out.push(p);
  }
  return out;
}

const files = await walk(ROOT);
console.log(`Found ${files.length} PDFs`);

// Dedup by relative path (same content appears in both zips for 2027 Vivaz)
const seen = new Set();
const unique = [];
for (const f of files) {
  const rel = decodeName(path.relative(ROOT, f));
  // Normalize: 2027 zip has "2027/..." while main has "HOTEIS /2027/..."
  const key = rel.replace(/^HOTEIS\s*\//, "").replace(/^2027\//, "BRASIL_extra/2027/");
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push({ abs: f, rel });
}
console.log(`After dedup: ${unique.length} PDFs`);

const manifest = [];
let ok = 0, fail = 0, bytes = 0;

const concurrency = 5;
let idx = 0;
async function worker() {
  while (idx < unique.length) {
    const i = idx++;
    const { abs, rel } = unique[i];
    try {
      const buf = await fs.readFile(abs);
      const parts = rel.split("/").filter(Boolean);
      // Expected: HOTEIS / <year> / <country> / <city> / [hotel_folder] / file.pdf
      // OR (2027 zip): 2027 / <country> / <city> / file.pdf
      let year, country, city, hotelFolder, fname;
      if (parts[0].toLowerCase().startsWith("hoteis")) {
        const [, y, co, ci, ...rest] = parts;
        year = y; country = co; city = ci;
        fname = rest.pop();
        hotelFolder = rest.length ? rest.join(" / ") : null;
      } else {
        year = parts[0];
        country = parts[1];
        city = parts[2];
        const rest = parts.slice(3);
        fname = rest.pop();
        hotelFolder = rest.length ? rest.join(" / ") : null;
      }
      const baseName = path.basename(fname, ".pdf");
      const uniqueId = crypto.randomBytes(4).toString("hex");
      const storagePath = `pending/${uniqueId}-${slugify(baseName)}.pdf`;

      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
        contentType: "application/pdf", upsert: false,
      });
      if (error) throw error;

      manifest.push({
        storage_path: storagePath,
        original_filename: decodeName(fname),
        size: buf.length,
        year: Number(year) || null,
        country, city, hotel_folder: hotelFolder,
        source_path: rel,
      });
      ok++; bytes += buf.length;
      if (ok % 10 === 0) console.log(`  uploaded ${ok}/${unique.length}`);
    } catch (e) {
      fail++;
      manifest.push({ source_path: rel, error: e.message });
      console.error(`FAIL ${rel}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

await fs.mkdir("/mnt/documents", { recursive: true });
await fs.writeFile("/mnt/documents/hoteis_upload_manifest.json", JSON.stringify(manifest, null, 2));

console.log(`\nDone: ok=${ok} fail=${fail} bytes=${(bytes/1e6).toFixed(2)}MB`);
console.log(`Manifest: /mnt/documents/hoteis_upload_manifest.json`);
