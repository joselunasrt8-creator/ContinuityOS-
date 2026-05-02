export async function handleRequest() {
  return new Response(
    JSON.stringify({
      status: "FAILED",
      error: "legacy_gateway_disabled",
      message: "Legacy gateway path is disabled. Use /authority -> /compile -> /validate -> /execute -> /proof."
    }),
    { status: 410, headers: { "Content-Type": "application/json" } }
  );
}
