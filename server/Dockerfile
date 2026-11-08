FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV VOCFLOW_CLOUD_HOST=0.0.0.0
ENV VOCFLOW_CLOUD_DATA_DIR=/app/data

COPY --chown=node:node cloud-server.cjs ./cloud-server.cjs
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>r.json()).then(x=>process.exit(x.ok===true&&x.service==='vocflow-cloud'&&x.adminReady===true?0:1)).catch(()=>process.exit(1))"

CMD ["node", "cloud-server.cjs"]
