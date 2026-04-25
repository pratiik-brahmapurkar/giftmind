import { describe, expect, it } from "vitest";
import { buildSearchUrl, scoreProductMatch, simulateMarketplacePreview } from "@/lib/marketplaceMatching";

describe("buildSearchUrl", () => {
  it("appends affiliate params to prefix-style URLs", () => {
    expect(
      buildSearchUrl(
        {
          store_id: "amazon_in",
          store_name: "Amazon.in",
          domain: "amazon.in",
          country_code: "IN",
          search_url: "https://www.amazon.in/s?k=",
          affiliate_param: "&tag=giftmind-21",
        },
        "merino headband running",
      ),
    ).toBe("https://www.amazon.in/s?k=merino%20headband%20running&tag=giftmind-21");
  });

  it("replaces {keyword} placeholders when present", () => {
    expect(
      buildSearchUrl(
        {
          store_id: "etsy",
          store_name: "Etsy",
          domain: "etsy.com",
          country_code: "GLOBAL",
          search_url: "https://www.etsy.com/search?q={keyword}",
          affiliate_param: "&ref=giftmind",
        },
        "custom mug",
      ),
    ).toBe("https://www.etsy.com/search?q=custom%20mug&ref=giftmind");
  });
});

describe("scoreProductMatch", () => {
  const concept = {
    name: "Merino Running Headband",
    search_keywords: ["merino headband", "wool running headband"],
    product_category: "sports",
    price_anchor: 42,
  };

  it("rewards relevant in-budget, in-stock products", () => {
    const score = scoreProductMatch(
      {
        id: "1",
        store_id: "amazon_in",
        country_code: "IN",
        product_title: "Smartwool Merino Running Headband",
        product_url: "https://example.com/product",
        stock_status: "in_stock",
        price_amount: 42,
        product_category: "sports",
        keyword_tags: ["merino", "running", "headband"],
      },
      concept,
      "IN",
      30,
      75,
    );

    expect(score).toBeGreaterThan(40);
  });

  it("penalizes out-of-stock products heavily", () => {
    const inStock = scoreProductMatch(
      {
        id: "1",
        store_id: "amazon_in",
        country_code: "IN",
        product_title: "Smartwool Merino Running Headband",
        product_url: "https://example.com/product",
        stock_status: "in_stock",
        price_amount: 42,
        product_category: "sports",
        keyword_tags: ["merino", "running", "headband"],
      },
      concept,
      "IN",
      30,
      75,
    );

    const outOfStock = scoreProductMatch(
      {
        id: "2",
        store_id: "amazon_in",
        country_code: "IN",
        product_title: "Smartwool Merino Running Headband",
        product_url: "https://example.com/product",
        stock_status: "out_of_stock",
        price_amount: 42,
        product_category: "sports",
        keyword_tags: ["merino", "running", "headband"],
      },
      concept,
      "IN",
      30,
      75,
    );

    expect(outOfStock).toBeLessThan(inStock);
  });
});

describe("simulateMarketplacePreview", () => {
  it("applies plan-based store gating and keeps total locked count", () => {
    const result = simulateMarketplacePreview({
      stores: [
        {
          store_id: "amazon_in",
          store_name: "Amazon.in",
          domain: "amazon.in",
          country_code: "IN",
          search_url: "https://www.amazon.in/s?k=",
          priority: 1,
          is_active: true,
        },
        {
          store_id: "flipkart",
          store_name: "Flipkart",
          domain: "flipkart.com",
          country_code: "IN",
          search_url: "https://www.flipkart.com/search?q=",
          priority: 2,
          is_active: true,
        },
      ],
      products: [
        {
          id: "1",
          store_id: "amazon_in",
          country_code: "IN",
          product_title: "Merino Running Headband",
          product_url: "https://example.com/a",
          stock_status: "in_stock",
          price_amount: 40,
          product_category: "sports",
          keyword_tags: ["merino", "running", "headband"],
        },
      ],
      concept: {
        name: "Merino Running Headband",
        search_keywords: ["merino headband", "running headband"],
        product_category: "sports",
        price_anchor: 42,
      },
      targetCountry: "IN",
      budgetMin: 30,
      budgetMax: 75,
      userPlan: "spark",
    });

    expect(result.rows).toHaveLength(2);
    expect(result.total_stores_available).toBe(2);
    expect(result.locked_store_count_total).toBe(0);
    expect(result.rows[0]?.store_id).toBe("amazon_in");
  });

  it("marks previews as global fallback when requested", () => {
    const result = simulateMarketplacePreview({
      stores: [],
      products: [],
      concept: {
        name: "Custom Mug",
        search_keywords: ["custom mug"],
        product_category: "personalized",
        price_anchor: 25,
      },
      targetCountry: "SG",
      budgetMin: 10,
      budgetMax: 40,
      userPlan: "pro",
      isGlobalFallback: true,
    });

    expect(result.is_global_fallback).toBe(true);
  });
});
