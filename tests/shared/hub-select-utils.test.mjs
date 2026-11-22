import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  filterHubSelectOptionsByQuery,
  normalizeHubSelectSearchText,
  sortHubSelectOptionsByLocalizedName,
} from "../../shared/ui/hub-select-utils.ts";
import { CLIENT_NATIONALITY_OPTIONS } from "../../domains/operations/clients/client-nationality-catalog.ts";

const locales = ["pt-PT", "pt-BR", "en-US", "es-ES"];

test("the 79 canonical nationalities sort by localized country name in every supported locale", () => {
  for (const locale of locales) {
    const dictionary = JSON.parse(readFileSync("locales/" + locale + "/common.json", "utf8"));
    const options = CLIENT_NATIONALITY_OPTIONS.map(({ code, region }) => ({
      code, region, sortLabel: dictionary["clients.v1.nationality." + code],
    }));
    const sorted = sortHubSelectOptionsByLocalizedName(options, locale);
    const collator = new Intl.Collator(locale, { usage: "sort", sensitivity: "base" });

    assert.equal(sorted.length, 79, locale + " retains all 79 API codes");
    assert.deepEqual(new Set(sorted.map(({ code }) => code)), new Set(options.map(({ code }) => code)));
    for (let index = 1; index < sorted.length; index += 1) {
      assert.ok(collator.compare(sorted[index - 1].sortLabel, sorted[index].sortLabel) <= 0, locale + " is ordered by translated name");
    }
    assert.notDeepEqual(sorted.map(({ code }) => code), options.map(({ code }) => code).sort(), locale + " order is not ISO-code order");
  }
});

test("default localized sorting uses labels and does not mutate functional source order", () => {
  const options = [
    { value: "PT", label: "Portugal" },
    { value: "BR", label: "Brasil" },
    { value: "US", label: "Estados Unidos" },
  ];
  assert.deepEqual(sortHubSelectOptionsByLocalizedName(options, "pt-PT").map(({ value }) => value), ["BR", "US", "PT"]);
  assert.deepEqual(options.map(({ value }) => value), ["PT", "BR", "US"]);
});
test("search is case- and accent-insensitive and matches the translated name and ISO code", () => {
  const options = [
    { value: "CZ", label: "Tchéquia", searchText: "Tchéquia CZ" },
    { value: "PT", label: "Portugal", searchText: "Portugal PT" },
    { value: "BR", label: "Brasil", searchText: "Brasil BR" },
  ];

  assert.deepEqual(filterHubSelectOptionsByQuery(options, "tcheq", "pt-PT").map(({ value }) => value), ["CZ"]);
  assert.deepEqual(filterHubSelectOptionsByQuery(options, "PORTUG", "pt-PT").map(({ value }) => value), ["PT"]);
  assert.deepEqual(filterHubSelectOptionsByQuery(options, "cZ", "en-US").map(({ value }) => value), ["CZ"]);
  assert.deepEqual(filterHubSelectOptionsByQuery(options, "desconhecido", "pt-PT"), []);
  assert.deepEqual(filterHubSelectOptionsByQuery(options, "", "pt-PT"), options);
  assert.equal(normalizeHubSelectSearchText("Tchéquia", "pt-PT"), "tchequia");
});

test("the shared select translations exist in all supported locales", () => {
  for (const locale of locales) {
    const dictionary = JSON.parse(readFileSync("locales/" + locale + "/common.json", "utf8"));
    for (const key of [
      "hubSelect.searchPlaceholder", "hubSelect.noResults", "hubSelect.scrollHint",
      "hubSelect.clearSearch", "hubSelect.clearSelection", "hubSelect.optionsLabel",
    ]) {
      assert.equal(typeof dictionary[key], "string", locale + " has " + key);
      assert.ok(dictionary[key].length > 0, locale + " has a nonempty " + key);
    }
  }
});
