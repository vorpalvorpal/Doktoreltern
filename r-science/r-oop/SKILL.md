---
name: r-oop
description: >
  Decide whether an R problem needs object orientation at all, and if it does,
  pick and implement the right system (S7 preferred, then S3; vctrs for
  vector-like types). Use when tempted to define a class, when modelling
  structured domain objects, or when reviewing existing OOP code in an R
  package.
---

# Object orientation in R — only when it earns its place

The house style is **functional by default** (see the `conventions` skill).
Most scientific code is functions over plain data structures — vectors,
matrices, lists, data frames. Reach for a class only when one of these is
genuinely true:

- you need **polymorphism** — the same generic doing the right thing across
  several types (`print`, `predict`, `summary` on model objects);
- you have a **stateful object with an invariant** worth protecting at the
  boundary (a fitted model, a connection, a parameterised process);
- you're building a **vector-like type** that must slot into data frames.

If none holds, don't define a class. A named vector and a couple of pure
functions are clearer and faster:

```r
# Don't create a Point class for this
point <- c(x = 1.5, y = 2.3)
distance <- function(p, q) sqrt(sum((p - q)^2))
```

## Which system

When you do need OOP, choose in this order:

| Situation | Use |
|-----------|-----|
| New class in a package — validation, dispatch, hierarchy | **S7** |
| Simple class, minimal deps, or extending an existing S3 ecosystem | **S3** |
| Vector-like type that lives in data frames (units, percentages, dates) | **vctrs** |
| Bioconductor interop, or maintaining existing S4 | **S4** (only then) |

**Default to S7** for anything new and non-trivial: it gives formal classes,
validated properties, and multiple dispatch while staying S3-compatible. Use
**S3** for genuinely simple cases. Avoid S4 and R6 unless there's a concrete,
stated reason — prefer passing state explicitly over R6's mutable objects.

## S7 (preferred)

```r
library(S7)

Range <- new_class("Range",
  properties = list(start = class_double, end = class_double),
  validator = function(self) {
    if (self@end < self@start) "@end must be >= @start"
  }
)

x <- Range(start = 1, end = 10)
x@end <- 20            # validated on assignment

inside <- new_generic("inside", "x")
method(inside, Range) <- function(x, y) y >= x@start & y <= x@end
```

Inheritance and multiple dispatch:

```r
Employee <- new_class("Employee", parent = Person,
  properties = list(company = class_character))

method(greet, Employee) <- function(x) {
  super(x, Person)@greet()
  cat("I work at", x@company, "\n")
}

combine <- new_generic("combine", c("x", "y"))
method(combine, list(Person, Person)) <- function(x, y) { ... }
```

Properties are validated on construction *and* assignment — put the scientific
invariants of the object (non-negative variance, ordered breakpoints, summing
to one) in the `validator`, with a reference where the constraint comes from.

## S3 (simple cases)

A constructor that validates, plus methods on generics:

```r
new_person <- function(name, age) {
  stopifnot(is.character(name), length(name) == 1)
  stopifnot(is.numeric(age), length(age) == 1)
  structure(list(name = name, age = age), class = "person")
}

print.person <- function(x, ...) {
  cat("Person:", x$name, "(age", x$age, ")\n")
  invisible(x)
}

greet <- function(x) UseMethod("greet")
greet.person <- function(x) cat("Hello, my name is", x$name, "\n")
```

Inheritance is by class vector + `NextMethod()`:

```r
new_employee <- function(name, age, company) {
  obj <- new_person(name, age)
  obj$company <- company
  class(obj) <- c("employee", class(obj))
  obj
}
print.employee <- function(x, ...) { NextMethod(); cat("Works at:", x$company, "\n") }
```

## vctrs (vector-like types)

When the object should behave like an atomic vector and live in a data frame
column — a custom unit, a bounded quantity, a domain-specific scalar — build it
with vctrs for type- and size-stability. See the `benchmark-optimise` skill's
note on type stability; build the class with `new_vctr()` and define
`vec_ptype2`/`vec_cast` methods for coercion. Reach for this only when data
frame integration is the actual requirement.

## Migrating S3 → S7

Usually 1–2 hours and backward-compatible: lift the constructor's fields into
`properties`, move validation into the `validator`, and keep existing S3
generics working. Migrate S4 → S7 only after confirming the S4-specific
features are genuinely needed.

## In review

When reviewing OOP code, the first question is *should this be a class at all?*
Flag classes that wrap a single value, hold no invariant, and gain nothing over
a function. The second question is *is it the right system?* — an S4 class
outside Bioconductor, or R6 holding mutable state that could be passed
explicitly, needs a justification in the code.
