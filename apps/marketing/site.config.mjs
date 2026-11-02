export const siteUrl = new URL(
  process.env.SITE_URL ?? "https://send-thing.lukestephens.co.za",
).origin;

// Public ownership proof, served at /<key>.txt as required by IndexNow.
export const indexNowKey = "e7f5cd38799f4d7fcfc91a8a616cff30";
