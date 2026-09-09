# Isolated renderer CPU profiles

Synthetic 50k-note Electron library, same fixture and profiling harness. Before c9d7669 and after 99badae; raw JSON records source identity and timings. Chrome DevTools can open the cpuprofile files. The source change memoizes CodeMirror extensions and searches wiki completion through bounded indexed IPC instead of the cached page.

Median wall-clock input 564.25 → 347.39 ms; save acknowledgement 976.84 → 842.99 ms; preview 218.64 → 84.71 ms. Three interactions per run are observations, not population percentiles. Wall time includes automation, debounce, dispatch and polling. Exclusive sampled CodeMirror time was 435.50 → 257.76 ms; most profile duration is idle/native program time, so do not attribute the entire change to React or extension memoization.

The earlier renderer-v1 50k run had a 6.9-second input outlier. It did not recur in these profiles; this does not establish that every long-tail stall is eliminated. Both versions already render 50 initial sidebar rows. Full 100/1k/10k/50k comparison and caveats remain in [renderer-v1](../renderer-v1/README.md). No real user library was profiled.
