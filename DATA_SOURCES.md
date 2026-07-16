# Data sources

## Labels

Values should be understood under five labels:

- **Data-derived:** extracted from a locally supplied EVE Static Data Export.
- **Observed:** measured from recorded behavior and not guaranteed by CCP.
- **Calibrated:** tuned to reproduce a useful timing/handling target.
- **Approximated:** a simpler equation replacing a private or impractical live mechanic.
- **Simulator-specific:** intentionally chosen for training readability.

The shipped build currently uses calibrated and simulator-specific defaults. It does not claim an exact live fit.

## SDE extraction

`scripts/update-eve-data.ts` accepts an extracted SDE directory containing JSON files. It scans paths in deterministic order, recognizes Nestor, smartbomb, propulsion, cruise-missile, and torpedo names, normalizes dogma attributes by numeric ID, records source metadata, warns on invalid/missing fields, and writes `src/data/eve-normalized.json`.

```bash
npm run data:update -- /path/to/extracted/sde
```

An alternate output path may be supplied as the second argument. Archives should be extracted before invocation. Network downloading is deliberately not automatic in the normal build; a manually downloaded SDE keeps provenance and licensing decisions explicit.

## Fallbacks and validation

The app does not require the generated file at runtime yet; movement and combat calibrations are isolated in `Simulation.ts`. This guarantees an offline fallback. When integrating generated records, validate units, dogma attribute meanings, missing values, and fit-specific modifiers before replacing simulator defaults. Preserve a labeled fallback for every required value.
