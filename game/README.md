# Frostborn Game

## Dev

```bash
npm run dev       # local dev server
npm run build     # production build → dist/
node preflight.js # automated tests (41 PASS expected)
```

## Deploy

**Server:** ubuntu@13.50.45.0 · target: `/var/www/vhosts/cytbilisim.com/frostborn/game/`  
**Key:** `C:/Users/ickmk/Downloads/klorsispem.pem`

```bash
bash deploy.sh
```

Or manually:
```bash
npm run build
tar czf /tmp/frostborn_dist.tar.gz -C dist .
scp -i "C:/Users/ickmk/Downloads/klorsispem.pem" -o ConnectTimeout=30 \
  /tmp/frostborn_dist.tar.gz ubuntu@13.50.45.0:/tmp/
ssh -i "C:/Users/ickmk/Downloads/klorsispem.pem" ubuntu@13.50.45.0 \
  "sudo rm -rf /var/www/vhosts/cytbilisim.com/frostborn/game/* && \
   sudo tar xzf /tmp/frostborn_dist.tar.gz -C /var/www/vhosts/cytbilisim.com/frostborn/game/ && \
   rm /tmp/frostborn_dist.tar.gz"
```

Live URL: https://cytbilisim.com/frostborn/game/
