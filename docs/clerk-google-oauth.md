# Enabling "Sign in with Google" (Clerk)

Google sign-in is a Clerk **social connection**. It is included in Clerk's free tier — social
logins are core auth, not a paid add-on (only enterprise SSO/SAML and higher MAU are gated).

**No application code is involved.** `/login` renders Clerk's `<SignIn />`
(`src/components/auth/ClerkSignInScreen.tsx`) with no social-button restriction, so the Google
button appears automatically once the connection is enabled in the Clerk Dashboard. Enabling or
disabling it never needs a redeploy.

## Development / preview instance

Dev instances use Clerk's shared Google OAuth credentials — no Google Cloud setup.

1. Clerk Dashboard → the **development** instance → **User & Authentication → SSO Connections**.
2. **Add connection → For all users → Google**.
3. Leave **Use custom credentials OFF**. Save.
4. Reload preview `/login` — "Continue with Google" appears.

Caveat: on shared credentials the Google consent screen shows "Clerk", not "RebelShops". Fine for
non-production.

## Production instance

Production **requires custom credentials** so the consent screen reads "Sign in to RebelShops".
Google does not charge for OAuth.

Prerequisite: the Clerk **custom domain** (`clerk.rebelshops.com`) should be configured first, because
the redirect URI Google must whitelist is derived from it. Without it, Clerk falls back to its
`*.clerk.accounts.dev` shared domain and the redirect URI uses that instead.

1. **Clerk** (production instance): SSO Connections → Google → **Use custom credentials ON**. Copy the
   **Authorized Redirect URI** Clerk displays (e.g. `https://clerk.rebelshops.com/v1/oauth_callback`) —
   copy it verbatim, do not hand-construct it.
2. **Google Cloud Console** (console.cloud.google.com):
   - **APIs & Services → OAuth consent screen**: User Type **External**; app name, support email,
     logo, domain. Publish it ("Testing" → "In production") so all Google users can sign in.
   - **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application**.
   - **Authorized redirect URIs**: paste the URI from step 1.
   - Create → copy **Client ID** and **Client Secret**.
3. **Clerk**: paste Client ID + Secret into the custom-credentials fields. Save.
4. Scopes: keep the default `email profile openid`. Extra scopes trigger Google's app-verification
   review and are not needed here.

The button appears on production `/login` immediately after saving — no redeploy.

## How a Google sign-in maps to our data

Nothing special: a Google sign-in produces a Clerk session with a verified primary email, exactly
like an email/password sign-in. `requireAuth` resolves it to a `users` row by `clerk_user_id`,
just-in-time-creating one on first sign-in per the linking rule in
`docs/plans/clerk-integration.md`. The `password_hash` sentinel (`'!'`) applies — a Google-only
user has no password, and `'!'` can never verify.
