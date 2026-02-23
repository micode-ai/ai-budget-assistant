# Home Screen Widgets

## Overview

The app ships four Android home screen widgets built with [`react-native-android-widget`](https://github.com/sAleksovski/react-native-android-widget).

| Widget | Name in code | Size | Updates |
|--------|-------------|------|---------|
| Budget – Today | `BudgetWidgetSmall` | 110×40 dp | every 30 min |
| Budget – Week | `BudgetWidgetMedium` | 250×110 dp | every 30 min |
| Budget – Overview | `BudgetWidgetLarge` | 250×180 dp | every 30 min |
| Budget – Quick Add | `QuickActionWidget` | 250×60 dp | static (0) |

---

## Architecture

```
apps/mobile/
├── src/widgets/
│   ├── BudgetWidgetSmall.tsx        # Small widget component
│   ├── BudgetWidgetMedium.tsx       # Medium widget component
│   ├── BudgetWidgetLarge.tsx        # Large widget component
│   ├── QuickActionWidget.tsx        # Quick Add widget component (static)
│   ├── widgetTaskHandler.tsx        # Routes Android events to components
│   └── index.ts                     # Re-exports all widgets
├── src/services/
│   └── widgetData.ts                # Data bridge (SQLite → widget format)
│
├── android/app/src/main/
│   ├── java/com/budget/assistant/widget/
│   │   ├── BudgetWidgetSmall.java   # Extends RNWidgetProvider
│   │   ├── BudgetWidgetMedium.java
│   │   ├── BudgetWidgetLarge.java
│   │   └── QuickActionWidget.java   # Extends RNWidgetProvider
│   ├── res/xml/
│   │   ├── widgetprovider_budgetwidgetsmall.xml
│   │   ├── widgetprovider_budgetwidgetmedium.xml
│   │   ├── widgetprovider_budgetwidgetlarge.xml
│   │   └── widgetprovider_quickactionwidget.xml
│   ├── res/values/strings.xml       # Widget description strings
│   └── AndroidManifest.xml          # <receiver> entries for each widget
│
└── app.json                         # Plugin config (widgets array)
```

---

## Widget Components

All widgets are React components rendered via `react-native-android-widget`'s `FlexWidget` / `TextWidget` primitives (no standard RN views — widgets run outside the JS thread in a RemoteViews context).

### Data Widgets (Small / Medium / Large)

Data is loaded asynchronously inside `widgetTaskHandler.tsx` via `WidgetDataService`:

```typescript
// widgetTaskHandler.tsx (simplified)
case 'WIDGET_ADDED':
case 'WIDGET_UPDATE':
case 'WIDGET_RESIZED': {
  // Quick Add skips data loading
  if (widgetName === WIDGET_NAMES.QUICK_ACTION) {
    props.renderWidget(<QuickActionWidget />);
    break;
  }
  const data = await WidgetDataService.getWidgetData();
  // ... render appropriate widget
}
```

### Quick Add Widget

`QuickActionWidget` is a **static widget** — it renders three deep-link buttons with no data loading:

```tsx
<FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'budget:///expense/voice' }}>
  🎤 Voice
</FlexWidget>
<FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'budget:///expense/receipt' }}>
  📷 Scan
</FlexWidget>
<FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'budget:///expense/new' }}>
  ✏️ Add
</FlexWidget>
```

---

## Deep Link Scheme

The app uses the `budget://` URI scheme (defined in `app.json` → `"scheme": "budget"`).

Widget deep links:

| Button | URI | Opens |
|--------|-----|-------|
| Voice | `budget:///expense/voice` | `app/expense/voice.tsx` |
| Scan | `budget:///expense/receipt` | `app/expense/receipt.tsx` |
| Add | `budget:///expense/new` | `app/expense/new.tsx` |

Test via adb:
```bash
adb shell am start -a android.intent.action.VIEW \
  -d "budget:///expense/voice" com.budget.assistant
```

---

## Registration

### 1. Java provider class

Each widget needs a minimal Java class extending `RNWidgetProvider`:

```java
// android/app/src/main/java/com/budget/assistant/widget/QuickActionWidget.java
package com.budget.assistant.widget;
import com.reactnativeandroidwidget.RNWidgetProvider;
public class QuickActionWidget extends RNWidgetProvider {}
```

### 2. XML provider config

```xml
<!-- android/app/src/main/res/xml/widgetprovider_quickactionwidget.xml -->
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="60dp"
    android:resizeMode="none"
    android:updatePeriodMillis="0"
    android:initialLayout="@layout/rn_widget"
    android:configure="com.budget.assistant.WidgetConfigurationActivity"
    android:widgetFeatures="reconfigurable"
    android:widgetCategory="home_screen"
    android:description="@string/widget_quickactionwidget_description"
    android:previewImage="@drawable/quickactionwidget_preview" />
```

### 3. AndroidManifest.xml receiver

```xml
<receiver android:name=".widget.QuickActionWidget"
          android:exported="false"
          android:label="Budget - Quick Add">
  <intent-filter>
    <action android:name="android.appwidget.action.APPWIDGET_UPDATE"/>
    <action android:name="com.budget.assistant.WIDGET_CLICK"/>
  </intent-filter>
  <meta-data android:name="android.appwidget.provider"
             android:resource="@xml/widgetprovider_quickactionwidget"/>
</receiver>
```

### 4. app.json plugin entry

```json
{
  "name": "QuickActionWidget",
  "label": "Budget - Quick Add",
  "minWidth": "250dp",
  "minHeight": "60dp",
  "description": "Quick buttons to add expenses by voice, scan, or manually",
  "previewImage": "./assets/widget-quickaction-preview.png",
  "resizeMode": "none",
  "widgetFeatures": "reconfigurable",
  "updatePeriodMillis": 0,
  "taskHandlerName": "BUDGET_WIDGET_TASK_HANDLER"
}
```

### 5. Task handler case

```typescript
// widgetTaskHandler.tsx — add to WIDGET_NAMES and the switch
const WIDGET_NAMES = {
  SMALL: 'BudgetWidgetSmall',
  MEDIUM: 'BudgetWidgetMedium',
  LARGE: 'BudgetWidgetLarge',
  QUICK_ACTION: 'QuickActionWidget', // ← new
} as const;
```

---

## Adding a New Widget — Checklist

- [ ] Create `src/widgets/MyWidget.tsx` (JSX with FlexWidget/TextWidget)
- [ ] Export from `src/widgets/index.ts`
- [ ] Add name constant + case to `widgetTaskHandler.tsx`
- [ ] Create `android/.../widget/MyWidget.java`
- [ ] Create `android/.../res/xml/widgetprovider_mywidget.xml`
- [ ] Add `<receiver>` to `AndroidManifest.xml`
- [ ] Add string to `res/values/strings.xml`
- [ ] Add entry to `app.json` widgets array
- [ ] Add preview image to `assets/`
- [ ] Run `npx expo prebuild --clean && npx expo run:android`

---

## Build & Test

```bash
# Native rebuild required after manifest changes
cd apps/mobile
npx expo prebuild --clean
npx expo run:android

# Test widget deep links
adb shell am start -a android.intent.action.VIEW \
  -d "budget:///expense/voice" com.budget.assistant
```

> **Note**: Widget changes require a full native rebuild. Hot reload does not apply to widget components.
