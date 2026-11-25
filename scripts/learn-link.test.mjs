import assert from "node:assert/strict";
import { buildLearnUrl, parseLearnParams } from "../lib/learn-link.ts";

const chatId = "11111111-2222-4333-8444-555555555555";
const parse = (url) =>
  parseLearnParams(new URL(url, "http://localhost").searchParams);

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok -", name);
}

test("round trips all learn parameters", () => {
  const parsed = parse(
    buildLearnUrl({
      chatId,
      moduleName: "Module 1",
      pageStart: 3,
      pageEnd: 7,
      topic: "Normalization",
      taskId: "task-1",
    })
  );
  assert.deepEqual(parsed, {
    chatId,
    moduleName: "Module 1",
    pageStart: 3,
    pageEnd: 7,
    topic: "Normalization",
    taskId: "task-1",
  });
});

test("round trips a null task id", () => {
  const parsed = parse(
    buildLearnUrl({
      chatId,
      moduleName: "Module 1",
      pageStart: 3,
      pageEnd: 7,
      topic: "Normalization",
      taskId: null,
    })
  );
  assert.equal(parsed?.taskId, null);
});

test("round trips null page bounds", () => {
  const parsed = parse(
    buildLearnUrl({
      chatId,
      moduleName: "Module 1",
      pageStart: null,
      pageEnd: null,
      topic: null,
      taskId: null,
    })
  );
  assert.equal(parsed?.pageStart, null);
  assert.equal(parsed?.pageEnd, null);
});

test("rejects a chat id that is not a UUID", () => {
  assert.equal(
    parse(
      buildLearnUrl({
        chatId: "not-a-uuid",
        moduleName: "Module 1",
        pageStart: null,
        pageEnd: null,
        topic: null,
        taskId: null,
      })
    ),
    null
  );
});

test("rejects a URL with only one page bound", () => {
  assert.equal(
    parse(`/?learn=${chatId}&module=Module%201&from=3&to=`),
    null
  );
});

test("rejects a reversed page range", () => {
  assert.equal(
    parse(`/?learn=${chatId}&module=Module%201&from=9&to=2`),
    null
  );
});

test("rejects a URL without a module", () => {
  assert.equal(parse(`/?learn=${chatId}`), null);
});

console.log(`\n${passed} tests passed`);
