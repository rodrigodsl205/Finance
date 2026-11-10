/*
# Add parent_id to categories for 3-level hierarchy

## Changes
- Adds `parent_id` column to `categories` table, a self-referencing FK
  with ON DELETE CASCADE, enabling up to 3 levels of hierarchy:
  Category > Subcategory > Sub-subcategory.
- `parent_id` is nullable: top-level categories have NULL, children
  point to their parent's id.

## Security
- No RLS policy changes needed: the existing membership-based policies
  already cover hierarchical categories since they share the same
  `space_id`.
- No grant changes needed.
*/

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES categories(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
