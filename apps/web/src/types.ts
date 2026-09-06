export type Role = "admin" | "viewer";
export type Row = {
  schema_version: "1.0";
  source_ref: string;
  marketplace: string;
  category_ref: string;
  observation_date: string;
  observed_at: string | null;
  time_precision: "date" | "timestamp";
  snapshot_ref: string;
  rank: number;
  asin: string;
  title: string;
  brand: string;
  source_url: string;
};
export type Point = {
  marketplace: string;
  day: string;
  snapshot_id: string | null;
  category_id: string;
  status: string;
  apr_listing_count: number | null;
  apr_top10_count: number | null;
  apr_best_rank: number | null;
  apr_median_rank: number | null;
  apr_product_family_count: number | null;
  unassigned_listing_count: number;
  exposure_index: number | null;
  avg_7d: number | null;
  avg_30d: number | null;
  n_valid_7d: number;
  n_valid_30d: number;
  actual_count: number | null;
  observed_at: string | null;
  time_precision: string | null;
  revision: number | null;
};
export type SourceRef = {
  id: string;
  display_name: string;
  mode: string;
  status: string;
  share_allowed: boolean;
};
export type Series = {
  data: Point[];
  europe5: {
    day: string;
    n_valid: number;
    n_expected: number;
    value: number | null;
  }[];
  meta: {
    as_of: string;
    as_of_mode: string;
    n_valid: number;
    n_expected: number;
    source_refs: SourceRef[];
    warnings: string[];
  };
};
export type Snapshot = {
  snapshot: {
    id: string;
    kst_date: string;
    completeness: string;
    actual_count: number;
    observed_at: string | null;
    time_precision: string;
    content_hash: string;
    revision: number;
    first_seen_at: string;
    backfill: boolean;
  };
  entries: {
    listing_id: string;
    asin: string;
    position: number;
    title: string;
    source_url: string;
    family: string | null;
  }[];
  changes: {
    listing_id: string;
    asin: string | null;
    rank: number | null;
    previous_rank: number | null;
    rank_change: number | null;
    rank_state: string;
    new_entry: boolean;
    exit: boolean;
  }[];
  comparison_date: string | null;
  comparison_label: string;
  evidence: {
    formula: string;
    metric_version: string;
    category: {
      marketplace: string;
      canonical_type: string;
      node: string;
      path: string;
      version: number;
    };
    source: SourceRef;
    revisions: {
      id: string;
      revision: number;
      source_id: string;
      first_seen_at: string;
    }[];
    selection_history: { reason: string; selected_at: string }[];
  };
};
export type Source = {
  id: string;
  ref: string;
  display_name: string;
  kind: string;
  mode: string;
  enabled: boolean;
  allowed_hosts: string[];
  status: string;
};
export type Batch = {
  id: string;
  filename: string;
  state: string;
  errors: { row?: number; code: string }[];
  warnings: string[];
  summary: { actual_count: number; completeness: string }[];
};
export type Category = {
  id: string;
  ref: string;
  marketplace: string;
  canonical_type: string;
  verification_status: string;
  source_node_id: string | null;
};
export type Family = { id: string; name: string };
export type Listing = {
  id: string;
  marketplace: string;
  asin: string;
  title: string;
};
