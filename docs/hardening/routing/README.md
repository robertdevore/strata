# Offline routing evaluation

The same 50 published examples improved from 46/50 to 50/50 exact intent/route/risk/confirmation matches. Explicit operations now take priority over incidental topic words; whole-word matching prevents “staging” from selecting tags. Before and after JSON preserve source and fixture hashes, every expected/actual result and timing.

Final 5,000 classification samples: median 0.392 ms, p95 0.696 ms. Baseline median 0.236 ms, p95 0.431 ms. This small classifier is more accurate on its fixed fixture, not faster. Run `npm run eval:routing` to reproduce; timing varies by host.

These are offline classification results, not live model answer quality. Provider calls, cost and tool calls are zero; model input/output token counts are unmeasured (null). Synthetic provider regressions separately verify fallback, partial writes, proposal approval, cancellation, tool limits, schema rejection, capability compatibility and structured mutation outcomes. No live-provider quality or price claim is made.
