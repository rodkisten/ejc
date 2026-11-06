#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."

info() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
fail() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }
trap 'code=$?; if ((code)); then printf "\nDeploy interrompido (código %s).\n" "$code" >&2; fi' EXIT

DB_NAME=ejc-mini-mercado
BUCKET=ejc-mini-mercado-media
CONFIG=.wrangler.deploy.jsonc

command -v node >/dev/null || fail "Instale Node.js 22+."
command -v npm >/dev/null || fail "Instale npm."
command -v openssl >/dev/null || fail "Instale openssl."
node -e 'process.exit(Number(process.versions.node.split(".")[0])>=22?0:1)' || fail "Instale Node.js 22+."

info "Instalando dependências"
npm install --no-audit --no-fund
wrangler() { npx --no-install wrangler "$@"; }
# O package-lock existente mantém Wrangler 4.86 para build/deploy.
# O login remoto por código é executado com Wrangler mais recente, sob demanda.

info "Verificando autenticação Cloudflare"
if ! wrangler whoami >/dev/null 2>&1; then
  if [[ -v CLOUDFLARE_API_TOKEN ]]; then
    fail "Token Cloudflare presente mas sem permissão ou inválido."
  fi
  info "No Safari, abra https://dash.cloudflare.com/oauth2/device e digite o código exibido."
  npx --yes wrangler@latest login --device --browser=false
  wrangler whoami >/dev/null || fail "Não foi possível autenticar."
fi

info "Procurando banco de dados D1"
DB_LIST="$(wrangler d1 list --json)" || fail "Falha ao listar D1."
db_id() {
  printf '%s' "$DB_LIST" | node -e '
    let data="";process.stdin.on("data",x=>data+=x).on("end",()=>{
      const list=JSON.parse(data),rows=Array.isArray(list)?list:(list.result||list.databases||[]);
      const row=rows.find(x=>x.name==="ejc-mini-mercado");
      process.stdout.write(row?.uuid||row?.id||row?.database_id||"");
    });'
}
DB_ID="$(db_id)" || fail "A resposta do Wrangler para D1 não é JSON válido."
if [[ -z "$DB_ID" ]]; then
  info "Criando D1 somente na primeira instalação"
  wrangler d1 create "$DB_NAME" || fail "Falha ao criar D1."
  DB_LIST="$(wrangler d1 list --json)" || fail "Falha ao consultar D1 após criação."
  DB_ID="$(db_id)"
fi
[[ "$DB_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || fail "D1 não retornou um UUID válido."

info "Gerando configuração local, ignorada pelo Git"
DB_ID="$DB_ID" CONFIG="$CONFIG" node <<'NODE'
const fs=require('node:fs');
const config=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
const d1=config.d1_databases?.find(item=>item.binding==='DB');
if(!d1)throw Error('Binding DB ausente no wrangler.jsonc');
d1.database_id=process.env.DB_ID;
fs.writeFileSync(process.env.CONFIG,JSON.stringify(config,null,2)+'\n',{mode:0o600});
console.log('D1 conectado:',d1.database_name);
NODE

info "Verificando armazenamento privado R2"
if ! wrangler r2 bucket info "$BUCKET" --json >/dev/null 2>&1; then
  wrangler r2 bucket create "$BUCKET" || fail "R2 indisponível. Verifique ativação e permissões."
  wrangler r2 bucket info "$BUCKET" --json >/dev/null || fail "R2 ainda indisponível."
fi

info "Validando API, testes automatizados e build antes do deploy"
npm run check || fail "Corrija as falhas dos testes antes de publicar."
npm run build || fail "Build React falhou."
[[ -s dist/index.html ]] || fail "Vite não gerou dist/index.html."

info "Aplicando migrações na D1 remota"
wrangler d1 migrations apply "$DB_NAME" --remote --config "$CONFIG" ||
  fail "Migração remota falhou; deploy não iniciado."

info "Publicando Worker e arquivos estáticos"
wrangler deploy --config "$CONFIG" || fail "Falha no deploy; verifique os logs acima."

info "Criando somente os segredos que faltam"
SECRETS="$(wrangler secret list --config "$CONFIG")" || fail "Falha ao consultar secrets."
if ! grep -q 'SESSION_SECRET' <<<"$SECRETS"; then
  openssl rand -hex 32 | wrangler secret put SESSION_SECRET --config "$CONFIG" >/dev/null
fi
if ! grep -q 'ADMIN_PASSWORD' <<<"$SECRETS"; then
  if [[ ! -v ADMIN_PASSWORD ]]; then
    [[ -t 0 ]] || fail "Defina ADMIN_PASSWORD em um terminal interativo."
    printf 'Senha de administração (14+ caracteres): '
    read -r -s ADMIN_PASSWORD
    printf '\n'
  fi
  [[ $(printf '%s' "$ADMIN_PASSWORD" | wc -c) -ge 14 ]] || fail "Senha muito curta."
  printf '%s' "$ADMIN_PASSWORD" | wrangler secret put ADMIN_PASSWORD --config "$CONFIG" >/dev/null
  unset ADMIN_PASSWORD
fi

info "Verificação final"
if [[ -v EJC_PUBLIC_URL ]] && [[ -n "$EJC_PUBLIC_URL" ]]; then
  command -v curl >/dev/null || fail "Instale curl para testar a URL publicada."
  curl --fail --silent --show-error --max-time 20 "$EJC_PUBLIC_URL/api/health" ||
    fail "O health check remoto de D1/R2 falhou."
else
  printf 'Para validar o site: curl https://DOMINIO_DO_WORKER/api/health\n'
fi
info "Concluído. Teste Pix real e o Safari antes de divulgar os QR Codes."
