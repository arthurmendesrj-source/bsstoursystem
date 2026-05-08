const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const owner = 'booking@adatours.com', bucket = 'email-attachments';
  let total = 0;
  while (true) {
    const { data: subs } = await sb.storage.from(bucket).list(owner, { limit: 100 });
    if (!subs || subs.length === 0) break;
    for (const f of subs) {
      const sub = `${owner}/${f.name}`;
      const { data: files } = await sb.storage.from(bucket).list(sub, { limit: 1000 });
      if (!files || files.length === 0) { await sb.storage.from(bucket).remove([sub]); continue; }
      const paths = files.map(x => `${sub}/${x.name}`);
      for (let i = 0; i < paths.length; i += 200) {
        await sb.storage.from(bucket).remove(paths.slice(i, i + 200));
      }
      total += files.length;
    }
    console.log('total', total, new Date().toISOString());
  }
  console.log('FINAL', total);
})();
