---
kind: todo
priority: 3
id: tls-expiry
title: TLS Certificate Expiry Recovery
---

# TLS Certificate Expiry Recovery

TLS expiry causes browser `ERR_CERT_DATE_INVALID`, API handshake failures, and synthetic down alerts simultaneously across all edges. Check expiry via `openssl s_client -connect host:443 -servername host | openssl x509 -noout -dates` and certificate transparency logs.

Immediate fix: force renewal via `certbot renew --force-renewal` or Vercel dashboard reissue. If using Let's Encrypt, verify http-01 challenge route is reachable and not blocked by deploy freeze or WAF. For manual certs, upload new cert to load balancer and trigger rolling reload. Verify chain is complete with intermediate included.

If renewal blocked by DNS, fix DNS first per dns.md then retry. Monitor `tls_handshake_errors` drop to zero and synthetic probe recovery.

Prevention: enable auto-renew with 30-day advance, set PagerDuty alert at 21, 14, and 3 days before expiry, and add calendar ownership. After recovery, scan all domains for expiry within 60 days and renew proactively. Document as `kind:todo` priority 3.

Post-incident task: move to managed certificates with auto-rotate rather than manual upload. Record expiry timestamp and replacement cert serial for audit.
