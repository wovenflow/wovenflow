# Slugify

Convert a string into a URL-friendly slug. The input is arbitrary text; the output is a string suitable for use in a URL path segment. Lowercase the result, replace any character that is not a letter or digit with a hyphen, collapse runs of hyphens to a single hyphen, and trim hyphens from the start and end of the result. The function should accept any string input.

Export a single function `slugify(input)` from `index.js`.
