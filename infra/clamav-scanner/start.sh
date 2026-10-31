#!/bin/sh
# Start the image's own init (freshclam update, then clamd on 3310) in the background, then the HTTP front.
# The front's /healthz stays 503 until clamd answers, so Cloud Run sends no traffic before signatures are loaded.
/init &
exec node /app/server.mjs
