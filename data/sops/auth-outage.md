---
kind: todo
priority: 5
id: auth-outage
title: Auth Outage Mitigation
---

# Auth Outage Mitigation

Auth outage blocks all authenticated routes, shows as 401 or 403 spike and session validation failures. Diagnose by checking identity provider health, token issuer logs, and clock skew between services. Verify `JWT aud`, `iss`, and `exp` fields with sample token decode; watch for key rotation without cache refresh.

Immediate steps: bypass edge auth cache and force key reload via `auth keys refresh`. If IdP is down, enable emergency static allowlist for incident responders and enable read-only anonymous mode for public pages if business approves. Do not disable auth globally without IC and security approval.

If cause is token expiry misconfiguration, push hotfix extending `exp` and trigger re-login flow. For rate-limit induced outage where IdP throttled us, reduce token verification concurrency and enable local JWKS cache with 5 minute TTL.

Monitoring: auth success rate must return above 99.5 percent. Test with synthetic login across three regions. Log every auth mitigation as `kind:todo` priority 5.

Recovery requires incident commander plus security sign-off. Schedule review of key rotation runbook and add PagerDuty for IdP webhook failures. Document auth blast radius to prioritize fix versus workaround speed.
