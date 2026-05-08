#!/bin/bash

supervisord -c /app/supervisor/supervisord.conf

# Auto-clone arcturus source if the mounted directory is empty (EasyPanel
# does not run `git submodule update` after cloning the parent repo).
if [ ! -e /app/arcturus/pom.xml ]; then
  echo "[bootstrap] cloning Arcturus into /app/arcturus"
  rm -rf /app/arcturus
  git clone --depth 1 https://git.krews.org/morningstar/Arcturus-Community.git /app/arcturus
fi

cd /app/arcturus
mvn package
cp /app/config.ini /app/arcturus/target/config.ini
mkdir /app/arcturus/target/plugins
cd /app/arcturus/target/plugins
wget https://git.krews.org/morningstar/nitrowebsockets-for-ms/-/raw/aff34551b54527199401b343a35f16076d1befd5/target/NitroWebsockets-3.1.jar

supervisorctl start arcturus-emulator

tail -f /dev/null