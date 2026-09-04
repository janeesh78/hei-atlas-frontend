# Postgres Backup & Restore Runbook

**Scope:** Postgres (Neon) only. Redis (Upstash) deliberately excluded —
confirmed 2026-09-01 that it holds only OTP/IP rate-limit counters (reset
every 15 min regardless) and trial-data caching (rebuilt from source APIs
at startup, see `CacheManager.startup()` in `services/cache_layer.py`).
Nothing durable lives there; losing it costs a brief cold-start, not data.

**Why this is a Neon-dashboard procedure, not a script:** Neon's
point-in-time recovery (PITR) is an account-level feature — restoring
means creating a new *branch* of the project as of a chosen timestamp,
which only the Neon console (or the Neon API with a Neon API key) can do.
Nobody assisting from the Fly machine or this repo has that access. What
*can* be done from here is independently verifying that a restore you
create actually contains correct data — that's the part below marked
"Claude can do this."

---

## Step 0 — Check the current plan and retention window (you)

1. Neon console → the project (`ep-empty-violet-atovl6j8-pooler` /
   us-east-1) → **Settings → Billing**. Note the plan tier.
2. Project → **Backups / Restore** (exact label varies by Neon UI
   version). Note the PITR retention window shown there.
3. Tell me the plan + retention window — it determines how far back a
   restore-branch timestamp can validly go, and whether the BAA tracker's
   "must upgrade to Scale" note (`baa-intake.csv`) is still accurate.

## Step 1 — Create a restore branch (you)

1. Neon console → project → **Branches → Create branch**.
2. Choose **"From a point in time"** (not "from HEAD") and pick a
   timestamp — for the first run, something like "1 hour ago" is enough
   to prove the mechanism works without needing old data to exist yet.
3. Name it clearly, e.g. `restore-test-1` — makes cleanup unambiguous.
4. Once created, open the branch's **Connection Details** and copy the
   full connection string (it's a distinct host/branch, not
   `ep-empty-violet-atovl6j8-pooler` — restoring into that branch can
   never touch production, which is exactly why this method is safe to
   test with).

## Step 2 — Verify the restored data is actually correct (Claude can do this)

Hand me the branch connection string (as a one-off value, the same way
you handed me the rotated `DATABASE_URL` password earlier — I don't need
it stored anywhere, just to run a few read-only queries against it) and
I'll independently confirm, not just trust Neon's UI:

- Row counts on `auth_user`, `encounter_record`, `phi_access_log` are
  sane and match what production looked like at that timestamp (not
  zero, not obviously truncated).
- A specific known row (e.g. your own `auth_user` row) has the field
  values it should have had at that point in time.
- The branch is genuinely isolated — a write made against production
  *after* the restore timestamp does **not** appear on the branch.

I will only ever run `SELECT` statements against a restore branch, never
against `ep-empty-violet-atovl6j8-pooler` itself, and never anything that
mutates data anywhere.

## Step 3 — Clean up (you)

Delete the restore branch from the Neon console once verification is
done — branches count toward project usage/billing, and there's no
reason to keep a stale one around.

## Step 4 — Repeat once more, at a different point in time

Run Steps 1–3 again with a **different** timestamp than the first run
(e.g. now pick something closer to the edge of the retention window
noted in Step 0, rather than repeating the same easy "1 hour ago" case).
Confirming the procedure works at two different points — including one
that actually stresses the retention window — is a meaningfully stronger
guarantee than repeating an identical easy case twice.

---

## Making this an actual "before every deploy" habit

The checklist item's real intent is a *standing practice*, not a one-time
box to check. Two honest options, given PITR restore is Neon's own
continuous mechanism rather than something a script triggers per deploy:

- **Do nothing extra per deploy** — Neon's PITR is continuous and
  automatic on paid tiers; there is no separate "take a backup now"
  action needed before a deploy for it to be effective. The real ongoing
  practice is knowing *how* to restore (this runbook) and periodically
  re-verifying it still works, not re-running a backup step every time.
- **Add an explicit pre-deploy dump anyway**, as a second, independent
  layer that doesn't depend on Neon at all (`pg_dump` from the Fly
  machine, stored somewhere durable). This was explicitly scoped out
  2026-09-01 in favor of verifying Neon's own PITR first — revisit if a
  second layer still feels warranted after seeing how Steps 1–4 go.

## Change log

- 2026-09-01: Initial runbook. Scope decided: Postgres only (Redis holds
  no durable data), verify Neon's existing PITR rather than build an
  independent backup mechanism.
- 2026-09-04: First full run of Steps 0–2. Step 0: Scale plan, 6-hour PITR
  window (adjustable via "Configure" in the Neon UI). Step 1: nearly used
  Neon's "Restore from history" panel, which restores the selected source
  branch **in place** — with "production" pre-selected there, this would
  have mutated the live database rather than creating an isolated copy.
  Used **Branches → Create branch → From a point in time** instead, which
  is genuinely isolated. Step 2: all 18 tables present with sane row
  counts matching production, a known row spot-checked correctly, and
  isolation proven definitively — a passive timestamp comparison against
  production came back identical (meaning no new production activity
  since the restore point, not "not isolated" — inconclusive on its own),
  so inserted a uniquely-identifiable marker row directly on production
  and confirmed the restore branch showed zero trace of it. Marker
  cleaned up afterward. Step 4 (a second run at a different timestamp)
  explicitly skipped for now, by choice — not attempted and failed, just
  deferred. Revisit whenever; nothing about the procedure changes, just
  pick a timestamp nearer the edge of the 6-hour window this time rather
  than repeating an easy recent one.
