#!/bin/bash

supervisord -c /app/supervisor/supervisord.conf

# Auto-populate arcturus source. EasyPanel does not run `git submodule update`,
# so /app/arcturus comes up bind-mounted but empty (or with just a `target/`
# volume mounted inside it). Use git init + fetch instead of `git clone` so
# leftover/volume directories don't block the bootstrap.
if [ ! -e /app/arcturus/pom.xml ]; then
  echo "[bootstrap] populating /app/arcturus from Arcturus-Community.git"
  mkdir -p /app/arcturus
  (
    cd /app/arcturus
    git init -q
    git remote remove origin 2>/dev/null || true
    git remote add origin https://git.krews.org/morningstar/Arcturus-Community.git
    git fetch --depth 1 origin HEAD
    git reset --hard FETCH_HEAD
  )
fi

cd /app/arcturus
mvn package
cp /app/config.ini /app/arcturus/target/config.ini
mkdir /app/arcturus/target/plugins
cd /app/arcturus/target/plugins
wget https://git.krews.org/morningstar/nitrowebsockets-for-ms/-/raw/aff34551b54527199401b343a35f16076d1befd5/target/NitroWebsockets-3.1.jar

supervisorctl start arcturus-emulator

tail -f /dev/null