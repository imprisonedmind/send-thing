export function messageLinks(text: string): { text: string; url?: string }[] {
  return text.split(/(https?:\/\/[^\s<>]+)/gi).flatMap((part) => {
    if (!/^https?:\/\//i.test(part)) return [{ text: part }];
    let candidate = part.replace(/[.,!?:;"']+$/, "");
    for (const [open, close] of [
      ["(", ")"],
      ["[", "]"],
    ]) {
      while (
        candidate.endsWith(close!) &&
        candidate.split(close!).length > candidate.split(open!).length
      )
        candidate = candidate.slice(0, -1);
    }
    try {
      const url = new URL(candidate);
      if (!url.hostname || url.username || url.password)
        return [{ text: part }];
      return [
        { text: candidate, url: url.href },
        { text: part.slice(candidate.length) },
      ];
    } catch {
      return [{ text: part }];
    }
  });
}

export function firstLink(text: string): string | undefined {
  return messageLinks(text).find((part) => part.url)?.url;
}

// A resolved card represents its URL. Keep the caption and any other links intact.
export function visibleMessageLinks(text: string, previewUrl?: string) {
  return messageLinks(text).filter(
    (part) => !previewUrl || part.url !== previewUrl,
  );
}
