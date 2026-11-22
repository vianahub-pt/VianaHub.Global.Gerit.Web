export function normalizeHubSelectSearchText(value: string, locale: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase(locale);
}

export type HubSelectSearchOption = {
  value: string;
  label: unknown;
  searchText?: string;
  sortLabel?: string;
};

function getHubSelectLabelText(option: HubSelectSearchOption) {
  if (option.sortLabel !== undefined) return option.sortLabel;
  if (typeof option.label === "string" || typeof option.label === "number") return String(option.label);
  if (option.searchText !== undefined) return option.searchText;
  return option.value;
}

export function filterHubSelectOptionsByQuery<T extends HubSelectSearchOption>(
  options: readonly T[],
  query: string,
  locale: string,
): T[] {
  const normalizedQuery = normalizeHubSelectSearchText(query.trim(), locale);
  if (!normalizedQuery) return [...options];

  return options.filter((option) => {
    const searchableText = `${getHubSelectLabelText(option)} ${option.value} ${option.searchText ?? ""}`;
    return normalizeHubSelectSearchText(searchableText, locale).includes(normalizedQuery);
  });
}

export function sortHubSelectOptionsByLocalizedName<T extends HubSelectSearchOption>(
  options: readonly T[],
  locale: string,
): T[] {
  const collator = new Intl.Collator(locale, { usage: "sort", sensitivity: "base" });
  return [...options].sort((left, right) => collator.compare(getHubSelectLabelText(left), getHubSelectLabelText(right)));
}
