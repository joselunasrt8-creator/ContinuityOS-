export default {
  async fetch() {
    return new Response(
      JSON.stringify({
        status: "FAILED",
        error: "legacy_worker_disabled",
        message: "This legacy worker is decommissioned. Use governed runtime endpoints only."
      }),
      { status: 410, headers: { "content-type": "application/json" } }
    )
  }
}
