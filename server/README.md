# VocFlow Cloud

VocFlow 鐨勫惎鍔ㄥ箍鍛婂拰鍦ㄧ嚎鏇存柊娓呭崟鏈嶅姟銆傛湇鍔＄鍙緷璧?Node.js 鍐呯疆妯″潡锛岄粯璁ゆ暟鎹洰褰曚负 `server/data`銆?
榛樿鏈湴鍦板潃锛歚http://127.0.0.1:8787`銆傛寮忕敤鎴锋瀯寤哄彧鑳借繛鎺ュ浐瀹氱殑 HTTPS 鍦板潃锛屽繀椤诲湪鏋勫缓鏃堕€氳繃 `VOCFLOW_CLOUD_URL` 鍐欏叆銆?
## 鐢熶骇閮ㄧ讲锛圖ocker + Caddy锛?
鎺ㄨ崘浣跨敤鏈洰褰曚腑鐨?`Dockerfile`銆乣docker-compose.yml` 鍜?`Caddyfile`銆侰addy 浼氳嚜鍔ㄧ敵璇峰苟缁湡 TLS 璇佷功锛屼簯鏈嶅姟瀹瑰櫒浠ラ潪 root 鐢ㄦ埛杩愯锛屾暟鎹繚瀛樺湪 Docker 鍛藉悕鍗蜂腑銆?
### 鍓嶇疆鏉′欢

- 涓€涓湡瀹炲煙鍚嶏紝渚嬪 `cloud.your-domain.com`锛屽叾 DNS A/AAAA 璁板綍宸叉寚鍚戞湇鍔″櫒銆?- 浜戞湇鍔″櫒宸插紑鏀?TCP `80`銆乣443` 鍜?UDP `443`銆?- 宸插畨瑁?Docker Engine 涓?Docker Compose v2銆?- 鏈嶅姟鍣ㄦ椂闂存纭紝鍩熷悕鑳藉浠庡叕缃戣В鏋愬埌璇ユ湇鍔″櫒銆?
### 鍚姩姝ラ

1. 杩涘叆 `server` 鐩綍骞跺垱寤虹敓浜ч厤缃細

```powershell
Set-Location server
Copy-Item .env.example .env
```

2. 缂栬緫 `.env`锛屼笉瑕佷繚鐣欑ず渚嬪€硷細

```dotenv
VOCFLOW_DOMAIN=cloud.your-domain.com
VOCFLOW_PUBLIC_URL=https://cloud.your-domain.com
VOCFLOW_ADMIN_EMAIL=admin@cloud.your-domain.com
VOCFLOW_ADMIN_PASSWORD=replace-with-a-random-password
VOCFLOW_ALLOW_FIRST_USER_ADMIN=0
PORT=8787
```

蹇呴』鎶婂煙鍚嶃€佺鐞嗗憳閭鍜屽瘑鐮佸叏閮ㄦ浛鎹负鐪熷疄鍊笺€俙VOCFLOW_PUBLIC_URL` 蹇呴』鏄函 HTTPS 绔欑偣鏍瑰湴鍧€锛屼笉鑳藉甫璺緞銆佹煡璇㈠弬鏁般€侀敋鐐广€佽处鍙峰瘑鐮佹垨鍥炵幆鍦板潃銆傜鐞嗗憳瀵嗙爜鑷冲皯 16 浣嶏紝绀轰緥閭銆佷繚鐣欏煙鍚嶅拰鍗犱綅瀵嗙爜浼氳鏈嶅姟鎷掔粷銆?
3. 闄愬埗閰嶇疆鏉冮檺骞跺惎鍔細

```powershell
chmod 600 .env   # Linux 涓绘満
docker compose up -d --build
docker compose ps
```

4. 楠岃瘉鏈嶅姟锛?
```powershell
Invoke-RestMethod https://cloud.your-domain.com/health
docker compose logs --tail=100 cloud caddy
```

鍋ュ悍鎺ュ彛搴旇繑鍥?`ok: true`銆乣service: "vocflow-cloud"` 鍜?`adminReady: true`銆傞娆＄鍙戣瘉涔﹀彲鑳介渶瑕佸嚑鍗佺銆?
姝ｅ紡鎵撳寘鍜?GitHub Release 鍓嶏紝鍦ㄩ」鐩牴鐩綍鎵ц锛?
```powershell
$env:VOCFLOW_CLOUD_URL = 'https://cloud.your-domain.com' # 鏇挎崲涓轰綘鐨勭湡瀹炲煙鍚?node scripts/verify-cloud-endpoint.cjs
```

