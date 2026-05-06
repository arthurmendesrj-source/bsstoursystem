import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sh = (sql) => execFileSync('psql', ['-v','ON_ERROR_STOP=1','-At','-c', sql], { encoding:'utf8' }).trim();
const q = (v) => v == null ? 'NULL' : `'${String(v).replaceAll("'","''")}'`;

const manifest = JSON.parse(fs.readFileSync('/mnt/documents/hoteis_upload_manifest.json','utf8'));
const extracted = JSON.parse(fs.readFileSync('/mnt/documents/hoteis_extracted.json','utf8'));
const extractedBySource = new Map(extracted.map(e => [e.manifest.source_path, e.info]));
const done = new Set(sh("select notes from supplier_documents where notes like 'HOTEIS /%'").split('\n').filter(Boolean));

// Manual fallback for files without extraction
const manual = {
  'Apresentação Pedra da Laguna Hotel Boutique & Spa (2).pdf': {hotel_name:'Pedra da Laguna Hotel Boutique & Spa', address_city:'Búzios', address_country:'Brasil', default_currency:'BRL'},
  'SANMA Hotel 2026.pdf': {hotel_name:'Sanma Hotel', address_city:'Foz do Iguaçu', address_country:'Brasil', default_currency:'BRL'},
  ' SANTA ROSA 2026.pdf': {hotel_name:'Pousada Santa Rosa Pantanal', address_city:'Pantanal Norte', address_country:'Brasil', default_currency:'BRL'},
  'REGISTRO DE EMPRESAS.pdf': {hotel_name:'Luna Salada Hotel', address_city:'Uyuni', address_country:'Bolívia', default_currency:'USD'},
  'Alto Calafate 2026-2027.pdf': {hotel_name:'Alto Calafate Hotel', address_city:'El Calafate', address_country:'Argentina', default_currency:'USD'},
  'Hoteis Asociados by Casa Andina 2026.pdf': {hotel_name:'Casa Andina Hoteis Asociados', address_city:'Lima', address_country:'Peru', default_currency:'USD'},
  'REMOTA.pdf': {hotel_name:'Hotel Remota', address_city:'Puerto Natales', address_country:'Chile', default_currency:'USD'},
  'TERRANTAI TARIFARIO STANDARD - 2026 & 2027.pdf': {hotel_name:'Terrantai Lodge', address_city:'San Pedro de Atacama', address_country:'Chile', default_currency:'USD'},
  'Vinnhaus Politicas 2026-27.pdf': {hotel_name:'Vinnhaus', address_city:'Puerto Natales', address_country:'Chile', default_currency:'USD'},
  'Vinnhaus Tarifas rack 2026-27.pdf': {hotel_name:'Vinnhaus', address_city:'Puerto Natales', address_country:'Chile', default_currency:'USD'},
  'Vinnhaus INTRO ESPAÑOL 2024.pdf': {hotel_name:'Vinnhaus', address_city:'Puerto Natales', address_country:'Chile', default_currency:'USD'},
  'Palacio Tangara 2026.pdf': {hotel_name:'Palácio Tangará', address_city:'São Paulo', address_country:'Brasil', default_currency:'BRL'},
  'VILLABELUNO.pdf': {hotel_name:'Villa Beluno', address_city:'Bariloche', address_country:'Argentina', default_currency:'USD'},
};

const norm = (s) => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const pickCurrency = (c) => { c=(c||'BRL').toUpperCase(); return ['BRL','USD','EUR','ARS','CLP','PEN','UYU','COP','MXN','GBP','CAD'].includes(c)?c:'USD'; };

const missing = manifest.filter(m => !done.has(m.source_path));
console.log('Pendentes:', missing.length);

// Group by hotel
const groups = new Map();
for (const m of missing) {
  const info = extractedBySource.get(m.source_path) || manual[m.original_filename] || {hotel_name: m.hotel_folder || m.original_filename.replace(/\.pdf$/i,''), address_city: m.city, address_country: m.country};
  const name = info.hotel_name;
  const city = info.address_city || null;
  const key = norm(name) + '|' + norm(city||'');
  if (!groups.has(key)) groups.set(key, { name, city, country: info.address_country||null, state: info.address_state||null, currency: pickCurrency(info.default_currency), docs: [] });
  groups.get(key).docs.push(m);
}

let created=0, reused=0, attached=0, skipped=0;
const adminUser = sh("select user_id from user_roles where role='admin' limit 1") || null;

for (const g of groups.values()) {
  let id = sh(`select id from suppliers where category='hotel' and lower(unaccent(name))=lower(unaccent(${q(g.name)})) and coalesce(lower(unaccent(address_city)),'')=coalesce(lower(unaccent(${q(g.city)})),'') limit 1;`);
  if (!id) {
    const code = 'FOR-HOT-' + Math.random().toString(36).slice(2,10).toUpperCase();
    id = sh(`with x as (insert into suppliers (name, category, status, address_city, address_state, address_country, default_currency, code${adminUser?', created_by':''}) values (${q(g.name)},'hotel','ativo',${q(g.city)},${q(g.state)},${q(g.country)},${q(g.currency)}::currency_code,${q(code)}${adminUser?','+q(adminUser):''}) returning id) select id from x;`);
    created++;
    console.log('CREATED', g.name, '->', id);
  } else { reused++; console.log('REUSED ', g.name, '->', id); }

  for (const m of g.docs) {
    const oldPath = m.storage_path;
    const finalPath = `${id}/${path.basename(oldPath)}`;
    // Copy in storage (idempotent)
    const exists = await sb.storage.from('supplier-docs').list(id, { search: path.basename(oldPath) });
    const has = (exists.data||[]).some(o => o.name === path.basename(oldPath));
    if (!has) {
      const r = await sb.storage.from('supplier-docs').copy(oldPath, finalPath);
      if (r.error && !String(r.error.message).toLowerCase().includes('exist')) {
        // try download then upload
        const dl = await sb.storage.from('supplier-docs').download(oldPath);
        if (dl.error) { console.log('SKIP (no source)', oldPath, dl.error.message); continue; }
        const buf = Buffer.from(await dl.data.arrayBuffer());
        const up = await sb.storage.from('supplier-docs').upload(finalPath, buf, { contentType: 'application/pdf', upsert: true });
        if (up.error) { console.log('UPLOAD ERR', up.error.message); continue; }
      }
    }
    const dupe = sh(`select id from supplier_documents where supplier_id=${q(id)} and storage_path=${q(finalPath)} limit 1;`);
    if (dupe) { skipped++; continue; }
    sh(`insert into supplier_documents (supplier_id, original_filename, storage_path, file_format, file_size_bytes, kind, year, notes) values (${q(id)},${q(m.original_filename)},${q(finalPath)},'pdf',${m.size||'NULL'},'tarifario',${m.year||'NULL'},${q(m.source_path)});`);
    attached++;
  }
}

console.log(JSON.stringify({missing: missing.length, groups: groups.size, created, reused, attached, skipped}, null, 2));
