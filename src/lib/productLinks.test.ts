import { describe, expect, it } from "vitest";
import { getOutboundProductUrl } from "@/lib/productLinks";

describe("getOutboundProductUrl", () => {
  it("prefers affiliate URLs for affiliate-enabled products", () => {
    expect(
      getOutboundProductUrl({
        affiliate_url: "https://affiliate.example/item",
        product_url: "https://store.example/item",
        search_url: "https://store.example/search?q=item",
        is_affiliate: true,
      }),
    ).toBe("https://affiliate.example/item");
  });

  it("respects non-affiliate products and skips affiliate_url priority", () => {
    expect(
      getOutboundProductUrl({
        affiliate_url: "https://affiliate.example/item",
        product_url: "https://store.example/item",
        search_url: "https://store.example/search?q=item",
        is_affiliate: false,
      }),
    ).toBe("https://store.example/item");
  });

  it("falls back to search_url when no product URL exists", () => {
    expect(
      getOutboundProductUrl({
        affiliate_url: null,
        product_url: null,
        search_url: "https://store.example/search?q=item",
        is_affiliate: null,
      }),
    ).toBe("https://store.example/search?q=item");
  });
});
