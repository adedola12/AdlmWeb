# ADLM MPXJ Converter Service

A tiny Java microservice that converts Microsoft Project `.mpp` binary
files into MS Project XML (MSPDI) over HTTP. The main ADLM Node API calls
this whenever a user uploads a `.mpp` file in the PM Dashboard import
flow — keeping the heavy Java + MPXJ dependencies out of the Node server.

## Endpoints

| Method | Path        | Description                                   |
|--------|-------------|-----------------------------------------------|
| POST   | `/convert`  | Body = raw `.mpp` bytes. Returns MSPDI XML.   |
| GET    | `/health`   | Returns `ok`. Used by Render health checks.   |

### Request headers

| Header        | Required                          | Notes                   |
|---------------|-----------------------------------|-------------------------|
| `X-API-Key`   | Only if `MPXJ_API_KEY` is set     | Must match exactly.     |
| `X-Filename`  | Optional                          | Echoed in error logs.   |
| `Content-Type`| Optional (`application/octet-stream`) | Body is treated as binary regardless. |

Body size cap: **50 MB**. Anything larger gets a `413`.

## Environment

| Variable       | Default | Purpose                                                    |
|----------------|---------|------------------------------------------------------------|
| `PORT`         | `8080`  | Render injects this automatically.                         |
| `MPXJ_API_KEY` | (none)  | If set, requires matching `X-API-Key` on every request.    |
| `JAVA_OPTS`    | `-Xms64m -Xmx384m` | Heap sizing — fits the free Render tier.        |

## Local quickstart

```bash
cd tools/mpxj-converter

# Build the uberjar (needs Maven + JDK 17)
mvn -B clean package

# Run it
java -jar target/mpxj-converter.jar

# In another terminal — convert a test file
curl -X POST --data-binary @sample.mpp \
  -H "Content-Type: application/octet-stream" \
  http://localhost:8080/convert > sample.xml
```

## Deploy on Render (recommended)

This directory ships a `render.yaml` Blueprint so the deploy is one click.

1. **Commit this directory** (`tools/mpxj-converter/`) to a Git repository.
2. **Sign in to Render** → **New** → **Blueprint** → connect the repo.
3. Render reads `render.yaml`, builds the Docker image, and starts the
   service. First build takes ~2 minutes (Maven pulls MPXJ + POI).
4. Once live, copy the service URL from Render's dashboard. It looks
   like `https://adlm-mpxj-converter.onrender.com`.
5. Copy the generated `MPXJ_API_KEY` value from the service's Environment
   tab (Render generated it on first deploy).
6. Set these env vars on the **main ADLM API server**:
   ```
   MPXJ_API_URL=https://adlm-mpxj-converter.onrender.com/convert
   MPXJ_API_KEY=<paste the value from Render>
   ```
7. Redeploy the main API. The PM Dashboard now accepts `.mpp` uploads
   directly — they're proxied to this service and parsed natively.

### Free tier caveats

Render's free instances sleep after 15 minutes of inactivity. The first
upload after sleep takes ~15 seconds to wake the container. For production
you'll want the Starter plan (~$7/mo) which stays warm.

## Deploy on Fly.io / Railway / Heroku

The Dockerfile is generic — any container platform that supports a JVM
runtime will work. The only requirement is the platform respects the
`PORT` environment variable.

## Deploy on a self-hosted VPS

```bash
# One-time install
sudo apt install openjdk-17-jre

# Drop the jar somewhere stable
sudo mkdir -p /opt/mpxj
sudo cp target/mpxj-converter.jar /opt/mpxj/

# Systemd unit
sudo tee /etc/systemd/system/mpxj-converter.service <<'UNIT'
[Unit]
Description=ADLM MPXJ Converter
After=network.target

[Service]
Environment=PORT=8081
Environment=MPXJ_API_KEY=replace-with-a-long-random-string
ExecStart=/usr/bin/java -jar /opt/mpxj/mpxj-converter.jar
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl enable --now mpxj-converter
```

Then proxy via Nginx / Caddy under HTTPS and point `MPXJ_API_URL` at the
public URL.

## Troubleshooting

**“conversion failed: TableNotFoundException”** — MPP file is corrupt or
from a very old Project version (Project 98 etc.). MPXJ usually copes
back to Project 2000; older needs special handling.

**“conversion failed: OutOfMemoryError”** — increase `JAVA_OPTS=-Xmx768m`.
Default 384 MB handles MPPs up to ~10 MB comfortably.

**Render returns 502 for several seconds after deploy** — the JVM is
warming up. Render's health check polls `/health`; once it returns `ok`
traffic starts flowing (~5–10 s on free tier).
