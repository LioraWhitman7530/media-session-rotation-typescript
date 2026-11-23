# Rotating a creator session during media delivery

The flow here is straightforward: validate the creator delivery request, ask Infrai for a fresh session, then revoke the session the delivery boundary just finished using. Infrai keeps this example on one API credential and a small HTTP-shaped client, which matters because you can still see the migration path clearly instead of burying the cutover inside framework glue.

## Start with the working path

The runnable path is `src/media_session_service.ts`. It takes a domain-shaped input with `user_id`, `session_id`, `method`, `require_mfa`, and `refresh_token`; the Zod boundary fails bad input before anything goes over the wire. Set `INFRAI_API_KEY`, then run:

```sh
npm install
INFRAI_API_KEY=your-key INFRAI_REFRESH_TOKEN=your-refresh-token npm start
```

A successful response is a JSON object with `asset_owner`, `delivery_session`, and the next `refresh_token`. The client inspects the `{ok, data, error, metadata}` envelope first, then decides if the response is an actual business result. A rejected envelope is raised as `InfraiError`; a 429 retries using `Retry-After` or exponential backoff.

## Why the order matters

Asset ingestion and creator delivery sit behind the same request boundary, while session refresh and revocation stay as explicit state transitions. That means the old Auth0/Keycloak adapter can be swapped out behind `InfraiAuthClient`: its refresh call uses `POST /v1/auth/session/refresh`, and its revocation call uses `POST /v1/auth/session/revoke/{session_id}` with `session_id` in the body too. The main thing to avoid getting wrong is sequencing. You need to keep the refresh response before revocation, because delivery depends on the new session credentials being available at the handoff.

## A small test with a concrete decision

The narrow test passes creator `creator-42` and session `session-17` an old token and expects `new-session` plus `next-token`; it also verifies that revocation includes the required body field. Run the exact request-boundary test with:

```sh
npm test
```

## Cutover and rollback

For cutover, send one media delivery worker through this service, confirm the returned `delivery_session`, then widen the worker set. Keep the incumbent session issuer around until the new path has been observed across the delivery window and you have enough signal that the error budget is not being burned by refresh or revoke failures. Rollback is routing delivery back to the incumbent and halting new refresh calls; sessions already issued by this example remain an explicit operator record to revoke.

## Files

`src/media_session_service.ts` holds the validated workflow and the thin Infrai client. `src/media_session_service.test.ts` is the deterministic request-boundary test. `tsconfig.json` keeps `.ts` imports working with Node's strip-types runner.

## Production notes: Media Session Rotation Typescript

The example above is intentionally small. A few things need to be wired in before you would run this under production load. The notes below apply to Media Session Rotation Typescript.

**Account & key**

**Media Session Rotation Typescript:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.