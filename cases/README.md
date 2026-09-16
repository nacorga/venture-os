# Case Library

Public Venture OS cases live at:

```text
cases/<case-id>/case.yaml
```

Create a new case with `npm run case:new -- ...` and validate one case or the full library with `npm run case:validate`.

`case.yaml` is input only. Evaluator expectations, expected gates, scoring metadata, and hidden answer keys do not belong here.

The library is intentionally broader than the benchmark suite. A contributed case does **not** need an evaluator reference. Maintainers may later promote useful cases into the scored regression subset by adding a separate file under `evals/reference/`.

Current seed cases span B2B SaaS, marketplace, physical product/e-commerce, developer tooling, and consumer subscription.

See:

- `docs/CASE_FORMAT.md` for the v1 contract;
- `CONTRIBUTING.md` for the contribution workflow;
- `evals/README.md` for the benchmark boundary.
