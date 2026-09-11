import { describe, expect, it } from "vitest";
import { FollowState } from "../src/public/follow-state.js";

describe("browser follow mode", () => {
  it("stops following after manual navigation and resumes explicitly", () => {
    const follow = new FollowState();

    expect(follow.updateActive(["cue-2", "cue-3"])).toBe("cue-2");
    follow.suspend();
    expect(follow.updateActive(["cue-4"])).toBeNull();
    expect(follow.isFollowing).toBe(false);
    expect(follow.resume(["cue-4"])).toBe("cue-4");
    expect(follow.isFollowing).toBe(true);
  });
});
