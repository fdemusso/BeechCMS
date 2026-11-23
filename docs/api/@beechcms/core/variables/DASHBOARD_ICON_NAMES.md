[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / DASHBOARD\_ICON\_NAMES

# Variable: DASHBOARD\_ICON\_NAMES

> `const` **DASHBOARD\_ICON\_NAMES**: readonly \[`"Folder"`, `"Newspaper"`, `"ShoppingBag"`, `"Users"`, `"MessageSquare"`, `"Layout"`, `"UserCircle"`, `"Mail"`, `"FileText"`, `"Image"`, `"Video"`, `"Music"`, `"Tag"`, `"Bookmark"`, `"Star"`, `"Heart"`, `"Globe"`, `"Link"`, `"Calendar"`, `"Clock"`, `"Map"`, `"MapPin"`, `"Package"`, `"Box"`, `"Archive"`, `"Database"`, `"Settings"`, `"Wrench"`, `"Code"`, `"Terminal"`, `"Book"`, `"BookOpen"`, `"GraduationCap"`, `"Award"`, `"Trophy"`, `"Flag"`, `"Layers"`, `"Grid"`, `"List"`, `"Table"`, `"BarChart"`, `"PieChart"`, `"TrendingUp"`, `"Activity"`, `"Zap"`, `"Shield"`, `"Lock"`, `"Key"`, `"Bell"`, `"Phone"`, `"Camera"`, `"Mic"`, `"Monitor"`, `"Cpu"`, `"HardDrive"`, `"Wifi"`, `"Home"`, `"Building"`, `"Store"`, `"Briefcase"`, `"DollarSign"`, `"CreditCard"`, `"ShoppingCart"`, `"Truck"`, `"Percent"`, `"Hash"`, `"AtSign"`, `"Info"`, `"HelpCircle"`, `"AlertCircle"`, `"CheckCircle"`, `"Car"`, `"ClipboardList"`, `"ClipboardCheck"`, `"Checklist"`, `"Warehouse"`, `"Receipt"`, `"Wallet"`, `"User"`, `"Gift"`, `"Rocket"`, `"LifeBuoy"`\]

Icon names the dashboard resolves for `DashboardSeedConfig.icon` and a role `icon`.
Single source of truth: the dashboard types its `ICON_MAP` as `Record<DashboardIconName, …>`, so a name
added or removed here without the matching component fails type-check, and the validation warning and the
bundled agent docs read this same list. A name outside it renders the default `Folder` icon.
