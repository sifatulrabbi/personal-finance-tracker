FROM oven/bun:1.3.12-alpine AS frontend
WORKDIR /src/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build && bun test src/lib

FROM golang:1.27.0-alpine AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
RUN go test ./... && CGO_ENABLED=0 go build -trimpath -o /out/server ./cmd/server && CGO_ENABLED=0 go build -trimpath -o /out/hash-password ./cmd/hash-password

FROM alpine:3.23
RUN addgroup -g 10001 finance && adduser -D -u 10001 -G finance finance && mkdir -p /data && chown finance:finance /data
WORKDIR /app
COPY --from=backend /out/server /out/hash-password /app/
COPY --from=frontend /src/web/dist /app/web
ENV DATABASE_PATH=/data/finance.sqlite WEB_DIR=/app/web LISTEN_ADDR=:47831
USER finance
EXPOSE 47831
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1:47831/healthz || exit 1
ENTRYPOINT ["/app/server"]
