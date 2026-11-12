# Android Signing Key

## The real Play upload key

**Location:** Codemagic environment variable group `frostborn_android`

| Variable | Contents |
|---|---|
| `CM_KEYSTORE_B64` | Base64-encoded JKS keystore (the Play-registered upload key) |
| `CM_KEYSTORE_PASSWORD` | Keystore + key password |
| `CM_KEY_ALIAS` | Key alias inside the keystore |
| `CM_KEY_PASSWORD` | Key password (may equal `CM_KEYSTORE_PASSWORD`) |

Codemagic decodes it at build time:

```
echo "$CM_KEYSTORE_B64" | base64 -d > game/android/app/upload-key.jks
```

Play Console expects every AAB to be signed with the key whose **SHA1 fingerprint** is:

```
FC:A0:04:E4:8C:F6:2F:AF:A5:53:E5:CF:FD:EC:05:82:EB:25:8F:E2
```

## Files that must NOT be used for Play uploads

| File | Why it exists | Do NOT use for Play |
|---|---|---|
| `game/android/app/build-key.jks` | Scratch keystore generated during a debugging session | Wrong key — Play will reject the AAB with 403 |
| `game/android/app/release.jks` / `frostborn-upload.jks` | Old/unknown keystores — password unknown | Cannot be used |

## How to build & publish

**Always build via Codemagic** (workflow `android-release`):

```
node trigger_android_build.js   # or use the Codemagic web UI
```

The workflow:
1. Decodes the keystore from `CM_KEYSTORE_B64`
2. Sets `versionCode = BUILD_NUMBER + VERSION_CODE_BASE`
3. Builds the AAB and publishes to Play internal track (draft)
4. Run `node post_build_rollout.js` to roll out + upload the store icon

**Never** build locally with `./gradlew bundleRelease` and upload the resulting AAB to Play.
The local build will use whatever signing config is in `build.gradle` at the time, which
may not match the registered upload key.

## build.gradle signingConfig

`game/android/app/build.gradle` must have **no** `signingConfigs` block.
Codemagic injects it at build time (see `codemagic.yaml` → "Wire keystore into gradle release signingConfig").
If a `signingConfigs` block is accidentally present, remove it before the next Codemagic build.
