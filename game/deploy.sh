#!/usr/bin/env bash
# Deploy dist/ to cytbilisim.com
set -e

PEM="C:/Users/ickmk/Downloads/klorsispem.pem"
HOST="ubuntu@13.50.45.0"
REMOTE_DIR="/var/www/vhosts/cytbilisim.com/frostborn/game"

npm run build

tar czf /tmp/frostborn_dist.tar.gz -C dist .
scp -i "$PEM" -o ConnectTimeout=30 /tmp/frostborn_dist.tar.gz "$HOST:/tmp/"
ssh -i "$PEM" -o ConnectTimeout=30 "$HOST" \
  "sudo rm -rf $REMOTE_DIR/* && sudo tar xzf /tmp/frostborn_dist.tar.gz -C $REMOTE_DIR/ && rm /tmp/frostborn_dist.tar.gz && echo deployed"

rm /tmp/frostborn_dist.tar.gz
echo "Done → https://cytbilisim.com/frostborn/game/"
