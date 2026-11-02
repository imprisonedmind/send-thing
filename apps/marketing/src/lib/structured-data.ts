import { REPOSITORY_URL, RELEASES_URL } from "./downloads.ts";
import { questions } from "./site-content.ts";

export function structuredData(
  url: URL,
  title: string,
  description: string,
  image: URL,
) {
  const root = new URL("/", url).href;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${root}#website`,
        url: root,
        name: "Send Thing",
        inLanguage: "en",
      },
      {
        "@type": "WebPage",
        "@id": `${url.href}#webpage`,
        url: url.href,
        name: title,
        description,
        inLanguage: "en",
        isPartOf: { "@id": `${root}#website` },
        mainEntity: { "@id": `${root}#application` },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: image.href,
          width: 1200,
          height: 630,
        },
        hasPart: { "@id": `${root}#questions` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${root}#application`,
        name: "Send Thing",
        url: root,
        description,
        image: image.href,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: ["macOS", "Windows", "Linux", "Android"],
        downloadUrl: RELEASES_URL,
        sameAs: REPOSITORY_URL,
        featureList: [
          "Group chats for your devices",
          "Share files, photos, videos and links",
          "Host messages and files on your computer",
          "LAN discovery and Tailscale connectivity",
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${root}#questions`,
        mainEntity: questions.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  };
}

export function serializeStructuredData(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
