# kuziSlicer + AI Toolbox — Tutorial: Your First 5 Tasks

**Goal:** Learn routing by doing real kuziSlicer tasks  
**Time:** ~30 minutes  
**Outcome:** Understand how AI Toolbox picks the best tool, cost savings, and how to log results

---

## Setup (2 min)

```bash
# 1. Install AI Toolbox plugin
/plugin install amitkuzi/ai-toolbox

# 2. Create your kuziSlicer profile (or copy from DEPLOYMENT-GUIDE.md)
# Save to: ~/.claude/projects/kuziSlicer/profiles/kuziSlicer.yaml

# 3. Verify install
/toolbox:route --profile kuziSlicer-dev "Test task"
# Should respond with a routing decision
```

---

## Task 1: STL Parser Foundation (T0 — FREE)

### The Ask
"I need a Python function to parse STL files (ASCII + binary), extract triangles, and count them. Should handle 10MB+ files efficiently."

### Do This
```bash
/toolbox:route --profile kuziSlicer-dev "Parse STL files (ASCII + binary), extract triangles, count them. Handle 10MB+ efficiently."
```

### Expected Response
```
✅ Level: L1 (deterministic parsing task)
✅ Tier: T0 (local computation, no LLM needed)
✅ Type: script
✅ Tool: python3 with numpy or numpy-based mesh parser
✅ Reason: Pure math/deterministic algorithm; all local

Suggestion: Use numpy-stl or trimesh library locally
Cost estimate: $0
Time: 30–60 min (you implement)
```

### What This Means
- **T0 = Free** — Don't use an LLM, write the Python yourself
- AI Toolbox identified this as deterministic work (no reasoning needed)
- **Result: Save $0.20–0.30 if you'd asked Claude**

### After You Implement
```bash
# Log the outcome
/toolbox:outcome d-20260902-001

# Questions:
# - Did it work? Y/N
# - Rate 1–10: 8/10 (parsed 100MB STL in 2 sec)
# - Time spent: 45 min
# - Notes: numpy-stl library worked great, didn't need ML assist

# AI Toolbox learns: STL parsing is best done locally, no LLM needed
```

---

## Task 2: VSCode Webview Settings UI (T1 — ~$0.10)

### The Ask
"Create a VSCode webview UI showing slicer settings. Inputs: material (dropdown: PLA/ABS/PETG), nozzle temp (input), bed temp (input), layer height (slider). Save settings to kuziSlicer config."

### Do This
```bash
/toolbox:route --profile kuziSlicer-dev "Create VSCode webview UI for slicer settings: material dropdown (PLA/ABS/PETG), nozzle/bed temp inputs, layer height slider. Save to config."
```

### Expected Response
```
✅ Level: L2 (multi-part: UI layout + data binding + persistence)
✅ Tier: T1 (Claude-Haiku is great for VSCode extension boilerplate)
✅ Type: code
✅ Tool: claude-haiku + VSCode Webview API
✅ Reason: Code generation for standard UI patterns; Haiku sufficient

Cost estimate: $0.08–0.12
Time: 1–1.5 hours (Haiku writes code, you integrate)
```

### What This Means
- **T1 = Cheap** ($0.08 vs. $0.25 if you used Sonnet)
- Haiku is very good at VSCode extension boilerplate
- **Result: 50% cheaper than asking Sonnet**

### Run Haiku
```bash
# Claude Code prompt:
/toolbox:route --profile kuziSlicer-dev "..."
# [Follow Haiku's code]
# [You integrate into your extension]

# Test locally in VSCode extension
```

### After Integration
```bash
/toolbox:outcome d-20260902-002

# Questions:
# - Did the UI render correctly? Y/N
# - Settings saved to config? Y/N
# - Rate 1–10: 9/10 (Haiku code was clean, minimal edits needed)
# - Time spent: 1.2 hours

# AI Toolbox learns: Haiku is reliable for VSCode UI code
```

---

## Task 3: Adaptive Layer Height Algorithm (T1 — ~$0.10)

