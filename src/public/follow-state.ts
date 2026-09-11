export class FollowState {
  private following = true;

  get isFollowing(): boolean {
    return this.following;
  }

  suspend(): void {
    this.following = false;
  }

  resume(activeCueIds: readonly string[]): string | null {
    this.following = true;
    return activeCueIds[0] ?? null;
  }

  updateActive(activeCueIds: readonly string[]): string | null {
    return this.following ? activeCueIds[0] ?? null : null;
  }
}
