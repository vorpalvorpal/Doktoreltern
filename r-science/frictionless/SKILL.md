---
name: frictionless
description: >
  Author, validate, and document tabular data as Frictionless Data Packages in
  R (CSV/Parquet + a datapackage.json Table Schema). Use when shipping tabular
  data with a package, documenting fields/units/sources, or storing a
  reference/known-answer dataset used as a test oracle.
---

# Frictionless Data Packages in R

A **Data Package** bundles data files with a `datapackage.json` that carries the
metadata: a **Table Schema** for each tabular resource (field names, types,
constraints) plus provenance (sources, licenses, version). The result is
self-describing, language-agnostic, and *validatable* — not just a bare CSV.

Use it for tabular data shipped with the package (per the `conventions` data
tiers: CSV for small, Parquet for large) and especially for
**reference/known-answer datasets** used as `tests` oracles: the schema
documents the columns, the sources document where the numbers came from.

## The R toolchain (`frictionless` package)

```r
library(frictionless)

# Author from a data frame
schema <- create_schema(my_df)             # infer fields + types, then hand-edit
pkg <- create_package() |>
  add_resource("ssd_ref", data = my_df, schema = schema)
write_package(pkg, "inst/extdata/ssd")     # writes datapackage.json + ssd_ref.csv

# Read back — values are coerced to the schema's types
pkg <- read_package("inst/extdata/ssd/datapackage.json")
resources(pkg)                             # resource names
df  <- read_resource(pkg, "ssd_ref")       # tibble, typed per the schema
```

## Author the Table Schema

`create_schema()` infers a starting point; **edit it to tighten types and add
constraints** — that's what turns "described" into "validatable". Each field
has a `name`, a `type` (`string`/`number`/`integer`/`boolean`/`date`/
`datetime`/…), and optional `constraints` (`required`, `minimum`/`maximum`,
`enum`, `pattern`).

**Units matter in science and Table Schema has no first-class unit field.**
Record the unit explicitly — a custom `unit` property and/or the `description`
— and be consistent across the package; never leave units implicit.

```json
{ "name": "concentration", "type": "number", "unit": "ug/L",
  "constraints": { "minimum": 0, "required": true },
  "description": "Measured concentration (µg/L)" }
```

## Provenance (dovetails with the tests oracle rule)

Put the source on the resource and the package: `sources` (title + path/DOI),
`licenses`, `contributors`, `version`. For a reference dataset used as a
known-answer oracle, this is what makes the answer *trustworthy* — anyone can
trace the numbers back to the paper or standard.

```json
"sources": [{ "title": "Smith et al. (2019)", "path": "https://doi.org/10.…" }]
```

## Validate

`read_resource()` coerces and structurally checks on read. For full
spec validation (types, constraints, schema correctness), use the Python
frictionless CLI — and run it in a test or CI for any data the package ships:

```bash
pip install frictionless
frictionless validate inst/extdata/ssd/datapackage.json
```

## Parquet

The same Table Schema describes a Parquet resource — point the resource `path`
at the `.parquet` file and set `format`/`mediatype` accordingly. Use Parquet for
the large-tabular tier (see `conventions`), CSV for small. Both are
Frictionless-validatable; a `qs2` blob is not (it can only be *documented*).

## With the tests skill

A reference/known-answer dataset lives under `tests/testthat/fixtures/` (or
`inst/extdata/`) as a Data Package. In the test, `read_resource()` loads it with
the correct types, while the schema and `sources` record what it is and where it
came from — exactly the provenance the `tests` skill requires of an oracle
dataset.
