#!/bin/sh
# Activate the public HTTP(S) nginx config only when a TLS certificate is mounted.
#
# The image ships two configs:
#   /etc/nginx/templates/default.conf.template  — plain :80 (SPA + /api proxy).
#       The safe default: works locally, in ACA and anywhere without certs.
#   /etc/nginx/public-tls.conf.template         — :80 ACME + redirect, :443 app.
#       Deliberately NOT under templates/, or nginx's envsubst step would render
#       it into a second, conflicting server block.
#
# nginx:alpine runs /docker-entrypoint.d/*.sh in name order and 20-envsubst-on-
# templates.sh does the ${VAR} substitution, so this hook (05-) must swap the
# config in BEFORE that. A :443 server block with no certificate makes nginx
# refuse to start, which is why this is conditional rather than unconditional.
#
# This runs again on every container restart, not just on first boot, so it must
# stay idempotent: it only ever copies, never moves or deletes. An earlier version
# removed the source template after copying and crash-looped the container the
# first time docker restarted it.
set -e

CERT=/etc/nginx/ssl/fullchain.pem
KEY=/etc/nginx/ssl/privkey.pem
TLS_CONF=/etc/nginx/public-tls.conf.template
DEFAULT_TPL=/etc/nginx/templates/default.conf.template

if [ -s "$CERT" ] && [ -s "$KEY" ] && [ -f "$TLS_CONF" ]; then
    echo "$0: TLS certificate found -> serving public HTTP(S) config (:80 redirect, :443 app)"
    cp "$TLS_CONF" "$DEFAULT_TPL"
else
    echo "$0: no TLS certificate at $CERT -> serving plain :80 config"
fi
