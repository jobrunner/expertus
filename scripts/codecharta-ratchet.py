#!/usr/bin/env python3
"""CodeCharta ratchet gate.

CodeCharta is a visualizer; it has no built-in "fail when worse". This turns its
merged map into a set of ratchets over metrics that aren't already gated elsewhere
(coverage has its own floors in the Test job; mutation is a separate gate).

BACKGROUND — why the gate is NOT built around the per-file complexity sum:
`complexity` sums McCabe complexity over every function in a file. Every function
starts at a base complexity of 1, so the sum GROWS when code is split into more,
smaller, named functions — even though that split is exactly what improves
readability. Measured with `ccsh` on a minimal example: one function with twelve
`if`s sums to 13 (max-per-function 12, 1 function); the same logic split into three
functions of four `if`s each sums to 16 (max-per-function 4, 4 functions) — the sum
rates the split as a regression, everything else about it as an improvement. The
same pattern showed up in this repo's own refactor: splitting src/actions.js and
src/views/plot-form.js into named functions left the complexity SUM flat or higher
(83 -> 83, 53 -> 58) while max_complexity_per_function fell sharply (81 -> 10,
52 -> 9) and max_rloc_per_function fell even more sharply (241 -> 39, 185 -> 46).
The sum is also satisfiable by splitting a FILE — the total just moves with the
code — which is a size control, not a complexity control.

Blocking ratchets (a regression fails the build):

  1. Function-length cap — max_rloc_per_function, the longest function's real
     lines of code. The most informative bound: it cannot be gamed by moving code
     between files (a function keeps its length wherever it lives), it gets BETTER
     rather than worse when a function is decomposed, and it tracks what actually
     costs a reader time — how much of a function they must hold in their head.
  2. Function-complexity cap — max_complexity_per_function, the single most complex
     function in a file (McCabe). Catches deep branching that stays hard to follow
     even in a short function; not gameable by moving code between files either.
  3. Function-parameter cap — max_parameters_per_function, the most parameters any
     one function takes. Catches the cost of explicit dependencies: a function with
     many parameters is doing what a closure used to hide, and that cost should stay
     visible even when it is an acceptable trade (e.g. after de-closuring a module).
  4. Hotspot gate — a file that is both complex (complexity >= min_complexity) and
     under-tested (line_coverage < min_coverage) fails, unless it is grandfathered
     in `allow`. This blocks NEW complex-and-untested files; shrink `allow` as the
     existing ones get tests.

Warning-only ratchet (reported, does NOT fail the build):

  5. Complexity-sum warning — the per-file SUM of function complexity, kept for
     visibility only (see BACKGROUND above for why it must not block). Regressions
     are printed as `::warning::` so they surface in the GitHub Actions UI, but the
     exit code is unaffected.

Every cap/warning ratchet shares the same shape: files listed in the baseline are
frozen at their recorded value (so they can't grow); everything else must stay
<= default_cap. Ratchet the numbers DOWN as code is simplified.

Inside a baseline, keys starting with `_` are prose, not paths — write the
justification for a number next to that number.

Usage: codecharta-ratchet.py <map.cc.json[.gz]> [config.json]
Exit codes: 0 = within ratchet (warnings may still have printed), 1 = a blocking
metric regressed (per-file report), 2 = usage / unreadable input / malformed map.
"""
import gzip
import json
import sys


def load_json(path):
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def cap_check(files, metric, default_cap, baseline, label, cfg_path):
    """Per-file ceiling on `metric`: files in `baseline` are frozen at their recorded
    value (can't grow), everything else must stay <= default_cap. Returns
    (violations, hints); a baseline file now BELOW its cap yields a ratchet-down hint.
    Files missing the metric are skipped."""
    # `_`-prefixed keys are prose, not paths: a justification belongs next to the
    # number it explains, and without this every such note is reported as a stale
    # baseline entry on every run — noise that trains readers to ignore the hints.
    baseline = {k: v for k, v in baseline.items() if not k.startswith("_")}
    violations, hints = [], []
    for rel, attrs in sorted(files.items()):
        val = attrs.get(metric)
        if val is None:
            continue
        cap = baseline.get(rel, default_cap)
        if val > cap:
            where = "baseline" if rel in baseline else f"default_cap {default_cap}"
            violations.append(f"{label}: {rel} = {val:.0f} > {cap} ({where})")
        elif rel in baseline and val < cap:
            hints.append(f"ratchet down: {rel} {label} {cap} -> {val:.0f} in {cfg_path}")
    # Flag stale baseline entries (file renamed/deleted) so the config stays clean —
    # a dead entry otherwise silently stops applying, mirroring the hotspot.allow hint.
    for rel in sorted(baseline):
        if rel not in files:
            hints.append(f"{label} baseline: {rel} is not in the map (renamed/deleted?) — remove it from {cfg_path}")
    return violations, hints


def leaves(node, parts):
    """Yield (relpath, attributes) for every File node, path relative to repo root
    (the map's root node name — 'root' — is stripped, so the rest matches the
    committed baseline keys like 'internal/adapters/...')."""
    p = parts + [node["name"]]
    if node.get("type") == "File":
        yield "/".join(p[1:]), (node.get("attributes") or {})
    for child in node.get("children", []):
        yield from leaves(child, p)


def load_cap_section(cfg, key):
    """Pull {metric, default_cap, baseline} out of cfg[key]; raises KeyError/TypeError
    on a missing or malformed section so main() can report it as a config error."""
    section = cfg[key]
    return section["metric"], section["default_cap"], section["baseline"]


