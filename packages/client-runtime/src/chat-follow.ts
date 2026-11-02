// Follow is user intent, not merely whether the last layout was at the bottom.
// Growing images, new rows and the keyboard can change that geometry while the
// user is still expecting the conversation to stay pinned to its latest message.
export function createChatFollow() {
  let following = true;
  return {
    get active() {
      return following;
    },
    resume() {
      following = true;
    },
    pause() {
      following = false;
    },
    onScroll(
      offset: number,
      content: number,
      viewport: number,
      userInitiated = false,
    ) {
      const atBottom = content - viewport - offset <= 2;
      if (userInitiated || atBottom) following = atBottom;
    },
  };
}
