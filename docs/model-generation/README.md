# Model generation archive

This directory preserves the source artifacts used while building the procedural iPhone model with the `img2threejs` workflow.

- `assessment.json`: initial reference and quality assessment.
- `detail-inventory.json`: inspected detail zones.
- `object-sculpt-spec.json`: procedural modeling specification.
- `generatedIPhoneFactory.ts`: earlier generated factory output.
- `img2threejs-state.json`: saved workflow state.
- `PRODUCT_MODE.md`: historical product-mode notes; some implementation status in this file predates the completed native ReplayKit pipeline.

The production model used by the workbench is `web/src/createIPhone17ProMax.js`. Reference imagery is stored under `assets/model-reference/`.
