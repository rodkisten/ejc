#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

info() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
fail() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }
command -v node >/dev/null || fail "Instale Node.js 20 ou superior."
command -v npm >/dev/null || fail "Instale npm."
node -e 'process.exit(Number(process.versions.node.split(".")[0])>=22?0:1)' || fail "Instale Node.js 22 ou superior."
command -v openssl >/dev/null || fail "Instale openssl."
info "Instalando Wrangler (sem GitHub Actions)"
npm install
info "Conferindo autenticação Cloudflare"
if ! npx wrangler whoami; then
  printf '\nFaça login no Cloudflare. No Termius sem navegador, prefira CLOUDFLARE_API_TOKEN.\n'
  npx wrangler login
fi

info "Procurando banco D1"
DB_JSON="$(npx wrangler d1 list --json)"
read_db_id() {
  DB_JSON="$DB_JSON" node - <<'NODE'
const v=JSON.parse(process.env.DB_JSON);
const rows=Array.isArray(v)?v:(v.result||v.databases||[]);
const match=rows.find(x=>x.name==='ejc-mini-mercado');
process.stdout.write(match?.uuid||match?.id||match?.database_id||'');
NODE
}
DB_ID="$(read_db_id)"
if [[ -z "$DB_ID" ]]; then
  info "Criando D1 ejc-mini-mercado"
  npx wrangler d1 create ejc-mini-mercado
  DB_JSON="$(npx wrangler d1 list --json)"
  DB_ID="$(read_db_id)"
fi
[[ "$DB_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || fail "Não foi possível identificar UUID do D1 (verifique manualmente o comando 'wrangler d1 list --json')."
DB_ID="$DB_ID" node - <<'NODE'
const fs=require('fs');const filename='wrangler.jsonc';
const config=JSON.parse(fs.readFileSync(filename,'utf8'));
config.d1_databases[0].database_id=process.env.DB_ID;
fs.writeFileSync(filename,JSON.stringify(config,null,2)+'\n');
console.log('D1 vinculado:',process.env.DB_ID);
NODE

info "Conferindo bucket R2 privado"
if ! npx wrangler r2 bucket list | grep -q 'ejc-mini-mercado-media'; then
  npx wrangler r2 bucket create ejc-mini-mercado-media
fi
info "Aplicando migrations D1 remotas"
npx wrangler d1 migrations apply ejc-mini-mercado --remote
info "Publicando Worker e frontend no Cloudflare"
npm run build
npx wrangler deploy

info "Conferindo segredos do Worker"
SECRETS="$(npx wrangler secret list 2>/dev/null || true)"
if ! grep -q 'SESSION_SECRET' <<<"$SECRETS"; then
  info "Criando SESSION_SECRET aleatório de 64 caracteres (nunca será exibido)"
  openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
fi
if ! grep -q 'ADMIN_PASSWORD' <<<"$SECRETS"; then
  info "Escolha uma senha forte para a coordenação (mínimo 14 caracteres)."
  read -r -s -p 'Senha de administração: ' ADMIN_PASSWORD
  printf '\n'
  [[ ${#ADMIN_PASSWORD} -ge 14 ]] || fail "Senha precisa ter ao menos 14 caracteres."
  printf '%s' "$ADMIN_PASSWORD" | npx wrangler secret put ADMIN_PASSWORD
  unset ADMIN_PASSWORD
fi

info "Concluído. Use a URL informada pelo Wrangler para abrir /admin."
printf 'Antes de divulgar: configure Pix, valor da cartinha, encontristas, teste um pagamento real, e confira áudio e foto.\n'
printf 'Subdomínio personalizado ejc.migos.club: configure no painel Cloudflare > Workers & Pages > Domínios personalizados.\n'
