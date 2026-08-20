# Cloned Reference Repositories

| Repository                | Local path                               | Revision verified | Guide purpose                                         |
| ------------------------- | ---------------------------------------- | ----------------- | ----------------------------------------------------- |
| `better-auth/better-auth` | `/tmp/creozentic-oss-refs/better-auth`   | `e84ec5e`         | Auth organization, OAuth, passkey, and TOTP reference |
| `gitroomhq/postiz-app`    | `/tmp/creozentic-oss-refs/postiz-app`    | `4e959fa`         | Social adapter reference                              |
| `getlago/lago`            | `/tmp/creozentic-oss-refs/lago`          | `330f78f`         | Billing/usage reference                               |
| `growthbook/growthbook`   | `/tmp/creozentic-oss-refs/growthbook`    | `6fa4176`         | Experiment and feature-flag reference                 |
| `novuhq/novu`             | `/tmp/creozentic-oss-refs/novu`          | `3f6bb54`         | Notification workflow reference                       |
| `svix/svix-webhooks`      | `/tmp/creozentic-oss-refs/svix-webhooks` | `34f427e`         | Signed webhook delivery reference                     |

These repositories are reference clones outside the application tree. The project must not import their unrelated application surfaces. Only narrow adapter contracts and license-compliant boundaries belong in this repository.
