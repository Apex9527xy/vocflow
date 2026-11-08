# VocFlow API Worker

Cloudflare Worker replacement for the lightweight `vocflow-cloud` HTTP service.

Endpoints:

- `GET /health`
- `GET /api/ad-config`
- `GET /api/app-update/manifest`
- `GET /api/app-update/download/:file`

Update assets are read from the latest GitHub Release in `Apex9527xy/vocflow`. The optional `AD_CONFIG_JSON` Worker variable may contain the ad configuration JSON. Do not commit credentials, tokens, user files, or private keys here.