### The Ask
"Design an adaptive layer height algorithm: thinner layers (0.1mm) for detailed features (detected by high mesh curvature), thicker layers (0.3mm) for flat areas. Improves print quality + speed."

### Do This
```bash
/toolbox:route --profile kuziSlicer-dev "Design adaptive layer height algorithm: thin layers (0.1mm) for detailed areas (high mesh curvature), thick layers (0.3mm) for flat areas. Balance quality + speed."
```

### Expected Response
```
✅ Level: L2 (algorithm design with heuristics)
✅ Tier: T1 (Claude-Haiku for algorithm outline + logic)
✅ Type: code or model (I'd suggest code for this)
✅ Tool: claude-haiku (algorithm ideas) + python (implementation)
✅ Reason: Needs intelligent suggestions (heuristics) but implementation is standard Python

Cost estimate: $0.10–0.15
Time: 2 hours (Haiku designs, you implement)
```

### What This Means
- Haiku can outline algorithms efficiently
- You implement the Python based on its suggestions
- **Result: Algorithm brainstorming + implementation in 2 hours vs. 4 alone**

### Follow Haiku's Outline
```python
# Example (Haiku might suggest):

def adaptive_layer_height(mesh, min_height=0.1, max_height=0.3):
    """
    Adjust layer height based on mesh curvature:
    - High curvature (detail areas): thin layers
    - Low curvature (flat areas): thick layers
    """
    heights = []
    for z in mesh.z_range:
        slice_mesh = mesh.slice_at_z(z)
        curvature = calculate_curvature(slice_mesh)
        height = min_height + (max_height - min_height) * (1 - curvature)
        heights.append(height)
    return heights
```

### Log Outcome
```bash
/toolbox:outcome d-20260902-003

# - Algorithm working? Y/N
# - Tested on test models? Y/N
# - Rate 1–10: 8/10 (algorithm is good, needs fine-tuning)
# - Time: 2 hours
```

---

## Task 4: Bambu Lab X1 Printer Integration (T2 — ~$0.25)

### The Ask
"Add Bambu Lab X1 support. Query printer API for bed size (256×256), max nozzle temp (300°C), available nozzles (0.4/0.6/0.8mm). Auto-populate slicer defaults based on detected nozzle."

### Do This
```bash
/toolbox:route --profile kuziSlicer-dev "Add Bambu Lab X1 printer support. Query API for bed size (256x256), max temp (300C), nozzles (0.4/0.6/0.8mm). Auto-populate slicer defaults by detected nozzle."
```

### Expected Response
```
✅ Level: L2 (API integration, data mapping)
✅ Tier: T2 (Claude-Sonnet — integration needs careful API handling)
✅ Type: code
✅ Tool: claude-sonnet + VSCode extension API
✅ Reason: API quirks + edge cases; Haiku might miss details. Sonnet safer.

Cost estimate: $0.20–0.30
Time: 1.5–2 hours
```

### What This Means
- **T2 = Balanced** ($0.25 vs. $0.08 for Haiku)
- This is more complex than simple boilerplate
- Sonnet catches API edge cases better
- **Result: Worth the extra $0.17 to avoid bugs**

### Follow Sonnet's Code
```bash
# Sonnet generates Bambu Lab API integration
# You test against real printer or API docs
```

### Log Outcome
```bash
/toolbox:outcome d-20260902-004

# - Printer detected correctly? Y/N
# - Settings populated accurately? Y/N
# - Rate 1–10: 9/10 (Sonnet code handled edge cases well)
# - Time: 1.8 hours
```

---

## Task 5: Performance Tuning (T2 — ~$0.30)

### The Ask
"STL parsing is slow on 100MB+ files. Profile the code, identify bottlenecks (I/O, numpy ops, geometry calcs). Suggest optimization strategy without losing accuracy."

### Do This
```bash
/toolbox:route --profile kuziSlicer-dev "Profile STL parsing for 100MB+ files. Find bottlenecks (I/O, numpy, geometry). Suggest optimizations without losing accuracy."
```

