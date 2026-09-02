# kuziSlicer + AI Toolbox — Quick Reference Card

## 30-Second Setup
```bash
/plugin marketplace add amitkuzi/ai-toolbox
/plugin install ai-toolbox@ai-toolbox
# Copy DEPLOYMENT-GUIDE.md kuziSlicer.yaml to ~/.claude/projects/kuziSlicer/profiles/
/toolbox:route --profile kuziSlicer-dev "Your first task"
```

## Task Routing Cheat Sheet

| Task Type | Expected Tier | Cost | Example |
|-----------|---------------|------|---------|
| **STL parsing, geometry math** | T0 | $0 | Parse triangles, detect non-manifold, wall thickness |
| **Slicing algorithms, layer height** | T0–T1 | $0–$0.10 | Adaptive layers, infill patterns, support gen |
| **Simple code (UI, settings, basic features)** | T1 | $0.08–0.15 | Webview UI, config dialog, export formats |
| **Complex code (API integration, optimization)** | T2 | $0.20–0.40 | Printer API, performance tuning, translation |
| **Novel algorithms, edge cases** | T2–T3 | $0.30–1.00 | Rare; try T2 first |

## Common Commands

```bash
# Route a task
/toolbox:route --profile kuziSlicer-dev "Your task description"

# See why it was routed that way
/toolbox:trace d-20260902-123

# Log the outcome after you're done
/toolbox:outcome d-20260902-123
# (rate 1–10, add notes)

# Weekly check
/toolbox:audit

# Run curator manually (discover new tools)
/toolbox:curate daily
```

## Typical Week Timeline

**Monday:** Route 2–3 tasks (mix of T0/T1)  
**Tuesday–Wednesday:** Implement, test, log outcomes  
**Thursday:** Route 1 complex task (T2 if needed)  
**Friday:** Audit, review costs, adjust weights if needed  

**Weekly cost:** ~$0.50–$1.00 (vs. $2–3 without AI Toolbox)

## Profile Tuning

**If Haiku suggested but you think Sonnet:**
- Use Sonnet anyway
- Log outcome with note: "Haiku insufficient, needed Sonnet"
- Later: increase `agent_ready` weight to push future complex tasks to T2

**If T1 routed but seems simple (should be T0):**
- Go local (don't use Claude)
- Log outcome: "Was local-only, wasted potential"
- Increase `local` weight in profile

## Cost Tracking

**Before AI Toolbox:** ~$80–100/month (all Sonnet)  
**After AI Toolbox:** ~$30–50/month (mix of T0/T1/T2)  
**Savings:** 50–60%  

Track in spreadsheet:
```
| Date | Task | Tool | Cost | Time | Rating |
|------|------|------|------|------|--------|
| 9/2  | STL parser | T0 | $0 | 45m | 8/10 |
| 9/2  | UI | T1 | $0.10 | 1.2h | 9/10 |
```

## If Something Goes Wrong

**Task routed wrong?**
→ Use the right tool anyway, log outcome with note

**Tool didn't work?**
→ `/toolbox:outcome` with low rating (1–3/10)

**Need to escalate?**
→ `/toolbox:route` with next task; AI Toolbox learns

## Success Checklist

- [ ] Plugin installed (`/plugin marketplace add amitkuzi/ai-toolbox` then `/plugin install ai-toolbox@ai-toolbox`)
- [ ] kuziSlicer profile in place (`~/.claude/projects/kuziSlicer/profiles/kuziSlicer.yaml`)
- [ ] First task routed (`/toolbox:route`)
- [ ] Outcome logged (`/toolbox:outcome`)
- [ ] Weekly audit run (`/toolbox:audit`)
- [ ] Cost tracked in spreadsheet

## Resources

- **Full setup:** `DEPLOYMENT-GUIDE.md`
- **Step-by-step tutorial:** `TUTORIAL-FIRST-TASKS.md`
- **How routing works:** `ai-toolbox/docs/rules.md`
- **Customer guide:** `ai-toolbox/docs/customer-guide.md`

---

**You're ready. Pick your first task and `/toolbox:route` it.** 🚀