def main():
    if len(sys.argv) < 2:
        print("usage: codecharta-ratchet.py <map.cc.json[.gz]> [config.json]", file=sys.stderr)
        return 2
    map_path = sys.argv[1]
    cfg_path = sys.argv[2] if len(sys.argv) > 2 else ".codecharta-ratchet.json"
    try:
        doc = load_json(map_path)
        cfg = load_json(cfg_path)
    except (OSError, ValueError) as e:  # missing/unreadable file or invalid JSON
        print(f"::error::cannot read input ({e})", file=sys.stderr)
        return 2
    nodes = doc.get("nodes")
    if not nodes:
        nodes = (doc.get("data") or {}).get("nodes")
    if not nodes:
        print(f"::error::{map_path}: no nodes in map — cannot run the ratchet", file=sys.stderr)
        return 2
    files = dict(leaves(nodes[0], []))
    if not files:
        print(f"::error::{map_path}: map has nodes but no File leaves — cannot run the "
              f"ratchet (ccsh format change?). Refusing to pass vacuously.", file=sys.stderr)
        return 2

    try:
        metric, default_cap, baseline = load_cap_section(cfg, "complexity")  # warning-only, see below
        fmetric, fdefault, fbaseline = load_cap_section(cfg, "function_complexity")
        rmetric, rdefault, rbaseline = load_cap_section(cfg, "function_rloc")
        pmetric, pdefault, pbaseline = load_cap_section(cfg, "function_parameters")
        hs = cfg["hotspot"]
        min_cx, min_cov, allow = hs["min_complexity"], hs["min_coverage"], set(hs["allow"])
    except (KeyError, TypeError) as e:  # missing key or wrong shape (typo in config)
        print(f"::error::{cfg_path}: malformed config ({e})", file=sys.stderr)
        return 2

    # Each baseline must be an object {path: cap}; otherwise cap_check's baseline.get()
    # would raise deep in the run instead of failing here with a clear message.
    baselines = (
        ("complexity.baseline", baseline),
        ("function_complexity.baseline", fbaseline),
        ("function_rloc.baseline", rbaseline),
        ("function_parameters.baseline", pbaseline),
    )
    for name, b in baselines:
        if not isinstance(b, dict):
            print(f"::error::{cfg_path}: {name} must be an object (got {type(b).__name__})", file=sys.stderr)
            return 2

    # Guard against a vacuous pass: if a cap metric is absent from EVERY file (a ccsh
    # version / parser change, or a typo'd metric name), cap_check would skip all files
    # and the gate would silently pass. Fail loudly instead — the map still has files.
    for m in (metric, fmetric, rmetric, pmetric):
        if not any(a.get(m) is not None for a in files.values()):
            print(f"::error::metric '{m}' is absent from every file in the map — "
                  f"ccsh version/parser mismatch? Refusing to pass vacuously.", file=sys.stderr)
            return 2

    violations, hints, warnings = [], [], []

    # 1. Function length — max_rloc_per_function. BLOCKING. The most informative cap:
    # cannot be gamed by splitting a file (a function's own length doesn't move when
    # its file does), and it gets better, not worse, when a function is decomposed.
    v, h = cap_check(files, rmetric, rdefault, rbaseline, "function-rloc", cfg_path)
    violations += v
    hints += h

    # 2. Function complexity — max_complexity_per_function. BLOCKING. A function
    # keeps its complexity wherever it lives, so passing requires actually
    # simplifying the function (or extracting cohesive sub-functions).
    v, h = cap_check(files, fmetric, fdefault, fbaseline, "function-complexity", cfg_path)
    violations += v
    hints += h

    # 3. Function parameters — max_parameters_per_function. BLOCKING. Keeps the cost
    # of explicit dependencies visible, even where it is an accepted trade-off.
    v, h = cap_check(files, pmetric, pdefault, pbaseline, "function-parameters", cfg_path)
    violations += v
    hints += h

    # 4. Per-file aggregate complexity (sum of function complexity). WARNING ONLY —
    # see BACKGROUND in the module docstring for why this must not block: it grows
    # when code is split into readable, named functions, and shrinks by splitting a
    # file rather than by simplifying it. Kept visible as a signal, not a gate.
    v, h = cap_check(files, metric, default_cap, baseline, "complexity", cfg_path)
    warnings += v
    hints += h

    # 5. Hotspots (complex AND under-tested). BLOCKING. Files without coverage data
    # are skipped (can't assess — e.g. cmd tools not exercised by unit tests).
    for rel, attrs in sorted(files.items()):
        val = attrs.get(metric)
        cov = attrs.get("line_coverage")
        if val is None or cov is None:
            continue
        if val >= min_cx and cov < min_cov and rel not in allow:
            violations.append(f"hotspot: {rel} complexity {val:.0f} >= {min_cx} AND coverage {cov:.1f}% < {min_cov}%")
    for rel in sorted(allow):
        attrs = files.get(rel)
        if attrs is None:
            hints.append(f"allowlist: {rel} is not in the map (renamed/deleted?) — remove it from hotspot.allow")
            continue
        cov, val = attrs.get("line_coverage"), attrs.get(metric)
        if val is not None and cov is not None and not (val >= min_cx and cov < min_cov):
            hints.append(f"allowlist: {rel} is no longer a hotspot — remove it from hotspot.allow")

    for h in hints:
        print(f"::notice::CodeCharta ratchet — {h}")
    for w in warnings:
        print(f"::warning::CodeCharta ratchet — {w}")
    if violations:
        print(f"\n❌ CodeCharta ratchet: {len(violations)} regression(s):")
        for v in violations:
            print(f"  - {v}")
        print(f"\nAdd tests / simplify the file, or (with justification) adjust {cfg_path}.")
        return 1
    suffix = f" ({len(warnings)} warning(s) — see above)" if warnings else ""
    print(f"✅ CodeCharta ratchet OK — {len(files)} files within the blocking caps + hotspot gate{suffix}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
