import {
  ArrowLeftRight,
  Banknote,
  Bell,
  BookBookmark,
  BookOpen,
  Boxes,
  Cake,
  Calculator,
  CalendarDays,
  ChartColumn,
  ChartLine,
  ChartPie,
  ClipboardList,
  Factory,
  FileText,
  HandCoins,
  History,
  Layers,
  LayoutDashboard,
  Library,
  ListTree,
  Package,
  PackageCheck,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Wheat,
} from 'lucide-react'

export const navigation = [
  {
    id: 'main',
    label: 'Today',
    items: [
      { id: 'dashboard', label: 'Today', path: '/', icon: LayoutDashboard },
      { id: 'notifications', label: 'Alerts', path: '/notifications', icon: Bell },
    ],
  },
  {
    id: 'sales',
    label: 'Counter',
    items: [
      { id: 'pos', label: 'Sell now', path: '/sales/pos', icon: ShoppingCart },
      { id: 'orders', label: 'Orders', path: '/sales/orders', icon: ClipboardList },
      { id: 'sales-history', label: 'Past sales', path: '/sales/history', icon: History },
      { id: 'sales-reports', label: 'Sales today', path: '/sales/reports', icon: ChartColumn },
    ],
  },
  {
    id: 'inventory',
    label: 'Menu and stock',
    items: [
      { id: 'raw-materials', label: 'Ingredients', path: '/inventory/raw-materials', icon: Wheat },
      { id: 'finished-goods', label: 'Menu', path: '/inventory/finished-goods', icon: Cake },
      {
        id: 'packaging-materials',
        label: 'Packaging',
        path: '/inventory/packaging',
        icon: Package,
      },
      {
        id: 'stock-movements',
        label: 'Stock history',
        path: '/inventory/movements',
        icon: ArrowLeftRight,
      },
      {
        id: 'inventory-reports',
        label: 'Inventory Reports',
        path: '/inventory/reports',
        icon: Boxes,
      },
    ],
  },
  {
    id: 'purchasing',
    label: 'Buying',
    items: [
      { id: 'suppliers', label: 'Suppliers', path: '/purchasing/suppliers', icon: Truck },
      {
        id: 'purchase-orders',
        label: 'Purchase Orders',
        path: '/purchasing/orders',
        icon: FileText,
        hidden: true,
      },
      {
        id: 'purchase-invoices',
        label: 'Supplier bills',
        path: '/purchasing/invoices',
        icon: Receipt,
      },
      {
        id: 'receiving-records',
        label: 'Goods received',
        path: '/purchasing/receiving',
        icon: PackageCheck,
      },
    ],
  },
  {
    id: 'production',
    label: 'Kitchen',
    items: [
      {
        id: 'recipes',
        label: 'Recipes',
        path: '/production/recipes',
        icon: BookOpen,
      },
      {
        id: 'production-planning',
        label: 'Plan a bake',
        path: '/production/planning',
        icon: CalendarDays,
      },
      {
        id: 'production-batches',
        label: 'Bake a batch',
        path: '/production/batches',
        icon: Layers,
      },
      {
        id: 'production-costing',
        label: 'Batch costs',
        path: '/production/costing',
        icon: Calculator,
      },
    ],
  },
  {
    id: 'accounting',
    label: 'Money',
    items: [
      {
        id: 'accounts-payable',
        label: 'Bills to pay',
        path: '/accounting/accounts-payable',
        icon: Wallet,
      },
      {
        id: 'accounts-receivable',
        label: 'Customer tabs',
        path: '/accounting/accounts-receivable',
        icon: HandCoins,
      },
      { id: 'expenses', label: 'Expenses', path: '/accounting/expenses', icon: Banknote },
      {
        id: 'financial-statements',
        label: 'Statements',
        path: '/accounting/financial-statements',
        icon: ChartPie,
      },
    ],
  },
  {
    id: 'reports',
    label: 'Books',
    items: [
      {
        id: 'chart-of-accounts',
        label: 'Account list',
        path: '/accounting/chart-of-accounts',
        icon: ListTree,
      },
      {
        id: 'journal-entries',
        label: 'Journal',
        path: '/accounting/journal-entries',
        icon: BookBookmark,
      },
      {
        id: 'general-ledger',
        label: 'Ledger',
        path: '/accounting/general-ledger',
        icon: Library,
      },
      { id: 'report-sales', label: 'Sales Reports', path: '/reports/sales', icon: TrendingUp, hidden: true },
      {
        id: 'report-inventory',
        label: 'Inventory Reports',
        path: '/reports/inventory',
        icon: Warehouse,
        hidden: true,
      },
      {
        id: 'report-production',
        label: 'Kitchen report',
        path: '/reports/production',
        icon: Factory,
      },
      {
        id: 'report-financial',
        label: 'Money report',
        path: '/reports/financial',
        icon: ChartLine,
      },
    ],
  },
  {
    id: 'administration',
    label: 'Shop',
    items: [
      {
        id: 'employees',
        label: 'Staff',
        path: '/admin/employees',
        icon: Users,
      },
      {
        id: 'business-settings',
        label: 'Settings',
        path: '/admin/settings',
        icon: Settings,
      },
      { id: 'audit-logs', label: 'Activity', path: '/admin/audit-logs', icon: ScrollText },
    ],
  },
]

export function flattenNavigation(groups = navigation) {
  return groups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupId: group.id,
      groupLabel: group.label,
    })),
  )
}

export function findNavigationItem(pathname) {
  for (const group of navigation) {
    const item = group.items.find((entry) => entry.path === pathname)
    if (item) return { group, item }
  }
  return null
}
