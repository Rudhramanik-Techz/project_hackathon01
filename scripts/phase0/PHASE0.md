# Phase 0 – setup checks (no app code)

Run everything from `c:\Project(main)\Project_hack` in PowerShell.
Send back the outputs marked **REPORT**.

---

## 0. Install tools and sign in

1. **AWS CLI v2:** install the Windows MSI from
   https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
2. **AWS SAM CLI:** install the Windows MSI from
   https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html
3. **Python 3.12** (your machine has 3.11.5). Lambda runs 3.12, and `sam build` needs a matching
   local Python. Pick one:
   - install Python 3.12 from python.org (simplest), or
   - use `sam build --use-container` (you already have Docker).
4. Close and reopen VS Code so `aws` and `sam` are on PATH, then:
   ```powershell
   aws --version
   sam --version
   ```
5. **Credentials.** Don't create access keys for the root user. Use one of these:
   - `aws login` (newer CLI v2 versions use your console sign-in; **verify** that your installed version has it with `aws login help`), or
   - IAM Identity Center: `aws configure sso`, or
   - an IAM user with its own access key (`aws configure`). Fine for a solo hackathon account, but
     the keys stay in `~/.aws`, never in this repo.
6. Set the default region and confirm who you are:
   ```powershell
   aws configure set region ap-south-1
   aws sts get-caller-identity
   ```
   **REPORT:** the `Account` number. It's not secret, but don't paste it publicly.

---

## (a) Textract `DetectDocumentText` in ap-south-1

Take any payment screenshot (a real one of your own is fine; it only goes to Textract), or a photo
of printed text, and save it as `scripts\phase0\test.jpg`. Keep it under 5 MB.

```powershell
aws textract detect-document-text `
  --document "Bytes=fileb://scripts/phase0/test.jpg" `
  --region ap-south-1 `
  --query "Blocks[?BlockType=='LINE'].[Confidence,Text]" `
  --output table
```

Expected: a table of text lines, each with its confidence.
**REPORT:** success or the error. Don't paste the text if it contains real UTRs or VPAs; just tell
me whether the amount, UTR and time lines came out readable and roughly what confidence they had.
Delete `test.jpg` afterwards (it will be gitignored anyway).

---

## (b) Bedrock model ID and a test Converse call

### b1. What Nova Micro looks like from Mumbai

```powershell
# Foundation models, and whether they're callable ON_DEMAND directly or only via INFERENCE_PROFILE
aws bedrock list-foundation-models --region ap-south-1 --by-provider Amazon `
  --query "modelSummaries[?contains(modelId,'nova-micro')].[modelId,join(',',inferenceTypesSupported)]" `
  --output table

# Cross-region inference profiles available from ap-south-1
aws bedrock list-inference-profiles --region ap-south-1 `
  --query "inferenceProfileSummaries[?contains(inferenceProfileId,'nova-micro')].[inferenceProfileId,inferenceProfileArn]" `
  --output table
```

If an inference profile shows up (for example one starting with `apac.`), find out which regions
it routes to:

```powershell
aws bedrock get-inference-profile --region ap-south-1 `
  --inference-profile-identifier <PROFILE_ID_FROM_ABOVE> `
  --query "models[].modelArn" --output table
```

**REPORT:** all three outputs.

### b2. Test Converse call

Use the model ID if b1 showed `ON_DEMAND`; otherwise use the inference profile ID.

```powershell
aws bedrock-runtime converse --region ap-south-1 `
  --model-id <MODEL_OR_PROFILE_ID> `
  --messages file://scripts/phase0/converse-messages.json `
  --inference-config file://scripts/phase0/converse-config.json `
  --query "[output.message.content[0].text, usage, metrics]"
```

Expected: a short JSON-ish explanation, token usage, and latency in ms.
If you get `AccessDeniedException` about model access, open the Bedrock console in ap-south-1 →
*Model catalog* → Amazon Nova Micro and accept or enable it (the console flow has changed over time;
**verify** what yours shows). Then retry.
**REPORT:** the output, or the exact error message.

---

## (c) Lambda concurrency quota

```powershell
aws lambda get-account-settings --region ap-south-1 `
  --query "AccountLimit.[ConcurrentExecutions,UnreservedConcurrentExecutions]"

aws service-quotas get-service-quota --region ap-south-1 `
  --service-code lambda --quota-code L-B99A9384 `
  --query "Quota.[QuotaName,Value]"
```

**REPORT:** both numbers. New accounts often show **10** instead of the usual 1,000 (**verify** on
yours). At 10 we can't use reserved concurrency (Lambda keeps at least 10 unreserved), so the
API Gateway throttles become the main guard. 10 is still enough for a demo. You can also request an
increase in the Service Quotas console now, because approval can take days.

---

## (d) AWS Budgets alerts at $5 and $15

1. Open `scripts/phase0/budget-notifications.json` and replace `YOUR_EMAIL_HERE` with your email.
   **Don't commit that edit.** Revert it after running the commands.
2. Run (use the account number from step 0):

```powershell
$acct = aws sts get-caller-identity --query Account --output text

aws budgets create-budget --account-id $acct `
  --budget file://scripts/phase0/budget-5.json `
  --notifications-with-subscribers file://scripts/phase0/budget-notifications.json

aws budgets create-budget --account-id $acct `
  --budget file://scripts/phase0/budget-15.json `
  --notifications-with-subscribers file://scripts/phase0/budget-notifications.json

aws budgets describe-budgets --account-id $acct `
  --query "Budgets[].[BudgetName,BudgetLimit.Amount,CostTypes.IncludeCredit]" --output table
```

Each budget alerts at 80% forecasted and 100% actual spend.

**Note on credits:** both budgets set `IncludeCredit: false`. Free Plan credits would otherwise
cancel out the charges, the budget would read $0, and the alert would never fire. With
`IncludeCredit: false` you're alerted on real usage even while credits cover it.

If you'd rather use the console: Billing and Cost Management → Budgets → Create budget →
*Customize* → Cost budget, then under *Advanced options* untick "Credits".

**REPORT:** the `describe-budgets` table.

---

## What to send back

1. `sts get-caller-identity` worked (yes or no)
2. Textract result (a)
3. Bedrock outputs b1 and b2
4. Lambda quota numbers (c)
5. Budgets table (d)
