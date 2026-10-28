import { describe, expect, it } from "vitest";
import { REMINDER_PRIORITY } from "@loop/domain";
import { REMINDER_TEMPLATES, renderReminder } from "../templates.js";

const vars = { firstName: "Pat", endDate: "2026-11-10", confirmUrl: null, signInUrl: "https://loop.test/my-loop/availability" };

describe("reminder templates", () => {
  it("has a versioned template for every reminder type", () => {
    for (const type of REMINDER_PRIORITY) {
      const t = REMINDER_TEMPLATES[type];
      expect(t.key).toMatch(/^reminder\./);
      expect(t.version).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(REMINDER_PRIORITY.map((t) => REMINDER_TEMPLATES[t].key)).size).toBe(REMINDER_PRIORITY.length);
  });

  it("escapes merge fields in HTML and leaves the text part literal", () => {
    const r = renderReminder("AVAILABLE_NOW_CHECK", { ...vars, firstName: `<script>alert("x")</script>` });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.text).toContain("<script>");
  });

  it("cannot be used to inject headers through the subject", () => {
    const r = renderReminder("CONTRACT_END_PROMPT", { ...vars, endDate: "2026-11-10\r\nBcc: evil@example.com" });
    expect(r.subject).not.toMatch(/[\r\n]/);
  });

  it("escapes the link target and shows the confirm-only note when a one-touch link is present", () => {
    const r = renderReminder("AVAILABLE_NOW_CHECK", { ...vars, confirmUrl: 'https://loop.test/confirm?t=a"b&c' });
    expect(r.html).toContain('href="https://loop.test/confirm?t=a&quot;b&amp;c"');
    expect(r.text).toContain("only confirms");
    expect(r.html).toContain(vars.signInUrl);
  });

  it("falls back to a neutral greeting when there is no first name, and to sign-in when there is no link", () => {
    const r = renderReminder("PROFILE_REVIEW", { ...vars, firstName: null });
    expect(r.text).toContain("Hi there");
    expect(r.text).toContain(vars.signInUrl);
    expect(r.templateKey).toBe("reminder.profile-review");
    expect(r.templateVersion).toBe(1);
  });
});