璇ユ鏌ヤ細鎷掔粷鍗犱綅鍩熷悕銆両P銆佷笉鍙揪鏈嶅姟鍜岀鐞嗗憳鏈氨缁殑鐢熶骇鏈嶅姟锛岄伩鍏嶆妸閿欒浜戠鍦板潃鍐欏叆姝ｅ紡瀹㈡埛绔€?
## 绠＄悊鍛樹笌寮€鏀炬敞鍐?
鐢熶骇鐜蹇呴』鍦ㄥ紑鏀炬敞鍐屽墠閰嶇疆 `VOCFLOW_ADMIN_EMAIL` 鍜?`VOCFLOW_ADMIN_PASSWORD`銆?
- 濡傛灉璇ラ偖绠变笉瀛樺湪锛屾湇鍔″惎鍔ㄦ椂浼氬垱寤虹鐞嗗憳銆?- 濡傛灉璇ラ偖绠卞凡瀛樺湪锛屾湇鍔′細灏嗗叾鎻愬崌涓虹鐞嗗憳锛涚幆澧冨彉閲忓瘑鐮佷笌鐜版湁瀵嗙爜涓嶄竴鑷存椂锛屼細閲嶇疆瀵嗙爜骞舵挙閿€璇ョ鐞嗗憳鐨勬棫浼氳瘽銆?- 鐢熶骇鐜娌℃湁鍙敤绠＄悊鍛樻椂锛屾湇鍔′細鎷掔粷鍚姩锛屼笉浼氬厛寮€鏀炬敞鍐屽啀绛夊緟绠＄悊鍛樹骇鐢熴€?- 杩佺Щ鐨勬棫鏁版嵁涓凡缁忓寘鍚湁鏁堢鐞嗗憳鏃讹紝鍙互涓嶉噸澶嶈缃鐞嗗憳鐜鍙橀噺锛涘彧璁剧疆閭鎴栧彧璁剧疆瀵嗙爜浼氳鎷掔粷銆?- `VOCFLOW_ALLOW_FIRST_USER_ADMIN=1` 浠呯敤浜庢湰鍦板紑鍙戝吋瀹癸紝鐢熶骇鐜璁剧疆璇ュ€兼椂鏈嶅姟浼氭嫆缁濆惎鍔ㄣ€?
绠＄悊鍛樼幆澧冨彉閲忔棤鏁堟垨缂哄け鏃讹紝璇蜂慨姝?`.env` 鍚庨噸鍚?`cloud` 瀹瑰櫒銆傜敓浜х幆澧冧笉浼氭妸绗竴涓叕寮€娉ㄥ唽鐢ㄦ埛鎻愬崌涓虹鐞嗗憳銆?
## 鏁版嵁杩佺Щ涓庨娆￠厤缃?
鏈満宸叉湁鐨?`server/data` 涓嶄細闅忎唬鐮侀儴缃茶嚜鍔ㄨ縼绉诲埌鐢熶骇鏈嶅姟鍣ㄣ€傜鐞嗗憳璐﹀彿銆佸叕鍛娿€佸紑鍙戣€呭洖澶嶃€佸箍鍛婇厤缃拰鎵€鏈夎处鍙峰悓姝ュ揩鐓ч兘淇濆瓨鍦ㄥ悓涓€涓?`vocflow-cloud.json` 涓€?
### 鏂瑰紡涓€锛氳縼绉绘暣浠界幇鏈変簯绔暟鎹枃浠?
鍏堝垱寤哄鍣ㄥ拰鎸佷箙鍖栧嵎锛屼絾鍦ㄦ枃浠跺鍒跺畬鎴愬墠涓嶈鍚姩搴旂敤锛?
```powershell
Set-Location server
docker compose build cloud
docker compose create cloud
docker compose cp .\data\vocflow-cloud.json cloud:/app/data/vocflow-cloud.json
docker compose run --rm --user 0 --entrypoint sh cloud -c "chown node:node /app/data/vocflow-cloud.json"
docker compose up -d cloud
```

