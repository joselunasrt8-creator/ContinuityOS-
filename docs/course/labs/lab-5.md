# Lab 5 — Add Governed Deploy to Your Own Repo Fork

**Module:** 4  
**Estimated time:** 45 minutes  
**Prerequisites:** A public GitHub repo with at least one state-changing operation; Labs 1–4 complete  
**Assignment:** Link the PR adding `governed-deploy.yml` to your repo.

---

## Goal

Install the governed deploy workflow template into a repo you own or fork. After installation, trigger a deploy attempt without legitimacy inputs and confirm it fails closed.

---

## Background

The `templates/governed-deploy.yml` file is an installable version of the full governed deploy workflow. It is parameterized so you can configure it for any repo without modifying the legitimacy checks.

**Template reference:** [`templates/governed-deploy.yml`](../../../templates/governed-deploy.yml)

---

## Steps

### Step 1 — Choose a target repo

Options:
- A repo you own with a deploy step (static site, API, Worker, etc.)
- A fresh fork of any public repo with a GitHub Actions workflow

If you do not have a suitable repo, create one:

```bash
# Create a minimal repo to test with
mkdir my-governed-repo && cd my-governed-repo
git init
echo "# My governed repo" > README.md
git add . && git commit -m "init"
gh repo create my-governed-repo --public --source=. --push
```

### Step 2 — Copy the template

Copy `templates/governed-deploy.yml` from this repo to `.github/workflows/governed-deploy.yml` in your target repo.

```bash
cp /path/to/mindshift-demo/templates/governed-deploy.yml \
   /path/to/my-governed-repo/.github/workflows/governed-deploy.yml
```

### Step 3 — Configure the template

Open the copied workflow and set the configuration variables at the top:

```yaml
env:
  DEPLOY_ENVIRONMENT: production          # ← your environment name
  DEPLOY_INTENT: deploy_production        # ← your intent class
  WORKER_URL: ${{ secrets.WORKER_URL }}   # ← your runtime URL secret name
  API_KEY: ${{ secrets.API_KEY }}         # ← your API key secret name
```

### Step 4 — Add secrets to your repo

In your target repo's Settings → Secrets and variables → Actions, add:

| Secret name | Value |
|-------------|-------|
| `WORKER_URL` | Your deployed ContinuityOS runtime URL |
| `API_KEY` | Your API key |

For testing, you can use placeholder values and observe fail-closed behavior.

### Step 5 — Commit and push

```bash
cd /path/to/my-governed-repo
git checkout -b add-governed-deploy
git add .github/workflows/governed-deploy.yml
git commit -m "feat: add governed deploy workflow"
git push -u origin add-governed-deploy
```

Open a PR and link it below.

### Step 6 — Verify fail-closed behavior

After the PR is merged, navigate to Actions → governed-deploy → Run workflow.

Run without inputs. Confirm: workflow fails with NULL signal.

---

## Expected Results

| Step | Expected |
|------|----------|
| Template copied and workflow triggered | Appears in Actions tab |
| Triggered without inputs | Fails with NULL — Missing required variable |
| Triggered with placeholder inputs | Fails at legitimacy runtime call |

---

## Deliverable

Link to your PR adding the governed deploy workflow. The PR title should be:

```
feat: add governed deploy workflow (ContinuityOS)
```

---

## Next

[Lab 6 — Emit a proof artifact for a valid action](lab-6.md)
