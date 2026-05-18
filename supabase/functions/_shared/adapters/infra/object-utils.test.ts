/**
 * Unit tests for infra/object-utils. Run with: deno test -A object-utils.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getField, getStr, getNum, getArr } from "./object-utils.ts";

Deno.test("getField: returns value when key exists", () => {
  assertEquals(getField({ a: 1 }, "a"), 1);
  assertEquals(getField({ nested: { x: "y" } }, "nested"), { x: "y" });
});

Deno.test("getField: returns undefined for null, non-object, or missing key", () => {
  assertEquals(getField(null, "a"), undefined);
  assertEquals(getField(42, "a"), undefined);
  assertEquals(getField("str", "a"), undefined);
  assertEquals(getField({}, "missing"), undefined);
  assertEquals(getField({ a: 1 }, "b"), undefined);
});

Deno.test("getStr: returns string value for string path", () => {
  assertEquals(getStr({ a: " hello " }, ["a"]), " hello ");
  assertEquals(getStr({ x: { y: "nested" } }, ["x", "y"]), "nested");
});

Deno.test("getStr: returns string for finite number", () => {
  assertEquals(getStr({ n: 42 }, ["n"]), "42");
  assertEquals(getStr({ n: 0 }, ["n"]), "0");
});

Deno.test("getStr: returns null for empty string, non-string, or missing path", () => {
  assertEquals(getStr({ a: "" }, ["a"]), null);
  assertEquals(getStr({ a: "   " }, ["a"]), null);
  assertEquals(getStr({ a: {} }, ["a"]), null);
  assertEquals(getStr({}, ["missing"]), null);
  assertEquals(getStr({ a: { b: null } }, ["a", "b"]), null);
});

Deno.test("getNum: returns number for number path", () => {
  assertEquals(getNum({ n: 100 }, ["n"]), 100);
  assertEquals(getNum({ a: { b: -5.5 } }, ["a", "b"]), -5.5);
});

Deno.test("getNum: parses numeric strings", () => {
  assertEquals(getNum({ s: "42" }, ["s"]), 42);
  assertEquals(getNum({ s: "3.14" }, ["s"]), 3.14);
});

Deno.test("getNum: returns null for non-numeric or missing", () => {
  assertEquals(getNum({ a: "abc" }, ["a"]), null);
  assertEquals(getNum({ a: NaN }, ["a"]), null);
  assertEquals(getNum({ a: Infinity }, ["a"]), null);
  assertEquals(getNum({}, ["x"]), null);
});

Deno.test("getArr: returns array when path is array", () => {
  assertEquals(getArr({ items: [1, 2, 3] }, ["items"]), [1, 2, 3]);
  assertEquals(getArr({ data: { list: [] } }, ["data", "list"]), []);
});

Deno.test("getArr: returns null for non-array or missing", () => {
  assertEquals(getArr({ a: {} }, ["a"]), null);
  assertEquals(getArr({ a: "not array" }, ["a"]), null);
  assertEquals(getArr({}, ["missing"]), null);
});