杩欎細涓€骞惰縼绉绘棫璐﹀彿銆佺鐞嗗憳銆佸叕鍛娿€佸箍鍛婇厤缃拰鍚屾蹇収銆傛搷浣滃墠鍏堝浠芥棫鏂囦欢锛涗笉瑕佸湪婧愭枃浠朵笉瀛樺湪鏃舵墽琛岃鍛戒护銆?
### 鏂瑰紡浜岋細鍦ㄧ敓浜х幆澧冮噸鏂伴厤缃?
濡傛灉涓嶈縼绉绘湰鏈烘暟鎹紝璇风櫥褰曠敓浜х幆澧冪殑 `VOCFLOW_ADMIN_EMAIL` 绠＄悊鍛樿处鍙凤紝鐒跺悗鍦?VocFlow 涓噸鏂板彂甯冨叕鍛娿€佸洖澶嶅拰鍚姩骞垮憡閰嶇疆銆傛櫘閫氱敤鎴风殑瀛︿範鏁版嵁闇€瑕佸悇璐﹀彿閲嶆柊鍚屾锛涙湇鍔＄涓嶄細鑷姩璇诲彇鐢ㄦ埛鐢佃剳涓婄殑鏈湴鏁版嵁搴撱€?
骞垮憡閰嶇疆淇濆瓨鍦ㄦ湇鍔＄鏁版嵁鏂囦欢涓紝鍥犳鎵€鏈夎繛鎺ュ悓涓€ HTTPS 鏈嶅姟鐨勭敤鎴烽兘浼氭敹鍒板悓涓€浠藉惎鍔ㄥ箍鍛娿€傜敤鎴风浼氱紦瀛樻渶杩戜竴娆℃垚鍔熻幏鍙栫殑骞垮憡閰嶇疆锛岀綉缁滄殏鏃朵笉鍙敤鏃朵娇鐢ㄨ缂撳瓨锛涙寮忔瀯寤轰笉浼氬洖閫€鍒版湰鏈轰簯鏈嶅姟銆?
## 鎸佷箙鍖栥€佸浠戒笌鎭㈠

Docker Compose 浣跨敤鍛藉悕鍗?`vocflow-data` 淇濆瓨 `/app/data`锛屽叾涓寘鍚处鎴锋暟鎹€佸叕鍛娿€佸箍鍛婂拰鍙€夌殑鏇存柊鍖呫€?
鏈嶅姟浼氬湪鍚姩銆佹暟鎹啓鍏ュ悗鐨勬鏌ュ懆鏈熴€佸畾鏃朵换鍔″拰姝ｅ父鍋滄満鏃惰嚜鍔ㄥ垱寤?`/app/data/backups/vocflow-cloud.backup-*.json` 蹇収銆備富鏁版嵁鏂囦欢閲囩敤涓存椂鏂囦欢銆?`fsync` 鍜屽師瀛愰噸鍛藉悕钀界洏锛涜嫢涓绘枃浠舵崯鍧忥紝鏈嶅姟浼氬厛淇濈暀
`vocflow-cloud.json.corrupt-*`锛屽啀浠庢渶鏂颁竴浠芥湁鏁堝揩鐓ц嚜鍔ㄦ仮澶嶃€傛壘涓嶅埌浠讳綍鏈夋晥蹇収鏃讹紝
鏈嶅姟浼氭嫆缁濆惎鍔ㄤ笖涓嶄細瑕嗙洊鍘熸枃浠讹紝蹇呴』浜哄伐澶勭悊銆?
### 澶囦唤鏁版嵁鏂囦欢

