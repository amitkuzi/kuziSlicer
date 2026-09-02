# kuziSlicer — AI Toolbox Deployment & Development Guide

**Project:** VSCode-based 3D printer slicer extension  
**Status:** Ready for AI Toolbox integration  
**Benefit:** Intelligent tool routing for complex slicing tasks  

---

## 1. Setup (5 minutes)

### Step 1: Install AI Toolbox plugin

```bash
# In VSCode Claude Code
/plugin marketplace add amitkuzi/ai-toolbox
/plugin install ai-toolbox@ai-toolbox
```

### Step 2: Create kuziSlicer profile

Create `~/.claude/projects/kuziSlicer/profiles/kuziSlicer.yaml`:

```yaml
id: kuziSlicer-dev
privacy_default: local              # Keep STL/model data local
license_policy: commercial-ok       # Blend of open/proprietary tools
budget_usd_per_task: 0.50          # Cap per routing decision

weights:
  score: 0.35            # Past tool performance
  local: 0.25            # Local capability (geometry parsing, slicing)
  agent_ready: 0.20      # CLI/API-friendly
  cost: 0.15             # Cost (slicing is compute-heavy)
  fresh: 0.05            # Recently validated

task_type_affinity:
  stl-parsing: 1.0       # Parse STL files
  mesh-geometry: 1.0     # Geometry calculations
  path-planning: 1.0     # Tool path generation
  slicing-logic: 0.9     # Slicing algorithm
  code-generation: 0.8   # Extension code
  documentation: 0.5     # Technical docs
  vscode-extension: 0.8  # Extension development

paths:
  models: "~/3dModels"
  output: "~/kuziSlicer/output"
  temp: "~/kuziSlicer/temp"
```

### Step 3: Use this profile

```bash
/toolbox:route --profile kuziSlicer-dev "parse STL file and analyze wall thickness"
```

---

## 2. Typical kuziSlicer Tasks & Routing

### Task Type 1: STL Parsing & Geometry (LOCAL → T0)

**Task:**
```
Parse STL file, detect non-manifold edges, calculate wall thickness
```

**Expected routing:**
```
✅ Level: L1 (single deterministic task)
✅ Tier: T0 (local tools; no external service)
✅ Type: script
✅ Tools: python3 + numpy (for geometry), or rust-based tool
✅ Cost: $0 (local compute)
```

**Why:** Deterministic algorithm; all computation is local; no LLM needed.

**Command:**
```bash
/toolbox:route "Parse STL file ~/models/bracket.stl and detect wall thickness < 1mm"
```

---

### Task Type 2: Slicing Algorithm Design (LOCAL → T1)

**Task:**
```
Design adaptive layer height algorithm: thicker layers on flat surfaces, 
thinner on details (e.g., fine text, overhangs)
```

**Expected routing:**
```
✅ Level: L1–L2 (single domain, needs reasoning)
✅ Tier: T1 (needs intelligent algorithm design; local-capable solution)
✅ Type: script or model (depending on complexity)
✅ Tools: Python/Claude-Haiku (algorithm) OR pure math (no LLM)
✅ Cost: $0–0.05
```

**Why:** Algorithmic reasoning (best practices, heuristics) but implementation is local.

**Command:**
```bash
/toolbox:route "Design adaptive layer height algorithm for detailed prints"
```

---

### Task Type 3: VSCode Extension Code (T1–T2)

**Task:**
```
Implement webview UI for slicer settings: material, nozzle, bed temp, 
layer height, infill density. Use native VSCode API, no external frameworks.
```

**Expected routing:**
```
✅ Level: L2 (multi-step: UI design + API binding + testing)
✅ Tier: T1–T2 (Haiku for simpler UI, Sonnet for complex interactions)
✅ Type: code
✅ Tools: claude-haiku (T1, cost-effective) or claude-sonnet (T2, better quality)
✅ Cost: $0.05–0.20
```

**Why:** Code generation task; Haiku often sufficient for VSCode extension boilerplate.

**Command:**
```bash
/toolbox:route "Generate VSCode webview UI for slicer settings (material, temp, layer height, infill)"
```

---

### Task Type 4: Mesh Validation & Repair (T1–T2)

**Task:**
```
Analyze STL mesh for:
- Non-manifold edges
- Holes/gaps
- Self-intersections
- Suggest repair strategy (auto-close gaps, fill holes)
```

