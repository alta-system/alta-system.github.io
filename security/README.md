# Protected Cloudflare deployment (not active on GitHub Pages)

`worker.mjs` is a server-side access gate, not a browser password screen. It protects all paths on the Cloudflare deployment, including JSON and archives. `/admin` requires the sole administrator account named by `ADMIN_USERNAME`. Ordinary users cannot call user-management APIs. Passwords use PBKDF2-SHA256 with unique salts, sessions use random HttpOnly/Secure/SameSite cookies, password changes/reset revoke sessions, and login attempts are limited per IP/15-minute window. Accounts require a new password after 30 days and on first use of a temporary password. Password expiry does not reduce map/API traffic; it is an account policy.

## Activate only after configuring Cloudflare

1. Create a Cloudflare D1 database and execute `security/schema.sql`. Bind it to the Pages project as `DB` (production and preview if used).
2. Choose an administrator username of 3–64 ASCII letters/digits/underscore/dot/hyphen. Set the Pages runtime variable `ADMIN_USERNAME`.
3. On your own computer run `python3 security/make_admin_hash.py`. Enter the password locally; the script never prints it. Save `ADMIN_PASSWORD_HASH` and `ADMIN_PASSWORD_SALT` as encrypted Cloudflare Pages runtime secrets. Do not put the password, hash, or salt in the repository or chat.
4. Register the existing GitHub Secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` only if you have authorized the Cloudflare deployment. The workflow builds a separate Cloudflare artifact with `_worker.js`; missing runtime configuration fails closed with HTTP 503.
5. Open `/login` on the Cloudflare URL, then `/admin`. The first successful administrator login creates the admin record. Add users, deliver each temporary password through a separate trusted channel, and have the user change it immediately.
6. Verify unauthenticated `/`, `/production/index.json`, `/maritime/index.json`, and `/archive/index.json` redirect to login, and a normal user gets HTTP 403 on `/admin` and `/auth/users`. Configure Pages to fail closed when the Functions allowance is exhausted.
7. GitHub Pages and this public repository remain publicly readable until separately retired or made private. Cloudflare authentication cannot hide data already published to GitHub. Do not claim confidentiality while these public copies exist. Disable the public site only after the protected deployment has been tested and the owner decides how to retain/remove public history.

No administrator account has been registered by committing this code. Cloudflare/D1 setup and the owner's chosen credentials are still required. Database use is limited to accounts/sessions; aviation data continues to use JSON files.

## Administrator recovery

There is intentionally no public password-reset or admin-signup endpoint. An owner who loses the administrator password must use their authenticated Cloudflare dashboard to update the administrator hash/salt in D1, increment `version`, and delete that user's sessions. Updating bootstrap environment secrets alone does not overwrite an existing administrator.

## References

- https://developers.cloudflare.com/pages/functions/advanced-mode/
- https://developers.cloudflare.com/pages/functions/bindings/
- https://developers.cloudflare.com/pages/functions/routing/
