# Samsung Galaxy Store distribution runbook

Publishing `com.budget.assistant` on Samsung Galaxy Store as a **second**
Android distribution channel, alongside Google Play.

Why it is worth doing: Galaxy Store is preinstalled on every Galaxy device,
Samsung is roughly a third of the Polish Android market, its search has far
less competition than Play (where we currently sit at average position ~24.8),
and there is no sign-up or annual fee. Why it is not free: one irreversible
signing decision (below), plus a second build and a manual upload on every
release forever.

Read the two "before you start" sections in full before touching anything.
Both describe things that cannot be undone or worked around later.

---

## Before you start (1): submission is blocked until a key is registered

Samsung's own notice, [*Action Required for Google's Android Developer
Verification (ADV) Rollout in Four Countries*](https://seller.samsungapps.com/notice/getNoticeDetail.as?csNoticeID=0000011990)
(2026-07-31):

> **To be implemented in September 2: Submission Block for ADV-Unapproved
> Apps.** New app registrations and update submissions through Seller Portal
> will be completely blocked for apps that include ADV-unapproved binaries.

That date has passed. This is **not** the country-scoped part of the ADV
rollout (installation blocking in Brazil, Indonesia, Singapore and Thailand
from 2026-09-30) — the submission block is unconditional and applies to us.

The practical consequence: **the Seller Portal will refuse our binary until
the certificate that signs it is registered with Google**, so Step 4 below is
a hard prerequisite for Step 6, not a tidy-up afterwards.

Samsung's notice describes three cases. Ours is **Case 2** — the package name
is already released on Google Play, and the Galaxy Store build uses a
different signing key.

## Before you start (2): the second signing key is a one-way door

Our Play releases are signed by **Play App Signing** — Google holds the app
signing key and it cannot be exported. Anything we build ourselves is signed
with our **upload key** instead. So the Galaxy Store APK will carry a
different signature from the Play build, and Android identifies an app by
`package name + signature`.

That means:

- A device with the Play version **cannot install** the Galaxy Store version
  without uninstalling first, and vice versa. Android refuses a same-package
  install with a mismatched signature.
- Updates never cross between the two stores. Each install stays on the store
  it came from for its whole life.
- There is no way back to a single signature later, because the Play app
  signing key is not ours to reuse.

This is normal and expected for third-party Android stores, and Samsung's
Case 2 exists precisely for it. But it is a decision, not a detail: from the
first Galaxy Store install onwards we are maintaining two install bases.

### What does *not* break (verified, not assumed)

A different signature usually breaks anything keyed to a certificate
fingerprint. Checked both candidates in this app:

- **Google sign-in works.** `apps/mobile/src/features/auth/useGoogleAuth.ts`
  uses the **web** OAuth client and an HTTPS relay
  (`https://ai-budget.pl/oauth/callback/` → `budget://oauth`), not an Android
  OAuth client — and an Android client is the only kind Google binds to
  package name + SHA-1. `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` is set in
  `eas.json` but read nowhere in `src/` or `app/`; it is dead configuration.
- **Push works.** `apps/mobile/google-services.json` contains no
  `oauth_client` entry and no `certificate_hash` at all — it is pure FCM
  config keyed by package name.

Do not re-derive this from memory on the next release; re-check only if
either file gains a certificate-bound client.

---

## Order of operations

Step 1 is the long pole (weeks) and independent of everything else — start it
first and let it run while doing 2–5.

```
Step 1  Seller registration ─────────────────────────► (days to weeks)
Step 2  Build APK ─► Step 3 read fingerprint ─► Step 4 register key in ADV
                                                        │
                                            (Step 5 only if Google asks)
                                                        ▼
                                     Step 6 register app ─► 7 listing ─► 8 submit
```

---

## Step 1 — Start commercial seller registration

Do this first. Each verification stage takes **up to 10 business days** and
there may be more than one.

1. Go to <https://seller.samsungapps.com/> → **Sign Up Now**. Requires a
   Samsung account.
2. Apply for **commercial seller** status. Samsung requires this even for a
   free app: *"all Android app free content providers must become validated
   commercial sellers … by submitting their IDs or business registration
   documents for review."*
3. **The account email must be on a private or company domain.** Samsung's own
   guidance says not to use a public-domain address (gmail, yahoo). Use a
   MICODE / retano.ai address, not `perevertkinma@gmail.com` — which is the
   Play Console login and would be rejected here.
4. Have MICODE sp. z o.o. registration documents (KRS / NIP) ready. Samsung's
   FAQ also mentions a D-U-N-S number and bank account verification; those
   relate to getting **paid**, so they may not be demanded for a free app —
   but if the form asks and MICODE has no D-U-N-S, requesting one from
   Dun & Bradstreet is free and can itself take weeks. Find out early.

Fee: none. Samsung FAQ: *"There is no sign-up nor annual fee to publish in
Galaxy Store."*

## Step 2 — Build the Galaxy Store APK

No code change is needed. The existing workflow already produces an APK:

**GitHub → Actions → *Mobile Build & Publish* → Run workflow**
- `profile`: **preview**
- `submit`: **false**

Why this works as-is (`.github/workflows/mobile-build.yml`):
- the `preview` profile in `apps/mobile/eas.json` sets
  `android.buildType: "apk"`, and points at the production API
  (`EXPO_PUBLIC_API_URL=https://api.ai-budget.pl/api/v1`) — it is a real
  release build, not a dev build;
- the "Resolve output artifact" step names the output `app-release.apk` for
  any non-production profile;
- every submit-to-Play step is gated on `inputs.profile == 'production'`, so
  nothing is sent to Google Play.

The result is the artifact **`app-release-preview`** on the run, retained 30
days. Download it — this same file goes to Samsung in Step 6.

Galaxy Store's technical bar is already met by this build:

| Requirement | Ours |
|---|---|
| target API ≥ 33 | Expo 54 → 36 |
| at least one 64-bit binary | `reactNativeArchitectures` includes `arm64-v8a`, `x86_64` |
| 16 KB page size (since 2026-07-01) | RN 0.81 + `expo.useLegacyPackaging=false` |

## Step 3 — Read the APK's real signing fingerprint

Do not register a fingerprint from memory. Read it from the artifact that
will actually be uploaded:

```bash
# either of these, from the Android SDK / JDK
apksigner verify --print-certs app-release.apk | grep -i sha-256
keytool -printcert -jarfile app-release.apk | grep -i SHA256
```

**Expected value** — the Play Console upload key certificate
(Play Console → *Protected with Play* → **App signing** → *Upload key
certificate*), because EAS signs our builds with the upload key:

```
SHA-256  76:CE:03:21:EB:25:05:77:F2:F6:CF:E2:01:45:E4:02:DA:E9:85:6C:A0:42:CE:B8:B7:47:F1:E5:92:8D:00:4B
SHA-1    96:DE:01:74:A3:19:23:7D:73:0E:C5:BD:D3:A1:45:E4:A0:EF:91:83
```

If the APK's fingerprint differs from this, **stop** — it means EAS is holding
a keystore that is not the Play upload key, and the right value is whatever
the APK says, not what is written above. Registering the wrong key produces a
binary Samsung still refuses, with a confusing error.

(Certificate fingerprints are public by design — they ship inside every APK
and we are about to publish this one to Google's registry. Not a secret.)

## Step 4 — Register that key in Google's ADV registry

Page verified to exist and to offer the action:

**Play Console → Android developer verification → Package names →
`com.budget.assistant` (AI Budget Assistant) → Add key**

Direct link:
<https://play.google.com/console/u/0/developers/6102832003778370955/android-developer-verification/packages/com.budget.assistant>

State as of 2026-09-04: status **Registered**, **1 key** (the Play App Signing
key, added 2026-04-10). We are adding a second one. The page's own banner
spells out that this is the intended use:

> Make sure that any apps you want to continue distributing are registered
> below. This includes any apps that you distribute outside of Play, as well
> as **any additional keys for your Play apps that you use to sign them
> outside of Play**.

Paste the SHA-256 from Step 3 and select **Add key**. Propagation to the
Android developer registry takes a few minutes.

## Step 5 — Proof of ownership (only if Google asks for it)

Google may require proof that we hold the matching private key. If so, a
**Verify** button appears next to the key just added. Then:

1. Copy the snippet Play Console shows (it is tied to our developer account).
2. Create `apps/mobile/android/app/src/main/assets/adi-registration.properties`
   containing exactly that snippet. **This directory does not exist in the
   repo today** — it has to be created, and it must be `assets/`, spelled
   exactly, or the check fails silently.
3. Re-run Step 2 to build an APK containing the file.
4. Back in Play Console, select **Upload** next to the key and upload that
   APK.

Note the ordering trap: the APK uploaded here must be signed with the key
being verified — which it is, since it comes from the same `preview` profile.

Once verified, the file can stay in the repo (harmless) or be removed. Keeping
it means the next verification is free; removing it means remembering this
section.

## Step 6 — Register the app in Seller Portal

Only reachable once Step 1 is approved **and** Step 4 has propagated.

Seller Portal → **Add New Application** → Android. Upload the
`app-release.apk` from Step 2.

Galaxy Store accepts both APK and AAB. **Upload the APK, signed with our own
key.** Do not choose *App Signing by Galaxy Store* (Samsung's Case 1): with
that option Samsung holds the private key, so if Google ever asks for proof of
ownership per Step 5, there is nothing to prove it with.

After upload, Seller Portal shows an **ADV status** per binary:

- **Installable** — ADV approval succeeded, Step 4 worked.
- **Not Installable** — the signing key is not registered. Go back to Step 4;
  do not try to submit.

## Step 7 — Store listing

Source copy: **`docs/marketing/copy/google-play-listings.md`** (9 locales,
already written). It cannot be pasted unchanged — Galaxy Store's field limits
differ from Play's, and are counted in **bytes**, not characters.

From the [Content Publish API reference](https://developer.samsung.com/galaxy-store/galaxy-store-developer-api/content-publish-api/reference.html):

| Field | Galaxy Store limit | Play limit | Note |
|---|---|---|---|
| `appTitle` | 100 bytes | 30 chars | Our titles fit with room to spare |
| `shortDescription` | **40 bytes** | 80 chars | **Must be rewritten** |
| `longDescription` | 4000 bytes | 4000 chars | Fits for Latin scripts |
| `newFeature` (release notes) | 4000 bytes | — | Reuse `docs/release-notes/*-app-versions.md` |

**The 40-byte short description is the real work — all 9 are over, none
marginally.** Measured against the current copy:

| Locale | Title | Short description | Over by |
|---|---|---|---|
| en-US | 27 B | 65 B (65 chars) | 25 B |
| ru-RU | 36 B | **103 B** (58 chars) | 63 B |
| pl-PL | 30 B | 76 B (72 chars) | 36 B |
| uk-UA | 34 B | **103 B** (58 chars) | 63 B |
| es-ES | 28 B | 76 B (76 chars) | 36 B |
| fr-FR | 26 B | 73 B (70 chars) | 33 B |
| de-DE | 24 B | 68 B (68 chars) | 28 B |
| be | 19 B | **107 B** (60 chars) | 67 B |
| nl-NL | 25 B | 62 B (62 chars) | 22 B |

Titles all fit comfortably under 100 B. Short descriptions do not, and it is
worse than the character counts suggest because the limit is in **bytes**:
UTF-8 Cyrillic is 2 bytes per letter, so `ru` / `ua` / `be` get roughly **20
letters** — a head keyword and almost nothing else. Polish and French
diacritics cost 2 bytes each too.

So all 9 need a fresh, much shorter line, front-loading the market's head
keyword the way `docs/marketing/copy/aso-keywords.md` describes. Measure, do
not eyeball:

```bash
python -c "print(len('Wydatki i budżet z AI'.encode()))"
```

For `longDescription`, also strip anything Play-specific. Do **not** carry
over any claim that the app is open source or that source is on GitHub —
`LICENSE` states it is proprietary and not open source.

### Assets — our screenshots do not fit as-is

Galaxy Store, quoted verbatim:

> Image file of app screenshot to be displayed in your Galaxy Store listing
> (JPG or PNG file, 320-3840 pixels with a **maximum 2:1 aspect ratio**).

Requires **4–8** screenshots. Ours in
`docs/marketing/feature_graphics/by-language/<lang>/` are **1080×2340**, which
is **2.17:1** — taller than the maximum, so they will be rejected.

Pad rather than crop. Widening to **1170×2340** is exactly 2:1 and loses no
content (45 px of background each side); cropping 180 px off the height would
cut real UI:

```python
from PIL import Image
import glob, os, pathlib

SRC = 'docs/marketing/feature_graphics/by-language'
BG = (0, 0, 0)  # matches the app's splash/adaptive-icon background

for src in sorted(glob.glob(f'{SRC}/*/[0-9]*.jpg')):
    lang = pathlib.Path(src).parent.name
    if lang.startswith('en-'):      # skip the derived en-150kb / en-250x250 dirs
        continue
    im = Image.open(src)
    w, h = im.size
    target_w = max(w, (h + 1) // 2)   # ceil, so ratio is <= 2:1, never over
    canvas = Image.new('RGB', (target_w, h), BG)
    canvas.paste(im, ((target_w - w) // 2, 0))
    out_dir = f'docs/marketing/feature_graphics/galaxy-store/{lang}'
    os.makedirs(out_dir, exist_ok=True)
    canvas.save(f'{out_dir}/{os.path.basename(src)}', quality=90)
```

Verified: produces 62 files across all 9 languages, every one exactly
1170×2340 (ratio 2.0000), 198–341 KB. The `(h + 1) // 2` is a ceiling on
purpose — a floor could land a pixel *over* 2:1 for an odd height and be
rejected. The `en-` prefix skip excludes the derived `en-150kb` and
`en-250x250` directories, which are sized for other channels.

Icon: **512×512 PNG, ≤1024 KB**. `apps/mobile/assets/icon.png` is 1024×1024 —
downscale it; at 512 it lands far under the size cap.

The `hero image` (1200×675) and edge-screen images are optional and
games-oriented. Skip them.

## Step 8 — Submit, then verify

Submit for review from Seller Portal. Samsung publishes no committed review
SLA; expect days.

After it goes live, verify the things that a different signature could plausibly
have broken — on a real Galaxy device, installing **from Galaxy Store** (not
sideloaded):

1. Google sign-in completes (this is the Step-2-verified web-client path).
2. A push notification arrives.
3. Registration attribution lands — a Galaxy Store install carries no query
   string, so `acquisition*` will be NULL for it. That is correct and expected
   (see the ABA-436 notes in `CLAUDE.md`), not a bug to chase.

---

## Per-release routine, once live

Every future release needs a second pass. The Play flow is unchanged.

1. Release to Play as usual (*Mobile Build & Publish*, `profile=production`).
2. Re-run the same workflow with `profile=preview`, `submit=false`.
3. Download `app-release-preview` and upload it to Seller Portal as an update.
4. Paste the release notes into `newFeature` (4000 bytes) from that version's
   `docs/release-notes/<version>-app-versions.md`.

The signing key does not change, so Steps 3–5 are one-time. If the EAS
keystore is ever rotated or an **upload key reset** is requested in Play
Console, the new fingerprint must be added in Step 4 **before** the next
Galaxy Store upload, or submission is blocked again with no obvious cause.

`versionCode`: `eas.json` sets `appVersionSource: "remote"` and
`autoIncrement` only on the `production` profile, so a `preview` build takes
the remote version rather than inventing its own. Galaxy Store therefore
tracks Play's `versionCode`, which is what we want — but it does mean a Galaxy
Store upload should follow the Play build of the same version, not precede it.

## Backing out

There is no clean rollback for the signature split — installs that came from
Galaxy Store stay on that lineage.

What *can* be undone:

- **Unpublish from Galaxy Store** (Seller Portal → the app → suspend/remove
  distribution). Existing installs keep working and stop receiving updates.
- **Remove the second ADV key** (Play Console → Android developer verification
  → the package → the key). Harmless to Play, since the Play App Signing key
  is a separate registered entry. Doing this makes any Galaxy Store binary
  signed with that key non-installable in ADV-enforced countries, so unpublish
  first.

Leaving the app published but never updating it is the worst of the options —
users on that lineage get a silently frozen app. Either keep the per-release
routine or unpublish.

## Not an option: F-Droid

Listed here so it is not re-investigated. F-Droid builds only from open
source; `LICENSE` states this software is *"proprietary and confidential …
NOT open source."* Ineligible.

## Sources

- [Samsung ADV notice (2026-07-31)](https://seller.samsungapps.com/notice/getNoticeDetail.as?csNoticeID=0000011990) — submission block, the three cases
- [Galaxy Store FAQ](https://developer.samsung.com/galaxy-store/faq.html) — no fee, commercial seller, 10-business-day verification
- [Register Your App in Seller Portal](https://developer.samsung.com/galaxy-store/launch.html) — APK and AAB both accepted
- [Content Publish API reference](https://developer.samsung.com/galaxy-store/galaxy-store-developer-api/content-publish-api/reference.html) — field byte limits, screenshot and icon specs
- [Adding additional keys — Play Console Help](https://support.google.com/googleplay/android-developer/answer/16762301) — Add key flow, `adi-registration.properties` proof of ownership
- [Register on Android Developer Console](https://developer.android.com/developer-verification/guides/android-developer-console) — ADV background
