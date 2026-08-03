#!/bin/sh
# Activate the public HTTP(S) nginx config only when a TLS certificate is mounted.
#
# The image ships two templates:
#   default.conf.template      — plain :80 (SPA + /api proxy). The safe default:
#                                works locally, in ACA and anywhere without certs.
#   public-tls.conf.template   — :80 ACME + redirect, :443 SPA + /api proxy.
#
# nginx:alpine runs /docker-entrypoint.d/*.sh in name order and 20-envsubst-on-
# templates.sh does the ${VAR} substitution, so this hook (05-) must swap the
# template in BEFORE that. A :443 server block with no certificate makes nginx
# refuse to start, which is why this is conditional rather than unconditional.
set -e

CERT=/etc/nginx/ssl/fullchain.pem
KEY=/etc/nginx/ssl/privkey.pem
TLS_TPL=/etc/nginx/templates/public-tls.conf.template
DEFAULT_TPL=/etc/nginx/templates/default.conf.template

if [ -s "$CERT" ] && [ -s "$KEY" ]; then
    echo "$0: TLS certificate found -> serving public HTTP(S) config (:80 redirect, :443 app)"
    cp "$TLS_TPL" "$DEFAULT_TPL"
else
    echo "$0: no TLS certificate at $CERT -> serving plain :80 config"
fi

# Only default.conf.template must be rendered; drop the alternative so envsubst
# does not emit a second, conflicting server block into /etc/nginx/conf.d/.
rm -f "$TLS_TPL"