鑷姩蹇収浣嶄簬瀹瑰櫒鍐?`/app/data/backups`锛岄粯璁や繚鐣?48 浠姐€佹渶澶氭瘡 15 鍒嗛挓鍒涘缓涓€娆°€?涓嬮潰鐨勫懡浠ょ敤浜庨澶栧鍑轰竴浠藉紓鍦?浜哄伐澶囦唤锛?
```powershell
Set-Location server
New-Item -ItemType Directory -Force .\backups | Out-Null
docker compose cp cloud:/app/data/vocflow-cloud.json .\backups\vocflow-cloud-production.json
```

寤鸿鍚屾椂澶囦唤 `.env` 鍒板彈淇濇姢鐨勫瘑鐮佺鐞嗙郴缁燂紝浣嗕笉瑕佸皢 `.env` 鎻愪氦鍒?Git 鎴栧叕寮€瀛樺偍銆?
### 鎭㈠鏁版嵁鏂囦欢

```powershell
Set-Location server
docker compose cp .\backups\vocflow-cloud-production.json cloud:/app/data/vocflow-cloud.json
docker compose exec -u 0 cloud chown node:node /app/data/vocflow-cloud.json
docker compose restart cloud
```

鎭㈠鍓嶅缓璁厛淇濆瓨褰撳墠鏂囦欢銆備笉瑕佸垹闄ゅ嵎鏉ユ帓闅滐紝鍚﹀垯浼氫涪澶辫处鍙枫€佸叕鍛娿€佸箍鍛婂拰鍚屾鏁版嵁銆?
### 鏌ョ湅鏁版嵁鍗?
```powershell
docker volume ls | Select-String vocflow
docker compose exec cloud ls -lah /app/data
```

## 鐜鍙橀噺

| 鍙橀噺 | 榛樿鍊?| 璇存槑 |
| --- | --- | --- |
| `PORT` / `VOCFLOW_CLOUD_PORT` | `8787` | 瀹瑰櫒鍐呯洃鍚鍙?|
| `VOCFLOW_CLOUD_HOST` | `0.0.0.0` | 鐩戝惉鍦板潃 |
| `VOCFLOW_CLOUD_DATA_DIR` | `server/data` | 鏁版嵁鐩綍锛汣ompose 涓浐瀹氫负 `/app/data` |
| `VOCFLOW_CLOUD_DATA_FILE` | `<鏁版嵁鐩綍>/vocflow-cloud.json` | 璐︽埛銆佸叕鍛娿€佸箍鍛婂拰鍚屾蹇収鏂囦欢 |
| `VOCFLOW_UPDATE_DIR` | `<鏁版嵁鐩綍>/updates` | 鍙€夌殑鏈嶅姟绔洿鏂版竻鍗曞拰 ZIP 鐩綍 |
| `VOCFLOW_BACKUP_DIR` | `<鏁版嵁鐩綍>/backups` | 鑷姩澶囦唤鐩綍锛涘簲涓庝富鏁版嵁涓€璧锋斁鍦ㄦ寔涔呭寲鍗蜂腑 |
| `VOCFLOW_BACKUP_INTERVAL_MS` | `900000` | 鑷姩澶囦唤鏈€灏忛棿闅旓紝榛樿 15 鍒嗛挓锛岃寖鍥?1 绉掑埌 7 澶?|
| `VOCFLOW_BACKUP_RETENTION` | `48` | 淇濈暀鐨勮嚜鍔ㄥ浠芥暟閲忥紝鑼冨洿 1 鍒?10000 |
| `VOCFLOW_PUBLIC_URL` | 绌?| 鐢熶骇鐜蹇呴』閰嶇疆鐨勭湡瀹?HTTPS 绔欑偣鏍瑰湴鍧€ |
| `VOCFLOW_ADMIN_EMAIL` | 绌?| 寮€鍙戣€呯鐞嗗憳閭锛涘繀椤讳笌瀵嗙爜鎴愬閰嶇疆 |
| `VOCFLOW_ADMIN_PASSWORD` | 绌?| 绠＄悊鍛樺瘑鐮侊紝鑷冲皯 16 浣嶏紱蹇呴』鏄殢鏈哄己瀵嗙爜锛屼笉鑳戒繚鐣欑ず渚嬪€?|
| `VOCFLOW_ALLOW_FIRST_USER_ADMIN` | `0` | 浠呮湰鍦板紑鍙戝彲璁句负 `1`锛涚敓浜у繀椤讳负 `0` |
| `VOCFLOW_TRUST_PROXY` | `0` | 浠呭綋鏈嶅姟鍙€氳繃鍙俊鍙嶅悜浠ｇ悊璁块棶鏃惰涓?`1`锛岀敤浜庤鍙?`X-Forwarded-For`锛涚洿鎺ユ毚闇茬鍙ｆ椂蹇呴』淇濇寔 `0` |