**Expected routing:**
```
✅ Level: L2 (analysis + suggestions)
✅ Tier: T1 (algorithm + heuristics; may need Sonnet for complex cases)
✅ Type: model or script
✅ Tools: Python/numpy (local) OR claude-haiku (analyze + suggest)
✅ Cost: $0–0.10
```

**Why:** Hybrid: local geometry tools for detection, LLM for repair strategy suggestions.

**Command:**
```bash
/toolbox:route "Analyze STL mesh for defects (non-manifold, gaps, intersections) and suggest repairs"
```

---

### Task Type 5: Multi-Language Extension (T2–T3)

**Task:**
```
Add Japanese + Chinese UI translations to kuziSlicer extension.
Translate slicer settings, error messages, documentation.
Ensure cultural appropriateness (e.g., temperature units, terminology).
```

**Expected routing:**
```
✅ Level: L2 (translation + quality check)
✅ Tier: T2 (Claude-Sonnet for cultural accuracy) or T3 (if needs deep context)
✅ Type: model
✅ Tools: claude-sonnet (T2, good translation quality)
✅ Cost: $0.10–0.30
```

**Why:** High-quality translation matters; Sonnet better than Haiku for nuance.

**Command:**
```bash
/toolbox:route "Translate kuziSlicer UI and docs to Japanese and Chinese, ensure cultural appropriateness for 3D printing context"
```

---

### Task Type 6: Performance Optimization (T2)

**Task:**
```
STL parsing is slow on large files (100MB+).
Profile the code, identify bottlenecks, optimize.
```

**Expected routing:**
```
✅ Level: L2–L3 (complex, needs benchmarking + optimization)
✅ Tier: T2 (performance analysis, algorithm optimization)
✅ Type: model + script (Sonnet for analysis, you implement)
✅ Cost: $0.15–0.40
```

**Why:** Needs expert reasoning about performance tradeoffs.

**Command:**
```bash
/toolbox:route "Profile STL parsing for 100MB+ files, identify bottlenecks, suggest optimization strategy"
```

---

### Task Type 7: Printer Hardware Integration (T2–T3)

**Task:**
```
Add support for printer X: detect max temp, build plate size,
nozzle size from printer API. Auto-populate slicer settings.
```

**Expected routing:**
```
✅ Level: L2 (integration work, API binding)
✅ Tier: T2 (integration logic) or T3 if hardware is esoteric
✅ Type: code or model
✅ Tools: claude-sonnet (T2) + code generation
✅ Cost: $0.15–0.50
```

**Why:** API integration requires careful handling; Sonnet better than Haiku.

**Command:**
```bash
/toolbox:route "Add printer X hardware support: detect specs (max temp, plate size, nozzle), auto-populate slicer settings"
```

---

## 3. Quick Reference — Task Routing Decision Tree

```
kuziSlicer task
    ↓
Is it deterministic math/parsing? (STL, geometry, slicing algorithm)
    ├─ YES → T0–T1 (local tools, Python/numpy/Rust)
    │         Cost: $0–$0.05
    │         Examples: parse STL, calculate wall thickness, layer height algorithm
    │
    └─ NO, needs reasoning/design?
        ↓
        Is it simple code generation? (UI, settings, basic features)
            ├─ YES → T1 (Claude-Haiku, VSCode extension boilerplate)
            │         Cost: $0.05–$0.15
            │         Examples: generate webview, simple validation
            │
            └─ NO, needs complex reasoning?
                ↓
                Is it integration/optimization/translation?
                    ├─ YES → T2 (Claude-Sonnet)
                    │         Cost: $0.15–$0.40
                    │         Examples: printer integration, performance tuning, translation
                    │
                    └─ NO, is it esoteric/edge-case?
                        ├─ YES → T3 (Frontier model if needed)
                        │         Cost: $0.40–$1.00
                        │         Examples: novel algorithm, edge-case hardware
                        │
                        └─ RARE: Probably should be T2, try that first
```

---

## 4. Development Workflow

### Start of day

```bash
# Route your day's tasks
/toolbox:route "Implement per-material temperature profiles (presets for PLA, ABS, PETG)"

# Output:
# ✅ T1: claude-haiku (profile data structures + UI)
# Cost estimate: $0.08

# You: implement, then log outcome
```

### End of task

```bash
/toolbox:outcome d-20260902-123
# Was it successful? Rate 1–10
# Score: 9/10
# Reason: Haiku generated clean code, saved ~2 hours of manual work
```

