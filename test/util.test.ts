import { uuidv4 } from "../src/util";
import { describe, expect, test } from "@jest/globals";

describe("uuidv4 function", () => {
  test("should generate a valid UUID v4", () => {
    const uuid = uuidv4();
    expect(uuid).toBeDefined();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
