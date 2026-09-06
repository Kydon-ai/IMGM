# Hit@8 Mixed 500 Dataset

This is the combined evaluation dataset with 500 unique query texts.

- `1:1`: 406 queries
- `1:2`: 85 queries
- `1:4`: 9 queries

The candidate gallery contains 1594 images. No semantic group or query text is reused across the combined dataset.

Files:

- `queries.jsonl`: all 500 query cases.
- `gallery.jsonl`: the candidate image gallery.
- `summary.json`: dataset metadata.

Run the evaluation from the project root:

```bash
npm run evaluate imgm_mixed_500_v1
```

Each run writes one detailed JSONL record per query under `logs/`, including the query, relevant image IDs, all returned Top8 results, scores, matched keywords, hit rank, Hit@8 result, and duration. A run summary is written beside the log.

Before each run, the evaluator deletes and rebuilds the dedicated database at `artifacts/data/imgm_mixed_500_v1.db`. Only the 1,594 images listed in this dataset's `gallery.jsonl` are indexed into that database.
