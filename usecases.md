# Agent Use Cases & Test Scenarios

## 1. Family Plan Analysis
**Query:** "Find members suitable for a family plan promotion."
**Expected:** Should identify Michael (Primary) and Holly (Dependent).
**Status:** ✅ Verified 2026-02-07
**Agent Output:**
> "Members suitable for a family plan promotion include member `mem-016`, who has the `family-primary` tag, and member `mem-017`, who has the `family-dependent` tag [mem-016, mem-017]."
**Reasoning:** Correctly identified `family-primary` and `family-dependent` tags.

## 2. Medical Leave Handling
**Query:** "Who is currently on medical freeze?"
**Expected:** Should identify Creed Bratton.
**Status:** ✅ Verified 2026-02-07
**Agent Output:**
> "Member ID mem-018 is currently on medical leave and has a frozen status [mem-018]."
**Reasoning:** Correctly matched `frozen` and `medical-leave` tags.

## 3. Churn Analysis
**Query:** "Find recently relocated members."
**Expected:** Should identify Toby Flenderson (Costa Rica).
**Status:** ✅ Verified 2026-02-07
**Agent Output:**
> "One member, with ID mem-019, has been tagged as 'relocated' [mem-019]."
**Reasoning:** Correctly matched `relocated` tag.

## 4. Premium Location Analysis
**Query:** "How is the Executive Suites location performing?"
**Expected:** Should find GYM_110 (Executive Suites) and its "Luxury" segment.
**Status:** ✅ Verified 2026-02-07
**Agent Output:**
> "The Executive Suites location, identified as GYM_110, recently had its \"GRAND_OPENING\" on 2025-12-01... [GYM_110]."
**Reasoning:** Correctly identified the location by name and extracted the latest event.
