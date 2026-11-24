# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords, email addresses and
  charger ids first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## How the integration handles your credentials

- The Hypervolt password is declared as a `secret` field: Gladys stores it and
  hands it to the integration container only.
- It is sent only to the Hypervolt authentication server
  (`kc.prod.hypervolt.co.uk`), over HTTPS.
- The access and refresh tokens stay in memory; they are never written to disk
  nor logged. All traffic to Hypervolt uses HTTPS / WSS.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the Hypervolt cloud, apps and chargers (report those to Hypervolt).
