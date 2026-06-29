import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

if (!url || !anonKey) {
  console.warn("SUPABASE_URL or SUPABASE_ANON_KEY is missing. Keeping local supabase-config.js unchanged.");
  process.exit(0);
}

const configScript = `window.KITAKU_SUPABASE_CONFIG = ${JSON.stringify({ url, anonKey }, null, 2)};\n`;

writeFileSync("supabase-config.js", configScript, "utf8");

const indexPath = "index.html";
const indexHtml = readFileSync(indexPath, "utf8");
const inlineConfigPattern = /window\.KITAKU_SUPABASE_CONFIG\s*=\s*\{[\s\S]*?\};/;
if (inlineConfigPattern.test(indexHtml)) {
  writeFileSync(indexPath, indexHtml.replace(inlineConfigPattern, configScript.trim()), "utf8");
}

console.log("Supabase browser config generated from environment variables.");
