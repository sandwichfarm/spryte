# Deployment

Automation for deploying the CVM service and SPA.

## CVM (Ansible)

Deploys the CVM as a systemd service on a VPS.

```bash
cd deploy/ansible
ansible-playbook playbook-cvm.yml -i inventory.yml \
  -e "cvm_private_key=..." \
  -e "nwc_connection_string=..." \
  -e "blossom_server_url=..."
```

The playbook:
1. Installs Deno runtime
2. Creates a `spryte` service user
3. Clones/pulls the repo to `/opt/spryte`
4. Caches Deno dependencies
5. Deploys env file and systemd unit
6. Enables and starts the service

No Nginx needed — CVM communicates via Nostr relays (WebSocket), not HTTP.

## SPA (bunny.net)

Uploads the SPA static build to bunny.net CDN.

```bash
# Build first
cd spa && pnpm build

# Deploy
BUNNY_STORAGE_ZONE=... \
BUNNY_API_KEY=... \
BUNNY_PULLZONE_ID=... \
BUNNY_ACCOUNT_API_KEY=... \
bash deploy/bunny/deploy.sh spa/dist
```

## GitHub Actions

Both deployments are automated via GitHub Actions on push to `main`:

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `deploy-spa.yml` | Changes in `spa/` | Build SPA, upload to bunny.net, purge CDN cache |
| `deploy-cvm.yml` | Changes in `cvm/`, `collector/`, `processor/` | Run Ansible playbook to update CVM service |

### Required Secrets

| Secret | Used By |
|--------|---------|
| `BUNNY_STORAGE_ZONE` | SPA deploy |
| `BUNNY_API_KEY` | SPA deploy |
| `BUNNY_PULLZONE_ID` | SPA deploy |
| `BUNNY_ACCOUNT_API_KEY` | SPA deploy |
| `SSH_PRIVATE_KEY` | CVM deploy |
| `CVM_HOST` | CVM deploy |
| `CVM_SSH_USER` | CVM deploy |
| `CVM_PRIVATE_KEY` | CVM deploy |
| `NWC_CONNECTION_STRING` | CVM deploy |
| `BLOSSOM_SERVER_URL` | CVM deploy |
