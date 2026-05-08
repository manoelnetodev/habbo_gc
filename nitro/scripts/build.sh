supervisord -c /app/supervisor/supervisord.conf

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

tail -f /dev/null