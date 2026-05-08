supervisord -c /app/supervisor/supervisord.conf

# Auto-populate any submodule whose mounted directory is empty. EasyPanel
# clones the parent repo but does not run `git submodule update`. Use git
# init + fetch + reset because some target dirs already have a `node_modules`
# volume mount inside them and `git clone` refuses non-empty directories.
populate_if_empty() {
  local target="$1"
  local url="$2"
  local sentinel="$3"
  if [ -e "${target}/${sentinel}" ]; then
    return 0
  fi
  echo "[bootstrap] populating ${target} from ${url}"
  mkdir -p "${target}"
  (
    cd "${target}"
    git init -q
    git remote remove origin 2>/dev/null || true
    git remote add origin "${url}"
    git fetch --depth 1 origin HEAD
    git reset --hard FETCH_HEAD
  )
}

populate_if_empty /app/nitro-converter https://github.com/billsonnn/nitro-converter.git package.json
populate_if_empty /app/nitro-swf       https://git.krews.org/morningstar/arcturus-morningstar-default-swf-pack.git gordon
populate_if_empty /app/nitro-assets    https://git.krews.org/nitro/default-assets.git README.md

mkdir -p /app/nitro-assets/gamedata
cp -f /app/configuration/gamedata-overrides/*.json /app/nitro-assets/gamedata/ 2>/dev/null || true

python3 /app/scripts/unlock-figure.py /app/nitro-assets/gamedata/FigureData.json || true

cp /app/configuration/nitro-converter/configuration.json /app/nitro-converter/src/configuration.json
cd /app/nitro-converter
for i in 1 2 3 4 5; do
  yarn install --network-timeout 600000 --network-concurrency 1 && break
  echo "yarn install (nitro-converter) failed, retry $i/5"; sleep 5
done

cp /app/configuration/nitro-react/public/* /app/nitro-react/public/

# Resolve __HTTP__ / __WS__ placeholders in renderer-config.json from env.
PUBLIC_HOST="${PUBLIC_HOST:-localhost:8090}"
if [ "${PUBLIC_TLS:-0}" = "1" ]; then
  PROTO_HTTP="https"
  PROTO_WS="wss"
else
  PROTO_HTTP="http"
  PROTO_WS="ws"
fi
sed -i \
  -e "s|__HTTP__|${PROTO_HTTP}://${PUBLIC_HOST}|g" \
  -e "s|__WS__|${PROTO_WS}://${PUBLIC_HOST}|g" \
  /app/nitro-react/public/renderer-config.json
echo "renderer-config: HTTP=${PROTO_HTTP}://${PUBLIC_HOST} WS=${PROTO_WS}://${PUBLIC_HOST}"
cd /app/nitro-react
for i in 1 2 3 4 5; do
  yarn install --network-timeout 600000 --network-concurrency 1 && break
  echo "yarn install (nitro-react) failed, retry $i/5"; sleep 5
done

supervisorctl start swf-http-server
supervisorctl start assets-http-server
supervisorctl start nitro-dev-server

# First-boot SWF → .nitro conversion. The converter consumes /app/nitro-swf
# (cloned above) and writes into /app/nitro-converter/assets, which we then
# rsync into /app/nitro-assets so the running assets-http-server can serve
# them. Heavy: ~30-90 min for ~10k furniture SWFs depending on the VPS.
# Re-runs on subsequent boots are no-ops because each iteration of the
# converter skips files that already exist on disk.
if [ ! -f /app/nitro-assets/gamedata/ExternalTexts.json ]; then
  echo "[bootstrap] generating nitro assets from SWFs — this takes ~30-90 min on first boot"
  cp /app/configuration/nitro-converter/configuration.json /app/nitro-converter/configuration.json
  (
    cd /app/nitro-converter
    yarn ts-node-dev --transpile-only src/Main.ts
  )
  rsync -r /app/nitro-converter/assets/* /app/nitro-assets/
  cp -f /app/configuration/gamedata-overrides/*.json /app/nitro-assets/gamedata/ 2>/dev/null || true
  python3 /app/scripts/unlock-figure.py /app/nitro-assets/gamedata/FigureData.json || true
  echo "[bootstrap] asset conversion done"
fi

tail -f /dev/null