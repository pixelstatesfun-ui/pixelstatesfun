const encodedSiteKey = process.env.TURNSTILE_SITE_KEY_ENCODED;
const xorKey = process.env.TURNSTILE_SITE_KEY_XOR_KEY;

export default function getTurnstileSiteKey() {
  if (!encodedSiteKey?.length || !xorKey?.length) {
    return '';
  }
  return String.fromCharCode(
    ...encodedSiteKey.map(
      (byte, index) => byte ^ xorKey[index % xorKey.length],
    ),
  );
}
