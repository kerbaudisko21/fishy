#!/usr/bin/env bash
# One-time setup so the deploy workflow (.github/workflows/deploy.yml) can sign
# in to Google Cloud. No key is created or stored: GitHub proves which
# repository and branch a run belongs to, and Google Cloud accepts only this
# repository's main branch.
#
# Run it once, with gcloud signed in as an owner of the project:
#
#   PROJECT_ID=your-project-id GITHUB_REPO=owner/name bash scripts/setup-ci.sh
#
# It can be run again. A step that is already done is skipped.
#
# What it creates, all with FISHY's own names, so a project shared with
# another app is not changed for that app:
#   - a sign-in pool "fishy-github" that accepts this repository's main branch
#   - a deploy account "fishy-deployer" that the workflow signs in as
# What the deploy account may do is listed below, one line per role.
#
# It also lets the deploy account act as two accounts that are not FISHY's:
# the App Engine default account and the default compute account. It prints
# what both can do first, and stops when that is too much. See "Look first".

set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID to the Google Cloud project ID}"
GITHUB_REPO="${GITHUB_REPO:?Set GITHUB_REPO as owner/name}"

POOL="fishy-github"
PROVIDER="fishy-repo"
DEPLOYER="fishy-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME="fishy-functions@${PROJECT_ID}.iam.gserviceaccount.com"

# The numeric IDs, not the names. A name can be given to another repository
# after a rename. The numbers never change.
REPO_ID="${GITHUB_REPO_ID:-$(gh api "repos/${GITHUB_REPO}" --jq .id)}"
OWNER_ID="${GITHUB_OWNER_ID:-$(gh api "repos/${GITHUB_REPO}" --jq .owner.id)}"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

# Two more accounts, neither of them FISHY's. The deploy account can deploy
# functions only when it may act as both:
#   - the App Engine default account. The Firebase CLI checks this before any
#     functions deploy, even when no function runs as it.
#   - the default compute account. It builds the functions, and the Firebase
#     CLI has no setting for another build account.
# "May act as" means: it can do whatever that account can do, and it can
# replace any service that runs as that account. So this script looks first,
# and stops before it has changed anything when either account can do too much.
APPENGINE="${PROJECT_ID}@appspot.gserviceaccount.com"
BUILDER="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# The roles an account holds in this project, on one line.
roles_of() {
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten='bindings[].members' \
    --filter="bindings.members:serviceAccount:$1" --format='value(bindings.role)' | sort | tr '\n' ' '
}

echo "== Look first: the two accounts the deploy account will be able to act as =="
if gcloud iam service-accounts describe "$APPENGINE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  HAS_APPENGINE=yes
  appengine_roles="$(roles_of "$APPENGINE")"
  echo "App Engine default account. Roles in this project: ${appengine_roles:-none}"
  if [ -n "$appengine_roles" ]; then
    echo "STOP. Nothing was changed."
    echo "Acting as ${APPENGINE} would hand those roles to whoever can push to main."
    echo "Remove them if nothing needs them, then run this script again."
    echo "Or keep deploying the functions by hand."
    exit 1
  fi
else
  HAS_APPENGINE=no
  echo "App Engine default account: this project has none, so the Firebase CLI skips its check."
fi

if ! gcloud iam service-accounts describe "$BUILDER" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "STOP. Nothing was changed."
  echo "${BUILDER} does not exist yet. Deploy once by hand first (see the README), then run this again."
  exit 1
fi
builder_roles="$(roles_of "$BUILDER")"
builder_runs="$({ gcloud run services list --project="$PROJECT_ID" \
  --format='value(metadata.name,spec.template.spec.serviceAccountName)' 2>/dev/null || true; } |
  awk -v sa="$BUILDER" '$2 == sa { print $1 }' | tr '\n' ' ')"
