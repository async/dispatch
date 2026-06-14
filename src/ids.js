import { randomBytes } from "node:crypto";

export function slugify(value, fallback = "item") {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

export function stamp(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function shortSuffix(bytes = 3) {
  return randomBytes(bytes).toString("hex");
}

export function makeId(prefix, label, options = {}) {
  const date = options.date ?? new Date();
  const suffix = options.suffix ?? shortSuffix();
  return `${prefix}-${slugify(label, prefix)}-${stamp(date)}-${suffix}`;
}