## 鏇存柊鍖呭彂甯?
姝ｅ紡瀹㈡埛绔殑鍥哄畾鏇存柊娓呭崟鍦板潃涓猴細

```text
https://github.com/Apex9527xy/vocflow/releases/latest/download/update.json
```

鍙戝竷鍖呭簲鐢?`scripts/package-update.cjs` 鐢熸垚锛屾洿鏂版竻鍗曞繀椤诲寘鍚湁鏁?`sha256`銆佸畨鍏ㄧ殑 `payloadDir` 鍜屽畬鏁?HTTPS `downloadUrl`銆傛湇鍔＄ `/api/app-update/manifest` 浼氬啀娆℃牎楠岀増鏈彿銆丼HA256銆佹枃浠跺悕鍜岀洰褰曞畨鍏ㄦ€с€?
### 浣跨敤 GitHub Release 鎵樼鏇存柊鍖?
鍦ㄩ」鐩牴鐩綍鎵ц锛?
```powershell
node scripts/package-update.cjs
node scripts/verify-release-assets.cjs v2.9.10
```

灏?`release/update.json`銆乣release/VocFlow-2.9.10-update.zip`銆佸搴?`.sha256`銆丯SIS Setup 鍜屼究鎼哄寘浣滀负鍚屼竴涓?Release 鐨勮祫浜т笂浼犮€俙package-update.cjs` 鐢熸垚鐨?`downloadUrl` 宸叉寚鍚戣 Release 鐨勫畬鏁?HTTPS 鍦板潃銆?
### 浣跨敤 VocFlow Cloud 鑷墭绠℃洿鏂板寘

濡傛灉甯屾湜浜戞湇鍔¤嚜宸辨彁渚?ZIP锛?
1. 鎶婄増鏈竻鍗曚腑鐨?`downloadUrl` 鏀规垚 `VocFlow-<鐗堟湰鍙?-update.zip`銆?2. 灏?ZIP 鍜?`update.json` 鏀惧叆鏁版嵁鍗风殑 `/app/data/updates/`銆?3. 淇濊瘉 ZIP 鍚嶇О涓庢竻鍗曠増鏈畬鍏ㄤ竴鑷淬€?
鐩稿鏂囦欢鍚嶄細鐢辨湇鍔＄杞崲涓?`VOCFLOW_PUBLIC_URL/api/app-update/download/<鏂囦欢鍚?`銆傛枃浠朵笉瀛樺湪鏃舵帴鍙ｈ繑鍥?404锛涚浉瀵瑰湴鍧€涓嶄細闈欓粯鍥為€€鍒版湰鏈鸿矾寰勩€?
## 鏈湴寮€鍙?
```powershell
$env:VOCFLOW_ADMIN_EMAIL="admin@vocflow.cn"
$env:VOCFLOW_ADMIN_PASSWORD="local-admin-password-2026"
$env:VOCFLOW_ALLOW_FIRST_USER_ADMIN="1"
npm run cloud:serve
```

