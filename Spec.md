insert these rules and save the file ctrl+s  : 

# CloudShield Twin — SPEC
Loop: Observe → Understand → Simulate → Remediate → Prove

## 1. Architecture
VM (EC2): demo stack (nginx→node-api→postgres,redis) + agent.py (root, read-only, outbound push only)
  └─HTTPS─▶ Control plane on laptop (via cloudflared tunnel): FastAPI + React dashboard
             ├─ boto3 → EC2/SG/IAM (read); SG revoke/authorize only via approved apply
             └─ external probe: TCP connect to VM public IP (independent proof)
Rule: engine/ = PURE functions (dicts in → dicts out, no network/AWS/file I/O).
Whole app must run offline in replay mode from fixtures/.

## 2. Repo
engine/{models,twin,exposure,failure,attack,risk,remediate,drift}.py
backend/{main,store,aws_layer,apply,llm,replay}.py · agent/agent.py
web/ (Vite+React+TS+Tailwind+@xyflow/react+dagre) · demo/{app,setup.sh,Makefile} · fixtures/ · tests/

## 3. Inputs
Agent snapshot (every 3s): {ts, host:{instance_id,private_ip,public_ip},
 listeners:[{pid,proc,user,proto,bind,port}], conns:[{pid,proc,laddr,raddr,status}],
 containers:[{name,image,ports}], firewall:{backend,input_policy,rules[]}, checks:{redis_noauth}}
AWS snapshot (backend polls every 10s): {instance:{id,sg_ids,imds_http_tokens,role},
 security_groups:{id:{inbound:[{proto,from,to,cidr}]}}, role_permissions:[{action,resource}]}
twin.yaml (declared once): tiers + endpoints
 /checkout: {hard:[api,postgres,redis]}  /products: {hard:[api,postgres], soft:[redis]}

## 4. Twin graph (networkx.DiGraph)
Node: id, kind(internet|host|service|datastore|imds|aws_role|aws_bucket), ports, tier 1-3,
  sensitivity 0-3, state(ok|degraded|down|compromised)
Edge: src,dst, kind(flow|exposes|runs_on|grants), port, observed(bool), dep(hard|soft|none)
Build: nodes from listeners (6379 redis soft/sens2 · 5432 postgres hard/sens3 · 80/443 nginx sens1 · else app);
flow edges from ESTABLISHED conns (client side, raddr matches a local listener); dep from twin.yaml else defaults.

## 5. Algorithms
A. Exposure: exposed(s) = public_ip ∧ bind∉{127.0.0.1,::1} ∧ host_fw_allows(port) ∧ sg_allows(port, 0.0.0.0/0|::/0).
   Return per-layer evidence. Status: exposed | latent (SG open, bind local) | internal | closed.
   Unknown firewall → confidence "low".
B. Failure: fail X → each dependent Y: hard→DOWN, soft→DEGRADED. DOWN re-propagates; DEGRADED propagates over hard edges only.
   Endpoint: FAILED if any hard dep DOWN; DEGRADED if soft dep down or hard dep degraded.
   Output: affected_services, affected_endpoints, critical_paths, recovery_order. spof(): run for every node, rank by #FAILED endpoints.
C. Attack: entries = public_service | compromised_service | stolen_credential | malicious_process.
   Edges = flows + exposes + RULES (all tagged "potential" + MITRE id):
   exposed noauth redis → host (T1190); host → all services on it; compromised service/host → imds → role (T1552.005); role → buckets from role_permissions.
   Output: shortest path per sensitive asset, hops, blast_radius (reachable assets).
D. Risk: attack_surface = Σ exposed services (sensitivity × 2 if noauth × 1.5 if it reaches a sensitive asset).
   Bands LOW ≤3 · MED ≤6 · HIGH >6. blast_radius = max reachable-asset count from any exposed service. All numbers computed, never hardcoded.
E. Remediate: candidates = SG revoke (+ allow app source only if client is remote) · host iptables (drop non-loopback) · bind localhost.
   Simulate each on a COPY of the twin; accept only if (1) target not internet-reachable (2) zero observed flows removed
   (3) port 22 + agent channel untouched (4) rollback exists. Rank: AWS layer first, narrowest scope.
   Patch = {id, layer, aws_cli, iptables, terraform, rollback[], before, after, invariants}. Host/Terraform patches = preview only.
F. Drift: fingerprint nodes/edges/exposure; diff(prev,curr) → NEW_EXPOSURE | NEW_LISTENER | NEW_FLOW | REMOVED (+first_seen).

## 6. API
POST /ingest (Bearer) · GET /twin · WS /ws · POST /simulate/failure{node} · POST /simulate/attack{entry_type,node} · GET /spof
GET /fix/{finding_id} (preview only) · POST /fix/{patch_id}/apply{approve:true} · POST /fix/{rollback_id}/rollback
GET /probe?port= · GET /events · POST /explain (LLM from structured JSON, template fallback) · POST /replay/step

## 7. Safety (non-negotiable)
Agent read-only. Apply = allowlist only (SG revoke/authorize on configured SG + one port). Never touch 22/agent port.
Preview by default, rollback stored, audit.jsonl for every action. LLM never emits commands. Attack sim = potential paths only.