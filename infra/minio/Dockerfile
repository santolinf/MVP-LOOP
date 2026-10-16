FROM golang:alpine AS builder

RUN apk add --no-cache git ca-certificates

RUN CGO_ENABLED=0 go install -v -ldflags="-s -w" github.com/minio/minio@latest && \
    CGO_ENABLED=0 go install -v -ldflags="-s -w" github.com/minio/mc@latest

FROM alpine:3.20

RUN apk add --no-cache bash ca-certificates

COPY --from=builder /go/bin/minio /usr/local/bin/minio
COPY --from=builder /go/bin/mc /usr/local/bin/mc

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 9000 9001
VOLUME ["/data"]

ENTRYPOINT ["/entrypoint.sh"]
