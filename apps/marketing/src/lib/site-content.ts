export const title = "Send Thing — Share files between your devices";
export const description =
  "Share files, photos, videos and links between macOS, Windows, Linux and Android devices. Host your group chat on your computer over LAN or Tailscale.";

export const questions = [
  {
    question: "Which devices can I use?",
    answer:
      "Download Send Thing for macOS, Windows, Linux and Android. macOS and Linux builds support 64-bit Intel/AMD and ARM computers. An iOS download is not available yet.",
  },
  {
    question: "Where are my files stored?",
    answer:
      "Your chosen host computer stores the group’s messages and files. Send Thing does not use a cloud relay. The host must stay awake and reachable to send or fetch things.",
  },
  {
    question: "Can I send files when I’m away from home?",
    answer:
      "Yes. Install and configure Tailscale on your devices to reach your host from another network. On a shared local network, Send Thing can rediscover a paired host when its IP address changes.",
  },
  {
    question: "Is the connection encrypted?",
    answer:
      "Plain HTTP connections on your LAN are not encrypted, so use them only on a trusted network. Tailscale encrypts traffic between connected devices. A self-hosted server can also use HTTPS with a certificate your devices trust.",
  },
];
