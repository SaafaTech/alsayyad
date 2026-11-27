# Automatic hunt repair
- [x] Checkpoint each sweep item and enforce remaining-time budget.
- [x] Prioritize scans and evidence; clean stale runs even while disabled.
- [x] Reset both cursors and clean 41 existing stale runs; newer workers remain subject to the ten-minute threshold.
- [x] Run the full regression suite (198 passing) and verify build and database reset.
- [ ] Set all three managed schedule timeouts to 60000 ms (blocked: structured schedule tools expose no timeout parameter).