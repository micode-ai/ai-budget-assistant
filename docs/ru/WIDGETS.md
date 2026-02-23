# Виджеты главного экрана

## Обзор

Приложение поставляется с четырьмя Android-виджетами для главного экрана, построенными на [`react-native-android-widget`](https://github.com/sAleksovski/react-native-android-widget).

| Виджет | Имя в коде | Размер | Обновление |
|--------|-----------|--------|------------|
| Бюджет — Сегодня | `BudgetWidgetSmall` | 110×40 dp | каждые 30 мин |
| Бюджет — Неделя | `BudgetWidgetMedium` | 250×110 dp | каждые 30 мин |
| Бюджет — Обзор | `BudgetWidgetLarge` | 250×180 dp | каждые 30 мин |
| Бюджет — Быстрое добавление | `QuickActionWidget` | 250×60 dp | статично (0) |

---

## Архитектура

```
apps/mobile/
├── src/widgets/
│   ├── BudgetWidgetSmall.tsx        # Компонент малого виджета
│   ├── BudgetWidgetMedium.tsx       # Компонент среднего виджета
│   ├── BudgetWidgetLarge.tsx        # Компонент большого виджета
│   ├── QuickActionWidget.tsx        # Виджет «Быстрое добавление» (статичный)
│   ├── widgetTaskHandler.tsx        # Роутинг событий Android к компонентам
│   └── index.ts                     # Реэкспорт всех виджетов
├── src/services/
│   └── widgetData.ts                # Мост данных (SQLite → формат виджета)
│
├── android/app/src/main/
│   ├── java/com/budget/assistant/widget/
│   │   ├── BudgetWidgetSmall.java   # Расширяет RNWidgetProvider
│   │   ├── BudgetWidgetMedium.java
│   │   ├── BudgetWidgetLarge.java
│   │   └── QuickActionWidget.java   # Расширяет RNWidgetProvider
│   ├── res/xml/
│   │   ├── widgetprovider_budgetwidgetsmall.xml
│   │   ├── widgetprovider_budgetwidgetmedium.xml
│   │   ├── widgetprovider_budgetwidgetlarge.xml
│   │   └── widgetprovider_quickactionwidget.xml
│   ├── res/values/strings.xml       # Строки описания виджетов
│   └── AndroidManifest.xml          # Записи <receiver> для каждого виджета
│
└── app.json                         # Конфиг плагина (массив widgets)
```

---

## Компоненты виджетов

Все виджеты — это React-компоненты, которые рендерятся через примитивы `FlexWidget` / `TextWidget` из `react-native-android-widget` (без стандартных RN-компонентов — виджеты работают вне JS-потока в контексте RemoteViews).

### Виджеты с данными (Small / Medium / Large)

Данные загружаются асинхронно в `widgetTaskHandler.tsx` через `WidgetDataService`:

```typescript
// widgetTaskHandler.tsx (упрощённо)
case 'WIDGET_ADDED':
case 'WIDGET_UPDATE':
case 'WIDGET_RESIZED': {
  // Quick Add пропускает загрузку данных
  if (widgetName === WIDGET_NAMES.QUICK_ACTION) {
    props.renderWidget(<QuickActionWidget />);
    break;
  }
  const data = await WidgetDataService.getWidgetData();
  // ... рендер нужного виджета
}
```

### Виджет «Быстрое добавление»

`QuickActionWidget` — **статичный виджет**. Рендерит три кнопки с deep link без загрузки данных:

```tsx
<FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'budget:///expense/voice' }}>
  🎤 Голос
</FlexWidget>
<FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'budget:///expense/receipt' }}>
  📷 Скан
</FlexWidget>
<FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'budget:///expense/new' }}>
  ✏️ Добавить
</FlexWidget>
```

---

## Схема Deep Link

Приложение использует URI-схему `budget://` (определена в `app.json` → `"scheme": "budget"`).

Deep link виджетов:

| Кнопка | URI | Открывает |
|--------|-----|-----------|
| Голос | `budget:///expense/voice` | `app/expense/voice.tsx` |
| Скан | `budget:///expense/receipt` | `app/expense/receipt.tsx` |
| Добавить | `budget:///expense/new` | `app/expense/new.tsx` |

Тест через adb:
```bash
adb shell am start -a android.intent.action.VIEW \
  -d "budget:///expense/voice" com.budget.assistant
```

---

## Регистрация

### 1. Java-класс провайдера

Каждый виджет требует минимального Java-класса, расширяющего `RNWidgetProvider`:

```java
// android/app/src/main/java/com/budget/assistant/widget/QuickActionWidget.java
package com.budget.assistant.widget;
import com.reactnativeandroidwidget.RNWidgetProvider;
public class QuickActionWidget extends RNWidgetProvider {}
```

### 2. XML-конфиг провайдера

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

### 3. Receiver в AndroidManifest.xml

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

### 4. Запись в app.json

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

### 5. Case в task handler

```typescript
// widgetTaskHandler.tsx — добавить в WIDGET_NAMES и в switch
const WIDGET_NAMES = {
  SMALL: 'BudgetWidgetSmall',
  MEDIUM: 'BudgetWidgetMedium',
  LARGE: 'BudgetWidgetLarge',
  QUICK_ACTION: 'QuickActionWidget', // ← новый
} as const;
```

---

## Чек-лист добавления нового виджета

- [ ] Создать `src/widgets/MyWidget.tsx` (JSX с FlexWidget/TextWidget)
- [ ] Экспортировать из `src/widgets/index.ts`
- [ ] Добавить константу имени + case в `widgetTaskHandler.tsx`
- [ ] Создать `android/.../widget/MyWidget.java`
- [ ] Создать `android/.../res/xml/widgetprovider_mywidget.xml`
- [ ] Добавить `<receiver>` в `AndroidManifest.xml`
- [ ] Добавить строку в `res/values/strings.xml`
- [ ] Добавить запись в массив `widgets` в `app.json`
- [ ] Добавить превью-изображение в `assets/`
- [ ] Выполнить `npx expo prebuild --clean && npx expo run:android`

---

## Сборка и тестирование

```bash
# Требуется полная пересборка нативного кода после изменений манифеста
cd apps/mobile
npx expo prebuild --clean
npx expo run:android

# Тест deep link виджетов
adb shell am start -a android.intent.action.VIEW \
  -d "budget:///expense/voice" com.budget.assistant
```

> **Важно**: Изменения в виджетах требуют полной пересборки. Горячая перезагрузка (hot reload) не применяется к компонентам виджетов.
