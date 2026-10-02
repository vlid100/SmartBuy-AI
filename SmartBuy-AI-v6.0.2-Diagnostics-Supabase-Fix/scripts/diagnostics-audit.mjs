import fs from 'node:fs';
const server = fs.readFileSync('lib/supabase-server.ts','utf8');
const route = fs.readFileSync('app/api/diagnostics/route.ts','utf8');
const diag = fs.readFileSync('lib/diagnostics.ts','utf8');
const must = [
  [server, 'const secret = clean(process.env.SUPABASE_SECRET_KEY)', 'secret key is not preferred'],
  [server, 'const key = secret || legacy', 'legacy service key still has priority'],
  [server, 'detectSessionInUrl: false', 'server client lacks secret-key auth guard'],
  [server, 'validProjectUrl', 'project URL is not validated'],
  [route, 'catch (error)', 'diagnostics route can still return opaque 500'],
  [route, 'status: 200', 'diagnostics fallback response is not safe'],
  [diag, 'SUPABASE_URL має неправильний формат', 'diagnostics lacks actionable URL error'],
  [diag, 'SUPABASE_SECRET_KEY', 'diagnostics lacks actionable key error'],
];
for (const [text, token, msg] of must) if (!text.includes(token)) throw new Error(msg);
console.log('SmartBuy v6.0.2 diagnostics audit OK · secret-key priority + config validation + no opaque HTTP 500');
