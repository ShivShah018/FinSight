FROM node:20-bookworm-slim

RUN sed -i 's|http://|https://|g' /etc/apt/sources.list.d/debian.sources \
    && node -e "const fs = require('fs'); const tls = require('tls'); fs.mkdirSync('/etc/ssl/certs', { recursive: true }); fs.writeFileSync('/etc/ssl/certs/ca-certificates.crt', tls.rootCertificates.join('\n'));" \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY server/ml/requirements.txt /tmp/ml-requirements.txt
RUN pip install --no-cache-dir -r /tmp/ml-requirements.txt && rm /tmp/ml-requirements.txt

WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
RUN rm -rf server/node_modules/.cache

USER node

EXPOSE 8080
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.API_PORT || process.env.PORT || 8000) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server/server.js"]
