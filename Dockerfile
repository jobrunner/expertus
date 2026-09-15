# Kein Build-Schritt: das Quellverzeichnis wird unverändert ausgeliefert.
# Damit ist das Ausgelieferte identisch mit dem, was im Repository steht.
FROM nginx:alpine

COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY docker/entrypoint.sh /docker-entrypoint.d/40-expertus-config.sh
COPY index.html styles.css /usr/share/nginx/html/
COPY src/ /usr/share/nginx/html/src/

# Das Basis-Image geht davon aus, dass der Entrypoint als root läuft und die
# Rechte an nginx abgibt (per "user"-Direktive). Hier läuft der Prozess von
# Anfang an als nginx — deshalb müssen die Verzeichnisse, in die nginx beim
# Start schreibt (Cache, PID-Datei, das aus dem Template erzeugte conf.d),
# vorab an nginx übergeben werden.
RUN chmod +x /docker-entrypoint.d/40-expertus-config.sh \
 && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /etc/nginx/conf.d /run \
 && touch /run/nginx.pid && chown nginx:nginx /run/nginx.pid

ENV ORTUS_BASE_URL=https://ortus.fieldworksdiary.org \
    HABITATUS_BASE_URL=https://habitatus.fieldworksdiary.org \
    HOSTUS_BASE_URL=https://hostus.fieldworksdiary.org \
    NGINX_PORT=8080

USER nginx
EXPOSE 8080
