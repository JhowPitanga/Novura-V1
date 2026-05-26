-- ANN-CLEAN-02: Drop legacy unified view after all consumers migrated to marketplace_listings.
-- PRD §8 Fase 4 — Cleanup.
--
-- PREREQUISITE: ANN-CLEAN-01 must pass (zero active consumers in src/).
-- Run: supabase db push  OR  apply via Supabase SQL editor after confirming ANN-FLAG-02 complete.
--
-- This migration is SAFE to apply idempotently: uses DROP VIEW IF EXISTS.

DROP VIEW IF EXISTS marketplace_items_unified CASCADE;