echo "Default compute account. Roles in this project: ${builder_roles:-none}"
echo "Default compute account. Services that run as it: ${builder_runs:-none}"
case " ${builder_roles}" in
  *" roles/owner "* | *" roles/editor "*)
    if [ "${ALLOW_WIDE_BUILD_ACCOUNT:-}" != "yes" ]; then
      echo "STOP. Nothing was changed."
      echo "${BUILDER} can change almost everything in this project."
      echo "Acting as it would hand that to whoever can push to main."
      echo "Give it only what a build needs (the README's first-deploy steps list it), then run this again."
      echo "In a project that holds nothing but FISHY you may accept it: add ALLOW_WIDE_BUILD_ACCOUNT=yes."
      exit 1
    fi
    ;;
esac

echo "== Sign-in without a key needs this API =="
gcloud services enable iamcredentials.googleapis.com --project="$PROJECT_ID"

echo "== The sign-in pool: this repository, main branch only =="
gcloud iam workload-identity-pools describe "$POOL" --project="$PROJECT_ID" --location=global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --project="$PROJECT_ID" --location=global \
    --display-name="FISHY GitHub Actions"

gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$PROJECT_ID" --location=global \
  --workload-identity-pool="$POOL" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project="$PROJECT_ID" --location=global \
    --workload-identity-pool="$POOL" \
    --display-name="FISHY repo, main branch" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository_id == '${REPO_ID}' && assertion.repository_owner_id == '${OWNER_ID}' && assertion.ref == 'refs/heads/main'"

echo "== The deploy account =="
gcloud iam service-accounts describe "$DEPLOYER" --project="$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam service-accounts create fishy-deployer --project="$PROJECT_ID" \
    --display-name="FISHY GitHub Actions deployer"

# What `firebase deploy --only firestore,functions,hosting` needs:
#   cloudfunctions.admin        create and update the functions
#   firebasehosting.admin       release the web pages
#   serviceusage.apiKeysViewer  the Firebase CLI asks for it when it deploys Hosting
#   firebaserules.admin         release the database rules
#   datastore.indexAdmin        create the database indexes
# These roles cover the whole project. Google Cloud has none that are limited
# to one Hosting site or one set of functions.
for role in cloudfunctions.admin firebasehosting.admin serviceusage.apiKeysViewer firebaserules.admin datastore.indexAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${DEPLOYER}" \
    --role="roles/${role}" --condition=None --format=none
  echo "granted roles/${role}"
done

echo "== It may deploy functions that run as the FISHY runtime account =="
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER}" --role="roles/iam.serviceAccountUser" --format=none

echo "== It may act as the two accounts looked at above =="
if [ "$HAS_APPENGINE" = yes ]; then
  gcloud iam service-accounts add-iam-policy-binding "$APPENGINE" --project="$PROJECT_ID" \
    --member="serviceAccount:${DEPLOYER}" --role="roles/iam.serviceAccountUser" --format=none
fi
gcloud iam service-accounts add-iam-policy-binding "$BUILDER" --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER}" --role="roles/iam.serviceAccountUser" --format=none

echo "== It may see that the two FISHY secrets exist. It cannot read them. =="
for secret in FISHY_TWILIO_ACCOUNT_SID FISHY_TWILIO_AUTH_TOKEN; do
  gcloud secrets add-iam-policy-binding "$secret" --project="$PROJECT_ID" \
    --member="serviceAccount:${DEPLOYER}" --role="roles/secretmanager.viewer" --format=none
done

echo "== Only this repository may sign in as the deploy account =="
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" --format=none \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository_id/${REPO_ID}"

echo
echo "Done. Now store these three as Actions secrets of ${GITHUB_REPO}:"
echo "  gh secret set GCP_PROJECT_ID --repo ${GITHUB_REPO} --body '${PROJECT_ID}'"
echo "  gh secret set GCP_DEPLOY_SA --repo ${GITHUB_REPO} --body '${DEPLOYER}'"
echo "  gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER --repo ${GITHUB_REPO} --body 'projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}'"
echo "The README lists the variables to set next to them."
