# Production Deploy Boundary Lock

Production deploy is locked to the governed chain only:

1. `POST /authority`
2. `POST /compile`
3. `POST /validate` must return exact `status=VALID` and `result=VALID`.
4. `validated_object_hash` must exactly match the object that is executed.
5. `POST /execute` dispatches the governed production workflow target (`governed-deploy.yml`) only.
6. `POST /proof` must record proof for the execution.
7. Invocation authority/nonce is single-use and replay is rejected.

If no valid object exists, no production action is executed.

Non-production workflows must not be used as production deploy paths.


`workflow_dispatch` is permitted only for `governed-deploy.yml`; non-governed production deploy paths are disallowed.

The blocked `npm run deploy` script is a convenience guard, not the full bypass lock.
