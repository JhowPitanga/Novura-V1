import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createProductLinkState,
  FULLY_LINKED,
} from "../ProductLinkState.ts";

Deno.test("isFullyLinked is true when unlinkedCount is 0", () => {
  const state = createProductLinkState(0);
  assertEquals(state.isFullyLinked, true);
});

Deno.test("isFullyLinked is false when unlinkedCount is greater than 0", () => {
  const state = createProductLinkState(3);
  assertEquals(state.isFullyLinked, false);
});

Deno.test("createProductLinkState throws for negative count", () => {
  assertThrows(() => createProductLinkState(-1));
});

Deno.test("FULLY_LINKED is a shortcut for fully linked state", () => {
  assertEquals(FULLY_LINKED.unlinkedCount, 0);
  assertEquals(FULLY_LINKED.isFullyLinked, true);
});
