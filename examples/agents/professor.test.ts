import { describe, it } from "vitest";
import { systemMessage } from "./professor.ts";

describe("professor", () => {
  it("should run professor tool", async () => {
    console.log(await systemMessage());
  });
});
