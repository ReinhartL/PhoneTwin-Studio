#!/bin/sh
set -eu

mac_ip="${1:-}"
if [ -z "$mac_ip" ]; then
  echo "Usage: ./scripts/generate-dev-cert.sh <mac-lan-ip>" >&2
  exit 1
fi

mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certs/dev-key.pem \
  -out certs/dev-cert.pem \
  -subj "/CN=$mac_ip" \
  -addext "subjectAltName=DNS:localhost,IP:$mac_ip"

echo "Created certs/dev-cert.pem and certs/dev-key.pem for $mac_ip"
