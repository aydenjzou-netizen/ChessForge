# Phase 0 Azure Portal Register

No Azure resources were created during the local repository work. The following actions require the owner’s subscription choice and budget amount.

## Required inputs

- Azure subscription name/ID:
- Monthly budget amount and currency:
- Budget alert recipients:
- Intended billing agreement:
- Production resource owner:

## Ordered Phase 0 actions

| Order | Portal action | Status | Evidence to record |
|---:|---|---|---|
| 1 | Open **Subscriptions** and select the intended subscription | Pending input | Subscription ID/name |
| 2 | Open **Usage + quotas** and verify compute quota in **Southeast Asia** | Pending | Relevant VM-family quota |
| 3 | Create resource group `rg-chessforge-prod-sea` in **Southeast Asia** with standard tags | Pending | Resource ID |
| 4 | Create a resource-group-scoped monthly budget | Pending input | Budget ID/amount/currency |
| 5 | Add alert thresholds at 50%, 80%, and 100% | Pending input | Recipient/action evidence |
| 6 | Use Azure Pricing Calculator for Static Web Apps, Linux VM, disk, bandwidth, Storage, Monitor, and Backup | Pending | Exported estimate |
| 7 | Record estimate date, currency, region, VM assumptions, storage/monitoring/backup assumptions | Pending | Link or local export |

## Safety rule

Do not create the resource group, budget, or chargeable resources under an inferred subscription. Do not invent a budget amount or alert recipient.

