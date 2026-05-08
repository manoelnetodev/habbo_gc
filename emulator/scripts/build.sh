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

# Stable symlink so supervisord doesn't have to track the upstream version bump
# (the Arcturus repo currently builds Habbo-3.5.5-jar-with-dependencies.jar but
# previously was 3.5.0; let the build.sh paper over this).
ln -sf "$(ls -1 /app/arcturus/target/Habbo-*-jar-with-dependencies.jar | head -1)" \
       /app/arcturus/target/Habbo.jar

cp /app/config.ini /app/arcturus/target/config.ini
mkdir -p /app/arcturus/target/plugins
cd /app/arcturus/target/plugins
[ -f NitroWebsockets-3.1.jar ] || wget https://git.krews.org/morningstar/nitrowebsockets-for-ms/-/raw/aff34551b54527199401b343a35f16076d1befd5/target/NitroWebsockets-3.1.jar

supervisorctl start arcturus-emulator

tail -f /dev/null