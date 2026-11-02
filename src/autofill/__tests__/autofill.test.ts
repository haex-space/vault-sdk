import { describe, expect, it } from "vitest";
import { fieldIdentifier, fieldKind, initAutofill, isOtpField, mapFields, showsIcon } from "..";

describe("the browser entry of haex-autofill", () => {
  it("refuses to run before the module is loaded", () => {
    expect(() => fieldKind({ inputType: "password" })).toThrow(/initAutofill/);
  });

  it("maps a login form to the entry's username and password", async () => {
    await initAutofill();
    const targets = mapFields(
      [
        { inputType: "email", name: "email" },
        { inputType: "password", name: "pwd" },
        { inputType: "text", name: "comment" },
      ],
      { keys: ["username", "password"] },
    );
    expect(targets).toEqual([{ kind: "key", key: "username" }, { kind: "key", key: "password" }, null]);
  });

  it("maps card fields by their autocomplete token and a code field to the one-time code", async () => {
    await initAutofill();
    const targets = mapFields(
      [
        { name: "pan", autocomplete: "cc-number" },
        { name: "code", autocomplete: "one-time-code" },
      ],
      { keys: ["Kartennummer", "otp"], hasTotp: true },
    );
    expect(targets).toEqual([{ kind: "key", key: "Kartennummer" }, { kind: "otp" }]);
  });

  it("answers the field questions of the extension", async () => {
    await initAutofill();
    expect(fieldKind({ inputType: "password" })).toBe("password");
    expect(fieldIdentifier({ name: "user[otp_attempt]" })).not.toBe("");
    expect(isOtpField({ name: "totp" })).toBe(true);
    expect(isOtpField({ name: "zahlencode" }, { otp: ["zahlencode"] })).toBe(true);
    expect(showsIcon({ inputType: "password", name: "password" }, [{ keys: ["password"] }])).toBe(true);
    expect(showsIcon({ inputType: "text", name: "comment" }, [{ keys: ["password"] }])).toBe(false);
  });

  it("loads the module once", async () => {
    expect(initAutofill()).toBe(initAutofill());
    await initAutofill();
  });
});
