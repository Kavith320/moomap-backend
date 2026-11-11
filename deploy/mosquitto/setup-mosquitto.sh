#!/bin/bash
# Installs the MooMap Mosquitto config. Run with sudo from the repo root:
#   sudo deploy/mosquitto/setup-mosquitto.sh
# Prints the generated passwords once. Re-running keeps existing users unless --reset-passwords.
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }

STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p /etc/mosquitto/backup-$STAMP
cp -a /etc/mosquitto/conf.d /etc/mosquitto/backup-$STAMP/ 2>/dev/null || true
[ -f /etc/mosquitto/passwd ] && cp -a /etc/mosquitto/passwd /etc/mosquitto/backup-$STAMP/ || true
[ -f /etc/mosquitto/acl ] && cp -a /etc/mosquitto/acl /etc/mosquitto/backup-$STAMP/ || true
echo "backup: /etc/mosquitto/backup-$STAMP"

touch /etc/mosquitto/passwd
for u in backend simulator collar; do
  if [ "${1:-}" = "--reset-passwords" ] || ! grep -q "^$u:" /etc/mosquitto/passwd; then
    pw=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
    mosquitto_passwd -b /etc/mosquitto/passwd "$u" "$pw"
    echo "MQTT user $u password: $pw"
  fi
done
# Mosquitto 2.x wants these owned by mosquitto, group root, not readable by others
install -m 0600 -o mosquitto -g root acl /etc/mosquitto/acl
chown mosquitto:root /etc/mosquitto/passwd && chmod 0600 /etc/mosquitto/passwd

rm -f /etc/mosquitto/conf.d/default.conf
install -m 0644 moomap.conf /etc/mosquitto/conf.d/moomap.conf
if [ ! -f /etc/mosquitto/conf.d/bridge-external.conf ]; then
  install -m 0600 -o mosquitto -g root bridge-external.conf /etc/mosquitto/conf.d/bridge-external.conf
fi

systemctl restart mosquitto
sleep 2
systemctl is-active mosquitto && journalctl -u mosquitto -n 15 --no-pager
