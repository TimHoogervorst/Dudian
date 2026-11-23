# 12: Calibrate story length to actual reading pace

**What to build:** Use completed chapters to size future short and long stories for the learner’s actual pace.

**Blocked by:** 07 Generate a first story within a vocabulary budget, 11 See the reading week at a glance

**Status:** ready-for-agent

**Implementation seam:** The duration estimate uses active time and completed text length. The planner accepts its length target independently of the difficulty budget.

- [ ] Start with provisional estimates for 10 and 30 minutes. After several completed chapters, use observed active reading time including definition checks.
- [ ] Verify idle periods do not inflate the estimate and sparse history retains a usable provisional target.
- [ ] Using fixed sample histories, verify slower reading yields a shorter text target for the same duration. Changing duration at fixed difficulty preserves the new-character ceiling.
