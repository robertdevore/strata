# Isolated desktop measurements

These immutable files compare original `e2ca89b` with checkpoint `53f8172` using the same renderer harness, synthetic input hash and installed Electron/dependencies. Both source trees were frozen. Each application used an explicitly assigned temporary user-data directory; the original version does not recognize the newer environment override. No real library or provider was used.

Each fixture contains 100/1k/10k/50k Markdown notes of roughly 2 KiB with unique search markers. One launch per size measures first home display, then opening the initially collapsed sidebar. Three distinct notes measure search, opening the editor, replacing its content, waiting for persistence and toggling Markdown preview. These are wall-clock Playwright interactions, including input dispatch, rendering, polling and autosave debounce, not isolated CPU timings or a statistically precise React profile. First editor/preview use includes lazy module initialization. JSON includes medians and maxima; single startup observations must not be treated as stable percentiles.

| Operation (ms) | Original 10k | Updated 10k | Original 50k | Updated 50k |
|---|---:|---:|---:|---:|
| Launch to home | 2,617.79 | 3,597.39 | 2,208.08 | 2,703.38 |
| Open sidebar to first row | 149.47 | 141.99 | 1,832.42 | 233.28 |
| Search marker | 109.40 | 228.15 | 347.10 | 225.61 |
| Open matching editor | 2,695.79 | 203.65 | 5,228.77 | 1,160.14 |
| Replace editor content | 348.10 | 321.14 | 667.47 | 373.31 |
| Replacement through persisted save | 1,027.88 | 742.87 | 2,704.72 | 785.36 |
| Show Markdown preview | 1,476.99 | 137.33 | 404.67 | 607.67 |

Small-library search is slower in the updated renderer because its server search is debounced; database search latency alone does not describe perceived search delay. Both versions already display 50 initial unprojected rows, so this comparison does not claim newly introduced DOM virtualization. The updated application avoids loading the whole corpus to produce that list.

Results are mixed outside large-list retrieval. Updated 50k content replacement had a 6,900.64 ms maximum despite a 373.31 ms median; startup and preview also varied. These outliers remain visible in the raw record and motivate further editor profiling. Do not summarize the table as a uniform renderer speedup. Process memory contains the unmodified fields returned by Electron `app.getAppMetrics`; shared process working sets should not be added together as exclusive allocation.

The first harness attempt waited for a sidebar row while the sidebar was collapsed and timed out. That failed trial is excluded; the frozen successful harness measures the actual home→open-sidebar interaction. Full desktop correctness tests are separate from these timing observations.
