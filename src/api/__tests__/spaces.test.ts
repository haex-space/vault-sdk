import { describe, it, expect } from "vitest";
import { SpacesAPI } from "../spaces";
import { SPACE_COMMANDS } from "~/commands";
import type { HaexVaultSdk } from "~/client";

function makeSpacesApi(returnValue: unknown) {
  const calls: Array<{ command: string; args: unknown }> = [];
  const fakeClient = {
    request: async (command: string, args: unknown) => { calls.push({ command, args }); return returnValue; },
  } as unknown as HaexVaultSdk;
  return { spaces: new SpacesAPI(fakeClient), calls };
}

describe("SpacesAPI.getMembersAsync", () => {
  it("calls extension_space_get_members with the spaceId", async () => {
    const members = [{ did: "did:key:zA", label: "Anna", isSelf: false }];
    const { spaces, calls } = makeSpacesApi(members);
    const result = await spaces.getMembersAsync("space-1");
    expect(calls[0]).toEqual({ command: SPACE_COMMANDS.getMembers, args: { spaceId: "space-1" } });
    expect(result).toEqual(members);
  });
});