### Weekly summary

```bash
/toolbox:trace d-20260902-123
# See full decision chain: why this tool, outcomes, score trends
```

### Monthly

```bash
/toolbox:audit
# Audit for stale tools, cost trends, regret patterns
# Example: "Haiku has been 8.2/10 for code gen → keep using it"
```

---

## 5. Cost Tracking (Before/After AI Toolbox)

### BEFORE (typical VSCode extension dev)

| Task | Tool | Cost | Time |
|---|---|---|---|
| STL parser design | Sonnet | $0.30 | 2 hours |
| Extension UI | Sonnet | $0.25 | 1.5 hours |
| Mesh validation algo | Sonnet | $0.25 | 1 hour |
| **Weekly total** | | **$0.80** | **4.5 hours** |

### AFTER (with AI Toolbox routing)

| Task | Tool (AI Toolbox pick) | Cost | Time |
|---|---|---|---|
| STL parser design | Python (local) | $0 | 2 hours |
| Extension UI | Haiku | $0.08 | 1 hour |
| Mesh validation algo | Haiku | $0.08 | 1 hour |
| Printer integration | Sonnet | $0.20 | 1.5 hours |
| **Weekly total** | | **$0.36** | **5.5 hours** |

**Savings:** ~55% cost reduction, slightly faster (AI helps ideation)

---

## 6. Example: Your First Task

### Task: "Add support for Bambu Lab X1 printer"

```bash
/toolbox:route --profile kuziSlicer-dev "Add Bambu Lab X1 support: detect bed size (256x256), nozzle (0.4-0.6mm), max temp (280C), populate slicer defaults"
```

**Output:**
```
✅ Level: L2 (integration work, API binding)
✅ Tier: T2 (Claude-Sonnet)
✅ Type: code
✅ Tools: claude-sonnet + VSCode extension API
✅ Reason: Integration needs careful API handling; Haiku may miss edge cases

Cost estimate: $0.20
Time estimate: 1–1.5 hours
```

**You:**
```bash
# Follow Sonnet's code
# Implement + test

# Then log outcome
/toolbox:outcome d-20260902-200
# Was printer detection working? 10/10 — Sonnet nailed the API binding
```

---

## 7. kuziSlicer-Specific Tips

### ✅ DO use AI Toolbox for:
- **Algorithm design** (layer height, infill patterns, support generation)
- **UI/UX code** (settings dialogs, previews, error handling)
- **Printer integration** (APIs, firmware quirks)
- **Documentation** (technical guides, user manuals)
- **Optimization** (profiling, performance tuning)

### ❌ DON'T use AI Toolbox for:
- **STL file parsing** (pure math; use Python/numpy locally, $0)
- **Mesh geometry** (deterministic algorithm; local tools, $0)
- **Build system** (one-time setup; standard Webpack/Vite)

### 🎯 BALANCE:
Let AI Toolbox pick the tool, but YOU stay in control of the decision.
If a Haiku suggestion doesn't feel right, escalate to Sonnet.

---

## 8. Success Metrics for kuziSlicer

Track these to measure AI Toolbox value:

| Metric | Goal | How to measure |
|---|---|---|
| **Code velocity** | 20% faster feature delivery | Days per feature (before vs. after) |
| **Cost reduction** | 40% lower API spend | LiteLLM logs before/after AI Toolbox |
| **Quality** | 90%+ of generated code needs < 10% edits | Your code review notes |
| **Tool consistency** | Same task type always routes to same tier | `/toolbox:trace` comparisons |

---

## Next: Your First Week

**Day 1:** Install plugin, set up kuziSlicer profile  
**Day 2–3:** Route 3 small tasks (STL parser, UI, basic feature)  
**Day 4–5:** Route 1 medium task (printer integration or algorithm)  
**Week 2:** Review costs, tweak profile weights if needed  
**Week 3:** Audit and plan optimization  

---

## Questions?

- **How do I install locally?** → See `docs/customer-guide.md`
- **How does the routing work?** → See `docs/rules.md`
- **Can I use my own tools?** → Yes, add them to `catalog-example/ledger/tools.jsonl`
- **What if I disagree with a routing?** → `/toolbox:trace` shows why, then adjust profile weights

---

**Ready to build kuziSlicer with AI Toolbox?** 🚀

Next: `/toolbox:route "Design STL parser strategy for kuziSlicer"`
