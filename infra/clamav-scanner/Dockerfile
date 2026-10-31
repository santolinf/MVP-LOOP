# ClamAV scanner for Cloud Run: official clamd + freshclam image plus a small HTTP front (server.mjs).
# Build:  docker build -t clamav-scanner infra/clamav-scanner
FROM clamav/clamav:stable

USER root
RUN apk add --no-cache nodejs
COPY server.mjs /app/server.mjs
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app/start.sh"]
