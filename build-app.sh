#!/usr/bin/env bash
# Builds the static-export APK shell. API routes are a server concern and
# cannot exist in a static export, so they are moved aside for the duration
# of this build and restored afterwards. The normal web build is untouched.
set -euo pipefail
cd "$(dirname "$0")"

moved=0
if [ -d src/app/api ]; then
  mv src/app/api /tmp/control-dashboard-api-$$
  moved=1
fi
cleanup() {
  if [ "$moved" = "1" ] && [ -d /tmp/control-dashboard-api-$$ ]; then
    mv /tmp/control-dashboard-api-$$ src/app/api
  fi
}
trap cleanup EXIT

CAPACITOR_BUILD=1 NEXT_PUBLIC_API_BASE=https://ashar-control.vercel.app npm run build
