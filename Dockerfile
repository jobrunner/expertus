# Zweistufig: bauen, dann nur das Binärprogramm ausliefern. Eine
# Umwandlung der Frontend-Dateien findet weiterhin nicht statt — go:embed
# legt sie unverändert ins Binärprogramm, das Ausgelieferte entspricht
# also nach wie vor dem Repository-Inhalt.
FROM golang:1.21-alpine AS build
WORKDIR /src
# go.sum* passt auch, falls die Datei (noch) fehlt: das Modul hat bislang
# keine Abhängigkeit außerhalb der Standardbibliothek.
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /expertus ./cmd/expertus

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /expertus /expertus

ENV ORTUS_BASE_URL=https://ortus.fieldworksdiary.org \
    HABITATUS_BASE_URL=https://habitatus.fieldworksdiary.org \
    HOSTUS_BASE_URL=https://hostus.fieldworksdiary.org \
    PORT=8080

USER nonroot
EXPOSE 8080
ENTRYPOINT ["/expertus"]
