---
kind: decision
priority: 4
id: slo-burn
title: SLO Burn Response
---

# SLO Burn Response

SLO burn indicates error budget consumption above burn rate threshold even if absolute error rate is moderate. Calculate burn rate as `error_budget_consumed / time_window` divided by allowed rate. Burn rate 1 consumes budget exactly on schedule; burn rate 6 consumes one month budget in five days. Alert tiers: 2x slow burn warns, 6x fast burn pages.

Response: identify which SLI is burning — availability, latency p95, or throughput. Check if burn is from feature or infra. If fast burn, treat as SEV2 and freeze deploys. Evaluate error budget remaining and communicate freeze duration to product.

Mitigation trade: spend budget on rollback versus forward fix latency. If remaining budget below 50 percent, require director approval for risky deploys. Apply traffic shaping or rate limit to protect SLO while fixing.

Recovery: burn rate must drop below 1 for 30 minutes and 7-day burn projection must show positive remaining budget before closing. Document burn rate curve and decision to freeze or continue shipping as `kind:decision` priority 4. Update SLO review doc with burn postmortem.

Prevention: add burn rate dashboard and auto freeze gate at 6x.