### Expected Response
```
✅ Level: L2–L3 (complex analysis + optimization)
✅ Tier: T2 (Claude-Sonnet for performance analysis)
✅ Type: model
✅ Tool: claude-sonnet (analyze your code, suggest optimizations)
✅ Reason: Needs expert performance reasoning. Haiku may miss tradeoffs.

Cost estimate: $0.25–0.35
Time: 2–3 hours (Sonnet analyzes, you implement optimizations)
```

### What This Means
- **T2 is right here** — this needs expert judgment about tradeoffs
- Sonnet better understands numpy performance characteristics
- Could save hours of trial-and-error profiling

### Follow Sonnet's Analysis
```
Sonnet might suggest:
1. Use binary STL parser, not ASCII (10× faster)
2. Lazy-load geometry (don't parse all triangles upfront)
3. Cache curvature calculations
4. Use numpy's C-level operations instead of Python loops
```

### Implement & Benchmark
```bash
# Implement Sonnet's suggestions
# Benchmark: 100MB STL parsing time before/after

# Example:
# Before: 45 seconds
# After: 3 seconds (15× faster!)
```

### Log Outcome
```bash
/toolbox:outcome d-20260902-005

# - Parse speed improved? Y/N
# - 100MB file now: 3 seconds
# - Accuracy maintained? Y/N
# - Rate 1–10: 10/10 (Sonnet suggestions were all spot-on)
# - Time: 2.5 hours
```

---

## Summary: Your First Week

### Tasks Completed
| # | Task | Tool | Cost | Time | Rating |
|---|---|---|---|---|---|
| 1 | STL parser | T0 (local) | $0.00 | 45m | 8/10 |
| 2 | Settings UI | T1 (Haiku) | $0.10 | 1.2h | 9/10 |
| 3 | Layer algorithm | T1 (Haiku) | $0.10 | 2.0h | 8/10 |
| 4 | Printer API | T2 (Sonnet) | $0.25 | 1.8h | 9/10 |
| 5 | Performance | T2 (Sonnet) | $0.30 | 2.5h | 10/10 |
| | **TOTAL** | | **$0.75** | **8.5h** | **8.8/10** |

### What You Learned

✅ **T0 = No LLM needed** (pure math/algorithms) — FREE  
✅ **T1 = Haiku** (code boilerplate, UI, basic logic) — $0.08–0.12  
✅ **T2 = Sonnet** (complex logic, API integration, optimization) — $0.20–0.30  

✅ **AI Toolbox routing** picks the right tool for the job  
✅ **You save 40%+ on API costs** by not over-using expensive models  
✅ **Code quality improves** (Sonnet catches edge cases)  
✅ **Time is better** (less trial-and-error, more building)  

---

## Next Steps

### Week 2
- Route 2–3 more kuziSlicer features
- Adjust profile weights if you disagree with routing choices
- Track cost savings in spreadsheet

### Monthly
```bash
/toolbox:audit
# See trends: which tools worked best, regrets, stale tools
```

### Continuous
```bash
# For every task
/toolbox:route --profile kuziSlicer-dev "Your task here"
# [Implement based on routing]
/toolbox:outcome <decision-id>
# [Log success/rating]

# AI Toolbox learns your patterns and improves routing
```

---

## Pro Tips

1. **Trust the routing** — It's based on rules refined by 100+ AI decisions
2. **Challenge when it feels wrong** — If Haiku is suggested but you want Sonnet, use it. Then log why.
3. **Profile weights** — If certain task types always need T2 but AI Toolbox routes T1, adjust weights
4. **Batch tasks** — Group small tasks together for efficiency
5. **Log everything** — Outcomes feed back into routing improvement

---

## You're Ready! 🚀

**Next command:**
```bash
/toolbox:route --profile kuziSlicer-dev "Implement STL binary parser in Python with numpy"
```

Then report back after each task with `/toolbox:outcome`. AI Toolbox learns from your usage.

**Happy slicing!** 🖨️

---

See `DEPLOYMENT-GUIDE.md` for deeper docs, `docs/customer-guide.md` for AI Toolbox basics.
