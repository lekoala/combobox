# Contributing

Read `AGENTS.md` first, then the relevant design document.

For implementation changes:

1. state which documented use case/contract the change serves;
2. avoid adding compatibility machinery that violates the fallback policy;
3. add a real-browser regression test for interaction/form/a11y behavior;
4. update API/migration docs when public behavior changes;
5. keep unrelated cleanup out of behavior changes.

The POC has no build step. The engine + Custom Element split and working `@lekoala/combobox` identity are fixed; the final ESM/browser export shape is still a Phase 0 decision and should not be solved opportunistically inside unrelated feature work.
