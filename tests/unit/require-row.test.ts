import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { assertNoQueryError } from "../../src/lib/supabase/require-row";

describe("assertNoQueryError", () => {
  it("returns silently when there is no error", () => {
    expect(() => assertNoQueryError("persons/[id]", null)).not.toThrow();
  });

  it("throws with the context and message when there is an error", () => {
    const error = { message: "column does not exist" } as PostgrestError;
    expect(() => assertNoQueryError("persons/[id]", error)).toThrow(
      "persons/[id]: column does not exist",
    );
  });
});
