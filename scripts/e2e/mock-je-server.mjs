// Minimal mock of the JE mobile API for e2e runs in environments where
// www.jamesedition.com is unreachable. Serves realistic payloads matching the
// MobileApiListing shape consumed by convex/fetchListing.ts / Listings::JeClient.
//
//   node scripts/e2e/mock-je-server.mjs [port]
//
// Point the Rails app at it with JE_API_BASE=http://mock-je:8081.
import http from "node:http";

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8081);

const LISTINGS = {
  // A healthy luxury villa: passes the rule set (approved).
  14250001: {
    listing_id: 14250001,
    headline: "Stunning Sea-View Villa in Marbella",
    price: "€2,950,000",
    price_on_request: false,
    bedrooms: 5,
    bathrooms: "6 Baths",
    living_area: "650 Sq. Mt.",
    humanized_location: "Villa in Marbella, Spain",
    location_name: "Marbella, Spain",
    address: "Marbella, Malaga, Spain",
    images: Array.from(
      { length: 8 },
      (_, i) => `https://img.jamesedition.com/listing_images/mock/${14250001}/${i + 1}.jpg`,
    ),
    description:
      "An exceptional contemporary villa set on the Golden Mile with panoramic " +
      "Mediterranean views, infinity pool, home cinema, wine cellar and a " +
      "self-contained guest apartment. Walking distance to the beach. " +
      "Finished to the highest standard with Gaggenau appliances throughout.",
    property_type: "Villa",
    office_name: "Marbella Luxury Estates",
    url: "https://www.jamesedition.com/real_estate/marbella-spain/stunning-sea-view-villa-14250001",
    is_active: true,
    latitude: 36.5099,
    longitude: -4.8869,
    listed_at: "2026-05-12T09:30:00Z",
    updated_at: "2026-06-01T10:00:00Z",
    views: 1240,
    saves: 18,
    year_built: 2021,
    lot_size: { value: 1800, unit: "sqm", formatted: "1,800 m²" },
    listing_reference: "MLE-4521",
    floor_plan_images: [],
    room_type_images: {},
    has_video: false,
    has_virtual_tour: true,
    office_listings_count: 42,
    office_address: "Av. Ricardo Soriano, Marbella",
  },
  // A low-quality listing: trips auto-reject rules (few pictures, short description).
  14250002: {
    listing_id: 14250002,
    headline: "flat for sale CHEAP",
    price: "€45,000",
    price_on_request: false,
    bedrooms: 1,
    bathrooms: "1 Bath",
    living_area: "38 Sq. Mt.",
    humanized_location: "Apartment in Torrevieja, Spain",
    location_name: "Torrevieja, Spain",
    address: "Torrevieja, Alicante, Spain",
    images: [`https://img.jamesedition.com/listing_images/mock/${14250002}/1.jpg`],
    description: "cheap flat needs work",
    property_type: "Apartment",
    office_name: "Bargain Homes",
    url: "https://www.jamesedition.com/real_estate/torrevieja-spain/flat-14250002",
    is_active: true,
    latitude: 37.9787,
    longitude: -0.6822,
    listed_at: "2026-06-01T12:00:00Z",
    updated_at: "2026-06-05T12:00:00Z",
    views: 12,
    saves: 0,
    year_built: 1978,
    lot_size: null,
    listing_reference: null,
    floor_plan_images: [],
    room_type_images: {},
    has_video: false,
    has_virtual_tour: false,
    office_listings_count: 3,
    office_address: null,
  },
};

const server = http.createServer((req, res) => {
  const m = req.url?.match(/^\/api\/mobile\/v1\/listings\/(\d+)/);
  if (m) {
    const listing = LISTINGS[m[1]];
    if (listing) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(listing));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("mock-je: unknown route");
});

server.listen(PORT, () => {
  console.log(`mock JE mobile API listening on :${PORT}`);
});