鏈湴寮€鍙戝彲浠ヤ娇鐢?HTTP 鍜?`127.0.0.1`銆傛寮忕敤鎴锋瀯寤虹姝㈣繖涓ら」锛屽苟涓斾笉浼氬惎鍔ㄦ湰鍦颁簯鏈嶅姟浣滀负鐢熶骇鍥為€€銆?
## 鎺ュ彛姒傝

- `GET /health`锛氬仴搴锋鏌ワ紝杩斿洖 `adminReady` 琛ㄧず绠＄悊鍛樿处鍙锋槸鍚﹀彲鐢?- `POST /api/auth/register`锛氭敞鍐屾櫘閫氱敤鎴?- `POST /api/auth/login`锛氱櫥褰?- `GET /api/auth/me`锛氬綋鍓嶈处鍙?- `POST /api/auth/logout`锛氶€€鍑哄苟鎾ら攢浠ょ墝
- `GET /api/sync`锛氳鍙栦簯绔涔犲揩鐓?- `PUT /api/sync`锛氭寜鐗堟湰鍐欏叆瀛︿範蹇収
- `GET /api/ad-config`锛氳鍙栧叏灞€鍚姩骞垮憡閰嶇疆
- `PUT /api/admin/ad-config`锛氱鐞嗗憳淇濆瓨骞垮憡鍥剧墖銆佽烦杞摼鎺ヤ笌寮€鍏?- `GET /api/messages`锛氬叕鍛娿€佸綋鍓嶇敤鎴风暀瑷€鍜屽紑鍙戣€呭洖澶?- `POST /api/messages`锛氱敤鎴锋彁浜ゅ弽棣?- `GET /api/admin/messages`锛氱鐞嗗憳璇诲彇鍏ㄩ儴鐣欒█
- `POST /api/admin/messages`锛氱鐞嗗憳鍙戝竷鍏憡鎴栧洖澶嶇敤鎴?- `GET /api/app-update/manifest`锛氳鍙栨湇鍔＄鐗堟湰娓呭崟
- `GET /api/app-update/download/<鏂囦欢鍚?`锛氫笅杞芥湇鍔＄鏇存柊 ZIP

## 瀹夊叏娉ㄦ剰浜嬮」

- 瀵嗙爜浣跨敤 Node.js `scrypt` 鍔犵洂鍝堝笇淇濆瓨锛屼笉淇濆瓨鏄庢枃銆?- 鐧诲綍浠ょ墝鍙繚瀛?SHA-256 鍝堝笇銆?- 鍏綉蹇呴』鍚敤 HTTPS锛屽苟淇濇寔 `VOCFLOW_ALLOW_FIRST_USER_ADMIN=0`銆?- 鐢熶骇鍚姩鍓嶅繀椤诲畬鎴愮鐞嗗憳鍒濆鍖栵紱绠＄悊鍛樼幆澧冨彉閲忔垚瀵瑰嚭鐜帮紝瀵嗙爜鑷冲皯 16 浣嶄笖涓嶈兘浣跨敤鍗犱綅鍊笺€?- `.env` 涓嶅簲鎻愪氦鍒?Git锛岀鐞嗗憳瀵嗙爜搴斾娇鐢ㄥ瘑鐮佺鐞嗗櫒淇濈銆?- 瀹氭湡澶囦唤 `vocflow-cloud.json` 鍜?Docker 鍗枫€?- 搴旂敤涓嶄細鍚屾 PDF銆侀煶棰戙€佹枃鐚瓑鍘熷鏂囦欢锛屽彧鍚屾瀛︿範璁板綍銆佷釜浜烘暟鎹€佸叕鍛婂拰鎵规敞銆?
