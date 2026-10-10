import type { SchemeRecord } from "./types";

export function filterCatalogue(schemes: SchemeRecord[], state: string, category: string) {
  return schemes.filter((scheme) =>
    (!state || (state === "central" ? scheme.jurisdiction === "central" : scheme.state === state)) &&
    (!category || scheme.category === category),
  );
}

export function categoryLabel(category: string | null) {
  return category ? category.replaceAll("-", " ") : "Other";
}