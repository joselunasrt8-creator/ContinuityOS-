const DECISION_ID_REQUIRED = "MS-DEMO-DEPLOY-001";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

async function sha256Hex(input) {
  const enc = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function requireKeys(body, keys) {
  const missing = keys.filter((k) => !(k in body));
  return missing;
}

async function getAuthority(env, authorityId) {
  return env.DB
    .prepare("SELECT * FROM authorities WHERE id = ?1")
    .bind(authorityId)
    .first();
}

async function getCompilation(env, compilationId) {
  return env.DB
    .prepare("SELECT * FROM compilations WHERE id = ?1")
    .bind(compilationId)
    .first();
}

async function getValidation(env, validationId) {
  return env.DB
    .prepare("SELECT * FROM validations WHERE id = ?1")
    .bind(validationId)
    .first();
}

function withLifecycle(base, currentState) {
  return {
    ...base,
    authority_lifecycle: {
      state: currentState,
      states: ["AUTHORIZED", "COMPILED", "VALIDATED", "EXECUTED", "PROVEN"]
    }
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "POST") {
      return json({ status: "NULL", reason: "POST only" }, 405);
    }

    if (url.pathname === "/webhook") {
      const payload = await readJson(request);
      if (!payload) return json({ status: "NULL", reason: "Invalid JSON" }, 400);
      return json({ status: "ok", received: payload });
    }

    if (url.pathname === "/authority") {
      const body = await readJson(request);
      if (!body) return json({ status: "NULL", reason: "Invalid JSON" }, 400);

      const missing = requireKeys(body, ["decision_id", "aeo"]);
      if (missing.length) {
        return json({ status: "NULL", reason: `Missing fields: ${missing.join(", ")}` }, 400);
      }

      if (body.decision_id !== DECISION_ID_REQUIRED) {
        return json({ status: "NULL", reason: "Unsupported decision_id" }, 403);
      }

      const authorityId = crypto.randomUUID();
      const now = new Date().toISOString();

      const authorityObject = withLifecycle(
        {
          decision_id: body.decision_id,
          aeo: body.aeo,
          created_at: now
        },
        "AUTHORIZED"
      );

      await env.DB.prepare(
        `INSERT INTO authorities (id, decision_id, aeo_json, state, authority_object_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'AUTHORIZED', ?4, ?5, ?5)`
      )
        .bind(authorityId, body.decision_id, JSON.stringify(body.aeo), JSON.stringify(authorityObject), now)
        .run();

      return json({ status: "VALID", authority_id: authorityId, authority_object: authorityObject });
    }

    if (url.pathname === "/compile") {
      const body = await readJson(request);
      if (!body) return json({ status: "NULL", reason: "Invalid JSON" }, 400);

      const missing = requireKeys(body, ["authority_id"]);
      if (missing.length) return json({ status: "NULL", reason: "Missing authority_id" }, 400);

      const authority = await getAuthority(env, body.authority_id);
      if (!authority) return json({ status: "NULL", reason: "Unknown authority_id" }, 404);

      const compilationId = crypto.randomUUID();
      const now = new Date().toISOString();
      const authorityObject = JSON.parse(authority.authority_object_json);

      const compiledObject = withLifecycle(
        {
          authority_id: authority.id,
          decision_id: authority.decision_id,
          aeo: JSON.parse(authority.aeo_json),
          authority_object: authorityObject,
          compiled_at: now
        },
        "COMPILED"
      );

      await env.DB.batch([
        env.DB.prepare(
          "UPDATE authorities SET state = 'COMPILED', updated_at = ?2 WHERE id = ?1"
        ).bind(authority.id, now),
        env.DB.prepare(
          `INSERT INTO compilations (id, authority_id, state, compiled_object_json, created_at, updated_at)
           VALUES (?1, ?2, 'COMPILED', ?3, ?4, ?4)`
        ).bind(compilationId, authority.id, JSON.stringify(compiledObject), now)
      ]);

      return json({ status: "VALID", compilation_id: compilationId, compiled_object: compiledObject });
    }

    if (url.pathname === "/validate") {
      const body = await readJson(request);
      if (!body) return json({ status: "NULL", reason: "Invalid JSON" }, 400);

      const missing = requireKeys(body, ["compilation_id"]);
      if (missing.length) return json({ status: "NULL", reason: "Missing compilation_id" }, 400);

      const compilation = await getCompilation(env, body.compilation_id);
      if (!compilation) return json({ status: "NULL", reason: "Unknown compilation_id" }, 404);

      const validationId = crypto.randomUUID();
      const now = new Date().toISOString();
      const compiledObject = JSON.parse(compilation.compiled_object_json);

      const validatedObject = withLifecycle(
        {
          ...compiledObject,
          validated_at: now
        },
        "VALIDATED"
      );

      const objectHash = await sha256Hex(canonicalJson(validatedObject));

      await env.DB.batch([
        env.DB.prepare("UPDATE authorities SET state = 'VALIDATED', updated_at = ?2 WHERE id = ?1")
          .bind(compilation.authority_id, now),
        env.DB.prepare("UPDATE compilations SET state = 'VALIDATED', updated_at = ?2 WHERE id = ?1")
          .bind(compilation.id, now),
        env.DB.prepare(
          `INSERT INTO validations (id, compilation_id, authority_id, state, validated_object_json, validated_object_hash, created_at, updated_at)
           VALUES (?1, ?2, ?3, 'VALIDATED', ?4, ?5, ?6, ?6)`
        ).bind(validationId, compilation.id, compilation.authority_id, JSON.stringify(validatedObject), objectHash, now)
      ]);

      return json({ status: "VALID", validation_id: validationId, validated_object: validatedObject, validated_object_hash: objectHash });
    }

    if (url.pathname === "/validate-pr") {
      const body = await readJson(request);
      if (!body) return json({ status: "NULL", result: "NULL", reasons: ["Invalid JSON"] }, 400);

      const reasons = [];

      if (body.repo !== "joselunasrt8-creator/mindshift-demo") {
        reasons.push("repo must be joselunasrt8-creator/mindshift-demo");
      }
      if (!body.branch) {
        reasons.push("branch must not be empty");
      }
      if (!body.head_sha) {
        reasons.push("head_sha must not be empty");
      }
      if (!body.pr_number) {
        reasons.push("pr_number must not be empty");
      }

      if (reasons.length > 0) {
        return json({ status: "NULL", result: "NULL", reasons }, 403);
      }

      return json({ status: "VALID", result: "VALID" });
    }

    if (url.pathname === "/execute") {
      const body = await readJson(request);
      if (!body) return json({ status: "NULL", reason: "Invalid JSON" }, 400);

      const missing = requireKeys(body, ["validation_id", "webhook_url"]);
      if (missing.length) {
        return json({ status: "NULL", reason: `Missing fields: ${missing.join(", ")}` }, 400);
      }

      const validation = await getValidation(env, body.validation_id);
      if (!validation) return json({ status: "NULL", reason: "Unknown validation_id" }, 404);

      const now = new Date().toISOString();
      const validatedObject = JSON.parse(validation.validated_object_json);
      const executedObject = validatedObject;
      const executedNormalized = canonicalJson(executedObject);
      const validatedNormalized = canonicalJson(validatedObject);

      if (validatedNormalized !== executedNormalized) {
        return json(
          {
            status: "NULL",
            reason: "Invariant violation: validated_object must equal executed_object"
          },
          409
        );
      }

      let upstream;
      try {
        upstream = await fetch(body.webhook_url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            event: "mindshift.execution",
            validation_id: validation.id,
            validated_object: validatedObject
          })
        });
      } catch (error) {
        return json({ status: "NULL", reason: `Webhook delivery failed: ${error.message}` }, 502);
      }

      const executionId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("UPDATE authorities SET state = 'EXECUTED', updated_at = ?2 WHERE id = ?1")
          .bind(validation.authority_id, now),
        env.DB.prepare("UPDATE compilations SET state = 'EXECUTED', updated_at = ?2 WHERE id = ?1")
          .bind(validation.compilation_id, now),
        env.DB.prepare("UPDATE validations SET state = 'EXECUTED', updated_at = ?2 WHERE id = ?1")
          .bind(validation.id, now),
        env.DB.prepare(
          `INSERT INTO executions (id, validation_id, authority_id, webhook_url, state, executed_object_json, webhook_status, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, 'EXECUTED', ?5, ?6, ?7, ?7)`
        ).bind(executionId, validation.id, validation.authority_id, body.webhook_url, JSON.stringify(executedObject), upstream.status, now)
      ]);

      return json({
        status: "VALID",
        execution_id: executionId,
        execution_surface: "webhook",
        webhook_status: upstream.status,
        validated_object: validatedObject,
        executed_object: validatedObject
      });
    }

    if (url.pathname === "/proof") {
      const body = await readJson(request);
      if (!body) return json({ status: "NULL", reason: "Invalid JSON" }, 400);

      const missing = requireKeys(body, ["execution_id", "run_id", "commit_sha", "workflow", "environment"]);
      if (missing.length) return json({ status: "NULL", reason: `Missing fields: ${missing.join(", ")}` }, 400);

      const execution = await env.DB
        .prepare("SELECT * FROM executions WHERE id = ?1")
        .bind(body.execution_id)
        .first();

      if (!execution) return json({ status: "NULL", reason: "Unknown execution_id" }, 404);

      const proofId = crypto.randomUUID();
      const now = new Date().toISOString();
      const executedObject = JSON.parse(execution.executed_object_json);
      const executedHash = await sha256Hex(canonicalJson(executedObject));

      const proofObject = {
        proof_id: proofId,
        execution_id: execution.id,
        authority_id: execution.authority_id,
        execution_surface: "webhook",
        github: {
          run_id: body.run_id,
          commit_sha: body.commit_sha,
          workflow: body.workflow,
          environment: body.environment
        },
        transfer_hash: executedHash,
        generated_at: now,
        authority_lifecycle: {
          state: "PROVEN",
          states: ["AUTHORIZED", "COMPILED", "VALIDATED", "EXECUTED", "PROVEN"]
        }
      };

      await env.DB.batch([
        env.DB.prepare("UPDATE authorities SET state = 'PROVEN', updated_at = ?2 WHERE id = ?1")
          .bind(execution.authority_id, now),
        env.DB.prepare("UPDATE executions SET state = 'PROVEN', updated_at = ?2 WHERE id = ?1")
          .bind(execution.id, now),
        env.DB.prepare(
          `INSERT INTO proofs (id, execution_id, authority_id, proof_json, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?5)`
        ).bind(proofId, execution.id, execution.authority_id, JSON.stringify(proofObject), now)
      ]);

      return json({ status: "VALID", proof: proofObject });
    }

    return json({ status: "NULL", reason: "Not found" }, 404);
  }
};
