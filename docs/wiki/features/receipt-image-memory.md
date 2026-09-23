# Receipt image memory

*Hub: [mobile-app](../mobile-app.md) · related: [receipt-category-split](receipt-category-split.md)*

## What this is

Keeping the Android app under Google Play's memory thresholds, enforced from February 2027 — an app
over them loses Play visibility and publishing. The memory problem was all on the receipt-photo
path.

## Entry points

- `apps/mobile/src/features/receipt/receiptImageSizing.ts` — `RECEIPT_OCR_MAX_WIDTH` (1600),
  `RECEIPT_STORED_MAX_WIDTH` (800), `resolveResizeWidth`
- `apps/mobile/src/features/receipt/receiptImage.ts` — `downscaleForOcr`, `compressAndEncodeImage`
- `apps/mobile/src/features/receipt/receiptImageCache.ts` — `materializeReceipt`, `releaseReceipt`
- `apps/mobile/src/features/receipt/useReceiptScanner.ts` — `processImage`
- `apps/mobile/android/gradle.properties`, `android/app/proguard-rules.pro` — the DEX half

## Key concepts

**Three thresholds.** Dynamic memory (anonymous RSS + swap), bitmap, and DEX optimization coverage
(≥25%). The DEX half is already met by release minify + resource shrinking.

**Why 1600px.** The vision model downsamples to ~2048px on its longest side anyway, and receipts are
narrow, so capping the **width** keeps small print legible.

**One shrunk copy feeds everything.** `processImage` downscales before encoding and sets
`state.imageUri` to the downscaled file, so the OCR request, the preview and the stored 800px copy
all come from it. The income receipt screen shares the hook and inherits this.

## Invariants

**Downscale a receipt photo before it is ever base64-encoded or given to `<Image>`.**

**Resize when the width is unknown.** `resolveResizeWidth` returns `null` (pass through) only for a
source already under the cap; the document-picker path reports no width, and guessing wrong on a
small image costs a modest upscale while guessing wrong on a 12 MP one costs tens of MB.

**`receiptImage.ts` is the only place that resizes.** It replaced a third inline copy that lived in
`ReceiptSection`; do not add a fourth. It runs the manipulation even when no resize is needed, since
pickers can return HEIC on iOS.

**`downscaleForOcr` never throws** — it falls back to the original URI. A scan that works but uses
more memory beats one that does not work.

**Render stored receipts from a file URI, never a `data:` URL.** `materializeReceipt` writes the
base64 to a cache file so Fresco can sample the bitmap to its on-screen size (a `data:` URL made a
200pt thumbnail decode at full resolution) and so the multi-MB string does not sit in component
state. The filename carries a revision counter because `<Image>` caches by URI and a reused path
shows the previous photo after a replace. Web keeps the data URL — `expo-file-system/next` `File`
has no working web implementation, and the threshold is a Play requirement.

**Do not add a blanket `-keep class **` to ProGuard** — it would drop the app under the DEX
coverage bar. Only two narrow keep rules exist.

## Known gaps

- The real numbers against the thresholds are unmeasured. Read them from Play Console's Android
  Vitals dynamic-memory breakdown rather than inferring them.

## History

ABA-463.
