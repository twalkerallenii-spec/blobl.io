# syntax=docker/dockerfile:1

# ---- Build the Go game server ----
FROM golang:1.23-alpine AS build
WORKDIR /src

# Cache module downloads
COPY server/go.mod server/go.sum ./
RUN go mod download

# Build the server binary
COPY server/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ./main

# ---- Runtime image ----
FROM alpine:3.20
WORKDIR /app

# Game server binary
COPY --from=build /out/server /app/server

# Runtime data loaded via a path relative to the working dir
# (server reads "data/skins.json"), and the browser client served as static files.
COPY server/main/data/ /app/data/
COPY client/ /app/client/

ENV CLIENT_DIR=/app/client
# Render injects PORT; default for local `docker run`.
ENV PORT=10000
EXPOSE 10000

CMD ["/app/server"]
