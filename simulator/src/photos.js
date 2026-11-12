// Real photos of cattle in Sri Lanka from Wikimedia Commons (Category:Cattle_in_Sri_Lanka),
// hand-picked so each one clearly shows cattle. Credits and licences are fetched live from
// Commons and stored with each photo, as the CC licences require attribution.
const PAGE_IDS = [
  20718298, // Domestic cattle breed - Sri Lanka
  24244251, // Calf head - Batticaloa
  31321112, // Ayrshire cows
  43846725, // Sri Lanka Photo031
  79743114, // Cows in a farm
  83623299, // Peradeniya Botanical Gardens, Bull
  83623300, // Peradeniya Botanical Gardens, White Bull
  89653323, // Bentota river along with cow and her calf
  90618882, // Sri Lankan Cattle
  90657602, // Cow feeding milk Sri Lanka
  90714096, // Way to Ella
  158052532, // Bopathalawa (CC0)
  32950116, // Cow in Cemetery, Trincomalee
  79644357, // Kala Wewa of Sri Lanka
];

// Wikimedia asks automated clients for a descriptive User-Agent.
const UA = "MooMapSimulator/1.0 (demo cattle photos for a test herd)";
const API = "https://commons.wikimedia.org/w/api.php";

const stripHtml = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function fetchPhotoSet(width = 480) {
  const url =
    `${API}?action=query&pageids=${PAGE_IDS.join("|")}&prop=imageinfo` +
    `&iiprop=url|extmetadata&iiurlwidth=${width}&format=json&origin=*`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wikimedia API ${res.status}`);
  const pages = (await res.json()).query.pages;
  return PAGE_IDS.map((id) => pages[id])
    .filter((p) => p && p.imageinfo && p.imageinfo[0] && p.imageinfo[0].thumburl)
    .map((p) => {
      const info = p.imageinfo[0];
      const meta = info.extmetadata || {};
      const artist = stripHtml(meta.Artist && meta.Artist.value).slice(0, 80) || "Unknown";
      const licence = stripHtml(meta.LicenseShortName && meta.LicenseShortName.value) || "see source";
      return {
        pageId: p.pageid,
        title: p.title.replace(/^File:/, ""),
        url: info.thumburl,
        credit: `Photo: ${artist} · ${licence} · Wikimedia Commons`,
        sourceUrl: info.descriptionurl,
      };
    });
}

async function downloadAsDataUrl(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const type = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${type};base64,${buf.toString("base64")}`;
}

module.exports = { PAGE_IDS, fetchPhotoSet, downloadAsDataUrl };
