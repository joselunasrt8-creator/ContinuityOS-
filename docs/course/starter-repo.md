# Starter Repo Guide

This guide describes how to set up the starter repository for the ContinuityOS developer course. The starter repo is the external repo you will add ContinuityOS governance to during the final project.

---

## What the Starter Repo Is

The starter repo is a minimal public GitHub repository with:
- At least one state-changing operation (a deploy script, a write operation, or a data mutation)
- A GitHub Actions workflow that can be modified to add legitimacy gating
- No prior ContinuityOS dependency

After completing the course, this repo will:
- Refuse to execute any mutation without a valid, authorized, replay-safe legitimacy object
- Emit a proof artifact for every successful execution
- Pass the full conformance suite

---

## Option A — Fork the Provided Starter

The simplest path: fork the course starter repository.

```bash
gh repo fork continuityos/course-starter --clone
cd course-starter
```

The starter contains:
- A minimal Express (or equivalent) API with a `/deploy` endpoint
- A placeholder GitHub Actions workflow
- An empty `proof-log/` directory
- A README with setup instructions

---

## Option B — Use Your Own Repo

If you have an existing repo with a state-changing operation, you can use it directly.

Requirements:
- Public GitHub repository
- At least one GitHub Actions workflow
- The operation must be a concrete state change (not a read-only operation)

Examples of qualifying operations:
- Deploying a Cloudflare Worker
- Publishing an npm package
- Merging a pull request programmatically
- Writing to a database or key-value store
- Sending a notification (Slack, email) triggered by an event

---

## Option C — Create Minimal Repo from Scratch

```bash
mkdir my-governed-app && cd my-governed-app
git init

# Create a minimal deploy script
cat > deploy.sh << 'EOF'
#!/bin/bash
echo "Deploying application..."
# Your actual deploy command here
echo "Deploy complete"
EOF
chmod +x deploy.sh

# Create placeholder workflow
mkdir -p .github/workflows
cat > .github/workflows/deploy.yml << 'EOF'
name: deploy
on:
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./deploy.sh
EOF

# Initialize
echo "# My governed app" > README.md
git add .
git commit -m "initial commit"
gh repo create my-governed-app --public --source=. --push
```

---

## Installing ContinuityOS

After your starter repo is ready:

### Step 1 — Copy the governed deploy template

```bash
cp /path/to/mindshift-demo/templates/governed-deploy.yml \
   .github/workflows/governed-deploy.yml
```

### Step 2 — Configure secrets

In your repo's Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| `WORKER_URL` | Your ContinuityOS runtime URL |
| `API_KEY` | Your API key |

### Step 3 — Replace the raw deploy workflow

Open `.github/workflows/deploy.yml` (or equivalent) and add a comment:

```yaml
# This workflow is now governed. Use governed-deploy.yml to deploy.
# Direct push-triggered deploys are disabled.
```

Remove or disable the `on: push` trigger from your original workflow.

### Step 4 — Create a proof log directory

```bash
mkdir proof-log
echo "# Proof Log" > proof-log/README.md
git add proof-log/
git commit -m "add proof log directory"
git push
```

---

## Verifying Installation

After installation, trigger the governed deploy workflow without inputs. Confirm it fails closed with a NULL signal. This is your first successful governance check.

---

## Final Project Checklist

- [ ] Repo is public
- [ ] `governed-deploy.yml` is installed and passes CONF-CICD checks
- [ ] At least one execution has been validated and proved
- [ ] Proof row exists in the proof log
- [ ] Conformance suite passes: `npm run conformance` → 30/30 PASS
- [ ] A mutated object demonstrably returns NULL (from Lab 3)
- [ ] (Optional) Conformance badge added to README
