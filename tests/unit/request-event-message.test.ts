import { describe, expect, it } from "vitest";
import { buildRequestEventMessage } from "../../src/lib/notifications/request-event-message";
import enMessages from "../../messages/en.json";
import huMessages from "../../messages/hu.json";

describe("buildRequestEventMessage — reject note (B-41)", () => {
  it("quotes the owner's note in the tenant's rejection body", () => {
    for (const [locale, messages] of [
      ["en", enMessages],
      ["hu", huMessages],
    ] as const) {
      const { body } = buildRequestEventMessage({
        locale,
        messages,
        event: "rejected",
        title: "Leaking tap",
        forOwner: false,
        note: "  Already fixed last week.  ",
      });
      expect(body).toContain("Leaking tap");
      expect(body).toContain("Already fixed last week.");
    }
  });

  it("falls back to the plain body without a note", () => {
    for (const note of [undefined, null, "   "]) {
      const { body } = buildRequestEventMessage({
        locale: "en",
        messages: enMessages,
        event: "rejected",
        title: "Leaking tap",
        forOwner: false,
        note,
      });
      expect(body).toBe(enMessages.requests.notifyTenant_rejectedBody.replace("{title}", "Leaking tap"));
    }
  });

  it("ignores the note on other events", () => {
    const resolved = buildRequestEventMessage({
      locale: "en",
      messages: enMessages,
      event: "resolved",
      title: "T",
      forOwner: false,
      note: "secret",
    });
    expect(resolved.body).not.toContain("secret");
  });
});
